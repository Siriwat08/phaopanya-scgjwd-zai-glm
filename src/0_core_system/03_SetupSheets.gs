/**
 * VERSION: 5.4.001
 * FILE: 03_SetupSheets.gs
 * LMDS V5.4 — Sheet Setup & Configuration Service
 * ===================================================
 * PURPOSE:
 *   สร้างโครงสร้างชีตเริ่มต้นทั้งหมดในระบบ LMDS
 *   เป็น Single Source of Truth สำหรับโครงสร้าง Spreadsheet
 * ===================================================
 * CHANGELOG:
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [ADD] M_ALIAS sheet creation in setupGroupOneSheets_() after M_PLACE_ALIAS
 *   v5.4.000 (2026-05-23):
 *     - [ADD] Comprehensive header documentation
 *   v5.2.014 (PH2):
 *     - [FIX] setupInputSheet_: จัดโครงสร้างชีต Input เป็นฟอร์มแนวตั้ง
 *   v5.2.008 (PH2 Hardening):
 *     - [ADD] Auto-Repair headers if columns are missing
 *     - [FIX] ทุก SCHEMA.xxx → getSheetHeaders(SHEET.xxx)
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config.gs     (SHEET.*, REVIEW_IDX, SCHEMA_VERSION)
 *     - 02_Schema.gs     (SCHEMA, getSheetHeaders, validateSheetHeaders)
 *   CALLS (Invokes):
 *     - validateSchemaConsistency() → 02_Schema.gs
 *     - generateShortId()          → 14_Utils.gs
 *   EXPORTS TO:
 *     - 00_App.gs          (setupAllSheets trigger)
 *     - All Service files  (getSheetByName — sheets must exist first)
 *   SHEETS ACCESSED (Write — Creates all sheets):
 *     - SHEET.M_PERSON, M_PERSON_ALIAS, M_PLACE, M_PLACE_ALIAS, M_ALIAS
 *     - SHEET.M_GEO_POINT, M_DESTINATION, FACT_DELIVERY, Q_REVIEW
 *     - SHEET.RPT_QUALITY, MAPS_CACHE
 *     - SHEET.DAILY_JOB, INPUT, EMPLOYEE
 *     - SHEET.OWNER_SUMMARY, SHIPMENT_SUM
 *     - SHEET.SYS_LOG, SYS_CONFIG, SYS_TH_GEO
 *   SHARED FUNCTIONS (Exported):
 *     - logInfo(), logWarn(), logError(), logDebug() — Used by ALL modules
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  03_SetupSheets.gs (Sheet Bootstrapper + System Logger)    │
 *   │  ├── setupAllSheets()      — Create all required sheets    │
 *   │  │   ├── setupGroupOneSheets_() — Master + Fact + Alias    │
 *   │  │   ├── setupGroupTwoSheets_() — Daily Ops                │
 *   │  │   └── setupSystemSheets_()   — SYS_LOG, SYS_CONFIG     │
 *   │  ├── createSheetIfMissing_() — Create sheet + validate     │
 *   │  ├── setupReviewDropdowns_() — Q_REVIEW dropdowns          │
 *   │  ├── setupInputSheet_()      — Vertical form layout        │
 *   │  └── logInfo/Warn/Error/Debug — System Logger (shared)     │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: setupAllSheets — Entry Point
// ============================================================

/**
 * setupAllSheets — สร้างชีตทั้งหมดที่จำเป็น
 * [ADD v003] LockService กัน setup ซ้ำซ้อน
 */
