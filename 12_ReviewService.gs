/**
 * VERSION: 5.4.001
 * FILE: 12_ReviewService.gs
 * LMDS V5.4 — Review Queue Service
 * ===================================================
 * PURPOSE:
 *   จัดการคิวรีวิว Q_REVIEW — พักข้อมูลที่ต้องให้คนตัดสินใจ
 * ===================================================
 * CHANGELOG:
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [ADD] Comprehensive header documentation
 *   v5.4.000 (2026-05-24):
 *     - [UPGRADE] Version bump to 5.4.000
 *     - [ADD] Comprehensive header documentation
 *     - [ADD] DEPENDENCIES section with module relationships
 *     - [ENHANCE] Detailed module interconnection mapping
 *   v5.2.010 (PH2 Hardening):
 *     - [UPGRADE] อัปเกรดระบบเป็น 5.2.010
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config (SHEET.Q_REVIEW, SHEET.SOURCE, REVIEW_IDX.*, SRC_IDX.*, APP_CONST.*)
 *     - 02_Schema (SCHEMA)
 *     - 06_PersonService (resolvePerson, createPerson, mergePersonRecords)
 *     - 07_PlaceService (resolvePlace, createPlace, getEnrichedGeoData)
 *     - 08_GeoService (resolveGeo, createGeoPoint)
 *     - 09_DestinationService (createDestination)
 *     - 11_TransactionService (upsertFactDelivery)
 *     - 14_Utils (generateShortId, normalizeInvoiceNo)
 *   CALLS (Invokes):
 *     - resolvePerson()/createPerson()/mergePersonRecords() → 06_PersonService
 *     - resolvePlace()/createPlace()/getEnrichedGeoData() → 07_PlaceService
 *     - resolveGeo()/createGeoPoint() → 08_GeoService
 *     - createDestination() → 09_DestinationService
 *     - upsertFactDelivery() → 11_TransactionService
 *     - generateShortId()/normalizeInvoiceNo() → 14_Utils
 *     - logError/logInfo/logWarn/logDebug() → 03_SetupSheets
 *   EXPORTS TO:
 *     - 00_App (openReviewQueue, applyAllPendingDecisions, applyReviewDecision, highlightHighPriorityReviews)
 *     - 10_MatchEngine (enqueueReview)
 *   SHEETS ACCESSED:
 *     - SHEET.Q_REVIEW (Read+Write: review queue entries)
 *     - SHEET.SOURCE (Read: restore delivery date/time)
 * ===================================================
 * ARCHITECTURE:
 *   Review Queue Manager
 *   ┌──────────────────────────────────────────────┐
 *   │  enqueueReview                               │
 *   │  └─ add pending review to Q_REVIEW           │
 *   │  applyAllPendingDecisions                    │
 *   │  └─ batch process all pending decisions      │
 *   │  applyReviewDecision                         │
 *   │  ├─ CREATE_NEW → resolve + create masters    │
 *   │  ├─ MERGE_TO_CANDIDATE → merge person recs  │
 *   │  ├─ ESCALATE → mark as Escalated             │
 *   │  └─ IGNORE → mark as Done                    │
 *   │  getReviewStats                              │
 *   │  └─ queue statistics (pending/done/escalated)│
 *   │  highlightHighPriorityReviews                │
 *   │  └─ visual priority marking (batch colors)   │
 *   └──────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: enqueueReview
// ============================================================

/**
 * enqueueReview — เพิ่ม record เข้า Q_REVIEW
 * [FIX v003] CAND_PERSONS/PLACES/GEOS เก็บเป็น JSON array
 */
