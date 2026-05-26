/**
 * VERSION: 5.4.001
 * FILE: 00_App.gs
 * LMDS V5.4 — Application Entry Point & Menu Controller
 * ===================================================
 * PURPOSE:
 *   จุดเริ่มต้นหลักของระบบ LMDS ควบคุม Custom Menu และ Pipeline Triggers
 *   ทำหน้าที่เป็น Gateway สำหรับการเรียกใช้งานระบบทั้งหมด
 * ===================================================
 * CHANGELOG:
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [ADD] SHEET.M_ALIAS + SHEET.M_PLACE_ALIAS to requiredSheets in checkSystemIntegrity()
 *     - [ADD] Migration menu items for Hybrid Alias System
 *     - [ADD] 21_AliasService.gs to version info
 *     - [ADD] populateAliasFromSCGRawData_ menu item
 *     - [ADD] assignMasterUuidIfMissing menu item
 *   v5.4.000 (2026-05-23):
 *     - [UPGRADE] Version bump to 5.4.000
 *     - [ADD] Comprehensive header documentation
 *   v5.2.014 (PH2):
 *     - [FIX] setupInputSheet_: อัปเกรดระบบเพื่อปรับปรุงการทำงานหน้าชีต Input เป็นฟอร์มแนวตั้ง
 *   v5.2.013:
 *     - [FIX] executeDecision: ส่ง placeId แทน decision.placeId (undefined) ไปยัง createGeoPoint
 *   v5.2.012:
 *     - [REVERT] กู้คืนระบบดึงข้อมูลจาก SCG API ให้เป็นแบบ Batch ดั้งเดิม
 *   v5.2.011:
 *     - [ADD] onSelectionChange: เพิ่มระบบคลิกเพื่อนำทางอัตโนมัติ (Smart Navigation)
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config.gs     (Configuration & Constants)
 *     - 02_Schema.gs     (Schema Definitions)
 *   CALLS (Invokes):
 *     - runMatchEngine()                       → 10_MatchEngine.gs
 *     - runLookupEnrichment()                 → 17_SearchService.gs
 *     - buildFullQualityReport()              → 13_ReportService.gs
 *     - fetchDataFromSCGJWD()                 → 18_ServiceSCG.gs
 *     - buildGeoDictionary()                  → 16_GeoDictionaryBuilder.gs
 *     - applyMasterCoordinatesToDailyJob()    → 18_ServiceSCG.gs
 *     - MIGRATION_HybridAliasSystem()         → 21_AliasService.gs
 *     - populateAliasFromSCGRawData_()        → 21_AliasService.gs
 *     - assignMasterUuidIfMissing()           → 21_AliasService.gs
 *   EXPORTS TO:
 *     - All modules (onOpen trigger, menu system)
 *   SHEETS ACCESSED:
 *     - SHEET.SOURCE        (Read: Pipeline input)
 *     - SHEET.DAILY_JOB     (Read+Write: SCG Daily Operations)
 *     - SHEET.Q_REVIEW      (Read+Write: Review Queue, onEdit trigger)
 *   TRIGGERS:
 *     - onOpen()     → เรียก createMenu_() ทุกครั้งที่เปิด Spreadsheet
 *     - onEdit()     → ดักจับการแก้ไขใน Q_REVIEW
 *     - installSmartNavTrigger() → ติดตั้ง Smart Navigation (Installable)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  00_App.gs (Entry Point / Gateway)                         │
 *   │  ├── onOpen() → createMenu_()                               │
 *   │  └── Custom Menu → Pipeline Actions                         │
 *   │      ├── "Run Full Pipeline" → runFullPipeline()           │
 *   │      ├── "🟩 กลุ่ม 1" → runMatchEngine()                  │
 *   │      ├── "🟦 กลุ่ม 2" → fetchDataFromSCGJWD()             │
 *   │      ├── "🔧 ระบบ" → setupAllSheets / buildGeoDictionary  │
 *   │      │   ├── "Migration: Hybrid Alias" → MIGRATION_HybridAliasSystem()│
 *   │      │   ├── "ตรวจสอบ Master UUID" → assignMasterUuidIfMissing()  │
 *   │      │   └── "ดึงชื่อจาก SCG ดิบ" → populateAliasFromSCGRawData_() │
 *   │      └── "Audit" → runPreflightAudit()                      │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

// constants are defined in 01_Config.gs

// ============================================================
// SECTION 1: onOpen Trigger
// ============================================================

function onOpen() {
  // [ADD v003] ตรวจ Config ทันทีที่เปิด Spreadsheet
  try {
    validateConfig();
  } catch (cfgErr) {
    SpreadsheetApp.getUi().alert(
      '⚠️ Config Warning:\n' + cfgErr.message +
      '\n\nระบบยังใช้งานได้ แต่กรุณาตรวจสอบก่อนรัน Pipeline'
    );
  }

  // [FIX v5.2.016] พยายามติดตั้ง Smart Navigation อัตโนมัติ
  try { autoInstallSmartNav_(); } catch (_) {}

  const ui = SpreadsheetApp.getUi();

  ui.createMenu(`🚚 ${APP_NAME}`)
    .addItem('🚀 Run Full Pipeline',  'runFullPipeline')
    .addItem('📍 จับคู่พิกัดวันนี้', 'applyMasterCoordinatesToDailyJob')
    .addSeparator()

    .addSubMenu(
      ui.createMenu('🟩 กลุ่ม 1: ล้างข้อมูล & Master')
        .addItem('▶️ รัน Full Pipeline (ทั้งหมด)', 'runFullPipeline')
        .addSeparator()
        .addItem('Step 1 — โหลดข้อมูลดิบจากแหล่ง', 'runLoadSource')
        .addItem('Step 2 — Normalize ชื่อ/ที่อยู่',  'runNormalize')
        .addItem('Step 3 — Match Engine',              'runMatchEngine')
        .addSeparator()
        .addItem('📋 เปิด Review Queue',       'openReviewQueue')
        .addItem('▶️ รันคำสั่งที่เลือกไว้ทั้งหมด', 'applyAllPendingDecisions')
        .addItem('📊 รายงาน Data Quality',     'buildFullQualityReport')
    )

    .addSubMenu(
      ui.createMenu('🟦 กลุ่ม 2: งานประจำวัน (SCG)')
        .addItem('📥 ดึงข้อมูล SCG API',   'fetchDataFromSCGJWD')
        .addItem('📍 จับคู่พิกัด',          'applyMasterCoordinatesToDailyJob')
        .addSeparator()
        .addItem('🗑️ ล้างข้อมูลทั้งหมด',  'clearAllSCGSheets_UI')
    )

    .addSeparator()

    .addSubMenu(
      ui.createMenu('🔧 ระบบ & ตั้งค่า')
        .addItem('⚙️ ตั้งค่า API Key',           'setupEnvironment')
        .addItem('🏗️ สร้างชีตทั้งหมด',          'setupAllSheets')
        .addItem('🌍 อัปเดตฐานข้อมูลภูมิศาสตร์ (SYS_TH_GEO)', 'buildGeoDictionary')
        .addItem('🛠️ เติมข้อมูลภูมิศาสตร์ (16 คอลัมน์)', 'populateGeoMetadata')
        .addItem('🔗 สร้าง Alias อัตโนมัติจากประวัติ (FACT)', 'generatePersonAliasesFromHistory')
        .addItem('🔄 Migration: Hybrid Alias System', 'MIGRATION_HybridAliasSystem')
        .addItem('🔗 ตรวจสอบ Master UUID', 'assignMasterUuidIfMissing')
        .addItem('📥 ดึงชื่อจาก SCG ดิบ → M_ALIAS', 'populateAliasFromSCGRawData_')
        .addSeparator()
        .addItem('🛡️ [PH2] Preflight Audit',      'runPreflightAudit')
        .addItem('🧹 [PH2] Detect Duplicates',     'detectDoubleProcessing')
        .addItem('✅ ตรวจสอบ System Integrity',   'checkSystemIntegrity')
        .addItem('🔍 วินิจฉัย Pipeline (Diagnostic)', 'diagnoseSystemState')
        .addSeparator()
        .addItem('🔄 รีเซ็ตสถานะ SYNC (เพื่อรันใหม่)', 'resetSourceSyncStatus')
        .addItem('🧹 ล้างความจำระบบ (Clear Cache)',  'invalidateAllGlobalCaches')
        .addItem('📖 ดู Version Info',            'showVersionInfo')
        .addSeparator()
        .addItem('🚀 ติดตั้ง Smart Navigation (คลิกนำทาง)',  'installSmartNavTrigger')
    )

    .addToUi();
}

// ============================================================
// SECTION 2: onEdit Trigger
// ============================================================

/**
 * onEdit — ดักจับการแก้ไขใน Spreadsheet
 * [ADD v003] รองรับการเลือก Decision ใน Q_REVIEW
 */
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const name  = sheet.getName();

  // 1. ตรวจสอบว่าแก้ไขในชีต Q_REVIEW หรือไม่
  if (name === SHEET.Q_REVIEW) {
    const col = e.range.getColumn();
    const row = e.range.getRow();

    // 2. ตรวจสอบว่าแก้ในคอลัมน์ DECISION (V) หรือไม่
    if (col === REVIEW_IDX.DECISION + 1 && row > 1) {
      const decision = String(e.value || '').trim();
      if (!decision) return;

      const reviewId = String(sheet.getRange(row, REVIEW_IDX.REVIEW_ID + 1).getValue()).trim();
      if (!reviewId) return;

      try {
        // [FIX v003] ประมวลผลทันทีที่เลือก
        applyReviewDecision(reviewId, decision);

        // ทาสีแถวให้เป็นสีตามผลลัพธ์
        highlightHighPriorityReviews();

        sheet.getParent().toast(`✅ ประมวลผล ${reviewId} สำเร็จ`, APP_NAME, 3);
      } catch (err) {
        logError('App_onEdit', `reviewId ${reviewId} ล้มเหลว: ${err.message}`);
        SpreadsheetApp.getUi().alert(`❌ ประมวลผลล้มเหลว: ${err.message}`);
      }
    }
  }
}

