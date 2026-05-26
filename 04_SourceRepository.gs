/**
 * VERSION: 5.4.001
 * FILE: 04_SourceRepository.gs
 * LMDS V5.4 — Source Data Repository
 * ===================================================
 * PURPOSE:
 *   จัดการข้อมูลต้นทาง (Source Sheet) สำหรับ Pipeline
 *   เป็น Single Entry Point สำหรับการอ่านและเขียนข้อมูลต้นฉบับ
 * ===================================================
 * CHANGELOG:
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [ADD] Comprehensive header documentation
 *   v5.4.000 (2026-05-24):
 *     - [UPGRADE] Version bump to 5.4.000
 *     - [ADD] Comprehensive header documentation
 *     - [ADD] DEPENDENCIES section with module relationships
 *     - [ENHANCE] Detailed module interconnection mapping
 *   v5.2.001 (PH2 Hardening):
 *     - [REFACTOR] Separate Load from Match Engine (No Double Processing)
 *     - [UPGRADE] updateSyncStatus_ supports SUCCESS/ERROR
 *     - [FIX] buildSourceObj_ mapping (Text Priority ready)
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config (SHEET.*, SRC_IDX.*, SCG_CONFIG.*, AI_CONFIG.*)
 *     - 02_Schema (SCHEMA[SHEET.SOURCE])
 *     - 14_Utils (normalizeInvoiceNo, parseLatLng, isValidLatLng, callSpreadsheetWithRetry)
 *   CALLS (Invokes):
 *     - normalizeInvoiceNo() → 14_Utils
 *     - parseLatLng() → 14_Utils
 *     - isValidLatLng() → 14_Utils
 *     - callSpreadsheetWithRetry() → 14_Utils
 *     - columnToLetterHelper() → (self)
 *     - logInfo/logError/logWarn/logDebug() → 03_SetupSheets
 *     - updateSyncStatus_() → (self)
 *     - processOneRow() → 10_MatchEngine
 *   EXPORTS TO:
 *     - 10_MatchEngine (getUnprocessedRows, getAllSourceRows, buildSourceObj_)
 *     - 00_App (runFullPipeline, runLoadSource)
 *   SHEETS ACCESSED:
 *     - SHEET.SOURCE (Read+Write: source data & sync status)
 *     - SHEET.FACT_DELIVERY (Read: processed invoice lookup)
 * ===================================================
 * ARCHITECTURE:
 *   Source Data Hub
 *   ┌─────────────────────────────────────────────┐
 *   │ runLoadSource                               │
 *   │   └→ invalidateCache                        │
 *   │   └→ getUnprocessedRows                     │
 *   │        └→ getAllSourceRows → buildSourceObj_ │
 *   │        └→ getProcessedInvoiceSet_            │
 *   │             └→ FACT_DELIVERY lookup          │
 *   │                                             │
 *   │ processSrcBatch_ → processOneRow             │
 *   │ updateSyncStatus_ (batch status update)      │
 *   └─────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: Constants
// ============================================================

// Cache key สำหรับ Source data
const CACHE_KEY_SOURCE   = 'SOURCE_ROWS_V3';
const CACHE_KEY_INVOICES = 'PROCESSED_INVOICES_V3';

// จำนวน columns ที่ต้องอ่านจากชีต Source
// SRC_IDX.SYNC_STATUS = 36 → ต้องอ่าน 37 columns
const SRC_READ_COLS = 37;

// ============================================================
// SECTION 2: Entry Point
// ============================================================

/**
 * runLoadSource — โหลดข้อมูลดิบจากชีต Source
 * เรียกจาก runFullPipeline() หรือ Menu
 */
