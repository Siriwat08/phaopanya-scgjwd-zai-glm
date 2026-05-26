/**
 * VERSION: 5.4.001
 * FILE: 17_SearchService.gs
 * LMDS V5.4 — Search Service (The Bridger — Group 2)
 * ===================================================
 * PURPOSE:
 *   สะพานเชื่อม Group 2 (ตารางงานประจำวัน) → Group 1 (Master Data)
 *   รับ ShipToName + ShipToAddress → ค้นหาพิกัดที่ดีที่สุด → เขียน LatLong_Actual
 *   ใช้ M_ALIAS Fast Track (Tier 0) เป็นเส้นทางหลัก — เร็วและแม่นยำ
 * ===================================================
 * CHANGELOG:
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [ADD] Tier 0 Fast Track via M_ALIAS (fastLookupByShipToName)
 *     - [TODO] Phase 2: เขียนใหม่เป็น Tier 0 (Exact M_ALIAS) → Tier 1 (Fuzzy ≥85) → NOT_FOUND (red)
 *     - [TODO] Phase 2: ลบ Tier D (SCG Fallback) + Tier E (AI Reasoning)
 *   v5.4.000 (2026-05-23):
 *     - [ADD] fastLookupByShipToName integration
 *   v5.2.012:
 *     - [ELEVATE] ยกระดับ personId (ShipToName) เป็นสมอหลักสูงสุด (Elevated Tier C)
 *   v5.2.010:
 *     - [UPGRADE] findBestGeoByPersonPlace: ยึด ShipToName เป็นสมอหลัก
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config.gs          (SHEET.DAILY_JOB, DATA_IDX.*, AI_CONFIG, APP_CONST)
 *     - 02_Schema.gs          (SCHEMA[SHEET.DAILY_JOB])
 *     - 05_NormalizeService.gs (normalizePersonNameFull, normalizePlaceName)
 *     - 14_Utils.gs           (isValidLatLng, parseLatLng)
 *   CALLS (Invokes):
 *     - fastLookupByShipToName()          → 21_AliasService.gs (Tier 0 Fast Track)
 *     - resolvePerson()                   → 06_PersonService.gs
 *     - resolvePlace()                    → 07_PlaceService.gs
 *     - getDestsByPersonId()              → 09_DestinationService.gs
 *     - getDestsByPersonAndPlace()        → 09_DestinationService.gs
 *     - getDestsByPlaceId()              → 09_DestinationService.gs
 *     - callGeminiAPI()                   → 14_Utils.gs (Tier E AI — to be removed)
 *   EXPORTS TO:
 *     - 18_ServiceSCG.gs      (findBestGeoByPersonPlace, runLookupEnrichment)
 *   SHEETS ACCESSED:
 *     - SHEET.DAILY_JOB       (Read+Write: ShipToName→LatLong_Actual + color coding)
 *     - SHEET.M_ALIAS         (Read: Tier 0 Fast Track via fastLookupByShipToName)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  17_SearchService.gs (Group 2 Bridge — Coordinate Finder)   │
 *   │  ├── findBestGeoByPersonPlace() — Main search entry         │
 *   │  │   ├── Step 1: Normalize (ShipToName + ShipToAddress)     │
 *   │  │   ├── Step 1.5: Tier 0 — M_ALIAS Fast Track              │
 *   │  │   │   └── fastLookupByShipToName() → 21_AliasService     │
 *   │  │   ├── Step 2: Tier C — Person anchor (resolvePerson)     │
 *   │  │   ├── Step 3: Tier A — Person+Place (resolvePlace)       │
 *   │  │   ├── Step 4: Tier B — Place only fallback               │
 *   │  │   ├── Step 5: Tier D — SCG API Fallback                  │
 *   │  │   └── Step 6: Tier E — AI Reasoning (to be removed)      │
 *   │  ├── runLookupEnrichment() — Batch process daily job        │
 *   │  │   └── Color: Green #b6d7a8 / Yellow #ffe599 / Red #f4cccc│
 *   │  └── lookupSingleRow() — Debug helper                       │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: findBestGeoByPersonPlace — ฟังก์ชันหลัก
// ============================================================

/**
 * findBestGeoByPersonPlace — ค้นหาพิกัดที่ดีที่สุด
 * เรียกจาก 18_ServiceSCG.gs ใน applyMasterCoordinatesToDailyJob
 *
 * [FIX v003] normalize แล้วส่ง cleanName/cleanPlace เข้า resolve จริง
 * [FIX v003] resolvePlace(cleanPlace, rawPlace) แทน (rawPlace, rawPlace)
 * [FIX v003] Tier A: explicit sort ก่อน dests[0]
 *
 * @param {string} rawPerson  - ShipToName ดิบ
 * @param {string} rawPlace   - ShipToAddress ดิบ
 * @param {string} scgLatLng  - LatLong_SCG จาก API (Fallback)
 */
