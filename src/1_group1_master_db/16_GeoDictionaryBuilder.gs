/**
 * VERSION: 5.4.001
 * FILE: 16_GeoDictionaryBuilder.gs
 * LMDS V5.4 — Geo Dictionary Builder (SYS_TH_GEO)
 * ===================================================
 * PURPOSE:
 *   สร้างและดูแลฐานข้อมูลภูมิศาสตร์ไทย (SYS_TH_GEO) 16 คอลัมน์
 *   สำหรับการแกะที่อยู่อัตโนมัติ
 * ===================================================
 * CHANGELOG:
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [ADD] Comprehensive header documentation
 *   v5.4.000 (2026-05-24):
 *     - [UPGRADE] Version bump to 5.4.000
 *     - [ADD] Comprehensive header documentation
 *     - [ADD] DEPENDENCIES section with module relationships
 *     - [ENHANCE] Detailed module interconnection mapping
 *   v5.2.010:
 *     - [UPGRADE] อัปเกรดระบบเป็น 5.2.010
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config (SHEET.SYS_TH_GEO, TH_GEO_IDX.*, AI_CONFIG.CACHE_TTL_SEC)
 *     - 02_Schema (SCHEMA)
 *     - 05_NormalizeService (normalizeForCompare)
 *     - 20_ThGeoService (populateGeoMetadata)
 *     - 14_Utils (diceCoefficient)
 *   CALLS (Invokes):
 *     - normalizeForCompare() → 05_NormalizeService
 *     - diceCoefficient() → 14_Utils
 *     - logWarn/logInfo() → 03_SetupSheets
 *   EXPORTS TO:
 *     - 00_App (buildGeoDictionary, populateGeoMetadata — menu trigger)
 *     - 07_PlaceService (lookupByPostcode, lookupPostcodeByArea, lookupProvinceFromAddress, scanAddressAgainstDictionary, isValidProvince)
 *     - 20_ThGeoService (loadCachedGeoRows_, safeAlert_)
 *   SHEETS ACCESSED:
 *     - SHEET.SYS_TH_GEO (Read+Write: 16-column dictionary)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────┐
 *   │         Thai Geo Dictionary (SYS_TH_GEO)        │
 *   ├─────────────────────────────────────────────────┤
 *   │  buildGeoDictionary                             │
 *   │    ├─ populate search/postal keys               │
 *   │    └─ clean columns → CacheService + RAM        │
 *   ├─────────────────────────────────────────────────┤
 *   │  Lookup Functions:                              │
 *   │    lookupByPostcode(postcode → area info)       │
 *   │    lookupPostcodeByArea(tambon/amphoe/province) │
 *   │    lookupProvinceFromAddress(raw → province)    │
 *   │    scanAddressAgainstDictionary(raw → geo)      │
 *   │    isValidProvince(name → boolean)              │
 *   │    lookupDistrictsByProvince(province → [])     │
 *   ├─────────────────────────────────────────────────┤
 *   │  Fuzzy Matching: diceCoefficient-based          │
 *   ├─────────────────────────────────────────────────┤
 *   │  Cache Layer:                                   │
 *   │    RAM: _GLOBAL_GEO_DICT_CACHE (in-memory)     │
 *   │    CacheService: chunked postcode/prov/district │
 *   │    loadCachedGeoRows_ / getCachedPostcodeMap_   │
 *   │    savePostcodeMapToCache_ / getCachedProvinces_│
 *   │    getCachedDistricts_ / invalidateGeoDictCache │
 *   ├─────────────────────────────────────────────────┤
 *   │  Helpers: safeAlert_                            │
 *   └─────────────────────────────────────────────────┘
 * ===================================================
 */

// [NEW v5.2.001] Global RAM Cache for batch runs (Managed in 01_Config.gs)

// ============================================================
// SECTION 1: buildGeoDictionary — Entry Point
// ============================================================

