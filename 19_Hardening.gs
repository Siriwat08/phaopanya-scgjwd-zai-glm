/**
 * VERSION: 5.4.001
 * FILE: 19_Hardening.gs
 * LMDS V5.4 — System Hardening & Preflight Audit
 * ===================================================
 * PURPOSE:
 *   ตรวจสอบความสมบูรณ์ของข้อมูลก่อนประมวลผล (Preflight Audit)
 *   และตรวจจับปัญหาซ้ำซ้อน
 * ===================================================
 * CHANGELOG:
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [ADD] Comprehensive header documentation
 *   v5.4.000 (2026-05-24):
 *     - [UPGRADE] Version bump to 5.4.000
 *     - [ADD] Comprehensive header documentation
 *     - [ADD] DEPENDENCIES section with module relationships
 *     - [ENHANCE] Detailed module interconnection mapping
 *   v5.2.010:
 *     - [ADD] generatePersonAliasesFromHistory: สร้าง Alias อัตโนมัติจาก FACT_DELIVERY
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config (SHEET.*, SRC_IDX.*, FACT_IDX.*, PERSON_ALIAS_IDX.*, SCHEMA)
 *     - 02_Schema (SCHEMA)
 *     - 06_PersonService (loadAllPersons_, loadAllAliases_)
 *     - 07_PlaceService (loadAllPlaces_)
 *     - 08_GeoService (loadAllGeos_)
 *     - 09_DestinationService (loadAllDestinations_)
 *     - 11_TransactionService (loadAllFacts_)
 *     - 05_NormalizeService (normalizeForCompare)
 *     - 14_Utils (generateShortId, normalizeInvoiceNo)
 *   CALLS (Invokes):
 *     - loadAllPersons_() → 06_PersonService
 *     - loadAllAliases_() → 06_PersonService
 *     - normalizeForCompare() → 05_NormalizeService
 *     - generateShortId() → 14_Utils
 *     - normalizeInvoiceNo() → 14_Utils
 *     - invalidateAliasCache_() → 06_PersonService
 *     - logInfo() → 03_SetupSheets
 *   EXPORTS TO:
 *     - 00_App (runPreflightAudit, detectDoubleProcessing, generatePersonAliasesFromHistory — menu trigger)
 *   SHEETS ACCESSED:
 *     - SHEET.SOURCE (Read: sync status integrity check)
 *     - SHEET.FACT_DELIVERY (Read: double processing detection)
 *     - SHEET.M_PERSON_ALIAS (Write: alias generation output)
 *     - All SHEET.* constants (Read: iterated via runPreflightAudit)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────┐
 *   │                19_Hardening.gs                      │
 *   │           System Hardening & Audit                  │
 *   ├─────────────────────────────────────────────────────┤
 *   │                                                     │
 *   │  runPreflightAudit ─── Schema integrity check       │
 *   │       │                  + API key validation       │
 *   │       │                                             │
 *   │  fixMissingSyncStatus ── Batch sync status repair   │
 *   │                                                     │
 *   │  detectDoubleProcessing ─ Duplicate detection       │
 *   │       │                  in FACT_DELIVERY           │
 *   │       │                                             │
 *   │  generatePersonAliasesFromHistory                   │
 *   │       └── Auto-alias generation from                │
 *   │           delivery history (FACT_DELIVERY)          │
 *   │                                                     │
 *   └─────────────────────────────────────────────────────┘
 * ===================================================
 */

/**
 * runPreflightAudit — [MAIN] ตรวจสอบความพร้อมของระบบก่อนรัน Pipeline
 */