function runLoadSource() {
  try {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const srcSheet = ss.getSheetByName(SHEET.SOURCE);

  if (!srcSheet) {
    logError('SourceRepo', `ไม่พบชีต: ${SHEET.SOURCE}`);
    throw new Error(`ไม่พบชีต "${SHEET.SOURCE}" กรุณาตรวจสอบชื่อชีต`);
  }

  logInfo('SourceRepo', 'เริ่มโหลด Source (Refreshing Cache)');
  invalidateSourceCache();

  const pending = getUnprocessedRows();
  logInfo('SourceRepo', `ตรวจพบแถวที่ต้องประมวลผล: ${pending.length} แถว`);
  
  if (pending.length > 0) {
    SpreadsheetApp.getActiveSpreadsheet().toast(`🚀 โหลดข้อมูลสำเร็จ: ${pending.length} แถว พร้อมประมวลผล`, APP_NAME);
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast(`✅ ข้อมูลเป็นปัจจุบันอยู่แล้ว`, APP_NAME);
  }
  } catch (err) {
    logError('SourceRepo', err.message + '\n' + err.stack);
    SpreadsheetApp.getUi().alert('เกิดข้อผิดพลาด: ' + err.message);
  }
}

// ============================================================
// SECTION 3: ดึงข้อมูล Source
// ============================================================

/**
 * getAllSourceRows — คืน Array ของ Source Objects ทั้งหมด
 * [RULE 6] CacheService ลด Read ซ้ำ
 */
function getAllSourceRows() {
  const cache  = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEY_SOURCE);

  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const srcSheet = ss.getSheetByName(SHEET.SOURCE);
  if (!srcSheet || srcSheet.getLastRow() < 2) return [];

  const colsToRead = Math.min(SRC_READ_COLS, srcSheet.getLastColumn());
  const totalRows  = srcSheet.getLastRow() - 1;
  const allData    = srcSheet.getRange(2, 1, totalRows, colsToRead)
                             .getValues();

  const result = allData
    .map((row, i) => ({ row, sourceRow: i + 2 }))
    .filter(({ row }) => row[SRC_IDX.INVOICE_NO])
    .filter(({ row }) => {
      const sync = String(row[SRC_IDX.SYNC_STATUS] || '').trim();
      return sync !== SCG_CONFIG.SYNC_DONE_VALUE;
    })
    .map(({ row, sourceRow }) => buildSourceObj_(row, sourceRow));

  // [FIX v003] logWarn เมื่อ Cache เต็ม
  try {
    cache.put(CACHE_KEY_SOURCE, JSON.stringify(result), AI_CONFIG.CACHE_TTL_SEC);
  } catch (e) {
    logWarn('SourceRepo', 'Cache เต็ม — ข้อมูล Source ใหญ่เกินกว่าจะ Cache ได้');
  }

  return result;
}

/**
 * getUnprocessedRows — ดึงเฉพาะแถวที่ยังไม่ผ่าน Match Engine
 */
function getUnprocessedRows() {
  const allRows = getAllSourceRows();
  if (allRows.length === 0) return [];
  
  const doneSet = getProcessedInvoiceSet_();
  const unprocessed = [];
  const skipped = [];
  
  allRows.forEach(row => {
    if (doneSet.has(row.invoiceNo)) {
      skipped.push(row);
    } else {
      unprocessed.push(row);
    }
  });
  
  // [UPGRADE v5.2.006] อัปเดตสถานะให้แถวที่เคยทำเสร็จแล้ว (มีใน FACT_DELIVERY) เป็น SUCCESS ทันที
  // เพื่อป้องกันไม่ให้ผู้ใช้สับสนว่าทำไมสถานะในชีต SOURCE ถึงยังว่างอยู่
  if (skipped.length > 0) {
    updateSyncStatus_(skipped, 'SUCCESS');
    logInfo('SourceRepo', `ข้าม ${skipped.length} แถวที่เคยเข้า FACT_DELIVERY ไปแล้ว (ปรับเป็น SUCCESS)`);
  }
  
  return unprocessed;
}

/**
 * getProcessedInvoiceSet_ — อ่าน Invoice ที่มีใน FACT_DELIVERY แล้ว
 */