function buildGeoDictionary() {
  try {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.SYS_TH_GEO);

  if (!sheet || sheet.getLastRow() < 2) {
    logWarn('GeoDictBuilder', 'SYS_TH_GEO ว่างอยู่');
    safeAlert_('⚠️ SYS_TH_GEO ยังไม่มีข้อมูล\nกรุณา Import ข้อมูลภูมิศาสตร์ไทยก่อน');
    return;
  }

  logInfo('GeoDictBuilder', 'เริ่มสร้าง Geo Dictionary');

  const colsToRead = SCHEMA[SHEET.SYS_TH_GEO].length;
  const totalRows  = sheet.getLastRow() - 1;
  const allData    = sheet.getRange(2, 1, totalRows, colsToRead).getValues();

  const postcodeMap  = {};
  const provinceSet  = new Set();
  const districtMap  = {};

  allData.forEach(row => {
    const postcode   = String(row[TH_GEO_IDX.POSTCODE]     || '').trim().padStart(5, '0');
    const subDistrict= String(row[TH_GEO_IDX.SUB_DISTRICT] || '').trim();
    const district   = String(row[TH_GEO_IDX.DISTRICT]     || '').trim();
    const province   = String(row[TH_GEO_IDX.PROVINCE]     || '').trim();

    if (!province) return;

    // [UPGRADE v5.2.008] Cache full row data for ThGeoService
    if (postcode && postcode !== '00000' && !postcodeMap[postcode]) {
      postcodeMap[postcode] = {
        province, district, subDistrict,
        searchKey: row[TH_GEO_IDX.SEARCH_KEY] || '',
        postalKey: row[TH_GEO_IDX.POSTAL_KEY] || '',
        noteType:  row[TH_GEO_IDX.NOTE_TYPE]  || 'FULL_AREA'
      };
    }

    provinceSet.add(province);

    if (!districtMap[province]) districtMap[province] = new Set();
    if (district) districtMap[province].add(district);
  });

  const districtMapArr = {};
  Object.keys(districtMap).forEach(prov => {
    districtMapArr[prov] = [...districtMap[prov]];
  });

  const cache = CacheService.getScriptCache();

  savePostcodeMapToCache_(postcodeMap);
  _GLOBAL_GEO_DICT_CACHE = null; // [FIX v5.2.009] ล้าง RAM Cache เมื่อมีการ rebuild ใหม่

  try {
    cache.put('TH_GEO_PROVINCES', JSON.stringify([...provinceSet]), AI_CONFIG.CACHE_TTL_SEC);
  } catch (e) {
    logWarn('GeoDictBuilder', `Cache PROVINCES ล้มเหลว: ${e.message}`);
  }

  try {
    cache.put('TH_GEO_DISTRICTS', JSON.stringify(districtMapArr), AI_CONFIG.CACHE_TTL_SEC);
  } catch (e) {
    logWarn('GeoDictBuilder', `Cache DISTRICTS ล้มเหลว: ${e.message}`);
  }

  logInfo('GeoDictBuilder', `สร้าง Dictionary เสร็จ — ${totalRows} แถว ${provinceSet.size} จังหวัด ${Object.keys(postcodeMap).length} ไปรษณีย์`);

  safeAlert_(
    `✅ สร้าง Geo Dictionary เสร็จ!\n\n` +
    `  จำนวนแถว:     ${totalRows}\n` +
    `  จังหวัด:       ${provinceSet.size}\n` +
    `  รหัสไปรษณีย์: ${Object.keys(postcodeMap).length}`
  );
  } catch (err) {
    logError('GeoDictBuilder', err.message + '\n' + err.stack);
    SpreadsheetApp.getUi().alert('เกิดข้อผิดพลาด: ' + err.message);
  }
}

// ============================================================
// SECTION 2: Lookup Functions
// ============================================================

function lookupByPostcode(postcode) {
  const clean = String(postcode || '').replace(/[^0-9]/g, '').padStart(5, '0');
  if (clean.length !== 5 || clean === '00000') return null;
  const cached = getCachedPostcodeMap_();
  return cached[clean] || null;
}

function lookupProvinceFromAddress(rawAddress) {
  if (!rawAddress) return '';
  const addr      = String(rawAddress).trim();
  const provinces = getCachedProvinces_();

  for (const province of provinces) {
    if (province.length >= 4 && addr.includes(province)) return province;
  }

  const match = addr.match(/(?:จ\.?|จังหวัด)\s*([ก-๙]{2,})/);
  if (match && match[1]) {
    const found = provinces.find(p => p.includes(match[1]) && p.length >= 4);
    if (found) return found;
  }

  const postcodeMatch = addr.match(/\b[0-9]{5}\b/);
  if (postcodeMatch) {
    const loc = lookupByPostcode(postcodeMatch[0]);
    if (loc && loc.province) return loc.province;
  }
  return '';
}