function runPreflightAudit() {
  const ui = SpreadsheetApp.getUi();
  const logs = [];
  let errorCount = 0;

  logInfo('Hardening', 'เริ่มรัน Preflight Audit');

  // 1. Check Sheets & Schema
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEET).forEach(key => {
    const sheetName = SHEET[key];
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      logs.push(`❌ ไม่พบชีต: ${sheetName}`);
      errorCount++;
    } else {
      // Check column count vs Schema
      const expectedCols = SCHEMA[sheetName] ? SCHEMA[sheetName].length : 0;
      if (expectedCols > 0 && sheet.getLastColumn() < expectedCols) {
        logs.push(`⚠️ ชีต ${sheetName} มีคอลัมน์น้อยกว่า Schema (${sheet.getLastColumn()}/${expectedCols})`);
      }
    }
  });

  // 2. Check Script Properties
  const props = PropertiesService.getScriptProperties().getProperties();
  if (!props.GEMINI_API_KEY) {
    logs.push('⚠️ ยังไม่ได้ตั้งค่า GEMINI_API_KEY');
  }

  // 3. Check Sync Status Integrity
  const srcSheet = ss.getSheetByName(SHEET.SOURCE);
  if (srcSheet) {
    const lastRow = srcSheet.getLastRow();
    if (lastRow > 1) {
      const statusCol = SRC_IDX.SYNC_STATUS + 1;
      const statusData = srcSheet.getRange(2, statusCol, lastRow - 1, 1).getValues();
      const emptyCount = statusData.filter(r => !r[0]).length;
      if (emptyCount > 0) {
        logs.push(`ℹ️ พบแถวที่ไม่มีสถานะ Sync ใน Source: ${emptyCount} แถว (ระบบจะถือว่าเป็น Pending)`);
      }
    }
  }

  // Show Results
  if (logs.length === 0) {
    ui.alert('✅ Preflight Audit: ระบบพร้อมทำงาน 100%');
  } else {
    const report = logs.join('\n');
    ui.alert(`📊 ผลการตรวจสอบ Preflight Audit:\n\n${report}\n\nพบจุดที่ควรตรวจสอบ ${logs.length} รายการ`);
  }
}

/**
 * fixMissingSyncStatus — เติมค่า PENDING ให้แถวที่ว่างใน Source
 */
function fixMissingSyncStatus() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.SOURCE);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const statusCol = SRC_IDX.SYNC_STATUS + 1;
  const range = sheet.getRange(2, statusCol, lastRow - 1, 1);
  const data = range.getValues();
  let fixed = 0;

  for (let i = 0; i < data.length; i++) {
    if (!data[i][0]) {
      data[i][0] = 'PENDING';
      fixed++;
    }
  }

  if (fixed > 0) {
    range.setValues(data);
    SpreadsheetApp.getActiveSpreadsheet().toast(`✅ ซ่อมแซมสถานะ Sync สำเร็จ: ${fixed} แถว`, 'Hardening');
  }
}

/**
 * detectDoubleProcessing — ตรวจสอบข้อมูลซ้ำใน FACT_DELIVERY
 */
function detectDoubleProcessing() {
  try {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.FACT_DELIVERY);
  if (!sheet || sheet.getLastRow() < 2) return;

  const invoiceData = sheet.getRange(2, FACT_IDX.INVOICE_NO + 1, sheet.getLastRow() - 1, 1).getValues();
  const counts = {};
  const duplicates = [];

  invoiceData.forEach(r => {
    const inv = normalizeInvoiceNo(r[0]);
    if (!inv) return;
    counts[inv] = (counts[inv] || 0) + 1;
  });

  Object.keys(counts).forEach(inv => {
    if (counts[inv] > 1) duplicates.push(`${inv} (${counts[inv]} ครั้ง)`);
  });

  if (duplicates.length === 0) {
    SpreadsheetApp.getUi().alert('✅ ไม่พบข้อมูลซ้ำใน FACT_DELIVERY');
  } else {
    SpreadsheetApp.getUi().alert(`⚠️ พบ Invoice ซ้ำ ${duplicates.length} รายการ:\n\n${duplicates.slice(0, 10).join('\n')}${duplicates.length > 10 ? '\n...และอื่นๆ' : ''}`);
  }
  } catch (err) {
    logError('Hardening', err.message + '\n' + err.stack);
    SpreadsheetApp.getUi().alert('เกิดข้อผิดพลาด: ' + err.message);
  }
}

/**
 * generatePersonAliasesFromHistory — [UPGRADE v5.2.010] สร้าง Alias อัตโนมัติจากประวัติ FACT_DELIVERY
 * [FIX v5.4.000] เพิ่มการเขียน Global Alias ลง M_ALIAS ควบคู่กับ M_PERSON_ALIAS
 */
