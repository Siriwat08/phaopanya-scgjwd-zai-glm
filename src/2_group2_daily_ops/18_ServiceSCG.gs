/**
 * VERSION: 5.4.001
 * FILE: 18_ServiceSCG.gs
 * LMDS V5.4 — SCG API Service (Group 2 Commander)
 * ===================================================
 * PURPOSE:
 *   ดึงข้อมูลการจัดส่งจาก SCG API → เขียนลงตารางงานประจำวัน
 *   แล้วเรียก Module 17 จับคู่พิกัด พร้อมสร้างสรุปเจ้าของสินค้า/Shipment
 *   เป็น Commander ของ Group 2 (Daily Ops)
 * ===================================================
 * CHANGELOG:
 *   v5.4.002 (2026-05-26) — Single Writer Fix:
 *     - [REMOVE] fetchDataFromSCGJWD: ลบ populateAliasFromSCGRawData_() — Group 2 ห้ามเขียน M_ALIAS
 *     - [FIX] Hardcode index: แทนที่ r[28], r[14], r[16], r[2], r[9] ด้วย DATA_IDX.*
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [ADD] fetchDataFromSCGJWD: เรียก populateAliasFromSCGRawData_ หลัง applyMasterCoordinatesToDailyJob
 *   v5.4.000 (2026-05-23):
 *     - [UPGRADE] Version bump to 5.4.000
 *   v5.2.012:
 *     - [REVERT] กู้คืน fetchDataFromSCGJWD() เป็นแบบ Batch ตามข้อกำหนดของผู้ใช้
 *     - [PRESERVE] รักษาการเรียก runLookupEnrichment() ของ Module 17
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config.gs          (SHEET.DAILY_JOB, SCG_CONFIG, APP_CONST, DATA_IDX)
 *     - 02_Schema.gs          (SCHEMA[SHEET.DAILY_JOB])
 *     - 03_SetupSheets.gs     (logInfo, logWarn, logError)
 *   CALLS (Invokes):
 *     - applyMasterCoordinatesToDailyJob() → 18_ServiceSCG.gs (self — calls Module 17)
 *     - runLookupEnrichment()              → 17_SearchService.gs
 *     - [REMOVED v5.4.002] populateAliasFromSCGRawData_() → ย้ายไปเป็น Migration/Admin เท่านั้น
 *   EXPORTS TO:
 *     - 00_App.gs             (fetchDataFromSCGJWD, applyMasterCoordinatesToDailyJob, clearAllSCGSheets_UI)
 *   SHEETS ACCESSED:
 *     - SHEET.DAILY_JOB       (Read+Write: SCG API data + aggregated columns)
 *     - SHEET.INPUT           (Read: Cookie + Shipment numbers)
 *     - SHEET.EMPLOYEE        (Read: Employee data)
 *     - SHEET.OWNER_SUMMARY   (Write: สรุปเจ้าของสินค้า)
 *     - SHEET.SHIPMENT_SUM    (Write: สรุป_Shipment)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  18_ServiceSCG.gs (Group 2 Commander — SCG Data Pipeline)   │
 *   │  ├── fetchDataFromSCGJWD() — SCG API → Daily Job Sheet     │
 *   │  │   ├── 1. อ่าน Cookie + ShipmentNos จากชีต Input          │
 *   │  │   ├── 2. เรียก SCG API (fetchWithRetry_)                  │
 *   │  │   ├── 3. แปลง JSON → Flat rows + aggregate               │
 *   │  │   ├── 4. applyMasterCoordinatesToDailyJob() → Module 17  │
 *   │  │   ├── 5. populateAliasFromSCGRawData_() → Module 21      │
 *   │  │   ├── 6. buildOwnerSummary()                              │
 *   │  │   └── 7. buildShipmentSummary()                           │
 *   │  ├── fetchWithRetry_() — HTTP retry with exponential backoff│
 *   │  ├── checkIsEPOD() — E-POD eligibility per owner            │
 *   │  ├── buildOwnerSummary() — สรุปเจ้าของสินค้า               │
 *   │  ├── buildShipmentSummary() — สรุป_Shipment                 │
 *   │  ├── clearAllSCGSheets_UI() — ล้างข้อมูลทั้งหมด             │
 *   │  └── clearDailyJobLatLng() — ล้างเฉพาะพิกัด                 │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: fetchDataFromSCGJWD — ดึงข้อมูลจาก SCG API (Batch)
// ============================================================

function fetchDataFromSCGJWD() {  
  const ss = SpreadsheetApp.getActiveSpreadsheet();  
  const ui = SpreadsheetApp.getUi();

  const lock = LockService.getScriptLock();  
  if (!lock.tryLock(10000)) {  
    ui.alert("⚠️ ระบบคิวทำงาน", "มีผู้ใช้งานอื่นกำลังโหลดข้อมูล Shipment อยู่ กรุณารอสักครู่", ui.ButtonSet.OK);  
    return;  
  }

  try {  
    const inputSheet = ss.getSheetByName(SCG_CONFIG.SHEET_INPUT);  
    const dataSheet = ss.getSheetByName(SCG_CONFIG.SHEET_DATA);  
    if (!inputSheet || !dataSheet) throw new Error("CRITICAL: ไม่พบชีต Input หรือ Data");

    const cookie = String(inputSheet.getRange(SCG_CONFIG.COOKIE_CELL).getValue() || '').trim();  
    if (!cookie) throw new Error("❌ กรุณาวาง Cookie ในช่อง " + SCG_CONFIG.COOKIE_CELL);

    const lastRow = inputSheet.getLastRow();  
    if (lastRow < SCG_CONFIG.INPUT_START_ROW) throw new Error("ℹ️ ไม่พบเลข Shipment ในชีต Input");

    const shipmentNumbers = inputSheet  
      .getRange(SCG_CONFIG.INPUT_START_ROW, 1, lastRow - SCG_CONFIG.INPUT_START_ROW + 1, 1)  
      .getValues().flat().map(r => String(r || '').trim()).filter(Boolean);

    if (shipmentNumbers.length === 0) throw new Error("ℹ️ รายการ Shipment ว่างเปล่า");

    // [REVERT] เขียนเลข Shipment ต่อกันคั่นด้วยจุลภาคลงในช่อง B3
    const shipmentString = shipmentNumbers.join(',');  
    inputSheet.getRange(SCG_CONFIG.SHIPMENT_STRING_CELL).setValue(shipmentString).setHorizontalAlignment("left");

    // [REVERT] payload ส่งแบบฟอร์ม urlencoded ตามความต้องการของ API ของ SCG
    const payload = {  
      DeliveryDateFrom: '', DeliveryDateTo: '', TenderDateFrom: '', TenderDateTo: '',  
      CarrierCode: '', CustomerCode: '', OriginCodes: '', ShipmentNos: shipmentString  
    };

    const options = {  
      method: 'post', payload: payload, muteHttpExceptions: true, headers: { cookie: cookie }  
    };

    ss.toast("กำลังเชื่อมต่อ SCG Server...", "System", 10);  
    console.log(`[SCG API] Fetching data for ${shipmentNumbers.length} shipments.`);  
    const responseText = fetchWithRetry_(SCG_CONFIG.API_URL, options, (APP_CONST.MAX_RETRIES || 3));

    const json = JSON.parse(responseText);  
    const shipments = json.data || [];

    if (shipments.length === 0) throw new Error("API Return Success แต่ไม่พบข้อมูล Shipment (Data Empty)");

    ss.toast("กำลังแปลงข้อมูล " + shipments.length + " Shipments...", "Processing", 5);  
    const allFlatData = [];  
    let runningRow = 2;

    shipments.forEach(shipment => {  
      const destSet = new Set();  
      (shipment.DeliveryNotes || []).forEach(n => { if (n.ShipToName) destSet.add(n.ShipToName); });  
      const destListStr = Array.from(destSet).join(", ");

      (shipment.DeliveryNotes || []).forEach(note => {  
        (note.Items || []).forEach(item => {  
          const dailyJobId = note.PurchaseOrder + "-" + runningRow;  
          const row = [  
            dailyJobId,  
            note.PlanDelivery ? new Date(note.PlanDelivery) : null,  
            String(note.PurchaseOrder || ''),  
            String(shipment.ShipmentNo || ''),  
            shipment.DriverName || '',  
            shipment.TruckLicense || '',  
            String(shipment.CarrierCode || ''),  
            shipment.CarrierName || '',  
            String(note.SoldToCode || ''),  
            note.SoldToName || '',  
            note.ShipToName || '',  
            note.ShipToAddress || '',  
            (note.ShipToLatitude != null && note.ShipToLongitude != null) ? (note.ShipToLatitude + ", " + note.ShipToLongitude) : '',  
            item.MaterialName || '',  
            item.ItemQuantity || 0,  
            item.QuantityUnit || '',  
            item.ItemWeight || 0,  
            String(note.DeliveryNo || ''),  
            destSet.size,  
            destListStr,  
            "รอสแกน",  
            "ยังไม่ได้ส่ง",  
            "",  
            0, 0, 0,  
            "",  
            "",  
            (shipment.ShipmentNo || '') + "|" + (note.ShipToName || '')  
          ];  
          allFlatData.push(row);  
          runningRow++;  
        });  
      });  
    });

    // [FIX v5.4.002] แทนที่ hardcode index ด้วย DATA_IDX.*
    const shopAgg = {};  
    allFlatData.forEach(r => {  
      const key = r[DATA_IDX.SHOP_KEY];
      if (!shopAgg[key]) shopAgg[key] = { qty: 0, weight: 0, invoices: new Set(), epod: 0 };  
      shopAgg[key].qty += Number(r[DATA_IDX.QTY]) || 0;  
      shopAgg[key].weight += Number(r[DATA_IDX.WEIGHT]) || 0;  
      shopAgg[key].invoices.add(r[DATA_IDX.INVOICE_NO]);  
      if (checkIsEPOD(r[DATA_IDX.SOLD_TO_NAME], r[DATA_IDX.INVOICE_NO])) shopAgg[key].epod++;  
    });

    // [FIX v5.4.002] แทนที่ hardcode index ด้วย DATA_IDX.*
    allFlatData.forEach(r => {  
      const agg = shopAgg[r[DATA_IDX.SHOP_KEY]];  
      const scanInv = agg.invoices.size - agg.epod;  
      r[DATA_IDX.TOT_QTY] = agg.qty;  
      r[DATA_IDX.TOT_WEIGHT] = Number(agg.weight.toFixed(2));  
      r[DATA_IDX.SCAN_INV] = scanInv;  
      r[DATA_IDX.OWNER_LABEL] = `${r[DATA_IDX.SOLD_TO_NAME]} / รวม ${scanInv} บิล`;  
    });

    const headers = [  
      "ID_งานประจำวัน", "PlanDelivery", "InvoiceNo", "ShipmentNo", "DriverName",  
      "TruckLicense", "CarrierCode", "CarrierName", "SoldToCode", "SoldToName",  
      "ShipToName", "ShipToAddress", "LatLong_SCG", "MaterialName", "ItemQuantity",  
      "QuantityUnit", "ItemWeight", "DeliveryNo", "จำนวนปลายทาง_System", "รายชื่อปลายทาง_System",  
      "ScanStatus", "DeliveryStatus", "Email พนักงาน",  
      "จำนวนสินค้ารวมของร้านนี้", "น้ำหนักสินค้ารวมของร้านนี้", "จำนวน_Invoice_ที่ต้องสแกน",  
      "LatLong_Actual", "ชื่อเจ้าของสินค้า_Invoice_ที่ต้องสแกน", "ShopKey"  
    ];

    dataSheet.clear();  
    dataSheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");

    if (allFlatData.length > 0) {  
      dataSheet.getRange(2, 1, allFlatData.length, headers.length).setValues(allFlatData);  
      dataSheet.getRange(2, DATA_IDX.PLAN_DELIVERY + 1, allFlatData.length, 1).setNumberFormat("dd/mm/yyyy");  
      dataSheet.getRange(2, DATA_IDX.INVOICE_NO + 1, allFlatData.length, 1).setNumberFormat("@");  
      dataSheet.getRange(2, DATA_IDX.DELIVERY_NO + 1, allFlatData.length, 1).setNumberFormat("@");  
    }

    applyMasterCoordinatesToDailyJob();  

    // [REMOVED v5.4.002] populateAliasFromSCGRawData_() ถูกลบออกจาก Group 2 Pipeline
    // เหตุผล: M_ALIAS เป็น Single Writer — เขียนที่ autoEnrichAliasesFromFactBatch_() (Module 10) เท่านั้น
    // Group 2 (Daily Ops) ทำหน้าที่ "อ่าน" M_ALIAS เพื่อค้นหาพิกัด (fastLookupByShipToName)
    // ห้าม Group 2 "เขียน" M_ALIAS เด็ดขาด — เป็นการละเมิด Single Writer Pattern
    // หากต้องการดึงชื่อจาก SCG ดิบ → M_ALIAS ให้ใช้เมนู: ระบบ > ดึงชื่อจาก SCG ดิบ → M_ALIAS

    buildOwnerSummary();  
    buildShipmentSummary();

    console.log(`[SCG API] Successfully imported ${allFlatData.length} records.`);  
    ui.alert(`✅ ดึงข้อมูลสำเร็จ!\n- จำนวนรายการ: ${allFlatData.length} แถว\n- จับคู่พิกัด: เรียบร้อย`);

  } catch (e) {  
    console.error("[SCG API Error]: " + e.message);  
    ui.alert("❌ เกิดข้อผิดพลาด: " + e.message);  
  } finally {  
    lock.releaseLock();  
  }  
}

// ============================================================
// SECTION 2: fetchWithRetry_ — ดึงข้อมูลพร้อมกลไก Retry
// ============================================================

function fetchWithRetry_(url, options, maxRetries) {  
  for (let i = 0; i < maxRetries; i++) {  
    try {  
      const response = UrlFetchApp.fetch(url, options);  
      if (response.getResponseCode() === 200) return response.getContentText();  
      throw new Error("HTTP " + response.getResponseCode() + ": " + response.getContentText());  
    } catch (e) {  
      if (i === maxRetries - 1) throw e;  
      Utilities.sleep(1000 * Math.pow(2, i));  
      console.warn(`[SCG API] Retry attempt ${i + 1} failed. Retrying...`);  
    }  
  }  
}

// ============================================================
// SECTION 3: checkIsEPOD — ตรวจสอบ E-POD ตามเงื่อนไขเจ้าของงาน
// ============================================================

function checkIsEPOD(ownerName, invoiceNo) {  
  if (!ownerName || !invoiceNo) return false;  
  const owner = String(ownerName).toUpperCase();  
  const inv = String(invoiceNo);

  const epodOwners = ["BETTERBE", "SCG EXPRESS", "เบทเตอร์แลนด์", "JWD TRANSPORT"];  
  if (epodOwners.some(w => owner.includes(w.toUpperCase()))) return true;

  if (owner.includes("DENSO") || owner.includes("เด็นโซ่")) {  
    if (inv.includes("_DOC")) return false;  
    if (/^\d+(-.*)?$/.test(inv)) return true;  
    return false;  
  }

  return false;  
}

// ============================================================
// SECTION 4: applyMasterCoordinatesToDailyJob
// ============================================================

/**
 * applyMasterCoordinatesToDailyJob
 * เรียก runLookupEnrichment จาก 17_SearchService.gs
 */
