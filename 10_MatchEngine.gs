/**
 * VERSION: 5.4.001
 * FILE: 10_MatchEngine.gs
 * LMDS V5.4 — Core Match & Resolution Engine
 * ===================================================
 * PURPOSE:
 *   ประมวลผลข้อมูลต้นทาง → จับคู่ Person/Place/Geo → ตัดสินใจ → บันทึกผล
 *   เป็นหัวใจหลักของ Pipeline และเป็น Single Writer สำหรับ M_ALIAS
 * ===================================================
 * CHANGELOG:
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [REWRITE] autoEnrichAliasesFromFactBatch_: จุดเขียนเดียวสำหรับ M_ALIAS
 *       ❌ ไม่เรียก createGlobalAlias() / syncAliasToEntityTable_() อีกต่อไป
 *       ✅ เขียน Batch ตรงทั้ง 3 ชีต: M_ALIAS + M_PERSON_ALIAS + M_PLACE_ALIAS
 *       ✅ รวม Canonical Name เข้า M_ALIAS (เดิมข้าม → ทำให้ Group 2 ค้นไม่เจอ)
 *       ✅ รองรับ PLACE aliases จาก SHIP_TO_ADDR (เดิมทำแค่ PERSON)
 *   v5.4.000 (2026-05-23):
 *     - [ADD] autoEnrichAliasesFromFactBatch_: เขียน alias เข้า M_ALIAS (Hybrid Architecture)
 *   v5.2.013:
 *     - [FIX] executeDecision: ส่ง placeId แทน decision.placeId (undefined) ไปยัง createGeoPoint
 *   v5.2.010:
 *     - [ADD] autoEnrichAliasesFromFactBatch_: สร้าง Alias อัตโนมัติจาก FACT แบบ Real-time
 *   v5.2.007:
 *     - [FIX] ลบ Checkpoint Index — เริ่มจาก 0 เสมอ ป้องกัน Array หดทำให้ตำแหน่งชี้ผิด
 *   v5.2.003:
 *     - [ADD] Auto-Trigger System สำหรับ Resume เมื่อ Timeout
 *   v5.2.001:
 *     - [ADD] flushBatches_ — Internal helper for transaction writing
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config.gs          (SHEET.*, FACT_IDX.*, ALIAS_IDX.*, AI_CONFIG)
 *     - 02_Schema.gs          (SCHEMA definitions)
 *     - 03_SetupSheets.gs     (logInfo, logWarn, logError)
 *     - 05_NormalizeService.gs (normalizeForCompare)
 *     - 14_Utils.gs           (generateShortId)
 *   CALLS (Invokes):
 *     - resolvePerson()                    → 06_PersonService.gs
 *     - resolvePlace()                     → 07_PlaceService.gs
 *     - resolveGeo()                       → 08_GeoService.gs
 *     - createPerson()                     → 06_PersonService.gs
 *     - createPlace()                      → 07_PlaceService.gs
 *     - createGeoPoint()                   → 08_GeoService.gs
 *     - resolveDestination() / createDestination() → 09_DestinationService.gs
 *     - upsertFactDelivery()               → 11_TransactionService.gs
 *     - enqueueReview()                    → 12_ReviewService.gs
 *     - loadAllPersons_()                  → 06_PersonService.gs
 *     - loadAllPlaces_()                   → 07_PlaceService.gs
 *     - loadAllAliases_()                  → 06_PersonService.gs
 *     - loadAllPlaceAliases_()             → 07_PlaceService.gs
 *   EXPORTS TO:
 *     - 00_App.gs             (runMatchEngine — Pipeline menu)
 *   SHEETS ACCESSED (Read + Write):
 *     - SHEET.FACT_DELIVERY   (Read: FACT_IDX, Write: batch append)
 *     - SHEET.Q_REVIEW        (Write: batch append with color)
 *     - SHEET.M_ALIAS         (Write: Single Writer — PERSON canonical/variant + PLACE canonical/variant)
 *     - SHEET.M_PERSON_ALIAS  (Write: variant names only)
 *     - SHEET.M_PLACE_ALIAS   (Write: variant addresses only)
 *   ⚠️ SINGLE WRITER RULE:
 *     - M_ALIAS ถูกเขียนที่นี่เท่านั้น (autoEnrichAliasesFromFactBatch_)
 *     - ห้ามเรียก createGlobalAlias() ใน auto pipeline
 *     - createGlobalAlias() ใช้สำหรับ Migration/Admin เท่านั้น
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  10_MatchEngine.gs (Pipeline Core + M_ALIAS Single Writer)  │
 *   │  ├── runMatchEngine()       — Main entry (Lock + Time Guard)│
 *   │  ├── processOneRow()        — Resolve → Decide → Execute    │
 *   │  ├── makeMatchDecision()    — 8 Rules (INVALID→FULL_MATCH)  │
 *   │  ├── executeDecision()      — AUTO_MATCH / CREATE_NEW / REVIEW│
 *   │  ├── flushBatches_()        — Transaction write (FACT+Alias) │
 *   │  │   └── autoEnrichAliasesFromFactBatch_()  ← SINGLE WRITER │
 *   │  │       ├── M_ALIAS (PERSON canon+variant, PLACE canon+var)│
 *   │  │       ├── M_PERSON_ALIAS (variant ≠ canonical only)      │
 *   │  │       └── M_PLACE_ALIAS  (variant ≠ canonical only)      │
 *   │  └── Auto-Resume (installAutoResume_ / removeAutoResume_)   │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: runMatchEngine
// ============================================================

function runMatchEngine() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(APP_CONST.LOCK_TIMEOUT_MS);
  } catch (e) {
    logWarn('MatchEngine', 'ไม่สามารถ Lock ได้ — อาจมีการรันซ้อน');
    return;
  }

  const startTime = new Date();
  const timeLimit = AI_CONFIG.TIME_LIMIT_MS || (5 * 60 * 1000);
  let processed = 0, autoMatched = 0, created = 0, queued = 0, errorCount = 0;

  let factBatch     = [];
  let reviewBatch   = [];
  let successRows   = []; // Rows to mark SUCCESS
  let failedRows    = []; // Rows to mark ERROR

  try {
    logInfo('MatchEngine', 'เริ่ม Match Engine');

    // [FIX v5.2.007] ลบ Checkpoint Index — เริ่มจาก 0 เสมอ
    // เหตุผล: getAllSourceRows() กรอง SUCCESS ออกอยู่แล้ว
    //   ดังนั้น Array ที่ได้จะมีเฉพาะแถวที่ยังไม่ได้ทำ
    //   Checkpoint เดิมเก็บ "ตำแหน่ง" ใน Array แต่ Array หดเล็กลงทุกรอบ
    //   ทำให้ตำแหน่งชี้ผิด → ข้อมูลถูกข้ามไป (BUG)
    clearCheckpoint_();  // ล้าง checkpoint เก่าที่ค้างอยู่
    const startIndex = 0;
    const pendingRows = getUnprocessedRows();

    if (pendingRows.length === 0) {
      logInfo('MatchEngine', 'ไม่มีแถวที่ต้องประมวลผล');
      removeAutoResume_();  // ลบ trigger ที่ค้างอยู่ด้วย
      return;
    }

    logInfo('MatchEngine', `ประมวลผล ${pendingRows.length} แถว (เริ่มจาก index ${startIndex})`);

    for (let i = startIndex; i < pendingRows.length; i++) {
      if (new Date() - startTime > timeLimit) {
        logWarn('MatchEngine', `Time Guard: หยุดที่แถว ${i}/${pendingRows.length} (ติดตั้ง Auto-Trigger)`);
        // [FIX v5.2.007] ไม่บันทึก checkpoint อีกต่อไป — SYNC_STATUS ทำหน้าที่แทน
        installAutoResume_('runMatchEngine');
        break;
      }
      
      const srcObj = pendingRows[i];
      try {
        const result = processOneRow(srcObj);
        processed++;
        
        if (result.action === 'AUTO_MATCH')  autoMatched++;
        if (result.action === 'CREATE_NEW')  created++;
        if (result.action === 'REVIEW')      queued++;

        if (result.factData)   factBatch.push(result.factData);
        if (result.reviewData) reviewBatch.push(result.reviewData);
        
        successRows.push(srcObj);

      } catch (rowErr) {
        errorCount++;
        failedRows.push(srcObj);
        logError('MatchEngine', `แถว ${srcObj.sourceRow} (Invoice: ${srcObj.invoiceNo}): ${rowErr.message}`);
      }

      // Batch Write & Sync Status every BATCH_SIZE
      if (processed % AI_CONFIG.BATCH_SIZE === 0 && processed > 0) {
        flushBatches_(factBatch, reviewBatch, successRows, failedRows);
        factBatch = []; reviewBatch = []; successRows = []; failedRows = [];
      }
    }

    // Final Flush
    flushBatches_(factBatch, reviewBatch, successRows, failedRows);

    // [FIX v5.2.007] ถ้าประมวลผลครบทุกแถว → ลบ Auto-Trigger
    if (processed + errorCount >= pendingRows.length) {
      removeAutoResume_();
    }

    const elapsedSec = Math.round((new Date() - startTime) / 1000);
    logInfo('MatchEngine',
      `เสร็จสิ้น — รัน:${processed} Match:${autoMatched} ` +
      `สร้างใหม่:${created} Review:${queued} Error:${errorCount} (${elapsedSec}s)`);

  } catch (err) {
    logError('MatchEngine', `runMatchEngine ล้มเหลว: ${err.message}`);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

/**
 * [NEW v5.2.001] flushBatches_ — Internal helper for transaction writing
 */
