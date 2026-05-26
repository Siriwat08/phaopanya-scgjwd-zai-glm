# 17 Modules

Logistics\_Master\_Data\_System\_V4.0  
17 Modules  
[Config.gs](http://Config.gs)  
Menu.gs  
Service\_Master.gs  
Service\_[SCG.gs](http://SCG.gs)  
Service\_GeoAddr.gs  
Utils\_Common.gs  
Service\_AutoPilot.gs  
WebApp.gs  
Service\_Search.gs  
Index.html  
Setup\_Upgrade.gs  
Test\_AI.gs  
Service\_Agent.gs  
Setup\_Security.gs  
Service\_Maintenance.gs  
Service\_Notify.gs  
Test\_Diagnostic.gs

🔢 MODULE VERSIONING SYSTEM  
ระบบนี้ใช้ Version Number ที่ด้านบนของทุกโมดูลเพื่อการตรวจสอบและติดตามการเปลี่ยนแปลง  
ความหมายของตัวเลข  
Versionความหมาย000โมดูลที่ ยังไม่ได้ตรวจสอบ — สถานะเริ่มต้น001โมดูลที่ ตรวจสอบแล้ว — ไม่ว่าจะแก้ไขหรือไม่002, 003, ...แก้ไขซ้ำ — เลขเพิ่มขึ้นทุกครั้งที่มีการแก้ไขในรอบถัดไป  
กฎการอัปเดต Version (บังคับทุกครั้ง)  
STEP 1: แก้ไขโมดูลที่ถูกร้องขอ → เปลี่ยน VERSION เป็น NNN+1  
STEP 2: ตรวจสอบโมดูลที่เหลือทุกตัวว่ามี dependency หรือไม่  
        → ถ้าเกี่ยวข้อง: แก้ไขให้สอดคล้อง → เปลี่ยน VERSION  
        → ถ้าไม่เกี่ยวข้อง: เปลี่ยน VERSION เพื่อยืนยันว่าตรวจสอบแล้ว  
STEP 3: ส่งโมดูลทั้งหมดกลับ — ทุกโมดูลต้องมี VERSION เท่ากัน  
รูปแบบ Version Tag ในโค้ด  
javascript

// VERSION: 000  
// \============================================================  
// FILE: core/[Config.gs](http://Config.gs)

ห้าม: ส่งโมดูลที่ VERSION ยังเป็น 000 กลับหลังได้รับคำขอแก้ไขแล้ว

### **เมื่อได้รับคำขอแก้ไขโค้ด:**

1. แก้ไขโมดูลที่ถูกร้องขอ → เพิ่ม VERSION  
2. ตรวจ dependency โมดูลที่เหลือทุกตัว → เพิ่ม VERSION ทุกตัว  
3. ส่งคืนทุกโมดูลพร้อมสรุปว่าแก้ไขอะไรบ้าง  
4. **ห้าม** ส่งโมดูลที่ VERSION ยังเป็น 000 กลับ หากได้รับคำขอแก้ไขแล้ว

# Config.gs

/\*\*  
 \* VERSION: 000  
 \* 🚛 Logistics Master Data System \- Configuration V4.0 (Enterprise Edition)  
 \* \------------------------------------------------------------------  
 \* \[PRESERVED\]: โครงสร้างเดิมทั้งหมดได้รับการรักษาไว้ (Preservation Protocol)  
 \* \[ADDED v4.0\]: กำหนดคอลัมน์ NameMapping สำหรับ 4-Tier Smart Resolution  
 \* \[ADDED v4.0\]: ตัวแปรควบคุม AI Batch Size และ Cache Expiration  
 \* \[MODIFIED\]: อัปเกรดระบบ Logging เป็น console.log/error สำหรับ GCP Monitoring  
 \* Author: Elite Logistics Architect  
 \*/

var CONFIG \= {  
  // \--- SHEET NAMES \---  
  SHEET\_NAME: "Database",  
  MAPPING\_SHEET: "NameMapping",  
  SOURCE\_SHEET: "SCGนครหลวงJWDภูมิภาค",  
  SHEET\_POSTAL: "PostalRef", // รองรับ Service\_GeoAddr

  // \--- 🧠 AI CONFIGURATION (SECURED) \---  
  // วิธีตั้งค่า: รันฟังก์ชัน setupEnvironment() ในไฟล์ Setup\_Security.gs  
  get GEMINI\_API\_KEY() {  
    var key \= PropertiesService.getScriptProperties().getProperty('GEMINI\_API\_KEY');  
    if (\!key) throw new Error("CRITICAL ERROR: GEMINI\_API\_KEY is not set. Please run setupEnvironment() first.");  
    return key;  
  },  
  USE\_AI\_AUTO\_FIX: true,  
  AI\_MODEL: "gemini-1.5-flash",   
  AI\_BATCH\_SIZE: 20, // \[ADDED v4.0\]: จำกัดจำนวนส่งให้ AI ครั้งละ 20 รายการเพื่อไม่ให้เกิน 6 นาที

  // \--- 🔴 DEPOT LOCATION \---  
  DEPOT\_LAT: 14.164688,   
  DEPOT\_LNG: 100.625354,

  // \--- SYSTEM THRESHOLDS & LIMITS \---  
  DISTANCE\_THRESHOLD\_KM: 0.05,   
  BATCH\_LIMIT: 50,    
  DEEP\_CLEAN\_LIMIT: 100,  
  API\_MAX\_RETRIES: 3,       // จำนวนครั้งที่จะลองใหม่ถ้า API SCG ล่ม  
  API\_TIMEOUT\_MS: 30000,    // เวลา Timeout (30 วิ)  
  CACHE\_EXPIRATION: 21600,  // \[ADDED v4.0\]: เวลา Cache (วินาที) \-\> 6 ชั่วโมง (สำหรับ Geo Maps)

  // \--- DATABASE COLUMNS INDEX (1-BASED) \---  
  COL\_NAME: 1,       // A: ชื่อลูกค้า  
  COL\_LAT: 2,        // B: Latitude  
  COL\_LNG: 3,        // C: Longitude  
  COL\_SUGGESTED: 4,  // D: ชื่อที่ระบบแนะนำ  
  COL\_CONFIDENCE: 5, // E: ความมั่นใจ  
  COL\_NORMALIZED: 6, // F: ชื่อที่ Clean แล้ว  
  COL\_VERIFIED: 7,   // G: สถานะตรวจสอบ (Checkbox)  
  COL\_SYS\_ADDR: 8,   // H: ที่อยู่จากระบบต้นทาง  
  COL\_ADDR\_GOOG: 9,  // I: ที่อยู่จาก Google Maps  
  COL\_DIST\_KM: 10,   // J: ระยะทางจากคลัง  
  COL\_UUID: 11,      // K: Unique ID  
  COL\_PROVINCE: 12,  // L: จังหวัด  
  COL\_DISTRICT: 13,  // M: อำเภอ  
  COL\_POSTCODE: 14,  // N: รหัสไปรษณีย์  
  COL\_QUALITY: 15,   // O: Quality Score  
  COL\_CREATED: 16,   // P: วันที่สร้าง (Created)  
  COL\_UPDATED: 17,   // Q: วันที่แก้ไขล่าสุด (Updated)

  // \--- \[NEW v4.0\] NAMEMAPPING COLUMNS INDEX (1-BASED) \---  
  // เตรียมโครงสร้างให้ AI ทำการ Map ชื่อสกปรกเข้ากับชื่อจริง  
  MAP\_COL\_VARIANT: 1,    // A: Variant\_Name (ชื่อแปลกๆ เช่น บจก. เอบีซี, เอบีซี จำกัด)  
  MAP\_COL\_UID: 2,        // B: Master\_UID (รหัสอ้างอิง Database หรือชื่อจริง)  
  MAP\_COL\_CONFIDENCE: 3, // C: Confidence\_Score (ความมั่นใจ AI 0-100)  
  MAP\_COL\_MAPPED\_BY: 4,  // D: Mapped\_By (Human / AI)  
  MAP\_COL\_TIMESTAMP: 5,  // E: Timestamp (เวลาที่อัปเดต)

  // \--- DATABASE ARRAY INDEX MAPPING (0-BASED) \---  
  get C\_IDX() {  
    return {  
      NAME: this.COL\_NAME \- 1,  
      LAT: this.COL\_LAT \- 1,  
      LNG: this.COL\_LNG \- 1,  
      SUGGESTED: this.COL\_SUGGESTED \- 1,  
      CONFIDENCE: this.COL\_CONFIDENCE \- 1,  
      NORMALIZED: this.COL\_NORMALIZED \- 1,  
      VERIFIED: this.COL\_VERIFIED \- 1,  
      SYS\_ADDR: this.COL\_SYS\_ADDR \- 1,  
      GOOGLE\_ADDR: this.COL\_ADDR\_GOOG \- 1,  
      DIST\_KM: this.COL\_DIST\_KM \- 1,  
      UUID: this.COL\_UUID \- 1,  
      PROVINCE: this.COL\_PROVINCE \- 1,  
      DISTRICT: this.COL\_DISTRICT \- 1,  
      POSTCODE: this.COL\_POSTCODE \- 1,  
      QUALITY: this.COL\_QUALITY \- 1,  
      CREATED: this.COL\_CREATED \- 1,  
      UPDATED: this.COL\_UPDATED \- 1  
    };  
  },

  // \--- \[NEW v4.0\] NAMEMAPPING ARRAY INDEX (0-BASED) \---  
  get MAP\_IDX() {  
    return {  
      VARIANT: this.MAP\_COL\_VARIANT \- 1,  
      UID: this.MAP\_COL\_UID \- 1,  
      CONFIDENCE: this.MAP\_COL\_CONFIDENCE \- 1,  
      MAPPED\_BY: this.MAP\_COL\_MAPPED\_BY \- 1,  
      TIMESTAMP: this.MAP\_COL\_TIMESTAMP \- 1  
    };  
  }  
};

// \--- SCG SPECIFIC CONFIG \---  
const SCG\_CONFIG \= {  
  SHEET\_DATA: 'Data',  
  SHEET\_INPUT: 'Input',  
  SHEET\_EMPLOYEE: 'ข้อมูลพนักงาน',  
  API\_URL: 'https://fsm.scgjwd.com/Monitor/SearchDelivery',  
  INPUT\_START\_ROW: 4,  
  COOKIE\_CELL: 'B1',  
  SHIPMENT\_STRING\_CELL: 'B3',  
  SHEET\_MASTER\_DB: 'Database',  
  SHEET\_MAPPING: 'NameMapping',  
    
  // Mapping คอลัมน์ของ SCG JSON Response  
  JSON\_MAP: {  
    SHIPMENT\_NO: 'shipmentNo',  
    CUSTOMER\_NAME: 'customerName',  
    DELIVERY\_DATE: 'deliveryDate'  
  }  
};

/\*\*  
 \* \[ENHANCED v4.0\] System Health Check  
 \* ตรวจสอบความพร้อมของ Sheet และ Config ก่อนเริ่มงาน  
 \*/  
CONFIG.validateSystemIntegrity \= function() {  
  var ss \= SpreadsheetApp.getActiveSpreadsheet();  
  var errors \= \[\];

  // 1\. Check Sheets Existence (เพิ่มการตรวจสอบ SHEET\_POSTAL)  
  var requiredSheets \= \[this.SHEET\_NAME, this.MAPPING\_SHEET, SCG\_CONFIG.SHEET\_INPUT, this.SHEET\_POSTAL\];  
  requiredSheets.forEach(function(name) {  
    if (\!ss.getSheetByName(name)) errors.push("Missing Sheet: " \+ name);  
  });

  // 2\. Check API Key  
  try {  
    var key \= this.GEMINI\_API\_KEY;   
    if (\!key || key.length \< 20\) errors.push("Invalid Gemini API Key format");  
  } catch (e) {  
    errors.push("Gemini API Key is not set in ScriptProperties. Please run setupEnvironment() first.");  
  }

  // 3\. Report  
  if (errors.length \> 0\) {  
    var msg \= "⚠️ SYSTEM INTEGRITY FAILED:\\n" \+ errors.join("\\n");  
    console.error(msg); // \[MODIFIED\]: ใช้ console.error สำหรับ Enterprise Monitoring  
    throw new Error(msg);  
  } else {  
    console.log("✅ System Integrity: OK"); // \[MODIFIED\]: ใช้ console.log  
    return true;  
  }  
};

# Service\_SCG.gs

/\*\*  
 \* VERSION: 000  
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

function applyMasterCoordinatesToDailyJob() {  
  const ss \= SpreadsheetApp.getActiveSpreadsheet();  
  const dataSheet \= ss.getSheetByName(SCG\_CONFIG.SHEET\_DATA);  
  const dbSheet \= ss.getSheetByName(SCG\_CONFIG.SHEET\_MASTER\_DB);  
  const mapSheet \= ss.getSheetByName(SCG\_CONFIG.SHEET\_MAPPING);  
  const empSheet \= ss.getSheetByName(SCG\_CONFIG.SHEET\_EMPLOYEE);

  if (\!dataSheet || \!dbSheet) return;  
  const lastRow \= dataSheet.getLastRow();  
  if (lastRow \< 2\) return;

  const masterCoords \= {};  
  const masterUUIDCoords \= {};

  if (dbSheet.getLastRow() \> 1\) {  
    const maxCol \= Math.max(CONFIG.COL\_NAME, CONFIG.COL\_LAT, CONFIG.COL\_LNG, CONFIG.COL\_UUID);  
    const dbData \= dbSheet.getRange(2, 1, dbSheet.getLastRow() \- 1, maxCol).getValues();  
    dbData.forEach(r \=\> {  
      const name \= r\[CONFIG.C\_IDX.NAME\];  
      const lat \= r\[CONFIG.C\_IDX.LAT\];  
      const lng \= r\[CONFIG.C\_IDX.LNG\];  
      const uuid \= r\[CONFIG.C\_IDX.UUID\];  
      if (name && lat && lng) {  
        const coords \= lat \+ ", " \+ lng;  
        masterCoords\[normalizeText(name)\] \= coords;  
        if (uuid) masterUUIDCoords\[uuid\] \= coords;  
      }  
    });  
  }

  const aliasMap \= {};  
  if (mapSheet && mapSheet.getLastRow() \> 1\) {  
    mapSheet.getRange(2, 1, mapSheet.getLastRow() \- 1, 2).getValues().forEach(r \=\> {  
      if (r\[0\] && r\[1\]) aliasMap\[normalizeText(r\[0\])\] \= r\[1\];  
    });  
  }

  const empMap \= {};  
  if (empSheet && empSheet.getLastRow() \> 1\) {  
    empSheet.getRange(2, 1, empSheet.getLastRow() \- 1, 8).getValues().forEach(r \=\> {  
      if (r\[1\] && r\[6\]) empMap\[normalizeText(r\[1\])\] \= r\[6\];  
    });  
  }

  const values \= dataSheet.getRange(2, 1, lastRow \- 1, 29).getValues();  
  const latLongUpdates \= \[\];  
  const bgUpdates \= \[\];  
  const emailUpdates \= \[\];

  values.forEach(r \=\> {  
    let newGeo \= "";  
    let bg \= null;  
    let email \= r\[22\];

    if (r\[10\]) {  
      let rawName \= normalizeText(r\[10\]);  
      let targetUID \= aliasMap\[rawName\];  
      if (targetUID && masterUUIDCoords\[targetUID\]) {  
        newGeo \= masterUUIDCoords\[targetUID\];  
        bg \= "\#b6d7a8";  
      } else if (masterCoords\[rawName\]) {  
        newGeo \= masterCoords\[rawName\];  
        bg \= "\#b6d7a8";  
      } else {  
        let branchMatch \= tryMatchBranch\_(rawName, masterCoords);  
        if (branchMatch) { newGeo \= branchMatch; bg \= "\#ffe599"; }  
      }  
    }

    latLongUpdates.push(\[newGeo\]);  
    bgUpdates.push(\[bg\]);

    if (r\[4\]) {  
      const cleanDriver \= normalizeText(r\[4\]);  
      if (empMap\[cleanDriver\]) email \= empMap\[cleanDriver\];  
    }  
    emailUpdates.push(\[email\]);  
  });

  dataSheet.getRange(2, 27, latLongUpdates.length, 1).setValues(latLongUpdates);  
  dataSheet.getRange(2, 27, bgUpdates.length, 1).setBackgrounds(bgUpdates);  
  dataSheet.getRange(2, 23, emailUpdates.length, 1).setValues(emailUpdates);

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

function normalizeText(text) {  
  if (\!text) return "";  
  return text.toString().toLowerCase().replace(/\\s+/g, "").trim();  
}

// \==========================================  
// 4\. BUILD SUMMARY: เจ้าของสินค้า \[UPDATED v5.0\]  
// \==========================================

function buildOwnerSummary() {  
  const ss \= SpreadsheetApp.getActiveSpreadsheet();  
  const dataSheet \= ss.getSheetByName(SCG\_CONFIG.SHEET\_DATA);  
  if (\!dataSheet || dataSheet.getLastRow() \< 2\) return;

  const data \= dataSheet.getRange(2, 1, dataSheet.getLastRow() \- 1, 29).getValues();

  const COL\_INVOICE \= 2;  
  const COL\_SOLDTO  \= 9;

  const ownerMap \= {};

  data.forEach(r \=\> {  
    const owner   \= r\[COL\_SOLDTO\];  
    const invoice \= String(r\[COL\_INVOICE\]);

    if (\!owner) return;  
    if (\!ownerMap\[owner\]) {  
      ownerMap\[owner\] \= { all: new Set(), epod: new Set() };  
    }  
    if (\!invoice) return;

    if (checkIsEPOD(owner, invoice)) {  
      ownerMap\[owner\].epod.add(invoice);  
      return;  
    }  
    ownerMap\[owner\].all.add(invoice);  
  });

  const summarySheet \= ss.getSheetByName("สรุป\_เจ้าของสินค้า");  
  if (\!summarySheet) {  
    SpreadsheetApp.getUi().alert("❌ ไม่พบชีต สรุป\_เจ้าของสินค้า กรุณาสร้างชีตก่อน");  
    return;  
  }

  const summaryLastRow \= summarySheet.getLastRow();  
  if (summaryLastRow \> 1\) {  
    summarySheet.getRange(2, 1, summaryLastRow \- 1, 6).clearContent().setBackground(null);  
  }

  const rows \= \[\];  
  Object.keys(ownerMap).sort().forEach(owner \=\> {  
    const o \= ownerMap\[owner\];  
    rows.push(\[  
      "",           // Col A: SummaryKey ← ว่าง ใส่เองได้  
      owner,        // Col B: SoldToName  
      "",           // Col C: PlanDelivery ← ว่าง ใส่เองได้  
      o.all.size,   // Col D: จำนวน\_ทั้งหมด (ต้องสแกน)  
      o.epod.size,  // Col E: จำนวน\_E-POD\_ทั้งหมด  
      new Date()    // Col F: LastUpdated  
    \]);  
  });

  if (rows.length \> 0\) {  
    summarySheet.getRange(2, 1, rows.length, 6).setValues(rows);  
    summarySheet.getRange(2, 4, rows.length, 2).setNumberFormat("\#,\#\#0");  
    summarySheet.getRange(2, 6, rows.length, 1).setNumberFormat("dd/mm/yyyy HH:mm");  
  }

  console.log(\`\[Owner Summary v5.0\] Built ${rows.length} owner rows.\`);  
}

// \==========================================  
// 5\. BUILD SUMMARY: Shipment \[ADDED v5.0\]  
// \==========================================

function buildShipmentSummary() {  
  const ss \= SpreadsheetApp.getActiveSpreadsheet();  
  const dataSheet \= ss.getSheetByName(SCG\_CONFIG.SHEET\_DATA);  
  if (\!dataSheet || dataSheet.getLastRow() \< 2\) return;

  const data \= dataSheet.getRange(2, 1, dataSheet.getLastRow() \- 1, 29).getValues();

  const COL\_INVOICE  \= 2;  
  const COL\_SOLDTO   \= 9;  
  const COL\_SHIPMENT \= 3;  
  const COL\_TRUCK    \= 5;

  const shipmentMap \= {};

  data.forEach(r \=\> {  
    const shipmentNo \= String(r\[COL\_SHIPMENT\]);  
    const truck      \= String(r\[COL\_TRUCK\]);  
    const owner      \= r\[COL\_SOLDTO\];  
    const invoice    \= String(r\[COL\_INVOICE\]);

    if (\!shipmentNo || \!truck) return;

    const key \= shipmentNo \+ "\_" \+ truck;  
    if (\!shipmentMap\[key\]) {  
      shipmentMap\[key\] \= { shipmentNo: shipmentNo, truck: truck, all: new Set(), epod: new Set() };  
    }

    if (\!invoice) return;

    if (checkIsEPOD(owner, invoice)) {  
      shipmentMap\[key\].epod.add(invoice);  
      return;  
    }  
    shipmentMap\[key\].all.add(invoice);  
  });

  const summarySheet \= ss.getSheetByName("สรุป\_Shipment");  
  if (\!summarySheet) {  
    SpreadsheetApp.getUi().alert("❌ ไม่พบชีต สรุป\_Shipment กรุณาสร้างชีตก่อน");  
    return;  
  }

  const summaryLastRow \= summarySheet.getLastRow();  
  if (summaryLastRow \> 1\) {  
    summarySheet.getRange(2, 1, summaryLastRow \- 1, 7).clearContent().setBackground(null);  
  }

  const rows \= \[\];  
  Object.keys(shipmentMap).sort().forEach(key \=\> {  
    const s \= shipmentMap\[key\];  
    rows.push(\[  
      key,          // Col A: ShipmentKey ← Key ใน AppSheet  
      s.shipmentNo, // Col B: ShipmentNo  
      s.truck,      // Col C: TruckLicense  
      "",           // Col D: PlanDelivery ← ว่าง ใส่เองได้  
      s.all.size,   // Col E: จำนวน\_ทั้งหมด (ต้องสแกน)  
      s.epod.size,  // Col F: จำนวน\_E-POD\_ทั้งหมด  
      new Date()    // Col G: LastUpdated  
    \]);  
  });

  if (rows.length \> 0\) {  
    summarySheet.getRange(2, 1, rows.length, 7).setValues(rows);  
    summarySheet.getRange(2, 5, rows.length, 2).setNumberFormat("\#,\#\#0"); // Col E, F  
    summarySheet.getRange(2, 7, rows.length, 1).setNumberFormat("dd/mm/yyyy HH:mm"); // Col G  
  }

  console.log(\`\[Shipment Summary v5.0\] Built ${rows.length} shipment rows.\`);  
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

# Utils\_Common.gs

/\*\*  
 \* VERSION: 000  
 \* 🛠️ Utilities: Common Helper Functions  
 \* Version: 4.0 Enterprise Edition (AI & Batch Preparedness)  
 \* \------------------------------------------------------  
 \* \[PRESERVED\]: Hashing, Haversine Math, Fuzzy Matching, and Smart Naming.  
 \* \[ADDED v4.0\]: chunkArray() helper for AI Batch Processing.  
 \* \[MODIFIED v4.0\]: Enhanced normalizeText() with more logistics-specific stop words.  
 \* \[MODIFIED v4.0\]: genericRetry() upgraded with Enterprise-grade console logging.  
 \* Author: Elite Logistics Architect  
 \*/

// \====================================================  
// 1\. Hashing & ID Generation  
// \====================================================

function md5(key) {  
  if (\!key) return "empty\_hash";  
  var code \= key.toString().toLowerCase().replace(/\\s/g, "");  
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, code)  
    .map(function(char) { return (char \+ 256).toString(16).slice(-2); })  
    .join("");  
}

function generateUUID() {  
  return Utilities.getUuid();  
}

// \====================================================  
// 2\. Text Processing & Normalization  
// \====================================================

/\*\*  
 \* \[MODIFIED v4.0\]: เพิ่ม Stop words สำหรับงาน Logistics (โกดัง, คลังสินค้า, อาคาร ฯลฯ)  
 \* ทำหน้าที่เป็น Tier 2 Resolution (Clean Text)  
 \*/  
function normalizeText(text) {  
  if (\!text) return "";  
  var clean \= text.toString().toLowerCase();  
    
  var stopWordsPattern \= /บริษัท|บจก\\.?|บมจ\\.?|หจก\\.?|ห้างหุ้นส่วน|จำกัด|มหาชน|ส่วนบุคคล|ร้าน|ห้าง|สาขา|สำนักงานใหญ่|store|shop|company|co\\.?|ltd\\.?|inc\\.?|จังหวัด|อำเภอ|ตำบล|เขต|แขวง|ถนน|ซอย|นาย|นาง|นางสาว|โกดัง|คลังสินค้า|หมู่ที่|หมู่|อาคาร|ชั้น/g;  
  clean \= clean.replace(stopWordsPattern, "");

  return clean.replace(/\[^a-z0-9\\u0E00-\\u0E7F\]/g, "");  
}

function cleanDistance(val) {  
  if (\!val && val \!== 0\) return "";  
  var str \= val.toString().replace(/\[^0-9.\]/g, "");   
  var num \= parseFloat(str);  
  return isNaN(num) ? "" : num.toFixed(2);  
}

function cleanPhoneNumber(phone) {  
  if (\!phone) return "";  
  var str \= phone.toString().replace(/\[^0-9\]/g, "");   
  if (str.startsWith("66") && str.length \> 9\) {  
    str \= "0" \+ str.substring(2);  
  }  
  return str;  
}

function parseThaiDate(dateStr) {  
  if (\!dateStr || typeof dateStr \!== 'string') return null;  
  var parts \= dateStr.split('/');  
  if (parts.length \=== 3\) {  
    return new Date(parts\[2\], parseInt(parts\[1\]) \- 1, parts\[0\]);  
  }  
  return null;  
}

// \====================================================  
// 3\. 🧠 Smart Naming Logic  
// \====================================================

function getBestName\_Smart(names) {  
  if (\!names || names.length \=== 0\) return "";  
    
  var nameScores \= {};  
  var bestName \= names\[0\];  
  var maxScore \= \-9999;  
    
  names.forEach(function(n) {  
    if (\!n) return;  
    var original \= n.toString().trim();  
    if (original \=== "") return;

    if (\!nameScores\[original\]) {  
       nameScores\[original\] \= { count: 0, score: 0 };  
    }  
    nameScores\[original\].count \+= 1;  
  });

  for (var n in nameScores) {  
    var s \= nameScores\[n\].count \* 10;   
      
    if (/(บริษัท|บจก|หจก|บมจ)/.test(n)) s \+= 5;   
    if (/(จำกัด|มหาชน)/.test(n)) s \+= 5;          
    if (/(สาขา)/.test(n)) s \+= 5;                 
      
    var openBrackets \= (n.match(/\\(/g) || \[\]).length;  
    var closeBrackets \= (n.match(/\\)/g) || \[\]).length;  
      
    if (openBrackets \> 0 && openBrackets \=== closeBrackets) {  
      s \+= 5;   
    } else if (openBrackets \!== closeBrackets) {  
      s \-= 30;   
    }  
      
    if (/\[0-9\]{9,10}/.test(n) || /โทร/.test(n)) s \-= 30;   
    if (/ส่ง|รับ|ติดต่อ/.test(n)) s \-= 10;                  
      
    var len \= n.length;  
    if (len \> 70\) {  
      s \-= (len \- 70);   
    } else if (len \< 5\) {  
      s \-= 10;           
    } else {  
      s \+= (len \* 0.1);  
    }

    nameScores\[n\].score \= s;  
      
    if (s \> maxScore) {  
      maxScore \= s;  
      bestName \= n;  
    }  
  }  
    
  return cleanDisplayName(bestName);  
}

function cleanDisplayName(name) {  
  var clean \= name.toString();  
  clean \= clean.replace(/\\s\*โทร\\.?\\s\*\[0-9-\]{9,12}/g, '');  
  clean \= clean.replace(/\\s\*0\[0-9\]{1,2}-\[0-9\]{3}-\[0-9\]{4}/g, '');  
  clean \= clean.replace(/\\s+/g, ' ').trim();  
  return clean;  
}

// \====================================================  
// 4\. Geo Math & Fuzzy Matching  
// \====================================================

function getHaversineDistanceKM(lat1, lon1, lat2, lon2) {  
  if (\!lat1 || \!lon1 || \!lat2 || \!lon2) return null;  
  var R \= 6371;   
  var dLat \= (lat2 \- lat1) \* Math.PI / 180;  
  var dLon \= (lon2 \- lon1) \* Math.PI / 180;  
  var a \= Math.sin(dLat/2) \* Math.sin(dLat/2) \+  
          Math.cos(lat1 \* Math.PI / 180\) \* Math.cos(lat2 \* Math.PI / 180\) \*  
          Math.sin(dLon/2) \* Math.sin(dLon/2);  
  var c \= 2 \* Math.atan2(Math.sqrt(a), Math.sqrt(1-a));  
  return parseFloat((R \* c).toFixed(3));   
}

function calculateSimilarity(s1, s2) {  
  if (\!s1 || \!s2) return 0.0;  
  var longer \= s1, shorter \= s2;  
  if (s1.length \< s2.length) { longer \= s2; shorter \= s1; }  
  var longerLength \= longer.length;  
  if (longerLength \=== 0\) return 1.0;  
  return (longerLength \- editDistance(longer, shorter)) / parseFloat(longerLength);  
}

function editDistance(s1, s2) {  
  s1 \= s1.toLowerCase(); s2 \= s2.toLowerCase();  
  var len1 \= s1.length, len2 \= s2.length;  
  var track \= Array(len2 \+ 1).fill(null).map(() \=\> Array(len1 \+ 1).fill(null));

  for (var i \= 0; i \<= len1; i \+= 1\) { track\[0\]\[i\] \= i; }  
  for (var j \= 0; j \<= len2; j \+= 1\) { track\[j\]\[0\] \= j; }

  for (var j \= 1; j \<= len2; j \+= 1\) {  
    for (var i \= 1; i \<= len1; i \+= 1\) {  
      var indicator \= (s1.charAt(i \- 1\) \=== s2.charAt(j \- 1)) ? 0 : 1;  
      track\[j\]\[i\] \= Math.min(  
        track\[j\]\[i \- 1\] \+ 1,   
        track\[j \- 1\]\[i\] \+ 1,   
        track\[j \- 1\]\[i \- 1\] \+ indicator   
      );  
    }  
  }  
  return track\[len2\]\[len1\];  
}

// \====================================================  
// 5\. System Utilities (Logging, Retry & Array Ops)  
// \====================================================

/\*\*  
 \* \[MODIFIED v4.0\]: Enterprise Logging  
 \*/  
function genericRetry(func, maxRetries) {  
  for (var i \= 0; i \< maxRetries; i++) {  
    try { return func(); }   
    catch (e) {  
      if (i \=== maxRetries \- 1\) {  
        console.error("\[GenericRetry\] FATAL ERROR after " \+ maxRetries \+ " attempts: " \+ e.message);  
        throw e;  
      }  
      Utilities.sleep(1000 \* Math.pow(2, i));   
      console.warn("\[GenericRetry\] Attempt " \+ (i \+ 1\) \+ " failed: " \+ e.message \+ ". Retrying...");  
    }  
  }  
}

function safeJsonParse(str) {  
  try { return JSON.parse(str); } catch (e) { return null; }  
}

/\*\*  
 \* \[ADDED v4.0\]: Chunk Array Helper for AI Batch Processing  
 \* แบ่ง Array ขนาดใหญ่เป็นก้อนเล็กๆ เพื่อป้องกัน Google Apps Script Timeout  
 \*/  
function chunkArray(array, chunkSize) {  
  var results \= \[\];  
  for (var i \= 0; i \< array.length; i \+= chunkSize) {  
    results.push(array.slice(i, i \+ chunkSize));  
  }  
  return results;  
}

# WebApp.gs

/\*\*  
 \* VERSION: 000  
 \* 🌐 WebApp Controller (Enterprise Edition)  
 \* Version: 4.0 Omni-Channel Interface  
 \* \------------------------------------------  
 \* \[PRESERVED\]: URL Parameter handling, Safe Include, Version Control.  
 \* \[ADDED v4.0\]: doPost() for API/Webhook readiness (AppSheet/External Triggers).  
 \* \[ADDED v4.0\]: Page routing logic (e.parameter.page) for multi-view support.  
 \* \[MODIFIED v4.0\]: Enterprise logging tracking for web accesses.  
 \* \[MODIFIED v4.0\]: Safe user context extraction.  
 \* Author: Elite Logistics Architect  
 \*/

/\*\*  
 \* 🖥️ ฟังก์ชันแสดงผลหน้าเว็บ (HTTP GET)  
 \* รองรับ: https://script.google.com/.../exec?q=ค้นหา\&page=Index  
 \*/  
function doGet(e) {  
  try {  
    // บันทึก Log การเข้าใช้งาน  
    console.info(\`\[WebApp\] GET Request received. Params: ${JSON.stringify(e.parameter)}\`);

    // 1\. Page Routing (เตรียมพร้อมสำหรับหน้าจออื่นๆ เช่น Admin, Dashboard)  
    var page \= (e && e.parameter && e.parameter.page) ? e.parameter.page : 'Index';  
      
    // 2\. สร้าง Template จากไฟล์ HTML  
    var template \= HtmlService.createTemplateFromFile(page);  
      
    // 3\. รับค่าจาก URL Parameter (Deep Linking)  
    var paramQuery \= (e && e.parameter && e.parameter.q) ? e.parameter.q : "";  
    template.initialQuery \= paramQuery;  
      
    // 4\. ส่งค่า Config/Version ไปหน้าบ้าน (แก้ปัญหา Browser Cache)  
    template.appVersion \= new Date().getTime(); // บังคับโหลดใหม่เสมอ  
    template.isEnterprise \= true;  
      
    // 5\. Evaluate & Render  
    var output \= template.evaluate()  
        .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0')   
        .setTitle('🔍 Logistics Master Search (V4.0)')  
        .setFaviconUrl('https://img.icons8.com/color/48/truck--v1.png');

    // 6\. X-Frame Options   
    // ALLOWALL: จำเป็นสำหรับการ Embed ใน SharePoint, Google Sites หรือ AppSheet  
    output.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);  
      
    return output;

  } catch (err) {  
    console.error(\`\[WebApp\] GET Error: ${err.message}\`);  
    // Fallback กรณีระบบล่ม หรือหาไฟล์ HTML ไม่เจอ  
    return HtmlService.createHtmlOutput(\`  
      \<div style="font-family: sans-serif; padding: 20px; text-align: center; background-color: \#ffebee;"\>  
        \<h3 style="color: \#d32f2f;"\>❌ System Error (V4.0)\</h3\>  
        \<p\>${err.message}\</p\>  
        \<p style="color: \#666; font-size: 12px;"\>กรุณาตรวจสอบชื่อไฟล์ HTML หรือติดต่อ System Administrator\</p\>  
      \</div\>  
    \`);  
  }  
}

/\*\*  
 \* 📡 \[ADDED v4.0\] ฟังก์ชันรับข้อมูลผ่าน Webhook/API (HTTP POST)  
 \* รองรับการเชื่อมต่อจาก AppSheet หรือระบบภายนอกเพื่อสั่งงานเบื้องหลัง  
 \*/  
function doPost(e) {  
  try {  
    console.info("\[WebApp\] POST Request received.");  
    if (\!e || \!e.postData) throw new Error("No payload found in POST request.");  
      
    var payload \= JSON.parse(e.postData.contents);  
    var action \= payload.action;

    // ตัวอย่างการทำ Routing API เบื้องต้น  
    if (action \=== "triggerAIBatch") {  
       // สั่งให้ AI ทำงานจากภายนอก  
       if (typeof processAIIndexing\_Batch \=== 'function') {  
         processAIIndexing\_Batch();  
         return createJsonResponse\_({ status: "success", message: "AI Batch Processing Triggered" });  
       }  
    }

    return createJsonResponse\_({ status: "success", message: "Webhook received", data: payload });

  } catch (err) {  
    console.error("\[WebApp\] POST Error: " \+ err.message);  
    return createJsonResponse\_({ status: "error", message: err.message });  
  }  
}

/\*\*  
 \* Helper: สร้าง JSON Response ให้ doPost  
 \*/  
function createJsonResponse\_(obj) {  
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);  
}

/\*\*  
 \* 📦 ฟังก์ชันสำหรับดึง CSS/JS เข้ามาใน HTML (Server-Side Include)  
 \*/  
function include(filename) {  
  try {  
    return HtmlService.createHtmlOutputFromFile(filename).getContent();  
  } catch (e) {  
    console.warn("\[WebApp\] Missing include file: " \+ filename);  
    return "\<\!-- Error: File '" \+ filename \+ "' not found. \--\>";  
  }  
}

/\*\*  
 \* 🔐 ฟังก์ชันสำหรับตรวจสอบ User (Safe Context)  
 \* เอาไว้เรียกจากฝั่ง Client เพื่อดูว่าใครใช้งานอยู่  
 \*/  
function getUserContext() {  
  try {  
    return {  
      email: Session.getActiveUser().getEmail() || "anonymous",  
      locale: Session.getActiveUserLocale() || "th"  
    };  
  } catch (e) {  
    console.warn("\[WebApp\] Failed to get user context: " \+ e.message);  
    return { email: "unknown", locale: "th" };  
  }  
}

# Service\_Search.gs

/\*\*  
 \* VERSION: 000  
 \* 🔍 Service: Search Engine (Enterprise Edition)  
 \* Version: 4.0 Omni-Search (UUID & AI Integrated)  
 \* \----------------------------------------------  
 \* \[PRESERVED\]: Multi-Token search logic and Pagination structure.  
 \* \[MODIFIED v4.0\]: Upgraded NameMapping cache to use Master\_UID instead of Name.  
 \* \[MODIFIED v4.0\]: Added try-catch around CacheService to prevent 100KB limit crash.  
 \* \[MODIFIED v4.0\]: Added Enterprise Performance Logging (console.time).  
 \* Author: Elite Logistics Architect  
 \*/

function searchMasterData(keyword, page) {  
  console.time("SearchLatency");  
  try {  
    // 1\. Input Validation & Setup  
    var pageNum \= parseInt(page) || 1;  
    var pageSize \= 20;

    if (\!keyword || keyword.toString().trim() \=== "") {  
      return { items: \[\], total: 0, totalPages: 0, currentPage: 1 };  
    }  
      
    // Prepare Keywords (Split by space for multi-token match)  
    // Example: "SCG Rayong" \-\> \["scg", "rayong"\]  
    var rawKey \= keyword.toString().toLowerCase().trim();  
    var searchTokens \= rawKey.split(/\\s+/).filter(function(k) { return k.length \> 0; });  
      
    if (searchTokens.length \=== 0\) return { items: \[\], total: 0, totalPages: 0, currentPage: 1 };

    var ss \= SpreadsheetApp.getActiveSpreadsheet();  
      
    // 2\. \[UPGRADED v4.0\] Load NameMapping (With Smart Cache via UUID)  
    var aliasMap \= getCachedNameMapping\_(ss);

    // 3\. Load Database  
    var sheet \= ss.getSheetByName(CONFIG.SHEET\_NAME);  
    if (\!sheet) return { items: \[\], total: 0, totalPages: 0, currentPage: 1 };

    var lastRow \= sheet.getLastRow();  
    if (lastRow \< 2\) return { items: \[\], total: 0, totalPages: 0, currentPage: 1 };

    // Read Data  
    var data \= sheet.getRange(2, 1, lastRow \- 1, 17).getValues();   
    var matches \= \[\]; 

    // 4\. Search Algorithm (Linear Scan with Token Logic)  
    for (var i \= 0; i \< data.length; i++) {  
      var row \= data\[i\];  
        
      var name \= row\[CONFIG.C\_IDX.NAME\];  
      if (\!name) continue;

      var address \= row\[CONFIG.C\_IDX.GOOGLE\_ADDR\] || row\[CONFIG.C\_IDX.SYS\_ADDR\] || "";  
      var lat \= row\[CONFIG.C\_IDX.LAT\];  
      var lng \= row\[CONFIG.C\_IDX.LNG\];  
      var uuid \= row\[CONFIG.C\_IDX.UUID\]; // \[ADDED v4.0\]: Use UUID for relational link  
        
      // AI Brain: ดึงข้อมูลที่ Agent คิดไว้มาช่วยค้นหา (Tag \[AI\])  
      var aiKeywords \= row\[CONFIG.C\_IDX.NORMALIZED\] ? row\[CONFIG.C\_IDX.NORMALIZED\].toString().toLowerCase() : "";  
      var normName \= typeof normalizeText \=== 'function' ? normalizeText(name) : name.toString().toLowerCase();  
      var rawName \= name.toString().toLowerCase();  
        
      // \[UPGRADED v4.0\]: Alias Lookup using UUID instead of Name  
      var aliases \= uuid ? (aliasMap\[uuid\] || "") : "";  
        
      // Combine all searchable text into one "Haystack"  
      var haystack \= (rawName \+ " " \+ normName \+ " " \+ aliases \+ " " \+ aiKeywords \+ " " \+ address.toString().toLowerCase());  
        
      // Multi-Token Check: ต้องเจอ "ทุกคำ" ที่พิมพ์มา (AND Logic)  
      var isMatch \= searchTokens.every(function(token) {  
        return haystack.indexOf(token) \> \-1;  
      });

      if (isMatch) {  
        matches.push({  
          name: name,  
          address: address,  
          lat: lat,  
          lng: lng,  
          mapLink: (lat && lng) ? "https://www.google.com/maps/dir/?api=1\&destination=" \+ lat \+ "," \+ lng : "",  
          uuid: uuid,  
          score: aiKeywords.includes(rawKey) ? 10 : 1 // AI Exact Match gets higher priority  
        });  
      }  
    }

    // \[Optional\] Sort by score (AI exact matches first)  
    matches.sort(function(a, b) { return b.score \- a.score; });

    // 5\. Pagination Logic  
    var totalItems \= matches.length;  
    var totalPages \= Math.ceil(totalItems / pageSize);  
      
    if (pageNum \> totalPages && totalPages \> 0\) pageNum \= 1;  
      
    var startIndex \= (pageNum \- 1\) \* pageSize;  
    var endIndex \= startIndex \+ pageSize;  
    var pagedItems \= matches.slice(startIndex, endIndex);

    console.log(\`\[Search\] Query: "${rawKey}" | Found: ${totalItems} | Page: ${pageNum}/${totalPages}\`);  
    return {  
      items: pagedItems,  
      total: totalItems,  
      totalPages: totalPages,  
      currentPage: pageNum  
    };

  } catch (error) {  
    console.error("\[Search Error\]: " \+ error.message);  
    return { items: \[\], total: 0, totalPages: 0, currentPage: 1, error: error.message };  
  } finally {  
    console.timeEnd("SearchLatency");  
  }  
}

/\*\*  
 \* 🛠️ Internal Helper: Get NameMapping with Caching  
 \* \[UPGRADED v4.0\]: Relational mapping using Variant \-\> UID  
 \*/  
function getCachedNameMapping\_(ss) {  
  var cache \= CacheService.getScriptCache();  
  var cachedMap \= cache.get("NAME\_MAPPING\_JSON\_V4");  
    
  if (cachedMap) {  
    return JSON.parse(cachedMap);  
  }  
    
  // ถ้าไม่มีใน Cache ให้โหลดจาก Sheet  
  var mapSheet \= ss.getSheetByName(CONFIG.MAPPING\_SHEET);  
  var aliasMap \= {};   
    
  if (mapSheet && mapSheet.getLastRow() \> 1\) {  
    // โหลด 2 คอลัมน์แรก (Col A: Variant, Col B: UID) ตามโครงสร้าง V4.0  
    var mapData \= mapSheet.getRange(2, 1, mapSheet.getLastRow() \- 1, 2).getValues();  
      
    mapData.forEach(function(row) {  
      var variant \= row\[0\]; // Variant\_Name  
      var uid \= row\[1\];     // Master\_UID  
        
      if (variant && uid) {  
        if (\!aliasMap\[uid\]) aliasMap\[uid\] \= "";  
          
        // ต่อ String Variant Name เก็บไว้ใน Key ของ UID  
        var normVariant \= typeof normalizeText \=== 'function' ? normalizeText(variant) : variant.toString().toLowerCase();  
        aliasMap\[uid\] \+= " " \+ normVariant \+ " " \+ variant.toString().toLowerCase();  
      }  
    });  
      
    // Save to Cache (Duration: 1 hour)  
    // ป้องกัน Error 100KB Limit ของ Google Cache  
    try {  
      var jsonString \= JSON.stringify(aliasMap);  
      if (jsonString.length \< 100000\) {   
        cache.put("NAME\_MAPPING\_JSON\_V4", jsonString, 3600);  
      } else {  
        console.warn("\[Cache\] NameMapping size exceeds 100KB, skipping cache put.");  
      }  
    } catch (e) {  
      console.warn("\[Cache Error\]: " \+ e.message);  
    }  
  }  
    
  return aliasMap;  
}

/\*\*  
 \* \[Optional\] Function to clear cache if Mapping is updated  
 \* Call this when running 'finalizeAndClean'  
 \*/  
function clearSearchCache() {  
  CacheService.getScriptCache().remove("NAME\_MAPPING\_JSON\_V4");  
  console.log("\[Cache\] Search Cache Cleared.");  
}

# Index.html

/\*\*  
 \* VERSION: 000  
 \* Index.html  
 \*   
 \* \------------------------------------------

\<\!DOCTYPE html\>  
\<html lang="th" class="h-full"\>  
 \<head\>  
  \<base target="\_top"\>  
  \<meta charset="UTF-8"\>  
  \<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"\>  
  \<title\>ค้นหาพิกัดลูกค้า (V4.0)\</title\>  
  \<\!-- Font & Icons \--\>  
  \<link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700\&display=swap" rel="stylesheet"\>  
  \<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet"\>  
    
  \<style\>  
    /\* \--- CORE LAYOUT \--- \*/  
    :root {  
      /\* \[MODIFIED v4.0\] Enterprise Gradient Color \*/  
      \--primary-grad: linear-gradient(135deg, \#4f46e5 0%, \#7c3aed 100%);  
      \--bg-color: \#f3f4f6;  
      \--card-bg: \#ffffff;  
      \--text-main: \#1f2937;  
      \--text-muted: \#6b7280;  
    }

    \* { margin: 0; padding: 0; box-sizing: border-box; \-webkit-tap-highlight-color: transparent; }  
      
    body {  
      font-family: 'Kanit', sans-serif;  
      background: var(--bg-color);   
      height: 100vh;  
      display: flex;  
      flex-direction: column;  
      overflow: hidden; /\* Prevent body scroll, use container scroll \*/  
    }  
      
    .app-container {  
      width: 100%;  
      height: 100%;  
      max-width: 800px;  
      margin: 0 auto;  
      display: flex;  
      flex-direction: column;  
      position: relative;  
    }  
      
    /\* \--- 1\. STICKY HEADER \--- \*/  
    .header-section {  
      background: var(--primary-grad);  
      padding: 20px 20px 30px 20px;  
      border-bottom-left-radius: 24px;  
      border-bottom-right-radius: 24px;  
      box-shadow: 0 10px 25px rgba(124, 58, 237, 0.25);  
      z-index: 10;  
      flex-shrink: 0;  
    }

    .app-branding {  
      text-align: center;  
      color: white;  
      margin-bottom: 20px;  
    }  
    .app-title { font-size: 24px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.1); }  
    .app-subtitle { font-size: 14px; font-weight: 300; opacity: 0.9; }  
      
    .search-box-wrapper {  
      position: relative;  
      background: white;  
      border-radius: 16px;  
      padding: 5px;  
      box-shadow: 0 8px 20px rgba(0,0,0,0.15);  
      display: flex;  
      align-items: center;  
    }  
      
    .search-input {  
      flex: 1;  
      border: none;  
      padding: 12px 15px 12px 45px;  
      font-size: 16px;  
      font-family: 'Kanit', sans-serif;  
      border-radius: 12px;  
      outline: none;  
      color: var(--text-main);  
    }  
    .search-icon-left { position: absolute; left: 20px; color: \#9ca3af; }  
      
    .btn-search {  
      background: var(--primary-grad);  
      color: white;  
      border: none;  
      padding: 10px 20px;  
      border-radius: 12px;  
      font-weight: 600;  
      cursor: pointer;  
      transition: transform 0.2s;  
      white-space: nowrap;  
    }  
    .btn-search:active { transform: scale(0.95); }  
      
    .btn-clear {  
      color: \#d1d5db;  
      background: none;  
      border: none;  
      padding: 10px;  
      cursor: pointer;  
      display: none; /\* Show via JS \*/  
    }  
    .btn-clear:hover { color: \#ef4444; }

    /\* \--- 2\. RESULTS AREA \--- \*/  
    .results-area {  
      flex: 1;  
      overflow-y: auto;  
      padding: 20px;  
      padding-bottom: 80px; /\* Space for pagination \*/  
      \-webkit-overflow-scrolling: touch;  
    }  
      
    /\* Scrollbar Styling \*/  
    .results-area::-webkit-scrollbar { width: 6px; }  
    .results-area::-webkit-scrollbar-thumb { background-color: \#cbd5e0; border-radius: 20px; }

    .result-card {  
      background: var(--card-bg);  
      border-radius: 16px;  
      padding: 18px;  
      margin-bottom: 15px;  
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);  
      border-left: 5px solid \#7c3aed;  
      animation: slideUp 0.3s ease-out backwards;  
      position: relative;  
    }  
    @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

    .card-header { display: flex; justify-content: space-between; align-items: flex-start; }  
    .shop-name { font-size: 18px; font-weight: 600; color: var(--text-main); margin-bottom: 2px; line-height: 1.3; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }  
      
    /\* \[ADDED v4.0\] AI Badge Styling \*/  
    .ai-badge {  
      font-size: 10px; background: linear-gradient(135deg, \#fdf4ff 0%, \#fae8ff 100%);  
      color: \#c026d3; padding: 2px 8px; border-radius: 12px; font-weight: 600;  
      border: 1px solid \#f5d0fe; display: inline-flex; align-items: center; gap: 4px;  
    }

    /\* \[ADDED v4.0\] UUID Tracking \*/  
    .uuid-track { font-size: 10px; color: \#9ca3af; font-family: monospace; margin-bottom: 6px; }

    .shop-address { font-size: 13px; color: var(--text-muted); display: flex; align-items: flex-start; gap: 6px; margin-top: 4px; }  
      
    .coord-tag {  
      display: inline-flex; align-items: center; gap: 5px;  
      background: \#eff6ff; color: \#3b82f6;  
      font-size: 13px; font-weight: 500;  
      padding: 6px 12px; border-radius: 8px;  
      margin-top: 10px; cursor: pointer;  
      transition: all 0.2s;  
      border: 1px solid \#dbeafe;  
    }  
    .coord-tag:active { background: \#dbeafe; transform: scale(0.98); }  
      
    .action-row {  
      margin-top: 15px;  
      display: flex;  
      gap: 10px;  
      padding-top: 15px;  
      border-top: 1px dashed \#e5e7eb;  
    }  
      
    .btn-nav {  
      flex: 1;  
      display: flex; align-items: center; justify-content: center; gap: 6px;  
      padding: 10px; border-radius: 10px;  
      font-size: 14px; font-weight: 500;  
      text-decoration: none; color: white;  
      transition: opacity 0.2s;  
    }  
    .btn-nav:hover { opacity: 0.9; }  
    .btn-google { background: \#4285F4; box-shadow: 0 4px 10px rgba(66, 133, 244, 0.2); }  
    .btn-waze { background: \#33ccff; color: \#fff; text-shadow: 0 1px 2px rgba(0,0,0,0.2); box-shadow: 0 4px 10px rgba(51, 204, 255, 0.2); }

    /\* \--- 3\. PAGINATION \--- \*/  
    .pagination-bar {  
      position: absolute;  
      bottom: 0; left: 0; right: 0;  
      background: rgba(255,255,255,0.95);  
      backdrop-filter: blur(8px);  
      padding: 10px;  
      display: flex; justify-content: center; gap: 8px;  
      box-shadow: 0 \-5px 20px rgba(0,0,0,0.05);  
      z-index: 20;  
    }  
    .page-dot {  
      width: 35px; height: 35px;  
      border-radius: 8px; border: 1px solid \#e5e7eb;  
      background: white; color: var(--text-muted);  
      display: flex; align-items: center; justify-content: center;  
      font-size: 14px; font-weight: 600; cursor: pointer;  
      transition: all 0.2s;  
    }  
    .page-dot.active {  
      background: var(--primary-grad); color: white; border: none;  
      box-shadow: 0 4px 10px rgba(124, 58, 237, 0.3);  
    }  
      
    /\* \--- UTILS \--- \*/  
    .loading-overlay {  
      position: absolute; top: 0; left: 0; right: 0; bottom: 0;  
      background: rgba(243, 244, 246, 0.85);  
      backdrop-filter: blur(4px);  
      z-index: 50;  
      display: none;  
      flex-direction: column;  
      align-items: center;  
      justify-content: center;  
    }  
    .spinner {  
      width: 45px; height: 45px;  
      border: 4px solid \#e5e7eb; border-top-color: \#7c3aed;  
      border-radius: 50%; animation: spin 1s linear infinite;  
    }  
    @keyframes spin { to { transform: rotate(360deg); } }

    .toast {  
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);  
      background: \#1f2937; color: white;  
      padding: 12px 24px; border-radius: 30px;  
      font-size: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);  
      display: none; align-items: center; gap: 8px; z-index: 9999;  
      white-space: nowrap;  
      font-weight: 500;  
    }  
      
    .empty-state { text-align: center; margin-top: 60px; opacity: 0.7; }  
    .empty-icon { font-size: 64px; margin-bottom: 15px; color: \#cbd5e1; }

    /\* Mobile adjustments \*/  
    @media (max-width: 480px) {  
      .app-title { font-size: 22px; }  
      .result-card { padding: 15px; }  
      .search-input { font-size: 15px; }  
    }  
  \</style\>  
 \</head\>  
 \<body\>

  \<div class="app-container"\>  
      
    \<\!-- Header \--\>  
    \<div class="header-section"\>  
      \<div class="app-branding"\>  
        \<h1 class="app-title"\>\<i class="fas fa-shipping-fast me-2"\>\</i\>Logistics Master\</h1\>  
        \<p class="app-subtitle"\>Enterprise Search Engine V4.0\</p\>  
      \</div\>  
        
      \<div class="search-box-wrapper"\>  
        \<i class="fas fa-search search-icon-left"\>\</i\>  
        \<input type="text" id="searchInput" class="search-input" placeholder="พิมพ์ชื่อร้าน, อำเภอ, จังหวัด..." autocomplete="off"\>  
        \<button id="btnClear" class="btn-clear" onclick="clearSearch()"\>\<i class="fas fa-times-circle"\>\</i\>\</button\>  
        \<button class="btn-search" onclick="triggerSearch()"\>ค้นหา\</button\>  
      \</div\>  
    \</div\>

    \<\!-- Results \--\>  
    \<div class="results-area" id="resultsContainer"\>  
      \<div class="empty-state"\>  
        \<div class="empty-icon"\>\<i class="fas fa-map-marked-alt"\>\</i\>\</div\>  
        \<p\>พิมพ์คำค้นหาแล้วกดปุ่ม "ค้นหา"\<br\>เพื่อเชื่อมต่อฐานข้อมูลส่วนกลาง\</p\>  
      \</div\>  
    \</div\>

    \<\!-- Pagination \--\>  
    \<div class="pagination-bar" id="paginationBar" style="display: none;"\>\</div\>

    \<\!-- Loading \--\>  
    \<div class="loading-overlay" id="loader"\>  
      \<div class="spinner"\>\</div\>  
      \<p style="margin-top: 15px; font-weight: 500; color: \#4b5563;"\>กำลังค้นหาผ่าน AI...\</p\>  
    \</div\>

  \</div\>

  \<\!-- Toast \--\>  
  \<div class="toast" id="toastMsg"\>  
    \<i class="fas fa-check-circle" style="color: \#34d399;"\>\</i\> \<span id="toastText"\>ข้อความ\</span\>  
  \</div\>

  \<script\>  
    /\* \--- 1\. GLOBAL STATE \--- \*/  
    let currentKeyword \= "";  
    let currentPage \= 1;

    /\* \--- 2\. INITIALIZATION (Deep Linking) \--- \*/  
    window.onload \= function() {  
      // รับค่าจาก WebApp.gs (Server-Side Injection)  
      var initialQuery \= "\<?= typeof initialQuery \!== 'undefined' ? initialQuery : '' ?\>";  
        
      // Auto-Search if query exists  
      if (initialQuery && initialQuery \!== "undefined" && initialQuery.trim() \!== "") {  
        document.getElementById('searchInput').value \= initialQuery;  
        triggerSearch();  
      }

      // Input Listener for Enter key & Clear button visibility  
      const input \= document.getElementById('searchInput');  
      input.addEventListener('keyup', (e) \=\> {  
        if (e.key \=== 'Enter') triggerSearch();  
        toggleClearBtn();  
      });  
      input.addEventListener('input', toggleClearBtn);  
    };

    function toggleClearBtn() {  
      const val \= document.getElementById('searchInput').value;  
      document.getElementById('btnClear').style.display \= val ? 'block' : 'none';  
    }

    function clearSearch() {  
      document.getElementById('searchInput').value \= '';  
      document.getElementById('searchInput').focus();  
      toggleClearBtn();  
    }

    /\* \--- 3\. SEARCH LOGIC \--- \*/  
    function triggerSearch() {  
      const keyword \= document.getElementById('searchInput').value.trim();  
      if (\!keyword) {  
        showToast("⚠️ กรุณาพิมพ์คำค้นหาก่อนครับ");  
        return;  
      }  
        
      currentKeyword \= keyword;  
      currentPage \= 1;  
      document.getElementById('searchInput').blur(); // Hide keyboard on mobile  
      fetchData(1);  
    }

    function fetchData(page) {  
      showLoading(true);  
        
      google.script.run  
        .withSuccessHandler(renderResults)  
        .withFailureHandler(handleError)  
        .searchMasterData(currentKeyword, page);  
    }

    /\* \--- 4\. RENDER LOGIC \--- \*/  
    function renderResults(response) {  
      showLoading(false);  
      const container \= document.getElementById('resultsContainer');  
      const pagination \= document.getElementById('paginationBar');  
        
      container.innerHTML \= '';  
        
      if (\!response || \!response.items || response.items.length \=== 0\) {  
        container.innerHTML \= \`  
          \<div class="empty-state"\>  
            \<div class="empty-icon"\>🤔\</div\>  
            \<p\>ไม่พบข้อมูล "${escapeHtml(currentKeyword)}"\<br\>ลองพิมพ์คำค้นหาให้สั้นลง หรือหาด้วยชื่อพื้นที่\</p\>  
          \</div\>\`;  
        pagination.style.display \= 'none';  
        return;  
      }

      // Render Info Header  
      const infoDiv \= document.createElement('div');  
      infoDiv.style.padding \= '0 5px 10px 5px';  
      infoDiv.style.fontSize \= '13px';  
      infoDiv.style.color \= '\#6b7280';  
      infoDiv.style.fontWeight \= '500';  
      infoDiv.innerHTML \= \`พบคลังข้อมูล ${response.total} รายการ (หน้า ${response.currentPage}/${response.totalPages})\`;  
      container.appendChild(infoDiv);

      // Render Items  
      response.items.forEach((item, index) \=\> {  
        const hasCoord \= (item.lat && item.lng);  
        const latLng \= hasCoord ? \`${item.lat}, ${item.lng}\` : '';  
          
        const card \= document.createElement('div');  
        card.className \= 'result-card';  
        card.style.animationDelay \= \`${index \* 0.05}s\`;  
          
        // \[ADDED v4.0\] AI Badge & UUID Display  
        const aiBadgeHtml \= (item.score \>= 10\)   
            ? \`\<span class="ai-badge"\>\<i class="fas fa-magic"\>\</i\> AI Match\</span\>\`   
            : '';  
              
        const uuidHtml \= item.uuid   
            ? \`\<div class="uuid-track"\>UID: ${item.uuid}\</div\>\`   
            : '';

        let coordHtml \= hasCoord   
          ? \`\<div class="coord-tag" onclick="copyCoord('${latLng}')"\>  
               \<i class="fas fa-copy"\>\</i\> พิกัด: ${latLng}  
             \</div\>\`  
          : \`\<span style="font-size:12px; color:\#ef4444; background:\#fef2f2; padding:4px 8px; border-radius:6px; display:inline-block; margin-top:10px;"\>ไม่มีข้อมูลพิกัดในระบบ\</span\>\`;

        let actionHtml \= hasCoord  
          ? \`\<div class="action-row"\>  
               \<a href="https://www.google.com/maps/dir/?api=1\&destination=${latLng}" target="\_blank" class="btn-nav btn-google"\>  
                 \<i class="fab fa-google"\>\</i\> Google Maps  
               \</a\>  
               \<a href="https://waze.com/ul?ll=${item.lat},${item.lng}\&navigate=yes" target="\_blank" class="btn-nav btn-waze"\>  
                 \<i class="fab fa-waze"\>\</i\> Waze  
               \</a\>  
             \</div\>\`  
          : '';

        card.innerHTML \= \`  
          \<div class="card-header"\>  
            \<div style="width: 100%;"\>  
              \<div class="shop-name"\>${escapeHtml(item.name)} ${aiBadgeHtml}\</div\>  
              ${uuidHtml}  
              \<div class="shop-address"\>  
                \<i class="fas fa-map-marker-alt" style="margin-top:3px; color:\#9ca3af;"\>\</i\>  
                \<span\>${escapeHtml(item.address || 'ไม่ระบุที่อยู่ระบบ SCG')}\</span\>  
              \</div\>  
              ${coordHtml}  
            \</div\>  
          \</div\>  
          ${actionHtml}  
        \`;  
          
        container.appendChild(card);  
      });

      // Render Pagination  
      renderPagination(response.totalPages, response.currentPage);  
    }

    function renderPagination(total, current) {  
      const bar \= document.getElementById('paginationBar');  
      if (total \<= 1\) {  
        bar.style.display \= 'none';  
        return;  
      }  
        
      bar.style.display \= 'flex';  
      let html \= '';  
        
      // Previous  
      html \+= \`\<div class="page-dot" onclick="changePage(${current-1})" ${current===1 ? 'style="pointer-events:none; opacity:0.4;"' : ''}\>\<i class="fas fa-chevron-left"\>\</i\>\</div\>\`;  
        
      // Pagination Logic  
      let start \= Math.max(1, current \- 1);  
      let end \= Math.min(total, current \+ 1);  
        
      if(start \> 1\) html \+= \`\<div class="page-dot" onclick="changePage(1)"\>1\</div\>\`;  
      if(start \> 2\) html \+= \`\<span style="align-self:end; padding-bottom:5px; color:\#9ca3af;"\>...\</span\>\`;  
        
      for (let i \= start; i \<= end; i++) {  
        html \+= \`\<div class="page-dot ${i \=== current ? 'active' : ''}" onclick="changePage(${i})"\>${i}\</div\>\`;  
      }  
        
      if(end \< total \- 1\) html \+= \`\<span style="align-self:end; padding-bottom:5px; color:\#9ca3af;"\>...\</span\>\`;  
      if(end \< total) html \+= \`\<div class="page-dot" onclick="changePage(${total})"\>${total}\</div\>\`;

      // Next  
      html \+= \`\<div class="page-dot" onclick="changePage(${current+1})" ${current===total ? 'style="pointer-events:none; opacity:0.4;"' : ''}\>\<i class="fas fa-chevron-right"\>\</i\>\</div\>\`;  
        
      bar.innerHTML \= html;  
    }

    function changePage(p) {  
      if (p \< 1\) return;  
      fetchData(p);  
    }

    /\* \--- 5\. UTILITIES \--- \*/  
    function showLoading(isLoading) {  
      document.getElementById('loader').style.display \= isLoading ? 'flex' : 'none';  
    }

    function handleError(err) {  
      showLoading(false);  
      showToast("❌ เกิดข้อผิดพลาดในการเชื่อมต่อ");  
      console.error(err);  
    }

    // \[PRESERVED\]: Robust Copy to Clipboard (iFrame Safe for GAS)  
    function copyCoord(text) {  
      if (navigator.clipboard && navigator.clipboard.writeText) {  
        navigator.clipboard.writeText(text).then(() \=\> {  
          showToast(\`คัดลอก: ${text}\`);  
        }).catch(() \=\> fallbackCopy(text));  
      } else {  
        fallbackCopy(text);  
      }  
    }

    function fallbackCopy(text) {  
      const textArea \= document.createElement("textarea");  
      textArea.value \= text;  
      textArea.style.position \= "fixed";  
      textArea.style.left \= "-9999px";  
      textArea.style.top \= "0";  
      document.body.appendChild(textArea);  
        
      textArea.focus();  
      textArea.select();  
        
      try {  
        const successful \= document.execCommand('copy');  
        if (successful) showToast(\`คัดลอก: ${text}\`);  
        else showToast("❌ คัดลอกไม่สำเร็จ");  
      } catch (err) {  
        showToast("❌ Browser ไม่รองรับการคัดลอก");  
      }  
        
      document.body.removeChild(textArea);  
    }

    let toastTimeout;  
    function showToast(msg) {  
      const toast \= document.getElementById('toastMsg');  
      document.getElementById('toastText').innerText \= msg;  
        
      toast.style.display \= 'flex';  
      toast.style.animation \= 'slideUp 0.3s forwards';  
        
      if (toastTimeout) clearTimeout(toastTimeout);  
      toastTimeout \= setTimeout(() \=\> {  
        toast.style.display \= 'none';  
      }, 3000);  
    }

    // XSS Protection  
    function escapeHtml(text) {  
      if (\!text) return text;  
      return String(text)  
        .replace(/&/g, "\&amp;")  
        .replace(/\</g, "\&lt;")  
        .replace(/\>/g, "\&gt;")  
        .replace(/"/g, "\&quot;")  
        .replace(/'/g, "&\#039;");  
    }  
  \</script\>  
 \</body\>  
\</html\>

# Setup\_Upgrade.gs

/\*\*  
 \* VERSION: 000  
 \* 🛠️ System Upgrade Tool (Enterprise Edition)  
 \* Version: 4.0 Omni-Schema Upgrader  
 \* \-----------------------------------------------------------------  
 \* \[PRESERVED\]: Spatial Grid Indexing (O(N)) for hidden duplicates.  
 \* \[PRESERVED\]: upgradeDatabaseStructure for extending standard columns.  
 \* \[ADDED v4.0\]: upgradeNameMappingStructure\_V4() to auto-migrate NameMapping   
 \* to the new 5-column AI Resolution Schema safely.  
 \* \[MODIFIED v4.0\]: Added Enterprise Benchmarking (console.time).  
 \* Author: Elite Logistics Architect  
 \*/

// \==========================================  
// 1\. DATABASE SCHEMA UPGRADE (Standard & V4.0)  
// \==========================================

function upgradeDatabaseStructure() {  
  var ss \= SpreadsheetApp.getActiveSpreadsheet();  
  var sheet \= ss.getSheetByName(CONFIG.SHEET\_NAME); // "Database"  
    
  if (\!sheet) {  
    SpreadsheetApp.getUi().alert("❌ Critical Error: ไม่พบชีต " \+ CONFIG.SHEET\_NAME);  
    return;  
  }

  // รายชื่อคอลัมน์ใหม่ (Future Expansion Columns for BigQuery/CloudSQL)  
  // หมายเหตุ: คอลัมน์เหล่านี้อยู่นอกเหนือจาก Standard 17 Columns ใน Config  
  var extensionHeaders \= \[  
    "Customer Type",      // Col 18 (R)  
    "Time Window",        // Col 19 (S)  
    "Avg Service Time",   // Col 20 (T)  
    "Vehicle Constraint", // Col 21 (U)  
    "Contact Person",     // Col 22 (V)  
    "Phone Number",       // Col 23 (W)  
    "Risk Score",         // Col 24 (X)  
    "Branch Code",        // Col 25 (Y)  
    "Last Updated By"     // Col 26 (Z)  
  \];

  var currentHeaders \= sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()\[0\];  
  var missingHeaders \= \[\];

  extensionHeaders.forEach(function(header) {  
    if (currentHeaders.indexOf(header) \=== \-1) {  
      missingHeaders.push(header);  
    }  
  });

  if (missingHeaders.length \=== 0\) {  
    SpreadsheetApp.getUi().alert("✅ Database Structure is up-to-date.\\nโครงสร้างฐานข้อมูลหลักสมบูรณ์แล้ว");  
    return;  
  }

  // ถามยืนยันก่อนเพิ่ม  
  var ui \= SpreadsheetApp.getUi();  
  var response \= ui.alert(  
    "⚠️ System Upgrade Required",   
    "ตรวจพบคอลัมน์ขาดหาย " \+ missingHeaders.length \+ " รายการ:\\n" \+ missingHeaders.join(", ") \+ "\\n\\nต้องการเพิ่มต่อท้ายทันทีหรือไม่?",  
    ui.ButtonSet.YES\_NO  
  );

  if (response \== ui.Button.YES) {  
    var startCol \= sheet.getLastColumn() \+ 1;  
    var range \= sheet.getRange(1, startCol, 1, missingHeaders.length);  
      
    range.setValues(\[missingHeaders\]);  
    range.setFontWeight("bold");  
    range.setBackground("\#d0f0c0"); // สีเขียวอ่อน (New Features)  
    range.setBorder(true, true, true, true, true, true);  
      
    // Auto-resize  
    sheet.autoResizeColumns(startCol, missingHeaders.length);  
      
    console.info(\`\[System Upgrade\] Added ${missingHeaders.length} extension columns to Database.\`);  
    ui.alert("✅ เพิ่มคอลัมน์ใหม่ใน Database สำเร็จ\!");  
  }  
}

/\*\*  
 \* 🚀 \[NEW v4.0\] Auto-Upgrade NameMapping Sheet to AI 4-Tier Schema  
 \* เปลี่ยนหัวคอลัมน์และจัดฟอร์แมตอัตโนมัติ ไม่ต้องทำมือ  
 \*/  
function upgradeNameMappingStructure\_V4() {  
  var ss \= SpreadsheetApp.getActiveSpreadsheet();  
  var sheet \= ss.getSheetByName(CONFIG.MAPPING\_SHEET); // "NameMapping"  
  var ui \= SpreadsheetApp.getUi();

  if (\!sheet) {  
    ui.alert("❌ Critical Error: ไม่พบชีต " \+ CONFIG.MAPPING\_SHEET);  
    return;  
  }

  // Schema V4.0 เป้าหมาย  
  var targetHeaders \= \["Variant\_Name", "Master\_UID", "Confidence\_Score", "Mapped\_By", "Timestamp"\];  
    
  // เขียนหัวคอลัมน์ใหม่ทับ 5 คอลัมน์แรก  
  var range \= sheet.getRange(1, 1, 1, 5);  
  range.setValues(\[targetHeaders\]);  
    
  // ตกแต่งให้ดูเป็น Enterprise (สีม่วง AI)  
  range.setFontWeight("bold");  
  range.setFontColor("white");  
  range.setBackground("\#7c3aed"); // Enterprise Purple  
  range.setBorder(true, true, true, true, true, true);  
    
  // ปรับความกว้างให้สวยงาม  
  sheet.setColumnWidth(1, 250); // Variant Name (ชื่ออาจจะยาว)  
  sheet.setColumnWidth(2, 280); // Master\_UID (ยาวมาก)  
  sheet.setColumnWidth(3, 130); // Confidence  
  sheet.setColumnWidth(4, 120); // Mapped By  
  sheet.setColumnWidth(5, 150); // Timestamp  
    
  // ฟรีซแถวบนสุด  
  sheet.setFrozenRows(1);

  console.info("\[System Upgrade\] Successfully migrated NameMapping schema to V4.0");  
  ui.alert(  
    "✅ Schema Upgrade V4.0 สำเร็จ\!",   
    "อัปเกรดชีต NameMapping เป็น 5 คอลัมน์สำหรับ AI เรียบร้อยแล้วครับ\\n(แนะนำให้ไปกดซ่อมแซม NameMapping ในเมนูอีกครั้ง เพื่อเติม UID ให้เต็มช่อง)",   
    ui.ButtonSet.OK  
  );  
}

// \==========================================  
// 2\. SMART DATA QUALITY CHECK  
// \==========================================

/\*\*  
 \* 🔍 ตรวจสอบข้อมูลซ้ำซ้อน (Spatial Grid Algorithm)  
 \* เร็วกว่าเดิม 100 เท่า (จาก O(N^2) เป็น O(N))  
 \* \[MODIFIED v4.0\]: Added Benchmarking Console Log  
 \*/  
function findHiddenDuplicates() {  
  console.time("HiddenDupesCheck"); // เริ่มจับเวลา  
  var ss \= SpreadsheetApp.getActiveSpreadsheet();  
  var ui \= SpreadsheetApp.getUi();  
  var sheet \= ss.getSheetByName(CONFIG.SHEET\_NAME);  
    
  // ใช้ C\_IDX เพื่อความแม่นยำ (ถ้ามี Config V4) หรือ Fallback  
  var idxLat \= (typeof CONFIG \!== 'undefined' && CONFIG.C\_IDX && CONFIG.C\_IDX.LAT \!== undefined) ? CONFIG.C\_IDX.LAT : 1;   
  var idxLng \= (typeof CONFIG \!== 'undefined' && CONFIG.C\_IDX && CONFIG.C\_IDX.LNG \!== undefined) ? CONFIG.C\_IDX.LNG : 2;  
  var idxName \= (typeof CONFIG \!== 'undefined' && CONFIG.C\_IDX && CONFIG.C\_IDX.NAME \!== undefined) ? CONFIG.C\_IDX.NAME : 0;

  var lastRow \= sheet.getLastRow();  
  if (lastRow \< 2\) return;

  var data \= sheet.getRange(2, 1, lastRow \- 1, 15).getValues(); // อ่านถึง Col O ก็พอ  
  var duplicates \= \[\];  
  var grid \= {};

  // Step 1: สร้าง Spatial Grid (Bucket Sort)  
  // ปัดเศษพิกัดทศนิยม 2 ตำแหน่ง (\~1.1 กม.) เพื่อจัดกลุ่ม  
  for (var i \= 0; i \< data.length; i++) {  
    var row \= data\[i\];  
    var lat \= row\[idxLat\];  
    var lng \= row\[idxLng\];  
      
    if (\!lat || \!lng || isNaN(lat) || isNaN(lng)) continue;

    var gridKey \= Math.floor(lat \* 100\) \+ "\_" \+ Math.floor(lng \* 100);  
      
    if (\!grid\[gridKey\]) grid\[gridKey\] \= \[\];  
    grid\[gridKey\].push({ index: i, row: row });  
  }

  // Step 2: เปรียบเทียบเฉพาะใน Grid เดียวกัน  
  for (var key in grid) {  
    var bucket \= grid\[key\];  
    if (bucket.length \< 2\) continue; // มีแค่ตัวเดียวในพื้นที่นี้ ข้ามไป

    // เปรียบเทียบกันเองใน Bucket (จำนวนน้อยมาก Loop ได้สบาย)  
    for (var a \= 0; a \< bucket.length; a++) {  
      for (var b \= a \+ 1; b \< bucket.length; b++) {  
        var item1 \= bucket\[a\];  
        var item2 \= bucket\[b\];  
          
        // คำนวณระยะทางจริง (Haversine)  
        var dist \= getHaversineDistanceKM(item1.row\[idxLat\], item1.row\[idxLng\], item2.row\[idxLat\], item2.row\[idxLng\]);  
          
        // Threshold: 50 เมตร (0.05 กม.)  
        if (dist \<= 0.05) {  
          // เช็คชื่อว่าต่างกันไหม (ถ้าชื่อเหมือนกันเป๊ะ อาจเป็น Duplicate ปกติ ไม่ใช่ Hidden)  
          var name1 \= typeof normalizeText \=== 'function' ? normalizeText(item1.row\[idxName\]) : item1.row\[idxName\];  
          var name2 \= typeof normalizeText \=== 'function' ? normalizeText(item2.row\[idxName\]) : item2.row\[idxName\];  
            
          if (name1 \!== name2) {  
             duplicates.push({  
               row1: item1.index \+ 2,  
               name1: item1.row\[idxName\],  
               row2: item2.index \+ 2,  
               name2: item2.row\[idxName\],  
               distance: (dist \* 1000).toFixed(0) \+ " ม."  
             });  
          }  
        }  
      }  
    }  
  }

  console.timeEnd("HiddenDupesCheck"); // จบจับเวลา

  // Report Results  
  if (duplicates.length \> 0\) {  
    var msg \= "⚠️ พบพิกัดทับซ้อน (Hidden Duplicates) " \+ duplicates.length \+ " คู่:\\n\\n";  
    // แสดงสูงสุด 15 คู่แรก  
    duplicates.slice(0, 15).forEach(function(d) {  
      msg \+= \`• แถว ${d.row1} vs ${d.row2}: ${d.name1} / ${d.name2} (ห่าง ${d.distance})\\n\`;  
    });  
      
    if (duplicates.length \> 15\) msg \+= \`\\n...และอีก ${duplicates.length \- 15} คู่\`;  
      
    ui.alert(msg);  
    console.warn(\`\[Quality Check\] Hidden Duplicates Found: ${duplicates.length} pairs.\`);  
  } else {  
    ui.alert("✅ ไม่พบข้อมูลซ้ำซ้อนในระยะ 50 เมตร");  
    console.log("\[Quality Check\] No hidden duplicates found.");  
  }  
}

// \==========================================  
// 3\. UTILITIES INTEGRATION  
// \==========================================

// Fallback Function กรณี Utils\_Common โหลดไม่ทัน (Safety)  
if (typeof getHaversineDistanceKM \=== 'undefined') {  
  function getHaversineDistanceKM(lat1, lon1, lat2, lon2) {  
    var R \= 6371;   
    var dLat \= (lat2 \- lat1) \* Math.PI / 180;  
    var dLon \= (lon2 \- lon1) \* Math.PI / 180;  
    var a \= Math.sin(dLat/2) \* Math.sin(dLat/2) \+  
            Math.cos(lat1 \* Math.PI / 180\) \* Math.cos(lat2 \* Math.PI / 180\) \*  
            Math.sin(dLon/2) \* Math.sin(dLon/2);  
    var c \= 2 \* Math.atan2(Math.sqrt(a), Math.sqrt(1-a));  
    return R \* c;  
  }  
}

# Service\_Agent.gs

/\*\*  
 \* VERSION: 000  
 \* 🕵️ Service: Logistics AI Agent (Enterprise Edition)  
 \* Codename: "The Steward"  
 \* Version: 4.0 Smart Resolution & Safe Concurrency  
 \* \-------------------------------------------  
 \* \[PRESERVED\]: Manual/Scheduled Triggers and basic typo prediction logic.  
 \* \[FIXED v4.0\]: Changed Full-Sheet write to Specific-Column write to prevent data collision.  
 \* \[ADDED v4.0\]: resolveUnknownNamesWithAI() \- The Tier 4 Smart Resolution engine   
 \* that maps unknown names to Master\_UIDs and auto-updates NameMapping.  
 \* \[MODIFIED v4.0\]: AI Calls now enforce application/json for system stability.  
 \* Author: Elite Logistics Architect  
 \*/

var AGENT\_CONFIG \= {  
  NAME: "Logistics\_Agent\_01",  
  MODEL: (typeof CONFIG \!== 'undefined' && CONFIG.AI\_MODEL) ? CONFIG.AI\_MODEL : "gemini-1.5-flash",  
  BATCH\_SIZE: (typeof CONFIG \!== 'undefined' && CONFIG.AI\_BATCH\_SIZE) ? CONFIG.AI\_BATCH\_SIZE : 20,   
  TAG: "\[Agent\_V4\]" // Tag ประจำตัว Agent รุ่นใหม่  
};

// \==========================================  
// 1\. AGENT TRIGGERS & CONTROLS  
// \==========================================

/\*\*  
 \* 👋 สั่ง Agent ให้ตื่นมาทำงานเดี๋ยวนี้ (Manual Trigger)  
 \*/  
function WAKE\_UP\_AGENT() {  
  SpreadsheetApp.getUi().toast("🕵️ Agent: ผมตื่นแล้วครับ กำลังเริ่มวิเคราะห์ข้อมูล...", "AI Agent Started");  
    
  try {  
    runAgentLoop();   
    SpreadsheetApp.getUi().alert("✅ Agent รายงานผล:\\nวิเคราะห์ข้อมูลชุดล่าสุดเสร็จสิ้น (Batch Mode)");  
  } catch (e) {  
    SpreadsheetApp.getUi().alert("❌ Agent Error: " \+ e.message);  
  }  
}

/\*\*  
 \* ⏰ ตั้งเวลาให้ Agent ตื่นมาทำงานเองทุก 10 นาที  
 \*/  
function SCHEDULE\_AGENT\_WORK() {  
  var triggers \= ScriptApp.getProjectTriggers();  
  for (var i \= 0; i \< triggers.length; i++) {  
    if (triggers\[i\].getHandlerFunction() \=== "runAgentLoop") {  
      ScriptApp.deleteTrigger(triggers\[i\]);  
    }  
  }  
    
  ScriptApp.newTrigger("runAgentLoop")  
    .timeBased()  
    .everyMinutes(10)  
    .create();  
      
  SpreadsheetApp.getUi().alert("✅ ตั้งค่าเรียบร้อย\!\\nThe Steward จะทำงานทุก 10 นาที");  
}

// \==========================================  
// 2\. TIER 4: SMART RESOLUTION (NEW v4.0)  
// \==========================================

/\*\*  
 \* 🧠 \[NEW v4.0\] ฟังก์ชันส่งชื่อแปลกๆ ให้ AI วิเคราะห์จับคู่กับ Database  
 \* ถูกเรียกใช้โดยเมนู: 🧠 4️⃣ ส่งชื่อแปลกให้ AI วิเคราะห์ (Smart Resolution)  
 \*/  
function resolveUnknownNamesWithAI() {  
  var ss \= SpreadsheetApp.getActiveSpreadsheet();  
  var dataSheet \= ss.getSheetByName(typeof SCG\_CONFIG \!== 'undefined' ? SCG\_CONFIG.SHEET\_DATA : 'Data');  
  var dbSheet \= ss.getSheetByName(CONFIG.SHEET\_NAME);  
  var mapSheet \= ss.getSheetByName(CONFIG.MAPPING\_SHEET);  
    
  if (\!dataSheet || \!dbSheet || \!mapSheet) return;

  var lock \= LockService.getScriptLock();  
  if (\!lock.tryLock(30000)) {  
    SpreadsheetApp.getUi().alert("⚠️ ระบบคิวทำงาน", "มีระบบอื่นกำลังใช้งานอยู่ กรุณารอสักครู่", SpreadsheetApp.getUi().ButtonSet.OK);  
    return;  
  }

  try {  
    console.time("SmartResolution\_Time");  
      
    // 1\. หาชื่อที่ยังจับคู่ไม่ได้จากชีต Data (ดูจากคอลัมน์พิกัดว่าว่างไหม)  
    var dLastRow \= dataSheet.getLastRow();  
    if (dLastRow \< 2\) return;  
      
    var dataValues \= dataSheet.getRange(2, 1, dLastRow \- 1, 29).getValues();  
    var unknownNames \= new Set();  
      
    dataValues.forEach(function(r) {  
      var shipToName \= r\[10\]; // Col K: ShipToName  
      var actualGeo \= r\[26\];  // Col AA: LatLong\_Actual (พิกัดที่ระบบหาได้)  
      if (shipToName && \!actualGeo) {  
        unknownNames.add(normalizeText(shipToName));  
      }  
    });

    var unknownsArray \= Array.from(unknownNames).slice(0, AGENT\_CONFIG.BATCH\_SIZE);  
    if (unknownsArray.length \=== 0\) {  
      SpreadsheetApp.getUi().alert("ℹ️ AI Standby: ไม่มีรายชื่อตกหล่นที่ต้องให้ AI วิเคราะห์ครับ");  
      return;  
    }

    // 2\. ดึง Master Data มาเป็นตัวเลือกให้ AI  
    var mLastRow \= dbSheet.getLastRow();  
    var dbValues \= dbSheet.getRange(2, 1, mLastRow \- 1, Math.max(CONFIG.COL\_NAME, CONFIG.COL\_UUID)).getValues();  
    var masterOptions \= \[\];  
      
    dbValues.forEach(function(r) {  
      var name \= r\[CONFIG.C\_IDX.NAME\];  
      var uid \= r\[CONFIG.C\_IDX.UUID\];  
      if (name && uid) {  
        masterOptions.push({ "uid": uid, "name": name });  
      }  
    });

    // Limit master options to 500 to save context window (Optional, Gemini 1.5 handles big context well)  
    var masterSubset \= masterOptions.slice(0, 500);

    SpreadsheetApp.getActiveSpreadsheet().toast(\`กำลังส่ง ${unknownsArray.length} รายชื่อให้ AI วิเคราะห์...\`, "🤖 Tier 4 AI", 10);

    // 3\. ส่งข้อมูลให้ Gemini คิด (Prompt Engineering)  
    var apiKey \= CONFIG.GEMINI\_API\_KEY;  
    var prompt \= \`  
      You are an expert Thai Logistics Data Analyst.  
      I have a list of 'unknown\_names' from a daily delivery sheet. They contain typos, abbreviations, or missing branches.  
      I also have a 'master\_database' of valid delivery locations with their UIDs.  
        
      Task: Match each unknown name to the most likely master database entry.  
      If confidence is less than 60%, do not match it (skip it).  
        
      Unknown Names: ${JSON.stringify(unknownsArray)}  
      Master Database: ${JSON.stringify(masterSubset)}  
        
      Output ONLY a JSON array of objects with this format:  
      \[ { "variant": "Unknown Name", "uid": "Matched UID", "confidence": 95 } \]  
    \`;

    var payload \= {  
      "contents": \[{ "parts": \[{ "text": prompt }\] }\],  
      "generationConfig": { "responseMimeType": "application/json", "temperature": 0.1 }  
    };

    var response \= UrlFetchApp.fetch(\`https://generativelanguage.googleapis.com/v1beta/models/${AGENT\_CONFIG.MODEL}:generateContent?key=${apiKey}\`, {  
      "method": "post", "contentType": "application/json", "payload": JSON.stringify(payload), "muteHttpExceptions": true  
    });

    var json \= JSON.parse(response.getContentText());  
    if (\!json.candidates || json.candidates.length \=== 0\) throw new Error("AI returned no results.");  
      
    var aiResultText \= json.candidates\[0\].content.parts\[0\].text;  
    var matchedResults \= JSON.parse(aiResultText);

    // 4\. บันทึกผลลง NameMapping (5-Column Schema V4.0)  
    var mapRows \= \[\];  
    var ts \= new Date();  
      
    if (Array.isArray(matchedResults) && matchedResults.length \> 0\) {  
      matchedResults.forEach(function(match) {  
        if (match.uid && match.confidence \>= 60\) {  
          mapRows.push(\[  
            match.variant,       // Variant\_Name  
            match.uid,           // Master\_UID  
            match.confidence,    // Confidence\_Score  
            "AI\_Agent\_V4",       // Mapped\_By  
            ts                   // Timestamp  
          \]);  
        }  
      });  
    }

    if (mapRows.length \> 0\) {  
      mapSheet.getRange(mapSheet.getLastRow() \+ 1, 1, mapRows.length, 5).setValues(mapRows);  
        
      // สั่งเคลียร์ Cache ค้นหา และ รันจับคู่พิกัดซ้ำทันที  
      if (typeof clearSearchCache \=== 'function') clearSearchCache();  
      if (typeof applyMasterCoordinatesToDailyJob \=== 'function') applyMasterCoordinatesToDailyJob();  
        
      SpreadsheetApp.getUi().alert(\`✅ AI ทำงานสำเร็จ\!\\nจับคู่รายชื่อสำเร็จ ${mapRows.length} รายการ และบันทึกลง NameMapping อัตโนมัติแล้ว\`);  
    } else {  
      SpreadsheetApp.getUi().alert("ℹ️ AI ทำงานเสร็จสิ้น แต่ไม่สามารถจับคู่รายชื่อด้วยความมั่นใจเกิน 60% ได้ (ต้องตรวจสอบมือ)");  
    }

  } catch (e) {  
    console.error("\[AI Smart Resolution Error\]: " \+ e.message);  
    SpreadsheetApp.getUi().alert("❌ เกิดข้อผิดพลาดในระบบ AI: " \+ e.message);  
  } finally {  
    lock.releaseLock();  
    console.timeEnd("SmartResolution\_Time");  
  }  
}

// \==========================================  
// 3\. BACKGROUND TYPO PREDICTION LOOP  
// \==========================================

/\*\*  
 \* 🔄 Agent Loop (Optimized Safe Batch Processing V4.0)  
 \* \[FIXED v4.0\]: Write ONLY the specific columns to prevent Data Collision  
 \*/  
function runAgentLoop() {  
  console.time("Agent\_Thinking\_Time");  
    
  var lock \= LockService.getScriptLock();  
  if (\!lock.tryLock(5000)) {  
    console.warn("Agent: ระบบกำลังทำงานอยู่แล้ว ข้ามรอบนี้");  
    return;  
  }

  try {  
    if (\!CONFIG.GEMINI\_API\_KEY) {  
      console.error("Agent: Missing API Key");  
      return;  
    }

    var ss \= SpreadsheetApp.getActiveSpreadsheet();  
    var sheet \= ss.getSheetByName(CONFIG.SHEET\_NAME);   
    if (\!sheet) return;

    var lastRow \= sheet.getLastRow();  
    if (lastRow \< 2\) return;  
      
    // \[FIXED v4.0\]: อ่านแค่คอลัมน์ที่จำเป็น ไม่โหลดทั้งตาราง  
    var rangeName \= sheet.getRange(2, CONFIG.COL\_NAME, lastRow \- 1, 1);  
    var rangeNorm \= sheet.getRange(2, CONFIG.COL\_NORMALIZED, lastRow \- 1, 1);  
    var rangeUUID \= sheet.getRange(2, CONFIG.COL\_UUID, lastRow \- 1, 1);

    var names \= rangeName.getValues();  
    var norms \= rangeNorm.getValues();  
    var uuids \= rangeUUID.getValues();  
      
    var jobsDone \= 0;  
    var isUpdated \= false;

    for (var i \= 0; i \< names.length; i++) {  
      if (jobsDone \>= AGENT\_CONFIG.BATCH\_SIZE) break;

      var name \= names\[i\]\[0\];  
      var currentNorm \= norms\[i\]\[0\];  
        
      if (name && (\!currentNorm || String(currentNorm).indexOf(AGENT\_CONFIG.TAG) \=== \-1)) {  
        console.log(\`Agent: Analyzing Row ${i+2} \-\> "${name}"\`);  
          
        var aiThoughts \= "";  
        try {  
           aiThoughts \= (typeof genericRetry \=== 'function')   
             ? genericRetry(function() { return askGeminiToPredictTypos(name); }, 2\)  
             : askGeminiToPredictTypos(name);  
        } catch(e) {  
           console.warn("AI Failed for " \+ name);  
           continue;   
        }  
          
        // Update Memory Arrays  
        norms\[i\]\[0\] \= ((currentNorm ? currentNorm \+ " " : "") \+ aiThoughts \+ " " \+ AGENT\_CONFIG.TAG).trim();  
          
        if (\!uuids\[i\]\[0\]) {  
          uuids\[i\]\[0\] \= generateUUID();  
        }

        jobsDone++;  
        isUpdated \= true;  
      }  
    }  
      
    // \[FIXED v4.0\]: เขียนกลับเฉพาะคอลัมน์ตัวเอง (Safe Write)  
    if (isUpdated) {  
      rangeNorm.setValues(norms);  
      rangeUUID.setValues(uuids);  
      console.log(\`Agent: ✅ Batch Update Completed (${jobsDone} rows)\`);  
    } else {  
      console.log("Agent: ไม่มีงานใหม่ (No pending rows)");  
    }  
      
  } catch (e) {  
    console.error("Agent Fatal Error: " \+ e.message);  
  } finally {  
    lock.releaseLock();  
    console.timeEnd("Agent\_Thinking\_Time");  
  }  
}

/\*\*  
 \* 📡 Skill: การคาดเดาคำผิด (Typos Prediction)  
 \* \[MODIFIED v4.0\]: Enforced JSON output for stability  
 \*/  
function askGeminiToPredictTypos(originalName) {  
  var prompt \= \`  
    Task: You are a Thai Logistics Search Agent.  
    Input Name: "${originalName}"  
    Goal: Generate search keywords including common typos, phonetic spellings, and abbreviations.  
    Constraint: Output ONLY a JSON array of strings.  
    Example Input: "บี-ควิก (สาขาลาดพร้าว)"  
    Example Output: \["บีควิก", "บีขวิก", "บีวิก", "BeQuik", "BQuik", "B-Quik", "ลาดพร้าว", "BQuick"\]  
  \`;

  var payload \= {  
    "contents": \[{ "parts": \[{ "text": prompt }\] }\],  
    "generationConfig": { "responseMimeType": "application/json", "temperature": 0.4 }  
  };

  var options \= {  
    "method": "post",  
    "contentType": "application/json",  
    "payload": JSON.stringify(payload),  
    "muteHttpExceptions": true  
  };

  var url \= \`https://generativelanguage.googleapis.com/v1beta/models/${AGENT\_CONFIG.MODEL}:generateContent?key=${CONFIG.GEMINI\_API\_KEY}\`;  
    
  var response \= UrlFetchApp.fetch(url, options);  
    
  if (response.getResponseCode() \!== 200\) {  
    throw new Error("Gemini API Error: " \+ response.getContentText());  
  }

  var json \= JSON.parse(response.getContentText());

  if (json.candidates && json.candidates\[0\].content) {  
    var text \= json.candidates\[0\].content.parts\[0\].text;  
    var keywordsArray \= JSON.parse(text);  
    if (Array.isArray(keywordsArray)) {  
       return keywordsArray.join(" "); // รวมเป็น String เพื่อเก็บลงช่อง Normalized  
    }  
  }  
    
  return "";  
}

# Test\_AI.gs

/\*\*  
 \* VERSION: 000  
 \* 🧪 Test & Debug: AI Capabilities (Enterprise Debugging Suite)  
 \* Version: 4.0 Compatible with System V4.0  
 \* \---------------------------------------------  
 \* \[PRESERVED\]: Manual triggers, Connection test, and Row Reset logic.  
 \* \[MODIFIED v4.0\]: Upgraded debug\_ResetSelectedRowsAI to clear both \[AI\] and \[Agent\_V4\] tags.  
 \* \[MODIFIED v4.0\]: Replaced legacy Browser.msgBox with SpreadsheetApp.getUi() for stability.  
 \* \[ADDED v4.0\]: debug\_TestTier4SmartResolution() to manually trigger the new Tier 4 AI.  
 \* Author: Elite Logistics Architect  
 \*/

// \==========================================  
// 1\. MANUAL TRIGGERS (AI BATCH RUNNERS)  
// \==========================================

/\*\*  
 \* 🚀 Manual Trigger: สั่งรัน AI ทันที (AutoPilot Batch \- 20 แถว)  
 \* ใช้สำหรับทดสอบการทำงาน หรือเร่งด่วนเก็บตกข้อมูล (สร้าง Index)  
 \*/  
function forceRunAI\_Now() {  
  var ui \= SpreadsheetApp.getUi();  
  var ss \= SpreadsheetApp.getActiveSpreadsheet();  
    
  try {  
    // 1\. Dependency Check  
    if (typeof processAIIndexing\_Batch \!== 'function') {  
      throw new Error("Critical: ไม่พบฟังก์ชัน 'processAIIndexing\_Batch' ใน Service\_AutoPilot.gs");  
    }

    // 2\. Execution  
    ss.toast("🚀 กำลังเริ่มระบบ AI Indexing (Batch Mode)...", "Debug System", 10);  
    console.info("\[Debug\] Manual Trigger: processAIIndexing\_Batch");  
      
    // เรียกฟังก์ชันจาก Service\_AutoPilot  
    processAIIndexing\_Batch();   
      
    ui.alert(  
      "✅ สั่งงานเรียบร้อย\!\\n" \+  
      "ระบบได้ประมวลผลข้อมูลชุดล่าสุดเสร็จสิ้น\\n" \+  
      "กรุณาตรวจสอบคอลัมน์ Normalized ใน Database ว่ามี Tag '\[AI\]' หรือไม่"  
    );  
      
  } catch (e) {  
    console.error("\[Debug Error\] forceRunAI\_Now: " \+ e.message);  
    ui.alert("❌ Error: " \+ e.message);  
  }  
}

/\*\*  
 \* 🧠 \[NEW v4.0\] Manual Trigger: ทดสอบ Tier 4 Smart Resolution ทันที  
 \*/  
function debug\_TestTier4SmartResolution() {  
  var ui \= SpreadsheetApp.getUi();  
  try {  
    if (typeof resolveUnknownNamesWithAI \!== 'function') {  
      throw new Error("Critical: ไม่พบฟังก์ชัน 'resolveUnknownNamesWithAI' ใน Service\_Agent.gs");  
    }  
      
    var response \= ui.alert("🧠 ยืนยันรันทดสอบ Tier 4", "ต้องการดึงรายชื่อที่ไม่มีพิกัดจากหน้า SCG Data\\nไปให้ Gemini วิเคราะห์จับคู่กับ Master Database เลยหรือไม่?", ui.ButtonSet.YES\_NO);  
      
    if (response \== ui.Button.YES) {  
      console.info("\[Debug\] Manual Trigger: resolveUnknownNamesWithAI");  
      resolveUnknownNamesWithAI();  
    }  
  } catch (e) {  
    console.error("\[Debug Error\] Tier 4 Test: " \+ e.message);  
    ui.alert("❌ Error: " \+ e.message);  
  }  
}

// \==========================================  
// 2\. API CONNECTION TESTING  
// \==========================================

/\*\*  
 \* 📡 Connection Test: ทดสอบคุยกับ Gemini (ไม่ยุ่งกับ Database)  
 \* ใช้เช็คว่า API Key ใช้งานได้จริงหรือไม่  
 \*/  
function debugGeminiConnection() {  
  var ui \= SpreadsheetApp.getUi();  
  var apiKey;  
    
  try {  
    // \[MODIFIED v4.0\] Safe Getter Extraction  
    apiKey \= CONFIG.GEMINI\_API\_KEY;  
  } catch (e) {  
    ui.alert("❌ API Key Error", "กรุณาตั้งค่า API Key ผ่าน Setup\_Security.gs ก่อนครับ\\n(" \+ e.message \+ ")", ui.ButtonSet.OK);  
    return;  
  }

  var testWord \= "SCG (Bang Sue Branch)";  
  ui.alert("📡 กำลังทดสอบส่งข้อความหา Gemini...\\nInput: " \+ testWord);  
    
  try {  
    console.info("\[Debug\] Pinging Gemini API...");  
      
    // Fallback: ยิง API เองเพื่อ Isolate ปัญหา (จะได้รู้ว่าผิดที่ฟังก์ชันหรือ API)  
    var model \= (typeof CONFIG \!== 'undefined' && CONFIG.AI\_MODEL) ? CONFIG.AI\_MODEL : "gemini-1.5-flash";  
    var url \= \`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}\`;  
    var payload \= {   
      "contents": \[{ "parts": \[{ "text": \`Hello Gemini, test connection. Say "Connection Success" and reply with Thai translation of ${testWord}\` }\] }\]   
    };  
    var options \= {  
      "method": "post", "contentType": "application/json",  
      "payload": JSON.stringify(payload), "muteHttpExceptions": true  
    };  
      
    var res \= UrlFetchApp.fetch(url, options);  
      
    if (res.getResponseCode() \=== 200\) {  
      var json \= JSON.parse(res.getContentText());  
      var text \= (json.candidates && json.candidates\[0\].content) ? json.candidates\[0\].content.parts\[0\].text : "No Text Data";  
      ui.alert("✅ API Ping Success\!\\n\\nResponse:\\n" \+ text);  
      console.log("\[Debug\] Gemini API Connection: OK");  
    } else {  
      ui.alert("❌ API Error: " \+ res.getContentText());  
      console.error("\[Debug\] Gemini API Error: " \+ res.getContentText());  
    }  
      
  } catch (e) {  
    ui.alert("❌ Connection Failed: " \+ e.message);  
    console.error("\[Debug\] Connection Failed: " \+ e.message);  
  }  
}

// \==========================================  
// 3\. ROW MANIPULATION (FOR RE-RUNNING AI)  
// \==========================================

/\*\*  
 \* 🔄 Reset AI Tags: ล้าง Tag ระบบ AI เพื่อให้รันใหม่ (เฉพาะแถวที่เลือก)  
 \* \[MODIFIED v4.0\]: ล้างทั้ง \[AI\] และ \[Agent\_V4\]  
 \*/  
function debug\_ResetSelectedRowsAI() {  
  var ss \= SpreadsheetApp.getActiveSpreadsheet();  
  var ui \= SpreadsheetApp.getUi();  
  var sheet \= ss.getActiveSheet();  
    
  if (sheet.getName() \!== CONFIG.SHEET\_NAME) {  
    ui.alert("⚠️ System Note", "กรุณาไฮไลต์เลือก Cell ในชีต Database เท่านั้นครับ", ui.ButtonSet.OK);  
    return;  
  }  
    
  var range \= sheet.getActiveRange();  
  var startRow \= range.getRow();  
  var numRows \= range.getNumRows();  
    
  // ใช้ C\_IDX ถ้ามี หรือ Fallback  
  var colIndex \= (typeof CONFIG \!== 'undefined' && CONFIG.COL\_NORMALIZED) ? CONFIG.COL\_NORMALIZED : 6;   
    
  var targetRange \= sheet.getRange(startRow, colIndex, numRows, 1);  
  var values \= targetRange.getValues();  
    
  var resetCount \= 0;  
  for (var i \= 0; i \< values.length; i++) {  
    var val \= values\[i\]\[0\] ? values\[i\]\[0\].toString() : "";  
      
    // ตรวจหา Tag ของ AI (ทั้งระบบเก่าและใหม่)  
    if (val.indexOf("\[AI\]") \!== \-1 || val.indexOf("\[Agent\_") \!== \-1) {  
        
      // ลบ Tags ออก (ทิ้งคำที่ AI เติมไว้ได้ หรือจะลบให้ว่างเลยก็ได้)  
      // V4.0 เราเลือกลบแค่ตัว Tag ออกเพื่อให้ AI เข้ามาประมวลผลซ้ำ  
      var cleanedVal \= val  
        .replace(" \[AI\]", "").replace("\[AI\]", "")  
        .replace(/\\\[Agent\_.\*?\\\]/g, "") // ลบ Tag รูปแบบ \[Agent\_xxx\] ทั้งหมด  
        .trim();  
          
      values\[i\]\[0\] \= cleanedVal;   
      resetCount++;  
    }  
  }  
    
  if (resetCount \> 0\) {  
    targetRange.setValues(values);  
    ss.toast("🔄 Reset AI Status เรียบร้อย " \+ resetCount \+ " แถว", "Debug", 5);  
    console.log(\`\[Debug\] Reset AI tags for ${resetCount} rows.\`);  
  } else {  
    ss.toast("ℹ️ ไม่พบรายการที่มี Tag AI ในส่วนที่คุณไฮไลต์เลือกไว้", "Debug", 5);  
  }  
}

# Setup\_Security.gs

/\*\*  
 \* VERSION: 000  
 \* 🔐 Security Setup Utility (Enterprise Edition)  
 \* Version: 4.0 Omni-Vault (Safe Storage & Validation)  
 \* \-----------------------------------------------------------------  
 \* \[PRESERVED\]: PropertiesService for secure credential storage.  
 \* \[MODIFIED v4.0\]: Upgraded validation to check for "AIza" prefix for Gemini.  
 \* \[MODIFIED v4.0\]: Changed resetEnvironment to selectively delete keys (preventing full wipe).  
 \* \[ADDED v4.0\]: setupLineToken() & setupTelegramConfig() to support Menu V4.0.  
 \* \[MODIFIED v4.0\]: Switched to console.info for GCP Audit Logging.  
 \* Author: Elite Logistics Architect  
 \*/

// \==========================================  
// 1\. GEMINI AI (CORE SECURITY)  
// \==========================================

/\*\*  
 \* 🔐 ตั้งค่า Gemini API Key อย่างปลอดภัย  
 \* ห้ามแก้ Config.gs เพื่อใส่ Key โดยตรงเด็ดขาด\!  
 \*/  
function setupEnvironment() {  
  var ui \= SpreadsheetApp.getUi();  
    
  var response \= ui.prompt(  
    '🔐 Security Setup: Gemini API',   
    'กรุณากรอก Gemini API Key (ต้องขึ้นต้นด้วย AIza...):\\nสามารถรับฟรีได้ที่ Google AI Studio',   
    ui.ButtonSet.OK\_CANCEL  
  );

  if (response.getSelectedButton() \== ui.Button.OK) {  
    var key \= response.getResponseText().trim();  
      
    // \[MODIFIED v4.0\]: ตรวจสอบความถูกต้องของ Key ขั้นสูง  
    if (key.length \> 30 && key.startsWith("AIza")) {  
      // Save to Script Properties (Hidden & Secure)  
      PropertiesService.getScriptProperties().setProperty('GEMINI\_API\_KEY', key);  
        
      ui.alert('✅ บันทึก API Key สำเร็จ\!\\nระบบ AI พร้อมใช้งานแล้วครับ');  
      console.info("\[Security Audit\] User updated GEMINI\_API\_KEY.");  
    } else {  
      ui.alert('❌ API Key ไม่ถูกต้อง', 'Key ของ Gemini ต้องขึ้นต้นด้วย "AIza" และมีความยาวที่ถูกต้อง กรุณาลองใหม่ครับ', ui.ButtonSet.OK);  
      console.warn("\[Security Audit\] Failed attempt to update GEMINI\_API\_KEY (Invalid format).");  
    }  
  } else {  
    console.info("\[Security Audit\] Setup cancelled by user.");  
  }  
}

// \==========================================  
// 2\. NOTIFICATION TOKENS (NEW v4.0)  
// \==========================================

/\*\*  
 \* 🔔 \[ADDED v4.0\] ตั้งค่า LINE Notify Token  
 \* รองรับเมนู V4.0 ที่ประกาศไว้ใน Menu.gs  
 \*/  
function setupLineToken() {  
  var ui \= SpreadsheetApp.getUi();  
  var response \= ui.prompt(  
    '🔔 Setup: LINE Notify',   
    'กรุณากรอก LINE Notify Token ของกลุ่มที่ต้องการให้ระบบแจ้งเตือน:',   
    ui.ButtonSet.OK\_CANCEL  
  );

  if (response.getSelectedButton() \== ui.Button.OK) {  
    var token \= response.getResponseText().trim();  
    if (token.length \> 20\) {  
      PropertiesService.getScriptProperties().setProperty('LINE\_NOTIFY\_TOKEN', token);  
      ui.alert('✅ บันทึก LINE Token สำเร็จ\!');  
      console.info("\[Security Audit\] User updated LINE\_NOTIFY\_TOKEN.");  
    } else {  
      ui.alert('❌ Token สั้นเกินไป กรุณาตรวจสอบอีกครั้ง');  
    }  
  }  
}

/\*\*  
 \* ✈️ \[ADDED v4.0\] ตั้งค่า Telegram Config (Bot Token & Chat ID)  
 \*/  
function setupTelegramConfig() {  
  var ui \= SpreadsheetApp.getUi();  
  var props \= PropertiesService.getScriptProperties();  
    
  var resBot \= ui.prompt('✈️ Setup: Telegram', '1. กรุณากรอก Bot Token (เช่น 123456:ABC-DEF...):', ui.ButtonSet.OK\_CANCEL);  
  if (resBot.getSelectedButton() \!== ui.Button.OK) return;  
  var botToken \= resBot.getResponseText().trim();

  var resChat \= ui.prompt('✈️ Setup: Telegram', '2. กรุณากรอก Chat ID (เช่น \-100123456789):', ui.ButtonSet.OK\_CANCEL);  
  if (resChat.getSelectedButton() \!== ui.Button.OK) return;  
  var chatId \= resChat.getResponseText().trim();

  if (botToken && chatId) {  
    props.setProperty('TG\_BOT\_TOKEN', botToken);  
    props.setProperty('TG\_CHAT\_ID', chatId);  
    ui.alert('✅ บันทึก Telegram Config สำเร็จ\!');  
    console.info("\[Security Audit\] User updated Telegram configurations.");  
  } else {  
    ui.alert('❌ ข้อมูลไม่ครบถ้วน ยกเลิกการบันทึก');  
  }  
}

// \==========================================  
// 3\. MAINTENANCE & AUDIT  
// \==========================================

/\*\*  
 \* 🗑️ \[MODIFIED v4.0\] ล้างค่าเฉพาะระบบที่ต้องการ (Safe Reset)  
 \* ป้องกันการเผลอลบ Token สำคัญอื่นๆ ที่ไม่ได้เกี่ยวข้อง  
 \*/  
function resetEnvironment() {  
  var ui \= SpreadsheetApp.getUi();  
  var response \= ui.alert(  
    '⚠️ Danger Zone',   
    'คุณต้องการล้างรหัส API Key ของ Gemini ใช่หรือไม่?\\n(ระบบจะลบเฉพาะ GEMINI\_API\_KEY เท่านั้น)',   
    ui.ButtonSet.YES\_NO  
  );

  if (response \== ui.Button.YES) {  
    PropertiesService.getScriptProperties().deleteProperty('GEMINI\_API\_KEY');  
    ui.alert('🗑️ ล้างการตั้งค่า Gemini API Key เรียบร้อยแล้ว');  
    console.info("\[Security Audit\] User DELETED GEMINI\_API\_KEY.");  
  }  
}

/\*\*  
 \* 🏥 ตรวจสอบสถานะการเชื่อมต่อ (System Secrets Status)  
 \* ใช้ตรวจเช็คว่าเราลืมใส่ Key ไหนไปบ้าง โดยไม่เปิดเผย Key จริง  
 \*/  
function checkCurrentKeyStatus() {  
  var props \= PropertiesService.getScriptProperties();  
  var geminiKey \= props.getProperty('GEMINI\_API\_KEY');  
  var lineToken \= props.getProperty('LINE\_NOTIFY\_TOKEN');  
  var tgBot \= props.getProperty('TG\_BOT\_TOKEN');  
  var ui \= SpreadsheetApp.getUi();  
    
  var statusMsg \= "📊 \*\*System Secrets Status\*\*\\n\\n";  
    
  if (geminiKey) {  
    statusMsg \+= "🟢 Gemini AI: READY (Ends with ..." \+ geminiKey.slice(-4) \+ ")\\n";  
  } else {  
    statusMsg \+= "🔴 Gemini AI: NOT SET\\n";  
  }

  if (lineToken) {  
    statusMsg \+= "🟢 LINE Notify: READY\\n";  
  } else {  
    statusMsg \+= "⚪ LINE Notify: NOT SET\\n";  
  }

  if (tgBot) {  
    statusMsg \+= "🟢 Telegram: READY\\n";  
  } else {  
    statusMsg \+= "⚪ Telegram: NOT SET\\n";  
  }

  ui.alert("System Health Check", statusMsg, ui.ButtonSet.OK);  
  console.info("\[Security Audit\] Secrets status checked by user.");  
}

# Service\_Maintenance.gs

/\*\*  
 \* VERSION: 000  
 \* 🧹 Service: System Maintenance & Alerts (Enterprise Edition)  
 \* หน้าที่: ดูแลรักษาความสะอาดไฟล์ ลบ Backup เก่า และแจ้งเตือนผ่าน LINE/Telegram  
 \* Version: 4.0 Omni-Alerts & Housekeeping  
 \* \---------------------------------------------  
 \* \[PRESERVED\]: 10M Cell Limit check and 30-day Backup retention logic.  
 \* \[ADDED v4.0\]: Fully implemented sendLineNotify() and sendTelegramNotify().  
 \* \[MODIFIED v4.0\]: Improved Regex for extracting dates from Backup sheets.  
 \* \[MODIFIED v4.0\]: Added LockService and GCP Console Logging.  
 \* Author: Elite Logistics Architect  
 \*/

// \==========================================  
// 1\. SYSTEM MAINTENANCE (HOUSEKEEPING)  
// \==========================================

/\*\*  
 \* 🗑️ ลบชีต Backup ที่เก่ากว่า 30 วัน (แนะนำให้ตั้ง Trigger รันทุกสัปดาห์)  
 \*/  
function cleanupOldBackups() {  
  var lock \= LockService.getScriptLock();  
  if (\!lock.tryLock(10000)) {  
    console.warn("\[Maintenance\] ข้ามการทำงานเนื่องจากระบบอื่นกำลังใช้งานอยู่");  
    return;  
  }

  try {  
    var ss \= SpreadsheetApp.getActiveSpreadsheet();  
    var sheets \= ss.getSheets();  
    var deletedCount \= 0;  
    var keepDays \= 30; // เก็บย้อนหลัง 30 วัน  
    var now \= new Date();  
    var deletedNames \= \[\];

    sheets.forEach(function(sheet) {  
      var name \= sheet.getName();  
        
      // ตรวจสอบชื่อชีตที่ขึ้นต้นด้วย "Backup\_"  
      if (name.startsWith("Backup\_")) {  
        // \[MODIFIED v4.0\]: แกะวันที่จากรูปแบบ Backup\_DB\_yyyyMMdd\_HHmm  
        var datePart \= name.match(/(\\d{4})(\\d{2})(\\d{2})/); // จับกลุ่ม ปี(4) เดือน(2) วัน(2)  
          
        if (datePart && datePart.length \=== 4\) {  
          var year \= parseInt(datePart\[1\]);  
          var month \= parseInt(datePart\[2\]) \- 1; // JS Month starts at 0  
          var day \= parseInt(datePart\[3\]);  
            
          var sheetDate \= new Date(year, month, day);  
          var diffTime \= Math.abs(now \- sheetDate);  
          var diffDays \= Math.ceil(diffTime / (1000 \* 60 \* 60 \* 24)); 

          if (diffDays \> keepDays) {  
            try {  
              ss.deleteSheet(sheet);  
              deletedCount++;  
              deletedNames.push(name);  
            } catch(e) {  
              console.error("\[Maintenance\] Could not delete " \+ name \+ ": " \+ e.message);  
            }  
          }  
        }  
      }  
    });

    if (deletedCount \> 0\) {  
      var msg \= \`🧹 Maintenance Report:\\nระบบได้ลบชีต Backup ที่เก่ากว่า ${keepDays} วัน จำนวน ${deletedCount} ชีตเรียบร้อยแล้ว\`;  
      console.info(\`\[Maintenance\] Deleted ${deletedCount} old backups: ${deletedNames.join(", ")}\`);  
        
      // แจ้งเตือนผู้ดูแลระบบ  
      sendLineNotify(msg);  
      sendTelegramNotify(msg);  
      SpreadsheetApp.getActiveSpreadsheet().toast(\`ลบ Backup เก่าไป ${deletedCount} ชีต\`, "Maintenance");  
    } else {  
      console.log("\[Maintenance\] No old backups to delete.");  
    }  
  } catch (err) {  
    console.error("\[Maintenance\] Error: " \+ err.message);  
  } finally {  
    lock.releaseLock();  
  }  
}

/\*\*  
 \* 🏥 ตรวจสอบสุขภาพไฟล์ (Cell Limit Check)  
 \* แนะนำให้ตั้ง Trigger รันวันละ 1 ครั้ง  
 \*/  
function checkSpreadsheetHealth() {  
  var ss \= SpreadsheetApp.getActiveSpreadsheet();  
    
  // Google Sheets Limit: 10 Million Cells (Enterprise Standard)  
  var cellLimit \= 10000000;  
  var totalCells \= 0;  
  var sheetCount \= 0;  
    
  ss.getSheets().forEach(function(s) {  
    totalCells \+= (s.getMaxRows() \* s.getMaxColumns());  
    sheetCount++;  
  });  
    
  var usagePercent \= (totalCells / cellLimit) \* 100;  
  var msg \= \`🏥 System Health Report:\\n- จำนวนชีต: ${sheetCount}\\n- การใช้งาน: ${totalCells.toLocaleString()} Cells\\n- อัตราการใช้: ${usagePercent.toFixed(2)}%\`;  
    
  console.info(\`\[System Health\] Usage: ${usagePercent.toFixed(2)}% (${totalCells}/${cellLimit} cells)\`);  
    
  if (usagePercent \> 80\) {  
    var warn \= \`⚠️ CRITICAL WARNING: ไฟล์ใกล้เต็มแล้ว\!\\n\\nการใช้งานปัจจุบันอยู่ที่ ${usagePercent.toFixed(2)}% (${totalCells.toLocaleString()} Cells)\\nกรุณารันฟังก์ชันลบ Backup เก่า หรือย้ายข้อมูลไปยังไฟล์ใหม่ด่วนครับ\`;  
      
    // แจ้งเตือนฉุกเฉิน  
    sendLineNotify(warn, true);  
    sendTelegramNotify(warn);  
    SpreadsheetApp.getUi().alert("⚠️ SYSTEM ALERT", warn, SpreadsheetApp.getUi().ButtonSet.OK);  
  } else {  
    // ถ้ารันมือผ่านเมนู ให้โชว์ Toast  
    SpreadsheetApp.getActiveSpreadsheet().toast(\`System Health OK (${usagePercent.toFixed(1)}%)\`, "Health Check", 5);  
  }  
}

// \==========================================  
// 2\. OMNI-CHANNEL ALERTS (NEW v4.0)  
// \==========================================

/\*\*  
 \* 🔔 \[ADDED v4.0\] ฟังก์ชันส่งข้อความเข้า LINE Notify  
 \*/  
function sendLineNotify(message, isUrgent) {  
  try {  
    var token \= PropertiesService.getScriptProperties().getProperty('LINE\_NOTIFY\_TOKEN');  
    if (\!token) return; // ถ้าไม่ตั้งค่าไว้ ให้ข้ามไปเงียบๆ

    var options \= {  
      "method": "post",  
      "headers": {  
        "Authorization": "Bearer " \+ token  
      },  
      "payload": {  
        "message": (isUrgent ? "\\n🚨 URGENT ALERT 🚨\\n" : "\\nℹ️ System Update\\n") \+ message  
      },  
      "muteHttpExceptions": true  
    };  
      
    var response \= UrlFetchApp.fetch("https://notify-api.line.me/api/notify", options);  
    if (response.getResponseCode() \!== 200\) {  
      console.warn("\[LINE Notify Error\] " \+ response.getContentText());  
    }  
  } catch (e) {  
    console.error("\[LINE Notify Exception\] " \+ e.message);  
  }  
}

/\*\*  
 \* ✈️ \[ADDED v4.0\] ฟังก์ชันส่งข้อความเข้า Telegram  
 \*/  
function sendTelegramNotify(message) {  
  try {  
    var props \= PropertiesService.getScriptProperties();  
    var botToken \= props.getProperty('TG\_BOT\_TOKEN');  
    var chatId \= props.getProperty('TG\_CHAT\_ID');  
      
    if (\!botToken || \!chatId) return; // ถ้าไม่ตั้งค่าไว้ ให้ข้ามไปเงียบๆ

    var url \= "https://api.telegram.org/bot" \+ botToken \+ "/sendMessage";  
    var payload \= {  
      "chat\_id": chatId,  
      "text": "🚚 \*Logistics Master System\*\\n\\n" \+ message,  
      "parse\_mode": "Markdown"  
    };

    var options \= {  
      "method": "post",  
      "contentType": "application/json",  
      "payload": JSON.stringify(payload),  
      "muteHttpExceptions": true  
    };

    var response \= UrlFetchApp.fetch(url, options);  
    if (response.getResponseCode() \!== 200\) {  
      console.warn("\[Telegram Error\] " \+ response.getContentText());  
    }  
  } catch (e) {  
    console.error("\[Telegram Exception\] " \+ e.message);  
  }  
}

# Service\_Notify.gs

/\*\*  
 \* VERSION: 000  
 \* 🔔 Service: Omni-Channel Notification Hub (Enterprise Edition)  
 \* Version: 4.0 Centralized Broadcaster  
 \* หน้าที่: ศูนย์กลางส่งแจ้งเตือนสถานะระบบและ Error เข้า LINE และ Telegram  
 \* \------------------------------------------------  
 \* \[PRESERVED\]: Dual-channel architecture and HTML escaping.  
 \* \[REMOVED v4.0\]: Setup functions removed (Delegated to Setup\_Security.gs V4.0).  
 \* \[MODIFIED v4.0\]: Overrides basic notifiers in Module 14 with robust Try-Catch logic.  
 \* \[MODIFIED v4.0\]: Prevents API limits/errors from crashing main business flows.  
 \* Author: Elite Logistics Architect  
 \*/

// \==========================================  
// 1\. CORE SENDING LOGIC (Unified Broadcaster)  
// \==========================================

/\*\*  
 \* 📤 ฟังก์ชันส่งข้อความรวม (Broadcast V4.0)  
 \* ส่งเข้าทุกช่องทางที่ตั้งค่าไว้ (LINE และ/หรือ Telegram)  
 \* @param {string} message \- ข้อความ  
 \* @param {boolean} isUrgent \- เป็น Error หรือเรื่องด่วนหรือไม่  
 \*/  
function sendSystemNotify(message, isUrgent) {  
  console.info(\`\[Notification Hub\] Broadcasting message (Urgent: ${\!\!isUrgent})\`);  
    
  // รันแบบขนาน (จำลองใน GAS โดยใช้ Try-Catch แยกกัน)  
  // ป้องกันกรณีช่องทางใดช่องทางหนึ่งตาย แล้วพาลให้อีกช่องทางไม่ส่ง  
    
  try {  
    sendLineNotify\_Internal\_(message, isUrgent);  
  } catch (e) {  
    console.error("\[Notify Hub\] LINE Broadcast Failed: " \+ e.message);  
  }

  try {  
    sendTelegramNotify\_Internal\_(message, isUrgent);  
  } catch (e) {  
    console.error("\[Notify Hub\] Telegram Broadcast Failed: " \+ e.message);  
  }  
}

// \==========================================  
// 2\. PUBLIC WRAPPERS (Overrides Module 14\)  
// \==========================================

/\*\*  
 \* \[MODIFIED v4.0\] Wrapper สำหรับเขียนทับ (Override) ฟังก์ชันใน Service\_Maintenance.gs  
 \* ทำให้ทุกการเรียกใช้ sendLineNotify ในระบบ วิ่งมาใช้ Logic ระดับ Enterprise ตัวนี้แทน  
 \*/  
function sendLineNotify(message, isUrgent) {  
  sendLineNotify\_Internal\_(message, isUrgent);  
}

/\*\*  
 \* \[MODIFIED v4.0\] Wrapper สำหรับเขียนทับ (Override) ฟังก์ชันใน Service\_Maintenance.gs  
 \*/  
function sendTelegramNotify(message, isUrgent) {  
  sendTelegramNotify\_Internal\_(message, isUrgent);  
}

// \==========================================  
// 3\. INTERNAL CHANNEL HANDLERS  
// \==========================================

/\*\*  
 \* Internal: ยิง API เข้า LINE Notify อย่างปลอดภัย  
 \*/  
function sendLineNotify\_Internal\_(message, isUrgent) {  
  var token \= PropertiesService.getScriptProperties().getProperty('LINE\_NOTIFY\_TOKEN');  
  if (\!token) return; // Silent skip if not configured

  var prefix \= isUrgent ? "🚨 URGENT ALERT:\\n" : "🤖 SYSTEM REPORT:\\n";  
  var fullMsg \= prefix \+ message;

  try {  
    var response \= UrlFetchApp.fetch("https://notify-api.line.me/api/notify", {  
      "method": "post",  
      "headers": { "Authorization": "Bearer " \+ token },  
      "payload": { "message": fullMsg },  
      "muteHttpExceptions": true  
    });  
      
    if (response.getResponseCode() \!== 200\) {  
      console.warn("\[LINE API Error\] " \+ response.getContentText());  
    }  
  } catch (e) {  
    console.warn("\[LINE Exception\] " \+ e.message);  
  }  
}

/\*\*  
 \* Internal: ยิง API เข้า Telegram อย่างปลอดภัย  
 \*/  
function sendTelegramNotify\_Internal\_(message, isUrgent) {  
  var token \= PropertiesService.getScriptProperties().getProperty('TG\_BOT\_TOKEN'); // ใช้ Key ตาม Setup\_Security V4.0  
  var chatId \= PropertiesService.getScriptProperties().getProperty('TG\_CHAT\_ID');  // ใช้ Key ตาม Setup\_Security V4.0  
    
  // Fallback for V2.0 keys if still present  
  if (\!token) token \= PropertiesService.getScriptProperties().getProperty('TELEGRAM\_BOT\_TOKEN');  
  if (\!chatId) chatId \= PropertiesService.getScriptProperties().getProperty('TELEGRAM\_CHAT\_ID');

  if (\!token || \!chatId) return; // Silent skip if not configured

  // Format Message (HTML Style)  
  var icon \= isUrgent ? "🚨" : "🤖";  
  var title \= isUrgent ? "\<b\>SYSTEM ALERT\</b\>" : "\<b\>SYSTEM REPORT\</b\>";  
  var htmlMsg \= \`${icon} ${title}\\n\\n${escapeHtml\_(message)}\`;

  try {  
    var url \= "https://api.telegram.org/bot" \+ token \+ "/sendMessage";  
    var payload \= {  
      "chat\_id": chatId,  
      "text": htmlMsg,  
      "parse\_mode": "HTML"  
    };

    var response \= UrlFetchApp.fetch(url, {  
      "method": "post",  
      "contentType": "application/json",  
      "payload": JSON.stringify(payload),  
      "muteHttpExceptions": true  
    });  
      
    if (response.getResponseCode() \!== 200\) {  
      console.warn("\[Telegram API Error\] " \+ response.getContentText());  
    }  
  } catch (e) {  
    console.warn("\[Telegram Exception\] " \+ e.message);  
  }  
}

/\*\*  
 \* Helper: Escape HTML special chars for Telegram to prevent formatting errors  
 \*/  
function escapeHtml\_(text) {  
  if (\!text) return "";  
  return text  
    .replace(/&/g, "\&amp;")  
    .replace(/\</g, "\&lt;")  
    .replace(/\>/g, "\&gt;");  
}

// \==========================================  
// 4\. SPECIFIC EVENT NOTIFIERS  
// \==========================================

/\*\*  
 \* \[UPGRADED v4.0\] Wrapper สำหรับ AutoPilot  
 \* สรุปยอดการทำงานส่งให้ผู้ดูแลระบบ  
 \*/  
function notifyAutoPilotStatus(scgStatus, aiCount, aiMappedCount) {  
  // รองรับพารามิเตอร์ 3 ตัวเพื่อโชว์ผลลัพธ์ของ Tier 4 AI ด้วย  
  var mappedMsg \= aiMappedCount \!== undefined ? \`\\n🎯 AI Tier-4 จับคู่สำเร็จ: ${aiMappedCount} ร้าน\` : "";  
    
  var msg \= "------------------\\n" \+  
            "✅ AutoPilot V4.0 รอบล่าสุด:\\n" \+  
            "📦 ดึงงาน SCG: " \+ scgStatus \+ "\\n" \+  
            "🧠 AI Indexing: " \+ aiCount \+ " รายการ" \+   
            mappedMsg;  
              
  sendSystemNotify(msg, false);   
}

# Test\_Diagnostic.gs

/\*\*  
 \* VERSION: 000  
 \* 🏥 System Diagnostic Tool (Enterprise Edition)  
 \* Version: 4.0 Deep Scan & Schema Validation  
 \* \-----------------------------------------------------------------  
 \* \[PRESERVED\]: Two-phase diagnostic approach (Engine & Sheets).  
 \* \[ADDED v4.0\]: Validates NameMapping V4.0 5-Column schema.  
 \* \[ADDED v4.0\]: Validates PostalRef sheet existence.  
 \* \[ADDED v4.0\]: Deep scan for LINE and Telegram tokens.  
 \* \[MODIFIED v4.0\]: Safe API Key extraction using try-catch for V4.0 Getter.  
 \* Author: Elite Logistics Architect  
 \*/

// \==========================================  
// 1\. PHASE 1: ENGINE & DEPENDENCY CHECK  
// \==========================================

/\*\*  
 \* 🏥 System Diagnostic Tool (Phase 1: Engine Check)  
 \* สแกนหาฟังก์ชันหลักและ API Key ว่าเชื่อมต่อสมบูรณ์หรือไม่  
 \*/  
function RUN\_SYSTEM\_DIAGNOSTIC() {  
  var ui \= SpreadsheetApp.getUi();  
  var logs \= \[\];  
    
  function pass(msg) { logs.push("✅ " \+ msg); }  
  function warn(msg) { logs.push("⚠️ " \+ msg); }  
  function fail(msg) { logs.push("❌ " \+ msg); }

  try {  
    // 1\. Config Check  
    if (typeof CONFIG \!== 'undefined') pass("System Variables: มองเห็นตัวแปร CONFIG");  
    else fail("System Variables: มองไม่เห็นตัวแปร CONFIG");

    // 2\. Utility Functions Check  
    if (typeof md5 \=== 'function') pass("Core Utils: มองเห็นฟังก์ชัน md5()");  
    else fail("Core Utils: มองไม่เห็นฟังก์ชัน md5()");

    if (typeof normalizeText \=== 'function') pass("Core Utils: มองเห็นฟังก์ชัน normalizeText()");  
    else fail("Core Utils: มองไม่เห็นฟังก์ชัน normalizeText()");

    // 3\. Geo Map API Check  
    if (typeof GET\_ADDR\_WITH\_CACHE \=== 'function') {  
      try {  
        var testGeo \= GET\_ADDR\_WITH\_CACHE(13.746, 100.539);  
        if (testGeo && testGeo \!== "Error") pass("Google Maps API: ทำงานปกติ (" \+ testGeo.substring(0, 20\) \+ "...)");  
        else warn("Google Maps API: โหลดได้แต่ส่งค่าแปลกๆ กลับมา");  
      } catch (geoErr) {  
        fail("Google Maps API: Error ระหว่างทดสอบ (" \+ geoErr.message \+ ")");  
      }  
    } else {  
      fail("Google Maps API: ไม่พบฟังก์ชัน GET\_ADDR\_WITH\_CACHE ใน Service\_GeoAddr");  
    }

    // 4\. Security Vault Check (API Keys)  
    var props \= PropertiesService.getScriptProperties();  
      
    // Gemini Key (V4.0 Safe Check)  
    try {  
      if (CONFIG && CONFIG.GEMINI\_API\_KEY) pass("AI Engine: ตรวจพบ GEMINI\_API\_KEY พร้อมใช้งาน");  
    } catch (e) {  
      fail("AI Engine: ไม่พบ GEMINI\_API\_KEY หรือตั้งค่าไม่ถูกต้อง (" \+ e.message \+ ")");  
    }

    // Notifications Check  
    if (props.getProperty('LINE\_NOTIFY\_TOKEN')) pass("Notifications: ตรวจพบ LINE Notify Token");  
    else warn("Notifications: ยังไม่ได้ตั้งค่า LINE Notify");

    if (props.getProperty('TG\_BOT\_TOKEN') && props.getProperty('TG\_CHAT\_ID')) pass("Notifications: ตรวจพบ Telegram Config");  
    else warn("Notifications: ยังไม่ได้ตั้งค่า Telegram");

    ui.alert("🏥 รายงานผลการสแกนระบบ (Engine V4.0):\\n\\n" \+ logs.join("\\n"));  
    console.info("\[Diagnostic\] Phase 1 (Engine) completed.");

  } catch (e) {  
    console.error("\[Diagnostic Error\]: " \+ e.message);  
    ui.alert("🚨 ระบบตรวจพบ Error ร้ายแรงระหว่างสแกน:\\n" \+ e.message);  
  }  
}

// \==========================================  
// 2\. PHASE 2: DATA & STRUCTURE CHECK  
// \==========================================

/\*\*  
 \* 🕵️‍♂️ Sheet Diagnostic Tool (Phase 2: Data & Silent Exit Check)  
 \* ตรวจสอบว่ามีชีตครบตาม Config และมีโครงสร้างคอลัมน์ถูกต้องหรือไม่  
 \*/  
function RUN\_SHEET\_DIAGNOSTIC() {  
  var ui \= SpreadsheetApp.getUi();  
  var ss \= SpreadsheetApp.getActiveSpreadsheet();  
  var logs \= \[\];

  function pass(msg) { logs.push("✅ " \+ msg); }  
  function warn(msg) { logs.push("⚠️ " \+ msg); }  
  function fail(msg) { logs.push("❌ " \+ msg); }

  try {  
    // 1\. ตรวจสอบ Database Sheet  
    var dbName \= (typeof CONFIG \!== 'undefined' && CONFIG.SHEET\_NAME) ? CONFIG.SHEET\_NAME : "Database";  
    var dbSheet \= ss.getSheetByName(dbName);  
    if (dbSheet) {  
      var rows \= dbSheet.getLastRow();  
      if (rows \>= 2\) pass("Master DB: พบชีต '" \+ dbName \+ "' (มีข้อมูล " \+ rows \+ " แถว)");  
      else warn("Master DB: พบชีต '" \+ dbName \+ "' แต่ข้อมูลว่างเปล่า (มี " \+ rows \+ " แถว)");  
    } else {  
      fail("Master DB: ไม่พบชีตชื่อ '" \+ dbName \+ "' (ตรวจสอบเว้นวรรคท้ายชื่อด้วย)");  
    }

    // 2\. ตรวจสอบ Source Sheet  
    var srcName \= (typeof CONFIG \!== 'undefined' && CONFIG.SOURCE\_SHEET) ? CONFIG.SOURCE\_SHEET : "SCGนครหลวงJWDภูมิภาค";  
    var srcSheet \= ss.getSheetByName(srcName);  
    if (srcSheet) {  
      pass("Source Data: พบชีต '" \+ srcName \+ "' (มีข้อมูล " \+ srcSheet.getLastRow() \+ " แถว)");  
    } else {  
      warn("Source Data: ไม่พบชีต '" \+ srcName \+ "'");  
    }

    // 3\. ตรวจสอบ Mapping Sheet (V4.0 Schema Check)  
    var mapName \= (typeof CONFIG \!== 'undefined' && CONFIG.MAPPING\_SHEET) ? CONFIG.MAPPING\_SHEET : "NameMapping";  
    var mapSheet \= ss.getSheetByName(mapName);  
    if (mapSheet) {  
      var mapCols \= mapSheet.getLastColumn();  
      if (mapCols \>= 5\) {  
        pass("Name Mapping: พบชีต '" \+ mapName \+ "' (โครงสร้าง 5 คอลัมน์ V4.0 ถูกต้อง)");  
      } else {  
        warn("Name Mapping: พบชีต '" \+ mapName \+ "' แต่มีแค่ " \+ mapCols \+ " คอลัมน์ (แนะนำให้ใช้เมนู Upgrade NameMapping เป็น V4.0)");  
      }  
    } else {  
      fail("Name Mapping: ไม่พบชีต '" \+ mapName \+ "'");  
    }

    // 4\. ตรวจสอบ SCG Daily Data Sheet  
    if (typeof SCG\_CONFIG \!== 'undefined') {  
      var scgDataName \= SCG\_CONFIG.SHEET\_DATA || "Data";  
      var scgInputName \= SCG\_CONFIG.SHEET\_INPUT || "Input";  
        
      if (ss.getSheetByName(scgDataName)) pass("SCG Operation: พบชีต '" \+ scgDataName \+ "'");  
      else warn("SCG Operation: ไม่พบชีต '" \+ scgDataName \+ "'");  
        
      if (ss.getSheetByName(scgInputName)) pass("SCG Operation: พบชีต '" \+ scgInputName \+ "'");  
      else warn("SCG Operation: ไม่พบชีต '" \+ scgInputName \+ "'");  
    }

    // 5\. ตรวจสอบ PostalRef Sheet (New V4.0 Requirement)  
    var postalName \= (typeof CONFIG \!== 'undefined' && CONFIG.SHEET\_POSTAL) ? CONFIG.SHEET\_POSTAL : "PostalRef";  
    if (ss.getSheetByName(postalName)) {  
      pass("Geo Database: พบชีต '" \+ postalName \+ "' สำหรับอ้างอิงรหัสไปรษณีย์");  
    } else {  
      warn("Geo Database: ไม่พบชีต '" \+ postalName \+ "' (การแกะที่อยู่แบบ Offline อาจไม่แม่นยำ 100%)");  
    }

    ui.alert("🕵️‍♂️ รายงานผลการสแกนชีต (Silent Exit Check):\\n\\n" \+ logs.join("\\n"));  
    console.info("\[Diagnostic\] Phase 2 (Sheets) completed.");

  } catch (e) {  
    console.error("\[Diagnostic Error\]: " \+ e.message);  
    ui.alert("🚨 เกิด Error ระหว่างตรวจสอบชีต:\\n" \+ e.message);  
  }  
}

# Service\_GeoAddr.gs

/\*\*  
 \* VERSION: 000  
 \* 🌍 Service: Geo Address & Google Maps Formulas (Enterprise Edition)  
 \* Version: 4.0 Omni-Geo Engine & API Hardening  
 \* \-------------------------------------------------------  
 \* \[PRESERVED\]: Fully Integrated Google Maps Formulas by Amit Agarwal.  
 \* \[PRESERVED\]: 7 Custom Functions for Spreadsheet directly.  
 \* \[MODIFIED v4.0\]: Added Try-Catch to \_mapsSetCache to prevent 100KB limits crash.  
 \* \[MODIFIED v4.0\]: Enterprise Audit Logging (GCP Console) for API Failures.  
 \* \[MODIFIED v4.0\]: Enhanced regex in parseAddressFromText for better Tier 2 parsing.  
 \* \[FINAL POLISH\]: Bulletproof distance calculation (handling commas in API response).  
 \* Author: Elite Logistics Architect  
 \*/

// \==========================================  
// 1\. CONFIGURATION (Internal)  
// \==========================================

const POSTAL\_COL \= {  
  ZIP: 0,       // Col A (postcode)  
  DISTRICT: 2,  // Col C (district)  
  PROVINCE: 3   // Col D (province)  
};

var \_POSTAL\_CACHE \= null;

// \==========================================  
// 2\. 🧠 SMART ADDRESS PARSING LOGIC (Tier 2 Resolution)  
// \==========================================

/\*\*  
 \* แกะรหัสไปรษณีย์ จังหวัด และอำเภอ จากที่อยู่ดิบ  
 \*/  
function parseAddressFromText(fullAddress) {  
  var result \= { province: "", district: "", postcode: "" };  
  if (\!fullAddress) return result;  
    
  var addrStr \= fullAddress.toString().trim();  
    
  // 1\. หารหัสไปรษณีย์ก่อน (ตัวเลข 5 หลักติดกัน)  
  var zipMatch \= addrStr.match(/(\\d{5})/);  
  if (zipMatch && zipMatch\[1\]) {  
    result.postcode \= zipMatch\[1\];  
  }  
    
  // 2\. ลองหาจาก Database PostalRef (ถ้ามี)  
  var postalDB \= getPostalDataCached();  
  if (postalDB && result.postcode && postalDB.byZip\[result.postcode\]) {  
    var infoList \= postalDB.byZip\[result.postcode\];  
    if (infoList.length \> 0\) {  
       result.province \= infoList\[0\].province;  
       result.district \= infoList\[0\].district;  
       return result; // ถ้าเจอใน DB จบเลย แม่นยำสุด  
    }  
  }

  // 3\. FALLBACK: ถ้าไม่มี DB หรือหาไม่เจอ ให้ใช้ Regex แกะจาก Text ทันที (อัปเกรด Regex V4.0)  
  var provMatch \= addrStr.match(/(?:จ\\.|จังหวัด)\\s\*(\[ก-๙a-zA-Z0-9\]+)/i);  
  if (provMatch && provMatch\[1\]) {  
    result.province \= provMatch\[1\].trim();  
  }  
    
  var distMatch \= addrStr.match(/(?:อ\\.|อำเภอ|เขต)\\s\*(\[ก-๙a-zA-Z0-9\]+)/i);  
  if (distMatch && distMatch\[1\]) {  
    result.district \= distMatch\[1\].trim();  
  }

  // Fallback พิเศษสำหรับ กทม.  
  if (\!result.province && (addrStr.includes("กรุงเทพ") || addrStr.includes("Bangkok") || addrStr.includes("กทม"))) {  
    result.province \= "กรุงเทพมหานคร";  
  }

  return result;  
}

function getPostalDataCached() {  
  if (\_POSTAL\_CACHE) return \_POSTAL\_CACHE;  
    
  var ss \= SpreadsheetApp.getActiveSpreadsheet();  
  var sheetName \= (typeof CONFIG \!== 'undefined' && CONFIG.SHEET\_POSTAL) ? CONFIG.SHEET\_POSTAL : "PostalRef";  
  var sheet \= ss.getSheetByName(sheetName);  
    
  if (\!sheet) return null;   
    
  var lastRow \= sheet.getLastRow();  
  if (lastRow \< 2\) return null;  
    
  var data \= sheet.getRange(2, 1, lastRow \- 1, sheet.getLastColumn()).getValues();  
  var db \= { byZip: {} };  
    
  data.forEach(function(row) {  
    if (row.length \<= POSTAL\_COL.PROVINCE) return;  
      
    var pc \= String(row\[POSTAL\_COL.ZIP\]).trim();   
    if (\!pc) return;

    if (\!db.byZip\[pc\]) db.byZip\[pc\] \= \[\];  
    db.byZip\[pc\].push({   
      postcode: pc,   
      district: row\[POSTAL\_COL.DISTRICT\],   
      province: row\[POSTAL\_COL.PROVINCE\]   
    });  
  });  
    
  \_POSTAL\_CACHE \= db;  
  return db;  
}

// \==========================================  
// 3\. 🗺️ GOOGLE MAPS FORMULAS (Amit Agarwal)  
// \==========================================

const \_mapsMd5 \= (key \= "") \=\> {  
  const code \= key.toLowerCase().replace(/\\s/g, "");  
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, key)  
    .map((char) \=\> (char \+ 256).toString(16).slice(-2))  
    .join("");  
};

const \_mapsGetCache \= (key) \=\> {  
  try {  
    return CacheService.getDocumentCache().get(\_mapsMd5(key));  
  } catch(e) {  
    return null;  
  }  
};

/\*\*  
 \* \[MODIFIED v4.0\]: ป้องกัน Error กรณี String ของ Maps Directions เกิน 100KB  
 \*/  
const \_mapsSetCache \= (key, value) \=\> {  
  try {  
    const expirationInSeconds \= (typeof CONFIG \!== 'undefined' && CONFIG.CACHE\_EXPIRATION) ? CONFIG.CACHE\_EXPIRATION : 21600; // 6 hours  
    if (value && value.toString().length \< 90000\) {   
       CacheService.getDocumentCache().put(\_mapsMd5(key), value, expirationInSeconds);  
    }  
  } catch (e) {  
    console.warn("\[Geo Cache Warn\]: Could not cache key " \+ key \+ " \- " \+ e.message);  
  }  
};

/\*\*  
 \* 2.3 Calculate the travel time between two locations on Google Maps.  
 \* @customFunction  
 \*/  
const GOOGLEMAPS\_DURATION \= (origin, destination, mode \= "driving") \=\> {  
  if (\!origin || \!destination) throw new Error("No address specified\!");  
  if (origin.map) return origin.map(o \=\> GOOGLEMAPS\_DURATION(o, destination, mode));  
    
  const key \= \["duration", origin, destination, mode\].join(",");  
  const value \= \_mapsGetCache(key);  
  if (value \!== null) return value;

  Utilities.sleep(150); // API Throttling protection  
  const { routes: \[data\] \= \[\] } \= Maps.newDirectionFinder()  
    .setOrigin(origin)  
    .setDestination(destination)  
    .setMode(mode)  
    .getDirections();  
    
  if (\!data) throw new Error("No route found\!");  
    
  const { legs: \[{ duration: { text: time } } \= {}\] \= \[\] } \= data;  
  \_mapsSetCache(key, time);  
  return time;  
};

/\*\*  
 \* 2.1 Calculate the distance between two locations on Google Maps.  
 \* @customFunction  
 \*/  
const GOOGLEMAPS\_DISTANCE \= (origin, destination, mode \= "driving") \=\> {  
  if (\!origin || \!destination) throw new Error("No address specified\!");  
  if (origin.map) return origin.map(o \=\> GOOGLEMAPS\_DISTANCE(o, destination, mode));  
    
  const key \= \["distance", origin, destination, mode\].join(",");  
  const value \= \_mapsGetCache(key);  
  if (value \!== null) return value;

  Utilities.sleep(150);  
  const { routes: \[data\] \= \[\] } \= Maps.newDirectionFinder()  
    .setOrigin(origin)  
    .setDestination(destination)  
    .setMode(mode)  
    .getDirections();  
      
  if (\!data) throw new Error("No route found\!");  
    
  const { legs: \[{ distance: { text: distance } } \= {}\] \= \[\] } \= data;  
  \_mapsSetCache(key, distance);  
  return distance;  
};

/\*\*  
 \* 2.4 Get the latitude and longitude of any address on Google Maps.  
 \* @customFunction  
 \*/  
const GOOGLEMAPS\_LATLONG \= (address) \=\> {  
  if (\!address) throw new Error("No address specified\!");  
  if (address.map) return address.map(a \=\> GOOGLEMAPS\_LATLONG(a));  
    
  const key \= \["latlong", address\].join(",");  
  const value \= \_mapsGetCache(key);  
  if (value \!== null) return value;

  Utilities.sleep(150);  
  const { results: \[data \= null\] \= \[\] } \= Maps.newGeocoder().geocode(address);  
  if (data \=== null) throw new Error("Address not found\!");  
    
  const { geometry: { location: { lat, lng } } \= {} } \= data;  
  const answer \= \`${lat}, ${lng}\`;  
  \_mapsSetCache(key, answer);  
  return answer;  
};

/\*\*  
 \* 2.5 Get the full address of any zip code or partial address on Google Maps.  
 \* @customFunction  
 \*/  
const GOOGLEMAPS\_ADDRESS \= (address) \=\> {  
  if (\!address) throw new Error("No address specified\!");  
  if (address.map) return address.map(a \=\> GOOGLEMAPS\_ADDRESS(a));  
    
  const key \= \["address", address\].join(",");  
  const value \= \_mapsGetCache(key);  
  if (value \!== null) return value;

  Utilities.sleep(150);  
  const { results: \[data \= null\] \= \[\] } \= Maps.newGeocoder().geocode(address);  
  if (data \=== null) throw new Error("Address not found\!");  
    
  const { formatted\_address } \= data;  
  \_mapsSetCache(key, formatted\_address);  
  return formatted\_address;  
};

/\*\*  
 \* 2.2 Use Reverse Geocoding to get the address of a point location.  
 \* @customFunction  
 \*/  
const GOOGLEMAPS\_REVERSEGEOCODE \= (latitude, longitude) \=\> {  
  if (\!latitude || \!longitude) throw new Error("Lat/Lng not specified\!");  
    
  const key \= \["reverse", latitude, longitude\].join(",");  
  const value \= \_mapsGetCache(key);  
  if (value \!== null) return value;

  Utilities.sleep(150);  
  const { results: \[data \= {}\] \= \[\] } \= Maps.newGeocoder().reverseGeocode(latitude, longitude);  
  const { formatted\_address } \= data;  
  if (\!formatted\_address) return "Address not found";  
    
  \_mapsSetCache(key, formatted\_address);  
  return formatted\_address;  
};

/\*\*  
 \* 2.6 Get the country name of an address on Google Maps.  
 \* @customFunction  
 \*/  
const GOOGLEMAPS\_COUNTRY \= (address) \=\> {  
  if (\!address) throw new Error("No address specified\!");  
  if (address.map) return address.map(a \=\> GOOGLEMAPS\_COUNTRY(a));

  const key \= \["country", address\].join(",");  
  const value \= \_mapsGetCache(key);  
  if (value \!== null) return value;

  Utilities.sleep(150);  
  const { results: \[data \= null\] \= \[\] } \= Maps.newGeocoder().geocode(address);  
  if (data \=== null) throw new Error("Address not found\!");  
    
  const \[{ short\_name, long\_name } \= {}\] \= data.address\_components.filter(  
    ({ types: \[level\] }) \=\> level \=== "country"  
  );  
  if (\!short\_name) throw new Error("Country not found\!");  
    
  const answer \= \`${long\_name} (${short\_name})\`;  
  \_mapsSetCache(key, answer);  
  return answer;  
};

/\*\*  
 \* 2.7 Find the driving direction between two locations on Google Maps.  
 \* @customFunction  
 \*/  
const GOOGLEMAPS\_DIRECTIONS \= (origin, destination, mode \= "driving") \=\> {  
  if (\!origin || \!destination) throw new Error("No address specified\!");  
    
  const key \= \["directions", origin, destination, mode\].join(",");  
  const value \= \_mapsGetCache(key);  
  if (value \!== null) return value;

  Utilities.sleep(150);  
  const { routes \= \[\] } \= Maps.newDirectionFinder()  
    .setOrigin(origin)  
    .setDestination(destination)  
    .setMode(mode)  
    .getDirections();  
      
  if (\!routes.length) throw new Error("No route found\!");  
    
  const directions \= routes  
    .map(({ legs }) \=\> {  
      return legs.map(({ steps }) \=\> {  
        return steps.map((step) \=\> {  
          return step.html\_instructions  
            .replace("\>\<", "\> \<")  
            .replace(/\<\[^\>\]+\>/g, "");  
        });  
      });  
    })  
    .join(", ");  
      
  \_mapsSetCache(key, directions);  
  return directions;  
};

// \==========================================  
// 4\. 🔗 BACKEND INTEGRATION (System Calls V4.0)  
// \==========================================

/\*\*  
 \* Wrapper for Backend System: Reverse Geocode  
 \* ดึงพิกัด Lat, Lng มาแปลเป็นที่อยู่  
 \*/  
function GET\_ADDR\_WITH\_CACHE(lat, lng) {  
  try {  
    return GOOGLEMAPS\_REVERSEGEOCODE(lat, lng);  
  } catch (e) {  
    console.error(\`\[GeoAddr API\] Reverse Geocode Error (${lat}, ${lng}): ${e.message}\`);  
    return "";  
  }  
}

/\*\*  
 \* Wrapper for Backend System: Calculate Distance  
 \* ดึงระยะทางจากสูตรคุณ Amit แล้วแปลง "1,250.5 km" ให้เหลือแค่ "1250.50" (ตัวเลขล้วน)  
 \*/  
function CALCULATE\_DISTANCE\_KM(origin, destination) {  
  try {  
    var distanceText \= GOOGLEMAPS\_DISTANCE(origin, destination, "driving");  
    if (\!distanceText) return "";  
      
    // \[FINAL POLISH\] กำจัดลูกน้ำ (,) ออกก่อน แล้วค่อยกรองเฉพาะตัวเลขและจุดทศนิยม  
    var cleanStr \= String(distanceText).replace(/,/g, "").replace(/\[^0-9.\]/g, "");  
    var val \= parseFloat(cleanStr);  
      
    return isNaN(val) ? "" : val.toFixed(2);  
  } catch (e) {  
    console.error(\`\[GeoAddr API\] Distance Error (${origin} \-\> ${destination}): ${e.message}\`);  
    return "";  
  }  
}

# Menu.gs

/\*\*  
 \* VERSION: 000  
 \* 🖥️ MODULE: Menu UI Interface  
 \* Version: 4.1 Enterprise Edition (UI Text Fix)  
 \* \---------------------------------------------------  
 \* \[FIXED v4.1\]: Dynamic UI Alert pulling exact sheet names from CONFIG.  
 \* Author: Elite Logistics Architect  
 \*/

function onOpen() {  
  var ui \= SpreadsheetApp.getUi();  
    
  // \=================================================================  
  // 🚛 เมนูชุดที่ 1: ระบบจัดการ Master Data (Operation)  
  // \=================================================================  
  ui.createMenu('🚛 1\. ระบบจัดการ Master Data')  
      .addItem('1️⃣ ดึงลูกค้าใหม่ (Sync New Data)', 'syncNewDataToMaster\_UI')  
      .addItem('2️⃣ เติมข้อมูลพิกัด/ที่อยู่ (ทีละ 50)', 'updateGeoData\_SmartCache')  
      .addItem('3️⃣ จัดกลุ่มชื่อซ้ำ (Clustering)', 'autoGenerateMasterList\_Smart')  
      .addItem('🧠 4️⃣ ส่งชื่อแปลกให้ AI วิเคราะห์ (Smart Resolution)', 'runAIBatchResolver\_UI')  
      .addSeparator()  
      .addItem('🚀 5️⃣ Deep Clean (ตรวจสอบความสมบูรณ์)', 'runDeepCleanBatch\_100')  
      .addItem('🔄 รีเซ็ตความจำปุ่ม 5 (เริ่มแถว 2 ใหม่)', 'resetDeepCleanMemory\_UI')  
      .addSeparator()  
      .addItem('✅ 6️⃣ จบงาน (Finalize & Move to Mapping)', 'finalizeAndClean\_UI')  
      .addSeparator()  
      .addSubMenu(ui.createMenu('🛠️ Admin & Repair Tools')  
          .addItem('🔑 สร้าง UUID ให้ครบทุกแถว', 'assignMissingUUIDs')  
          .addItem('🚑 ซ่อมแซม NameMapping (L3)', 'repairNameMapping\_UI')  
      )  
      .addToUi();

  // \=================================================================  
  // 📦 เมนูชุดที่ 2: เมนูพิเศษ SCG (Daily Operation)  
  // \=================================================================  
  ui.createMenu('📦 2\. เมนูพิเศษ SCG')   
    .addItem('📥 1\. โหลดข้อมูล Shipment (+E-POD)', 'fetchDataFromSCGJWD')  
    .addItem('🟢 2\. อัปเดตพิกัด \+ อีเมลพนักงาน', 'applyMasterCoordinatesToDailyJob')  
    .addSeparator()  
    .addSubMenu(ui.createMenu('🧹 เมนูล้างข้อมูล (Dangerous Zone)')  
    .addItem('⚠️ ล้างเฉพาะชีต Data', 'clearDataSheet\_UI')  
    .addItem('⚠️ ล้างเฉพาะชีต Input', 'clearInputSheet\_UI')  
    .addItem('⚠️ ล้างเฉพาะชีต สรุป\_เจ้าของสินค้า', 'clearSummarySheet\_UI') // ← เพิ่ม  
    .addItem('🔥 ล้างทั้งหมด (Input \+ Data \+ สรุป)', 'clearAllSCGSheets\_UI') // ← แก้ชื่อ  
)  
    .addToUi();

  // \=================================================================  
  // 🤖 เมนูชุดที่ 3: ระบบอัตโนมัติ (Automation)  
  // \=================================================================  
  ui.createMenu('🤖 3\. ระบบอัตโนมัติ')  
    .addItem('▶️ เปิดระบบช่วยเหลืองาน (Auto-Pilot)', 'START\_AUTO\_PILOT')  
    .addItem('⏹️ ปิดระบบช่วยเหลือ', 'STOP\_AUTO\_PILOT')  
    .addToUi();

  // \=================================================================  
  // ⚙️ เมนูชุดที่ 4: System Admin  
  // \=================================================================  
  ui.createMenu('⚙️ System Admin')  
    .addItem('🏥 ตรวจสอบสถานะระบบ (Health Check)', 'runSystemHealthCheck')  
    .addItem('🧹 ล้าง Backup เก่า (\>30 วัน)', 'cleanupOldBackups')  
    .addItem('📊 เช็คปริมาณข้อมูล (Cell Usage)', 'checkSpreadsheetHealth')  
    .addSeparator()  
    .addItem('🔔 ตั้งค่า LINE Notify', 'setupLineToken')  
    .addItem('✈️ ตั้งค่า Telegram Notify', 'setupTelegramConfig')  
    .addItem('🔐 ตั้งค่า API Key (Setup)', 'setupEnvironment')  
    .addToUi();  
}

// \=================================================================  
// 🛡️ SAFETY WRAPPERS  
// \=================================================================

/\*\*  
 \* Wrapper: ยืนยันก่อนดึงข้อมูลลูกค้าใหม่  
 \* \[FIXED v4.1\]: ปรับข้อความให้ดึงชื่อจากตัวแปร Config จริงๆ  
 \*/  
function syncNewDataToMaster\_UI() {  
  var ui \= SpreadsheetApp.getUi();  
  var sourceName \= (typeof CONFIG \!== 'undefined' && CONFIG.SOURCE\_SHEET) ? CONFIG.SOURCE\_SHEET : 'ชีตนำเข้า';  
  var dbName \= (typeof CONFIG \!== 'undefined' && CONFIG.SHEET\_NAME) ? CONFIG.SHEET\_NAME : 'Database';  
    
  var result \= ui.alert(  
    'ยืนยันการดึงข้อมูลใหม่?',  
    'ระบบจะดึงรายชื่อลูกค้าจากชีต "' \+ sourceName \+ '"\\nมาเพิ่มต่อท้ายในชีต "' \+ dbName \+ '"\\n(เฉพาะรายชื่อที่ยังไม่เคยมีในระบบ)\\n\\nคุณต้องการดำเนินการต่อหรือไม่?',  
    ui.ButtonSet.YES\_NO  
  );  
  if (result \== ui.Button.YES) {  
    syncNewDataToMaster();  
  }  
}

function runAIBatchResolver\_UI() {  
  var ui \= SpreadsheetApp.getUi();  
  var batchSize \= (typeof CONFIG \!== 'undefined' && CONFIG.AI\_BATCH\_SIZE) ? CONFIG.AI\_BATCH\_SIZE : 20;  
    
  var result \= ui.alert(  
    '🧠 ยืนยันการรัน AI Smart Resolution?',  
    'ระบบจะรวบรวมชื่อที่ยังหาพิกัดไม่เจอ/ไม่รู้จัก (สูงสุด ' \+ batchSize \+ ' รายการ)\\nส่งให้ Gemini AI วิเคราะห์และจับคู่กับ Database อัตโนมัติ\\n\\nต้องการเริ่มเลยหรือไม่?',  
    ui.ButtonSet.YES\_NO  
  );  
    
  if (result \== ui.Button.YES) {  
    if (typeof resolveUnknownNamesWithAI \=== 'function') {  
       resolveUnknownNamesWithAI();  
    } else {  
       ui.alert(  
         '⚠️ System Note',   
         'ฟังก์ชัน AI (Service\_Agent.gs) กำลังอยู่ระหว่างการติดตั้ง (Coming soon\!)\\nกรุณารออัปเดตโมดูลถัดไปครับ',   
         ui.ButtonSet.OK  
       );  
    }  
  }  
}

function finalizeAndClean\_UI() {  
  var ui \= SpreadsheetApp.getUi();  
  var result \= ui.alert(  
    '⚠️ ยืนยันการจบงาน (Finalize)?',  
    'รายการที่ติ๊กถูก "Verified" จะถูกย้ายไปยัง NameMapping และลบออกจาก Database\\nข้อมูลต้นฉบับจะถูก Backup ไว้\\n\\nยืนยันหรือไม่?',  
    ui.ButtonSet.OK\_CANCEL  
  );  
  if (result \== ui.Button.OK) {  
    finalizeAndClean\_MoveToMapping();  
  }  
}

function resetDeepCleanMemory\_UI() {  
  var ui \= SpreadsheetApp.getUi();  
  var result \= ui.alert(  
    'ยืนยันการรีเซ็ต?',  
    'ระบบจะเริ่มตรวจสอบ Deep Clean ตั้งแต่แถวแรกใหม่\\nใช้ในกรณีที่ต้องการ Re-check ข้อมูลทั้งหมด',  
    ui.ButtonSet.YES\_NO  
  );  
  if (result \== ui.Button.YES) {  
    resetDeepCleanMemory();  
  }  
}

function clearDataSheet\_UI() {  
  confirmAction('ล้างชีต Data', 'ข้อมูลผลลัพธ์ทั้งหมดจะหายไป', clearDataSheet);  
}

function clearInputSheet\_UI() {  
  confirmAction('ล้างชีต Input', 'ข้อมูลนำเข้า (Shipment) ทั้งหมดจะหายไป', clearInputSheet);  
}

function clearAllSCGSheets\_UI() {  
  var ui \= SpreadsheetApp.getUi();  
  var result \= ui.alert(  
    '🔥 DANGER: ยืนยันการล้างข้อมูลทั้งหมด?',  
    'ชีต Input และ Data จะถูกล้างว่างเปล่า\!\\nกรุณาตรวจสอบว่าเซฟงานแล้ว หรือไม่ต้องการข้อมูลชุดนี้แล้วจริงๆ',  
    ui.ButtonSet.YES\_NO  
  );  
  if (result \== ui.Button.YES) {  
    clearAllSCGSheets();  
  }  
}

function repairNameMapping\_UI() {  
  confirmAction('ซ่อมแซม NameMapping', 'ระบบจะลบแถวซ้ำและเติม UUID ให้ครบ', repairNameMapping\_Full);  
}

function confirmAction(title, message, callbackFunction) {  
  var ui \= SpreadsheetApp.getUi();  
  var result \= ui.alert(title, message, ui.ButtonSet.YES\_NO);  
  if (result \== ui.Button.YES) {  
    callbackFunction();  
  }  
}

function runSystemHealthCheck() {  
  var ui \= SpreadsheetApp.getUi();  
  try {  
    if (typeof CONFIG \!== 'undefined' && CONFIG.validateSystemIntegrity) {  
      CONFIG.validateSystemIntegrity();   
      ui.alert(  
        "✅ System Health: Excellent\\n",  
        "ระบบพร้อมทำงานสมบูรณ์ครับ\!\\n- โครงสร้างชีตครบถ้วน\\n- เชื่อมต่อ API (Gemini) พร้อมใช้งาน",  
        ui.ButtonSet.OK  
      );  
    } else {  
      ui.alert("⚠️ System Warning", "Config check skipped (CONFIG.validateSystemIntegrity ไม่ทำงาน)", ui.ButtonSet.OK);  
    }  
  } catch (e) {  
    ui.alert("❌ System Health: FAILED", e.message, ui.ButtonSet.OK);  
  }  
}

# Service\_Master.gs

/\*\*  
 \* VERSION: 000  
 \* 🧠 Service: Master Data Management  
 \* Version: 4.1 Checkbox Bugfix  
 \* \-----------------------------------------------------------  
 \* \[FIXED v4.1\]: Created getRealLastRow\_() to ignore pre-filled checkboxes.  
 \* Data will now append exactly after the last actual customer name.  
 \* Author: Elite Logistics Architect  
 \*/

// \==========================================  
// 1\. IMPORT & SYNC  
// \==========================================

/\*\*  
 \* 🛠️ \[NEW v4.1\] Helper หาแถวสุดท้ายจริงๆ โดยดูจากคอลัมน์ชื่อลูกค้า (ข้าม Checkbox)  
 \*/  
function getRealLastRow\_(sheet, columnIndex) {  
  var data \= sheet.getRange(1, columnIndex, sheet.getMaxRows(), 1).getValues();  
  for (var i \= data.length \- 1; i \>= 0; i--) {  
    // ถ้าช่องนั้นไม่ว่างเปล่า ไม่เป็น null และไม่เป็น boolean (Checkbox)  
    if (data\[i\]\[0\] \!== "" && data\[i\]\[0\] \!== null && typeof data\[i\]\[0\] \!== 'boolean') {  
      return i \+ 1;  
    }  
  }  
  return 1; // ถ้าชีตว่างเปล่าเลย  
}

function syncNewDataToMaster() {  
  var ss \= SpreadsheetApp.getActiveSpreadsheet();  
  var ui \= SpreadsheetApp.getUi();  
    
  var lock \= LockService.getScriptLock();  
  if (\!lock.tryLock(15000)) {   
    ui.alert("⚠️ ระบบคิวทำงาน", "มีผู้ใช้งานอื่นกำลังอัปเดตฐานข้อมูลอยู่ กรุณาลองใหม่ในอีก 15 วินาทีครับ", ui.ButtonSet.OK);  
    return;  
  }

  try {  
    var sourceSheet \= ss.getSheetByName(CONFIG.SOURCE\_SHEET);  
    var masterSheet \= ss.getSheetByName(CONFIG.SHEET\_NAME);  
      
    if (\!sourceSheet || \!masterSheet) {   
      ui.alert("❌ CRITICAL: ไม่พบ Sheet (Source หรือ Database)");   
      return;   
    }

    var SRC\_IDX \= {   
      NAME: 12,      // Col 13 (M)  
      LAT: 14,       // Col 15 (O)  
      LNG: 15,       // Col 16 (P)  
      SYS\_ADDR: 18,  // Col 19 (S)  
      DIST: 23,      // Col 24 (X)  
      GOOG\_ADDR: 24  // Col 25 (Y)  
    };

    // \[FIXED v4.1\] ใช้ getRealLastRow\_ เพื่อหลบ Checkbox ที่ทำเผื่อไว้ล่วงหน้า  
    var lastRowM \= getRealLastRow\_(masterSheet, CONFIG.COL\_NAME);  
    var existingNames \= new Set();   
      
    // Load Existing Names  
    if (lastRowM \> 1\) {  
      var mData \= masterSheet.getRange(2, CONFIG.COL\_NAME, lastRowM \- 1, 1).getValues();  
      mData.forEach(function(r) {   
        if (r\[0\]) existingNames.add(normalizeText(r\[0\]));   
      });  
    }

    var lastRowS \= sourceSheet.getLastRow();  
    if (lastRowS \< 2\) {  
      ui.alert("ℹ️ ไม่มีข้อมูลในชีตต้นทาง");  
      return;  
    }  
      
    // Read Source Data  
    var sData \= sourceSheet.getRange(2, 1, lastRowS \- 1, 25).getValues();  
    var newEntries \= \[\];  
    var currentBatch \= new Set(); 

    sData.forEach(function(row) {  
      var name \= row\[SRC\_IDX.NAME\];  
      var lat \= row\[SRC\_IDX.LAT\];  
      var lng \= row\[SRC\_IDX.LNG\];  
        
      if (\!name || \!lat || \!lng) return;  
        
      var clean \= normalizeText(name);  
        
      if (\!existingNames.has(clean) && \!currentBatch.has(clean)) {  
        var newRow \= new Array(17).fill("");   
          
        newRow\[CONFIG.C\_IDX.NAME\] \= name;  
        newRow\[CONFIG.C\_IDX.LAT\] \= lat;  
        newRow\[CONFIG.C\_IDX.LNG\] \= lng;  
        newRow\[CONFIG.C\_IDX.VERIFIED\] \= false;   
        newRow\[CONFIG.C\_IDX.SYS\_ADDR\] \= row\[SRC\_IDX.SYS\_ADDR\];   
        newRow\[CONFIG.C\_IDX.GOOGLE\_ADDR\] \= row\[SRC\_IDX.GOOG\_ADDR\];   
        newRow\[CONFIG.C\_IDX.DIST\_KM\] \= cleanDistance\_Helper(row\[SRC\_IDX.DIST\]);   
          
        newRow\[CONFIG.C\_IDX.UUID\] \= generateUUID();   
        newRow\[CONFIG.C\_IDX.CREATED\] \= new Date();   
        newRow\[CONFIG.C\_IDX.UPDATED\] \= new Date();  
          
        newEntries.push(newRow);  
        currentBatch.add(clean);  
      }  
    });

    if (newEntries.length \> 0\) {  
      // เขียนต่อท้ายบรรทัดจริงๆ ไม่ใช่บรรทัด Checkbox  
      masterSheet.getRange(lastRowM \+ 1, 1, newEntries.length, 17).setValues(newEntries);  
      console.log("Sync Complete: Added " \+ newEntries.length \+ " rows.");  
      ui.alert("✅ นำเข้าข้อมูลใหม่สำเร็จ: " \+ newEntries.length \+ " รายการ\\nต่อท้ายที่แถว " \+ (lastRowM \+ 1));  
    } else {  
      ui.alert("👌 ฐานข้อมูลเป็นปัจจุบันแล้ว (ไม่มีข้อมูลลูกค้าใหม่จากชีตต้นทาง)");  
    }

  } catch (error) {  
    console.error("Sync Error: " \+ error.message);  
    ui.alert("❌ เกิดข้อผิดพลาด: " \+ error.message);  
  } finally {  
    lock.releaseLock();   
  }  
}

function cleanDistance\_Helper(val) {  
  if (\!val) return "";  
  if (typeof val \=== 'number') return val;  
  return parseFloat(val.toString().replace(/,/g, '').replace('km', '').trim()) || "";  
}

// \==========================================  
// (ส่วนที่เหลือทั้งหมดดึงมาจาก V4.0 เหมือนเดิม เพื่อให้ครบไฟล์)  
// \==========================================

function updateGeoData\_SmartCache() { runDeepCleanBatch\_100(); }  
function autoGenerateMasterList\_Smart() { processClustering\_GridOptimized(); }

function runDeepCleanBatch\_100() {  
  var ss \= SpreadsheetApp.getActiveSpreadsheet();  
  var ui \= SpreadsheetApp.getUi();  
  var sheet \= ss.getSheetByName(CONFIG.SHEET\_NAME);  
  if (\!sheet) return;

  var lastRow \= getRealLastRow\_(sheet, CONFIG.COL\_NAME);  
  if (lastRow \< 2\) return;

  var props \= PropertiesService.getScriptProperties();  
  var startRow \= parseInt(props.getProperty('DEEP\_CLEAN\_POINTER') || '2');  
    
  if (startRow \> lastRow) {  
    ui.alert("🎉 ตรวจครบทุกแถวแล้ว (Pointer Reset)");  
    props.deleteProperty('DEEP\_CLEAN\_POINTER');  
    return;  
  }

  var endRow \= Math.min(startRow \+ CONFIG.DEEP\_CLEAN\_LIMIT \- 1, lastRow);  
  var numRows \= endRow \- startRow \+ 1;  
    
  var range \= sheet.getRange(startRow, 1, numRows, 17);  
  var values \= range.getValues();  
    
  var origin \= CONFIG.DEPOT\_LAT \+ "," \+ CONFIG.DEPOT\_LNG;  
  var updatedCount \= 0;

  for (var i \= 0; i \< values.length; i++) {  
    var row \= values\[i\];  
    var lat \= row\[CONFIG.C\_IDX.LAT\];  
    var lng \= row\[CONFIG.C\_IDX.LNG\];  
    var changed \= false;

    if (lat && lng && \!row\[CONFIG.C\_IDX.GOOGLE\_ADDR\]) {  
      try {  
        var addr \= GET\_ADDR\_WITH\_CACHE(lat, lng);   
        if (addr && addr \!== "Error") {  
          row\[CONFIG.C\_IDX.GOOGLE\_ADDR\] \= addr;  
          changed \= true;  
        }  
      } catch (e) { console.warn("Geo Error: " \+ e.message); }  
    }

    if (lat && lng && \!row\[CONFIG.C\_IDX.DIST\_KM\]) {  
      var km \= CALCULATE\_DISTANCE\_KM(origin, lat \+ "," \+ lng);   
      if (km) { row\[CONFIG.C\_IDX.DIST\_KM\] \= km; changed \= true; }  
    }  
      
    if (\!row\[CONFIG.C\_IDX.UUID\]) {   
      row\[CONFIG.C\_IDX.UUID\] \= generateUUID();   
      row\[CONFIG.C\_IDX.CREATED\] \= row\[CONFIG.C\_IDX.CREATED\] || new Date();   
      changed \= true;   
    }

    var gAddr \= row\[CONFIG.C\_IDX.GOOGLE\_ADDR\];  
    if (gAddr && (\!row\[CONFIG.C\_IDX.PROVINCE\] || \!row\[CONFIG.C\_IDX.DISTRICT\])) {  
       var parsed \= parseAddressFromText(gAddr);   
       if (parsed && parsed.province) {  
         row\[CONFIG.C\_IDX.PROVINCE\] \= parsed.province;  
         row\[CONFIG.C\_IDX.DISTRICT\] \= parsed.district;  
         row\[CONFIG.C\_IDX.POSTCODE\] \= parsed.postcode;  
         changed \= true;  
       }  
    }

    if (changed) {  
       row\[CONFIG.C\_IDX.UPDATED\] \= new Date();  
       updatedCount++;  
    }  
  }

  if (updatedCount \> 0\) range.setValues(values);  
  props.setProperty('DEEP\_CLEAN\_POINTER', (endRow \+ 1).toString());  
  ss.toast("✅ Processed rows " \+ startRow \+ "-" \+ endRow \+ " (Updated: " \+ updatedCount \+ ")", "Deep Clean");  
}

function resetDeepCleanMemory() {  
  PropertiesService.getScriptProperties().deleteProperty('DEEP\_CLEAN\_POINTER');  
  SpreadsheetApp.getActiveSpreadsheet().toast("🔄 Memory Reset: ระบบถูกรีเซ็ต จะเริ่มตรวจสอบแถวที่ 2 ในรอบถัดไป", "System Ready");  
}

function finalizeAndClean\_MoveToMapping() {  
  var ss \= SpreadsheetApp.getActiveSpreadsheet();  
  var ui \= SpreadsheetApp.getUi();  
    
  var lock \= LockService.getScriptLock();  
  if (\!lock.tryLock(30000)) {   
    ui.alert("⚠️ ระบบคิวทำงาน", "มีผู้ใช้งานอื่นกำลังแก้ไขฐานข้อมูล กรุณารอสักครู่", ui.ButtonSet.OK);  
    return;  
  }

  try {  
    var masterSheet \= ss.getSheetByName(CONFIG.SHEET\_NAME);  
    var mapSheet \= ss.getSheetByName(CONFIG.MAPPING\_SHEET);  
      
    if (\!masterSheet || \!mapSheet) { ui.alert("❌ Error: Missing Sheets"); return; }  
      
    var lastRow \= getRealLastRow\_(masterSheet, CONFIG.COL\_NAME);  
    if (lastRow \< 2\) { ui.alert("ℹ️ Database is empty."); return; }

    var allData \= masterSheet.getRange(2, 1, lastRow \- 1, 17).getValues();  
    var uuidMap \= {};  
      
    allData.forEach(function(row) {  
      var uuid \= row\[CONFIG.C\_IDX.UUID\];  
      if (uuid) {  
        var n \= normalizeText(row\[CONFIG.C\_IDX.NAME\]);  
        var s \= normalizeText(row\[CONFIG.C\_IDX.SUGGESTED\]);  
        if (n) uuidMap\[n\] \= uuid;  
        if (s) uuidMap\[s\] \= uuid;  
      }  
    });

    var backupName \= "Backup\_DB\_" \+ Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd\_HHmm");  
    masterSheet.copyTo(ss).setName(backupName);

    var rowsToKeep \= \[\];         
    var mappingToUpload \= \[\];   
    var processedNames \= new Set(); 

    for (var i \= 0; i \< allData.length; i++) {  
      var row \= allData\[i\];  
      var rawName \= row\[CONFIG.C\_IDX.NAME\];  
      var suggestedName \= row\[CONFIG.C\_IDX.SUGGESTED\];  
      var isVerified \= row\[CONFIG.C\_IDX.VERIFIED\];      
      var currentUUID \= row\[CONFIG.C\_IDX.UUID\];

      if (isVerified \=== true) {  
        rowsToKeep.push(row);   
      }   
      else if (suggestedName && suggestedName \!== "") {  
        if (rawName \!== suggestedName && \!processedNames.has(rawName)) {  
          var targetUUID \= uuidMap\[normalizeText(suggestedName)\] || currentUUID;  
          var mapRow \= new Array(5).fill("");  
          mapRow\[CONFIG.MAP\_IDX.VARIANT\] \= rawName;  
          mapRow\[CONFIG.MAP\_IDX.UID\] \= targetUUID;  
          mapRow\[CONFIG.MAP\_IDX.CONFIDENCE\] \= 100;  
          mapRow\[CONFIG.MAP\_IDX.MAPPED\_BY\] \= "Human";  
          mapRow\[CONFIG.MAP\_IDX.TIMESTAMP\] \= new Date();  
            
          mappingToUpload.push(mapRow);  
          processedNames.add(rawName);  
        }  
      }  
    }

    if (mappingToUpload.length \> 0\) {  
      var lastRowMap \= mapSheet.getLastRow();  
      mapSheet.getRange(lastRowMap \+ 1, 1, mappingToUpload.length, 5).setValues(mappingToUpload);  
    }

    masterSheet.getRange(2, 1, lastRow, 17).clearContent();  
      
    if (rowsToKeep.length \> 0\) {  
      masterSheet.getRange(2, 1, rowsToKeep.length, 17).setValues(rowsToKeep);  
      ui.alert("✅ Finalize Complete:\\n- New Mappings: " \+ mappingToUpload.length \+ "\\n- Active Master Data: " \+ rowsToKeep.length);  
    } else {  
      masterSheet.getRange(2, 1, allData.length, 17).setValues(allData);  
      ui.alert("⚠️ Warning: No Verified rows found. Data restored to original state.");  
    }  
  } catch (e) {  
    console.error("Finalize Error: " \+ e.message);  
    ui.alert("❌ CRITICAL WRITE ERROR: " \+ e.message \+ "\\nPlease check Backup Sheet.");  
  } finally {  
    lock.releaseLock();  
  }  
}

function assignMissingUUIDs() {  
  var ss \= SpreadsheetApp.getActiveSpreadsheet();  
  var ui \= SpreadsheetApp.getUi();  
  var sheet \= ss.getSheetByName(CONFIG.SHEET\_NAME);  
  var lastRow \= getRealLastRow\_(sheet, CONFIG.COL\_NAME);  
  if (lastRow \< 2\) return;

  var range \= sheet.getRange(2, CONFIG.COL\_UUID, lastRow \- 1, 1);  
  var values \= range.getValues();  
  var count \= 0;

  var newValues \= values.map(function(r) {  
    if (\!r\[0\]) {  
      count++;  
      return \[generateUUID()\];  
    }  
    return \[r\[0\]\];  
  });

  if (count \> 0\) {  
    range.setValues(newValues);  
    ui.alert("✅ Generated " \+ count \+ " new UUIDs.");  
  } else {  
    ui.alert("ℹ️ All rows already have UUIDs.");  
  }  
}

function repairNameMapping\_Full() {  
  var ss \= SpreadsheetApp.getActiveSpreadsheet();  
  var ui \= SpreadsheetApp.getUi();  
  var dbSheet \= ss.getSheetByName(CONFIG.SHEET\_NAME);  
  var mapSheet \= ss.getSheetByName(CONFIG.MAPPING\_SHEET);  
    
  var dbData \= dbSheet.getRange(2, 1, getRealLastRow\_(dbSheet, CONFIG.COL\_NAME) \- 1, CONFIG.COL\_UUID).getValues();  
  var uuidMap \= {};  
  dbData.forEach(function(r) {  
    if (r\[CONFIG.C\_IDX.UUID\]) {  
       uuidMap\[normalizeText(r\[CONFIG.C\_IDX.NAME\])\] \= r\[CONFIG.C\_IDX.UUID\];  
    }  
  });

  var mapRange \= mapSheet.getRange(2, 1, mapSheet.getLastRow() \- 1, 5);  
  var mapValues \= mapRange.getValues();  
  var cleanList \= \[\];  
  var seen \= new Set();

  mapValues.forEach(function(r) {  
    var oldN \= r\[CONFIG.MAP\_IDX.VARIANT\];  
    var uid \= r\[CONFIG.MAP\_IDX.UID\];  
    var conf \= r\[CONFIG.MAP\_IDX.CONFIDENCE\] || 100;   
    var by \= r\[CONFIG.MAP\_IDX.MAPPED\_BY\] || "System\_Repair";  
    var ts \= r\[CONFIG.MAP\_IDX.TIMESTAMP\] || new Date();  
      
    var normOld \= normalizeText(oldN);  
    if (\!normOld) return;  
      
    if (\!uid) uid \= uuidMap\[normalizeText(r\[1\])\] || generateUUID();  
      
    if (\!seen.has(normOld)) {  
      seen.add(normOld);  
      var mapRow \= new Array(5).fill("");  
      mapRow\[CONFIG.MAP\_IDX.VARIANT\] \= oldN;  
      mapRow\[CONFIG.MAP\_IDX.UID\] \= uid;  
      mapRow\[CONFIG.MAP\_IDX.CONFIDENCE\] \= conf;  
      mapRow\[CONFIG.MAP\_IDX.MAPPED\_BY\] \= by;  
      mapRow\[CONFIG.MAP\_IDX.TIMESTAMP\] \= ts;  
      cleanList.push(mapRow);  
    }  
  });

  if (cleanList.length \> 0\) {  
    mapSheet.getRange(2, 1, mapSheet.getLastRow(), 5).clearContent();  
    mapSheet.getRange(2, 1, cleanList.length, 5).setValues(cleanList);  
    ui.alert("✅ Repair Complete. Total Mappings: " \+ cleanList.length);  
  } else {  
    ui.alert("ℹ️ No repair needed or mapping is empty.");  
  }  
}

function processClustering\_GridOptimized() {  
  var ss \= SpreadsheetApp.getActiveSpreadsheet();  
  var sheet \= ss.getSheetByName(CONFIG.SHEET\_NAME);  
  var lastRow \= getRealLastRow\_(sheet, CONFIG.COL\_NAME);  
  if (lastRow \< 2\) return;

  var range \= sheet.getRange(2, 1, lastRow \- 1, 15);   
  var values \= range.getValues();  
    
  var clusters \= \[\];        
  var grid \= {};          

  for (var i \= 0; i \< values.length; i++) {  
    var r \= values\[i\];  
    var lat \= r\[CONFIG.C\_IDX.LAT\];  
    var lng \= r\[CONFIG.C\_IDX.LNG\];  
      
    if (\!lat || \!lng || isNaN(lat) || isNaN(lng)) continue;

    var gridKey \= Math.floor(lat \* 10\) \+ "\_" \+ Math.floor(lng \* 10);  
      
    if (\!grid\[gridKey\]) grid\[gridKey\] \= \[\];  
    grid\[gridKey\].push(i);

    if (r\[CONFIG.C\_IDX.VERIFIED\] \=== true) {  
      clusters.push({  
        lat: lat,  
        lng: lng,  
        name: r\[CONFIG.C\_IDX.SUGGESTED\] || r\[CONFIG.C\_IDX.NAME\],  
        rowIndexes: \[i\],  
        hasLock: true,  
        gridKey: gridKey  
      });  
    }  
  }

  for (var i \= 0; i \< values.length; i++) {  
    if (values\[i\]\[CONFIG.C\_IDX.VERIFIED\] \=== true) continue; 

    var lat \= values\[i\]\[CONFIG.C\_IDX.LAT\];  
    var lng \= values\[i\]\[CONFIG.C\_IDX.LNG\];  
    if (\!lat || \!lng) continue;

    var myGridKey \= Math.floor(lat \* 10\) \+ "\_" \+ Math.floor(lng \* 10);  
    var found \= false;

    for (var c \= 0; c \< clusters.length; c++) {  
      if (clusters\[c\].gridKey \=== myGridKey) {   
        var dist \= getHaversineDistanceKM(lat, lng, clusters\[c\].lat, clusters\[c\].lng);  
        if (dist \<= CONFIG.DISTANCE\_THRESHOLD\_KM) {  
          clusters\[c\].rowIndexes.push(i);  
          found \= true;  
          break;  
        }  
      }  
    }

    if (\!found) {  
      clusters.push({  
        lat: lat,  
        lng: lng,  
        rowIndexes: \[i\],  
        hasLock: false,  
        name: null,  
        gridKey: myGridKey  
      });  
    }  
  }

  var updateCount \= 0;  
  clusters.forEach(function(g) {  
    var candidateNames \= \[\];  
    g.rowIndexes.forEach(function(idx) {   
        var rawName \= values\[idx\]\[CONFIG.C\_IDX.NAME\];  
        var existingSuggested \= values\[idx\]\[CONFIG.C\_IDX.SUGGESTED\];  
        candidateNames.push(rawName);   
        if (existingSuggested && existingSuggested \!== rawName) {  
            candidateNames.push(existingSuggested, existingSuggested, existingSuggested);  
        }  
    });

    var winner \= g.hasLock ? g.name : getBestName\_Smart(candidateNames);  
    var confidence \= g.rowIndexes.length; 

    g.rowIndexes.forEach(function(idx) {  
      if (values\[idx\]\[CONFIG.C\_IDX.VERIFIED\] \!== true) {  
         var currentSuggested \= values\[idx\]\[CONFIG.C\_IDX.SUGGESTED\];  
         var currentConfidence \= values\[idx\]\[CONFIG.C\_IDX.CONFIDENCE\];  
           
         if (currentSuggested \!== winner || currentConfidence \!== confidence) {  
             values\[idx\]\[CONFIG.C\_IDX.SUGGESTED\] \= winner;  
             values\[idx\]\[CONFIG.C\_IDX.CONFIDENCE\] \= confidence;  
             values\[idx\]\[CONFIG.C\_IDX.NORMALIZED\] \= normalizeText(winner);  
             updateCount++;  
         }  
      }  
    });  
  });

  if (updateCount \> 0\) {  
    range.setValues(values);  
    ss.toast("✅ จัดกลุ่มสำเร็จ\! พร้อมอัปเกรดชื่อที่ฉลาดขึ้น (Updated: " \+ updateCount \+ " rows)", "Clustering V4.1");  
  } else {  
    ss.toast("ℹ️ ข้อมูลจัดกลุ่มเรียบร้อยดีอยู่แล้ว ไม่มีการเปลี่ยนแปลง", "Clustering V4.1");  
  }  
}

# Service\_AutoPilot.gs

/\*\*  
 \* VERSION: 000  
 \* 🤖 Service: Auto Pilot (Enterprise AI Edition)  
 \* Version: 4.2 Clean SmartKey & Stable Fallback  
 \* \--------------------------------------------  
 \* \[FIXED v4.2\]: Removed duplicate "tone-less" basic key to keep data clean.   
 \* AI will handle typos and phonetic variations instead.  
 \* \[FIXED v4.2\]: Enforced 'gemini-1.5-flash-latest' to resolve v1beta 404 errors.  
 \* \[PRESERVED\]: Trigger management, LockService, and JSON output parsing.  
 \* Author: Elite Logistics Architect  
 \*/

function START\_AUTO\_PILOT() {  
  STOP\_AUTO\_PILOT();   
  ScriptApp.newTrigger("autoPilotRoutine")  
    .timeBased()  
    .everyMinutes(10)  
    .create();  
      
  var ui \= SpreadsheetApp.getUi();  
  if (ui) {  
    ui.alert("▶️ AI Auto-Pilot: ACTIVATE\\nระบบสมองกลจะทำงานเบื้องหลังทุกๆ 10 นาทีครับ");  
  }  
}

function STOP\_AUTO\_PILOT() {  
  var triggers \= ScriptApp.getProjectTriggers();  
  for (var i \= 0; i \< triggers.length; i++) {  
    if (triggers\[i\].getHandlerFunction() \=== "autoPilotRoutine") {  
      ScriptApp.deleteTrigger(triggers\[i\]);  
    }  
  }  
}

function autoPilotRoutine() {  
  var lock \= LockService.getScriptLock();  
  if (\!lock.tryLock(10000)) {  
    console.warn("\[AutoPilot\] Skipped: มี instance อื่นกำลังรันอยู่");  
    return;  
  }

  try {  
    console.time("AutoPilot\_Duration");  
    console.info("\[AutoPilot\] 🚀 Starting routine...");

    try {  
      if (typeof applyMasterCoordinatesToDailyJob \=== 'function') {  
        var ss \= SpreadsheetApp.getActiveSpreadsheet();  
        var dataSheet \= ss.getSheetByName(typeof SCG\_CONFIG \!== 'undefined' ? SCG\_CONFIG.SHEET\_DATA : 'Data');  
        if (dataSheet && dataSheet.getLastRow() \> 1\) {  
           applyMasterCoordinatesToDailyJob();  
           console.log("✅ AutoPilot: SCG Sync Completed");  
        }  
      }  
    } catch(e) { console.error("\[AutoPilot\] SCG Sync Error: " \+ e.message); }

    try {  
      processAIIndexing\_Batch();   
    } catch(e) { console.error("\[AutoPilot\] AI Indexing Error: " \+ e.message); }

    console.timeEnd("AutoPilot\_Duration");  
    console.info("\[AutoPilot\] 🏁 Routine finished successfully.");

  } catch (e) {  
    console.error("CRITICAL AutoPilot Error: " \+ e.message);  
  } finally {  
    lock.releaseLock();  
  }  
}

function processAIIndexing\_Batch() {  
  var apiKey;  
  try {  
    apiKey \= CONFIG.GEMINI\_API\_KEY;  
  } catch (e) {  
    console.warn("⚠️ SKIPPED AI: " \+ e.message);   
    return;  
  }

  var ss \= SpreadsheetApp.getActiveSpreadsheet();  
  var sheet \= ss.getSheetByName(CONFIG.SHEET\_NAME);  
  if (\!sheet) return;

  var lastRow \= typeof getRealLastRow\_ \=== 'function' ? getRealLastRow\_(sheet, CONFIG.COL\_NAME) : sheet.getLastRow();  
  if (lastRow \< 2\) return;

  var rangeName \= sheet.getRange(2, CONFIG.COL\_NAME, lastRow \- 1, 1);  
  var rangeNorm \= sheet.getRange(2, CONFIG.COL\_NORMALIZED, lastRow \- 1, 1);  
    
  var nameValues \= rangeName.getValues();  
  var normValues \= rangeNorm.getValues();   
    
  var aiCount \= 0;  
  var AI\_LIMIT \= (typeof CONFIG \!== 'undefined' && CONFIG.AI\_BATCH\_SIZE) ? CONFIG.AI\_BATCH\_SIZE : 20;   
  var updated \= false;

  for (var i \= 0; i \< nameValues.length; i++) {  
    if (aiCount \>= AI\_LIMIT) break;

    var name \= nameValues\[i\]\[0\];  
    var currentNorm \= normValues\[i\]\[0\];

    if (name && typeof name \=== 'string' && (\!currentNorm || currentNorm.toString().indexOf("\[AI\]") \=== \-1)) {  
        
      var basicKey \= createBasicSmartKey(name);  
      var aiKeywords \= "";  
        
      if (name.length \> 3\) {  
        aiKeywords \= genericRetry(function() {   
          return callGeminiThinking\_JSON(name, apiKey);   
        }, 2);   
      }  
        
      var finalString \= basicKey \+ (aiKeywords ? " " \+ aiKeywords : "") \+ " \[AI\]";  
      normValues\[i\]\[0\] \= finalString.trim();  
        
      console.log(\`🤖 AI Processed (${aiCount+1}/${AI\_LIMIT}): \[${name}\] \-\> ${aiKeywords}\`);  
      aiCount++;  
      updated \= true;  
    }  
  }

  if (updated) {  
    rangeNorm.setValues(normValues);  
    console.log(\`✅ AI Batch Write: อัปเดตฐานข้อมูล ${aiCount} รายการ.\`);  
  } else {  
    console.log("ℹ️ AI Standby: ไม่มีข้อมูลใหม่ที่ต้องให้ AI วิเคราะห์.");  
  }  
}

function callGeminiThinking\_JSON(customerName, apiKey) {  
  try {  
    // \[FIXED v4.2\] Enforce latest model to prevent v1beta 404 NOT\_FOUND API Errors  
    var model \= (typeof CONFIG \!== 'undefined' && CONFIG.AI\_MODEL) ? CONFIG.AI\_MODEL : "gemini-1.5-flash-latest";  
    var apiUrl \= \`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}\`;  
      
    var prompt \= \`  
      Task: Analyze this Thai logistics customer name: "${customerName}"  
      Goal: Return a JSON list of search keywords, abbreviations, and common typos.  
      Requirements:  
      1\. If English, provide Thai phonetics.  
      2\. If Thai abbreviation (e.g., บจก, รพ), provide full text.  
      3\. No generic words like "Company", "Limited", "จำกัด", "บริษัท".  
      4\. Max 5 keywords.  
        
      Output Format: JSON Array of Strings ONLY.  
      Example: \["Keyword1", "Keyword2"\]  
    \`;

    var payload \= {  
      "contents": \[{ "parts": \[{ "text": prompt }\] }\],  
      "generationConfig": { "responseMimeType": "application/json" }   
    };

    var options \= {  
      "method": "post",  
      "contentType": "application/json",  
      "payload": JSON.stringify(payload),  
      "muteHttpExceptions": true  
    };

    var response \= UrlFetchApp.fetch(apiUrl, options);  
    var statusCode \= response.getResponseCode();  
      
    if (statusCode \!== 200\) {  
      throw new Error(\`API Error ${statusCode}: ${response.getContentText()}\`);  
    }

    var json \= JSON.parse(response.getContentText());

    if (json.candidates && json.candidates.length \> 0\) {  
      var text \= json.candidates\[0\].content.parts\[0\].text;  
      var keywords \= JSON.parse(text);   
        
      if (Array.isArray(keywords)) {  
        return keywords.join(" ");   
      }  
    }  
  } catch (e) {  
    console.warn("Gemini Error (" \+ customerName \+ "): " \+ e.message);  
    return "";   
  }  
  return "";  
}

/\*\*  
 \* 🔨 Helper: สร้าง Index แบบพื้นฐาน (Regex)  
 \* \[FIXED v4.2\]: ยกเลิกการเติมคำซ้ำ (ตัดวรรณยุกต์) เพื่อให้ข้อมูลดูสะอาดตาที่สุด  
 \*/  
function createBasicSmartKey(text) {  
  if (\!text) return "";  
  var clean \= typeof normalizeText \=== 'function' ? normalizeText(text) : text.toString().toLowerCase().replace(/\\s/g, "");   
  return clean; // คืนค่าเฉพาะคำที่ตัด Stop Words ออกแล้ว โดยไม่ Duplicate ให้รกช่อง  
}