function generatePersonAliasesFromHistory() {
  try {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const factSheet = ss.getSheetByName(SHEET.FACT_DELIVERY);
  const aliasSheet = ss.getSheetByName(SHEET.M_PERSON_ALIAS);
  if (!factSheet || !aliasSheet) {
    SpreadsheetApp.getUi().alert('❌ ไม่พบชีต FACT_DELIVERY หรือ M_PERSON_ALIAS');
    return;
  }

  const factRows = factSheet.getLastRow();
  if (factRows < 2) {
    SpreadsheetApp.getUi().alert('ℹ️ ไม่มีข้อมูลประวัติใน FACT_DELIVERY');
    return;
  }

  ss.toast('กำลังวิเคราะห์ประวัติการจัดส่งเพื่อสร้าง Alias...', 'Processing', 5);

  const factData = factSheet.getRange(2, 1, factRows - 1, SCHEMA[SHEET.FACT_DELIVERY].length).getValues();
  
  // โหลดรายชื่อ Person หลักเพื่อตรวจสอบ
  const allPersons = loadAllPersons_();
  const personMap = new Map();
  // [FIX v5.4.000] เก็บ masterUuid ไว้ด้วยเพื่อเขียน M_ALIAS
  const personUuidMap = new Map();
  allPersons.forEach(p => {
    if (p.personId && p.canonical) {
      personMap.set(p.personId, normalizeForCompare(p.canonical));
    }
    if (p.personId && p.masterUuid) {
      personUuidMap.set(p.personId, p.masterUuid);
    }
  });

  // โหลด Alias ที่มีอยู่แล้ว
  const existingAliasSet = new Set();
  const existingAliasData = loadAllAliases_();
  existingAliasData.forEach(r => {
    if (!r[PERSON_ALIAS_IDX.ACTIVE_FLAG]) return;
    const pId = String(r[PERSON_ALIAS_IDX.PERSON_ID] || '').trim();
    const aNorm = normalizeForCompare(r[PERSON_ALIAS_IDX.ALIAS_NAME]);
    if (pId && aNorm) {
      existingAliasSet.add(pId + '::' + aNorm);
    }
  });

  const newAliasRows = [];
  const globalAliasCalls = []; // [FIX v5.4.000] เก็บข้อมูลสำหรับเขียน M_ALIAS
  let addedCount = 0;

  factData.forEach(r => {
    const pId = String(r[FACT_IDX.PERSON_ID] || '').trim();
    const rawName = String(r[FACT_IDX.SHIP_TO_NAME] || '').trim();
    if (!pId || !rawName) return;

    const rawNorm = normalizeForCompare(rawName);
    if (!rawNorm || rawNorm.length < 2) return;

    // เช็คว่าชื่อดิบตรงกับ Canonical อยู่แล้วหรือไม่
    const canonicalNorm = personMap.get(pId);
    if (canonicalNorm && canonicalNorm === rawNorm) return;

    const key = pId + '::' + rawNorm;
    if (!existingAliasSet.has(key)) {
      existingAliasSet.add(key);
      newAliasRows.push([
        generateShortId('PA'),
        pId,
        rawName,
        95,
        new Date(),
        true
      ]);
      addedCount++;

      // [FIX v5.4.000] เก็บข้อมูลสำหรับเขียน M_ALIAS
      const masterUuid = personUuidMap.get(pId);
      if (masterUuid) {
        globalAliasCalls.push({
          masterUuid: masterUuid,
          variantName: rawName,
          entityType: 'PERSON',
          confidence: 95,
          source: 'HISTORY_ENRICH'
        });
      }
    }
  });

  if (newAliasRows.length > 0) {
    // บันทึกแบบ Batch
    aliasSheet.getRange(aliasSheet.getLastRow() + 1, 1, newAliasRows.length, 6).setValues(newAliasRows);
    invalidateAliasCache_();

    // [FIX v5.4.000] เขียน Global Alias ลง M_ALIAS
    let globalAliasCount = 0;
    if (typeof createGlobalAlias === 'function') {
      globalAliasCalls.forEach(call => {
        const result = createGlobalAlias(
          call.masterUuid, call.variantName, call.entityType,
          call.confidence, call.source
        );
        if (result) globalAliasCount++;
      });
    }

    SpreadsheetApp.getUi().alert(
      `✅ สร้าง Alias อัตโนมัติสำเร็จ!\n` +
      `- เพิ่มรายชื่อสำรอง: ${addedCount} รายการลงใน M_PERSON_ALIAS\n` +
      `- เพิ่ม Global Alias: ${globalAliasCount} รายการลงใน M_ALIAS`
    );
  } else {
    SpreadsheetApp.getUi().alert('ℹ️ ตรวจสอบเรียบร้อย: ข้อมูล Alias ในระบบอัปเดตครับถ้วนแล้ว ไม่มีรายการใหม่');
  }
  } catch (err) {
    logError('Hardening', err.message + '\n' + err.stack);
    SpreadsheetApp.getUi().alert('เกิดข้อผิดพลาด: ' + err.message);
  }
}