function flushBatches_(factBatch, reviewBatch, successRows, failedRows) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (factBatch.length > 0) {
    const factSheet = ss.getSheetByName(SHEET.FACT_DELIVERY);
    factSheet.getRange(factSheet.getLastRow() + 1, 1, factBatch.length, factBatch[0].length).setValues(factBatch);
    // [UPGRADE v5.2.010] สร้าง Alias อัตโนมัติแบบ Real-time ทันทีที่บันทึก FACT สำเร็จ
    // [FIX v5.4.001] ห่อด้วย try-catch เพื่อป้องกัน alias error ทำให้ SYNC_STATUS ไม่ถูกอัปเดต
    try {
      autoEnrichAliasesFromFactBatch_(factBatch);
    } catch (aliasErr) {
      logError('MatchEngine', 'autoEnrichAliases ล้มเหลว (ไม่มีผลต่อ FACT): ' + aliasErr.message);
    }
  }

  if (reviewBatch.length > 0) {
    const reviewSheet = ss.getSheetByName(SHEET.Q_REVIEW);
    const startRow = reviewSheet.getLastRow() + 1;
    const numCols = reviewBatch[0].length;
    reviewSheet.getRange(startRow, 1, reviewBatch.length, numCols).setValues(reviewBatch);

    // [UPGRADE v5.2.005] ระบายสีแถว Q_REVIEW ตาม issue_type
    const backgrounds = reviewBatch.map(row => {
      const issueType = String(row[REVIEW_IDX.ISSUE_TYPE] || '').trim();
      let color = null; // null คือล้างสี / ปล่อยเป็นสีตั้งต้น
      if (issueType === 'GEO_NEARBY_YELLOW') color = '#fff2cc';
      else if (issueType === 'GEO_NEARBY_ORANGE') color = '#fce5cd';
      return new Array(numCols).fill(color);
    });
    reviewSheet.getRange(startRow, 1, reviewBatch.length, numCols).setBackgrounds(backgrounds);
  }

  if (successRows.length > 0) {
    updateSyncStatus_(successRows, 'SUCCESS');
  }

  if (failedRows.length > 0) {
    updateSyncStatus_(failedRows, 'ERROR');
  }
}

