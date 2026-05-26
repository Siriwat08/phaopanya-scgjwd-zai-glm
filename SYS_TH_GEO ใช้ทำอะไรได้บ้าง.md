// ====================================================
📊 [2] SYS_TH_GEO — คอลัมน์ที่เพิ่มใหม่
ระบบเพิ่ม 11 คอลัมน์ จากข้อมูลต้นทาง 5 คอลัมน์:
Colชื่อบทบาทAรหัสไปรษณีย์Key หลัก (5 หลัก zero-padded)B–Eข้อมูลเดิม (renamed)ตามที่ขอFตำบล_cleanตัด "แขวง/ตำบล" ออกGอำเภอ_cleanตัด "เขต/อำเภอ" ออกHตำบล_label'แขวง' หรือ 'ตำบล'Iอำเภอ_label'เขต' หรือ 'อำเภอ'Jtambon_normnormalized ไม่มี space lowercaseKamphoe_normnormalizedLprovince_normnormalizedMsearch_keytambon|amphoe|province — ใช้ lookupNpostal_keypostal|tambon — ใช้ dedupOnote_typeAUTO-classified: FULL_AREA / SPECIFIC_MOO / EXCLUDE_SOME / SPECIFIC_BUILDING / SPECIFIC_ROAD / SPECIFIC_OTHER / CHECK_NOTEPnote_scopeFULL หรือ PARTIAL
หมายเหตุ (คำตอบตรงๆ): ไม่ต้องแปลงอะไรเพิ่มในคอลัมน์ E ครับ ระบบ Auto-classify ให้แล้วใน O+P ส่วนข้อความ E เก็บไว้เป็น reference สำหรับ Admin ตรวจสอบเอง เพราะ logic "ยกเว้น ซอย 73, 75..." นั้นละเอียดเกินกว่าจะ auto-parse ได้ถูกต้อง 100%

🎯 [3] Module 16 — ThGeoService ใช้ทำอะไรได้บ้าง
extractGeoFromAddress("123 แขวงลาดพร้าว เขตลาดพร้าว กทม 10230")
→ { tambon:'ลาดพร้าว', amphoe:'ลาดพร้าว',
    province:'กรุงเทพมหานคร', postal:'10230', confidence:100 }

lookupPostalCode("พระโขนง", "คลองเตย", "กรุงเทพมหานคร")
→ { postal_code:'10110', note_type:'EXCLUDE_SOME', note_scope:'PARTIAL',
    note_raw:'ทั้งแขวง(ยกเว้น ถนนสุขุมวิท...)' }

validateAddressWithGeo("เขตลาดพร้าว กทม", "10230")
→ { valid:true, confidence:95, details:'Postal match: 10230' }
PlaceService จะเรียก extractGeoFromAddress() อัตโนมัติทุกครั้งที่ประมวลผลที่อยู่
// ====================================================
// // VERSION: 001
// MODULE: — ระบบ Reference ข้อมูลภูมิศาสตร์ไทย
//
// ใช้ข้อมูลจากชีต SYS_TH_GEO (7,537 แถว, 16 คอลัมน์)
// เพื่อ:
//   1. ค้นหารหัสไปรษณีย์จากชื่อ ตำบล/อำเภอ/จังหวัด
//   2. Validate ที่อยู่ว่าอยู่ในไทยจริงหรือไม่
//   3. Extract ตำบล/อำเภอ/จังหวัด จากข้อความที่อยู่ (fuzzy)
//   4. เพิ่ม Geo Context ให้ MatchEngine ฉลาดขึ้น
//
// SYS_TH_GEO Column Index (0-based):
//   0: รหัสไปรษณีย์    1: ตำบล_แขวง(raw)  2: อำเภอ_เขต(raw)
//   3: จังหวัด          4: หมายเหตุ          5: ตำบล_clean
//   6: อำเภอ_clean      7: ตำบล_label        8: อำเภอ_label
//   9: tambon_norm     10: amphoe_norm      11: province_norm
//  12: search_key      13: postal_key       14: note_type
//  15: note_scope
// ============================================================
 
