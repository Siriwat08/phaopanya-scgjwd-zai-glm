/**
 * VERSION: 5.4.001
 * FILE: 07_PlaceService.gs
 * LMDS V5.4 — Place Master Service
 * ===================================================
 * PURPOSE:
 *   จัดการ Master Place — ฐานข้อมูลสถานที่จัดส่ง
 *   เป็น Single Source of Truth สำหรับข้อมูลสถานที่
 * ===================================================
 * CHANGELOG:
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [REMOVE] createPlace: ลบ createGlobalAlias() — M_ALIAS เขียนที่ autoEnrich เท่านั้น
 *     - [REMOVE] createPlaceAlias: ลบ createGlobalAlias() — ไม่ต้อง sync ย้อนไป M_ALIAS
 *   v5.4.000 (2026-05-23):
 *     - [ADD] Comprehensive header documentation
 *     - [ADD] DEPENDENCIES section with module relationships
 *   v5.2.001 (PH2 Hardening):
 *     - [FIX] createPlace: canonical_name = repaired address
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config.gs          (SHEET.M_PLACE, PLACE_IDX.*, AI_CONFIG)
 *     - 02_Schema.gs          (SCHEMA[SHEET.M_PLACE], SCHEMA[SHEET.M_PLACE_ALIAS])
 *     - 03_SetupSheets.gs     (logDebug, logWarn, logError)
 *     - 05_NormalizeService.gs (normalizePlaceName, normalizeForCompare)
 *     - 14_Utils.gs           (generateShortId, generateUUID, diceCoefficient, levenshteinDistance)
 *   CALLS (Invokes):
 *     - resolveMasterUuidViaGlobalAlias() → 21_AliasService.gs (findPlaceCandidates)
 *     - convertUuidToPlaceId()            → 21_AliasService.gs (findPlaceCandidates)
 *     - extractGeoFromAddress()           → 16_GeoDictionaryBuilder.gs
 *     - scanAddressAgainstDictionary()    → 16_GeoDictionaryBuilder.gs
 *     - lookupPostcodeByArea()            → 20_ThGeoService.gs
 *     - lookupByPostcode()                → 20_ThGeoService.gs
 *   EXPORTS TO:
 *     - 10_MatchEngine.gs     (resolvePlace, createPlace, updatePlaceStats, loadAllPlaces_)
 *     - 11_TransactionService.gs (loadAllPlaces_)
 *     - 17_SearchService.gs   (loadAllPlaces_)
 *     - 21_AliasService.gs    (loadAllPlaces_ — UUID converters)
 *   SHEETS ACCESSED:
 *     - SHEET.M_PLACE         (Read+Write: CRUD, Stats update)
 *     - SHEET.M_PLACE_ALIAS   (Read+Write: Alias lookup, createPlaceAlias)
 *     - SHEET.SYS_TH_GEO      (Read: Geo dictionary lookup)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  07_PlaceService.gs (Place Master Hub)                      │
 *   │  ├── resolvePlace()         — Match/resolve place           │
 *   │  ├── findPlaceCandidates()  — Multi-strategy search         │
 *   │  │   ├── M_ALIAS Fast Path (resolveMasterUuidViaGlobalAlias) │
 *   │  │   ├── Alias Match (M_PLACE_ALIAS)                        │
 *   │  │   ├── Phonetic / Name Match                              │
 *   │  │   └── Note Search (Deep Match)                           │
 *   │  ├── scorePlaceCandidate()  — Score calculation             │
 *   │  ├── tryMatchBranch()       — Chain store matching          │
 *   │  ├── createPlace()          — Create new place record       │
 *   │  ├── createPlaceAlias()     — Add alternate name            │
 *   │  ├── updatePlaceStats()     — Update usage statistics       │
 *   │  ├── getEnrichedGeoData()   — Geographic enrichment (4 lvls)│
 *   │  │   ├── 0. extractGeoFromAddress (16-col Search Key)       │
 *   │  │   ├── 1. scanAddressAgainstDictionary                    │
 *   │  │   ├── 2. Regex → Fuzzy Lookup (lookupPostcodeByArea)     │
 *   │  │   └── 3. lookupByPostcode (Last Resort)                  │
 *   │  └── loadAllPlaces_()       — Load all places (cached)      │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

// [NEW v5.2.001] Global RAM Cache for batch runs (Managed in 01_Config.gs)

// ============================================================
// SECTION 1: resolvePlace
// ============================================================

function resolvePlace(rawName, rawAddress) {
  const normResult = normalizePlaceName(rawName);
  const cleanPlace = normResult.cleanPlace;

  if (!cleanPlace || cleanPlace.length < 2) {
    return { placeId: null, status: 'LOW_QUALITY', confidence: 0, normResult };
  }

  const candidates = findPlaceCandidates(cleanPlace, rawAddress);

  if (candidates.length === 0) {
    return { placeId: null, status: 'NOT_FOUND', confidence: 0, normResult };
  }

  let bestPlace = null;
  let bestScore = 0;

  candidates.forEach(candidate => {
    const score = scorePlaceCandidate(cleanPlace, candidate);
    if (score > bestScore) { bestScore = score; bestPlace = candidate; }
  });

  if (bestScore < AI_CONFIG.THRESHOLD_AUTO) {
    const branchResult = tryMatchBranch(cleanPlace, rawAddress);
    if (branchResult) {
      return { placeId: branchResult.placeId, status: 'BRANCH_MATCH',
               confidence: branchResult.score, normResult };
    }
  }

  if (bestScore >= AI_CONFIG.THRESHOLD_AUTO) {
    return { placeId: bestPlace.placeId, status: 'FOUND',
             confidence: bestScore, normResult };
  }
  if (bestScore >= AI_CONFIG.THRESHOLD_REVIEW) {
    return { placeId: bestPlace.placeId, status: 'NEEDS_REVIEW',
             confidence: bestScore, normResult };
  }
  return { placeId: null, status: 'NOT_FOUND', confidence: bestScore, normResult };
}

// ============================================================
// SECTION 2: findPlaceCandidates
// ============================================================

/**
 * findPlaceCandidates
 * [FIX v003] Object reference: includes → .some(p => p.placeId===)
 * [FIX v003] เพิ่ม normB guard ก่อน startsWith
 */