/**
 * autoEnrichAliasesFromFactBatch_ — [REWRITE v5.4.001] Single Writer Pattern
 * ============================================================
 * 🟩 จุดเขียนเดียวสำหรับ M_ALIAS — ทุก alias เกิดที่นี่เท่านั้น
 * ============================================================
 * เขียน 3 ชีตพร้อมกัน:
 *   1. M_ALIAS (Global) — PERSON canonical(100) + variant(95), PLACE canonical(100) + variant(90)
 *   2. M_PERSON_ALIAS  — variant name (ถ้า ≠ canonical)
 *   3. M_PLACE_ALIAS   — variant address (ถ้า ≠ canonical)
 *
 * ❌ ไม่เรียก createGlobalAlias() / syncAliasToEntityTable_()
 * ❌ ไม่เรียก createPersonAlias() / createPlaceAlias()
 * ✅ เขียน Batch ตรงทั้ง 3 ชีตเอง — เร็ว + ไม่มี circular dependency
 * ✅ รวม Canonical Name เข้า M_ALIAS ด้วย (เดิมข้าม → ทำให้ค้นไม่เจอ)
 */
function autoEnrichAliasesFromFactBatch_(factBatch) {
  if (!factBatch || factBatch.length === 0) return;

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // === 1. โหลดข้อมูลอ้างอิง ===

  // Person map: personId → { canonical, normalized, masterUuid }
  var allPersons = loadAllPersons_();
  var personMap = {};
  allPersons.forEach(function(p) {
    if (p.personId && p.masterUuid) {
      personMap[p.personId] = {
        canonical:  p.canonical,
        normalized: p.normalized,
        masterUuid: p.masterUuid
      };
    }
  });

  // Place map: placeId → { canonical, normalized, masterUuid }
  var allPlaces = loadAllPlaces_();
  var placeMap = {};
  allPlaces.forEach(function(p) {
    if (p.placeId && p.masterUuid) {
      placeMap[p.placeId] = {
        canonical:  p.canonical,
        normalized: p.normalized,
        masterUuid: p.masterUuid
      };
    }
  });

  // === 2. โหลด Alias ที่มีอยู่แล้ว เพื่อ Dedup ===

  // M_PERSON_ALIAS dedup: "personId::normalized"
  var existingPersonAliasSet = new Set();
  var existingPersonAliasData = loadAllAliases_();
  existingPersonAliasData.forEach(function(r) {
    if (!r[PERSON_ALIAS_IDX.ACTIVE_FLAG]) return;
    var pId  = String(r[PERSON_ALIAS_IDX.PERSON_ID] || '').trim();
    var aNorm = normalizeForCompare(r[PERSON_ALIAS_IDX.ALIAS_NAME]);
    if (pId && aNorm) existingPersonAliasSet.add(pId + '::' + aNorm);
  });

  // M_PLACE_ALIAS dedup: "placeId::normalized"
  var existingPlaceAliasSet = new Set();
  var existingPlaceAliasData = loadAllPlaceAliases_();
  existingPlaceAliasData.forEach(function(r) {
    if (!r[PLACE_ALIAS_IDX.ACTIVE_FLAG]) return;
    var plId  = String(r[PLACE_ALIAS_IDX.PLACE_ID] || '').trim();
    var aNorm = normalizeForCompare(r[PLACE_ALIAS_IDX.ALIAS_NAME]);
    if (plId && aNorm) existingPlaceAliasSet.add(plId + '::' + aNorm);
  });

  // M_ALIAS dedup: "ENTITY_TYPE::masterUuid::normalized"
  var existingGlobalAliasSet = new Set();
  var mAliasSheet = ss.getSheetByName(SHEET.M_ALIAS);
  if (mAliasSheet && mAliasSheet.getLastRow() > 1) {
    var aliasData = mAliasSheet.getRange(2, 1, mAliasSheet.getLastRow() - 1, SCHEMA[SHEET.M_ALIAS].length).getValues();
    aliasData.forEach(function(row) {
      if (row[ALIAS_IDX.ACTIVE_FLAG] !== true) return;
      var eType = String(row[ALIAS_IDX.ENTITY_TYPE] || '');
      var mUuid = String(row[ALIAS_IDX.MASTER_UUID] || '');
      var norm  = normalizeForCompare(row[ALIAS_IDX.VARIANT_NAME]);
      if (eType && mUuid && norm) {
        existingGlobalAliasSet.add(eType + '::' + mUuid + '::' + norm);
      }
    });
  }

  // === 3. สะสมแถวใหม่ ===

  var newGlobalAliasRows  = [];  // M_ALIAS
  var newPersonAliasRows  = [];  // M_PERSON_ALIAS
  var newPlaceAliasRows   = [];  // M_PLACE_ALIAS
  var now = new Date();

  factBatch.forEach(function(r) {
    var pId           = String(r[FACT_IDX.PERSON_ID]    || '').trim();
    var plId          = String(r[FACT_IDX.PLACE_ID]      || '').trim();
    var rawPersonName = String(r[FACT_IDX.SHIP_TO_NAME]  || '').trim();
    var rawPlaceAddr  = String(r[FACT_IDX.SHIP_TO_ADDR]  || '').trim();

    // ─── PERSON: Canonical + Variant ───

    if (pId && personMap[pId]) {
      var pInfo        = personMap[pId];
      var masterUuid   = pInfo.masterUuid;
      var canonicalNorm = pInfo.normalized;

      // 3a. Canonical Name → M_ALIAS (confidence 100, ต้องมีเพื่อให้ค้นเจอ)
      if (canonicalNorm && canonicalNorm.length >= 2) {
        var canonKey = 'PERSON::' + masterUuid + '::' + canonicalNorm;
        if (!existingGlobalAliasSet.has(canonKey)) {
          existingGlobalAliasSet.add(canonKey);
          newGlobalAliasRows.push([
            generateShortId('A'),    // alias_id
            masterUuid,              // master_uuid
            pInfo.canonical,         // variant_name (ชื่อสะอาด)
            'PERSON',                // entity_type
            100,                     // confidence
            'AUTO_ENRICH_FACT',      // source
            now,                     // created_at
            true                     // active_flag
          ]);
        }
      }

      // 3b. Variant Name (ShipToName) → M_ALIAS + M_PERSON_ALIAS
      if (rawPersonName && rawPersonName.length >= 2) {
        var rawNorm = normalizeForCompare(rawPersonName);
        if (rawNorm && rawNorm.length >= 2) {

          // M_ALIAS variant
          var variantKey = 'PERSON::' + masterUuid + '::' + rawNorm;
          if (!existingGlobalAliasSet.has(variantKey)) {
            existingGlobalAliasSet.add(variantKey);
            newGlobalAliasRows.push([
              generateShortId('A'),
              masterUuid,
              rawPersonName,           // ชื่อดิบที่ยังไม่สะอาด
              'PERSON',
              95,
              'AUTO_ENRICH_FACT',
              now,
              true
            ]);
          }

          // M_PERSON_ALIAS (เฉพาะ variant ≠ canonical)
          if (rawNorm !== canonicalNorm) {
            var paKey = pId + '::' + rawNorm;
            if (!existingPersonAliasSet.has(paKey)) {
              existingPersonAliasSet.add(paKey);
              newPersonAliasRows.push([
                generateShortId('PA'),  // alias_id
                pId,                    // person_id
                rawPersonName,          // alias_name
                95,                     // match_score
                now,                    // created_at
                true                    // active_flag
              ]);
            }
          }
        }
      }
    }

    // ─── PLACE: Canonical + Variant ───

    if (plId && placeMap[plId]) {
      var plInfo         = placeMap[plId];
      var plMasterUuid   = plInfo.masterUuid;
      var plCanonicalNorm = plInfo.normalized;

      // 3c. Canonical Name → M_ALIAS (confidence 100)
      if (plCanonicalNorm && plCanonicalNorm.length >= 2) {
        var plCanonKey = 'PLACE::' + plMasterUuid + '::' + plCanonicalNorm;
        if (!existingGlobalAliasSet.has(plCanonKey)) {
          existingGlobalAliasSet.add(plCanonKey);
          newGlobalAliasRows.push([
            generateShortId('A'),
            plMasterUuid,
            plInfo.canonical,
            'PLACE',
            100,
            'AUTO_ENRICH_FACT',
            now,
            true
          ]);
        }
      }

      // 3d. Variant Address (ShipToAddr) → M_ALIAS + M_PLACE_ALIAS
      if (rawPlaceAddr && rawPlaceAddr.length >= 2) {
        var addrNorm = normalizeForCompare(rawPlaceAddr);
        if (addrNorm && addrNorm.length >= 2) {

          // M_ALIAS variant
          var addrKey = 'PLACE::' + plMasterUuid + '::' + addrNorm;
          if (!existingGlobalAliasSet.has(addrKey)) {
            existingGlobalAliasSet.add(addrKey);
            newGlobalAliasRows.push([
              generateShortId('A'),
              plMasterUuid,
              rawPlaceAddr,
              'PLACE',
              90,
              'AUTO_ENRICH_FACT',
              now,
              true
            ]);
          }

          // M_PLACE_ALIAS (เฉพาะ variant ≠ canonical)
          if (addrNorm !== plCanonicalNorm) {
            var plaKey = plId + '::' + addrNorm;
            if (!existingPlaceAliasSet.has(plaKey)) {
              existingPlaceAliasSet.add(plaKey);
              newPlaceAliasRows.push([
                generateShortId('PLA'), // alias_id
                plId,                   // place_id
                rawPlaceAddr,           // alias_name
                90,                     // match_score
                now,                    // created_at
                true                    // active_flag
              ]);
            }
          }
        }
      }
    }
  });

  // === 4. Batch Write ทั้ง 3 ชีต ===

  // 4a. M_ALIAS
  if (newGlobalAliasRows.length > 0 && mAliasSheet) {
    mAliasSheet.getRange(
      mAliasSheet.getLastRow() + 1, 1,
      newGlobalAliasRows.length, SCHEMA[SHEET.M_ALIAS].length
    ).setValues(newGlobalAliasRows);
    CacheService.getScriptCache().remove('M_GLOBAL_ALIAS_ALL');
    CacheService.getScriptCache().remove('M_GLOBAL_ALIAS_REVERSE');
  }

  // 4b. M_PERSON_ALIAS
  if (newPersonAliasRows.length > 0) {
    var paSheet = ss.getSheetByName(SHEET.M_PERSON_ALIAS);
    if (paSheet) {
      paSheet.getRange(
        paSheet.getLastRow() + 1, 1,
        newPersonAliasRows.length, SCHEMA[SHEET.M_PERSON_ALIAS].length
      ).setValues(newPersonAliasRows);
      invalidateAliasCache_();
    }
  }

  // 4c. M_PLACE_ALIAS
  if (newPlaceAliasRows.length > 0) {
    var plaSheet = ss.getSheetByName(SHEET.M_PLACE_ALIAS);
    if (plaSheet) {
      plaSheet.getRange(
        plaSheet.getLastRow() + 1, 1,
        newPlaceAliasRows.length, SCHEMA[SHEET.M_PLACE_ALIAS].length
      ).setValues(newPlaceAliasRows);
      invalidatePlaceAliasCache_();
    }
  }

  // === 5. Log ===

  var totalGlobal = newGlobalAliasRows.length;
  var totalPerson = newPersonAliasRows.length;
  var totalPlace  = newPlaceAliasRows.length;

  if (totalGlobal > 0 || totalPerson > 0 || totalPlace > 0) {
    logInfo('MatchEngine',
      'Auto-Enrich (Single Writer v5.4.001): ' +
      'M_ALIAS=' + totalGlobal +
      ' M_PERSON_ALIAS=' + totalPerson +
      ' M_PLACE_ALIAS=' + totalPlace
    );
  }
}

