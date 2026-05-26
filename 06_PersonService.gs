/**
 * VERSION: 5.4.001
 * FILE: 06_PersonService.gs
 * LMDS V5.4 — Person Master Service
 * ===================================================
 * PURPOSE:
 *   จัดการ Master Person — ฐานข้อมูลชื่อลูกค้า/ผู้รับสินค้า
 *   เป็น Single Source of Truth สำหรับข้อมูลบุคคล
 * ===================================================
 * CHANGELOG:
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [REMOVE] createPerson: ลบ createGlobalAlias() — M_ALIAS เขียนที่ autoEnrich เท่านั้น
 *     - [REMOVE] createPersonAlias: ลบ createGlobalAlias() — ไม่ต้อง sync ย้อนไป M_ALIAS
 *     - [KEEP] mergePersonRecords: ยังเรียก createGlobalAlias() (ADMIN_MERGE_ACT — Admin Action)
 *   v5.4.000 (2026-05-23):
 *     - [ADD] Comprehensive header documentation
 *     - [ADD] DEPENDENCIES section with module relationships
 *   v5.2.001 (PH2 Hardening):
 *     - [FIX] createPerson: เก็บ note แบบ join(",") ตามคำสั่ง
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config.gs          (SHEET.M_PERSON, PERSON_IDX.*, AI_CONFIG)
 *     - 02_Schema.gs          (SCHEMA[SHEET.M_PERSON], SCHEMA[SHEET.M_PERSON_ALIAS])
 *     - 03_SetupSheets.gs     (logDebug, logWarn, logError)
 *     - 05_NormalizeService.gs (normalizePersonNameFull, normalizeForCompare)
 *     - 14_Utils.gs           (generateShortId, generateUUID, diceCoefficient, levenshteinDistance)
 *   CALLS (Invokes):
 *     - resolveMasterUuidViaGlobalAlias() → 21_AliasService.gs (findPersonCandidates)
 *     - convertUuidToPersonId()           → 21_AliasService.gs (findPersonCandidates)
 *     - createGlobalAlias()               → 21_AliasService.gs (mergePersonRecords ONLY — Admin Action)
 *   EXPORTS TO:
 *     - 10_MatchEngine.gs     (resolvePerson, createPerson, updatePersonStats, loadAllPersons_)
 *     - 11_TransactionService.gs (loadAllPersons_)
 *     - 17_SearchService.gs   (loadAllPersons_)
 *     - 19_Hardening.gs       (loadAllPersons_)
 *     - 21_AliasService.gs    (loadAllPersons_ — UUID converters)
 *   SHEETS ACCESSED:
 *     - SHEET.M_PERSON        (Read+Write: CRUD, Stats update)
 *     - SHEET.M_PERSON_ALIAS  (Read+Write: Alias lookup, createPersonAlias)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  06_PersonService.gs (Person Master Hub)                   │
 *   │  ├── resolvePerson()        — Match/resolve person        │
 *   │  ├── findPersonCandidates() — Multi-strategy search       │
 *   │  │   ├── M_ALIAS Fast Path (resolveMasterUuidViaGlobalAlias)│
 *   │  │   ├── Phone Match                                       │
 *   │  │   ├── Alias Match (M_PERSON_ALIAS)                      │
 *   │  │   ├── Phonetic / Name Match                             │
 *   │  │   └── Note Search (Deep Match)                          │
 *   │  ├── scorePersonCandidate() — Score calculation            │
 *   │  ├── createPerson()         — Create new person record    │
 *   │  ├── createPersonAlias()    — Add alternate name          │
 *   │  ├── mergePersonRecords()   — Merge duplicates (Admin)    │
 *   │  ├── updatePersonStats()    — Update usage statistics     │
 *   │  └── loadAllPersons_()      — Load all persons (cached)   │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: resolvePerson
// ============================================================

/**
 * resolvePerson — ค้นหาหรือประเมินบุคคลจากชื่อดิบ
 */