function enqueueReview(srcObj, decision, personResult, placeResult, geoResult) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.Q_REVIEW);
  if (!sheet) {
    logError('ReviewService', `ไม่พบชีต ${SHEET.Q_REVIEW}`);
    return null;
  }

  const now   = new Date();
  const newId = generateShortId('R');

  // [FIX v003] เก็บเป็น JSON.stringify([id]) แทน id เดี่ยว
  const candPersonIds = personResult && personResult.personId
    ? JSON.stringify([personResult.personId]) : JSON.stringify([]);
  const candPlaceIds  = placeResult && placeResult.placeId
    ? JSON.stringify([placeResult.placeId])  : JSON.stringify([]);

  // [UPGRADE v5.2.005] รองรับ Tiered Spatial Fuzzy Matching (Multiple Candidates)
  let candGeoIds = JSON.stringify([]);
  if (geoResult) {
    if (geoResult.candidateGeoIds && geoResult.candidateGeoIds.length > 0) {
      candGeoIds = JSON.stringify(geoResult.candidateGeoIds);
    } else if (geoResult.geoId) {
      candGeoIds = JSON.stringify([geoResult.geoId]);
    }
  }

  const newRow = new Array(SCHEMA[SHEET.Q_REVIEW].length).fill('');

  newRow[REVIEW_IDX.REVIEW_ID]     = newId;
  newRow[REVIEW_IDX.ISSUE_TYPE]    = decision ? decision.reason    : 'UNKNOWN';
  newRow[REVIEW_IDX.PRIORITY]      = decision ? (decision.priority || 2) : 2;
  newRow[REVIEW_IDX.SOURCE_REC_ID] = srcObj.sourceId   || '';
  newRow[REVIEW_IDX.SOURCE_ROW]    = srcObj.sourceRow  || 0;
  newRow[REVIEW_IDX.INVOICE_NO]    = srcObj.invoiceNo  || '';
  newRow[REVIEW_IDX.RAW_PERSON]    = srcObj.rawPersonName || '';

  // [UPGRADE v5.2.003] ซ่อมแซมชื่อสถานที่ใน Review Queue (Hierarchical)
  // ให้ความสำคัญกับชื่อของลูกค้า (SCG) แต่เติมส่วนที่ขาดจาก LatLong (System)
  let rawPlace = srcObj.rawPlaceName || '';
  const rawAddr = srcObj.rawAddress || '';
  
  // แกะข้อมูลที่ซ่อมแล้ว (Hierarchical: SCG -> System -> Dictionary)
  const enrich = getEnrichedGeoData(rawAddr, rawPlace);
  
  if (enrich.fullAddress) {
    // ถ้าชื่อเดิมสั้น หรือไม่มีข้อมูลภูมิศาสตร์ ให้เอาที่อยู่ที่ซ่อมแล้วมาต่อท้าย
    const hasGeoInfo = /จังหวัด|อำเภอ|เขต|ตำบล|แขวง/.test(rawPlace);
    if (rawPlace.length < 10 || !hasGeoInfo) {
      rawPlace = rawPlace ? `${rawPlace} (${enrich.fullAddress})` : enrich.fullAddress;
    }
  }

  newRow[REVIEW_IDX.RAW_PLACE]     = rawPlace || rawAddr;
  newRow[REVIEW_IDX.RAW_SYS_ADDR]  = rawAddr;
  newRow[REVIEW_IDX.RAW_LAT]       = srcObj.rawLat || 0;
  newRow[REVIEW_IDX.RAW_LNG]       = srcObj.rawLng || 0;
  newRow[REVIEW_IDX.CAND_PERSONS]  = candPersonIds;
  newRow[REVIEW_IDX.CAND_PLACES]   = candPlaceIds;
  newRow[REVIEW_IDX.CAND_GEOS]     = candGeoIds;
  newRow[REVIEW_IDX.CAND_DESTS]    = JSON.stringify([]);
  newRow[REVIEW_IDX.MATCH_SCORE]   = decision ? (decision.confidence || 0) : 0;
  newRow[REVIEW_IDX.RECOMMEND]     = 'MANUAL_REVIEW';
  newRow[REVIEW_IDX.STATUS]        = 'Pending';
  newRow[REVIEW_IDX.REVIEWER]      = '';
  newRow[REVIEW_IDX.REVIEWED_AT]   = '';
  newRow[REVIEW_IDX.DECISION]      = '';
  newRow[REVIEW_IDX.NOTE]          = decision ? (decision.reason || '') : '';

  return { reviewId: newId, rowData: newRow };
}

// ============================================================
// SECTION 2: applyAllPendingDecisions
// ============================================================

/**
 * applyAllPendingDecisions — ประมวลผลทุก decision ที่รอ
 * [FIX v003] filter 'In_Review' → !== 'Done'
 *            เดิม: เช็ค === 'In_Review' ทำให้ Pending ถูกข้าม
 */