// ============================================================
// SECTION 2: processOneRow
// ============================================================

/**
 * processOneRow — ประมวลผล 1 Source Record
 * [FIX v003] resolvePlace ส่ง rawPlaceName + province
 */
function processOneRow(srcObj) {
  const personResult = resolvePerson(srcObj.rawPersonName);

  // [FIX v003] ส่ง rawPlaceName (สะอาด) + province แทน rawAddress ซ้ำ
  const placeResult  = resolvePlace(
    srcObj.rawPlaceName || srcObj.rawAddress,
    srcObj.province || ''
  );

  const geoResult    = resolveGeo(srcObj.rawLat, srcObj.rawLng);

  const decision = makeMatchDecision(srcObj, personResult, placeResult, geoResult);
  const result   = executeDecision(srcObj, decision, personResult, placeResult, geoResult);

  return { 
    action:     decision.action, 
    txId:       result.txId,
    factData:   result.factData,
    reviewData: result.reviewData
  };
}

// ============================================================
// SECTION 3: makeMatchDecision — 8 Rules
// ============================================================

/**
 * makeMatchDecision
 * [FIX v003] Rule 1: !hasGeo (เดิม Logic ผิด)
 * [FIX v003] Rule 3: ใช้ srcObj.province แทน placeResult.normResult.province
 * [FIX v003] Rule 5: Weight รวม = 1.0 (เดิม 1.2)
 * [FIX v003] Rule 7: !isPersonOk && !isPlaceOk (เดิม hasPerson ผิด)
 */
