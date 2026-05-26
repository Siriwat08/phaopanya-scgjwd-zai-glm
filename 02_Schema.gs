/**
 * VERSION: 5.4.001
 * FILE: 02_Schema.gs
 * LMDS V5.4 — Sheet Schema Definitions
 * ===================================================
 * PURPOSE:
 *   กำหนด Schema ของทุก Sheet ในระบบ รวมถึง Column Headers และ Validation Rules
 *   เป็น Single Source of Truth สำหรับโครงสร้างข้อมูล
 * ===================================================
 * CHANGELOG:
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [ADD] M_ALIAS to validateSchemaConsistency() checks array
 *   v5.4.000 (2026-05-23):
 *     - [ADD] M_ALIAS schema (8 cols: alias_id, master_uuid, variant_name, entity_type, confidence, source, created_at, active_flag)
 *     - [ADD] M_PLACE_ALIAS schema (6 cols)
 *   v5.2.014 (PH2):
 *     - [FIX] SCHEMA.Input: เปลี่ยนจาก ['Shipment_No', 'หมายเหตุ'] เป็น ['COOKIE', 'ShipmentNos']
 *   v5.2.003:
 *     - [FIX] SYS_TH_GEO: ลำดับคอลัมน์ถูกต้องตามชีตจริง
 *     - [FIX] ข้อมูลพนักงาน: เพิ่มเป็น 8 คอลัมน์ตามชีตจริง
 *     - [FIX] MAPS_CACHE: เพิ่ม province[8] และ district[9]
 * ===================================================
 * DEPENDENCIES:
 *   DEFINES SCHEMA FOR:
 *     - SHEET.M_PERSON        → 06_PersonService.gs
 *     - SHEET.M_PERSON_ALIAS  → 06_PersonService.gs / 10_MatchEngine.gs
 *     - SHEET.M_PLACE         → 07_PlaceService.gs
 *     - SHEET.M_PLACE_ALIAS   → 07_PlaceService.gs / 10_MatchEngine.gs
 *     - SHEET.M_ALIAS         → 21_AliasService.gs / 10_MatchEngine.gs (Single Writer)
 *     - SHEET.M_GEO_POINT     → 08_GeoService.gs
 *     - SHEET.M_DESTINATION   → 09_DestinationService.gs
 *     - SHEET.FACT_DELIVERY   → 11_TransactionService.gs / 10_MatchEngine.gs
 *     - SHEET.Q_REVIEW        → 12_ReviewService.gs
 *     - SHEET.DAILY_JOB       → 18_ServiceSCG.gs / 17_SearchService.gs
 *     - SHEET.MAPS_CACHE      → 15_GoogleMapsAPI.gs
 *     - SHEET.SYS_TH_GEO      → 16_GeoDictionaryBuilder.gs
 *   USED BY (Index References):
 *     - 01_Config.gs         (INDEX constants via validateConfig)
 *     - All Service files     (getValues/setValues)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  02_Schema.gs (Schema Definition Hub)                      │
 *   │  ├── SCHEMA{} — Array of column names per sheet            │
 *   │  │   ├── Group 1: Master Data (M_PERSON, M_ALIAS, ...)    │
 *   │  │   ├── Group 1: Fact Table (FACT_DELIVERY)               │
 *   │  │   ├── Group 2: Daily Ops (ตารางงานประจำวัน)            │
 *   │  │   └── System: SYS_LOG, SYS_CONFIG, SYS_TH_GEO          │
 *   │  ├── getSheetHeaders() — Get headers for a sheet           │
 *   │  ├── validateSheetHeaders() — Verify headers match schema  │
 *   │  ├── getColIndex() — Find column index by name             │
 *   │  └── validateSchemaConsistency() — SCHEMA.length vs IDX    │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

const SCHEMA = Object.freeze({

  // ============================================================
  // กลุ่ม 1: Master Data
  // ============================================================

  'M_PERSON': [
    'person_id',        // [0]
    'canonical_name',   // [1]
    'normalized_name',  // [2]
    'phone',            // [3]
    'first_seen',       // [4]
    'last_seen',        // [5]
    'usage_count',      // [6]
    'record_status',    // [7]
    'note',             // [8]
    'master_uuid',      // [9]
  ],

  'M_PERSON_ALIAS': [
    'alias_id',     // [0]
    'person_id',    // [1]
    'alias_name',   // [2]
    'match_score',  // [3]
    'created_at',   // [4]
    'active_flag',  // [5]
  ],

  'M_PLACE': [
    'place_id',        // [0]
    'canonical_name',  // [1]
    'normalized_name', // [2]
    'place_type',      // [3]
    'sub_district',    // [4]
    'district',        // [5]
    'province',        // [6]
    'postcode',        // [7]
    'first_seen',      // [8]
    'last_seen',       // [9]
    'usage_count',     // [10]
    'record_status',   // [11]
    'note',            // [12]
    'master_uuid',     // [13]
  ],

  'M_PLACE_ALIAS': [
    'alias_id',     // [0]
    'place_id',     // [1]
    'alias_name',   // [2]
    'match_score',  // [3]
    'created_at',   // [4]
    'active_flag',  // [5]
  ],

  'M_ALIAS': [
    'alias_id',
    'master_uuid',
    'variant_name',
    'entity_type',
    'confidence',
    'source',
    'created_at',
    'active_flag',
  ],

  'M_GEO_POINT': [
    'geo_id',           // [0]
    'lat',              // [1]
    'lng',              // [2]
    'radius_m',         // [3]
    'resolved_address', // [4]
    'province',         // [5]
    'district',         // [6]
    'source',           // [7]
    'coord_confidence', // [8]
    'first_seen',       // [9]
    'last_seen',        // [10]
    'usage_count',      // [11]
    'record_status',    // [12]
    'extraction_method',// [13] [NEW v5.2.008] (google|place_fallback|text_fallback)
  ],

  'M_DESTINATION': [
    'dest_id',       // [0]
    'person_id',     // [1]
    'place_id',      // [2]
    'geo_id',        // [3]
    'lat',           // [4]
    'lng',           // [5]
    'route_label',   // [6]
    'delivery_date', // [7]
    'usage_count',   // [8]
    'last_seen',     // [9]
    'record_status', // [10]
  ],

  // ============================================================
  // กลุ่ม 1: Fact Table
  // ============================================================

  'FACT_DELIVERY': [
    'tx_id',             // [0]
    'source_sheet',      // [1]
    'source_row_number', // [2]
    'source_record_id',  // [3]
    'delivery_date',     // [4] ✅
    'delivery_time',     // [5]
    'invoice_no',        // [6]
    'shipment_no',       // [7]
    'driver_name',       // [8]
    'truck_license',     // [9]
    'sold_to_code',      // [10]
    'sold_to_name',      // [11]
    'ship_to_name',      // [12]
    'ship_to_address',   // [13]
    'geo_resolved_addr', // [14]
    'person_id',         // [15]
    'place_id',          // [16]
    'geo_id',            // [17] ✅
    'dest_id',           // [18] Fix: เดิม destination_id
    'warehouse',         // [19]
    'raw_lat',           // [20]
    'raw_lng',           // [21]
    'match_status',      // [22]
    'match_confidence',  // [23]
    'match_reason',      // [24]
    'match_action',      // [25]
    'resolved_lat',      // [26]
    'resolved_lng',      // [27]
    'created_at',        // [28]
    'updated_at',        // [29]
    'record_status',     // [30]
    'match_evidence',    // [31] [NEW v5.2.008] สัญญาณที่ใช้แมตช์ (name|phone|geo)
  ],

  // ============================================================
  // กลุ่ม 1: Review Queue
  // ============================================================

  'Q_REVIEW': [
    'review_id',                 // [0]
    'issue_type',                // [1]
    'priority',                  // [2]
    'source_record_id',          // [3]
    'source_row_number',         // [4]
    'invoice_no',                // [5]
    'raw_person_name',           // [6]
    'raw_place_name',            // [7]
    'raw_system_address',        // [8]
    'raw_lat',                   // [9]  ✅ ขยับขึ้นมาหลังลบ raw_geo_resolved_address
    'raw_lng',                   // [10]
    'candidate_person_ids',      // [11]
    'candidate_place_ids',       // [12]
    'candidate_geo_ids',         // [13]
    'candidate_destination_ids', // [14]
    'match_score',               // [15]
    'recommended_action',        // [16]
    'status',                    // [17]
    'reviewer',                  // [18]
    'reviewed_at',               // [19]
    'decision',                  // [20]
    'note',                      // [21]
  ],

  // ============================================================
  // กลุ่ม 1: System Support
  // ============================================================

  'SYS_LOG': [
    'log_id',    // [0]
    'timestamp', // [1]
    'module',    // [2]
    'level',     // [3]
    'message',   // [4]
    'details',   // [5]
  ],

  'SYS_CONFIG': [
    'config_key',   // [0]
    'config_value', // [1]
    'description',  // [2]
    'updated_at',   // [3]
  ],

  /**
   * SYS_TH_GEO — 5 คอลัมน์
   * [FIX v003] ลำดับถูกต้องตามชีตจริง
   * ชีตจริง: รหัสไปรษณีย์[0], แขวง/ตำบล[1], เขต/อำเภอ[2], จังหวัด[3], หมายเหตุ[4]
   * เดิมผิด: sub_district[0], district[1], province[2], postcode[3], region[4]
   */
  'SYS_TH_GEO': [
    'รหัสไปรษณีย์',      // [0] POSTCODE
    'แขวง/ตำบล',         // [1] SUB_DISTRICT
    'เขต/อำเภอ',         // [2] DISTRICT
    'จังหวัด',           // [3] PROVINCE
    'หมายเหตุ',          // [4] NOTE (Reference)
    'ตำบล_clean',       // [5] SUB_DISTRICT_CLEAN
    'อำเภอ_clean',       // [6] DISTRICT_CLEAN
    'ตำบล_label',       // [7] SUB_DISTRICT_LABEL
    'อำเภอ_label',       // [8] DISTRICT_LABEL
    'tambon_norm',      // [9] TAMBON_NORM
    'amphoe_norm',      // [10] AMPHOE_NORM
    'province_norm',    // [11] PROVINCE_NORM
    'search_key',       // [12] SEARCH_KEY (tambon|amphoe|province)
    'postal_key',       // [13] POSTAL_KEY (postal|tambon)
    'note_type',        // [14] NOTE_TYPE
    'note_scope',       // [15] NOTE_SCOPE
  ],

  'RPT_DATA_QUALITY': [
    'report_date',   // [0]
    'total_records', // [1]
    'auto_matched',  // [2]
    'reviewed',      // [3]
    'created_new',   // [4]
    'failed',        // [5]
    'match_rate',    // [6]
    'notes',         // [7]
  ],

  /**
   * MAPS_CACHE — 10 คอลัมน์
   * [FIX v003] เพิ่ม province[8] และ district[9]
   * เพื่อรองรับ reverseGeocode() ที่ต้องเก็บ province/district
   */
  'MAPS_CACHE': [
    'cache_key',        // [0]
    'address_input',    // [1]
    'lat',              // [2]
    'lng',              // [3]
    'resolved_address', // [4]
    'source',           // [5]
    'created_at',       // [6]
    'hit_count',        // [7]
    'province',         // [8] Fix: เพิ่มใหม่
    'district',         // [9] Fix: เพิ่มใหม่
  ],

  // ============================================================
  // กลุ่ม 2: Daily Ops
  // ============================================================

  'ตารางงานประจำวัน': [
    'ID_งานประจำวัน',                         // [0]
    'PlanDelivery',                            // [1]
    'InvoiceNo',                               // [2]
    'ShipmentNo',                              // [3]
    'DriverName',                              // [4]
    'TruckLicense',                            // [5]
    'CarrierCode',                             // [6]
    'CarrierName',                             // [7]
    'SoldToCode',                              // [8]
    'SoldToName',                              // [9]
    'ShipToName',                              // [10]
    'ShipToAddress',                           // [11]
    'LatLong_SCG',                             // [12]
    'MaterialName',                            // [13]
    'ItemQuantity',                            // [14]
    'QuantityUnit',                            // [15]
    'ItemWeight',                              // [16]
    'DeliveryNo',                              // [17]
    'จำนวนปลายทาง_System',                    // [18]
    'รายชื่อปลายทาง_System',                  // [19]
    'ScanStatus',                              // [20]
    'DeliveryStatus',                          // [21]
    'Email พนักงาน',                           // [22]
    'จำนวนสินค้ารวมของร้านนี้',               // [23]
    'น้ำหนักสินค้ารวมของร้านนี้',            // [24]
    'จำนวน_Invoice_ที่ต้องสแกน',             // [25]
    'LatLong_Actual',                          // [26]
    'ชื่อเจ้าของสินค้า_Invoice_ที่ต้องสแกน', // [27]
    'ShopKey',                                 // [28]
  ],

  'Input': [
    'COOKIE',      // [0] เซลล์ A1
    'ShipmentNos', // [1] เซลล์ A3
  ],

  /**
   * ข้อมูลพนักงาน — 8 คอลัมน์
   * [FIX v003] ตามชีตจริง (เดิม 5 คอลัมน์ผิด)
   */
  'ข้อมูลพนักงาน': [
    'ID_พนักงาน',              // [0] EMPLOYEE_IDX.EMP_ID
    'ชื่อ - นามสกุล',          // [1] EMPLOYEE_IDX.FULL_NAME
    'เบอร์โทรศัพท์',           // [2] EMPLOYEE_IDX.PHONE
    'เลขที่บัตรประชาชน',       // [3] EMPLOYEE_IDX.NATIONAL_ID
    'ทะเบียนรถ',               // [4] EMPLOYEE_IDX.TRUCK_LIC
    'เลือกประเภทรถยนต์',       // [5] EMPLOYEE_IDX.TRUCK_TYPE
    'Email พนักงาน',            // [6] EMPLOYEE_IDX.EMAIL
    'ROLE',                     // [7] EMPLOYEE_IDX.ROLE
  ],

  /**
   * สรุป_เจ้าของสินค้า — 6 คอลัมน์
   * [FIX v003] ชื่อคอลัมน์ถูกต้องตามชีตจริง
   */
  'สรุป_เจ้าของสินค้า': [
    'SummaryKey',             // [0] Fix: เดิม ลำดับ
    'SoldToName',             // [1] Fix: เดิม เจ้าของสินค้า
    'PlanDelivery',           // [2] Fix: เดิม หมายเหตุ
    'จำนวน_ทั้งหมด',         // [3] Fix: เดิม จำนวน Invoice
    'จำนวน_E-POD_ทั้งหมด',   // [4] Fix: เดิม จำนวน E-POD
    'LastUpdated',            // [5] Fix: เดิม วันที่อัปเดต
  ],

  /**
   * สรุป_Shipment — 7 คอลัมน์
   * [FIX v003] ชื่อคอลัมน์ถูกต้องตามชีตจริง
   */
  'สรุป_Shipment': [
    'ShipmentKey',            // [0] Fix: เดิม key
    'ShipmentNo',             // [1] ✅
    'TruckLicense',           // [2] ✅
    'PlanDelivery',           // [3] Fix: เดิม หมายเหตุ
    'จำนวน_ทั้งหมด',         // [4] Fix: เดิม จำนวน Invoice
    'จำนวน_E-POD_ทั้งหมด',   // [5] Fix: เดิม จำนวน E-POD
    'LastUpdated',            // [6] Fix: เดิม วันที่อัปเดต
  ],

});

