/**
 * VERSION: 5.4.001
 * FILE: 19_Hardening.gs
 * LMDS V5.4 — System Hardening & Preflight Audit
 * [FIX BUG-A2] v5.4.003: runPreflightAudit() เพิ่ม try-catch
 * [ADD v5.4.003] buildGlobalAliasDedupSet_() — helper ที่ generatePersonAliasesFromHistory ต้องใช้
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

// ============================================================
// SECTION 1: runPreflightAudit
// [FIX BUG-A2] เพิ่ม try-catch outer
// ============================================================

function runPreflightAudit() {
  // [FIX BUG-A2] try-catch ครอบ
  try {
    const ui   = SpreadsheetApp.getUi();
    const logs = [];

    logInfo('Hardening', 'เริ่มรัน Preflight Audit');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    Object.keys(SHEET).forEach(key => {
      const sheetName = SHEET[key];
      const sheet     = ss.getSheetByName(sheetName);
      if (!sheet) {
        logs.push('❌ ไม่พบชีต: ' + sheetName);
      } else {
        const expectedCols = SCHEMA[sheetName] ? SCHEMA[sheetName].length : 0;
        if (expectedCols > 0 && sheet.getLastColumn() < expectedCols) {
          logs.push('⚠️ ชีต ' + sheetName + ' มีคอลัมน์น้อยกว่า Schema (' +
                    sheet.getLastColumn() + '/' + expectedCols + ')');
        }
      }
    });

    const props = PropertiesService.getScriptProperties().getProperties();
    if (!props.GEMINI_API_KEY) {
      logs.push('⚠️ ยังไม่ได้ตั้งค่า GEMINI_API_KEY');
    }

    const srcSheet = ss.getSheetByName(SHEET.SOURCE);
    if (srcSheet) {
      const lastRow = srcSheet.getLastRow();
      if (lastRow > 1) {
        const statusCol  = SRC_IDX.SYNC_STATUS + 1;
        const statusData = srcSheet.getRange(2, statusCol, lastRow - 1, 1).getValues();
        const emptyCount = statusData.filter(r => !r[0]).length;
        if (emptyCount > 0) {
          logs.push('ℹ️ พบแถวที่ไม่มีสถานะ Sync ใน Source: ' + emptyCount + ' แถว');
        }
      }
    }

    if (logs.length === 0) {
      ui.alert('✅ Preflight Audit: ระบบพร้อมทำงาน 100%');
    } else {
      ui.alert('📊 ผลการตรวจสอบ Preflight Audit:\n\n' +
               logs.join('\n') +
               '\n\nพบจุดที่ควรตรวจสอบ ' + logs.length + ' รายการ');
    }

  } catch (err) {
    logError('Hardening', 'runPreflightAudit: ' + err.message, err);
    safeUiAlert_('❌ Preflight Audit ล้มเหลว: ' + err.message);
  }
}

// ============================================================
// SECTION 2: fixMissingSyncStatus (ไม่เปลี่ยน)
// ============================================================

function fixMissingSyncStatus() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.SOURCE);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const statusCol = SRC_IDX.SYNC_STATUS + 1;
  const range     = sheet.getRange(2, statusCol, lastRow - 1, 1);
  const data      = range.getValues();
  let   fixed     = 0;

  for (let i = 0; i < data.length; i++) {
    if (!data[i][0]) { data[i][0] = 'PENDING'; fixed++; }
  }
  if (fixed > 0) {
    range.setValues(data);
    SpreadsheetApp.getActiveSpreadsheet()
      .toast('✅ ซ่อมแซมสถานะ Sync สำเร็จ: ' + fixed + ' แถว', 'Hardening');
  }
}

// ============================================================
// SECTION 3: detectDoubleProcessing (ไม่เปลี่ยน)
// ============================================================

function detectDoubleProcessing() {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET.FACT_DELIVERY);
    if (!sheet || sheet.getLastRow() < 2) return;

    const invoiceData = sheet.getRange(
      2, FACT_IDX.INVOICE_NO + 1, sheet.getLastRow() - 1, 1
    ).getValues();
    const counts     = {};
    const duplicates = [];

    invoiceData.forEach(r => {
      const inv = normalizeInvoiceNo(r[0]);
      if (!inv) return;
      counts[inv] = (counts[inv] || 0) + 1;
    });
    Object.keys(counts).forEach(inv => {
      if (counts[inv] > 1) duplicates.push(inv + ' (' + counts[inv] + ' ครั้ง)');
    });

    if (duplicates.length === 0) {
      SpreadsheetApp.getUi().alert('✅ ไม่พบข้อมูลซ้ำใน FACT_DELIVERY');
    } else {
      SpreadsheetApp.getUi().alert(
        '⚠️ พบ Invoice ซ้ำ ' + duplicates.length + ' รายการ:\n\n' +
        duplicates.slice(0, 10).join('\n') +
        (duplicates.length > 10 ? '\n...และอื่นๆ' : '')
      );
    }
  } catch (err) {
    logError('Hardening', err.message + '\n' + err.stack);
    SpreadsheetApp.getUi().alert('เกิดข้อผิดพลาด: ' + err.message);
  }
}

// ============================================================
// SECTION 4: buildGlobalAliasDedupSet_ [NEW v5.4.003]
// Helper สำหรับ generatePersonAliasesFromHistory
// โหลด M_ALIAS ครั้งเดียว → คืน Set สำหรับ dedup check
// ============================================================

/**
 * buildGlobalAliasDedupSet_ — โหลด M_ALIAS เป็น dedup Set
 * Format key: "ENTITY_TYPE::masterUuid::normalizedVariant"
 * @return {Set<string>}
 */