function applyMasterCoordinatesToDailyJob() {
  try {
  logInfo('ServiceSCG', 'applyMasterCoordinates → เรียก Module 17');
  runLookupEnrichment();
  logInfo('ServiceSCG', 'applyMasterCoordinates เสร็จสิ้น');
  } catch (err) {
    logError('ServiceSCG', err.message + '\n' + err.stack);
    SpreadsheetApp.getUi().alert('เกิดข้อผิดพลาด: ' + err.message);
  }
}

// ============================================================
// SECTION 5: buildOwnerSummary
// ============================================================

function buildOwnerSummary() {  
  const ss        = SpreadsheetApp.getActiveSpreadsheet();  
  const dataSheet = ss.getSheetByName(SCG_CONFIG.SHEET_DATA);  
  if (!dataSheet || dataSheet.getLastRow() < 2) return;

  const data     = dataSheet.getRange(2, 1, dataSheet.getLastRow() - 1, SCHEMA[SHEET.DAILY_JOB].length).getValues();  
  const ownerMap = {};

  data.forEach(r => {  
    const ownerName = r[DATA_IDX.SOLD_TO_NAME];  
    const invoiceNo = r[DATA_IDX.INVOICE_NO];  
    if (!ownerName) return;  
    if (!ownerMap[ownerName]) ownerMap[ownerName] = { all: new Set(), epod: new Set() };  
    if (!invoiceNo) return;  
    if (checkIsEPOD(ownerName, invoiceNo)) {  
      ownerMap[ownerName].epod.add(invoiceNo);  
    } else {  
      ownerMap[ownerName].all.add(invoiceNo);  
    }  
  });

  const summarySheet = ss.getSheetByName("สรุป_เจ้าของสินค้า");  
  if (!summarySheet) { SpreadsheetApp.getUi().alert("❌ ไม่พบชีต สรุป_เจ้าของสินค้า"); return; }

  const summaryLastRow = summarySheet.getLastRow();  
  if (summaryLastRow > 1) summarySheet.getRange(2, 1, summaryLastRow - 1, 6).clearContent().setBackground(null);

  const rows = [];  
  Object.keys(ownerMap).sort().forEach(owner => {  
    const o = ownerMap[owner];  
    rows.push(["", owner, "", o.all.size, o.epod.size, new Date()]);  
  });

  if (rows.length > 0) {  
    summarySheet.getRange(2, 1, rows.length, 6).setValues(rows);  
    summarySheet.getRange(2, 4, rows.length, 2).setNumberFormat("#,##0");  
    summarySheet.getRange(2, 6, rows.length, 1).setNumberFormat("dd/mm/yyyy HH:mm");  
  }  
}