/**
 * lookupPostcodeByArea — ค้นหาย้อนกลับแบบ Fuzzy
 * @return {{postcode, subDistrict, district, province}}
 */
function lookupPostcodeByArea(tambon, amphoe, province) {
  // [FIX v008] ถ้าไม่มีจังหวัด ให้พยายามหาจากตำบล+อำเภอ (ห้าม return null ทันที)
  if (!province && (!tambon || !amphoe)) return null;

  const cleanT = String(tambon || '').replace(/ตำบล|แขวง|ต\.|ข\./g, '').trim();
  const cleanA = String(amphoe || '').replace(/อำเภอ|เขต|อ\.|ข\./g, '').trim();
  const cleanP = String(province || '').replace(/จังหวัด|จ\./g, '').trim();

  // [UPGRADE v5.2.001] Use GLOBAL_CACHE to avoid sheet loop
  const data = loadCachedGeoRows_();
  if (!data || data.length === 0) return null;

  let bestMatch = null;
  let maxScore  = 0;

  for (const row of data) {
    // [FIX v5.2.008] ใช้ object property (.province) แทน array index (row[3])
    // เพราะ loadCachedGeoRows_() คืน object {postcode, subDistrict, district, province}
    const rowP = String(row.province || '').replace(/จังหวัด|จ\./g, '').trim();
    if (cleanP && rowP !== cleanP) continue;

    const rowT = String(row.subDistrict || '').replace(/ตำบล|แขวง|ต\.|ข\./g, '').trim();
    const rowA = String(row.district || '').replace(/อำเภอ|เขต|อ\.|ข\./g, '').trim();

    const s1 = diceCoefficient(normalizeForCompare(cleanT), normalizeForCompare(rowT));
    const s2 = diceCoefficient(normalizeForCompare(cleanA), normalizeForCompare(rowA));
    const score = (cleanT ? s1 * 0.7 : 0) + (s2 * 0.3);

    if (score > maxScore) {
      maxScore = score;
      bestMatch = {
        // [FIX v5.2.008] คืนค่าจาก SYS_TH_GEO เป๊ะ (พร้อม prefix แขวง/เขต/ตำบล/อำเภอ)
        postcode:    String(row.postcode || '').trim().padStart(5, '0'),
        subDistrict: String(row.subDistrict || '').trim(),
        district:    String(row.district || '').trim(),
        province:    String(row.province || '').trim()
      };
    }
    if (maxScore === 1.0) break;
  }

  return (maxScore > 0.5) ? bestMatch : null;
}

/**
 * scanAddressAgainstDictionary — ค้นหาตำบล/อำเภอ/จังหวัดจากประโยคยาวๆ (แก้ปัญหา Regex หลุด)
 * @return {{postcode, subDistrict, district, province}}
 */
function scanAddressAgainstDictionary(rawAddress, knownPostcode) {
  if (!rawAddress) return null;
  const data = loadCachedGeoRows_();
  if (!data || data.length === 0) return null;

  let candidates = data;
  const pcMatch = knownPostcode || (rawAddress.match(/\b[0-9]{5}\b/) || [])[0];
  if (pcMatch) {
    candidates = data.filter(r => String(r.postcode).trim().padStart(5, '0') === pcMatch);
  }

  // 1. Try to find an exact match for both Subdistrict and District
  for (const row of candidates) {
    const s = String(row.subDistrict || '').trim();
    const d = String(row.district || '').trim();
    if (s && d && rawAddress.includes(s) && rawAddress.includes(d)) {
      return {
        postcode: String(row.postcode || '').trim().padStart(5, '0'),
        subDistrict: s,
        district: d,
        province: String(row.province || '').trim()
      };
    }
  }

  // 2. Fallback: Try to find District and Province
  for (const row of candidates) {
    const d = String(row.district || '').trim();
    const p = String(row.province || '').trim();
    if (d && p && rawAddress.includes(d) && rawAddress.includes(p)) {
      return {
        postcode: String(row.postcode || '').trim().padStart(5, '0'),
        subDistrict: '', // We don't know the subdistrict for sure
        district: d,
        province: p
      };
    }
  }

  return null;
}

