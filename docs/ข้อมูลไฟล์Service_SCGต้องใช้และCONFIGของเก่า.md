/\*\*  
 \* VERSION : 000  
 \* 📦 Service: SCG Operation (Enterprise Edition)  
 \* Version: 5.0 ScanDocs \+ Summary Readiness  
 \* \---------------------------------------------------------  
 \* \[PRESERVED v4.0\]: API Retry Mechanism, LockService, Smart Branch Matching  
 \* \[PRESERVED v4.0\]: AI NameMapping schema (Variant \-\> Master\_UID \-\> Coordinates)  
 \* \[UPDATED v5.0\]: checkIsEPOD() — Logic ใหม่รองรับ Invoice ทุกช่วงตัวเลข  
 \* \[UPDATED v5.0\]: buildOwnerSummary() — เพิ่ม จำนวน\_E-POD\_ทั้งหมด  
 \* \[ADDED v5.0\]: buildShipmentSummary() — สรุปตาม Shipment+TruckLicense  
 \* \[ADDED v5.0\]: clearShipmentSummarySheet() \+ UI  
 \* \[UPDATED v5.0\]: clearAllSCGSheets\_UI() — ล้าง 4 ชีต  
 \* Author: Elite Logistics Architect  
 \*/

// \==========================================  
// 1\. MAIN OPERATION: FETCH DATA  
// \==========================================

