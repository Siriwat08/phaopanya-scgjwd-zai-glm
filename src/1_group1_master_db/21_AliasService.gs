/**
 * VERSION: 5.4.001
 * FILE: 21_AliasService.gs
 * LMDS V5.4 — Hybrid Alias Architecture (Global M_ALIAS + Entity-Specific Views)
 * ===================================================
 * PURPOSE:
 *   จัดการตารางกลาง M_ALIAS — เชื่อมโยงชื่อสกปรก/ย่อ/ผิด → master_uuid → พิกัด
 *   เป็น Single Source of Truth สำหรับ Alias Resolution ที่ Group 2 ใช้ค้นหา
 *   ⚠️ Auto Pipeline ไม่เขียน M_ALIAS ที่นี่ — เขียนที่ autoEnrichAliasesFromFactBatch_() เท่านั้น
 * ===================================================
 * CHANGELOG:
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [REMOVE] syncAliasToEntityTable_(): ลบฟังก์ชัน sync ย้อน เพราะทำให้เกิด circular dependency
 *     - [REMOVE] createGlobalAlias(): ลบ syncAliasToEntityTable_() call — เขียนแค่ M_ALIAS
 *     - [UPDATE] createGlobalAlias(): ใช้สำหรับ Migration/Admin เท่านั้น (ไม่ใช่ auto pipeline)
 *   v5.4.000 (2026-05-23):
 *     - [ADD] Hybrid Alias Architecture: M_ALIAS ตารางกลาง + entity-specific cached views
 *     - [ADD] assignMasterUuidIfMissing(): ตรวจสอบและเพิ่ม master_uuid ให้ทุกแถวใน M_PERSON/M_PLACE
 *     - [ADD] MIGRATION_HybridAliasSystem(): ย้ายข้อมูลจาก M_PERSON_ALIAS/M_PLACE_ALIAS → M_ALIAS
 *     - [ADD] populateAliasFromSCGRawData_(): ดึงชื่อปลายทางจากชีต SCG ดิบ → M_ALIAS
 *     - [ADD] fastLookupByShipToName(): ค้นหาพิกัดจาก ShipToName เท่านั้น (Fast Track สำหรับ Daily Job)
 *     - [ADD] loadGlobalAliasesMap_() / loadGlobalAliasReverseIndex_(): Cached loaders
 *     - [ADD] resolveMasterUuidViaGlobalAlias(): Variant → masterUuid lookup
 *     - [ADD] UUID ↔ Entity ID converters (convertUuidToPersonId, etc.)
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config.gs          (SHEET.M_ALIAS, ALIAS_IDX.*, AI_CONFIG)
 *     - 02_Schema.gs          (SCHEMA[SHEET.M_ALIAS], SCHEMA[SHEET.M_PERSON], SCHEMA[SHEET.M_PLACE])
 *     - 03_SetupSheets.gs     (logInfo, logWarn, logError, logDebug)
 *     - 05_NormalizeService.gs (normalizeForCompare)
 *     - 14_Utils.gs           (generateShortId)
 *   CALLS (Invokes):
 *     - loadAllPersons_()                 → 06_PersonService.gs (UUID converters)
 *     - loadAllPlaces_()                  → 07_PlaceService.gs (UUID converters)
 *     - getDestsByPersonId()              → 09_DestinationService.gs (fastLookupByShipToName)
 *     - getDestsByPlaceId()               → 09_DestinationService.gs (fastLookupByShipToName)
 *   EXPORTS TO:
 *     - 06_PersonService.gs   (resolveMasterUuidViaGlobalAlias, convertUuidToPersonId)
 *     - 07_PlaceService.gs    (resolveMasterUuidViaGlobalAlias, convertUuidToPlaceId)
 *     - 10_MatchEngine.gs     (convertPersonIdToUuid — in legacy Migration code)
 *     - 17_SearchService.gs   (fastLookupByShipToName — Group 2 Fast Track)
 *   SHEETS ACCESSED:
 *     - SHEET.M_ALIAS         (Read+Write: Global alias table — ⚠️ Single Writer = autoEnrich)
 *     - SHEET.M_PERSON        (Read: UUID ↔ personId conversion)
 *     - SHEET.M_PLACE         (Read: UUID ↔ placeId conversion)
 *     - SHEET.M_PERSON_ALIAS  (Read: Migration source, dedup check)
 *     - SHEET.M_PLACE_ALIAS   (Read: Migration source, dedup check)
 *     - SHEET.SOURCE          (Read: SCG Raw data → populateAliasFromSCGRawData_)
 *     - SHEET.FACT_DELIVERY   (Read: populateAliasFromFactDelivery_)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  21_AliasService.gs (Hybrid Alias — Read Path + Migration)  │
 *   │  │                                                          │
 *   │  │  ⚠️ WRITE PATH: autoEnrichAliasesFromFactBatch_() ONLY   │
 *   │  │     (this file does NOT auto-write M_ALIAS in pipeline)  │
 *   │  │                                                          │
 *   │  ├── [Read Path — Group 2 Fast Track]                      │
 *   │  │   ├── fastLookupByShipToName()                           │
 *   │  │   │   └── M_ALIAS → masterUuid → entityId → dest → lat,lng│
 *   │  │   ├── loadGlobalAliasReverseIndex_() (variant → masterUuid)│
 *   │  │   └── resolveMasterUuidViaGlobalAlias() (Person/Place)   │
 *   │  │                                                          │
 *   │  ├── [Read Path — Group 1 Candidate Search]                │
 *   │  │   └── loadGlobalAliasesMap_() (uuid → variants[])        │
 *   │  │                                                          │
 *   │  ├── [Write Path — Migration/Admin ONLY]                   │
 *   │  │   ├── createGlobalAlias() — Append to M_ALIAS (no sync) │
 *   │  │   ├── MIGRATION_HybridAliasSystem() — 5-step migration  │
 *   │  │   ├── populateAliasFromSCGRawData_()                    │
 *   │  │   └── populateAliasFromFactDelivery_()                  │
 *   │  │                                                          │
 *   │  └── [Utilities]                                           │
 *   │      ├── UUID ↔ Entity ID converters (4 functions)         │
 *   │      ├── assignMasterUuidIfMissing()                       │
 *   │      └── generateUUID()                                    │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

// [ADD v5.4.003] Checkpoint Key สำหรับ Migration Resume
var MIGRATION_CHECKPOINT_KEY = 'MIGRATION_ALIAS_STEP';

// ============================================================
// SECTION 1: createGlobalAlias — สร้าง Alias ในตารางกลาง M_ALIAS
// ============================================================

/**
 * createGlobalAlias — สร้าง Alias ใน M_ALIAS (สำหรับ Migration/Admin เท่านั้น)
 * ⚠️ Auto Pipeline ใช้ autoEnrichAliasesFromFactBatch_() แทน — ไม่เรียกฟังก์ชันนี้
 * @param {string} masterUuid - UUID v4 ของ master entity
 * @param {string} variantName - ชื่อที่เขียนผิด/ย่อ/สกปรก
 * @param {string} entityType - 'PERSON' หรือ 'PLACE'
 * @param {number} confidence - 0-100
 * @param {string} source - 'AI'/'HUMAN'/'AUTO'/'MERGE'/'MIGRATION'/'SCG_RAW'
 * @return {string|null} aliasId หรือ null ถ้าซ้ำ
 */