function resolvePerson(rawName) {
  const normResult = normalizePersonNameFull(rawName);
  const cleanName  = normResult.cleanName;

  if (!cleanName || cleanName.length < 2) {
    return { personId: null, status: 'LOW_QUALITY', confidence: 0, normResult };
  }

  const candidates = findPersonCandidates(cleanName, normResult.extractedPhone);

  if (candidates.length === 0) {
    return { personId: null, status: 'NOT_FOUND', confidence: 0, normResult };
  }

  let bestPerson = null;
  let bestScore  = 0;

  candidates.forEach(candidate => {
    // [UPGRADE v5.1.001] ส่งข้อมูลว่า match ด้วยเบอร์โทรหรือไม่
    const score = scorePersonCandidate(cleanName, candidate, normResult.extractedPhone);
    if (score > bestScore) {
      bestScore  = score;
      bestPerson = candidate;
    }
  });

  if (bestScore >= AI_CONFIG.THRESHOLD_AUTO) {
    return { personId: bestPerson.personId, status: 'FOUND',
             confidence: bestScore, normResult };
  }
  if (bestScore >= AI_CONFIG.THRESHOLD_REVIEW) {
    return { personId: bestPerson.personId, status: 'NEEDS_REVIEW',
             confidence: bestScore, normResult };
  }
  return { personId: null, status: 'NOT_FOUND', confidence: bestScore, normResult };
}

// ============================================================
// SECTION 2: findPersonCandidates
// ============================================================

/**
 * findPersonCandidates — ค้นหา Candidate จาก M_PERSON
 * [FIX v003] Object reference bug: includes → .some(p => p.personId===)
 * [FIX v003] Phone match > 1 → ไปต่อ scoring แทน return ทันที
 * [FIX v003] Phonetic fallback substring(0,2) → (0,3)
 */
function findPersonCandidates(cleanName, phone) {
  const allPersons = loadAllPersons_();
  const results    = [];

  const aliasResolve = typeof resolveMasterUuidViaGlobalAlias === 'function' ? resolveMasterUuidViaGlobalAlias(cleanName, 'PERSON') : null;
  if (aliasResolve && aliasResolve.masterUuid && aliasResolve.score >= 95) {
    const ownerId = convertUuidToPersonId(aliasResolve.masterUuid);
    const perfect = allPersons.find(p => p.personId === ownerId);
    if (perfect) return [perfect];
  }

  // --- 1. Phone Match ---
  if (phone) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const byPhone    = allPersons.filter(p => {
      const stored = String(p.phone || '').replace(/[^0-9]/g, '');
      return stored === cleanPhone && stored.length >= 9;
    });

    if (byPhone.length === 1) {
      // [FIX v003] เจอ 1 คน → return เลย (confident)
      return byPhone;
    }
    if (byPhone.length > 1) {
      // [FIX v003] เจอหลายคน → เพิ่มเข้า results แล้วไปต่อ scoring
      byPhone.forEach(p => {
        if (!results.some(r => r.personId === p.personId)) results.push(p);
      });
    }
  }

  // --- 2. Alias Match ---
  const aliasMatches = findByAlias_(cleanName);
  aliasMatches.forEach(personId => {
    const found = allPersons.find(p => p.personId === personId);
    // [FIX v003] ใช้ .some() แทน .includes() กัน object reference bug
    if (found && !results.some(r => r.personId === found.personId)) {
      results.push(found);
    }
  });

  // --- 3. Phonetic / Name Match ---
  const searchKey = buildThaiPhoneticKey(cleanName);
  allPersons.forEach(person => {
    if (results.some(r => r.personId === person.personId)) return;
    const personKey = buildThaiPhoneticKey(person.normalized);

    if (searchKey && personKey && searchKey === personKey) {
      results.push(person);
    } else {
      // [FIX v003] Fallback 3 ตัวอักษร แทน 2 (ลด false positive)
      const normA = normalizeForCompare(cleanName);
      const normB = normalizeForCompare(person.normalized);
      if (normA.length >= 3 && normB.length >= 3 &&
          normB.startsWith(normA.substring(0, 3))) {
        results.push(person);
      }
    }
  });

  // --- 4. Note Search (Deep Match) — [NEW v5.2.003] ค้นหาลามไปถึงหมายเหตุ ---
  if (results.length === 0) {
    const queryParts = cleanName.split(/\s+/).filter(p => p.length >= 2);
    allPersons.forEach(person => {
      const noteStr = String(person.note || '');
      if (!noteStr) return;

      const isMatch = queryParts.some(part => noteStr.includes(part));
      if (isMatch) {
        results.push(person);
      }
    });
  }

  return results;
}