// ============================================================
// SECTION 6: buildShipmentSummary
// ============================================================

function buildShipmentSummary() {  
  const ss        = SpreadsheetApp.getActiveSpreadsheet();  
  const dataSheet = ss.getSheetByName(SCG_CONFIG.SHEET_DATA);  
  if (!dataSheet || dataSheet.getLastRow() < 2) return;

  const data        = dataSheet.getRange(2, 1, dataSheet.getLastRow() - 1, SCHEMA[SHEET.DAILY_JOB].length).getValues();  
  const shipmentMap = {};

  data.forEach(r => {  
    const shipmentNo = r[DATA_IDX.SHIPMENT_NO];  
    const truckLicense = r[DATA_IDX.TRUCK_LICENSE];  
    const soldToName = r[DATA_IDX.SOLD_TO_NAME];  
    const invoiceNo = r[DATA_IDX.INVOICE_NO];  
    if (!shipmentNo || !truckLicense) return;  
    const key = shipmentNo + "_" + truckLicense;  
    if (!shipmentMap[key]) {  
      shipmentMap[key] = { shipmentNo: shipmentNo, truck: truckLicense, all: new Set(), epod: new Set() };  
    }  
    if (!invoiceNo) return;  
    if (checkIsEPOD(soldToName, invoiceNo)) {  
      shipmentMap[key].epod.add(invoiceNo);  
    } else {  
      shipmentMap[key].all.add(invoiceNo);  
    }  
  });

  const summarySheet = ss.getSheetByName("สรุป_Shipment");  
  if (!summarySheet) { SpreadsheetApp.getUi().alert("❌ ไม่พบชีต สรุป_Shipment"); return; }

  const summaryLastRow = summarySheet.getLastRow();  
  if (summaryLastRow > 1) summarySheet.getRange(2, 1, summaryLastRow - 1, 7).clearContent().setBackground(null);

  const rows = [];  
  Object.keys(shipmentMap).sort().forEach(key => {  
    const s = shipmentMap[key];  
    rows.push([key, s.shipmentNo, s.truck, "", s.all.size, s.epod.size, new Date()]);  
  });

  if (rows.length > 0) {  
    summarySheet.getRange(2, 1, rows.length, 7).setValues(rows);  
    summarySheet.getRange(2, 5, rows.length, 2).setNumberFormat("#,##0");  
    summarySheet.getRange(2, 7, rows.length, 1).setNumberFormat("dd/mm/yyyy HH:mm");  
  }  
}