// ============================================================
// Schema Utility Functions
// ============================================================

/**
 * getSheetHeaders — คืน Header Array ของชีตที่ระบุ
 * @param {string} sheetName - ชื่อชีตจริง (ค่าจาก SHEET.xxx)
 */
function getSheetHeaders(sheetName) {
  const headers = SCHEMA[sheetName];
  if (!headers) {
    throw new Error(
      `[Schema] ไม่พบ Schema สำหรับชีต: "${sheetName}"\n` +
      `Schema ที่มี: ${Object.keys(SCHEMA).join(', ')}`
    );
  }
  return headers;
}

/**
 * validateSheetHeaders — ตรวจสอบ Header ของชีตกับ Schema
 * [FIX v002] เพิ่ม wrongOrder + normalize case
 * [FIX v003] ยืนยันใช้งานได้
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string[]} expected
 * @return {{ isValid, missing, extra, wrongOrder }}
 */
function validateSheetHeaders(sheet, expected) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    return { isValid: false, missing: expected, extra: [], wrongOrder: false };
  }

  const normalize   = s => String(s).trim().toLowerCase();
  const actual      = sheet.getRange(1, 1, 1, lastCol)
                           .getValues()[0]
                           .map(h => String(h).trim());
  const actualNorm  = actual.map(normalize);
  const expectNorm  = expected.map(normalize);

  const missing = expected.filter(h => !actualNorm.includes(normalize(h)));
  const extra   = actual.filter(h => h !== '' && !expectNorm.includes(normalize(h)));

  // ตรวจลำดับ
  let wrongOrder = false;
  if (missing.length === 0) {
    wrongOrder = expectNorm.some((h, i) => actualNorm[i] !== h);
  }

  return {
    isValid:    missing.length === 0 && !wrongOrder,
    missing:    missing,
    extra:      extra,
    wrongOrder: wrongOrder,
  };
}