function findPlaceCandidates(cleanPlace, rawAddress) {
  const allPlaces = loadAllPlaces_();
  const results   = [];

  const aliasResolve = typeof resolveMasterUuidViaGlobalAlias === 'function' ? resolveMasterUuidViaGlobalAlias(cleanPlace, 'PLACE') : null;
  if (aliasResolve && aliasResolve.masterUuid && aliasResolve.score >= 95) {
    const ownerId = convertUuidToPlaceId(aliasResolve.masterUuid);
    const perfect = allPlaces.find(p => p.placeId === ownerId);
    if (perfect) return [perfect];
  }

  // Alias Match
  const aliasMatches = findPlaceByAlias_(cleanPlace);
  aliasMatches.forEach(placeId => {
    const found = allPlaces.find(p => p.placeId === placeId);
    if (found && !results.some(r => r.placeId === found.placeId)) {
      results.push(found);
    }
  });

  // Phonetic / Name Match
  const searchKey = buildThaiPhoneticKey(cleanPlace);
  allPlaces.forEach(place => {
    if (results.some(r => r.placeId === place.placeId)) return;
    const placeKey = buildThaiPhoneticKey(place.normalized);

    if (searchKey && placeKey && searchKey === placeKey) {
      results.push(place);
    } else {
      const normA = normalizeForCompare(cleanPlace);
      const normB = normalizeForCompare(place.normalized);
      // [FIX v003] เพิ่ม guard normB ก่อน startsWith
      if (normA.length >= 3 && normB && normB.startsWith(normA.substring(0, 3))) {
        results.push(place);
      }
    }
  });

  // 4. Note Search (Deep Match) — [NEW v5.2.003] ค้นหาลามไปถึงหมายเหตุ
  if (results.length === 0) {
    const queryParts = cleanPlace.split(/\s+/).filter(p => p.length >= 2);
    allPlaces.forEach(place => {
      const noteStr = String(place.note || '');
      if (!noteStr) return;
      
      const isMatch = queryParts.some(part => noteStr.includes(part));
      if (isMatch) {
        results.push(place);
      }
    });
  }

  return results;
}