function buildGlobalAliasDedupSet_() {
  const dedupSet = new Set();
  try {
    const ss         = SpreadsheetApp.getActiveSpreadsheet();
    const mAliasSheet = ss.getSheetByName(SHEET.M_ALIAS);
    if (!mAliasSheet || mAliasSheet.getLastRow() < 2) return dedupSet;

    const data = mAliasSheet.getRange(
      2, 1, mAliasSheet.getLastRow() - 1, SCHEMA[SHEET.M_ALIAS].length
    ).getValues();

    data.forEach(function(row) {
      if (row[ALIAS_IDX.ACTIVE_FLAG] !== true) return;
      const eType = String(row[ALIAS_IDX.ENTITY_TYPE] || '');
      const mUuid = String(row[ALIAS_IDX.MASTER_UUID]  || '');
      const norm  = normalizeForCompare(row[ALIAS_IDX.VARIANT_NAME]);
      if (eType && mUuid && norm) {
        dedupSet.add(eType + '::' + mUuid + '::' + norm);
      }
    });
  } catch (err) {
    logWarn('Hardening', 'buildGlobalAliasDedupSet_: ' + err.message);
  }
  return dedupSet;
}

// ============================================================
// SECTION 5: generatePersonAliasesFromHistory (ไม่เปลี่ยน logic)
// ใช้ buildGlobalAliasDedupSet_() ที่นิยามแล้วใน Section 4
// ============================================================