function makeMatchDecision(srcObj, personResult, placeResult, geoResult) {
  const isGeoInMaster   = geoResult.status === 'FOUND';
  const isPersonInMaster = personResult.status === 'FOUND';
  const isPlaceInMaster  = placeResult.status  === 'FOUND' ||
                          placeResult.status  === 'BRANCH_MATCH';

  // [FIX v003] เรียก getGeoProvince_ ครั้งเดียวก่อนเข้า Rule
  const geoProvince = isGeoInMaster ? getGeoProvince_(geoResult.geoId) : '';

  // [UPGRADE v5.2.003] ใช้สถานะจาก Source Sheet ประกอบการตัดสินใจ
  const hasGeoInSource = srcObj.hasGeo;

  // Rule 1: ไม่มีพิกัดใน Source Sheet เลย (พิกัดเป็น 0,0 หรือว่าง)
  if (!hasGeoInSource) {
    return {
      action: 'REVIEW', reason: 'INVALID_LATLNG',
      confidence: 0, priority: 1,
    };
  }

  // Rule 2: ชื่อคุณภาพต่ำ (สั้นเกินไปหรือมั่ว)
  if (personResult.status === 'LOW_QUALITY' || placeResult.status === 'LOW_QUALITY') {
    return {
      action: 'REVIEW', reason: 'LOW_QUALITY_DATA',
      confidence: 0, priority: 2,
    };
  }

  // Rule 3: ตรวจสอบเรื่องจังหวัดข้ามโซน (ถ้าพิกัดอยู่ใน Master แล้ว)
  if (isGeoInMaster && geoProvince && srcObj.province && geoProvince !== srcObj.province) {
    return {
      action: 'REVIEW', reason: 'GEO_PROVINCE_CONFLICT',
      confidence: 50, priority: 2,
    };
  }

  // [UPGRADE v5.2.005] Rule 3.5: Tiered Spatial Fuzzy Matching (รอคนตรวจตัดสินใจรวมพิกัด)
  if (geoResult.status === 'NEARBY_PENDING') {
    return {
      action: 'REVIEW',
      reason: geoResult.issue_type, // 'GEO_NEARBY_YELLOW' or 'GEO_NEARBY_ORANGE'
      confidence: 50,
      priority: 1, // สำคัญระดับ 1 เพราะต้องให้คนตัดสินใจว่าพิกัดเดียวกันไหม
    };
  }

  // Rule 4: พบครบทั้ง 3 อย่างใน Master -> AUTO_MATCH (Full)
  if (isGeoInMaster && isPersonInMaster && isPlaceInMaster) {
    const confidence = Math.round(
      geoResult.confidence    * 0.5 +
      personResult.confidence * 0.3 +
      placeResult.confidence  * 0.2
    );
    return {
      action: 'AUTO_MATCH', reason: APP_CONST.MATCH_FULL,
      confidence, priority: 0,
      evidence: 'name|place|geo' // [NEW v5.2.008]
    };
  }

  // Rule 5: พบพิกัดใน Master + อย่างใดอย่างหนึ่ง (คน หรือ สถานที่) -> AUTO_MATCH (Partial)
  if (isGeoInMaster && (isPersonInMaster || isPlaceInMaster)) {
    const confidence = Math.min(95, Math.round(
      geoResult.confidence                                    * 0.60 +
      (isPersonInMaster ? personResult.confidence : 0)        * 0.25 +
      (isPlaceInMaster  ? placeResult.confidence  : 0)        * 0.15
    ));
    const evidence = isPersonInMaster ? 'name|geo' : 'place|geo';
    return {
      action: 'AUTO_MATCH', reason: APP_CONST.MATCH_GEO,
      confidence, priority: 0,
      evidence: evidence // [NEW v5.2.008]
    };
  }

  // Rule 6: มีความกำกวม (Fuzzy Match / Needs Review)
  if (personResult.status === 'NEEDS_REVIEW' || placeResult.status === 'NEEDS_REVIEW') {
    const confidence = Math.max(
      personResult.confidence, placeResult.confidence
    );
    return {
      action: 'REVIEW', reason: APP_CONST.MATCH_FUZZY,
      confidence, priority: 2,
    };
  }

  // Rule 7: ทุกอย่างใหม่หมด แต่ Driver ส่งพิกัดมาให้ -> CREATE_NEW
  if (hasGeoInSource && !isGeoInMaster && !isPersonInMaster && !isPlaceInMaster) {
    return {
      action: 'CREATE_NEW', reason: 'ALL_NEW_WITH_GEO',
      confidence: geoResult.confidence || 100,
      priority: 0,
    };
  }

  // Rule 8: Default
  return {
    action: 'REVIEW', reason: 'NEW_RECORD_PENDING',
    confidence: 0, priority: 3,
  };
}