function findPlaceByAlias_(cleanPlace) {
  const allAliases = loadAllPlaceAliases_();
  const targetNorm = normalizeForCompare(cleanPlace);
  const foundSet   = new Set();

  allAliases.forEach(alias => {
    if (!alias[PLACE_ALIAS_IDX.ACTIVE_FLAG]) return;
    const aliasNorm = normalizeForCompare(alias[PLACE_ALIAS_IDX.ALIAS_NAME]);
    if (aliasNorm === targetNorm && aliasNorm.length > 0) {
      foundSet.add(String(alias[PLACE_ALIAS_IDX.PLACE_ID]));
    }
  });
  return [...foundSet];
}

// ============================================================
// SECTION 3: Branch Match
// ============================================================

/**
 * tryMatchBranch
 * [FIX v003] province condition: !province || p.province === province
 *            เดิม: !province || !p.province || p.province === province
 *            ปัญหา: !p.province ทำให้ match ทุก place ที่ไม่มี province
 */
function tryMatchBranch(cleanPlace, rawAddress) {
  const allPlaces  = loadAllPlaces_();
  const normQuery  = normalizeForCompare(cleanPlace);
  const province   = extractProvince_(rawAddress);

  for (const store of CHAIN_STORE_LIST) {
    const normStore = normalizeForCompare(store);
    if (!normQuery.includes(normStore)) continue;

    const matching = allPlaces.filter(p => {
      const normPlace = normalizeForCompare(p.normalized);
      if (!normPlace.includes(normStore)) return false;
      // [FIX v003] ถ้าไม่รู้ province → match ได้ทุก branch
      //            ถ้ารู้ province → ต้องตรงกันเท่านั้น
      return !province || p.province === province;
    });

    if (matching.length === 1) return { placeId: matching[0].placeId, score: 85 };
    if (matching.length > 1) {
      matching.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
      return { placeId: matching[0].placeId, score: 75 };
    }
  }
  return null;
}

/**
 * extractProvince_
 * [FIX v005] เลิกใช้ Regex กวาด (กันเคส 'สมเด็จ' -> 'พระปิ่นเกล้า')
 *            เปลี่ยนมาใช้ Whitelist จังหวัด 77 จังหวัด
 */
function extractProvince_(rawAddress) {
  if (!rawAddress) return '';
  const addr = String(rawAddress);

  // 1. ตรวจสอบจากรายชื่อจังหวัดหลัก (Whitelist) เพื่อความแม่นยำ 100%
  const provinces = [
    'กรุงเทพมหานคร', 'กรุงเทพ', 'กทม', 'กรุงเ', 'กทม.', 'สมุทรปราการ', 'นนทบุรี', 'ปทุมธานี', 'พระนครศรีอยุธยา', 'อ่างทอง', 'ลพบุรี', 'สิงห์บุรี', 'ชัยนาท', 'สระบุรี',
    'ชลบุรี', 'ระยอง', 'จันทบุรี', 'ตราด', 'ฉะเชิงเทรา', 'ปราจีนบุรี', 'นครนายก', 'สระแก้ว',
    'นครราชสีมา', 'บุรีรัมย์', 'สุรินทร์', 'ศรีสะเกษ', 'อุบลราชธานี', 'ยโสธร', 'ชัยภูมิ', 'อำนาจเจริญ', 'หนองบัวลำภู', 'ขอนแก่น', 'อุดรธานี', 'เลย', 'หนองคาย', 'มหาสารคาม', 'ร้อยเอ็ด', 'กาฬสินธุ์', 'สกลนคร', 'นครพนม', 'มุกดาหาร',
    'เชียงใหม่', 'ลำพูน', 'ลำปาง', 'อุตรดิตถ์', 'แพร่', 'น่าน', 'พะเยา', 'เชียงราย', 'แม่ฮ่องสอน',
    'นครสวรรค์', 'อุทัยธานี', 'กำแพงเพชร', 'ตาก', 'สุโขทัย', 'พิษณุโลก', 'พิจิตร', 'เพชรบูรณ์',
    'ราชบุรี', 'กาญจนบุรี', 'สุพรรณบุรี', 'นครปฐม', 'สมุทรสาคร', 'สมุทรสงคราม', 'เพชรบุรี', 'ประจวบคีรีขันธ์',
    'นครศรีธรรมราช', 'กระบี่', 'พังงา', 'ภูเก็ต', 'สุราษฎร์ธานี', 'ระนอง', 'ชุมพร', 'สงขลา', 'สตูล', 'ตรัง', 'พัทลุง', 'ปัตตานี', 'ยะลา', 'นราธิวาส'
  ];

  for (const p of provinces) {
    if (addr.includes(p)) {
      return ['กรุงเทพ', 'กทม', 'กรุงเ', 'กทม.'].includes(p) ? 'กรุงเทพมหานคร' : p;
    }
  }

  // 2. Fallback: ถ้าไม่เจอชื่อตรงๆ ลองหาจากรหัสไปรษณีย์
  const postcodeMatch = addr.match(/\b[0-9]{5}\b/);
  if (postcodeMatch) {
    const loc = lookupByPostcode(postcodeMatch[0]);
    if (loc) return loc.province;
  }
  return '';
}

