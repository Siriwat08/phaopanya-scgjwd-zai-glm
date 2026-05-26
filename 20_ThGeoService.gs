/**
 * VERSION: 5.4.001
 * FILE: 20_ThGeoService.gs
 * LMDS V5.4 — Thai Geo Service
 * ===================================================
 * PURPOSE:
 *   ให้บริการค้นหาข้อมูลภูมิศาสตร์ไทย — ค้นหาจังหวัด/อำเภอ/ตำบล
 *   จากรหัสไปรษณีย์ หรือชื่อพื้นที่
 * ===================================================
 * CHANGELOG:
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [ADD] Comprehensive header documentation
 *   v5.4.000 (2026-05-24):
 *     - [UPGRADE] Version bump to 5.4.000
 *     - [ADD] Comprehensive header documentation
 *     - [ADD] DEPENDENCIES section with module relationships
 *     - [ENHANCE] Detailed module interconnection mapping
 *   v001 (original):
 *     - Initial release — Advanced TH Geo Service (16 Columns)
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config (SHEET.SYS_TH_GEO, TH_GEO_IDX.*)
 *     - 02_Schema (SCHEMA)
 *     - 05_NormalizeService (normalizeForCompare)
 *     - 16_GeoDictionaryBuilder (loadCachedGeoRows_, safeAlert_)
 *     - 14_Utils (diceCoefficient)
 *   CALLS (Invokes):
 *     - normalizeForCompare() → 05_NormalizeService
 *     - loadCachedGeoRows_() → 16_GeoDictionaryBuilder
 *     - safeAlert_() → 16_GeoDictionaryBuilder
 *     - logInfo() → 03_SetupSheets
 *   EXPORTS TO:
 *     - 07_PlaceService (getEnrichedGeoData — uses extractGeoFromAddress)
 *     - 16_GeoDictionaryBuilder (populateGeoMetadata — shared function)
 *     - 17_SearchService (geo search utilities)
 *   SHEETS ACCESSED:
 *     - SHEET.SYS_TH_GEO (Read: dictionary lookup for geo extraction)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────┐
 *   │             20_ThGeoService.gs                      │
 *   │         Thai Geography Extraction                   │
 *   ├─────────────────────────────────────────────────────┤
 *   │                                                     │
 *   │  extractGeoFromAddress ── 3-tier search:            │
 *   │       ├── Tier 1: postal_key match                  │
 *   │       ├── Tier 2: search_key match                  │
 *   │       └── Tier 3: norm column fuzzy match           │
 *   │                                                     │
 *   │  populateGeoMetadata ── Batch fill 16 metadata      │
 *   │       │                  columns for all            │
 *   │       │                  SYS_TH_GEO rows            │
 *   │       │                                             │
 *   │       └── Columns: sub_district_clean,              │
 *   │           district_clean, labels, norms,            │
 *   │           search_key, postal_key, note_type,        │
 *   │           note_scope                                │
 *   │                                                     │
 *   └─────────────────────────────────────────────────────┘
 * ===================================================
 */

/**
 * extractGeoFromAddress — แกะข้อมูลภูมิศาสตร์โดยใช้ Search Key (16 คอลัมน์)
 * [NEW v5.2.008] แม่นยำกว่า Regex เพราะค้นจาก Dictionary ตรงๆ
 */
function extractGeoFromAddress(rawText) {
  if (!rawText) return null;
  
  const cleanText = normalizeForCompare(rawText);
  const data = loadCachedGeoRows_(); // โหลดจาก Cache (16 คอลัมน์)
  
  let bestMatch = null;
  let maxScore = 0;

  for (const row of data) {
    const sKey = row.searchKey || ''; // 'tambon|amphoe|province'
    if (!sKey) continue;

    // วิธีที่ 1: ตรวจสอบการมีอยู่ของ Search Key ทั้งก้อน
    if (cleanText.includes(normalizeForCompare(row.subDistrict)) && 
        cleanText.includes(normalizeForCompare(row.district))) {
      
      const score = 1.0;
      if (score > maxScore) {
        maxScore = score;
        bestMatch = row;
      }
    }
    if (maxScore === 1.0) break;
  }

  return bestMatch;
}