/**
 * findByAlias_ — ค้นหา Person ID จาก M_PERSON_ALIAS
 * [FIX v003] ใช้ Set กัน duplicate
 */
function findByAlias_(cleanName) {
  const allAliases = loadAllAliases_();
  const targetNorm = normalizeForCompare(cleanName);
  const foundSet   = new Set();

  allAliases.forEach(alias => {
    if (!alias[PERSON_ALIAS_IDX.ACTIVE_FLAG]) return;
    const aliasNorm = normalizeForCompare(alias[PERSON_ALIAS_IDX.ALIAS_NAME]);
    if (aliasNorm === targetNorm && aliasNorm.length > 0) {
      foundSet.add(String(alias[PERSON_ALIAS_IDX.PERSON_ID]));
    }
  });

  return [...foundSet];
}

// ============================================================
// SECTION 3: Scoring
// ============================================================

/**
 * scorePersonCandidate — คำนวณคะแนน Match
 * [UPGRADE v5.1.001] เพิ่ม Phone Match Bonus = 95
 */
function scorePersonCandidate(queryName, candidate, queryPhone) {
  // 1. ตรวจสอบ Phone Match ก่อน (โบนัส 95 คะแนน)
  if (queryPhone && candidate.phone) {
    const p1 = String(queryPhone).replace(/[^0-9]/g, '');
    const p2 = String(candidate.phone).replace(/[^0-9]/g, '');
    if (p1 === p2 && p1.length >= 9) return 95;
  }

  const nameA = normalizeForCompare(queryName);
  const nameB = normalizeForCompare(candidate.normalized || candidate.canonical);

  if (!nameA || !nameB) return 0;

  const levDist   = levenshteinDistance(nameA, nameB);
  const maxLen    = Math.max(nameA.length, nameB.length);
  const levScore  = maxLen > 0 ? Math.max(0, (1 - levDist / maxLen) * 100) : 0;
  const diceScore = diceCoefficient(nameA, nameB) * 100;
  const ratioScore = nameA === nameB ? 100 :
    (nameA.includes(nameB) || nameB.includes(nameA)) ? 80 : 0;

  let finalScore;
  if (nameA.length < 4) {
    finalScore = levScore * 0.6 + diceScore * 0.2 + ratioScore * 0.2;
  } else {
    finalScore = diceScore * 0.5 + levScore * 0.3 + ratioScore * 0.2;
  }

  // [FIX v003] ใช้ Config แทน hardcode 60
  return finalScore < AI_CONFIG.SCORE_MIN_THRESHOLD ? 0 : Math.round(finalScore);
}

// ============================================================
// SECTION 4: CRUD
// ============================================================

/**
 * createPerson — สร้างบุคคลใหม่ใน M_PERSON
 */
function createPerson(normResult) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_PERSON);
  const now   = new Date();
  const newId = generateShortId('P');

  const phoneStr = normResult.extractedPhone
    ? "'" + normResult.extractedPhone : '';

  // [FIX v5.2.002] รวบรวม Note ทั้งหมด (Phone, Doc, Prefix)
  const allNotes = normResult.deliveryNotes || [];

  const universalMasterId = typeof generateUUID === 'function' ? generateUUID() : generateShortId('UID');

  const newRow = [
    newId,
    normResult.cleanName,
    normalizeForCompare(normResult.cleanName),
    phoneStr,
    now, now, 1,
    APP_CONST.STATUS_ACTIVE,
    allNotes.join(','),
    universalMasterId,
  ];

  sheet.appendRow(newRow);
  invalidatePersonCache_();
  logDebug('PersonService', `createPerson: ${newId} — ${normResult.cleanName}`);

  // [REMOVED v5.4.001] ไม่เรียก createGlobalAlias() — M_ALIAS เขียนที่ autoEnrich เท่านั้น (Single Writer)
  // autoEnrichAliasesFromFactBatch_() จะเขียน canonical+variant เข้า M_ALIAS เอง

  return newId;
}