/**
 * getColIndex — ค้นหา Index ของ Column (0-based)
 * @param {string} schemaKey - ชื่อชีตจริง
 * @param {string} colName
 * @return {number} Index หรือ -1
 */
function getColIndex(schemaKey, colName) {
  const headers = SCHEMA[schemaKey];
  if (!headers) return -1;
  return headers.indexOf(colName);
}

/**
 * validateSchemaConsistency — ตรวจ SCHEMA.length vs IDX.keys
 * เรียกจาก validateConfig() ใน 01_Config.gs
 */
function validateSchemaConsistency() {
  const checks = [
    { sheetName: SHEET.M_PERSON,       idx: PERSON_IDX,       label: 'M_PERSON'       },
    { sheetName: SHEET.M_PERSON_ALIAS, idx: PERSON_ALIAS_IDX, label: 'M_PERSON_ALIAS' },
    { sheetName: SHEET.M_PLACE,        idx: PLACE_IDX,        label: 'M_PLACE'        },
    { sheetName: SHEET.M_PLACE_ALIAS,  idx: PLACE_ALIAS_IDX,  label: 'M_PLACE_ALIAS'  },
    { sheetName: SHEET.M_GEO_POINT,    idx: GEO_IDX,          label: 'M_GEO_POINT'    },
    { sheetName: SHEET.M_DESTINATION,  idx: DEST_IDX,         label: 'M_DESTINATION'  },
    { sheetName: SHEET.FACT_DELIVERY,  idx: FACT_IDX,         label: 'FACT_DELIVERY'  },
    { sheetName: SHEET.Q_REVIEW,       idx: REVIEW_IDX,       label: 'Q_REVIEW'       },
    { sheetName: SHEET.M_ALIAS,        idx: ALIAS_IDX,        label: 'M_ALIAS'        },
  ];

  const errors = [];
  checks.forEach(item => {
    const schemaArr = SCHEMA[item.sheetName];
    if (!schemaArr) {
      errors.push(`ไม่พบ SCHEMA key: "${item.sheetName}"`);
      return;
    }
    const idxLen = Object.keys(item.idx).length;
    if (schemaArr.length !== idxLen) {
      errors.push(
        `${item.label}: SCHEMA=${schemaArr.length} cols แต่ IDX=${idxLen} keys`
      );
    }
  });

  if (errors.length > 0) {
    throw new Error(
      `Schema Consistency Error (v${SCHEMA_VERSION}):\n` +
      errors.join('\n')
    );
  }

  logInfo('Schema', `validateSchemaConsistency ผ่าน — v${SCHEMA_VERSION}`);
  return true;
}