// ============================================================
// SECTION 2.5: Smart Navigation (Installable Trigger)
// ============================================================

/**
 * installSmartNavTrigger — [FIX v5.2.016] ติดตั้ง Installable Trigger สำหรับ Smart Navigation
 * สาเหตุ: Simple Trigger (onSelectionChange) ไม่มีสิทธิ์เรียก getUi().alert() ทำให้ล้มเหลวเงียบๆ
 * Installable Trigger มีสิทธิ์เต็มรูปแบบ รวมถึง UI dialog
 */
function installSmartNavTrigger() {
  // ลบ Smart Nav trigger เก่าก่อน (ถ้ามี)
  const triggers = ScriptApp.getProjectTriggers();
  let deletedCount = 0;
  for (const t of triggers) {
    if (t.getHandlerFunction() === 'handleSelectionChange_') {
      ScriptApp.deleteTrigger(t);
      deletedCount++;
    }
  }

  // ติดตั้งใหม่
  ScriptApp.newTrigger('handleSelectionChange_')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onSelectionChange()
    .create();

  SpreadsheetApp.getUi().alert(
    '✅ ติดตั้ง Smart Navigation สำเร็จ!\n\n' +
    (deletedCount > 0 ? `(ลบ Trigger เก่า ${deletedCount} ตัว)\n\n` : '') +
    'วิธีใช้: ไปที่ชีต Q_REVIEW แล้วคลิกที่ช่อง Candidate ID (คอลัมน์ L-O)\n' +
    'ระบบจะถามว่าต้องการนำทางไปตารางหลัก (Master) หรือ ประวัติขนส่ง (FACT)'
  );
}