/**
 * createPersonAlias — เพิ่มชื่อสำรองให้บุคคล
 */
function createPersonAlias(personId, aliasName, matchScore) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_PERSON_ALIAS);
  const newId = generateShortId('PA');

  sheet.appendRow([newId, personId, aliasName, matchScore || 0, new Date(), true]);
  invalidateAliasCache_();
  logDebug('PersonService', `createPersonAlias: ${aliasName} → ${personId}`);

  // [REMOVED v5.4.001] ไม่เรียก createGlobalAlias() — M_ALIAS เขียนที่ autoEnrich เท่านั้น (Single Writer)
}

/**
 * updatePersonStats — อัปเดต last_seen และ usage_count
 * [FIX v003] โหลดเฉพาะ person_id column + guard idCol === -1
 */
function updatePersonStats(personId) {
  if (!personId) return;
  try {
    const ss      = SpreadsheetApp.getActiveSpreadsheet();
    const sheet   = ss.getSheetByName(SHEET.M_PERSON);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    // [FIX v003] โหลดเฉพาะคอลัมน์ person_id (col 1) แทนทั้งชีต
    const idCol      = PERSON_IDX.PERSON_ID + 1;
    const idData     = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
    let targetRow    = -1;

    for (let i = 0; i < idData.length; i++) {
      if (String(idData[i][0]).trim() === personId) {
        targetRow = i + 2;
        break;
      }
    }

    if (targetRow === -1) {
      logWarn('PersonService', `updatePersonStats: ไม่พบ personId ${personId}`);
      return;
    }

    const lastSeenCol   = PERSON_IDX.LAST_SEEN   + 1;
    const usageCountCol = PERSON_IDX.USAGE_COUNT  + 1;

    // [FIX v5.4.003] Batch write: อ่านทั้ง 2 คอลัมน์ → แก้ใน RAM → เขียนทีเดียว
    // ลดจาก 3 API calls เหลือ 1+1 = 2 API calls
    const statsRange = sheet.getRange(targetRow, lastSeenCol, 1, 2);
    const statsVals  = statsRange.getValues();
    const currCount  = Number(statsVals[0][1]) || 0;
    statsVals[0][0] = new Date();
    statsVals[0][1] = currCount + 1;
    statsRange.setValues(statsVals);
    invalidatePersonCache_();

  } catch (err) {
    logError('PersonService', `updatePersonStats ล้มเหลว: ${err.message}`);
  }
}

/**
 * mergePersonRecords — Merge บุคคล 2 คนให้เป็น 1
 * [FIX v003] aliasName ใช้ canonical name ของ sourceId ไม่ใช่ sourceId เอง
 * [FIX v003] เพิ่ม guard idCol === -1
 * [FIX v003] comment "ห้ามลบ" แก้จาก "ห้างลบ"
 */
function mergePersonRecords(sourceId, targetId) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET.M_PERSON);
    const data  = sheet.getRange(1, 1, sheet.getLastRow(),
                   SCHEMA[SHEET.M_PERSON].length).getValues();
    const headers = data[0];
    const idCol   = headers.indexOf('person_id');
    const statCol = headers.indexOf('record_status');
    const noteCol = headers.indexOf('note');
    const canCol  = headers.indexOf('canonical_name');

    // [FIX v003] guard idCol
    if (idCol === -1 || statCol === -1) {
      logError('PersonService', 'mergePersonRecords: ไม่พบ header person_id/record_status');
      return;
    }

    let sourceCanonical = sourceId; // fallback
    let targetMasterUuid = '';

    for (let i = 1; i < data.length; i++) {
      const rowPersonId = String(data[i][idCol]);
      if (rowPersonId === targetId && PERSON_IDX.MASTER_UUID < data[i].length) {
        targetMasterUuid = String(data[i][PERSON_IDX.MASTER_UUID] || '');
      }
      if (rowPersonId !== sourceId) continue;

      const targetRow = i + 1;

      // [FIX v003] ดึง canonical_name ของ source ก่อน merge
      if (canCol !== -1 && data[i][canCol]) {
        sourceCanonical = String(data[i][canCol]);
      }

      // [FIX v003] ห้ามลบ — เปลี่ยน Status เป็น Merged แทน
      sheet.getRange(targetRow, statCol + 1).setValue(APP_CONST.STATUS_MERGED);
      if (noteCol !== -1) {
        sheet.getRange(targetRow, noteCol + 1).setValue(
          `Merged → ${targetId} on ${toThaiDateStr(new Date())}`
        );
      }
      break;
    }

    // [FIX v003] สร้าง Alias ด้วย canonical_name ของ source ไม่ใช่ sourceId
    createPersonAlias(targetId, sourceCanonical, 100);
    if (typeof createGlobalAlias === 'function' && targetMasterUuid) {
      createGlobalAlias(targetMasterUuid, sourceCanonical, 'PERSON', 100, 'ADMIN_MERGE_ACT');
    }
    invalidatePersonCache_();
    logInfo('PersonService', `mergePersonRecords: ${sourceId} → ${targetId}`);

  } catch (err) {
    logError('PersonService', `mergePersonRecords ล้มเหลว: ${err.message}`);
    throw err;
  }
}