// ============================================================
// SECTION 4: executeDecision
// ============================================================

function executeDecision(srcObj, decision, personResult, placeResult, geoResult) {
  let personId = personResult ? personResult.personId : null;
  let placeId  = placeResult  ? placeResult.placeId  : null;
  let geoId    = geoResult    ? geoResult.geoId    : null;
  let destId = null;
  let factData = null;
  let reviewData = null;

  // [UPGRADE v5.2.008] Perform full enrichment once for consistency across Place and GeoPoint
  const geoEnrich = getEnrichedGeoData(srcObj.rawAddress, srcObj.rawPlaceName);

  // [UPGRADE v5.2.003] Always create Geo Point if new, even if record goes to REVIEW
  // [FIX v5.2.005] ห้ามสร้างพิกัดใหม่ถ้า status เป็น NEARBY_PENDING
  if (!geoId && srcObj.hasGeo && geoResult && geoResult.status !== 'NEARBY_PENDING') {
    geoId = createGeoPoint(
      srcObj.rawLat, 
      srcObj.rawLng, 
      'driver', 
      geoEnrich.fullAddress || srcObj.rawAddress,
      geoEnrich.province    || srcObj.province, 
      geoEnrich.district    || srcObj.district,
      placeId // [FIX v5.2.013] ส่งเพื่อทำ Fallback ถ้าเป็น Plus Code (แก้จาก decision.placeId)
    );
    if (geoResult) geoResult.geoId = geoId;
  }

  switch (decision.action) {

    case 'AUTO_MATCH': {
      if (personId) updatePersonStats(personId);
      if (placeId)  updatePlaceStats(placeId);
      if (geoId)    updateGeoStats(geoId);

      const destResult = resolveDestination(personId, placeId, geoId);
      if (destResult.status === 'FOUND' || destResult.status === 'PARTIAL_MATCH') {
        destId = destResult.destId;
        if (destId) updateDestinationStats(destId, srcObj.deliveryDate);
      } else {
        destId = createDestination(
          personId, placeId, geoId,
          srcObj.rawLat, srcObj.rawLng,
          srcObj.deliveryDate
        );
      }
      break;
    }

    case 'CREATE_NEW': {
      if (!personId && personResult.normResult) {
        personId = createPerson(personResult.normResult);
      }
      // [FIX v008] geoEnrich ถูกเรียกใช้แล้วที่ด้านบนเพื่อความสม่ำเสมอทั้ง GeoPoint และ Place
      if (!placeId && placeResult.normResult) {
        // [UPGRADE v5.2.001] ใช้ fullAddress ที่ซ่อมแล้วจาก geoEnrich
        const placeNorm = placeResult.normResult || {};
        // [FIX v5.2.008] canonical_name = rawAddress ดิบ (อ่านรู้เรื่อง)
        //   normalized_name = cleanPlace (ค่าที่ทำความสะอาดแล้ว)
        //   fullAddress จาก geoEnrich ใช้เป็น backup เท่านั้น
        placeNorm.fullAddress = srcObj.rawAddress || srcObj.rawPlaceName || geoEnrich.fullAddress;

        placeId = createPlace(
          placeNorm,
          geoEnrich.province,
          geoEnrich.district,
          geoEnrich.subDistrict,
          geoEnrich.postcode
        );
      }
      // geoId ถูกสร้างไปแล้วก่อนเข้า switch (v5.2.003)
      
      // [FIX v003] ต้องมีอย่างน้อย geoId และ (personId หรือ placeId)
      if (geoId && (personId || placeId)) {
        destId = createDestination(
          personId, placeId, geoId,
          srcObj.rawLat, srcObj.rawLng,
          srcObj.deliveryDate
        );
      }
      break;
    }

    case 'REVIEW': {
      const qRes = enqueueReview(srcObj, decision, personResult, placeResult, geoResult);
      if (qRes && qRes.rowData) {
        reviewData = qRes.rowData;
        // หลังจากบันทึกลงคิวรีวิวแล้ว ให้อัปเดตสถานะ SYNC_STATUS เป็น SUCCESS เพื่อให้แถวแสดงว่าเรียบร้อยแล้ว
        updateSyncStatus_([srcObj], 'SUCCESS');
      }
      break;
    }

    default:
      logError('MatchEngine', `executeDecision: Unknown action: ${decision.action}`);
      break;
  }

  const txRes = upsertFactDelivery(
    srcObj, personId, placeId, geoId, destId, decision
  );

  const txId = txRes ? txRes.txId : null;
  if (txRes && txRes.isNew) {
    factData = txRes.rowData;
  }

  return { txId, factData, reviewData };
}