function applyAllPendingDecisions() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.Q_REVIEW);
  if (!sheet || sheet.getLastRow() < 2) return;

  const data    = sheet.getRange(2, 1, sheet.getLastRow() - 1,
                   SCHEMA[SHEET.Q_REVIEW].length).getValues();
  let processed = 0;

  for (let i = 0; i < data.length; i++) {
    const status   = String(data[i][REVIEW_IDX.STATUS]   || '').trim();
    const decision = String(data[i][REVIEW_IDX.DECISION] || '').trim();
    const reviewId = String(data[i][REVIEW_IDX.REVIEW_ID]|| '').trim();

    // [FIX v003] ข้ามเฉพาะ Done แทน เช็ค In_Review
    if (status === 'Done' || !decision) continue;

    try {
      applyReviewDecision(reviewId, decision, data[i]);
      processed++;
    } catch (err) {
      logError('ReviewService',
        `applyAllPendingDecisions: reviewId ${reviewId} — ${err.message}`);
    }
  }

  logInfo('ReviewService', `applyAllPendingDecisions: ประมวลผล ${processed} รายการ`);
  return processed;
}

// ============================================================
// SECTION 3: applyReviewDecision
// ============================================================

/**
 * applyReviewDecision — ประมวลผล Decision จาก Admin
 * [FIX v003] ใช้ REVIEW_IDX.xxx + 1 แทน headers.indexOf (case-sensitive)
 * [FIX v003] {} block scope กัน ES6 const ใน switch
 * [FIX v003] ESCALATE: setValue('Escalated') + return
 */