function findBestGeoByPersonPlace(rawPerson, rawPlace, scgLatLng) {

  // --- Step 1: Normalize ---
  const normPerson = normalizePersonNameFull(rawPerson);
  const normPlace  = normalizePlaceName(rawPlace);
  const cleanName  = normPerson.cleanName;
  const cleanPlace = normPlace.cleanPlace;

  // --- Step 1.5: [NEW v5.4.000] Fast Track via M_ALIAS (ShipToName-only) ---
  // เหมือน V4.0 NameMapping: normalize(ShipToName) → M_ALIAS → masterUuid → destination → lat,lng
  // ข้ามกระบวนการ resolvePerson/resolvePlace ที่หนัก ทำให้ค้นหาเร็วขึ้นมาก
  if (typeof fastLookupByShipToName === 'function') {
    var fastResult = fastLookupByShipToName(rawPerson);
    if (fastResult && fastResult.lat != null && fastResult.lng != null) {
      return buildSearchResult_(
        fastResult.lat, fastResult.lng,
        'FOUND_ALIAS_FAST', fastResult.confidence, fastResult.destId,
        fastResult.reason
      );
    }
  }

  // --- Step 2: Match Person ---
  // [FIX v003] ส่ง rawPerson ให้ resolvePerson (มี normalize ข้างใน)
  const personResult = resolvePerson(rawPerson);
  const personId     = personResult.personId;

  // --- Step 3: Match Place ---
  // [FIX v003] ส่ง cleanPlace (normalized) + rawPlace (dirty) แยกกัน
  //            ไม่ใช่ (rawPlace, rawPlace) ซ้ำ
  const placeResult  = resolvePlace(cleanPlace || rawPlace, rawPlace);
  const placeId      = placeResult.placeId;

  // --- Step 4: ค้นหา M_DESTINATION ตาม Tier ---

  // [UPGRADE v5.2.010] Tier C (Elevated): ถ้าหา Person เจอ ให้ดึงพิกัดของ Person ทันที (ไม่สนว่า Place จะตรงหรือไม่ หรือ Place จะเป็น null)
  // เพราะ ShipToName คือสมอหลักที่มีความมั่นใจสูงที่สุดเพื่อป้องกันปัญหาพิกัดกระโดดเนื่องจากที่อยู่สะกดเพี้ยน
  if (personId) {
    const dests = getDestsByPersonId(personId)
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));

    if (dests.length > 0) {
      return buildSearchResult_(
        dests[0].lat, dests[0].lng,
        'FOUND_DOMINANT', 90, dests[0].destId,
        `Person anchor match (top usage:${dests[0].usageCount})`
      );
    }
  }

  // Tier A: Person + Place ครบ (Fallback)
  if (personId && placeId) {
    let dests = getDestsByPersonAndPlace(personId, placeId);

    // [FIX v003] explicit sort ก่อน dests[0] ป้องกัน assumption
    dests = dests.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));

    if (dests.length === 1) {
      return buildSearchResult_(
        dests[0].lat, dests[0].lng,
        'FOUND', 98, dests[0].destId,
        `Person+Place exact match (usage:${dests[0].usageCount})`
      );
    }
    if (dests.length > 1) {
      return buildSearchResult_(
        dests[0].lat, dests[0].lng,
        'FOUND_DOMINANT', 92, dests[0].destId,
        `Person+Place dominant (${dests.length} records, top usage:${dests[0].usageCount})`
      );
    }
  }

  // Tier B: Place เท่านั้น (กรณีหา Person ไม่เจอจริงๆ)
  if (placeId && !personId) {
    const dests = getDestsByPlaceId(placeId)
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));

    if (dests.length > 0) {
      return buildSearchResult_(
        dests[0].lat, dests[0].lng,
        'FOUND_FALLBACK', 80, dests[0].destId,
        `Place fallback match (${dests.length} records)`
      );
    }
  }

  // Tier D: SCG API Fallback
  if (scgLatLng) {
    const parsed = parseLatLng(scgLatLng);
    if (parsed && isValidLatLng(parsed.lat, parsed.lng)) {
      return buildSearchResult_(
        parsed.lat, parsed.lng,
        'SCG_API_FALLBACK', 50, null, // [FIX v003] destId → null
        'ใช้พิกัดจาก SCG API (ยังไม่ verified)'
      );
    }
  }

  // Tier E: AI Reasoning (Last Resort)
  // [ADD v003] ใช้ Gemini ช่วยวิเคราะห์ที่อยู่กรณีหาไม่เจอจริงๆ
  if (AI_CONFIG.USE_AI_REASONING) {
    const aiResult = callGeminiReasoning_(rawPerson, rawPlace);
    if (aiResult && isValidLatLng(aiResult.lat, aiResult.lng)) {
      return buildSearchResult_(
        aiResult.lat, aiResult.lng,
        'AI_REASONED', 40, null,
        `AI Reasoning: ${aiResult.reason}`
      );
    }
  }

  // Tier G: ไม่พบ
  return buildSearchResult_(
    null, null,
    'NOT_FOUND', 0, null,
    `ไม่พบข้อมูล — Person:${cleanName || '?'} Place:${cleanPlace || '?'}`
  );
}