function createGlobalAlias(masterUuid, variantName, entityType, confidence, source) {
  if (!masterUuid || !variantName || !entityType) return null;
  const cleanVariant = normalizeForCompare(variantName);
  if (!cleanVariant || cleanVariant.length < 2) return null;

  // ตรวจสอบ duplicate ใน RAM cache ก่อน (เร็วกว่าอ่านชีต)
  const existingMap = loadGlobalAliasesMap_();
  const uidKey = entityType + '_' + masterUuid;
  if (existingMap[uidKey] && existingMap[uidKey].includes(cleanVariant)) {
    return null; // มีอยู่แล้ว ข้าม
  }

  // เขียนลง M_ALIAS sheet
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_ALIAS);
  if (!sheet) return null;

  const aliasId = generateShortId('A');
  const now = new Date();
  sheet.appendRow([
    aliasId,
    masterUuid,
    variantName,           // เก็บชื่อดิบไว้ (ยังไม่ normalize)
    entityType,
    confidence || 100,
    source || 'MANUAL',
    now,
    true
  ]);

  // [REMOVED v5.4.001] ไม่เรียก syncAliasToEntityTable_() อีกต่อไป
  // เพื่อป้องกัน circular dependency (createGlobalAlias → sync → createPersonAlias → createGlobalAlias)
  // M_PERSON_ALIAS / M_PLACE_ALIAS เขียนที่ autoEnrichAliasesFromFactBatch_() เท่านั้น

  // ล้าง Cache เพื่อให้การค้นหาครั้งถัดไปเห็นข้อมูลใหม่
  CacheService.getScriptCache().remove('M_GLOBAL_ALIAS_ALL');
  CacheService.getScriptCache().remove('M_GLOBAL_ALIAS_REVERSE');

  logDebug('AliasService', `createGlobalAlias: ${aliasId} [${entityType}] "${variantName}" → ${masterUuid.substring(0, 8)}... (${source})`);
  return aliasId;
}

// ============================================================
// SECTION 2: loadGlobalAliasesMap_ — โหลดข้อมูล M_ALIAS ทั้งหมดเข้า RAM
// ============================================================

/**
 * loadGlobalAliasesMap_ — โหลด M_ALIAS เป็น Map: { "PERSON_uuid": ["variant1","variant2"] }
 * ใช้ CacheService เพื่อลดการอ่านชีต
 * @return {Object} aliasMap
 */
function loadGlobalAliasesMap_() {
  const cacheKey = 'M_GLOBAL_ALIAS_ALL';
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_ALIAS);
  const resultObj = {};

  if (!sheet || sheet.getLastRow() < 2) return resultObj;

  const schemaLen = SCHEMA[SHEET.M_ALIAS].length;
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, schemaLen).getValues();
  data.forEach(function(row) {
    if (row[ALIAS_IDX.ACTIVE_FLAG] !== true) return;
    var masterId = String(row[ALIAS_IDX.MASTER_UUID] || '');
    var eType = String(row[ALIAS_IDX.ENTITY_TYPE] || '');
    var cleanName = normalizeForCompare(row[ALIAS_IDX.VARIANT_NAME]);
    if (!masterId || !eType || !cleanName) return;

    var dictKey = eType + '_' + masterId;
    if (!resultObj[dictKey]) resultObj[dictKey] = [];
    resultObj[dictKey].push(cleanName);
  });

  try { cache.put(cacheKey, JSON.stringify(resultObj), AI_CONFIG.CACHE_TTL_SEC); } catch (e) {}
  return resultObj;
}