function applyReviewDecision(reviewId, decisionVal, rowData) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.Q_REVIEW);
  if (!sheet) return;

  const now      = new Date();
  let reviewer = 'System';
  try {
    reviewer = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || 'Admin';
  } catch (e) {
    // กรณีไม่มีสิทธิ์เข้าถึง Email (เช่น Simple Trigger)
    reviewer = 'Admin (Auto)';
  }

  // หาแถวใน Q_REVIEW
  let targetRow  = -1;
  let rowArr     = rowData;

  if (!rowArr) {
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1,
                  SCHEMA[SHEET.Q_REVIEW].length).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][REVIEW_IDX.REVIEW_ID]).trim() === reviewId) {
        targetRow = i + 2;
        rowArr    = data[i];
        break;
      }
    }
  } else {
    // หา targetRow ถ้ามี rowData มาแล้ว (เพื่อเขียนกลับถูกแถว)
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === reviewId) {
        targetRow = i + 2;
        break;
      }
    }
  }

  if (targetRow === -1) {
    logWarn('ReviewService', `applyReviewDecision: ไม่พบ reviewId ${reviewId}`);
    return;
  }

  // [FIX v003] ใช้ REVIEW_IDX.STATUS + 1 แทน headers.indexOf
  switch (decisionVal) {

    case 'CREATE_NEW': {
      // [FIX v003] สร้าง srcObj ที่มี invoiceNo + sourceRow ครบถ้วน
      const rawPerson = String(rowArr[REVIEW_IDX.RAW_PERSON]   || '').trim();
      const rawPlace  = String(rowArr[REVIEW_IDX.RAW_PLACE]    || '').trim();
      const rawAddr   = String(rowArr[REVIEW_IDX.RAW_SYS_ADDR] || '').trim();
      const rawLat    = Number(rowArr[REVIEW_IDX.RAW_LAT]      || 0);
      const rawLng    = Number(rowArr[REVIEW_IDX.RAW_LNG]      || 0);

      // [UPGRADE v5.2.001] Restore missing Date/Time from Source
      const sourceRowIdx = Number(rowArr[REVIEW_IDX.SOURCE_ROW] || 0);
      let deliveryDate = '';
      let deliveryTime = '';
      
      if (sourceRowIdx > 1) {
        const srcSheet = ss.getSheetByName(SHEET.SOURCE);
        const srcData  = srcSheet.getRange(sourceRowIdx, 1, 1, srcSheet.getLastColumn()).getValues()[0];
        
        if (srcData[SRC_IDX.DELIVERY_DATE]) {
          try { deliveryDate = new Date(srcData[SRC_IDX.DELIVERY_DATE]).toISOString(); }
          catch(e) { deliveryDate = String(srcData[SRC_IDX.DELIVERY_DATE]); }
        }
        deliveryTime = srcData[SRC_IDX.DELIVERY_TIME];
      }

      const srcObj = {
        invoiceNo:     normalizeInvoiceNo(rowArr[REVIEW_IDX.INVOICE_NO]),
        sourceRow:     sourceRowIdx,
        sourceId:      String(rowArr[REVIEW_IDX.SOURCE_REC_ID]|| '').trim(),
        rawPersonName: rawPerson,
        rawPlaceName:  rawPlace,
        rawAddress:    rawAddr,
        rawLat:        rawLat,
        rawLng:        rawLng,
        hasGeo:        !isNaN(rawLat) && !isNaN(rawLng) &&
                       rawLat !== 0   && rawLng !== 0,
        province:      '',
        warehouse:     '',
        driverName:    '',
        truckLicense:  '',
        soldToCode:    '',
        soldToName:    '',
        carrierCode:   '',
        carrierName:   '',
        shipmentNo:    '',
        deliveryDate:  deliveryDate,
        deliveryTime:  deliveryTime,
        sourceSheet:   SHEET.Q_REVIEW,
      };

      // [FIX v008] ใช้ฟังก์ชันกลางเพื่อแกะที่อยู่ให้ครบถ้วนเหมือนกันทุกจุด
      const geoEnrich = getEnrichedGeoData(rawAddr, rawPlace);

      const personResult = resolvePerson(rawPerson);
      let personId       = personResult.personId;
      if (!personId) personId = createPerson(personResult.normResult);

      // [FIX v003] resolvePlace ส่ง rawPlace (clean) + rawAddr (dirty) แยกกัน
      const placeResult  = resolvePlace(rawPlace, rawAddr);
      let placeId        = placeResult.placeId;
      if (!placeId) {
        // [UPGRADE v5.2.001] ใช้ fullAddress ที่ซ่อมแล้วจาก geoEnrich
        const placeNorm = placeResult.normResult || {};
        if (geoEnrich.fullAddress) placeNorm.fullAddress = geoEnrich.fullAddress;

        placeId = createPlace(
          placeNorm, 
          geoEnrich.province, 
          geoEnrich.district, 
          geoEnrich.subDistrict, 
          geoEnrich.postcode
        );
      }

      let geoId = null;
      if (srcObj.hasGeo) {
        const geoResult = resolveGeo(rawLat, rawLng);
        geoId = geoResult.geoId;
        // [FIX v008] ส่งข้อมูลภูมิศาสตร์ที่แกะได้ให้ createGeoPoint (แก้ตัวแปรผิด)
        if (!geoId) {
          // [FIX v008] ซ่อมเฉพาะคอลัมน์ 24 สำหรับพิกัด (Case 2)
          const geoOnlyEnrich = getEnrichedGeoData(rawAddr, '');
          geoId = createGeoPoint(
            rawLat, rawLng, 'manual', 
            geoOnlyEnrich.fullAddress || rawAddr, 
            geoOnlyEnrich.province    || geoEnrich.province, 
            geoOnlyEnrich.district    || geoEnrich.district,
            placeId // [NEW v5.2.008] ส่งเพื่อทำ Fallback ถ้าเป็น Plus Code
          );
        }
      }

      let destId = null;
      if (geoId && (personId || placeId)) {
        destId = createDestination(personId, placeId, geoId,
                                   rawLat, rawLng, null);
      }

      // [FIX v004] แก้ไข Note จาก INVALID_LATLNG เป็น REVIEW_APPROVED
      upsertFactDelivery(srcObj, personId, placeId, geoId, destId,
        { action: 'CREATE_NEW', reason: 'REVIEW_APPROVED', confidence: 95, priority: 0 });

      // อัปเดต Q_REVIEW status
      sheet.getRange(targetRow, REVIEW_IDX.STATUS      + 1).setValue('Done');
      sheet.getRange(targetRow, REVIEW_IDX.REVIEWER    + 1).setValue(reviewer);
      sheet.getRange(targetRow, REVIEW_IDX.REVIEWED_AT + 1).setValue(now);
      sheet.getRange(targetRow, REVIEW_IDX.DECISION    + 1).setValue(decisionVal);
      sheet.getRange(targetRow, REVIEW_IDX.NOTE        + 1).setValue('Resolved (Created New)');
      break;
    }

    case 'MERGE_TO_CANDIDATE': {
      const rawPerson     = String(rowArr[REVIEW_IDX.RAW_PERSON] || '').trim();
      const candPersonStr = String(rowArr[REVIEW_IDX.CAND_PERSONS] || '[]').trim();
      let   candPersonIds = [];

      try { candPersonIds = JSON.parse(candPersonStr); } catch(e) {}

      if (candPersonIds.length > 0) {
        const personResult = resolvePerson(rawPerson);
        if (personResult.personId && personResult.personId !== candPersonIds[0]) {
          mergePersonRecords(personResult.personId, candPersonIds[0]);
        }
      }

      sheet.getRange(targetRow, REVIEW_IDX.STATUS      + 1).setValue('Done');
      sheet.getRange(targetRow, REVIEW_IDX.REVIEWER    + 1).setValue(reviewer);
      sheet.getRange(targetRow, REVIEW_IDX.REVIEWED_AT + 1).setValue(now);
      sheet.getRange(targetRow, REVIEW_IDX.DECISION    + 1).setValue(decisionVal);
      break;
    }

    case 'ESCALATE': {
      // [FIX v003] setValue('Escalated') แล้ว return ทันที
      sheet.getRange(targetRow, REVIEW_IDX.STATUS      + 1).setValue('Escalated');
      sheet.getRange(targetRow, REVIEW_IDX.REVIEWER    + 1).setValue(reviewer);
      sheet.getRange(targetRow, REVIEW_IDX.REVIEWED_AT + 1).setValue(now);
      sheet.getRange(targetRow, REVIEW_IDX.DECISION    + 1).setValue(decisionVal);
      logInfo('ReviewService', `reviewId ${reviewId} → Escalated`);
      return; 
    }

    case 'IGNORE': {
      sheet.getRange(targetRow, REVIEW_IDX.STATUS      + 1).setValue('Done');
      sheet.getRange(targetRow, REVIEW_IDX.REVIEWER    + 1).setValue(reviewer);
      sheet.getRange(targetRow, REVIEW_IDX.REVIEWED_AT + 1).setValue(now);
      sheet.getRange(targetRow, REVIEW_IDX.DECISION    + 1).setValue(decisionVal);
      break;
    }

    default:
      logWarn('ReviewService', `applyReviewDecision: Unknown decision ${decisionVal}`);
      break;
  }

  logInfo('ReviewService',
    `applyReviewDecision: ${reviewId} → ${decisionVal} โดย ${reviewer}`);
}