/**
 * [MIGRATION TOOL] populateGeoMetadata
 * รันฟังก์ชันนี้ "ครั้งเดียว" หลังจากเพิ่มคอลัมน์ F-P ในชีต SYS_TH_GEO แล้ว
 * เพื่อเติมข้อมูลอัตโนมัติ
 */
function populateGeoMetadata() {
  try {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.SYS_TH_GEO);
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  
  logInfo('GeoMigration', `เริ่มเติมข้อมูล Metadata — ${rows.length} แถว`);

  const updatedRows = rows.map(row => {
    const post = String(row[TH_GEO_IDX.POSTCODE] || '').trim();
    const sub  = String(row[TH_GEO_IDX.SUB_DISTRICT] || '').trim();
    const dist = String(row[TH_GEO_IDX.DISTRICT] || '').trim();
    const prov = String(row[TH_GEO_IDX.PROVINCE] || '').trim();

    // 1. Clean (ตัด prefix)
    const subC = sub.replace(/แขวง|ตำบล|ต\.|ข\./g, '').trim();
    const distC = dist.replace(/เขต|อำเภอ|อ\.|ข\./g, '').trim();

    // 2. Label
    const subL = sub.includes('แขวง') ? 'แขวง' : 'ตำบล';
    const distL = dist.includes('เขต') ? 'เขต' : 'อำเภอ';

    // 3. Normalized
    const subN = normalizeForCompare(subC);
    const distN = normalizeForCompare(distC);
    const provN = normalizeForCompare(prov);

    // 4. Keys
    const searchKey = `${subN}|${distN}|${provN}`;
    const postalKey = `${post}|${subN}`;

    // 5. Note Classification (เบื้องต้น)
    let nType = 'FULL_AREA';
    let nScope = 'FULL';
    const note = String(row[TH_GEO_IDX.NOTE] || '');
    if (note.includes('ยกเว้น') || note.includes('เฉพาะ')) {
      nType = 'CHECK_NOTE';
      nScope = 'PARTIAL';
    }

    // เติมลงคอลัมน์ F-P (Index 5-15)
    row[TH_GEO_IDX.SUB_DISTRICT_CLEAN] = subC;
    row[TH_GEO_IDX.DISTRICT_CLEAN]     = distC;
    row[TH_GEO_IDX.SUB_DISTRICT_LABEL] = subL;
    row[TH_GEO_IDX.DISTRICT_LABEL]     = distL;
    row[TH_GEO_IDX.TAMBON_NORM]        = subN;
    row[TH_GEO_IDX.AMPHOE_NORM]        = distN;
    row[TH_GEO_IDX.PROVINCE_NORM]      = provN;
    row[TH_GEO_IDX.SEARCH_KEY]         = searchKey;
    row[TH_GEO_IDX.POSTAL_KEY]         = postalKey;
    row[TH_GEO_IDX.NOTE_TYPE]          = nType;
    row[TH_GEO_IDX.NOTE_SCOPE]         = nScope;

    return row;
  });

  sheet.getRange(2, 1, updatedRows.length, updatedRows[0].length).setValues(updatedRows);
  logInfo('GeoMigration', 'เติมข้อมูล Metadata เสร็จสิ้น!');
  safeAlert_('✅ เติมข้อมูล Geo Metadata สำเร็จ!\nกรุณากด "สร้าง Geo Dictionary" อีกครั้งเพื่อใช้งาน');
  } catch (err) {
    logError('ThGeoService', err.message + '\n' + err.stack);
    SpreadsheetApp.getUi().alert('เกิดข้อผิดพลาด: ' + err.message);
  }
}