function setupAllSheets() {
  const ui   = SpreadsheetApp.getUi();
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(5000)) {
    ui.alert('⚠️ Setup กำลังทำงานอยู่แล้ว\nกรุณารอให้เสร็จก่อน');
    return;
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ss.toast('🏗️ กำลังตรวจสอบและสร้างชีตทั้งหมด...', APP_NAME, -1);

    setupGroupOneSheets_(ss);
    setupGroupTwoSheets_(ss);
    setupSystemSheets_(ss);

    // ตรวจสอบ Schema หลัง Setup
    try {
      validateSchemaConsistency();
    } catch (e) {
      ui.alert(`⚠️ Schema Warning:\n${e.message}`);
    }

    ss.toast('✅ Setup เสร็จสมบูรณ์!', APP_NAME, 5);
    ui.alert(
      '✅ Setup เสร็จสมบูรณ์!\n\n' +
      'ชีตที่ถูกสร้าง/ตรวจสอบ:\n' +
      Object.values(SHEET).map(n => `  • ${n}`).join('\n')
    );

  } catch (err) {
    logError('SetupSheets', `setupAllSheets ล้มเหลว: ${err.message}`);
    ui.alert(`❌ Setup ล้มเหลว:\n${err.message}`);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// SECTION 2: Group 1 — Master Data Sheets
// ============================================================

function setupGroupOneSheets_(ss) {
  // [FIX v003] ทุก call ใช้ getSheetHeaders(SHEET.xxx) แทน SCHEMA.xxx
  createSheetIfMissing_(ss, SHEET.M_PERSON,
    getSheetHeaders(SHEET.M_PERSON));

  createSheetIfMissing_(ss, SHEET.M_PERSON_ALIAS,
    getSheetHeaders(SHEET.M_PERSON_ALIAS));

  createSheetIfMissing_(ss, SHEET.M_PLACE,
    getSheetHeaders(SHEET.M_PLACE));

  createSheetIfMissing_(ss, SHEET.M_PLACE_ALIAS,
    getSheetHeaders(SHEET.M_PLACE_ALIAS));

  // [NEW v5.4.000] สร้างชีต M_ALIAS สำหรับ Hybrid Alias Architecture
  createSheetIfMissing_(ss, SHEET.M_ALIAS,
    getSheetHeaders(SHEET.M_ALIAS));

  createSheetIfMissing_(ss, SHEET.M_GEO_POINT,
    getSheetHeaders(SHEET.M_GEO_POINT));

  createSheetIfMissing_(ss, SHEET.M_DESTINATION,
    getSheetHeaders(SHEET.M_DESTINATION));

  createSheetIfMissing_(ss, SHEET.FACT_DELIVERY,
    getSheetHeaders(SHEET.FACT_DELIVERY));

  createSheetIfMissing_(ss, SHEET.Q_REVIEW,
    getSheetHeaders(SHEET.Q_REVIEW));

  createSheetIfMissing_(ss, SHEET.RPT_QUALITY,
    getSheetHeaders(SHEET.RPT_QUALITY));

  createSheetIfMissing_(ss, SHEET.MAPS_CACHE,
    getSheetHeaders(SHEET.MAPS_CACHE));

  logInfo('SetupSheets', 'Group 1 Sheets เสร็จสิ้น');
}

// ============================================================
// SECTION 3: Group 2 — Daily Ops Sheets
// ============================================================

function setupGroupTwoSheets_(ss) {
  createSheetIfMissing_(ss, SHEET.DAILY_JOB,
    getSheetHeaders(SHEET.DAILY_JOB));

  setupInputSheet_(ss);

  createSheetIfMissing_(ss, SHEET.EMPLOYEE,
    getSheetHeaders(SHEET.EMPLOYEE));

  // [FIX v003] SCHEMA.OWNER_SUMMARY → getSheetHeaders(SHEET.OWNER_SUMMARY)
  createSheetIfMissing_(ss, SHEET.OWNER_SUMMARY,
    getSheetHeaders(SHEET.OWNER_SUMMARY));

  // [FIX v003] SCHEMA.SHIPMENT_SUMMARY → getSheetHeaders(SHEET.SHIPMENT_SUM)
  createSheetIfMissing_(ss, SHEET.SHIPMENT_SUM,
    getSheetHeaders(SHEET.SHIPMENT_SUM));

  logInfo('SetupSheets', 'Group 2 Sheets เสร็จสิ้น');
}

// ============================================================
// SECTION 4: System Sheets
// ============================================================

function setupSystemSheets_(ss) {
  createSheetIfMissing_(ss, SHEET.SYS_LOG,
    getSheetHeaders(SHEET.SYS_LOG));

  createSheetIfMissing_(ss, SHEET.SYS_CONFIG,
    getSheetHeaders(SHEET.SYS_CONFIG));

  // [FIX v003] SYS_TH_GEO ต้องสร้างถ้าไม่มี
  createSheetIfMissing_(ss, SHEET.SYS_TH_GEO,
    getSheetHeaders(SHEET.SYS_TH_GEO));

  // เพิ่มค่า Config เริ่มต้น
  setupDefaultConfig_(ss);

  // ตั้ง Dropdown สำหรับ Q_REVIEW
  setupReviewDropdowns_(ss);

  logInfo('SetupSheets', 'System Sheets เสร็จสิ้น');
}

// ============================================================
// SECTION 5: createSheetIfMissing_
// ============================================================

/**
 * createSheetIfMissing_ — สร้างชีตพร้อม Header ถ้ายังไม่มี
 * [RULE 4] ถ้ามีอยู่แล้วให้ตรวจสอบ Header แทนสร้างใหม่
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} sheetName
 * @param {string[]} headers - Header Array จาก getSheetHeaders()
 */
function createSheetIfMissing_(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    // สร้างชีตใหม่
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length)
         .setValues([headers])
         .setFontWeight('bold')
         .setBackground('#4a86e8')
         .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, headers.length, 150);

    logInfo('SetupSheets', `สร้างชีต: ${sheetName} (${headers.length} cols)`);
    return sheet;
  }

  // ชีตมีอยู่แล้ว → ตรวจ Header
  const validation = validateSheetHeaders(sheet, headers);

  if (!validation.isValid) {
    if (validation.missing.length > 0) {
      logWarn('SetupSheets', `${sheetName}: Header หายไป [${validation.missing.join(', ')}] -> กำลังเพิ่มให้อัตโนมัติ...`);

      // [NEW v5.2.008] Auto-Repair: เพิ่มคอลัมน์ที่หายไปต่อท้ายชีต
      const lastCol = sheet.getLastColumn();
      const missingHeaders = validation.missing;

      sheet.getRange(1, lastCol + 1, 1, missingHeaders.length)
           .setValues([missingHeaders])
           .setFontWeight('bold')
           .setBackground('#e06666') // สีแดงอ่อนเพื่อให้รู้ว่าเป็นการ Auto-Repair
           .setFontColor('#ffffff');

      logInfo('SetupSheets', `${sheetName}: เติม ${missingHeaders.length} คอลัมน์เรียบร้อย`);
    }
    if (validation.wrongOrder) {
      logWarn('SetupSheets', `${sheetName}: Header ลำดับผิด (กรุณาตรวจสอบลำดับคอลัมน์ด้วยตนเอง)`);
    }
  }

  return sheet;
}