function generatePersonAliasesFromHistory() {
  try {
    var ss         = SpreadsheetApp.getActiveSpreadsheet();
    var factSheet  = ss.getSheetByName(SHEET.FACT_DELIVERY);
    var aliasSheet = ss.getSheetByName(SHEET.M_PERSON_ALIAS);
    if (!factSheet || !aliasSheet) {
      SpreadsheetApp.getUi().alert('❌ ไม่พบชีต FACT_DELIVERY หรือ M_PERSON_ALIAS');
      return;
    }

    var factRows = factSheet.getLastRow();
    if (factRows < 2) {
      SpreadsheetApp.getUi().alert('ℹ️ ไม่มีข้อมูลประวัติใน FACT_DELIVERY');
      return;
    }

    ss.toast('กำลังวิเคราะห์ประวัติการจัดส่งเพื่อสร้าง Alias...', 'Processing', 5);

    var factData = factSheet.getRange(
      2, 1, factRows - 1, SCHEMA[SHEET.FACT_DELIVERY].length
    ).getValues();

    // โหลด Person Map
    var allPersons        = loadAllPersons_();
    var personCanonicalMap = new Map();
    var personUuidMap      = new Map();
    allPersons.forEach(function(p) {
      if (p.personId && p.canonical)   personCanonicalMap.set(p.personId, normalizeForCompare(p.canonical));
      if (p.personId && p.masterUuid)  personUuidMap.set(p.personId, p.masterUuid);
    });

    // โหลด M_PERSON_ALIAS dedup set
    var existingAliasSet  = new Set();
    var existingAliasData = loadAllAliases_();
    existingAliasData.forEach(function(r) {
      if (!r[PERSON_ALIAS_IDX.ACTIVE_FLAG]) return;
      var pId   = String(r[PERSON_ALIAS_IDX.PERSON_ID]  || '').trim();
      var aNorm = normalizeForCompare(r[PERSON_ALIAS_IDX.ALIAS_NAME]);
      if (pId && aNorm) existingAliasSet.add(pId + '::' + aNorm);
    });

    // [FIX BUG-B1] buildGlobalAliasDedupSet_ โหลด M_ALIAS ครั้งเดียว
    var existingGlobalAliasSet = buildGlobalAliasDedupSet_();

    var newAliasRows  = [];   // M_PERSON_ALIAS
    var newGlobalRows = [];   // M_ALIAS
    var now           = new Date();

    factData.forEach(function(r) {
      var pId     = String(r[FACT_IDX.PERSON_ID]   || '').trim();
      var rawName = String(r[FACT_IDX.SHIP_TO_NAME] || '').trim();
      if (!pId || !rawName) return;

      var rawNorm      = normalizeForCompare(rawName);
      if (!rawNorm || rawNorm.length < 2) return;

      var canonicalNorm = personCanonicalMap.get(pId);
      if (canonicalNorm && canonicalNorm === rawNorm) return;

      // M_PERSON_ALIAS
      var paKey = pId + '::' + rawNorm;
      if (!existingAliasSet.has(paKey)) {
        existingAliasSet.add(paKey);
        newAliasRows.push([generateShortId('PA'), pId, rawName, 95, now, true]);
      }

      // M_ALIAS (Batch — ไม่เรียก createGlobalAlias ใน loop)
      var masterUuid = personUuidMap.get(pId);
      if (masterUuid) {
        var globalKey = 'PERSON::' + masterUuid + '::' + rawNorm;
        if (!existingGlobalAliasSet.has(globalKey)) {
          existingGlobalAliasSet.add(globalKey);
          newGlobalRows.push([
            generateShortId('A'), masterUuid, rawName, 'PERSON',
            95, 'HISTORY_ENRICH', now, true
          ]);
        }
      }
    });

    // Batch write M_PERSON_ALIAS
    if (newAliasRows.length > 0) {
      aliasSheet.getRange(
        aliasSheet.getLastRow() + 1, 1, newAliasRows.length,
        SCHEMA[SHEET.M_PERSON_ALIAS].length
      ).setValues(newAliasRows);
      invalidateAliasCache_();
    }

    // Batch write M_ALIAS
    var globalAliasCount = 0;
    if (newGlobalRows.length > 0) {
      var mAliasSheet = ss.getSheetByName(SHEET.M_ALIAS);
      if (mAliasSheet) {
        mAliasSheet.getRange(
          mAliasSheet.getLastRow() + 1, 1, newGlobalRows.length,
          SCHEMA[SHEET.M_ALIAS].length
        ).setValues(newGlobalRows);
        CacheService.getScriptCache().removeAll(['M_GLOBAL_ALIAS_ALL', 'M_GLOBAL_ALIAS_REVERSE']);
        globalAliasCount = newGlobalRows.length;
      }
    }

    SpreadsheetApp.getUi().alert(
      (newAliasRows.length > 0 || globalAliasCount > 0)
        ? '✅ สร้าง Alias สำเร็จ!\n' +
          '- M_PERSON_ALIAS: ' + newAliasRows.length + ' รายการ\n' +
          '- M_ALIAS: ' + globalAliasCount + ' รายการ'
        : 'ℹ️ ตรวจสอบเรียบร้อย: ข้อมูล Alias อัปเดตถ้วนแล้ว'
    );

  } catch (err) {
    logError('Hardening', err.message + '\n' + err.stack);
    SpreadsheetApp.getUi().alert('เกิดข้อผิดพลาด: ' + err.message);
  }
}