const TH_GEO_SHEET = 'SYS_TH_GEO';
const TH_GEO_CACHE_KEY = 'TH_GEO_INDEX';
const TH_GEO_CACHE_S   = 21600; // 6 ชั่วโมง
 
// ─── Column Index ─────────────────────────────────────────────
const TH_GEO_COL = {
  POSTAL:         0,
  TAMBON_RAW:     1,
  AMPHOE_RAW:     2,
  PROVINCE:       3,
  NOTE_RAW:       4,
  TAMBON_CLEAN:   5,
  AMPHOE_CLEAN:   6,
  TAMBON_LABEL:   7,  // 'แขวง' หรือ 'ตำบล'
  AMPHOE_LABEL:   8,  // 'เขต' หรือ 'อำเภอ'
  TAMBON_NORM:    9,
  AMPHOE_NORM:    10,
  PROVINCE_NORM:  11,
  SEARCH_KEY:     12,
  POSTAL_KEY:     13,
  NOTE_TYPE:      14,
  NOTE_SCOPE:     15
};
 
// Stop words ที่ตัดออกจากที่อยู่ก่อนค้นหา
const ADDRESS_STOP_WORDS = [
  'แขวง','ตำบล','เขต','อำเภอ','จังหวัด','จ.','อ.','ต.','ข.','ประเทศไทย',
  'thailand','road','soi','ซอย','ถนน','หมู่','บ้าน','เลขที่'
];
 
// ─────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────
 
/**
 * lookupPostalCode — ค้นหารหัสไปรษณีย์จาก ตำบล+อำเภอ+จังหวัด
 * @param {string} tambon
 * @param {string} amphoe
 * @param {string} province
 * @returns {Object|null} { postal_code, tambon_clean, amphoe_clean, note_type, note_scope, note_raw }
 */
function lookupPostalCode(tambon, amphoe, province) {
  try {
    const idx = _getTHGeoIndex();
    if (!idx) return null;
 
    const tn = _normTH(tambon);
    const an = _normTH(amphoe);
    const pn = _normTH(province);
 
    // ลำดับการค้นหา: exact (3 field) → tambon+amphoe → tambon+province
    const key3 = `${tn}|${an}|${pn}`;
    const key2a = `${tn}|${an}|`;
    const key2b = `${tn}||${pn}`;
 
    let match = idx.bySearchKey[key3]
      || _findPartialKey(idx.bySearchKey, key2a)
      || _findPartialKey(idx.bySearchKey, key2b);
 
    if (!match && tn) {
      // Fuzzy: ค้นจาก tambon_norm อย่างเดียว (ถ้ามีผลเดียว)
      const fuzzyMatches = Object.keys(idx.bySearchKey)
        .filter(k => k.startsWith(tn + '|'))
        .map(k => idx.bySearchKey[k]);
      if (fuzzyMatches.length === 1) match = fuzzyMatches[0];
    }
 
    return match || null;
  } catch (e) {
    writeLog('WARN', '16_ThGeoService', 'lookupPostalCode', null, e.message, null);
    return null;
  }
}
 
/**
 * lookupByPostal — หาทุก ตำบล ที่ใช้รหัสไปรษณีย์นั้น
 * @param {string} postalCode
 * @returns {Object[]}
 */
function lookupByPostal(postalCode) {
  try {
    const idx = _getTHGeoIndex();
    if (!idx) return [];
    return idx.byPostal[String(postalCode).padStart(5,'0')] || [];
  } catch (e) {
    return [];
  }
}
 
/**
 * extractGeoFromAddress — วิเคราะห์ที่อยู่ข้อความ หาตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์
 *
 * ตัวอย่าง input: "123 แขวงลาดพร้าว เขตลาดพร้าว กรุงเทพ 10230"
 * ตัวอย่าง output: { tambon:'ลาดพร้าว', amphoe:'ลาดพร้าว', province:'กรุงเทพมหานคร',
 *                    postal:'10230', confidence: 95 }
 *
 * @param {string} addressText
 * @returns {Object}
 */