// ============================================================
// SECTION 5: Data Loaders (with Cache)
// ============================================================

function loadAllPersons_() {
  const cacheKey = 'M_PERSON_ALL';
  const cache    = CacheService.getScriptCache();
  const cached   = cache.get(cacheKey);
  if (cached) { try { return JSON.parse(cached); } catch(e) {} }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_PERSON);
  if (!sheet || sheet.getLastRow() < 2) return [];

  // [FIX v5.4.001] ใช้ Math.min เพื่อป้องกัน Range error เมื่อชีตมีคอลัมน์น้อยกว่า SCHEMA
  // (กรณีชีตเก่าที่ยังไม่มี master_uuid column)
  const colsToRead = Math.min(SCHEMA[SHEET.M_PERSON].length, sheet.getLastColumn());
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, colsToRead).getValues();

  const result = rows
    .filter(r => r[PERSON_IDX.PERSON_ID])
    .filter(r => r[PERSON_IDX.STATUS] !== APP_CONST.STATUS_ARCHIVED &&
                 r[PERSON_IDX.STATUS] !== APP_CONST.STATUS_MERGED)
    .map(r => ({
      personId:   String(r[PERSON_IDX.PERSON_ID]),
      canonical:  String(r[PERSON_IDX.CANONICAL]  || ''),
      normalized: String(r[PERSON_IDX.NORMALIZED] || ''),
      phone:      String(r[PERSON_IDX.PHONE]       || '').replace(/^'/, ''),
      usageCount: Number(r[PERSON_IDX.USAGE_COUNT] || 0),
      note: String(r[PERSON_IDX.NOTE] || ''),
      masterUuid: String(r[PERSON_IDX.MASTER_UUID] || ''),
    }));

  try { cache.put(cacheKey, JSON.stringify(result), AI_CONFIG.CACHE_TTL_SEC); }
  catch(e) { logWarn('PersonService', 'M_PERSON Cache เต็ม'); }
  return result;
}

function loadAllAliases_() {
  const cacheKey = 'M_PERSON_ALIAS_ALL';
  const cache    = CacheService.getScriptCache();
  const cached   = cache.get(cacheKey);
  if (cached) { try { return JSON.parse(cached); } catch(e) {} }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_PERSON_ALIAS);
  if (!sheet || sheet.getLastRow() < 2) return [];

  // [FIX v5.4.001] ใช้ Math.min เพื่อป้องกัน Range error
  const colsToRead = Math.min(SCHEMA[SHEET.M_PERSON_ALIAS].length, sheet.getLastColumn());
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, colsToRead).getValues();
  try { cache.put(cacheKey, JSON.stringify(rows), AI_CONFIG.CACHE_TTL_SEC); }
  catch(e) {}
  return rows;
}

function invalidatePersonCache_() {
  CacheService.getScriptCache().remove('M_PERSON_ALL');
}
function invalidateAliasCache_() {
  CacheService.getScriptCache().remove('M_PERSON_ALIAS_ALL');
}