// ============================================================
// SECTION 3: loadGlobalAliasReverseIndex_ — ค้นหา variant → masterUuid
// ============================================================

/**
 * loadGlobalAliasReverseIndex_ — สร้าง reverse index: { "normalized_variant": [{masterUuid, entityType}] }
 * ใช้สำหรับค้นหาจาก ShipToName เท่านั้น (Fast Track)
 * @return {Object} reverseIndex
 */
function loadGlobalAliasReverseIndex_() {
  const cacheKey = 'M_GLOBAL_ALIAS_REVERSE';
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_ALIAS);
  const reverseIndex = {};

  if (!sheet || sheet.getLastRow() < 2) return reverseIndex;

  const schemaLen = SCHEMA[SHEET.M_ALIAS].length;
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, schemaLen).getValues();
  data.forEach(function(row) {
    if (row[ALIAS_IDX.ACTIVE_FLAG] !== true) return;
    var masterUuid = String(row[ALIAS_IDX.MASTER_UUID] || '');
    var eType = String(row[ALIAS_IDX.ENTITY_TYPE] || '');
    var cleanName = normalizeForCompare(row[ALIAS_IDX.VARIANT_NAME]);
    if (!masterUuid || !eType || !cleanName) return;

    if (!reverseIndex[cleanName]) reverseIndex[cleanName] = [];
    reverseIndex[cleanName].push({ masterUuid: masterUuid, entityType: eType });
  });

  try { cache.put(cacheKey, JSON.stringify(reverseIndex), AI_CONFIG.CACHE_TTL_SEC); } catch (e) {}
  return reverseIndex;
}

// ============================================================
// SECTION 4: resolveMasterUuidViaGlobalAlias — ค้นหาจาก variant name
// ============================================================

/**
 * resolveMasterUuidViaGlobalAlias — ค้นหา masterUuid จาก variant name
 * ใช้โดย findPersonCandidates() และ findPlaceCandidates()
 * @param {string} queryName - ชื่อที่ต้องการค้นหา
 * @param {string} entityType - 'PERSON' หรือ 'PLACE'
 * @return {Object|null} { masterUuid, score } หรือ null
 */
function resolveMasterUuidViaGlobalAlias(queryName, entityType) {
  var cleanQ = normalizeForCompare(queryName);
  if (!cleanQ || cleanQ.length < 2) return { masterUuid: null, score: 0 };

  var aliasesMap = loadGlobalAliasesMap_();
  var bestMatch = null;
  var bestScore = 0;

  for (var dictKey in aliasesMap) {
    if (!dictKey.startsWith(entityType + '_')) continue;
    var variants = aliasesMap[dictKey];

    for (var i = 0; i < variants.length; i++) {
      var v = variants[i];
      var score = 0;

      if (v === cleanQ) {
        score = 100; // Exact match
      } else if (v.length >= 4 && cleanQ.includes(v)) {
        score = 95; // Substring match
      } else if (cleanQ.length >= 4 && v.includes(cleanQ)) {
        score = 90; // Reverse substring match
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = dictKey.replace(entityType + '_', '');
      }
    }
    if (bestScore === 100) break; // พบ exact match แล้ว ไม่ต้องหาต่อ
  }

  return { masterUuid: bestMatch, score: bestScore };
}

// ============================================================
// SECTION 5: fastLookupByShipToName — Fast Track สำหรับ Daily Job
// ============================================================

/**
 * fastLookupByShipToName — ค้นหาพิกัดจาก ShipToName เท่านั้น (Fast Track)
 * ใช้สำหรับชีตตารางงานประจำวัน ที่ค้นหาด้วย ShipToName → M_ALIAS → masterUuid → destination → lat,lng
 * ไม่ต้องผ่าน resolvePerson หรือ resolvePlace ที่หนัก
 * @param {string} shipToName - ชื่อปลายทางจากคอลัมน์ ShipToName
 * @return {Object|null} { lat, lng, destId, status, confidence, reason } หรือ null
 */
function fastLookupByShipToName(shipToName) {
  if (!shipToName) return null;
  var cleanName = normalizeForCompare(shipToName);
  if (!cleanName || cleanName.length < 2) return null;

  // 1. ค้นหาจาก M_ALIAS reverse index (O(1) lookup)
  var reverseIndex = loadGlobalAliasReverseIndex_();
  var matches = reverseIndex[cleanName];

  if (!matches || matches.length === 0) {
    // 2. Fallback: ลองค้นหาแบบ substring
    for (var key in reverseIndex) {
      if (key.length >= 4 && (cleanName.includes(key) || key.includes(cleanName))) {
        matches = reverseIndex[key];
        break;
      }
    }
  }

  if (!matches || matches.length === 0) return null;

  // 3. แปลง masterUuid → entityId → destination → coordinates
  // ลองทุก match ที่เจอ เอาอันแรกที่มีพิกัด
  for (var i = 0; i < matches.length; i++) {
    var match = matches[i];
    var entityId = null;
    var dests = [];

    if (match.entityType === 'PERSON') {
      entityId = convertUuidToPersonId(match.masterUuid);
      if (entityId) {
        dests = getDestsByPersonId(entityId);
      }
    } else if (match.entityType === 'PLACE') {
      entityId = convertUuidToPlaceId(match.masterUuid);
      if (entityId) {
        dests = getDestsByPlaceId(entityId);
      }
    }

    if (dests.length > 0) {
      // Sort by usageCount descending
      dests.sort(function(a, b) { return (b.usageCount || 0) - (a.usageCount || 0); });
      var topDest = dests[0];
      return {
        lat: topDest.lat,
        lng: topDest.lng,
        destId: topDest.destId,
        status: 'FOUND_ALIAS_FAST',
        confidence: 90,
        reason: 'M_ALIAS Fast Track: ' + match.entityType + ' via "' + shipToName + '"'
      };
    }
  }

  return null;
}