/**
 * autoInstallSmartNav_ — [FIX v5.4.002] ติดตั้ง Smart Nav แบบเงียบ (ไม่ถามผู้ใช้)
 * ถูกเรียกจาก onOpen() — ตรวจสอบว่ามี trigger อยู่แล้วหรือไม่ ถ้าไม่มีค่อยติดตั้ง
 * แก้ไข Bug: เดิมเรียก autoInstallSmartNav_() แต่ไม่มี function นี้ → Fake Call
 */
function autoInstallSmartNav_() {
  var triggers = ScriptApp.getProjectTriggers();
  var hasSmartNav = false;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'handleSelectionChange_') {
      hasSmartNav = true;
      break;
    }
  }
  if (!hasSmartNav) {
    ScriptApp.newTrigger('handleSelectionChange_')
      .forSpreadsheet(SpreadsheetApp.getActive())
      .onSelectionChange()
      .create();
  }
}

/**
 * handleSelectionChange_ — [FIX v5.2.016] ฟังก์ชันหลักสำหรับ Smart Navigation
 * ถูกเรียกโดย Installable Trigger (มีสิทธิ์ getUi/alert/toast ครบ)
 */
function handleSelectionChange_(e) {
  if (!e || !e.range) return;

  try {
    const sheet = e.range.getSheet();
    const sheetName = sheet.getName();

    // ทำงานเฉพาะเมื่อเลือกในชีต Q_REVIEW เท่านั้น
    if (sheetName !== SHEET.Q_REVIEW) return;

    const col = e.range.getColumn();
    const row = e.range.getRow();

    // ตรวจสอบว่าอยู่ในคอลัมน์ Candidate ID (L ถึง O)
    if (row <= 1 || col < REVIEW_IDX.CAND_PERSONS + 1 || col > REVIEW_IDX.CAND_DESTS + 1) return;

    const cellValue = String(e.range.getValue() || '').trim();
    if (!cellValue) return;

    // ดึง ID รูปแบบ PSxxxxx, PLxxxxx, GPxxxxx, DExxxxx, DSxxxxx
    const matches = cellValue.match(/(PS|PL|GP|DE|DS)\w+/gi);
    if (!matches || matches.length === 0) return;

    const targetId = matches[0].toUpperCase().trim();
    const prefix = targetId.substring(0, 2);

    let targetSheetName = '';
    if (prefix === 'PS')                    targetSheetName = SHEET.M_PERSON;
    else if (prefix === 'PL')               targetSheetName = SHEET.M_PLACE;
    else if (prefix === 'GP')               targetSheetName = SHEET.M_GEO_POINT;
    else if (prefix === 'DE' || prefix === 'DS') targetSheetName = SHEET.M_DESTINATION;
    if (!targetSheetName) return;

    const ss = sheet.getParent();
    const targetSheet = ss.getSheetByName(targetSheetName);
    if (!targetSheet || targetSheet.getLastRow() < 2) return;

    // ค้นหาแถวในชีต Master
    const targetIds = targetSheet.getRange(2, 1, targetSheet.getLastRow() - 1, 1).getValues();
    let targetRowIndex = -1;
    for (let i = 0; i < targetIds.length; i++) {
      if (String(targetIds[i][0]).toUpperCase().trim() === targetId) {
        targetRowIndex = i + 2;
        break;
      }
    }
    if (targetRowIndex === -1) return; // ไม่เจอ ID ในตารางหลัก

    // ค้นหาแถวแรกที่มี ID นี้ใน FACT_DELIVERY
    const factSheet = ss.getSheetByName(SHEET.FACT_DELIVERY);
    let factRowIndex = -1;
    if (factSheet && factSheet.getLastRow() >= 2) {
      let factColIdx = -1;
      if (prefix === 'PS')                    factColIdx = FACT_IDX.PERSON_ID;
      else if (prefix === 'PL')               factColIdx = FACT_IDX.PLACE_ID;
      else if (prefix === 'GP')               factColIdx = FACT_IDX.GEO_ID;
      else if (prefix === 'DE' || prefix === 'DS') factColIdx = FACT_IDX.DEST_ID;

      if (factColIdx !== -1) {
        const factIds = factSheet.getRange(2, factColIdx + 1, factSheet.getLastRow() - 1, 1).getValues();
        for (let j = 0; j < factIds.length; j++) {
          if (String(factIds[j][0]).toUpperCase().trim() === targetId) {
            factRowIndex = j + 2;
            break;
          }
        }
      }
    }

    // แสดงกล่องเลือก (ใช้ได้เพราะเป็น Installable Trigger)
    const ui = SpreadsheetApp.getUi();
    const msg = `ต้องการให้ระบบนำทางไปยังส่วนใดสำหรับ ID: ${targetId} ?\n\n` +
                `👉 [YES] ไปยังหน้าข้อมูลหลัก Master (${targetSheetName} แถวที่ ${targetRowIndex})\n` +
                `👉 [NO] ไปยังหน้าประวัติการส่งสินค้าจริง (FACT_DELIVERY ${factRowIndex !== -1 ? 'แถวที่ ' + factRowIndex : '- ไม่พบประวัติ'})\n` +
                `👉 [CANCEL] ยกเลิกการนำทาง`;

    const response = ui.alert('🚀 Smart Navigation', msg, ui.ButtonSet.YES_NO_CANCEL);

    if (response === ui.Button.YES) {
      targetSheet.activate();
      targetSheet.getRange(targetRowIndex, 1, 1, targetSheet.getLastColumn()).activate();
      ss.toast(`🎯 นำทางไปยังตารางหลัก ${targetSheetName} แถว ${targetRowIndex} สำเร็จ`, 'LMDS Navigation');
    } else if (response === ui.Button.NO) {
      if (factRowIndex !== -1) {
        factSheet.activate();
        factSheet.getRange(factRowIndex, 1, 1, factSheet.getLastColumn()).activate();
        ss.toast(`🎯 นำทางไปยังประวัติขนส่ง FACT_DELIVERY แถว ${factRowIndex} สำเร็จ`, 'LMDS Navigation');
      } else {
        ui.alert(`❌ ไม่พบประวัติของ ${targetId} ในชีต FACT_DELIVERY`);
      }
    }

  } catch (err) {
    // เขียน log เงียบๆ ไม่ต้อง alert (ป้องกัน loop error)
    try { logError('SmartNav', err.message); } catch (_) {}
  }
}