/**
 * extractDistrict_
 * [FIX v005] ปรับปรุง Regex ให้แม่นยำขึ้น และตัดคำขยะ
 */
function extractDistrict_(rawAddress) {
  if (!rawAddress) return '';
  const addr = String(rawAddress);

  const match = addr.match(/(?:อำเภอ|เขต|อ\.)\s?([ก-๙]{2,})/);
  if (match && match[1]) {
    let d = match[1].trim();
    // [CLEANUP v5.1.004] ตัดคำนำหน้าที่อาจติดมาออก
    d = d.replace(/^(อำเภอ|เขต|อ\.)/g, '').trim();
    return d;
  }
  return '';
}

/**
 * extractSubDistrict_
 * [FIX v5.1.004] เพิ่ม Negative Lookahead กันเคส 'ต ซ.' หรือ 'ต ซอย'
 */
function extractSubDistrict_(rawAddress) {
  if (!rawAddress) return '';
  const addr = String(rawAddress);

  // Regex: หา ตำบล/แขวง/ต. ที่ไม่ตามด้วย ซ./ซอย
  const match = addr.match(/(?:ตำบล|แขวง|ต\.)\s?(?!ซ\.|ซอย)([ก-๙]{2,})/);
  if (match && match[1]) {
    let t = match[1].trim();
    // [CLEANUP v5.1.004] ตัดคำนำหน้าที่อาจติดมาออก
    t = t.replace(/^(ตำบล|แขวง|ต\.)/g, '').trim();
    return t;
  }
  return '';
}

/**
 * extractHouseNumber_ — [NEW v5.2.003] แกะเลขที่บ้าน
 */
function extractHouseNumber_(rawAddress) {
  if (!rawAddress) return '';
  const addr = String(rawAddress).trim();
  
  // 1. เลขที่ 123/45 หรือ 123/45 (ขึ้นต้นด้วยตัวเลข)
  const match = addr.match(/^(?:เลขที่\s*)?([0-9\/]{1,10}(?:\s*[ก-ฮ])?)/);
  if (match) return match[1].trim();
  
  // 2. ค้นหาคำว่า "เลขที่" กลางประโยค
  const matchMid = addr.match(/เลขที่\s*([0-9\/]{1,10})/);
  if (matchMid) return matchMid[1].trim();
  
  return '';
}

/**
 * getEnrichedGeoData — [ADD v008] ฟังก์ชันส่วนกลางสำหรับแกะข้อมูลภูมิศาสตร์
 * รวมเอาความสามารถในการ extract คำ และ fuzzy lookup เข้าด้วยกัน
 */