// ============================================================
// SECTION 6: setupReviewDropdowns_
// ============================================================

/**
 * setupReviewDropdowns_ — ตั้ง Dropdown สำหรับคอลัมน์ใน Q_REVIEW
 * [FIX v003] maxRows = 1000 → sheet.getMaxRows() - 1
 */
function setupReviewDropdowns_(ss) {
  const sheet = ss.getSheetByName(SHEET.Q_REVIEW);
  if (!sheet) return;

  // [FIX v003] ใช้จำนวนแถวจริงจากชีต ไม่ hardcode 1000
  const maxRows = sheet.getMaxRows() - 1;
  if (maxRows <= 0) return;

  const startRow = 2;

  // Dropdown: STATUS
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Pending', 'In_Review', 'Done', 'Escalated'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(startRow, REVIEW_IDX.STATUS + 1, maxRows, 1)
       .setDataValidation(statusRule);

  // Dropdown: DECISION
  const decisionRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['CREATE_NEW', 'MERGE_TO_CANDIDATE', 'ESCALATE', 'IGNORE'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(startRow, REVIEW_IDX.DECISION + 1, maxRows, 1)
       .setDataValidation(decisionRule);

  // Dropdown: PRIORITY
  const priorityRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['1', '2', '3', '4'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(startRow, REVIEW_IDX.PRIORITY + 1, maxRows, 1)
       .setDataValidation(priorityRule);

  logDebug('SetupSheets', `setupReviewDropdowns_: Q_REVIEW ${maxRows} แถว`);
}

// ============================================================
// SECTION 7: setupDefaultConfig_
// ============================================================

function setupDefaultConfig_(ss) {
  const sheet = ss.getSheetByName(SHEET.SYS_CONFIG);
  if (!sheet) return;
  if (sheet.getLastRow() > 1) return; // มีค่าอยู่แล้ว

  const now     = new Date();
  const configs = [
    ['SCHEMA_VERSION',     SCHEMA_VERSION,
     'เวอร์ชัน Schema ของระบบ', now],
    ['GEO_RADIUS_M',       String(AI_CONFIG.GEO_RADIUS_M),
     'รัศมีค้นหา Geo Point (เมตร)', now],
    ['BATCH_SIZE',         String(AI_CONFIG.BATCH_SIZE),
     'จำนวน record ต่อ Batch', now],
    ['THRESHOLD_AUTO',     String(AI_CONFIG.THRESHOLD_AUTO),
     'Score >= นี้ → Auto Match', now],
    ['THRESHOLD_REVIEW',   String(AI_CONFIG.THRESHOLD_REVIEW),
     'Score >= นี้ → ส่ง Review', now],
    ['LAST_SETUP',         now.toISOString(),
     'เวลาที่ Setup ล่าสุด', now],
  ];

  sheet.getRange(2, 1, configs.length,
    getSheetHeaders(SHEET.SYS_CONFIG).length)
    .setValues(configs);

  logInfo('SetupSheets', `setupDefaultConfig_: ${configs.length} ค่า`);
}

// ============================================================
// SECTION 8: Logging Functions (shared scope)
// ============================================================

/**
 * logInfo / logWarn / logError / logDebug
 * เขียน Log ลง SYS_LOG + Console
 */
function logInfo(module, message) {
  writeLog_('INFO', module, message);
  console.log(`[INFO][${module}] ${message}`);
}

function logWarn(module, message) {
  writeLog_('WARN', module, message);
  console.warn(`[WARN][${module}] ${message}`);
}

function logError(module, message, error) {
  // [FIX v5.4.003] เพิ่ม stack trace parameter — กฎข้อ 13 (Logging with Context)
  var stackTrace = '';
  if (error && error.stack) {
    stackTrace = '\n' + error.stack;
  }
  writeLog_('ERROR', module, message + stackTrace);
  console.error(`[ERROR][${module}] ${message}` + stackTrace);
}

function logDebug(module, message) {
  // Debug: เขียนแค่ Console ไม่เขียนลง Sheet (ลด API calls)
  console.log(`[DEBUG][${module}] ${message}`);
}

function writeLog_(level, module, message) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET.SYS_LOG);
    if (!sheet) return;

    // Log ID
    const logId = generateShortId('L');
    sheet.appendRow([
      logId, new Date(), module, level,
      String(message).substring(0, 500), '',
    ]);

    // ล้าง Log เก่าถ้าเกิน 5000 แถว
    if (sheet.getLastRow() > 5001) {
      clearOldLogs_(sheet, 1000);
    }
  } catch (e) {
    // ถ้าเขียน Log ไม่ได้ ไม่ throw
  }
}