// ============================================================
// SECTION 5: Helper Functions
// ============================================================

/**
 * getSameDayDestinations
 * [FIX v003] ใช้ Utilities.formatDate แทน toDateString (timezone safe)
 * [FIX v003] อ่านเฉพาะ DELIVERY_DATE + GEO_ID + TX_ID + PERSON_ID + PLACE_ID
 */
function getSameDayDestinations(deliveryDate, geoId) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.FACT_DELIVERY);
  if (!sheet || sheet.getLastRow() < 2) return [];

  if (!deliveryDate || !geoId) return [];

  // [FIX v003] อ่านเฉพาะคอลัมน์ที่ต้องการ
  const colsNeeded = [
    FACT_IDX.TX_ID, FACT_IDX.PERSON_ID, FACT_IDX.PLACE_ID,
    FACT_IDX.GEO_ID, FACT_IDX.DELIVERY_DATE
  ];
  const maxCol     = Math.max(...colsNeeded) + 1;
  const data       = sheet.getRange(2, 1, sheet.getLastRow() - 1, maxCol)
                          .getValues();

  // [FIX v003] ใช้ Utilities.formatDate ป้องกัน timezone ต่างกัน
  const tz         = Session.getScriptTimeZone();
  const targetDate = Utilities.formatDate(
    new Date(deliveryDate), tz, 'yyyy-MM-dd'
  );

  const results = [];
  for (let i = 0; i < data.length; i++) {
    const rowDate = data[i][FACT_IDX.DELIVERY_DATE];
    if (!rowDate) continue;

    const formattedDate = Utilities.formatDate(
      new Date(rowDate), tz, 'yyyy-MM-dd'
    );
    const rowGeoId = String(data[i][FACT_IDX.GEO_ID] || '');

    if (formattedDate === targetDate && rowGeoId === geoId) {
      results.push({
        txId:     data[i][FACT_IDX.TX_ID],
        personId: data[i][FACT_IDX.PERSON_ID],
        placeId:  data[i][FACT_IDX.PLACE_ID],
        geoId:    rowGeoId,
      });
    }
  }
  return results;
}