function getEnrichedGeoData(rawAddress, rawPlaceName) {
  // [REWRITE v5.2.008] SYS_TH_GEO = Single Source of Truth
  // ค่า sub_district, district, province ที่คืนออกไปต้องตรง SYS_TH_GEO เป๊ะ 100%
  const addr1 = String(rawPlaceName || '').trim();
  const addr2 = String(rawAddress   || '').trim();

  // 1. Extract postcode (สัญญาณที่เชื่อถือได้ที่สุด)
  let fPost = (addr1.match(/\b[0-9]{5}\b/) || [])[0] ||
              (addr2.match(/\b[0-9]{5}\b/) || [])[0] || '';

  // 2. Extract house number
  const house = extractHouseNumber_(addr1) || extractHouseNumber_(addr2);

  // 3. เริ่มจากค่าว่าง — ห้ามใช้ Regex เป็นค่าเริ่มต้น
  let fSub  = '';
  let fDist = '';
  let fProv = '';
  let dictMatched = false;

  // ─── ลำดับ 0: extractGeoFromAddress (NEW v5.2.008 - 16 Columns Search Key) ───
  if (typeof extractGeoFromAddress === 'function') {
    const fullText = addr1 + ' ' + addr2;
    const geoMatch = extractGeoFromAddress(fullText);
    if (geoMatch) {
      fSub  = geoMatch.subDistrict;
      fDist = geoMatch.district;
      fProv = geoMatch.province;
      fPost = geoMatch.postcode;
      dictMatched = true;
    }
  }

  // ─── ลำดับ 1: scanAddressAgainstDictionary (คุณภาพสูง - ค้นคำตรง) ───
  if (!dictMatched && typeof scanAddressAgainstDictionary === 'function') {
    const fullText = addr1 + ' ' + addr2;
    const scanResult = scanAddressAgainstDictionary(fullText, fPost);
    if (scanResult) {
      if (scanResult.province)    fProv = scanResult.province;
      if (scanResult.district)    fDist = scanResult.district;
      if (scanResult.subDistrict) fSub  = scanResult.subDistrict;
      if (scanResult.postcode)    fPost = scanResult.postcode;
      dictMatched = true;
    }
  }

  // ─── ลำดับ 2: Regex → Fuzzy Lookup (เฉพาะค่าที่ยังขาด) ───
  if (!fSub || !fDist || !fProv) {
    const regSub  = (!fSub)  ? (extractSubDistrict_(addr1) || extractSubDistrict_(addr2)) : '';
    const regDist = (!fDist) ? (extractDistrict_(addr1)    || extractDistrict_(addr2))    : '';
    const regProv = (!fProv) ? (extractProvince_(addr1)    || extractProvince_(addr2))    : '';

    // ส่ง Regex + ค่าที่มีอยู่แล้ว ไป Fuzzy Match กับ SYS_TH_GEO
    if (typeof lookupPostcodeByArea === 'function' && (regSub || regDist || regProv || fSub || fDist || fProv)) {
      const fuzzy = lookupPostcodeByArea(
        fSub  || regSub,
        fDist || regDist,
        fProv || regProv
      );
      if (fuzzy) {
        // Dictionary ชนะเสมอ — ค่าจาก SYS_TH_GEO เป๊ะ
        if (fuzzy.subDistrict) fSub  = fuzzy.subDistrict;
        if (fuzzy.district)    fDist = fuzzy.district;
        if (fuzzy.province)    fProv = fuzzy.province;
        if (fuzzy.postcode)    fPost = fuzzy.postcode;
        dictMatched = true;
      }
    }
  }

  // ─── ลำดับ 3: lookupByPostcode (Fallback สุดท้าย) ───
  if (fPost && (!fSub || !fDist || !fProv)) {
    if (typeof lookupByPostcode === 'function') {
      const pcResult = lookupByPostcode(fPost);
      if (pcResult) {
        // lookupByPostcode คืนค่าแบบไม่มี prefix → ต้องหา row ที่ตรงจาก SYS_TH_GEO อีกที
        // ใช้ lookupPostcodeByArea เพื่อให้ได้ค่าพร้อม prefix
        if (typeof lookupPostcodeByArea === 'function') {
          const exact = lookupPostcodeByArea(
            pcResult.subDistrict || fSub,
            pcResult.district || fDist,
            pcResult.province || fProv
          );
          if (exact) {
            if (!fSub  && exact.subDistrict) fSub  = exact.subDistrict;
            if (!fDist && exact.district)    fDist = exact.district;
            if (!fProv && exact.province)    fProv = exact.province;
          }
        }
        // Fallback ถ้า lookupPostcodeByArea ไม่มี → ใช้ค่าจาก postcode map
        if (!fProv && pcResult.province) fProv = pcResult.province;
        if (!fDist && pcResult.district) fDist = pcResult.district;
        if (!fSub  && pcResult.subDistrict) fSub = pcResult.subDistrict;
      }
    }
  }

  // 4. จัดรูปแบบ
  const fullAddress = formatEnrichedAddress_(house, fSub, fDist, fProv, fPost);

  return { 
    province: fProv, 
    district: fDist, 
    subDistrict: fSub, 
    postcode: fPost, 
    fullAddress, 
    houseNumber: house 
  };
}