function listAllAreasByPostcode(postcode) {
  const clean = String(postcode || '').replace(/[^0-9]/g, '').padStart(5, '0');
  if (clean.length !== 5) return [];

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.SYS_TH_GEO);
  if (!sheet) return [];

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  const results = [];
  data.forEach(row => {
    const pc = String(row[TH_GEO_IDX.POSTCODE] || '').trim().padStart(5, '0');
    if (pc === clean) {
      results.push({
        subDistrict: String(row[TH_GEO_IDX.SUB_DISTRICT] || '').replace(/ตำบล|แขวง|ต\.|ข\./g, '').trim(),
        district:    String(row[TH_GEO_IDX.DISTRICT]     || '').replace(/อำเภอ|เขต|อ\.|ข\./g, '').trim(),
        province:    String(row[TH_GEO_IDX.PROVINCE]     || '').replace(/จังหวัด|จ\./g, '').trim()
      });
    }
  });
  return results;
}

function isValidProvince(provinceName) {
  if (!provinceName || provinceName.length < 4) return false;
  const provinces = getCachedProvinces_();
  return provinces.includes(provinceName.trim());
}

function lookupDistrictsByProvince(provinceName) {
  if (!provinceName) return [];
  const cached = getCachedDistricts_();
  return cached[provinceName] || [];
}

// ============================================================
// SECTION 3: Cache Getters
// ============================================================

/**
 * [NEW v5.2.001] loadCachedGeoRows_ — Memoization loader
 * [UPGRADE v5.2.008] รองรับ 16 คอลัมน์
 */
function loadCachedGeoRows_() {
  if (_GLOBAL_GEO_DICT_CACHE) return _GLOBAL_GEO_DICT_CACHE;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.SYS_TH_GEO);
  if (!sheet || sheet.getLastRow() < 2) return [];

  // อ่านครบ 16 คอลัมน์
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, SCHEMA[SHEET.SYS_TH_GEO].length).getValues();
  _GLOBAL_GEO_DICT_CACHE = data.map(row => ({
    postcode:    String(row[TH_GEO_IDX.POSTCODE]     || '').trim(),
    subDistrict: String(row[TH_GEO_IDX.SUB_DISTRICT] || '').trim(),
    district:    String(row[TH_GEO_IDX.DISTRICT]     || '').trim(),
    province:    String(row[TH_GEO_IDX.PROVINCE]     || '').trim(),
    searchKey:   String(row[TH_GEO_IDX.SEARCH_KEY]   || '').trim(),
    postalKey:   String(row[TH_GEO_IDX.POSTAL_KEY]   || '').trim(),
    noteType:    String(row[TH_GEO_IDX.NOTE_TYPE]    || 'FULL_AREA'),
    noteScope:   String(row[TH_GEO_IDX.NOTE_SCOPE]   || 'FULL')
  }));

  return _GLOBAL_GEO_DICT_CACHE;
}

function getCachedPostcodeMap_() {
  const cache  = CacheService.getScriptCache();
  const totalStr = cache.get('TH_GEO_POSTCODE_TOTAL');
  if (totalStr) {
    const totalChunks = Number(totalStr);
    if (!isNaN(totalChunks) && totalChunks > 0) {
      let isComplete = true;
      const merged = {};
      for (let i = 0; i < totalChunks; i++) {
        const chunkStr = cache.get('TH_GEO_POSTCODE_' + i);
        if (!chunkStr) { isComplete = false; break; }
        try { Object.assign(merged, JSON.parse(chunkStr)); } catch(e) { isComplete = false; break; }
      }
      if (isComplete) return merged;
    }
  }

  const result = buildPostcodeMapFromSheet_();
  savePostcodeMapToCache_(result);
  return result;
}

function savePostcodeMapToCache_(postcodeMap) {
  const cache = CacheService.getScriptCache();
  const keys = Object.keys(postcodeMap);
  const chunkSize = 350; // แบ่ง 350 keys ต่อก้อน เพื่อไม่ให้เกิน 100KB limit ของ CacheService
  const totalChunks = Math.ceil(keys.length / chunkSize);

  try { cache.put('TH_GEO_POSTCODE_TOTAL', String(totalChunks), AI_CONFIG.CACHE_TTL_SEC); } catch(e){}

  for (let i = 0; i < totalChunks; i++) {
    const chunkKeys = keys.slice(i * chunkSize, (i + 1) * chunkSize);
    const chunkObj = {};
    chunkKeys.forEach(k => { chunkObj[k] = postcodeMap[k]; });
    try {
      cache.put('TH_GEO_POSTCODE_' + i, JSON.stringify(chunkObj), AI_CONFIG.CACHE_TTL_SEC);
    } catch(e) {
      logWarn('GeoDictBuilder', `Cache POSTCODE_${i} ล้มเหลว: ${e.message}`);
    }
  }
}