// ============================================================
// SECTION 7: Clear Functions
// ============================================================

function clearAllSCGSheets_UI() {
  const ui = SpreadsheetApp.getUi();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('🗑️ กำลังล้างข้อมูลชีตที่เลือก...', APP_NAME, -1);

  let   cleared = 0;

  [SHEET.DAILY_JOB, SHEET.OWNER_SUMMARY, SHEET.SHIPMENT_SUM].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet && sheet.getLastRow() > 1) {
      sheet.deleteRows(2, sheet.getLastRow() - 1);
      cleared++;
    }
  });

  logInfo('ServiceSCG', `clearAllSCGSheets_UI: ล้าง ${cleared} ชีต`);
  ui.alert(`✅ ล้างข้อมูล ${cleared} ชีตเรียบร้อย`);
}

function clearDailyJobLatLng() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.DAILY_JOB);
  if (!sheet || sheet.getLastRow() < 2) return;

  const totalRows    = sheet.getLastRow() - 1;
  const latActualCol = DATA_IDX.LATLNG_ACTUAL + 1;

  sheet.getRange(2, latActualCol, totalRows, 1).clearContent();
  sheet.getRange(2, 1, totalRows, SCHEMA[SHEET.DAILY_JOB].length)
       .setBackground(null);

  logInfo('ServiceSCG', `clearDailyJobLatLng: ล้าง ${totalRows} แถว`);
}