function fetchDataFromSCGJWD() {  
  const ss \= SpreadsheetApp.getActiveSpreadsheet();  
  const ui \= SpreadsheetApp.getUi();

  const lock \= LockService.getScriptLock();  
  if (\!lock.tryLock(10000)) {  
    ui.alert("⚠️ ระบบคิวทำงาน", "มีผู้ใช้งานอื่นกำลังโหลดข้อมูล Shipment อยู่ กรุณารอสักครู่", ui.ButtonSet.OK);  
    return;  
  }

  try {  
    const inputSheet \= ss.getSheetByName(SCG\_CONFIG.SHEET\_INPUT);  
    const dataSheet \= ss.getSheetByName(SCG\_CONFIG.SHEET\_DATA);  
    if (\!inputSheet || \!dataSheet) throw new Error("CRITICAL: ไม่พบชีต Input หรือ Data");

    const cookie \= inputSheet.getRange(SCG\_CONFIG.COOKIE\_CELL).getValue();  
    if (\!cookie) throw new Error("❌ กรุณาวาง Cookie ในช่อง " \+ SCG\_CONFIG.COOKIE\_CELL);

    const lastRow \= inputSheet.getLastRow();  
    if (lastRow \< SCG\_CONFIG.INPUT\_START\_ROW) throw new Error("ℹ️ ไม่พบเลข Shipment ในชีต Input");

    const shipmentNumbers \= inputSheet  
      .getRange(SCG\_CONFIG.INPUT\_START\_ROW, 1, lastRow \- SCG\_CONFIG.INPUT\_START\_ROW \+ 1, 1\)  
      .getValues().flat().filter(String);

    if (shipmentNumbers.length \=== 0\) throw new Error("ℹ️ รายการ Shipment ว่างเปล่า");

    const shipmentString \= shipmentNumbers.join(',');  
    inputSheet.getRange(SCG\_CONFIG.SHIPMENT\_STRING\_CELL).setValue(shipmentString).setHorizontalAlignment("left");

    const payload \= {  
      DeliveryDateFrom: '', DeliveryDateTo: '', TenderDateFrom: '', TenderDateTo: '',  
      CarrierCode: '', CustomerCode: '', OriginCodes: '', ShipmentNos: shipmentString  
    };

    const options \= {  
      method: 'post', payload: payload, muteHttpExceptions: true, headers: { cookie: cookie }  
    };

    ss.toast("กำลังเชื่อมต่อ SCG Server...", "System", 10);  
    console.log(\`\[SCG API\] Fetching data for ${shipmentNumbers.length} shipments.\`);  
    const responseText \= fetchWithRetry\_(SCG\_CONFIG.API\_URL, options, (CONFIG.API\_MAX\_RETRIES || 3));

    const json \= JSON.parse(responseText);  
    const shipments \= json.data || \[\];

    if (shipments.length \=== 0\) throw new Error("API Return Success แต่ไม่พบข้อมูล Shipment (Data Empty)");

    ss.toast("กำลังแปลงข้อมูล " \+ shipments.length \+ " Shipments...", "Processing", 5);  
    const allFlatData \= \[\];  
    let runningRow \= 2;

    shipments.forEach(shipment \=\> {  
      const destSet \= new Set();  
      (shipment.DeliveryNotes || \[\]).forEach(n \=\> { if (n.ShipToName) destSet.add(n.ShipToName); });  
      const destListStr \= Array.from(destSet).join(", ");

      (shipment.DeliveryNotes || \[\]).forEach(note \=\> {  
        (note.Items || \[\]).forEach(item \=\> {  
          const dailyJobId \= note.PurchaseOrder \+ "-" \+ runningRow;  
          const row \= \[  
            dailyJobId,  
            note.PlanDelivery ? new Date(note.PlanDelivery) : null,  
            String(note.PurchaseOrder),  
            String(shipment.ShipmentNo),  
            shipment.DriverName,  
            shipment.TruckLicense,  
            String(shipment.CarrierCode),  
            shipment.CarrierName,  
            String(note.SoldToCode),  
            note.SoldToName,  
            note.ShipToName,  
            note.ShipToAddress,  
            note.ShipToLatitude \+ ", " \+ note.ShipToLongitude,  
            item.MaterialName,  
            item.ItemQuantity,  
            item.QuantityUnit,  
            item.ItemWeight,  
            String(note.DeliveryNo),  
            destSet.size,  
            destListStr,  
            "รอสแกน",  
            "ยังไม่ได้ส่ง",  
            "",  
            0, 0, 0,  
            "",  
            "",  
            shipment.ShipmentNo \+ "|" \+ note.ShipToName  
          \];  
          allFlatData.push(row);  
          runningRow++;  
        });  
      });  
    });

    const shopAgg \= {};  
    allFlatData.forEach(r \=\> {  
      const key \= r\[28\];  
      if (\!shopAgg\[key\]) shopAgg\[key\] \= { qty: 0, weight: 0, invoices: new Set(), epod: 0 };  
      shopAgg\[key\].qty \+= Number(r\[14\]) || 0;  
      shopAgg\[key\].weight \+= Number(r\[16\]) || 0;  
      shopAgg\[key\].invoices.add(r\[2\]);  
      if (checkIsEPOD(r\[9\], r\[2\])) shopAgg\[key\].epod++;  
    });

    allFlatData.forEach(r \=\> {  
      const agg \= shopAgg\[r\[28\]\];  
      const scanInv \= agg.invoices.size \- agg.epod;  
      r\[23\] \= agg.qty;  
      r\[24\] \= Number(agg.weight.toFixed(2));  
      r\[25\] \= scanInv;  
      r\[27\] \= \`${r\[9\]} / รวม ${scanInv} บิล\`;  
    });

    const headers \= \[  
      "ID\_งานประจำวัน", "PlanDelivery", "InvoiceNo", "ShipmentNo", "DriverName",  
      "TruckLicense", "CarrierCode", "CarrierName", "SoldToCode", "SoldToName",  
      "ShipToName", "ShipToAddress", "LatLong\_SCG", "MaterialName", "ItemQuantity",  
      "QuantityUnit", "ItemWeight", "DeliveryNo", "จำนวนปลายทาง\_System", "รายชื่อปลายทาง\_System",  
      "ScanStatus", "DeliveryStatus", "Email พนักงาน",  
      "จำนวนสินค้ารวมของร้านนี้", "น้ำหนักสินค้ารวมของร้านนี้", "จำนวน\_Invoice\_ที่ต้องสแกน",  
      "LatLong\_Actual", "ชื่อเจ้าของสินค้า\_Invoice\_ที่ต้องสแกน", "ShopKey"  
    \];

    dataSheet.clear();  
    dataSheet.getRange(1, 1, 1, headers.length).setValues(\[headers\]).setFontWeight("bold");

    if (allFlatData.length \> 0\) {  
      dataSheet.getRange(2, 1, allFlatData.length, headers.length).setValues(allFlatData);  
      dataSheet.getRange(2, 2, allFlatData.length, 1).setNumberFormat("dd/mm/yyyy");  
      dataSheet.getRange(2, 3, allFlatData.length, 1).setNumberFormat("@");  
      dataSheet.getRange(2, 18, allFlatData.length, 1).setNumberFormat("@");  
    }

    applyMasterCoordinatesToDailyJob();  
    buildOwnerSummary();  
    buildShipmentSummary();

    console.log(\`\[SCG API\] Successfully imported ${allFlatData.length} records.\`);  
    ui.alert(\`✅ ดึงข้อมูลสำเร็จ\!\\n- จำนวนรายการ: ${allFlatData.length} แถว\\n- จับคู่พิกัด: เรียบร้อย\`);

  } catch (e) {  
    console.error("\[SCG API Error\]: " \+ e.message);  
    ui.alert("❌ เกิดข้อผิดพลาด: " \+ e.message);  
  } finally {  
    lock.releaseLock();  
  }  
}

// \==========================================  
// 2\. COORDINATE MATCHING (V4.0)  
// \==========================================

/\*\*  
 \* \[Phase C FIXED\] applyMasterCoordinatesToDailyJob()  
 \* ใช้ resolveUUIDFromMap\_() ก่อน lookup พิกัดจาก masterUUIDCoords  
 \* ป้องกัน merged UUID ชี้ไปพิกัดเก่าที่ไม่ใช่ canonical  
 \*/  
function applyMasterCoordinatesToDailyJob() {  
  const ss        \= SpreadsheetApp.getActiveSpreadsheet();  
  const dataSheet \= ss.getSheetByName(SCG\_CONFIG.SHEET\_DATA);  
  const dbSheet   \= ss.getSheetByName(SCG\_CONFIG.SHEET\_MASTER\_DB);  
  const mapSheet  \= ss.getSheetByName(SCG\_CONFIG.SHEET\_MAPPING);  
  const empSheet  \= ss.getSheetByName(SCG\_CONFIG.SHEET\_EMPLOYEE);

  if (\!dataSheet || \!dbSheet) return;  
  const lastRow \= dataSheet.getLastRow();  
  if (lastRow \< 2\) return;

  // โหลด master coords  
  const masterCoords     \= {};  
  const masterUUIDCoords \= {};

  if (dbSheet.getLastRow() \> 1\) {  
    const maxCol \= Math.max(CONFIG.COL\_NAME, CONFIG.COL\_LAT, CONFIG.COL\_LNG, CONFIG.COL\_UUID);  
    const dbData \= dbSheet.getRange(2, 1, dbSheet.getLastRow() \- 1, maxCol).getValues();  
    dbData.forEach(r \=\> {  
      const obj \= dbRowToObject(r);  
      if (obj.name && obj.lat && obj.lng) {  
        const coords \= obj.lat \+ ", " \+ obj.lng;  
        masterCoords\[normalizeText(obj.name)\] \= coords;  
        if (obj.uuid) masterUUIDCoords\[obj.uuid\] \= coords;  
      }  
    });  
  }

  // โหลด alias map  
  const aliasMap \= {};  
  if (mapSheet && mapSheet.getLastRow() \> 1\) {  
    mapSheet.getRange(2, 1, mapSheet.getLastRow() \- 1, 2).getValues().forEach(r \=\> {  
      if (r\[0\] && r\[1\]) aliasMap\[normalizeText(r\[0\])\] \= r\[1\];  
    });  
  }

  // \[Phase C\] โหลด UUID state map ครั้งเดียว  
  const uuidStateMap \= buildUUIDStateMap\_();

  // โหลด employee map  
  const empMap \= {};  
  if (empSheet) {  
    var empLastRow \= empSheet.getLastRow();  
    if (empLastRow \>= 2\) {  
      empSheet.getRange(2, 1, empLastRow \- 1, 8).getValues().forEach(r \=\> {  
        if (r\[1\] && r\[6\]) empMap\[normalizeText(r\[1\])\] \= r\[6\];  
      });  
    }  
  }

  const values         \= dataSheet.getRange(2, 1, lastRow \- 1, CONFIG.DATA\_TOTAL\_COLS).getValues();  
  const latLongUpdates \= \[\];  
  const bgUpdates      \= \[\];  
  const emailUpdates   \= \[\];

  values.forEach(r \=\> {  
    const job  \= dailyJobRowToObject(r);  
    let newGeo \= "";  
    let bg     \= null;  
    let email  \= job.email;

    if (job.shipToName) {  
      let rawName   \= normalizeText(job.shipToName);  
      let targetUID \= aliasMap\[rawName\];

      // \[Phase C\] resolve เป็น canonical UUID ก่อน lookup พิกัด  
      if (targetUID) {  
        targetUID \= resolveUUIDFromMap\_(targetUID, uuidStateMap);  
      }

      if (targetUID && masterUUIDCoords\[targetUID\]) {  
        newGeo \= masterUUIDCoords\[targetUID\]; bg \= "\#b6d7a8";  
      } else if (masterCoords\[rawName\]) {  
        newGeo \= masterCoords\[rawName\]; bg \= "\#b6d7a8";  
      } else {  
        let branchMatch \= tryMatchBranch\_(rawName, masterCoords);  
        if (branchMatch) { newGeo \= branchMatch; bg \= "\#ffe599"; }  
      }  
    }

    latLongUpdates.push(\[newGeo\]);  
    bgUpdates.push(\[bg\]);

    if (job.driverName) {  
      const cleanDriver \= normalizeText(job.driverName);  
      if (empMap\[cleanDriver\]) email \= empMap\[cleanDriver\];  
    }  
    emailUpdates.push(\[email\]);  
  });

  dataSheet.getRange(2, DATA\_IDX.LATLNG\_ACTUAL \+ 1, latLongUpdates.length, 1).setValues(latLongUpdates);  
  dataSheet.getRange(2, DATA\_IDX.LATLNG\_ACTUAL \+ 1, bgUpdates.length,      1).setBackgrounds(bgUpdates);  
  dataSheet.getRange(2, DATA\_IDX.EMAIL \+ 1,          emailUpdates.length,   1).setValues(emailUpdates);

  ss.toast("✅ อัปเดตพิกัดและข้อมูลพนักงานเรียบร้อย", "System");  
}

// \==========================================  
// 3\. UTILITIES & HELPERS  
// \==========================================

function fetchWithRetry\_(url, options, maxRetries) {  
  for (let i \= 0; i \< maxRetries; i++) {  
    try {  
      const response \= UrlFetchApp.fetch(url, options);  
      if (response.getResponseCode() \=== 200\) return response.getContentText();  
      throw new Error("HTTP " \+ response.getResponseCode() \+ ": " \+ response.getContentText());  
    } catch (e) {  
      if (i \=== maxRetries \- 1\) throw e;  
      Utilities.sleep(1000 \* Math.pow(2, i));  
      console.warn(\`\[SCG API\] Retry attempt ${i \+ 1} failed. Retrying...\`);  
    }  
  }  
}

function tryMatchBranch\_(name, masterCoords) {  
  const keywords \= \["สาขา", "branch", "สำนักงาน", "store", "shop"\];  
  for (let k of keywords) {  
    if (name.includes(k)) {  
      let parts \= name.split(k);  
      if (parts.length \> 0 && parts\[0\].length \> 2\) {  
        let parentName \= normalizeText(parts\[0\]);  
        if (masterCoords\[parentName\]) return masterCoords\[parentName\];  
      }  
    }  
  }  
  return null;  
}

/\*\*  
 \* \[UPDATED v5.0\] ตรวจสอบ E-POD  
 \* กลุ่ม 1: EPOD ทุก Invoice — BETTERBE, SCG EXPRESS, เบทเตอร์แลนด์, JWD TRANSPORT  
 \* กลุ่ม 2: DENSO — ตรวจ Invoice ด้วย (ตัวเลขล้วน \+ ไม่มี \_DOC)  
 \*/  
function checkIsEPOD(ownerName, invoiceNo) {  
  if (\!ownerName || \!invoiceNo) return false;  
  const owner \= String(ownerName).toUpperCase();  
  const inv \= String(invoiceNo);

  const epodOwners \= \["BETTERBE", "SCG EXPRESS", "เบทเตอร์แลนด์", "JWD TRANSPORT"\];  
  if (epodOwners.some(w \=\> owner.includes(w.toUpperCase()))) return true;

  if (owner.includes("DENSO") || owner.includes("เด็นโซ่")) {  
    if (inv.includes("\_DOC")) return false;  
    if (/^\\d+(-.\*)?$/.test(inv)) return true;  
    return false;  
  }

  return false;  
}

// \==========================================  
// 4\. BUILD SUMMARY: เจ้าของสินค้า \[UPDATED v5.0\]  
// \==========================================

/\*\*  
 \* \[Phase B FIXED\] buildOwnerSummary()  
 \* ใช้ DATA\_IDX แทน r\[9\], r\[2\]  
 \*/  
function buildOwnerSummary() {  
  const ss        \= SpreadsheetApp.getActiveSpreadsheet();  
  const dataSheet \= ss.getSheetByName(SCG\_CONFIG.SHEET\_DATA);  
  if (\!dataSheet || dataSheet.getLastRow() \< 2\) return;

  // \[Phase B\] ใช้ DATA\_TOTAL\_COLS  
  const data     \= dataSheet.getRange(2, 1, dataSheet.getLastRow() \- 1, CONFIG.DATA\_TOTAL\_COLS).getValues();  
  const ownerMap \= {};

  data.forEach(r \=\> {  
    // \[Phase B\] ใช้ DATA\_IDX  
    const job \= dailyJobRowToObject(r);  
    if (\!job.soldToName) return;  
    if (\!ownerMap\[job.soldToName\]) ownerMap\[job.soldToName\] \= { all: new Set(), epod: new Set() };  
    if (\!job.invoiceNo) return;  
    if (checkIsEPOD(job.soldToName, job.invoiceNo)) {  
      ownerMap\[job.soldToName\].epod.add(job.invoiceNo);  
    } else {  
      ownerMap\[job.soldToName\].all.add(job.invoiceNo);  
    }  
  });

  const summarySheet \= ss.getSheetByName("สรุป\_เจ้าของสินค้า");  
  if (\!summarySheet) { SpreadsheetApp.getUi().alert("❌ ไม่พบชีต สรุป\_เจ้าของสินค้า"); return; }

  const summaryLastRow \= summarySheet.getLastRow();  
  if (summaryLastRow \> 1\) summarySheet.getRange(2, 1, summaryLastRow \- 1, 6).clearContent().setBackground(null);

  const rows \= \[\];  
  Object.keys(ownerMap).sort().forEach(owner \=\> {  
    const o \= ownerMap\[owner\];  
    rows.push(\["", owner, "", o.all.size, o.epod.size, new Date()\]);  
  });

  if (rows.length \> 0\) {  
    summarySheet.getRange(2, 1, rows.length, 6).setValues(rows);  
    summarySheet.getRange(2, 4, rows.length, 2).setNumberFormat("\#,\#\#0");  
    summarySheet.getRange(2, 6, rows.length, 1).setNumberFormat("dd/mm/yyyy HH:mm");  
  }  
}

/\*\*  
 \* \[Phase B FIXED\] buildShipmentSummary()  
 \* ใช้ DATA\_IDX แทน r\[3\], r\[5\], r\[9\], r\[2\]  
 \*/  
function buildShipmentSummary() {  
  const ss        \= SpreadsheetApp.getActiveSpreadsheet();  
  const dataSheet \= ss.getSheetByName(SCG\_CONFIG.SHEET\_DATA);  
  if (\!dataSheet || dataSheet.getLastRow() \< 2\) return;

  // \[Phase B\] ใช้ DATA\_TOTAL\_COLS  
  const data        \= dataSheet.getRange(2, 1, dataSheet.getLastRow() \- 1, CONFIG.DATA\_TOTAL\_COLS).getValues();  
  const shipmentMap \= {};

  data.forEach(r \=\> {  
    // \[Phase B\] ใช้ DATA\_IDX  
    const job \= dailyJobRowToObject(r);  
    if (\!job.shipmentNo || \!job.truckLicense) return;  
    const key \= job.shipmentNo \+ "\_" \+ job.truckLicense;  
    if (\!shipmentMap\[key\]) {  
      shipmentMap\[key\] \= { shipmentNo: job.shipmentNo, truck: job.truckLicense, all: new Set(), epod: new Set() };  
    }  
    if (\!job.invoiceNo) return;  
    if (checkIsEPOD(job.soldToName, job.invoiceNo)) {  
      shipmentMap\[key\].epod.add(job.invoiceNo);  
    } else {  
      shipmentMap\[key\].all.add(job.invoiceNo);  
    }  
  });

  const summarySheet \= ss.getSheetByName("สรุป\_Shipment");  
  if (\!summarySheet) { SpreadsheetApp.getUi().alert("❌ ไม่พบชีต สรุป\_Shipment"); return; }

  const summaryLastRow \= summarySheet.getLastRow();  
  if (summaryLastRow \> 1\) summarySheet.getRange(2, 1, summaryLastRow \- 1, 7).clearContent().setBackground(null);

  const rows \= \[\];  
  Object.keys(shipmentMap).sort().forEach(key \=\> {  
    const s \= shipmentMap\[key\];  
    rows.push(\[key, s.shipmentNo, s.truck, "", s.all.size, s.epod.size, new Date()\]);  
  });

  if (rows.length \> 0\) {  
    summarySheet.getRange(2, 1, rows.length, 7).setValues(rows);  
    summarySheet.getRange(2, 5, rows.length, 2).setNumberFormat("\#,\#\#0");  
    summarySheet.getRange(2, 7, rows.length, 1).setNumberFormat("dd/mm/yyyy HH:mm");  
  }  
}  
// \==========================================  
// 6\. CLEAR FUNCTIONS  
// \==========================================

function clearDataSheet() {  
  const ss \= SpreadsheetApp.getActiveSpreadsheet();  
  const sheet \= ss.getSheetByName(SCG\_CONFIG.SHEET\_DATA);  
  if (\!sheet) return;  
  const lastRow \= sheet.getLastRow();  
  const lastCol \= sheet.getLastColumn();  
  if (lastRow \> 1 && lastCol \> 0\) {  
    sheet.getRange(2, 1, lastRow \- 1, lastCol).clearContent().setBackground(null);  
  }  
}

function clearSummarySheet() {  
  const ss \= SpreadsheetApp.getActiveSpreadsheet();  
  const sheet \= ss.getSheetByName("สรุป\_เจ้าของสินค้า");  
  if (\!sheet) return;  
  const lastRow \= sheet.getLastRow();  
  if (lastRow \> 1\) {  
    sheet.getRange(2, 1, lastRow \- 1, sheet.getLastColumn()).clearContent().setBackground(null);  
  }  
}

function clearShipmentSummarySheet() {  
  const ss \= SpreadsheetApp.getActiveSpreadsheet();  
  const sheet \= ss.getSheetByName("สรุป\_Shipment");  
  if (\!sheet) return;  
  const lastRow \= sheet.getLastRow();  
  if (lastRow \> 1\) {  
    sheet.getRange(2, 1, lastRow \- 1, sheet.getLastColumn()).clearContent().setBackground(null);  
  }  
}

function clearSummarySheet\_UI() {  
  const ui \= SpreadsheetApp.getUi();  
  const result \= ui.alert(  
    '⚠️ ยืนยันการล้างข้อมูล',  
    'ต้องการล้างข้อมูลในชีต สรุป\_เจ้าของสินค้า ใช่ไหม?\\n(Header ยังคงอยู่)',  
    ui.ButtonSet.YES\_NO  
  );  
  if (result \=== ui.Button.YES) {  
    clearSummarySheet();  
    SpreadsheetApp.getUi().alert('✅ ล้างข้อมูล สรุป\_เจ้าของสินค้า เรียบร้อยแล้ว');  
  }  
}

function clearShipmentSummarySheet\_UI() {  
  const ui \= SpreadsheetApp.getUi();  
  const result \= ui.alert(  
    '⚠️ ยืนยันการล้างข้อมูล',  
    'ต้องการล้างข้อมูลในชีต สรุป\_Shipment ใช่ไหม?\\n(Header ยังคงอยู่)',  
    ui.ButtonSet.YES\_NO  
  );  
  if (result \=== ui.Button.YES) {  
    clearShipmentSummarySheet();  
    SpreadsheetApp.getUi().alert('✅ ล้างข้อมูล สรุป\_Shipment เรียบร้อยแล้ว');  
  }  
}

/\*\*  
 \* \[UPDATED v5.0\] ล้างทั้งหมด: Input \+ Data \+ สรุป\_เจ้าของสินค้า \+ สรุป\_Shipment  
 \*/  
function clearAllSCGSheets\_UI() {  
  const ui \= SpreadsheetApp.getUi();  
  const result \= ui.alert(  
    '🔥 ยืนยันการล้างข้อมูลทั้งหมด',  
    'ต้องการล้างข้อมูลใน:\\n- Input\\n- Data\\n- สรุป\_เจ้าของสินค้า\\n- สรุป\_Shipment\\nทั้งหมดหรือไม่?\\nการกระทำนี้กู้คืนไม่ได้',  
    ui.ButtonSet.YES\_NO  
  );

  if (result \=== ui.Button.YES) {  
    const ss \= SpreadsheetApp.getActiveSpreadsheet();

    const inputSheet \= ss.getSheetByName(SCG\_CONFIG.SHEET\_INPUT);  
    if (inputSheet) {  
      inputSheet.getRange(SCG\_CONFIG.COOKIE\_CELL).clearContent();  
      inputSheet.getRange(SCG\_CONFIG.SHIPMENT\_STRING\_CELL).clearContent();  
      const lastRow \= inputSheet.getLastRow();  
      if (lastRow \>= SCG\_CONFIG.INPUT\_START\_ROW) {  
        inputSheet.getRange(  
          SCG\_CONFIG.INPUT\_START\_ROW, 1,  
          lastRow \- SCG\_CONFIG.INPUT\_START\_ROW \+ 1, 1  
        ).clearContent();  
      }  
    }

    clearDataSheet();  
    clearSummarySheet();  
    clearShipmentSummarySheet();

    ui.alert('✅ ล้างข้อมูลทั้งหมดเรียบร้อยแล้ว\\n(Input \+ Data \+ สรุป\_เจ้าของสินค้า \+ สรุป\_Shipment)');  
  }  
}

\*\*\*\*\*\* ข้อมูล  CONFIG ให้ดูเฉยๆ เผื่อได้ใช้ครับ \*\*\*  
var CONFIG \= {  
  SHEET\_NAME:    "xxx", \= ชีตที่ทำความสะอาดแล้ว  
  MAPPING\_SHEET: "xxx", \= ชีตที่ทำความสะอาดแล้วแต่ซ้ำ  
  SOURCE\_SHEET:  "SCGนครหลวงJWDภูมิภาค", \= ชีตข้อมูลดิบ  
  SHEET\_POSTAL:  "SYS\_TH\_GEO", \= ชีตรหัสไปรษณีย์

    
  DEPOT\_LAT: 14.164688,  \= ละติจูด ของ คลังสินค้า เอสซีจี เจดับเบิ้ลยูดี วังน้อย  
  DEPOT\_LNG: 100.625354, \= ลองจิจูด ของ คลังสินค้า เอสซีจี เจดับเบิ้ลยูดี วังน้อย

  DISTANCE\_THRESHOLD\_KM: 0.05,  
  BATCH\_LIMIT:            50,  
  DEEP\_CLEAN\_LIMIT:       100,  
  API\_MAX\_RETRIES:        3,  
  API\_TIMEOUT\_MS:         30000,  
  CACHE\_EXPIRATION:       21600,

const SCG\_CONFIG \= {  
  SHEET\_DATA:     'ตารางงานประจำวัน',  
  SHEET\_INPUT:    'Input',  
  SHEET\_EMPLOYEE: 'ข้อมูลพนักงาน',  
  API\_URL:        'https://fsm.scgjwd.com/Monitor/SearchDelivery',  
  INPUT\_START\_ROW: 4,  
  COOKIE\_CELL:    'B1',  
  SHIPMENT\_STRING\_CELL: 'B3',  
  SHEET\_MASTER\_DB: 'Database',  
  SHEET\_MAPPING:   'NameMapping',  
  SHEET\_GPS\_QUEUE: 'GPS\_Queue',  
  GPS\_THRESHOLD\_METERS: 50,  
  SRC\_IDX: {  
    NAME: 12, LAT: 14, LNG: 15,  
    SYS\_ADDR: 18, DIST: 23, GOOG\_ADDR: 24  
  },  
  SRC\_IDX\_SYNC\_STATUS: 37,  
  SYNC\_STATUS\_DONE: "SYNCED",  
  JSON\_MAP: {  
    SHIPMENT\_NO:   'shipmentNo',  
    CUSTOMER\_NAME: 'customerName',  
    DELIVERY\_DATE: 'deliveryDate'  
  }  
};

// \[Phase B NEW\] เพิ่มใน SCG\_CONFIG ต่อท้าย JSON\_MAP  
// Data Sheet Column Index (0-based) สำหรับ Service\_SCG.gs  
// แทน r\[10\], r\[22\], r\[26\] ที่กระจัดกระจาย  
const DATA\_IDX \= {  
  JOB\_ID:        0,   // ID\_งานประจำวัน  
  PLAN\_DELIVERY: 1,   // PlanDelivery  
  INVOICE\_NO:    2,   // InvoiceNo  
  SHIPMENT\_NO:   3,   // ShipmentNo  
  DRIVER\_NAME:   4,   // DriverName  
  TRUCK\_LICENSE: 5,   // TruckLicense  
  CARRIER\_CODE:  6,   // CarrierCode  
  CARRIER\_NAME:  7,   // CarrierName  
  SOLD\_TO\_CODE:  8,   // SoldToCode  
  SOLD\_TO\_NAME:  9,   // SoldToName  
  SHIP\_TO\_NAME:  10,  // ShipToName  
  SHIP\_TO\_ADDR:  11,  // ShipToAddress  
  LATLNG\_SCG:    12,  // LatLong\_SCG  
  MATERIAL:      13,  // MaterialName  
  QTY:           14,  // ItemQuantity  
  QTY\_UNIT:      15,  // QuantityUnit  
  WEIGHT:        16,  // ItemWeight  
  DELIVERY\_NO:   17,  // DeliveryNo  
  DEST\_COUNT:    18,  // จำนวนปลายทาง\_System  
  DEST\_LIST:     19,  // รายชื่อปลายทาง\_System  
  SCAN\_STATUS:   20,  // ScanStatus  
  DELIVERY\_STATUS: 21, // DeliveryStatus  
  EMAIL:         22,  // Email พนักงาน  
  TOT\_QTY:       23,  // จำนวนสินค้ารวมของร้านนี้  
  TOT\_WEIGHT:    24,  // น้ำหนักสินค้ารวมของร้านนี้  
  SCAN\_INV:      25,  // จำนวน\_Invoice\_ที่ต้องสแกน  
  LATLNG\_ACTUAL: 26,  // LatLong\_Actual  
  OWNER\_LABEL:   27,  // ชื่อเจ้าของสินค้า\_Invoice\_ที่ต้องสแกน  
  SHOP\_KEY:      28   // ShopKey  
};