/**
 * formatEnrichedAddress_ — [ADD v008] จัดรูปแบบที่อยู่ที่ซ่อมแล้วเป็น String
 */
function formatEnrichedAddress_(house, sub, dist, prov, post) {
  const parts = [];
  if (house) parts.push(house); // [NEW v5.2.003]
  if (sub)   parts.push(sub);
  if (dist)  parts.push(dist);
  if (prov)  parts.push(prov);
  if (post)  parts.push(post);
  return parts.join(' ').trim();
}

/**
 * [NEW v5.2.001] extractTextPriority_ — Prioritize Address Text over Postcode
 */
function extractTextPriority_(rawAddress, rawPlaceName) {
  const combined = `${rawAddress} ${rawPlaceName}`.trim();
  if (!combined) return { textSource: false };

  // 1. Extract Text Components
  let subDistrict = extractSubDistrict_(combined);
  let district    = extractDistrict_(combined);
  let province    = extractProvince_(combined);

  // 2. Extract Postcode
  let postcode    = '';
  const postcodeMatch = combined.match(/\b[0-9]{5}\b/);
  if (postcodeMatch) postcode = postcodeMatch[0];

  // 3. Cross-Check with Dictionary
  if (typeof lookupPostcodeByArea === 'function' && (subDistrict || district || province)) {
    const fuzzy = lookupPostcodeByArea(subDistrict, district, province);
    if (fuzzy) {
      // If text found a valid area in dict, use it to fill gaps
      if (!province)    province    = fuzzy.province;
      if (!district)    district    = fuzzy.district;
      if (!subDistrict) subDistrict = fuzzy.subDistrict;
      if (!postcode)    postcode    = fuzzy.postcode;
    }
  }

  // 4. Fallback: If text components still missing, use postcode lookup
  if (postcode && (!province || !district || !subDistrict)) {
    const geoData = lookupByPostcode(postcode);
    if (geoData) {
      if (!province)    province    = geoData.province;
      if (!district)    district    = geoData.district;
      if (!subDistrict) subDistrict = geoData.subDistrict;
    }
  }

  return { subDistrict, district, province, postcode, textSource: true };
}

/**
 * [NEW v5.2.001] fuzzyMatchAddress — Smart address correction
 */
function fuzzyMatchAddress(rawAddr, threshold = 0.7) {
  if (!rawAddr) return '';
  
  const allRows = typeof loadCachedGeoRows_ === 'function' ? loadCachedGeoRows_() : [];
  if (allRows.length === 0) return '';

  let bestMatch = null;
  let bestScore = 0;

  for (const row of allRows) {
    const resolved = `${row.subDistrict} ${row.district} ${row.province}`.trim();
    const score = diceCoefficient(rawAddr, resolved);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = resolved;
    }
    if (bestScore === 1.0) break;
  }

  return bestScore >= threshold ? bestMatch : '';
}

// ============================================================
// SECTION 4: Scoring
// ============================================================

/**
 * scorePlaceCandidate
 * [FIX v003] hardcode 55 → AI_CONFIG.PLACE_SCORE_MIN
 */
function scorePlaceCandidate(queryPlace, candidate) {
  const nameA = normalizeForCompare(queryPlace);
  const nameB = normalizeForCompare(candidate.normalized || candidate.canonical);
  if (!nameA || !nameB) return 0;

  const levDist   = levenshteinDistance(nameA, nameB);
  const maxLen    = Math.max(nameA.length, nameB.length);
  const levScore  = maxLen > 0 ? Math.max(0, (1 - levDist / maxLen) * 100) : 0;
  const diceScore = diceCoefficient(nameA, nameB) * 100;
  const exactScore = nameA === nameB ? 100 : 0;

  const finalScore = exactScore > 0 ? 100 : diceScore * 0.6 + levScore * 0.4;

  // [FIX v003] ใช้ Config แทน hardcode 55
  return finalScore < AI_CONFIG.PLACE_SCORE_MIN ? 0 : Math.round(finalScore);
}

// ============================================================
// SECTION 5: CRUD
// ============================================================