function getProcessedInvoiceSet_() {
  const cache    = CacheService.getScriptCache();
  const cached   = cache.get(CACHE_KEY_INVOICES);
  if (cached) {
    try { return new Set(JSON.parse(cached)); } catch (e) {}
  }

  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const factSheet = ss.getSheetByName(SHEET.FACT_DELIVERY);
  const doneSet   = new Set();

  if (!factSheet || factSheet.getLastRow() < 2) return doneSet;

  const invoiceCol  = FACT_IDX.INVOICE_NO + 1;
  const lastRow     = factSheet.getLastRow() - 1;
  const invoiceData = factSheet.getRange(2, invoiceCol, lastRow, 1)
                               .getValues();

  invoiceData.forEach(r => {
    if (r[0]) doneSet.add(normalizeInvoiceNo(r[0]));
  });

  try {
    cache.put(CACHE_KEY_INVOICES, JSON.stringify([...doneSet]),
              AI_CONFIG.CACHE_TTL_SEC);
  } catch (e) {}

  return doneSet;
}

// ============================================================
// SECTION 4: Builder
// ============================================================

/**
 * buildSourceObj_ — แปลง Row Array เป็น Source Object
 */
function buildSourceObj_(row, rowNum) {
  const rawLatNum = Number(row[SRC_IDX.LAT]);
  const rawLngNum = Number(row[SRC_IDX.LNG]);

  let rawLat = (!isNaN(rawLatNum) && rawLatNum !== 0) ? rawLatNum : 0;
  let rawLng = (!isNaN(rawLngNum) && rawLngNum !== 0) ? rawLngNum : 0;

  if (rawLat === 0 || rawLng === 0) {
    const combined = String(row[SRC_IDX.LATLNG_COMBINED] || '').trim();
    if (combined) {
      const parsed = parseLatLng(combined);
      if (parsed && isValidLatLng(parsed.lat, parsed.lng)) {
        rawLat = parsed.lat;
        rawLng = parsed.lng;
      }
    }
  }

  const hasGeo = !isNaN(rawLat) && !isNaN(rawLng) &&
                 rawLat !== 0    && rawLng !== 0;

  const resolvedAddr = String(row[SRC_IDX.RESOLVED_ADDR] || '').trim();
  const rawAddr      = String(row[SRC_IDX.RAW_ADDRESS]   || '').trim();
  
  // [UPGRADE v5.2.003] ปรับปรุง Mapping ให้ตรงตามความต้องการ Fact-Checking
  // 1. rawPlaceName = RAW_ADDRESS (18) — ข้อมูลมั่วๆ จาก SCG แต่จำเป็นต้องเก็บ
  // 2. resolvedAddr = RESOLVED_ADDR (24) — ข้อมูลที่แปลงจาก LatLong เชื่อถือได้
  const scgAddr      = String(row[SRC_IDX.RAW_ADDRESS]   || '').trim();
  const sysAddr      = String(row[SRC_IDX.RESOLVED_ADDR] || '').trim();

  let deliveryDate = '';
  if (row[SRC_IDX.DELIVERY_DATE]) {
    try {
      deliveryDate = new Date(row[SRC_IDX.DELIVERY_DATE]).toISOString();
    } catch (e) {
      deliveryDate = String(row[SRC_IDX.DELIVERY_DATE]);
    }
  }

  return {
    sourceSheet:     SHEET.SOURCE,
    sourceRow:       rowNum,
    invoiceNo:       normalizeInvoiceNo(row[SRC_IDX.INVOICE_NO]),
    shipmentNo:      String(row[SRC_IDX.SHIPMENT_NO]     || '').trim(),
    deliveryDate:    deliveryDate,
    deliveryTime:    row[SRC_IDX.DELIVERY_TIME],
    driverName:      String(row[SRC_IDX.DRIVER_NAME]     || '').trim(),
    truckLicense:    String(row[SRC_IDX.TRUCK_LICENSE]   || '').trim(),
    carrierCode:     '',
    carrierName:     '',
    soldToCode:      String(row[SRC_IDX.CUSTOMER_CODE]   || '').trim(),
    soldToName:      String(row[SRC_IDX.SOLD_TO_NAME]    || '').trim(),
    rawPersonName:   String(row[SRC_IDX.RAW_PERSON_NAME] || '').trim(),
    rawPlaceName:    scgAddr,     // [FIX v5.2.003] = RAW_ADDRESS(18)
    rawAddress:      sysAddr,     // [FIX v5.2.003] = RESOLVED_ADDR(24) — ใช้เป็นฐานใน Match Engine
    scgAddress:      scgAddr,     // [NEW v5.2.003] เก็บไว้ลง FACT_DELIVERY โดยเฉพาะ
    resolvedAddr:    sysAddr,     // [KEEP]
    rawLat:          rawLat,
    rawLng:          rawLng,
    hasGeo:          hasGeo,
    warehouse:       String(row[SRC_IDX.WAREHOUSE]       || '').trim(),
    province:        '',
    sourceId:        String(row[SRC_IDX.SOURCE_ID]       || '').trim(),
    remark:          String(row[SRC_IDX.REMARK]          || '').trim(),
  };
}