/**
 * onSelectionChange — [DEPRECATED v5.2.016]
 * ถูกแทนที่ด้วย handleSelectionChange_ (Installable Trigger)
 * คงไว้เป็น stub เปล่าเพื่อไม่ให้ GAS สร้าง Simple Trigger ซ้ำซ้อน
 */
function onSelectionChange(e) {
  // Intentionally empty — ใช้ installSmartNavTrigger() แทน
}

// ============================================================
// SECTION 3: safeRun — Global Error Handler
// ============================================================

function safeRun(funcName, fn) {
  try {
    fn();
  } catch (err) {
    logError(funcName, err.message);
    SpreadsheetApp.getUi().alert(
      `❌ ${funcName} ล้มเหลว:\n${err.message}`
    );
  }
}

// ============================================================
// SECTION 3: Full Pipeline
// ============================================================

function runFullPipeline() {
  const ui = SpreadsheetApp.getUi();

  // [ADD v003] LockService กัน double-click
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) {
    ui.alert('⚠️ มี Pipeline กำลังทำงานอยู่\nกรุณารอให้เสร็จก่อน');
    return;
  }

  try {
    const ss        = SpreadsheetApp.getActiveSpreadsheet();
    const startTime = new Date();

    logInfo('App', `Full Pipeline เริ่มต้น — v${APP_VERSION}`);
    ss.toast('🚀 เริ่มต้นรัน Full Pipeline (ทำงานเบื้องหลัง)...', APP_NAME, 5);

    // [FIX v5.4.001] ล้าง Cache ทั้งหมดก่อนเริ่ม Pipeline เพื่อให้อ่านข้อมูลใหม่จากชีต
    invalidateAllGlobalCaches();

    safeRun('runFullPipeline', () => {
      ss.toast('Step 1/3: กำลังโหลดข้อมูลดิบ...', APP_NAME, 10);
      runLoadSource();

      ss.toast('Step 2/3: กำลัง Normalize...', APP_NAME, 10);
      runNormalize();

      ss.toast('Step 3/3: กำลัง Match Engine...', APP_NAME, 10);
      runMatchEngine();

      const elapsedSec = Math.round((new Date() - startTime) / 1000);
      logInfo('App', `Full Pipeline สำเร็จ — ${elapsedSec} วินาที`);

      // [FIX v5.4.001] แสดงสรุปผลลัพธ์แบบละเอียด พร้อมตรวจเตือนถ้ามีปัญหา
      const diagResult = getPipelineDiagnosticSummary_();
      let alertMsg = `✅ Full Pipeline สำเร็จ!\nใช้เวลา: ${elapsedSec} วินาที\n\n` + diagResult.summary;
      if (diagResult.warnings.length > 0) {
        alertMsg += '\n\n⚠️ คำเตือน:\n' + diagResult.warnings.join('\n');
      }
      ui.alert(alertMsg);
    });

  } finally {
    lock.releaseLock();
  }
}