// ============================================================
// SECTION 6: [REMOVED v5.4.001] syncAliasToEntityTable_ — ลบแล้ว
// ============================================================
// ไม่ต้อง sync จาก M_ALIAS → M_PERSON_ALIAS/M_PLACE_ALIAS อีกต่อไป
// เพราะทำให้เกิด circular dependency:
//   createGlobalAlias() → syncAliasToEntityTable_() → createPersonAlias() → createGlobalAlias()
//
// ตอนนี้ M_PERSON_ALIAS + M_PLACE_ALIAS เขียนที่ autoEnrichAliasesFromFactBatch_() เท่านั้น
// ============================================================

// ============================================================
// SECTION 7: UUID ↔ Entity ID Converters
// ============================================================

/**
 * convertUuidToPersonId — แปลง masterUuid → personId
 */
function convertUuidToPersonId(masterUuid) {
  if (!masterUuid) return null;
  var allPersons = loadAllPersons_();
  var hit = allPersons.find(function(p) { return p.masterUuid === masterUuid; });
  return hit ? hit.personId : null;
}

/**
 * convertUuidToPlaceId — แปลง masterUuid → placeId
 */
function convertUuidToPlaceId(masterUuid) {
  if (!masterUuid) return null;
  var allPlaces = loadAllPlaces_();
  var hit = allPlaces.find(function(p) { return p.masterUuid === masterUuid; });
  return hit ? hit.placeId : null;
}

/**
 * convertPersonIdToUuid — แปลง personId → masterUuid
 */
function convertPersonIdToUuid(personId) {
  if (!personId) return null;
  var allPersons = loadAllPersons_();
  var hit = allPersons.find(function(p) { return p.personId === personId; });
  return hit ? hit.masterUuid : null;
}

/**
 * convertPlaceIdToUuid — แปลง placeId → masterUuid
 */
function convertPlaceIdToUuid(placeId) {
  if (!placeId) return null;
  var allPlaces = loadAllPlaces_();
  var hit = allPlaces.find(function(p) { return p.placeId === placeId; });
  return hit ? hit.masterUuid : null;
}

// ============================================================
// SECTION 8: assignMasterUuidIfMissing — ตรวจสอบและเพิ่ม UUID ให้ทุก entity
// ============================================================

/**
 * assignMasterUuidIfMissing — ตรวจสอบว่าทุกแถวใน M_PERSON และ M_PLACE มี master_uuid แล้ว
 * ถ้ายังไม่มี → สร้าง UUID v4 ให้อัตโนมัติ
 * ควรรันหลังจาก setup sheets หรือก่อน migration
 */
function assignMasterUuidIfMissing() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var fixedTotal = 0;

  [SHEET.M_PERSON, SHEET.M_PLACE].forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;

    // หาตำแหน่งคอลัมน์ master_uuid จาก header
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var mUuidColIdx = headers.indexOf('master_uuid');
    if (mUuidColIdx === -1) {
      logWarn('AliasService', sheetName + ': ไม่พบคอลัมน์ master_uuid ใน header — ข้าม');
      return;
    }

    var lr = sheet.getLastRow();
    if (lr < 2) return;

    var uuidColRange = sheet.getRange(2, mUuidColIdx + 1, lr - 1, 1);
    var uidData = uuidColRange.getValues();
    var fixedCount = 0;

    for (var i = 0; i < uidData.length; i++) {
      if (!uidData[i][0]) {
        uidData[i][0] = Utilities.getUuid();
        fixedCount++;
      }
    }

    if (fixedCount > 0) {
      uuidColRange.setValues(uidData);
      logInfo('AliasService', sheetName + ': มอบ master_uuid ให้ ' + fixedCount + ' แถวที่ยังไม่มี');
    }
    fixedTotal += fixedCount;
  });

  // ล้าง Cache เพื่อให้ loader เห็นข้อมูลใหม่
  if (fixedTotal > 0) {
    invalidateAllGlobalCaches();
  }

  return fixedTotal;
}

// ============================================================
// SECTION 9: MIGRATION — ย้ายข้อมูลจาก Entity Alias → M_ALIAS
// ============================================================

// ============================================================
// SECTION 8: MIGRATION — ย้ายข้อมูลจาก Entity Alias → M_ALIAS
// [FIX BUG-A3] v5.4.003: var uuidFixed = 0 ก่อน if-block กัน undefined บน resume
// [FIX BUG-A2] v5.4.003: เพิ่ม try-catch ครอบ outer
// ============================================================

/**
 * MIGRATION_HybridAliasSystem — Entry Point (Menu)
 * รองรับ Checkpoint Resume + Time Guard
 */
