/**
 * VERSION: 5.4.001
 * FILE: 11_TransactionService.gs
 * LMDS V5.4 — FACT_DELIVERY Transaction Service
 * ===================================================
 * PURPOSE:
 *   จัดการตาราง FACT_DELIVERY — บันทึกประวัติการจัดส่งทั้งหมด
 *   เป็น Single Source of Truth สำหรับประวัติขนส่ง
 * ===================================================
 * CHANGELOG:
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [ADD] Comprehensive header documentation
 *   v5.4.000 (2026-05-24):
 *     - [UPGRADE] Version bump to 5.4.000
 *     - [ADD] Comprehensive header documentation
 *     - [ADD] DEPENDENCIES section with module relationships
 *     - [ENHANCE] Detailed module interconnection mapping
 *   v003 (Round 1 — Critical Fixes):
 *     - [FIX] getGeoLatLng_: คืน null แทน {lat:0,lng:0}
 *     - [FIX] upsertFactDelivery: เรียก getGeoLatLng_ ครั้งเดียว
 *     - [FIX] upsertFactDelivery: fallback ไปใช้ srcObj.rawLat/rawLng
 *     - [FIX] findFactRowByInvoice_: extract targetInvoice นอก loop
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config (SHEET.FACT_DELIVERY, SHEET.SOURCE, FACT_IDX.*, APP_CONST.*)
 *     - 02_Schema (SCHEMA)
 *     - 08_GeoService (loadAllGeos_)
 *     - 14_Utils (generateShortId, normalizeInvoiceNo)
 *     - 06_PersonService (loadAllPersons_)
 *     - 07_PlaceService (loadAllPlaces_)
 *   CALLS (Invokes):
 *     - loadAllGeos_() → 08_GeoService
 *     - generateShortId() → 14_Utils
 *     - normalizeInvoiceNo() → 14_Utils
 *     - logError() → 03_SetupSheets
 *   EXPORTS TO:
 *     - 10_MatchEngine (upsertFactDelivery)
 *     - 12_ReviewService (upsertFactDelivery)
 *   SHEETS ACCESSED:
 *     - SHEET.FACT_DELIVERY (Read+Write: delivery transaction records)
 *     - SHEET.SOURCE (Read: source data reference)
 * ===================================================
 * ARCHITECTURE:
 *   Transaction Writer
 *   ┌──────────────────────────────────┐
 *   │  upsertFactDelivery              │
 *   │  ├─ INSERT: new row with TX ID   │
 *   │  └─ UPDATE: merge into existing  │
 *   │  findFactRowByInvoice_           │
 *   │  └─ TextFinder batch lookup      │
 *   │  getGeoLatLng_                   │
 *   │  └─ fetch lat/lng from Geo cache │
 *   │  formatTimeValue_                │
 *   │  └─ time formatting helper       │
 *   └──────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: upsertFactDelivery
// ============================================================

/**
 * upsertFactDelivery — สร้างหรืออัปเดต FACT_DELIVERY
 * [FIX v003] เรียก getGeoLatLng_ ครั้งเดียว + fallback to rawLat/rawLng
 */