// ============================================================
// SECTION 5: Batch Processor
// ============================================================

/**
 * processSrcBatch_ — ส่ง Source Batch เข้า Match Engine
 * [FIX v003] คืนค่า Batch สำหรับเขียนทีเดียว
 */
function processSrcBatch_(batch) {
  let processed = 0;
  const factBatch = [];
  const reviewBatch = [];

  batch.forEach(srcObj => {
    try {
      const result = processOneRow(srcObj);
      processed++;
      if (result.factData)   factBatch.push(result.factData);
      if (result.reviewData) reviewBatch.push(result.reviewData);
    } catch (err) {
      logError('SourceRepo',
        `processSrcBatch_ แถว ${srcObj.sourceRow} — ${err.message}`);
    }
  });
  return { processed, factBatch, reviewBatch };
}

// ============================================================
// SECTION 6: Cache Management
// ============================================================

/** invalidateSourceCache — ล้าง Cache ของ Source */
function invalidateSourceCache() {
  const cache = CacheService.getScriptCache();
  cache.remove(CACHE_KEY_SOURCE);
  cache.remove(CACHE_KEY_INVOICES);
}

/**
 * updateSyncStatus_ — [UPGRADE v5.2.001] Supports SUCCESS/ERROR
 * @param {Object[]} batchRows - รายการ sourceObj ที่ประมวลผลแล้ว
 * @param {string} status - SCG_CONFIG.SYNC_DONE_VALUE หรือ 'ERROR'
 */
function updateSyncStatus_(batchRows, status = 'SUCCESS') {
  if (!batchRows || batchRows.length === 0) return;
  
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.SOURCE);
  if (!sheet) return;

  const statusVal = (status === 'SUCCESS') ? SCG_CONFIG.SYNC_DONE_VALUE : 'ERROR';
  const statusCol = SRC_IDX.SYNC_STATUS + 1;
  const a1Notations = batchRows.map(row => {
    const colLetter = columnToLetterHelper(statusCol);
    return `${colLetter}${row.sourceRow}`;
  });

  try {
    callSpreadsheetWithRetry(() => {
      sheet.getRangeList(a1Notations).setValue(statusVal);
      // [FIX v5.2.001] ถ้าเป็น ERROR ให้ทาสีแดง
      if (status !== 'SUCCESS') {
        sheet.getRangeList(a1Notations).setBackground('#f4cccc');
      }
    });
    // [FIX v5.2.016] เคลียร์ Cache เสมอหลังจากอัปเดตสถานะ เพื่อป้องกันการเกิด Stale Cache ใน Resume Trigger
    invalidateSourceCache();
    logDebug('SourceRepo', `อัปเดต SYNC_STATUS (${statusVal}): ${batchRows.length} แถว`);
  } catch (e) {
    logError('SourceRepo', `updateSyncStatus_ ล้มเหลว: ${e.message}`);
  }
}

/** 
 * columnToLetterHelper — แปลงเลขคอลัมน์เป็นตัวอักษร (เช่น 1 -> A, 37 -> AK) 
 */
function columnToLetterHelper(column) {
  let temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}