/**
 * getPipelineDiagnosticSummary_ — [NEW v5.4.001] สรุปสถานะหลัง Pipeline รันเสร็จ
 * ตรวจสอบจำนวนข้อมูลในแต่ละชีต และแจ้งเตือนถ้าชีตว่าง
 * @return {{ summary: string, warnings: string[] }}
 */
function getPipelineDiagnosticSummary_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const checks = [
    { name: SHEET.M_PERSON,       label: 'M_PERSON' },
    { name: SHEET.M_PERSON_ALIAS, label: 'M_PERSON_ALIAS' },
    { name: SHEET.M_PLACE,        label: 'M_PLACE' },
    { name: SHEET.M_PLACE_ALIAS,  label: 'M_PLACE_ALIAS' },
    { name: SHEET.M_GEO_POINT,    label: 'M_GEO_POINT' },
    { name: SHEET.M_ALIAS,        label: 'M_ALIAS' },
    { name: SHEET.FACT_DELIVERY,  label: 'FACT_DELIVERY' },
    { name: SHEET.Q_REVIEW,       label: 'Q_REVIEW' },
  ];

  const warnings = [];
  const lines = [];

  checks.forEach(c => {
    const sheet = ss.getSheetByName(c.name);
    const dataRows = sheet ? Math.max(0, sheet.getLastRow() - 1) : -1;
    if (dataRows === -1) {
      lines.push(`  ❌ ${c.label}: ไม่พบชีต`);
      warnings.push(`ไม่พบชีต ${c.label} — รัน "สร้างชีตทั้งหมด" ก่อน`);
    } else if (dataRows === 0) {
      lines.push(`  ⚠️ ${c.label}: 0 แถว (ว่าง)`);
    } else {
      lines.push(`  ✅ ${c.label}: ${dataRows} แถว`);
    }
  });

  // ตรวจสอบ Source Sheet
  const srcSheet = ss.getSheetByName(SHEET.SOURCE);
  if (srcSheet && srcSheet.getLastRow() > 1) {
    const srcTotal = srcSheet.getLastRow() - 1;
    // นับแถวที่ SYNC_STATUS = 'SUCCESS'
    const syncCol = SRC_IDX.SYNC_STATUS + 1;
    const syncData = srcSheet.getRange(2, syncCol, srcTotal, 1).getValues();
    const doneCount = syncData.filter(r => String(r[0]).trim() === SCG_CONFIG.SYNC_DONE_VALUE).length;
    const pendingCount = srcTotal - doneCount;
    lines.push(`\n  📊 Source: ${srcTotal} แถว (ประมวลผลแล้ว: ${doneCount}, ค้างอยู่: ${pendingCount})`);
    if (pendingCount === 0 && srcTotal > 0) {
      warnings.push('Source ทั้งหมดถูกประมวลผลแล้ว (SYNC_STATUS=SUCCESS) — ถ้าต้องการรันใหม่ กดเมนู "รีเซ็ตสถานะ SYNC"');
    }
  } else {
    warnings.push('ไม่พบข้อมูลในชีต Source — ตรวจสอบชื่อชีต: ' + SHEET.SOURCE);
  }

  // ตรวจสอบ column mismatch
  [SHEET.M_PERSON, SHEET.M_PLACE].forEach(sn => {
    const sheet = ss.getSheetByName(sn);
    if (sheet) {
      const actualCols = sheet.getLastColumn();
      const schemaCols = SCHEMA[sn] ? SCHEMA[sn].length : 0;
      if (schemaCols > 0 && actualCols < schemaCols) {
        warnings.push(`${sn}: ชีตมี ${actualCols} คอลัมน์ แต่ SCHEMA ต้องการ ${schemaCols} — รัน "สร้างชีตทั้งหมด" เพื่อเพิ่มคอลัมน์ที่ขาด`);
      }
    }
  });

  return { summary: lines.join('\n'), warnings: warnings };
}