// ============================================================
// SECTION 9: clearOldLogs_
// ============================================================

/**
 * clearOldLogs_ — ล้าง Log เก่า
 * [FIX v003] เปลี่ยนจาก deleteRow ทีละแถว (ช้ามาก) → filter + batch rewrite
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} logSheet
 * @param {number} keepRows - จำนวนแถวที่จะเก็บไว้ (ล่าสุด)
 */
function clearOldLogs_(logSheet, keepRows) {
  const totalRows = logSheet.getLastRow() - 1; // ไม่นับ Header
  if (totalRows <= keepRows) return;

  const schemaLen = getSheetHeaders(SHEET.SYS_LOG).length;
  const allData   = logSheet.getRange(2, 1, totalRows, schemaLen).getValues();

  // เก็บเฉพาะ keepRows แถวล่าสุด
  const keepData = allData.slice(allData.length - keepRows);

  // [FIX v5.4.001] ใช้ clearContent + setValues แทน deleteRows
  // เพื่อป้องกัน Google Sheets แวปเป็น Table format (dropdown filter ปรากฏชั่วขณะ)
  // 1. ล้างข้อมูลเก่าทั้งหมด (ไม่ลบแถว จะได้ไม่ trigger Table auto-detect)
  logSheet.getRange(2, 1, totalRows, schemaLen).clearContent();

  // 2. เขียนข้อมูลที่ต้องการเก็บกลับลงไป
  if (keepData.length > 0) {
    logSheet.getRange(2, 1, keepData.length, schemaLen)
            .setValues(keepData);
  }

  // 3. ลบแถวว่างที่เหลือ (ถ้ามี) — ทำหลังเขียนข้อมูลแล้วเพื่อลดการกระพริบ
  const remainingEmpty = totalRows - keepData.length;
  if (remainingEmpty > 0) {
    try {
      logSheet.deleteRows(2 + keepData.length, remainingEmpty);
    } catch (e) {
      // ถ้าลบไม่ได้ (แถวน้อยเกินไป) ไม่เป็นไร — แถวว่างไม่มีผลกระทบ
    }
  }

  logInfo('SetupSheets', `clearOldLogs_: เก็บ ${keepRows} แถวล่าสุด`);
}