function getCachedProvinces_() {
  const cache  = CacheService.getScriptCache();
  const cached = cache.get('TH_GEO_PROVINCES');
  if (cached) { try { return JSON.parse(cached); } catch(e) {} }
  const result = buildProvincesFromSheet_();
  try { cache.put('TH_GEO_PROVINCES', JSON.stringify(result), AI_CONFIG.CACHE_TTL_SEC); } catch(e) {}
  return result;
}

function getCachedDistricts_() {
  const cache  = CacheService.getScriptCache();
  const cached = cache.get('TH_GEO_DISTRICTS');
  if (cached) { try { return JSON.parse(cached); } catch(e) {} }
  return buildDistrictsMapFromSheet_();
}

function buildPostcodeMapFromSheet_() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.SYS_TH_GEO);
  if (!sheet || sheet.getLastRow() < 2) return {};
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, SCHEMA[SHEET.SYS_TH_GEO].length).getValues();
  const result = {};
  data.forEach(row => {
    const postcode = String(row[TH_GEO_IDX.POSTCODE] || '').trim().padStart(5, '0');
    if (postcode && postcode !== '00000' && !result[postcode]) {
      result[postcode] = {
        province:    String(row[TH_GEO_IDX.PROVINCE]     || '').trim(),
        district:    String(row[TH_GEO_IDX.DISTRICT]     || '').trim(),
        subDistrict: String(row[TH_GEO_IDX.SUB_DISTRICT] || '').trim(),
        searchKey:   String(row[TH_GEO_IDX.SEARCH_KEY]   || '').trim(),
        postalKey:   String(row[TH_GEO_IDX.POSTAL_KEY]   || '').trim(),
        noteType:    String(row[TH_GEO_IDX.NOTE_TYPE]    || 'FULL_AREA'),
      };
    }
  });
  return result;
}

function buildProvincesFromSheet_() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.SYS_TH_GEO);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getRange(2, TH_GEO_IDX.PROVINCE + 1, sheet.getLastRow() - 1, 1).getValues();
  const provinceSet = new Set();
  data.forEach(row => {
    const province = String(row[0] || '').trim();
    if (province && province.length >= 4) provinceSet.add(province);
  });
  return [...provinceSet];
}

function buildDistrictsMapFromSheet_() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.SYS_TH_GEO);
  if (!sheet || sheet.getLastRow() < 2) return {};
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, SCHEMA[SHEET.SYS_TH_GEO].length).getValues();
  const result = {};
  data.forEach(row => {
    const province = String(row[TH_GEO_IDX.PROVINCE] || '').trim();
    const district = String(row[TH_GEO_IDX.DISTRICT] || '').trim();
    if (!province || !district) return;
    if (!result[province]) result[province] = new Set();
    result[province].add(district);
  });
  const arr = {};
  Object.keys(result).forEach(p => { arr[p] = [...result[p]]; });
  return arr;
}

function invalidateGeoDictCache() {
  _GLOBAL_GEO_DICT_CACHE = null;
  const cache = CacheService.getScriptCache();
  const keysToRemove = ['TH_GEO_PROVINCES', 'TH_GEO_DISTRICTS', 'TH_GEO_POSTCODE_TOTAL', 'TH_GEO_POSTCODE'];
  for (let i = 0; i < 10; i++) keysToRemove.push('TH_GEO_POSTCODE_' + i);
  cache.removeAll(keysToRemove);
  logInfo('GeoDictBuilder', 'ล้าง Geo Dictionary Cache เรียบร้อย');
}

/**
 * [DEPRECATED v5.4.002] safeAlert_ — ย้ายไป 14_Utils.gs (ชื่อใหม่: safeUiAlert_)
 * คงไว้เป็น wrapper เพื่อ backward compatibility
 */
function safeAlert_(message) {
  safeUiAlert_(message);
}