// ============================================================
// SECTION 4: Navigation Helpers
// ============================================================

function openReviewQueue() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.Q_REVIEW);
  if (sheet) {
    ss.setActiveSheet(sheet);
    ss.toast('กำลังแสดง Review Queue', APP_NAME, 3);
  } else {
    SpreadsheetApp.getUi()
      .alert('❌ ไม่พบชีต Q_REVIEW\nกรุณารัน "สร้างชีตทั้งหมด" ก่อน');
  }
}

// ============================================================
// SECTION 5: System Tools
// ============================================================

function checkSystemIntegrity() {
  const ui     = SpreadsheetApp.getUi();
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const errors = [];
  const warns  = [];

  // [FIX v003] เพิ่ม SHEET.SYS_TH_GEO ใน requiredSheets
  // [NEW v5.4.000] เพิ่ม SHEET.M_ALIAS ใน requiredSheets
  const requiredSheets = [
    SHEET.M_PERSON,      SHEET.M_PERSON_ALIAS,
    SHEET.M_PLACE,       SHEET.M_PLACE_ALIAS,
    SHEET.M_ALIAS,
    SHEET.M_GEO_POINT,   SHEET.M_DESTINATION,
    SHEET.FACT_DELIVERY, SHEET.Q_REVIEW,
    SHEET.SYS_LOG,       SHEET.SYS_CONFIG,
    SHEET.SYS_TH_GEO,    // [ADD v003]
    SHEET.MAPS_CACHE,    SHEET.RPT_QUALITY,
    SHEET.DAILY_JOB,     SHEET.INPUT,
    SHEET.EMPLOYEE,      SHEET.SOURCE,
  ];

  requiredSheets.forEach(name => {
    if (!ss.getSheetByName(name)) errors.push(`ไม่พบชีต: ${name}`);
  });

  try {
    const apiKey = PropertiesService.getScriptProperties()
                                    .getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      warns.push('GEMINI_API_KEY ยังไม่ได้ตั้งค่า');
    } else if (apiKey.length < 20) {
      warns.push('GEMINI_API_KEY อาจไม่ถูกต้อง');
    }
  } catch (e) {
    warns.push('ไม่สามารถอ่าน GEMINI_API_KEY: ' + e.message);
  }

  if (errors.length === 0 && warns.length === 0) {
    ui.alert(`✅ System Integrity: ปกติทุกอย่าง!\nVersion: ${APP_VERSION}`);
    return;
  }

  let msg = '';
  if (errors.length > 0) {
    msg += `❌ พบ Error ${errors.length} รายการ:\n`;
    msg += errors.map(e => '  • ' + e).join('\n');
    msg += '\n\n💡 รัน เมนู > ระบบ > สร้างชีตทั้งหมด\n\n';
  }
  if (warns.length > 0) {
    msg += `⚠️ พบ Warning ${warns.length} รายการ:\n`;
    msg += warns.map(w => '  • ' + w).join('\n');
  }

  ui.alert(msg);
}

function setupEnvironment() {
  const ui = SpreadsheetApp.getUi();

  const result = ui.prompt(
    '⚙️ ตั้งค่า Gemini API Key',
    'กรุณาใส่ Gemini API Key:\n(ได้จาก https://aistudio.google.com/app/apikey)',
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() !== ui.Button.OK) return;

  const inputKey = result.getResponseText().trim();
  const keyRegex = /^AIza[0-9A-Za-z\-_]{35}$/;

  if (!inputKey || !keyRegex.test(inputKey)) {
    ui.alert(
      '❌ API Key ไม่ถูกต้อง\n' +
      'ต้องขึ้นต้นด้วย "AIza" และยาว 39 ตัวอักษร'
    );
    return;
  }

  PropertiesService.getScriptProperties()
                   .setProperty('GEMINI_API_KEY', inputKey);
  logInfo('App', 'ตั้งค่า GEMINI_API_KEY สำเร็จ');
  ui.alert('✅ บันทึก API Key เรียบร้อยแล้วครับ!');
}