function MIGRATION_HybridAliasSystem() {
  const ui = SpreadsheetApp.getUi();

  const confirmation = ui.alert(
    '🔄 Migration: Hybrid Alias System',
    'ระบบจะดำเนินการดังนี้:\n' +
    '1. ตรวจสอบและเพิ่ม master_uuid ให้ทุก entity ที่ยังไม่มี\n' +
    '2. ย้ายข้อมูลจาก M_PERSON_ALIAS → M_ALIAS\n' +
    '3. ย้ายข้อมูลจาก M_PLACE_ALIAS → M_ALIAS\n' +
    '4. ดึงชื่อปลายทางจากชีต SCG ดิบ → M_ALIAS\n\n' +
    '⚠️ มี Time Guard ป้องกัน Timeout (5 นาที)\n' +
    'หากข้อมูลเยอะ อาจต้องรันหลายครั้ง\n\n' +
    'พร้อมดำเนินการหรือไม่?',
    ui.ButtonSet.YES_NO
  );
  if (confirmation !== ui.Button.YES) return;

  // [FIX BUG-A2] try-catch ครอบ execution ทั้งหมด
  try {
    const state     = loadMigrationCheckpoint_();
    const ss        = SpreadsheetApp.getActiveSpreadsheet();
    const startTime = new Date();
    const timeLimit = AI_CONFIG.TIME_LIMIT_MS || (5 * 60 * 1000);
    let   timedOut  = false;

    // [FIX BUG-A3] ประกาศ uuidFixed ก่อน if-block กัน undefined บน Resume
    var uuidFixed = 0;

    // ─── Step 1: ตรวจสอบ master_uuid ───
    if (state.step <= 1) {
      logInfo('AliasService', 'Step 1: ตรวจสอบ master_uuid...');
      uuidFixed = assignMasterUuidIfMissing();  // ✅ assign เฉพาะ step นี้
      logInfo('AliasService', 'เพิ่ม master_uuid ให้ ' + uuidFixed + ' entities');
      CacheService.getScriptCache().removeAll(
        ['M_PERSON_ALL', 'M_PLACE_ALL', 'M_GLOBAL_ALIAS_ALL', 'M_GLOBAL_ALIAS_REVERSE']
      );
      saveMigrationCheckpoint_(2, 0);
    } else {
      logInfo('AliasService', 'Step 1: ข้าม (เสร็จแล้วจาก Checkpoint)');
      // uuidFixed คงเป็น 0 — แสดงว่า "ไม่ได้รัน step นี้ใน session นี้"
    }

    var migrateCount = 0;

    // ─── Step 2: ย้าย M_PERSON_ALIAS → M_ALIAS ───
    if (!timedOut && state.step <= 2) {
      logInfo('AliasService', 'Step 2: ย้าย M_PERSON_ALIAS → M_ALIAS...');
      const personAliasSheet = ss.getSheetByName(SHEET.M_PERSON_ALIAS);
      if (personAliasSheet && personAliasSheet.getLastRow() > 1) {
        const paData = personAliasSheet.getRange(
          2, 1, personAliasSheet.getLastRow() - 1, SCHEMA[SHEET.M_PERSON_ALIAS].length
        ).getValues();

        for (var paIdx = (state.step === 2 ? state.rowIndex : 0); paIdx < paData.length; paIdx++) {
          if (paIdx % 50 === 0 && (new Date() - startTime) > timeLimit) {
            saveMigrationCheckpoint_(2, paIdx);
            timedOut = true;
            logWarn('AliasService', 'Step 2 Time Guard: หยุดที่แถว ' + paIdx);
            break;
          }
          const r          = paData[paIdx];
          const personId   = String(r[PERSON_ALIAS_IDX.PERSON_ID]  || '').trim();
          const aliasName  = String(r[PERSON_ALIAS_IDX.ALIAS_NAME] || '').trim();
          const matchScore = Number(r[PERSON_ALIAS_IDX.MATCH_SCORE] || 100);
          if (!personId || !aliasName || !r[PERSON_ALIAS_IDX.ACTIVE_FLAG]) continue;
          const masterUuid = convertPersonIdToUuid(personId);
          if (masterUuid) {
            const result = createGlobalAlias(masterUuid, aliasName, 'PERSON', matchScore, 'V52_LEGACY_MIGRATION');
            if (result) migrateCount++;
          }
        }
      }
      if (!timedOut) saveMigrationCheckpoint_(3, 0);
    }

    // ─── Step 3: ย้าย M_PLACE_ALIAS → M_ALIAS ───
    if (!timedOut && state.step <= 3) {
      logInfo('AliasService', 'Step 3: ย้าย M_PLACE_ALIAS → M_ALIAS...');
      const placeAliasSheet = ss.getSheetByName(SHEET.M_PLACE_ALIAS);
      if (placeAliasSheet && placeAliasSheet.getLastRow() > 1) {
        const plData = placeAliasSheet.getRange(
          2, 1, placeAliasSheet.getLastRow() - 1, SCHEMA[SHEET.M_PLACE_ALIAS].length
        ).getValues();

        for (var plIdx = (state.step === 3 ? state.rowIndex : 0); plIdx < plData.length; plIdx++) {
          if (plIdx % 50 === 0 && (new Date() - startTime) > timeLimit) {
            saveMigrationCheckpoint_(3, plIdx);
            timedOut = true;
            logWarn('AliasService', 'Step 3 Time Guard: หยุดที่แถว ' + plIdx);
            break;
          }
          const r2         = plData[plIdx];
          const placeId    = String(r2[PLACE_ALIAS_IDX.PLACE_ID]   || '').trim();
          const aliasName2 = String(r2[PLACE_ALIAS_IDX.ALIAS_NAME] || '').trim();
          const matchScore2 = Number(r2[PLACE_ALIAS_IDX.MATCH_SCORE] || 100);
          if (!placeId || !aliasName2 || !r2[PLACE_ALIAS_IDX.ACTIVE_FLAG]) continue;
          const masterUuid2 = convertPlaceIdToUuid(placeId);
          if (masterUuid2) {
            const result2 = createGlobalAlias(masterUuid2, aliasName2, 'PLACE', matchScore2, 'V52_LEGACY_MIGRATION');
            if (result2) migrateCount++;
          }
        }
      }
      if (!timedOut) saveMigrationCheckpoint_(4, 0);
    }

    // ─── Step 4: ดึงจาก SCG ดิบ ───
    var scgCount = 0;
    if (!timedOut && state.step <= 4) {
      if ((new Date() - startTime) > timeLimit) {
        saveMigrationCheckpoint_(4, 0);
        timedOut = true;
      } else {
        logInfo('AliasService', 'Step 4: ดึงชื่อจากชีต SCG ดิบ → M_ALIAS...');
        scgCount = populateAliasFromSCGRawData_();
        saveMigrationCheckpoint_(5, 0);
      }
    }

    // ─── Step 5: ดึงจาก FACT ───
    var factCount = 0;
    if (!timedOut && state.step <= 5) {
      if ((new Date() - startTime) > timeLimit) {
        saveMigrationCheckpoint_(5, 0);
        timedOut = true;
      } else {
        logInfo('AliasService', 'Step 5: ดึงชื่อจาก FACT_DELIVERY → M_ALIAS...');
        factCount = populateAliasFromFactDelivery_();
      }
    }

    const elapsedSec   = Math.round((new Date() - startTime) / 1000);
    const totalMigrated = migrateCount + scgCount + factCount;

    if (!timedOut) clearMigrationCheckpoint_();

    logInfo('AliasService',
      'Migration: UUID=' + uuidFixed +
      ' PersonAlias→M_ALIAS=' + migrateCount +
      ' SCG→M_ALIAS=' + scgCount +
      ' FACT→M_ALIAS=' + factCount +
      ' รวม=' + totalMigrated +
      (timedOut ? ' ⚠️ TIMEOUT' : '') +
      ' (' + elapsedSec + 's)'
    );

    const uuidLabel = (state.step <= 1)
      ? ('• เพิ่ม master_uuid: ' + uuidFixed + ' รายการ\n')
      : '• master_uuid: ข้าม (Checkpoint Resume)\n';  // [FIX BUG-A3]

    ui.alert(
      (timedOut ? '⚠️ Migration หยุดกลางคัน (Timeout)!\n\n' : '✅ Migration เสร็จสิ้น!\n\n') +
      uuidLabel +
      '• PersonAlias → M_ALIAS: ' + migrateCount + ' รายการ\n' +
      '• SCG Raw → M_ALIAS: ' + scgCount + ' รายการ\n' +
      '• FACT → M_ALIAS: ' + factCount + ' รายการ\n' +
      '• รวมทั้งหมด: ' + totalMigrated + ' รายการ\n' +
      '• ใช้เวลา: ' + elapsedSec + ' วินาที' +
      (timedOut ? '\n\n💡 รัน Migration อีกครั้งเพื่อดำเนินการต่อ' : '')
    );

  } catch (err) {
    logError('AliasService', 'MIGRATION_HybridAliasSystem: ' + err.message, err);
    ui.alert('❌ Migration ล้มเหลว: ' + err.message);
  }
}