function upsertFactDelivery(srcObj, personId, placeId, geoId, destId, decision) {
  const ss         = SpreadsheetApp.getActiveSpreadsheet();
  const factSheet  = ss.getSheetByName(SHEET.FACT_DELIVERY);
  if (!factSheet) {
    logError('TransactionService', `ไม่พบชีต ${SHEET.FACT_DELIVERY}`);
    return null;
  }

  const existingRow = findFactRowByInvoice_(factSheet, srcObj.invoiceNo);
  const now         = new Date();
  const txId        = existingRow > 0 ? null : generateShortId('TX');

  // [FIX v003] เรียก getGeoLatLng_ ครั้งเดียว แล้ว destructure
  let resolvedLat = 0;
  let resolvedLng = 0;

  if (geoId) {
    const geoLL = getGeoLatLng_(geoId);
    if (geoLL) {
      resolvedLat = geoLL.lat;
      resolvedLng = geoLL.lng;
    }
  }

  // [FIX v003] fallback → rawLat/rawLng ถ้า getGeoLatLng_ คืน null
  if (resolvedLat === 0 || resolvedLng === 0) {
    if (srcObj.rawLat && srcObj.rawLng &&
        !isNaN(Number(srcObj.rawLat)) && !isNaN(Number(srcObj.rawLng))) {
      resolvedLat = Number(srcObj.rawLat);
      resolvedLng = Number(srcObj.rawLng);
    }
  }

  // แยก deliveryDate/deliveryTime
  let deliveryDateVal = '';
  let deliveryTimeVal = '';
  if (srcObj.deliveryTime) {
    deliveryTimeVal = formatTimeValue_(srcObj.deliveryTime);
  }

  if (srcObj.deliveryDate) {
    try {
      deliveryDateVal = new Date(srcObj.deliveryDate);
    } catch (e) {
      deliveryDateVal = srcObj.deliveryDate;
    }
  }

  if (existingRow > 0) {
    // --- UPDATE ---
    const rowRange = factSheet.getRange(existingRow, 1, 1,
                      SCHEMA[SHEET.FACT_DELIVERY].length);
    const rowData  = rowRange.getValues()[0];

    rowData[FACT_IDX.PERSON_ID]    = personId  || rowData[FACT_IDX.PERSON_ID];
    rowData[FACT_IDX.PLACE_ID]     = placeId   || rowData[FACT_IDX.PLACE_ID];
    rowData[FACT_IDX.GEO_ID]       = geoId     || rowData[FACT_IDX.GEO_ID];
    rowData[FACT_IDX.DEST_ID]      = destId    || rowData[FACT_IDX.DEST_ID];
    rowData[FACT_IDX.RESOLVED_LAT] = resolvedLat || rowData[FACT_IDX.RESOLVED_LAT];
    rowData[FACT_IDX.RESOLVED_LNG] = resolvedLng || rowData[FACT_IDX.RESOLVED_LNG];
    rowData[FACT_IDX.MATCH_STATUS] = decision.action  || rowData[FACT_IDX.MATCH_STATUS];
    rowData[FACT_IDX.MATCH_CONF]   = decision.confidence;
    rowData[FACT_IDX.MATCH_REASON] = decision.reason  || '';
    rowData[FACT_IDX.MATCH_ACTION] = decision.action  || '';
    rowData[FACT_IDX.UPDATED_AT]   = now;
    rowData[FACT_IDX.EVIDENCE]     = decision.evidence || rowData[FACT_IDX.EVIDENCE] || '';

    rowRange.setValues([rowData]);
    return { txId: rowData[FACT_IDX.TX_ID], isNew: false, rowData: null };

  } else {
    // --- INSERT ---
    const newRow = new Array(SCHEMA[SHEET.FACT_DELIVERY].length).fill('');

    newRow[FACT_IDX.TX_ID]          = txId;
    newRow[FACT_IDX.SOURCE_SHEET]   = srcObj.sourceSheet   || SHEET.SOURCE;
    newRow[FACT_IDX.SOURCE_ROW]     = srcObj.sourceRow     || 0;
    newRow[FACT_IDX.SOURCE_REC_ID]  = srcObj.sourceId      || '';
    newRow[FACT_IDX.DELIVERY_DATE]  = deliveryDateVal;
    newRow[FACT_IDX.DELIVERY_TIME]  = deliveryTimeVal;
    newRow[FACT_IDX.INVOICE_NO]     = srcObj.invoiceNo     || '';
    newRow[FACT_IDX.SHIPMENT_NO]    = srcObj.shipmentNo    || '';
    newRow[FACT_IDX.DRIVER_NAME]    = srcObj.driverName    || '';
    newRow[FACT_IDX.TRUCK_LICENSE]  = srcObj.truckLicense  || '';
    newRow[FACT_IDX.SOLD_TO_CODE]   = srcObj.soldToCode    || '';
    newRow[FACT_IDX.SOLD_TO_NAME]   = srcObj.soldToName    || '';
    newRow[FACT_IDX.SHIP_TO_NAME]   = srcObj.rawPersonName || '';
    newRow[FACT_IDX.SHIP_TO_ADDR]   = srcObj.scgAddress    || ''; // [FIX v5.2.003] ใช้ต้นฉบับจาก SCG (คอลัมน์ 18)
    newRow[FACT_IDX.GEO_RESOLVED_ADDR] = srcObj.resolvedAddr || ''; // [FIX v5.2.003] ใช้ที่อยู่ที่ระบบหาได้ (คอลัมน์ 24)
    newRow[FACT_IDX.PERSON_ID]      = personId             || '';
    newRow[FACT_IDX.PLACE_ID]       = placeId              || '';
    newRow[FACT_IDX.GEO_ID]         = geoId                || '';
    newRow[FACT_IDX.DEST_ID]        = destId               || '';
    newRow[FACT_IDX.WAREHOUSE]      = srcObj.warehouse     || '';
    newRow[FACT_IDX.RAW_LAT]        = srcObj.rawLat        || 0;
    newRow[FACT_IDX.RAW_LNG]        = srcObj.rawLng        || 0;
    newRow[FACT_IDX.MATCH_STATUS]   = decision.action      || '';
    newRow[FACT_IDX.MATCH_CONF]     = decision.confidence  || 0;
    newRow[FACT_IDX.MATCH_REASON]   = decision.reason      || '';
    newRow[FACT_IDX.MATCH_ACTION]   = decision.action      || '';
    newRow[FACT_IDX.RESOLVED_LAT]   = resolvedLat;
    newRow[FACT_IDX.RESOLVED_LNG]   = resolvedLng;
    newRow[FACT_IDX.CREATED_AT]     = now;
    newRow[FACT_IDX.UPDATED_AT]     = now;
    newRow[FACT_IDX.RECORD_STATUS]  = APP_CONST.STATUS_ACTIVE;
    newRow[FACT_IDX.EVIDENCE]       = decision.evidence || '';

    // [RULE 4] คืนค่าแถวเพื่อให้ caller ทำ batch write แทน appendRow ในลูป
    return { txId: txId, isNew: true, rowData: newRow };
  }
}