function showVersionInfo() {
  const ui = SpreadsheetApp.getUi();
  const msg =
    `🚚 ${APP_NAME}\n` +
    `Version: ${APP_VERSION}\n` +
    `Schema: v${SCHEMA_VERSION}\n\n` +
    `📦 Modules (22 files):\n` +
    `  00_App.gs                v5.4.001\n` +
    `  01_Config.gs             v5.4.001\n` +
    `  02_Schema.gs             v5.4.001\n` +
    `  03_SetupSheets.gs        v5.4.001\n` +
    `  04_SourceRepository.gs   v5.4.001\n` +
    `  05_NormalizeService.gs   v5.4.001\n` +
    `  06_PersonService.gs      v5.4.001\n` +
    `  07_PlaceService.gs       v5.4.001\n` +
    `  08_GeoService.gs         v5.4.001\n` +
    `  09_DestinationService.gs v5.4.001\n` +
    `  10_MatchEngine.gs        v5.4.001\n` +
    `  11_TransactionService.gs v5.4.001\n` +
    `  12_ReviewService.gs      v5.4.001\n` +
    `  13_ReportService.gs      v5.4.001\n` +
    `  14_Utils.gs              v5.4.001\n` +
    `  15_GoogleMapsAPI.gs      v5.4.001\n` +
    `  16_GeoDictBuilder.gs     v5.4.001\n` +
    `  17_SearchService.gs      v5.4.001\n` +
    `  18_ServiceSCG.gs         v5.4.001\n` +
    `  19_Hardening.gs          v5.4.001\n` +
    `  20_ThGeoService.gs       v5.4.001\n` +
    `  21_AliasService.gs       v5.4.001\n\n` +
    `🟩 กลุ่ม 1: Cleansing & Master DB (00–14)\n` +
    `🟦 กลุ่ม 2: Daily Ops & Search (15–18)\n` +
    `🛡️ กลุ่ม 3: System Hardening (19)\n` +
    `🌍 ระบบเสริม: Thai Geo Reference (20)\n` +
    `🔗 ระบบเสริม: Hybrid Alias Architecture (21)`;

  ui.alert(msg);
}

// ============================================================
// SECTION 6: Diagnostic Tool — [NEW v5.4.001]
// ============================================================

/**
 * diagnoseSystemState — วินิจฉัยปัญหา Pipeline แบบครบวงจร
 * ตรวจสอบ: ชีตมีอยู่ไหม, คอลัมน์ครบไหม, ข้อมูลว่างไหม, SYNC_STATUS, Cache, ฯลฯ
 * เรียกจากเมนู: 🔧 ระบบ > 🔍 วินิจฉัย Pipeline (Diagnostic)
 */