// ============================================================
// SECTION 9: populateAliasFromSCGRawData_
// [FIX BUG-B1] v5.4.003: Batch pattern — ลบ createGlobalAlias() ออกจาก loop
//              O(N²) → O(N): load dedup set ครั้งเดียว + batch setValues
// [FIX BUG-B3] v5.4.003: เพิ่ม Time Guard ทุก 100 records
// ============================================================

/**
 * populateAliasFromSCGRawData_ — ดึงชื่อจากชีต SCG ดิบ → M_ALIAS (Batch)
 * ⚠️ ไม่เรียก createGlobalAlias() ใน loop — เขียน batch ตรงแทน
 * @return {number} จำนวน alias ใหม่
 */
function populateAliasFromSCGRawData_() {
  const ss          = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName(SHEET.SOURCE);
  if (!sourceSheet || sourceSheet.getLastRow() < 2) {
    logWarn('AliasService', 'populateAliasFromSCGRawData_: ชีต SOURCE ว่าง');
    return 0;
  }

  // [FIX BUG-B3] Time Guard
  const startTime = new Date();
  const timeLimit = AI_CONFIG.TIME_LIMIT_MS || (5 * 60 * 1000);

  const schemaLen = SRC_READ_COLS || 37;
  const srcData   = sourceSheet.getRange(2, 1, sourceSheet.getLastRow() - 1, schemaLen).getValues();

  // ─── 1. รวบชื่อไม่ซ้ำจาก Source ───
  const nameCount = {};
  srcData.forEach(function(r) {
    const rawName = String(r[SRC_IDX.RAW_PERSON_NAME] || '').trim();
    if (!rawName || rawName.length < 2) return;
    const normKey = normalizeForCompare(rawName);
    if (!normKey || normKey.length < 2) return;
    if (!nameCount[normKey]) nameCount[normKey] = { rawName: rawName, count: 0 };
    nameCount[normKey].count++;
  });

  // ─── 2. โหลด Person/Place map (UUID lookup) ───
  const allPersons    = loadAllPersons_();
  const allPlaces     = loadAllPlaces_();
  const personNormMap = {};
  const placeNormMap  = {};
  allPersons.forEach(function(p) { if (p.normalized && p.masterUuid) personNormMap[p.normalized] = p.masterUuid; });
  allPlaces.forEach(function(p)  { if (p.normalized && p.masterUuid) placeNormMap[p.normalized]  = p.masterUuid; });

  // ─── 3. [FIX BUG-B1] โหลด dedup set ครั้งเดียว (แทน loadGlobalAliasesMap_ ใน loop) ───
  const mAliasSheet    = ss.getSheetByName(SHEET.M_ALIAS);
  const existingAliasSet = new Set();
  if (mAliasSheet && mAliasSheet.getLastRow() > 1) {
    const existingData = mAliasSheet.getRange(
      2, 1, mAliasSheet.getLastRow() - 1, SCHEMA[SHEET.M_ALIAS].length
    ).getValues();
    existingData.forEach(function(row) {
      if (row[ALIAS_IDX.ACTIVE_FLAG] !== true) return;
      const k = String(row[ALIAS_IDX.ENTITY_TYPE] || '') + '::' +
                String(row[ALIAS_IDX.MASTER_UUID]  || '') + '::' +
                normalizeForCompare(row[ALIAS_IDX.VARIANT_NAME]);
      if (k.length > 5) existingAliasSet.add(k);
    });
  }

  // ─── 4. Build new rows (pure memory ops) ───
  const newRows   = [];
  const now       = new Date();
  let   processed = 0;

  for (const normKey in nameCount) {
    // [FIX BUG-B3] Time Guard ทุก 100 records
    if (processed % 100 === 0 && processed > 0 && (new Date() - startTime) > timeLimit) {
      logWarn('AliasService', 'populateAliasFromSCGRawData_: Time Guard หยุดที่ ' + processed);
      break;
    }
    processed++;

    const rawName = nameCount[normKey].rawName;

    // หา UUID: ลอง Person ก่อน → Place → substring fallback
    let matchedUuid = personNormMap[normKey];
    let matchedType = 'PERSON';
    if (!matchedUuid) {
      matchedUuid = placeNormMap[normKey];
      matchedType = 'PLACE';
    }
    if (!matchedUuid) {
      for (const pNorm in personNormMap) {
        if (pNorm.length >= 4 && (normKey.includes(pNorm) || pNorm.includes(normKey))) {
          matchedUuid = personNormMap[pNorm]; matchedType = 'PERSON'; break;
        }
      }
    }
    if (!matchedUuid) {
      for (const plNorm in placeNormMap) {
        if (plNorm.length >= 4 && (normKey.includes(plNorm) || plNorm.includes(normKey))) {
          matchedUuid = placeNormMap[plNorm]; matchedType = 'PLACE'; break;
        }
      }
    }

    if (!matchedUuid) continue;

    const dedupKey = matchedType + '::' + matchedUuid + '::' + normKey;
    if (existingAliasSet.has(dedupKey)) continue;
    existingAliasSet.add(dedupKey); // update in-memory กัน dup ในรอบเดียวกัน
    newRows.push([generateShortId('A'), matchedUuid, rawName, matchedType, 90, 'SCG_RAW_IMPORT', now, true]);
  }

  // ─── 5. [FIX BUG-B1] Batch write ครั้งเดียว ───
  if (newRows.length > 0 && mAliasSheet) {
    mAliasSheet.getRange(
      mAliasSheet.getLastRow() + 1, 1, newRows.length, SCHEMA[SHEET.M_ALIAS].length
    ).setValues(newRows);
    CacheService.getScriptCache().removeAll(['M_GLOBAL_ALIAS_ALL', 'M_GLOBAL_ALIAS_REVERSE']);
  }

  logInfo('AliasService',
    'populateAliasFromSCGRawData_: ตรวจ ' + Object.keys(nameCount).length +
    ' ชื่อ → สร้าง ' + newRows.length + ' alias ใหม่ (' + processed + ' processed)'
  );
  return newRows.length;
}