function createPlace(normResult, province, district, subDistrict, postcode) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_PLACE);
  const now   = new Date();
  const newId = generateShortId('PL');

  // [FIX v5.2.002] รวบรวม Note ทั้งหมด (Suffix, Delivery Note)
  const allNotes = normResult.notes || [];

  const universalMasterId = typeof generateUUID === 'function' ? generateUUID() : generateShortId('UID');

  const newRow = [
    newId,
    normResult.fullAddress || normResult.cleanPlace, // [FIX v008] ใช้ที่อยู่ที่ซ่อมแล้วเป็นชื่อหลัก (Canonical)
    normResult.cleanPlace, // Normalized
    normResult.placeType || 'other',
    subDistrict || '',
    district    || '',
    province    || '',
    postcode    || '',
    now, now, 1,
    APP_CONST.STATUS_ACTIVE,
    allNotes.join(','), // [FIX v5.2.002] เก็บลง Note ห้ามทิ้ง
    universalMasterId,
  ];

  sheet.appendRow(newRow);
  invalidatePlaceCache_();

  // [REMOVED v5.4.001] ไม่เรียก createGlobalAlias() — M_ALIAS เขียนที่ autoEnrich เท่านั้น (Single Writer)
  // autoEnrichAliasesFromFactBatch_() จะเขียน canonical+variant เข้า M_ALIAS เอง

  logDebug('PlaceService', `createPlace: ${newId} — ${normResult.cleanPlace}`);
  return newId;
}

function createPlaceAlias(placeId, aliasName, matchScore) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_PLACE_ALIAS);
  const newId = generateShortId('PLA');

  sheet.appendRow([newId, placeId, aliasName, matchScore || 0, new Date(), true]);
  invalidatePlaceAliasCache_();

  // [REMOVED v5.4.001] ไม่เรียก createGlobalAlias() — M_ALIAS เขียนที่ autoEnrich เท่านั้น (Single Writer)

  logDebug('PlaceService', `createPlaceAlias: ${aliasName} → ${placeId}`);
}

/**
 * updatePlaceStats
 * [FIX v003] โหลดเฉพาะ place_id column + ใช้ PLACE_IDX แทน indexOf + guard
 */
function updatePlaceStats(placeId) {
  if (!placeId) return;
  try {
    const ss      = SpreadsheetApp.getActiveSpreadsheet();
    const sheet   = ss.getSheetByName(SHEET.M_PLACE);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const idCol   = PLACE_IDX.PLACE_ID + 1;
    const idData  = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
    let targetRow = -1;

    for (let i = 0; i < idData.length; i++) {
      if (String(idData[i][0]).trim() === placeId) {
        targetRow = i + 2; break;
      }
    }

    if (targetRow === -1) {
      logWarn('PlaceService', `updatePlaceStats: ไม่พบ placeId ${placeId}`);
      return;
    }

    const lastSeenCol   = PLACE_IDX.LAST_SEEN   + 1;
    const usageCountCol = PLACE_IDX.USAGE_COUNT  + 1;

    // [FIX v5.4.003] Batch write: อ่านทั้ง 2 คอลัมน์ → แก้ใน RAM → เขียนทีเดียว
    // ลดจาก 3 API calls เหลือ 1+1 = 2 API calls
    const statsRange = sheet.getRange(targetRow, lastSeenCol, 1, 2);
    const statsVals  = statsRange.getValues();
    const curr = Number(statsVals[0][1]) || 0;
    statsVals[0][0] = new Date();
    statsVals[0][1] = curr + 1;
    statsRange.setValues(statsVals);
    invalidatePlaceCache_();

  } catch (err) {
    logError('PlaceService', `updatePlaceStats ล้มเหลว: ${err.message}`);
  }
}

// ============================================================
// SECTION 6: Data Loaders
// ============================================================

/**
 * [DEPRECATED v5.4.002] loadCachedGeoRows_ — ย้ายไป 16_GeoDictionaryBuilder.gs แล้ว
 * เวอร์ชันนี้อ่านแค่ 4 คอลัมน์ (เก่า) ขณะที่ 16_GeoDictionaryBuilder อ่าน 16 คอลัมน์ (ใหม่)
 * GAS global scope ทำให้ชื่อซ้ำกันได้ → เวอร์ชันที่โหลดทีหลังเขียนทับ
 * แก้โดย: ลบตัวนี้ออก ให้ใช้ของ 16_GeoDictionaryBuilder.gs แทน
 */