/**
 * callGeminiReasoning_ — ส่ง Prompt ให้ Gemini วิเคราะห์พิกัด
 */
function callGeminiReasoning_(person, address) {
  const prompt = `
    Context: Logistics Master Data System
    Task: Extract Latitude and Longitude from a Thai address string.
    Input Person: ${person}
    Input Address: ${address}
    
    Rules:
    1. If you can find the coordinates of this place in Thailand, return JSON: {"lat": 13.xxx, "lng": 100.xxx, "reason": "why"}
    2. If unsure or not found, return JSON: {"lat": null, "lng": null, "reason": "not found"}
    3. Return ONLY valid JSON.
  `;

  try {
    const response = callGeminiAPI(prompt);
    const cleaned  = cleanAIResponse_(response);
    const json     = JSON.parse(cleaned);
    return json;
  } catch (e) {
    logError('SearchService', `AI Reasoning failed: ${e.message}`);
    return null;
  }
}

/**
 * buildSearchResult_ — สร้าง Object ผลลัพธ์มาตรฐาน
 * [FIX v003] NOT_FOUND คืน lat:null, lng:null แทน 0,0
 */
function buildSearchResult_(lat, lng, status, confidence, destId, reason) {
  return {
    lat:        lat,        // null เมื่อ NOT_FOUND
    lng:        lng,        // null เมื่อ NOT_FOUND
    status:     status,
    confidence: confidence,
    destId:     destId,    // null ถ้าไม่มี Dest
    reason:     reason,
  };
}

// ============================================================
// SECTION 2: runLookupEnrichment — Batch Process
// ============================================================

/**
 * runLookupEnrichment — วนทุกแถวใน ตารางงานประจำวัน
 * [FIX v003] setBackground loop → setBackgrounds() Batch ทีเดียว
 * [FIX v003] existingLL check → parseLatLng + isValidLatLng
 * [ADD v003] Time Guard ป้องกัน Timeout
 */