// ============================================================
// SECTION 10: populateAliasFromFactDelivery_
// [FIX BUG-B1] v5.4.003: Batch pattern เหมือน Section 9
// [FIX BUG-B3] v5.4.003: เพิ่ม Time Guard
// ============================================================

/**
 * populateAliasFromFactDelivery_ — ดึงชื่อจาก FACT → M_ALIAS (Batch)
 * @return {number} จำนวน alias ใหม่
 */
function populateAliasFromFactDelivery_() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const factSheet = ss.getSheetByName(SHEET.FACT_DELIVERY);
  if (!factSheet || factSheet.getLastRow() < 2) return 0;

  // [FIX BUG-B3] Time Guard
  const startTime = new Date();
  const timeLimit = AI_CONFIG.TIME_LIMIT_MS || (5 * 60 * 1000);

  const factData = factSheet.getRange(
    2, 1, factSheet.getLastRow() - 1, SCHEMA[SHEET.FACT_DELIVERY].length
  ).getValues();

  // ─── 1. รวบชื่อไม่ซ้ำ + FK จาก FACT ───
  const nameMap = {};
  factData.forEach(function(r) {
    const rawName  = String(r[FACT_IDX.SHIP_TO_NAME] || '').trim();
    const personId = String(r[FACT_IDX.PERSON_ID]    || '').trim();
    const placeId  = String(r[FACT_IDX.PLACE_ID]     || '').trim();
    if (!rawName || rawName.length < 2) return;
    const normKey = normalizeForCompare(rawName);
    if (!normKey || normKey.length < 2) return;
    if (!nameMap[normKey]) nameMap[normKey] = { rawName: rawName, personId: personId, placeId: placeId };
  });

  // ─── 2. โหลด dedup set ครั้งเดียว ───
  const mAliasSheet      = ss.getSheetByName(SHEET.M_ALIAS);
  const existingAliasSet = new Set();
  if (mAliasSheet && mAliasSheet.getLastRow() > 1) {
    const existingData = mAliasSheet.getRange(
      2, 1, mAliasSheet.getLastRow() - 1, SCHEMA[SHEET.M_ALIAS].length
    ).getValues();
    existingData.forEach(function(row) {
      if (row[ALIAS_IDX.ACTIVE_FLAG] !== true) return;
      const k = String(row[ALIAS_IDX.ENTITY_TYPE] || '') + '::' +
                String(row[ALIAS_IDX.MASTER_UUID]  || '') + '::' +
                normalizeForCompare(row[ALIAS_IDX.VARIANT_NAME]);
      if (k.length > 5) existingAliasSet.add(k);
    });
  }

  // ─── 3. Build new rows ───
  const newRows   = [];
  const now       = new Date();
  let   processed = 0;

  for (const normKey in nameMap) {
    // [FIX BUG-B3] Time Guard ทุก 100 records
    if (processed % 100 === 0 && processed > 0 && (new Date() - startTime) > timeLimit) {
      logWarn('AliasService', 'populateAliasFromFactDelivery_: Time Guard หยุดที่ ' + processed);
      break;
    }
    processed++;

    const info     = nameMap[normKey];
    let   matchedUuid = null;
    let   matchedType = 'PERSON';

    if (info.personId) {
      matchedUuid = convertPersonIdToUuid(info.personId);
      matchedType = 'PERSON';
    }
    if (!matchedUuid && info.placeId) {
      matchedUuid = convertPlaceIdToUuid(info.placeId);
      matchedType = 'PLACE';
    }
    if (!matchedUuid) continue;

    const dedupKey = matchedType + '::' + matchedUuid + '::' + normKey;
    if (existingAliasSet.has(dedupKey)) continue;
    existingAliasSet.add(dedupKey);
    newRows.push([generateShortId('A'), matchedUuid, info.rawName, matchedType, 95, 'FACT_DELIVERY_IMPORT', now, true]);
  }

  // ─── 4. Batch write ครั้งเดียว ───
  if (newRows.length > 0 && mAliasSheet) {
    mAliasSheet.getRange(
      mAliasSheet.getLastRow() + 1, 1, newRows.length, SCHEMA[SHEET.M_ALIAS].length
    ).setValues(newRows);
    CacheService.getScriptCache().removeAll(['M_GLOBAL_ALIAS_ALL', 'M_GLOBAL_ALIAS_REVERSE']);
  }

  logInfo('AliasService',
    'populateAliasFromFactDelivery_: ตรวจ ' + Object.keys(nameMap).length +
    ' ชื่อ → สร้าง ' + newRows.length + ' alias ใหม่'
  );
  return newRows.length;
}