function extractGeoFromAddress(addressText) {
  if (!addressText) return _emptyGeoResult();
 
  try {
    const idx = _getTHGeoIndex();
    if (!idx) return _emptyGeoResult();
 
    const text = addressText.replace(/\s+/g, ' ').trim();
 
    // 1. ดึงรหัสไปรษณีย์จาก text (5 หลัก)
    const postalMatch = text.match(/\b(\d{5})\b/);
    const extractedPostal = postalMatch ? postalMatch[1] : null;
 
    // 2. Extract จังหวัด
    const province = _extractProvince(text, idx.provinces);
 
    // 3. Extract อำเภอ/เขต
    const amphoe = _extractAmphoe(text, province, idx);
 
    // 4. Extract ตำบล/แขวง
    const tambon = _extractTambon(text, amphoe, province, idx);
 
    // 5. Lookup postal ถ้า extract ได้
    let resolvedPostal = extractedPostal;
    let matchedRecord  = null;
 
    if (tambon || amphoe) {
      matchedRecord = lookupPostalCode(tambon, amphoe, province);
      if (matchedRecord && !resolvedPostal) {
        resolvedPostal = matchedRecord.postal_code;
      }
    }
 
    // คำนวณ Confidence
    let confidence = 0;
    if (resolvedPostal) confidence += 30;
    if (province)       confidence += 25;
    if (amphoe)         confidence += 25;
    if (tambon)         confidence += 20;
 
    return {
      tambon:      tambon || '',
      amphoe:      amphoe || '',
      province:    province || '',
      postal:      resolvedPostal || '',
      note_type:   matchedRecord ? matchedRecord.note_type  : '',
      note_scope:  matchedRecord ? matchedRecord.note_scope : '',
      note_raw:    matchedRecord ? matchedRecord.note_raw   : '',
      confidence,
      matched_record: matchedRecord
    };
 
  } catch (e) {
    writeLog('WARN', '16_ThGeoService', 'extractGeoFromAddress', null, e.message, null);
    return _emptyGeoResult();
  }
}
 
/**
 * validateAddressWithGeo — ตรวจสอบว่าที่อยู่สอดคล้องกับ postal code หรือไม่
 * ใช้ใน PlaceService เพื่อเพิ่ม Confidence score
 * @param {string} addressText
 * @param {string} postalCode
 * @returns {{ valid: boolean, confidence: number, details: string }}
 */
function validateAddressWithGeo(addressText, postalCode) {
  if (!addressText && !postalCode) return { valid: false, confidence: 0, details: 'no input' };
 
  const extracted = extractGeoFromAddress(addressText);
  if (!extracted.postal) return { valid: false, confidence: 20, details: 'ไม่ extract postal ได้' };
 
  if (postalCode && extracted.postal === String(postalCode)) {
    return { valid: true, confidence: 95, details: `Postal match: ${postalCode}` };
  }
 
  // ค้นว่า extracted postal อยู่ใน province เดียวกันหรือไม่
  if (postalCode && extracted.province) {
    const postalRecords = lookupByPostal(postalCode);
    const sameProvince = postalRecords.some(r => _normTH(r.province) === _normTH(extracted.province));
    if (sameProvince) return { valid: true, confidence: 70, details: `จังหวัดตรง: ${extracted.province}` };
  }
 
  return { valid: false, confidence: 30, details: `postal ไม่ตรง: ได้ ${extracted.postal} คาด ${postalCode}` };
}
 
/**
 * getProvinceList — คืนรายชื่อจังหวัดทั้งหมด 77 จังหวัด
 * @returns {string[]}
 */
function getProvinceList() {
  const idx = _getTHGeoIndex();
  if (!idx) return [];
  return idx.provinces;
}
 
/**
 * setupThGeoSheet — import ข้อมูล SYS_TH_GEO จาก CSV string
 * ใช้ครั้งแรกตอน Setup ถ้าชีตว่างเปล่า
 * *** ปกติ user Import Excel มือ แต่ถ้าต้องการ Auto-seed ใช้ function นี้ ***
 */