// ============================================================
// SECTION 10: setupInputSheet_ — [NEW v5.2.014]
// ============================================================

/**
 * setupInputSheet_ — จัดโครงสร้างชีต Input เป็นฟอร์มแนวตั้ง (Vertical Form Layout)
 * A1 = "COOKIE"
 * A3 = "ShipmentNos"
 * ไม่มี frozen rows, ไม่มีหัวตาราง Row 1
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 */
function setupInputSheet_(ss) {
  let sheet = ss.getSheetByName(SHEET.INPUT);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET.INPUT);
    logInfo('SetupSheets', `สร้างชีต: ${SHEET.INPUT} (ฟอร์มแนวตั้ง)`);
  }

  // ปลดล็อกการแช่แข็งแถว (Frozen Rows) เพื่อไม่ให้ขวางฟอร์มแนวตั้ง
  if (sheet.getFrozenRows() > 0) {
    sheet.setFrozenRows(0);
  }

  // เซ็ตป้ายกำกับของเซลล์หลัก
  sheet.getRange('A1').setValue('COOKIE')
       .setFontWeight('bold')
       .setBackground('#4a86e8')
       .setFontColor('#ffffff')
       .setHorizontalAlignment('center');

  sheet.getRange('A3').setValue('ShipmentNos')
       .setFontWeight('bold')
       .setBackground('#4a86e8')
       .setFontColor('#ffffff')
       .setHorizontalAlignment('center');

  // ล้างค่าและสไตล์ของหัวตารางเดิมที่หลงเหลือหรือสร้างขึ้นมาผิดในแถวที่ 1 คอลัมน์ B และ C
  const b1Range = sheet.getRange('B1');
  const b1Val = String(b1Range.getValue()).trim();
  if (b1Val === 'Shipment_No' || b1Val === 'COOKIE') {
    b1Range.clearContent();
  }

  const c1Range = sheet.getRange('C1');
  const c1Val = String(c1Range.getValue()).trim();
  if (c1Val === 'หมายเหตุ') {
    c1Range.clearContent();
  }

  // ตรวจสอบและทำความสะอาดแถว 1 คอลัมน์ที่เหลือ
  const lastCol = Math.max(3, sheet.getLastColumn());
  for (let col = 2; col <= lastCol; col++) {
    const cell = sheet.getRange(1, col);
    const val = String(cell.getValue()).trim();
    if (val === 'Shipment_No' || val === 'หมายเหตุ') {
      cell.clearContent().setFontWeight('normal').setBackground(null).setFontColor(null);
    }
  }

  logInfo('SetupSheets', `จัดโครงสร้างฟอร์มแนวตั้งชีต Input (A1=COOKIE, A3=ShipmentNos) เรียบร้อยครับ`);
}