// ============================================================
// SECTION 12: generateUUID — สร้าง UUID v4
// ============================================================

/**
 * generateUUID — สร้าง UUID v4 สำหรับ master_uuid
 * (เรียกจาก createPerson/createPlace ใน 06/07)
 */
function generateUUID() {
  return Utilities.getUuid();
}

// ============================================================
// SECTION 13: Migration Checkpoint Helpers
// [ADD v5.4.003] เพิ่ม Checkpoint สำหรับ Resume Migration
// ============================================================

/**
 * saveMigrationCheckpoint_ — บันทึกตำแหน่ง Migration ปัจจุบัน
 * [ADD v5.4.003] เพิ่ม Checkpoint สำหรับ Resume Migration
 */
function saveMigrationCheckpoint_(step, rowIndex) {
  PropertiesService.getScriptProperties().setProperty(
    MIGRATION_CHECKPOINT_KEY,
    JSON.stringify({ step: step, rowIndex: rowIndex })
  );
}

/**
 * loadMigrationCheckpoint_ — โหลดตำแหน่ง Migration ที่บันทึกไว้
 */
function loadMigrationCheckpoint_() {
  var raw = PropertiesService.getScriptProperties()
    .getProperty(MIGRATION_CHECKPOINT_KEY);
  if (raw) { try { return JSON.parse(raw); } catch(e) {} }
  return { step: 1, rowIndex: 0 };
}

/**
 * clearMigrationCheckpoint_ — ลบ Checkpoint หลัง Migration เสร็จ
 */
function clearMigrationCheckpoint_() {
  PropertiesService.getScriptProperties()
    .deleteProperty(MIGRATION_CHECKPOINT_KEY);
}