// ============================================================
// SECTION 2: Helper Functions
// ============================================================

/**
 * findFactRowByInvoice_ — ค้นหาแถวใน FACT_DELIVERY จาก Invoice No
 * [FIX v003] extract targetInvoice นอก loop แทนแปลงทุก iteration
 * @return {number} หมายเลขแถว (1-based) หรือ -1 ถ้าไม่พบ
 */
function findFactRowByInvoice_(factSheet, invoiceNo) {
  if (!invoiceNo || factSheet.getLastRow() < 2) return -1;

  // [FIX v5.2.016] ใช้ normalizeInvoiceNo เพื่อความแม่นยำ 100%
  const targetInvoice = normalizeInvoiceNo(invoiceNo);

  const invoiceCol = FACT_IDX.INVOICE_NO + 1;
  const lastRow    = factSheet.getLastRow() - 1;
  const data       = factSheet.getRange(2, invoiceCol, lastRow, 1)
                               .getValues();

  for (let i = 0; i < data.length; i++) {
    if (normalizeInvoiceNo(data[i][0]) === targetInvoice) {
      return i + 2;
    }
  }
  return -1;
}

/**
 * getGeoLatLng_ — ดึง lat/lng จาก M_GEO_POINT
 * [FIX v003] คืน null แทน {lat:0,lng:0} เมื่อไม่เจอ
 *            ป้องกัน Marker ตกทะเล (0,0)
 * @param {string} geoId
 * @return {{ lat: number, lng: number } | null}
 */
function getGeoLatLng_(geoId) {
  if (!geoId) return null;

  const allGeos = loadAllGeos_();
  const geo     = allGeos.find(g => g.geoId === geoId);

  // [FIX v003] คืน null ถ้าไม่เจอ หรือ lat/lng = 0
  if (!geo || geo.lat === 0 || geo.lng === 0) return null;
  return { lat: geo.lat, lng: geo.lng };
}

/**
 * formatTimeValue_ — [ADD v008] จัดรูปแบบเวลาให้ไม่ติดปี 1899
 */
function formatTimeValue_(timeVal) {
  if (!timeVal) return '';
  
  // 1. ถ้าเป็น Date object ให้ Format เป็นเวลาทันที
  if (timeVal instanceof Date) {
    return Utilities.formatDate(timeVal, Session.getScriptTimeZone(), 'HH:mm:ss');
  }

  // 2. ถ้าเป็น String ให้ลองเช็คว่ามีรูปแบบวันที่ติดมาไหม
  let timeStr = String(timeVal).trim();
  if (timeStr.includes('1899')) {
    // ถ้าเจอปี 1899 ให้พยายามตัดเอาเฉพาะส่วนเวลา (ปกติจะเป็นส่วนท้าย)
    const match = timeStr.match(/\d{2}:\d{2}:\d{2}/);
    if (match) return match[0];
  }

  return timeStr;
}