// ============================================================
// SECTION 4: Stats & Report
// ============================================================

/**
 * getReviewStats — ดึงสถิติ Q_REVIEW
 */
function getReviewStats() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.Q_REVIEW);
  const stats = { pending: 0, done: 0, escalated: 0, total: 0 };

  if (!sheet || sheet.getLastRow() < 2) return stats;

  const statusCol = REVIEW_IDX.STATUS + 1;
  const totalRows = sheet.getLastRow() - 1;
  const statusData = sheet.getRange(2, statusCol, totalRows, 1).getValues();

  statusData.forEach(r => {
    const s = String(r[0] || '').trim();
    stats.total++;
    if (s === 'Done')       stats.done++;
    else if (s === 'Escalated') stats.escalated++;
    else                    stats.pending++;
  });

  return stats;
}

/**
 * highlightHighPriorityReviews — ทาสีแถว Priority สูงใน Q_REVIEW
 * [NOTE] ปรับเป็น batch collect ranges แล้ว setBackground ทีเดียว
 */
function highlightHighPriorityReviews() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.Q_REVIEW);
  if (!sheet || sheet.getLastRow() < 2) return;

  const totalRows   = sheet.getLastRow() - 1;
  const totalCols   = SCHEMA[SHEET.Q_REVIEW].length;
  const data        = sheet.getRange(2, 1, totalRows, totalCols).getValues();
  const bgColors    = [];

  data.forEach(row => {
    const priority = Number(row[REVIEW_IDX.PRIORITY] || 0);
    const status   = String(row[REVIEW_IDX.STATUS]   || '').trim();
    let color      = null;

    if (status === 'Done')      color = '#d9ead3';
    else if (priority >= 3)    color = '#f4cccc';
    else if (priority === 2)   color = '#fff2cc';
    else                       color = null;

    bgColors.push(Array(totalCols).fill(color));
  });

  // [RULE 4] Batch setBackgrounds ทีเดียว ไม่ loop setBackground
  sheet.getRange(2, 1, totalRows, totalCols).setBackgrounds(bgColors);
  logDebug('ReviewService', `highlightHighPriorityReviews: ${totalRows} แถว`);
}