function setupThGeoSheet() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
 
  let sh = ss.getSheetByName(TH_GEO_SHEET);
  if (!sh) sh = ss.insertSheet(TH_GEO_SHEET);
 
  // Headers
  const headers = [
    'รหัสไปรษณีย์','ตำบล_แขวง','อำเภอ_เขต','จังหวัด','หมายเหตุ',
    'ตำบล_clean','อำเภอ_clean','ตำบล_label','อำเภอ_label',
    'tambon_norm','amphoe_norm','province_norm',
    'search_key','postal_key','note_type','note_scope'
  ];
 
  if (sh.getLastRow() < 1) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    applyHeaderFormatting(sh, headers.length, '#0F6E56');
    sh.setFrozenRows(1);
    ui.alert(
      '📋 SYS_TH_GEO พร้อมแล้ว',
      'กรุณา Import ไฟล์ SYS_TH_GEO_V001.xlsx ลงในชีตนี้\n\n' +
      'วิธี: File > Import > Upload > เลือก SYS_TH_GEO_V001.xlsx\n' +
      '→ เลือก "Replace data in selected cells"\n' +
      '→ เลือก Sheet = SYS_TH_GEO',
      ui.ButtonSet.OK
    );
  } else {
    writeLog('INFO', '16_ThGeoService', 'setupThGeoSheet', null,
      `SYS_TH_GEO มีข้อมูลแล้ว: ${sh.getLastRow() - 1} แถว`, null);
  }
}
 
/**
 * reloadThGeoCache — Force reload cache (เรียกหลัง import ข้อมูลใหม่)
 */
function reloadThGeoCache() {
  CacheService.getScriptCache().remove(TH_GEO_CACHE_KEY);
  const idx = _buildTHGeoIndex();
  if (idx) {
    writeLog('INFO', '16_ThGeoService', 'reloadThGeoCache', null,
      `โหลด TH_GEO Index สำเร็จ: ${idx.totalRows} แถว`, null);
    SpreadsheetApp.getUi().alert(
      '✅ โหลดข้อมูล TH_GEO สำเร็จ',
      `พบ ${idx.totalRows} แถว | ${idx.provinces.length} จังหวัด`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}
 
// ─────────────────────────────────────────────────────────────
// PRIVATE: Index Builder
// ─────────────────────────────────────────────────────────────
 
/**
 * _getTHGeoIndex — โหลด/สร้าง Index
 * ใช้ PropertiesService สำรองเพราะ Cache อาจ expire
 */
function _getTHGeoIndex() {
  // ลอง Cache ก่อน (เร็วสุด)
  const cache = CacheService.getScriptCache();
  const cached = cache.get(TH_GEO_CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (_) {}
  }
  return _buildTHGeoIndex();
}
 
function _buildTHGeoIndex() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(TH_GEO_SHEET);
  if (!sh || sh.getLastRow() < 2) return null;
 
  const data = sh.getDataRange().getValues(); // RULE 6: batch read
  const idx = {
    bySearchKey: {},   // tambon_norm|amphoe_norm|province_norm → record
    byPostal:    {},   // postal_code → record[]
    byTambon:    {},   // tambon_norm → record[]
    provinces:   [],
    totalRows:   data.length - 1
  };
 
  const provinceSet = new Set();
  const C = TH_GEO_COL;
 
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const record = {
      postal_code:   String(row[C.POSTAL] || '').padStart(5,'0'),
      tambon_raw:    String(row[C.TAMBON_RAW]   || ''),
      amphoe_raw:    String(row[C.AMPHOE_RAW]   || ''),
      province:      String(row[C.PROVINCE]     || ''),
      note_raw:      String(row[C.NOTE_RAW]     || ''),
      tambon_clean:  String(row[C.TAMBON_CLEAN] || ''),
      amphoe_clean:  String(row[C.AMPHOE_CLEAN] || ''),
      tambon_label:  String(row[C.TAMBON_LABEL] || 'ตำบล'),
      amphoe_label:  String(row[C.AMPHOE_LABEL] || 'อำเภอ'),
      tambon_norm:   String(row[C.TAMBON_NORM]  || ''),
      amphoe_norm:   String(row[C.AMPHOE_NORM]  || ''),
      province_norm: String(row[C.PROVINCE_NORM]|| ''),
      search_key:    String(row[C.SEARCH_KEY]   || ''),
      postal_key:    String(row[C.POSTAL_KEY]   || ''),
      note_type:     String(row[C.NOTE_TYPE]    || 'FULL_AREA'),
      note_scope:    String(row[C.NOTE_SCOPE]   || 'FULL')
    };
 
    // bySearchKey
    if (record.search_key) idx.bySearchKey[record.search_key] = record;
 
    // byPostal
    if (record.postal_code) {
      if (!idx.byPostal[record.postal_code]) idx.byPostal[record.postal_code] = [];
      idx.byPostal[record.postal_code].push(record);
    }
 
    // byTambon
    if (record.tambon_norm) {
      if (!idx.byTambon[record.tambon_norm]) idx.byTambon[record.tambon_norm] = [];
      idx.byTambon[record.tambon_norm].push(record);
    }
 
    if (record.province) provinceSet.add(record.province);
  }
 
  idx.provinces = [...provinceSet].sort();
 
  // บันทึกลง Cache (แต่ JSON อาจใหญ่เกิน 100KB limit ของ CacheService)
  // ทำ Sparse cache เก็บ bySearchKey เท่านั้น
  try {
    const slim = { bySearchKey: idx.bySearchKey, provinces: idx.provinces, totalRows: idx.totalRows };
    const json = JSON.stringify(slim);
    if (json.length < 90000) { // CacheService limit ~100KB
      CacheService.getScriptCache().put(TH_GEO_CACHE_KEY, json, TH_GEO_CACHE_S);
    }
  } catch (_) {}
 
  return idx;
}
 