function loadAllPlaces_() {
  const cacheKey = 'M_PLACE_ALL';
  const cache    = CacheService.getScriptCache();
  const cached   = cache.get(cacheKey);
  if (cached) { try { return JSON.parse(cached); } catch(e) {} }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_PLACE);
  if (!sheet || sheet.getLastRow() < 2) return [];

  // [FIX v5.4.001] ใช้ Math.min เพื่อป้องกัน Range error เมื่อชีตมีคอลัมน์น้อยกว่า SCHEMA
  const colsToRead = Math.min(SCHEMA[SHEET.M_PLACE].length, sheet.getLastColumn());
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, colsToRead).getValues();

  const result = rows
    .filter(r => r[PLACE_IDX.PLACE_ID])
    // [FIX v003] กรองทั้ง ARCHIVED และ MERGED (เดิมกรองแค่ ARCHIVED)
    .filter(r => r[PLACE_IDX.STATUS] !== APP_CONST.STATUS_ARCHIVED &&
                 r[PLACE_IDX.STATUS] !== APP_CONST.STATUS_MERGED)
    .map(r => ({
      placeId:    String(r[PLACE_IDX.PLACE_ID]),
      canonical:  String(r[PLACE_IDX.CANONICAL]   || ''),
      normalized: String(r[PLACE_IDX.NORMALIZED]  || ''),
      placeType:  String(r[PLACE_IDX.PLACE_TYPE]  || ''),
      province:   String(r[PLACE_IDX.PROVINCE]    || ''),
      district:   String(r[PLACE_IDX.DISTRICT]    || ''),
      usageCount: Number(r[PLACE_IDX.USAGE_COUNT] || 0),
      note: String(r[PLACE_IDX.NOTE] || ''),
      masterUuid: String(r[PLACE_IDX.MASTER_UUID] || ''),
    }));

  try { cache.put(cacheKey, JSON.stringify(result), AI_CONFIG.CACHE_TTL_SEC); }
  catch(e) { logWarn('PlaceService', 'M_PLACE Cache เต็ม'); }
  return result;
}

function loadAllPlaceAliases_() {
  const cacheKey = 'M_PLACE_ALIAS_ALL';
  const cache    = CacheService.getScriptCache();
  const cached   = cache.get(cacheKey);
  if (cached) { try { return JSON.parse(cached); } catch(e) {} }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_PLACE_ALIAS);
  if (!sheet || sheet.getLastRow() < 2) return [];

  // [FIX v5.4.001] ใช้ Math.min เพื่อป้องกัน Range error
  const colsToRead = Math.min(SCHEMA[SHEET.M_PLACE_ALIAS].length, sheet.getLastColumn());
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, colsToRead).getValues();
  try { cache.put(cacheKey, JSON.stringify(rows), AI_CONFIG.CACHE_TTL_SEC); }
  catch(e) {}
  return rows;
}

function invalidatePlaceCache_()      { CacheService.getScriptCache().remove('M_PLACE_ALL'); }
function invalidatePlaceAliasCache_() { CacheService.getScriptCache().remove('M_PLACE_ALIAS_ALL'); }

/**
 * [NEW v5.2.008] lookupPlaceAdminById_ — ดึงข้อมูลพื้นที่จาก M_PLACE ด้วย ID
 * ใช้สำหรับ Fallback เมื่อพิกัด Google คืนค่าเป็น Plus Code
 */
function lookupPlaceAdminById_(placeId) {
  if (!placeId) return null;
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_PLACE);
  if (!sheet) return null;

  const data = sheet.getDataRange().getValues();
  const row = data.find(r => String(r[PLACE_IDX.PLACE_ID]) === String(placeId));
  
  if (!row) return null;

  return {
    subDistrict: String(row[PLACE_IDX.SUB_DISTRICT] || '').trim(),
    district:    String(row[PLACE_IDX.DISTRICT]     || '').trim(),
    province:    String(row[PLACE_IDX.PROVINCE]     || '').trim(),
    postcode:    String(row[PLACE_IDX.POSTCODE]     || '').trim()
  };
}