function detectSameGeoMultiPerson(geoId, currentPersonId) {
  const allDests = loadAllDestinations_();
  return allDests.some(d =>
    d.geoId    === geoId &&
    d.personId !== currentPersonId &&
    d.status   === APP_CONST.STATUS_ACTIVE
  );
}

function getGeoProvince_(geoId) {
  if (!geoId) return '';
  const allGeos = loadAllGeos_();
  const geo     = allGeos.find(g => g.geoId === geoId);
  return geo ? (geo.province || '') : '';
}

// ============================================================
// SECTION 6: Checkpoint Management
// ============================================================

function saveCheckpoint_(batchIndex, sourceRow) {
  PropertiesService.getScriptProperties().setProperties({
    'MATCH_CHECKPOINT_INDEX': String(batchIndex),
    'MATCH_CHECKPOINT_ROW':   String(sourceRow),
  });
  logInfo('MatchEngine', `บันทึก Checkpoint ที่ index:${batchIndex} row:${sourceRow}`);
}

/**
 * loadCheckpoint_ — โหลด Checkpoint index สำหรับ Resume
 * [ADD v003] ใหม่ — เดิมมีแค่ save แต่ไม่มี load
 * @return {number} index ที่จะเริ่มต้น (0 ถ้าไม่มี checkpoint)
 */
function loadCheckpoint_() {
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty('MATCH_CHECKPOINT_INDEX');
  if (saved && !isNaN(Number(saved))) {
    const idx = Number(saved);
    logInfo('MatchEngine', `โหลด Checkpoint: เริ่มจาก index ${idx}`);
    return idx;
  }
  return 0;
}

/**
 * clearCheckpoint_ — ล้าง Checkpoint เมื่อ run เสร็จสมบูรณ์
 */
function clearCheckpoint_() {
  PropertiesService.getScriptProperties().deleteProperty('MATCH_CHECKPOINT_INDEX');
  PropertiesService.getScriptProperties().deleteProperty('MATCH_CHECKPOINT_ROW');
  logInfo('MatchEngine', 'ล้าง Checkpoint เรียบร้อย');
}

/**
 * [NEW v5.2.003] Auto-Trigger System
 * [FIX v5.2.015] ป้องกันการลบทริกเกอร์ตั้งเวลาถาวรของผู้ใช้โดยการจำ ID
 */
function installAutoResume_(funcName) {
  removeAutoResume_(); // ลบของเก่าก่อนถ้ามี
  const trigger = ScriptApp.newTrigger(funcName)
    .timeBased()
    .after(60 * 1000) // ให้รันต่อในอีก 1 นาที (หลบ Timeout)
    .create();
  const triggerId = trigger.getUniqueId();
  PropertiesService.getScriptProperties().setProperty('AUTO_RESUME_TRIGGER_ID', triggerId);
  logInfo('MatchEngine', `ติดตั้ง Auto-Trigger: ${funcName} (ID: ${triggerId}) จะทำงานต่อใน 1 นาที`);
}

function removeAutoResume_() {
  const props = PropertiesService.getScriptProperties();
  const autoResumeTriggerId = props.getProperty('AUTO_RESUME_TRIGGER_ID');
  const triggers = ScriptApp.getProjectTriggers();
  let deletedCount = 0;
  
  for (const trigger of triggers) {
    const triggerId = trigger.getUniqueId();
    if (autoResumeTriggerId && triggerId === autoResumeTriggerId) {
      ScriptApp.deleteTrigger(trigger);
      deletedCount++;
    }
  }
  
  props.deleteProperty('AUTO_RESUME_TRIGGER_ID');
  
  if (deletedCount > 0) {
    logInfo('MatchEngine', `ลบ Auto-Trigger ที่ค้างอยู่ (${deletedCount} รายการ)`);
  }
}