// ─────────────────────────────────────────────────────────────
// PRIVATE: Text Extractors
// ─────────────────────────────────────────────────────────────
 
function _extractProvince(text, provinces) {
  if (!provinces) return '';
  // จับคู่ชื่อจังหวัดในข้อความ (รวม กทม = กรุงเทพมหานคร)
  const abbrev = { 'กทม':'กรุงเทพมหานคร', 'กรุงเทพ':'กรุงเทพมหานคร', 'bkk':'กรุงเทพมหานคร' };
  const tNorm = text.toLowerCase().replace(/\s+/g,'');
  for (const [abbr, full] of Object.entries(abbrev)) {
    if (tNorm.includes(abbr.toLowerCase())) return full;
  }
  for (const p of provinces) {
    if (text.includes(p)) return p;
    // Try without 'จังหวัด' prefix
    if (p.length > 2 && text.includes(p.replace('จังหวัด',''))) return p;
  }
  return '';
}
 
function _extractAmphoe(text, province, idx) {
  if (!idx) return '';
  const tNorm = _normTH(text);
  // ค้นจาก bySearchKey — หา amphoe_norm ที่ตรงกัน
  const candidates = new Set();
  for (const key of Object.keys(idx.bySearchKey || {})) {
    const rec = idx.bySearchKey[key];
    if (province && _normTH(rec.province) !== _normTH(province)) continue;
    if (rec.amphoe_norm && tNorm.includes(rec.amphoe_norm)) {
      candidates.add(rec.amphoe_clean);
    }
  }
  return candidates.size === 1 ? [...candidates][0] : '';
}
 
function _extractTambon(text, amphoe, province, idx) {
  if (!idx) return '';
  const tNorm = _normTH(text);
  const candidates = new Set();
  for (const key of Object.keys(idx.bySearchKey || {})) {
    const rec = idx.bySearchKey[key];
    if (province && _normTH(rec.province) !== _normTH(province)) continue;
    if (amphoe && _normTH(rec.amphoe_clean) !== _normTH(amphoe)) continue;
    if (rec.tambon_norm && tNorm.includes(rec.tambon_norm)) {
      candidates.add(rec.tambon_clean);
    }
  }
  return candidates.size === 1 ? [...candidates][0] : '';
}
 
function _normTH(text) {
  if (!text) return '';
  return String(text).replace(/\s+/g,'').toLowerCase().trim();
}
 
function _findPartialKey(map, partialKey) {
  const match = Object.keys(map).find(k => k.startsWith(partialKey) || k.includes(partialKey));
  return match ? map[match] : null;
}
 
function _emptyGeoResult() {
  return { tambon:'', amphoe:'', province:'', postal:'',
    note_type:'', note_scope:'', note_raw:'', confidence: 0, matched_record: null };
}

// =====================================================