function diagnoseSystemState() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lines = [];
  const fixes = [];

  lines.push('=== 🔍 LMDS Pipeline Diagnostic ===');
  lines.push(`Version: ${APP_VERSION} | Schema: v${SCHEMA_VERSION}`);
  lines.push('');

  // 1. ตรวจสอบชีตที่จำเป็น
  lines.push('📋 ชีตที่จำเป็น:');
  const requiredSheets = [
    SHEET.SOURCE, SHEET.M_PERSON, SHEET.M_PERSON_ALIAS,
    SHEET.M_PLACE, SHEET.M_PLACE_ALIAS, SHEET.M_ALIAS,
    SHEET.M_GEO_POINT, SHEET.M_DESTINATION, SHEET.FACT_DELIVERY,
    SHEET.Q_REVIEW, SHEET.SYS_LOG, SHEET.SYS_TH_GEO
  ];

  requiredSheets.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) {
      lines.push(`  ❌ ${name}: ไม่พบชีต`);
      fixes.push(`สร้างชีต ${name} — รัน "สร้างชีตทั้งหมด"`);
    } else {
      const dataRows = Math.max(0, sheet.getLastRow() - 1);
      lines.push(`  ✅ ${name}: ${dataRows} แถวข้อมูล`);
    }
  });

  // 2. ตรวจสอบ Column Mismatch (สาเหตุหลักของชีตว่าง)
  lines.push('');
  lines.push('📐 ตรวจสอบคอลัมน์ (SCHEMA vs ชีตจริง):');
  const schemaChecks = [
    { name: SHEET.M_PERSON,       schema: SCHEMA[SHEET.M_PERSON],       label: 'M_PERSON' },
    { name: SHEET.M_PLACE,        schema: SCHEMA[SHEET.M_PLACE],        label: 'M_PLACE' },
    { name: SHEET.M_GEO_POINT,    schema: SCHEMA[SHEET.M_GEO_POINT],    label: 'M_GEO_POINT' },
    { name: SHEET.M_ALIAS,        schema: SCHEMA[SHEET.M_ALIAS],         label: 'M_ALIAS' },
    { name: SHEET.FACT_DELIVERY,  schema: SCHEMA[SHEET.FACT_DELIVERY],  label: 'FACT_DELIVERY' },
  ];

  schemaChecks.forEach(c => {
    const sheet = ss.getSheetByName(c.name);
    if (!sheet || !c.schema) return;
    const actualCols = sheet.getLastColumn();
    const schemaCols = c.schema.length;
    if (actualCols < schemaCols) {
      lines.push(`  ❌ ${c.label}: ชีตมี ${actualCols} คอลัมน์ แต่ SCHEMA ต้องการ ${schemaCols}`);
      fixes.push(`เพิ่มคอลัมน์ใน ${c.label} — รัน "สร้างชีตทั้งหมด" (Auto-Repair)`);
    } else {
      lines.push(`  ✅ ${c.label}: ${actualCols}/${schemaCols} คอลัมน์`);
    }
  });

  // 3. ตรวจสอบ Source Data
  lines.push('');
  lines.push('📊 ข้อมูลต้นทาง (Source):');
  const srcSheet = ss.getSheetByName(SHEET.SOURCE);
  if (srcSheet && srcSheet.getLastRow() > 1) {
    const srcTotal = srcSheet.getLastRow() - 1;
    const srcCols = srcSheet.getLastColumn();
    lines.push(`  แถวทั้งหมด: ${srcTotal} | คอลัมน์: ${srcCols}`);

    // ตรวจ SYNC_STATUS
    const syncCol = SRC_IDX.SYNC_STATUS + 1;
    if (srcCols >= syncCol) {
      const syncData = srcSheet.getRange(2, syncCol, Math.min(srcTotal, 500), 1).getValues();
      const doneCount = syncData.filter(r => String(r[0]).trim() === SCG_CONFIG.SYNC_DONE_VALUE).length;
      const pendingCount = srcTotal - doneCount;
      lines.push(`  SYNC_STATUS: ประมวลผลแล้ว=${doneCount} ค้างอยู่=${pendingCount}`);
      if (pendingCount === 0) {
        lines.push(`  ⚠️ ทุกแถวถูกประมวลผลแล้ว — Pipeline จะไม่สร้างข้อมูลใหม่`);
        fixes.push('รีเซ็ต SYNC_STATUS — รัน "รีเซ็ตสถานะ SYNC (เพื่อรันใหม่)"');
      }
    } else {
      lines.push(`  ⚠️ ชีต Source ไม่มีคอลัมน์ SYNC_STATUS (col ${syncCol}) แต่มีแค่ ${srcCols} คอลัมน์`);
    }

    // ตรวจ INVOICE_NO
    const invCol = SRC_IDX.INVOICE_NO + 1;
    if (srcCols >= invCol) {
      const invData = srcSheet.getRange(2, invCol, Math.min(srcTotal, 500), 1).getValues();
      const hasInvCount = invData.filter(r => String(r[0]).trim()).length;
      lines.push(`  INVOICE_NO: ${hasInvCount}/${Math.min(srcTotal, 500)} แถวมีค่า`);
      if (hasInvCount === 0) {
        fixes.push('ชีต Source ไม่มี Invoice No — ตรวจสอบโครงสร้างชีต');
      }
    }

    // ตรวจ LAT/LNG
    const latCol = SRC_IDX.LAT + 1;
    const lngCol = SRC_IDX.LNG + 1;
    if (srcCols >= lngCol) {
      const latLngData = srcSheet.getRange(2, latCol, Math.min(srcTotal, 500), 2).getValues();
      const hasGeoCount = latLngData.filter(r => Number(r[0]) !== 0 && Number(r[1]) !== 0 && !isNaN(Number(r[0])) && !isNaN(Number(r[1]))).length;
      lines.push(`  LAT/LNG: ${hasGeoCount}/${Math.min(srcTotal, 500)} แถวมีพิกัด`);
      if (hasGeoCount === 0) {
        lines.push(`  ⚠️ ไม่มีพิกัดเลย — ทุกแถวจะเข้า REVIEW (INVALID_LATLNG)`);
        fixes.push('ข้อมูล Source ไม่มีพิกัด — ตรวจสอบคอลัมน์ LAT/LNG');
      }
    }
  } else {
    lines.push(`  ❌ ไม่พบข้อมูลในชีต: ${SHEET.SOURCE}`);
    fixes.push(`ตรวจสอบชื่อชีต Source: "${SHEET.SOURCE}"`);
  }

  // 4. ตรวจสอบ SYS_LOG Errors
  lines.push('');
  lines.push('⚠️ Error ล่าสุดใน SYS_LOG:');
  const logSheet = ss.getSheetByName(SHEET.SYS_LOG);
  if (logSheet && logSheet.getLastRow() > 1) {
    const logRows = Math.min(20, logSheet.getLastRow() - 1);
    const logData = logSheet.getRange(logSheet.getLastRow() - logRows + 1, 1, logRows, 6).getValues();
    const errors = logData.filter(r => String(r[SYS_LOG_IDX.LEVEL]).trim() === 'ERROR').slice(-5);
    if (errors.length === 0) {
      lines.push('  ✅ ไม่มี Error ใน 20 แถวล่าสุด');
    } else {
      errors.forEach(e => {
        const mod = String(e[SYS_LOG_IDX.MODULE] || '').substring(0, 20);
        const msg = String(e[SYS_LOG_IDX.MESSAGE] || '').substring(0, 80);
        lines.push(`  ❌ [${mod}] ${msg}`);
      });
      fixes.push('ตรวจสอบ Error ใน SYS_LOG — อาจเป็นสาเหตุที่ชีตว่าง');
    }
  }

  // 5. สรุปวิธีแก้
  if (fixes.length > 0) {
    lines.push('');
    lines.push('🔧 วิธีแก้ปัญหา:');
    fixes.forEach((f, i) => {
      lines.push(`  ${i + 1}. ${f}`);
    });
  } else {
    lines.push('');
    lines.push('✅ ไม่พบปัญหาที่ชัดเจน — ระบบน่าจะทำงานปกติ');
  }

  ui.alert(lines.join('\n'));
}