function runLookupEnrichment() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const sheet     = ss.getSheetByName(SHEET.DAILY_JOB);

  if (!sheet || sheet.getLastRow() < 2) {
    logWarn('SearchService', 'ตารางงานประจำวัน ว่างอยู่');
    return;
  }

  const startTime   = new Date();
  const timeLimit   = AI_CONFIG.TIME_LIMIT_MS || (5 * 60 * 1000);
  const totalRows   = sheet.getLastRow() - 1;
  const schemaLen   = SCHEMA[SHEET.DAILY_JOB].length;
  const allData     = sheet.getRange(2, 1, totalRows, schemaLen).getValues();

  // เตรียม Array สำหรับ Batch Write
  const latActualArr = [];  // [['13.xxx,100.xxx'], [''], ...]
  const bgColorArr   = [];  // [['#b6d7a8'], ['#f4cccc'], ...]

  let countFound    = 0;
  let countFallback = 0;
  let countScg      = 0;
  let countNotFound = 0;
  let countSkipped  = 0;
  let timedOut      = false;

  for (let i = 0; i < allData.length; i++) {
    // [ADD v003] Time Guard
    if (new Date() - startTime > timeLimit) {
      logWarn('SearchService',
        `runLookupEnrichment: Time Guard หยุดที่แถว ${i + 1}/${totalRows}`);
      timedOut = true;
      break;
    }

    const row        = allData[i];
    const rawPerson  = String(row[DATA_IDX.SHIP_TO_NAME]  || '').trim();
    const rawPlace   = String(row[DATA_IDX.SHIP_TO_ADDR]  || '').trim();
    const scgLatLng  = String(row[DATA_IDX.LATLNG_SCG]    || '').trim();
    const existingLL = String(row[DATA_IDX.LATLNG_ACTUAL] || '').trim();

    // [FIX v003] ตรวจ existingLL ด้วย parseLatLng + isValidLatLng
    //            แทน includes(',') ที่หลวม
    if (existingLL) {
      const parsed = parseLatLng(existingLL);
      if (parsed && isValidLatLng(parsed.lat, parsed.lng)) {
        latActualArr.push([existingLL]);
        bgColorArr.push([null]); // ไม่เปลี่ยนสี
        countSkipped++;
        continue;
      }
    }

    // ค้นหาพิกัด
    const result     = findBestGeoByPersonPlace(rawPerson, rawPlace, scgLatLng);
    let   outputLL   = '';
    let   bgColor    = APP_CONST.COLOR_NOT_FOUND;

    switch (result.status) {
      case 'FOUND':
      case 'FOUND_DOMINANT':
      case 'FOUND_ALIAS_FAST':
        outputLL = (result.lat != null && result.lng != null)
          ? `${result.lat},${result.lng}` : '';
        bgColor  = APP_CONST.COLOR_FOUND;
        countFound++;
        break;

      case 'FOUND_FALLBACK':
        outputLL = (result.lat != null && result.lng != null)
          ? `${result.lat},${result.lng}` : '';
        bgColor  = APP_CONST.COLOR_FALLBACK;
        countFallback++;
        break;

      case 'SCG_API_FALLBACK':
        outputLL = (result.lat != null && result.lng != null)
          ? `${result.lat},${result.lng}` : '';
        bgColor  = APP_CONST.COLOR_BRANCH;
        countScg++;
        break;

      case 'NOT_FOUND':
      default:
        outputLL = '';
        bgColor  = APP_CONST.COLOR_NOT_FOUND;
        countNotFound++;
        break;
    }

    latActualArr.push([outputLL]);
    bgColorArr.push([bgColor]);
  }

  // สร้าง padding สำหรับแถวที่ยังไม่ได้ประมวลผล (กรณี timeout)
  const processedCount = latActualArr.length;
  while (latActualArr.length < totalRows) {
    latActualArr.push(['']);
    bgColorArr.push([null]);
  }

  // [FIX v003] Batch Write ทีเดียว — ไม่ loop ทีละแถว
  const latActualCol = DATA_IDX.LATLNG_ACTUAL + 1;

  sheet.getRange(2, latActualCol, processedCount, 1)
       .setValues(latActualArr.slice(0, processedCount));

  // [FIX v003] Batch setBackgrounds ทีเดียว
  const fullRowLen = schemaLen;
  const bgMatrix   = bgColorArr.slice(0, processedCount)
    .map(colorRow => {
      if (!colorRow[0]) return Array(fullRowLen).fill(null);
      return Array(fullRowLen).fill(colorRow[0]);
    });

  sheet.getRange(2, 1, processedCount, fullRowLen)
       .setBackgrounds(bgMatrix);

  const msg =
    `✅ จับคู่พิกัดเสร็จ\n` +
    `เจอ: ${countFound} | Fallback: ${countFallback} | ` +
    `SCG: ${countScg} | ไม่พบ: ${countNotFound}` +
    (timedOut ? '\n⚠️ หยุดก่อนครบเพราะใกล้ Timeout' : '');

  logInfo('SearchService', msg.replace(/\n/g, ' '));
  ss.toast(msg, APP_NAME, 8);
}

// ============================================================
// SECTION 3: lookupSingleRow — Debug Helper
// ============================================================

/**
 * lookupSingleRow — ค้นหาพิกัดสำหรับ 1 แถว (ทดสอบ)
 */
function lookupSingleRow(rowNumber) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.DAILY_JOB);
  if (!sheet || rowNumber < 2) return null;

  const rowData   = sheet.getRange(rowNumber, 1, 1,
                     SCHEMA[SHEET.DAILY_JOB].length).getValues()[0];
  const rawPerson = String(rowData[DATA_IDX.SHIP_TO_NAME] || '').trim();
  const rawPlace  = String(rowData[DATA_IDX.SHIP_TO_ADDR] || '').trim();
  const scgLatLng = String(rowData[DATA_IDX.LATLNG_SCG]   || '').trim();

  const result = findBestGeoByPersonPlace(rawPerson, rawPlace, scgLatLng);

  console.log(
    `[SearchService] Row ${rowNumber} → Status:${result.status} ` +
    `(${result.confidence}%) lat:${result.lat} lng:${result.lng}\n` +
    `  Reason: ${result.reason}`
  );

  return result;
}
