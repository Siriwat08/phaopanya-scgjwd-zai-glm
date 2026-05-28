/**
 * VERSION: 5.4.001
 * FILE: 12_ReviewService.gs
 * LMDS V5.4 — Review Queue Service
 * [FIX BUG-B2] v5.4.003: updateReviewRowStatus_() helper — 1 setValues แทน 5× setValue
 * [FIX BUG-B2] v5.4.003: applyAllPendingDecisions — Time Guard + Batch Status
 * [FIX BUG-A2] v5.4.003: applyAllPendingDecisions — เพิ่ม try-catch outer
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

function enqueueReview(srcObj, decision, personResult, placeResult, geoResult) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.Q_REVIEW);
  if (!sheet) {
    logError('ReviewService', 'ไม่พบชีต ' + SHEET.Q_REVIEW);
    return null;
  }

  const now   = new Date();
  const newId = generateShortId('R');

  const candPersonIds = personResult && personResult.personId
    ? JSON.stringify([personResult.personId]) : JSON.stringify([]);
  const candPlaceIds  = placeResult && placeResult.placeId
    ? JSON.stringify([placeResult.placeId])  : JSON.stringify([]);

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
  newRow[REVIEW_IDX.SOURCE_REC_ID] = srcObj.sourceId  || '';
  newRow[REVIEW_IDX.SOURCE_ROW]    = srcObj.sourceRow || 0;
  newRow[REVIEW_IDX.INVOICE_NO]    = srcObj.invoiceNo || '';
  newRow[REVIEW_IDX.RAW_PERSON]    = srcObj.rawPersonName || '';

  let rawPlace = srcObj.rawPlaceName || '';
  const rawAddr  = srcObj.rawAddress   || '';
  const enrich   = getEnrichedGeoData(rawAddr, rawPlace);
  if (enrich.fullAddress) {
    const hasGeoInfo = /จังหวัด|อำเภอ|เขต|ตำบล|แขวง/.test(rawPlace);
    if (rawPlace.length < 10 || !hasGeoInfo) {
      rawPlace = rawPlace ? rawPlace + ' (' + enrich.fullAddress + ')' : enrich.fullAddress;
    }
  }

  newRow[REVIEW_IDX.RAW_PLACE]    = rawPlace || rawAddr;
  newRow[REVIEW_IDX.RAW_SYS_ADDR] = rawAddr;
  newRow[REVIEW_IDX.RAW_LAT]      = srcObj.rawLat || 0;
  newRow[REVIEW_IDX.RAW_LNG]      = srcObj.rawLng || 0;
  newRow[REVIEW_IDX.CAND_PERSONS] = candPersonIds;
  newRow[REVIEW_IDX.CAND_PLACES]  = candPlaceIds;
  newRow[REVIEW_IDX.CAND_GEOS]    = candGeoIds;
  newRow[REVIEW_IDX.CAND_DESTS]   = JSON.stringify([]);
  newRow[REVIEW_IDX.MATCH_SCORE]  = decision ? (decision.confidence || 0) : 0;
  newRow[REVIEW_IDX.RECOMMEND]    = 'MANUAL_REVIEW';
  newRow[REVIEW_IDX.STATUS]       = 'Pending';
  newRow[REVIEW_IDX.REVIEWER]     = '';
  newRow[REVIEW_IDX.REVIEWED_AT]  = '';
  newRow[REVIEW_IDX.DECISION]     = '';
  newRow[REVIEW_IDX.NOTE]         = decision ? (decision.reason || '') : '';

  return { reviewId: newId, rowData: newRow };
}

// ============================================================
// SECTION 2: applyAllPendingDecisions
// [FIX BUG-B2] Time Guard (ป้องกัน Timeout กับ Queue ใหญ่)
// [FIX BUG-A2] try-catch outer
// ============================================================

function applyAllPendingDecisions() {
  // [FIX BUG-A2] try-catch outer
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET.Q_REVIEW);
    if (!sheet || sheet.getLastRow() < 2) return;

    // [FIX BUG-B2] Time Guard
    const startTime = new Date();
    const timeLimit = AI_CONFIG.TIME_LIMIT_MS || (5 * 60 * 1000);

    const data       = sheet.getRange(2, 1, sheet.getLastRow() - 1,
                        SCHEMA[SHEET.Q_REVIEW].length).getValues();
    let   processed  = 0;
    let   timedOut   = false;

    for (let i = 0; i < data.length; i++) {
      // [FIX BUG-B2] Time Guard ทุก 20 แถว
      if (i % 20 === 0 && i > 0 && (new Date() - startTime) > timeLimit) {
        logWarn('ReviewService', 'applyAllPendingDecisions: Time Guard หยุดที่แถว ' + i + '/' + data.length);
        timedOut = true;
        break;
      }

      const status   = String(data[i][REVIEW_IDX.STATUS]   || '').trim();
      const decision = String(data[i][REVIEW_IDX.DECISION] || '').trim();
      const reviewId = String(data[i][REVIEW_IDX.REVIEW_ID]|| '').trim();

      if (status === 'Done' || !decision) continue;

      try {
        applyReviewDecision(reviewId, decision, data[i]);
        processed++;
      } catch (err) {
        logError('ReviewService', 'applyAllPendingDecisions row ' + reviewId + ': ' + err.message, err);
      }
    }

    logInfo('ReviewService',
      'applyAllPendingDecisions: ประมวลผล ' + processed + ' รายการ' +
      (timedOut ? ' (หยุดก่อนครบ — Time Guard)' : '')
    );

    if (timedOut) {
      safeUiAlert_('⚠️ ประมวลผลไป ' + processed + ' รายการ แต่หยุดกลางคันเพราะใกล้ Timeout\nกรุณารันอีกครั้ง');
    }
    return processed;

  } catch (err) {
    logError('ReviewService', 'applyAllPendingDecisions: ' + err.message, err);
    safeUiAlert_('❌ เกิดข้อผิดพลาด: ' + err.message);
  }
}

// ============================================================
// SECTION 3: applyReviewDecision
// [FIX BUG-B2] ใช้ updateReviewRowStatus_() แทน 5× setValue
// ============================================================

function applyReviewDecision(reviewId, decisionVal, rowData) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.Q_REVIEW);
  if (!sheet) return;

  const now = new Date();
  let reviewer = 'System';
  try {
    reviewer = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || 'Admin';
  } catch (e) {
    reviewer = 'Admin (Auto)';
  }

  // หา targetRow
  let targetRow = -1;
  let rowArr    = rowData;
  if (!rowArr) {
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1,
                  SCHEMA[SHEET.Q_REVIEW].length).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][REVIEW_IDX.REVIEW_ID]).trim() === reviewId) {
        targetRow = i + 2; rowArr = data[i]; break;
      }
    }
  } else {
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === reviewId) { targetRow = i + 2; break; }
    }
  }
  if (targetRow === -1) {
    logWarn('ReviewService', 'applyReviewDecision: ไม่พบ reviewId ' + reviewId);
    return;
  }

  switch (decisionVal) {

    case 'CREATE_NEW': {
      const rawPerson = String(rowArr[REVIEW_IDX.RAW_PERSON]   || '').trim();
      const rawPlace  = String(rowArr[REVIEW_IDX.RAW_PLACE]    || '').trim();
      const rawAddr   = String(rowArr[REVIEW_IDX.RAW_SYS_ADDR] || '').trim();
      const rawLat    = Number(rowArr[REVIEW_IDX.RAW_LAT]      || 0);
      const rawLng    = Number(rowArr[REVIEW_IDX.RAW_LNG]      || 0);

      const sourceRowIdx = Number(rowArr[REVIEW_IDX.SOURCE_ROW] || 0);
      let deliveryDate = '', deliveryTime = '';
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
        invoiceNo: normalizeInvoiceNo(rowArr[REVIEW_IDX.INVOICE_NO]),
        sourceRow: sourceRowIdx,
        sourceId:  String(rowArr[REVIEW_IDX.SOURCE_REC_ID] || '').trim(),
        rawPersonName: rawPerson, rawPlaceName: rawPlace,
        rawAddress: rawAddr, rawLat: rawLat, rawLng: rawLng,
        hasGeo: !isNaN(rawLat) && !isNaN(rawLng) && rawLat !== 0 && rawLng !== 0,
        province: '', warehouse: '', driverName: '', truckLicense: '',
        soldToCode: '', soldToName: '', carrierCode: '', carrierName: '',
        shipmentNo: '', deliveryDate: deliveryDate, deliveryTime: deliveryTime,
        sourceSheet: SHEET.Q_REVIEW,
      };

      const geoEnrich    = getEnrichedGeoData(rawAddr, rawPlace);
      const personResult = resolvePerson(rawPerson);
      let   personId     = personResult.personId;
      if (!personId) personId = createPerson(personResult.normResult);

      const placeResult = resolvePlace(rawPlace, rawAddr);
      let   placeId     = placeResult.placeId;
      if (!placeId) {
        const placeNorm = placeResult.normResult || {};
        if (geoEnrich.fullAddress) placeNorm.fullAddress = geoEnrich.fullAddress;
        placeId = createPlace(placeNorm, geoEnrich.province, geoEnrich.district,
                              geoEnrich.subDistrict, geoEnrich.postcode);
      }

      let geoId = null;
      if (srcObj.hasGeo) {
        const geoResult = resolveGeo(rawLat, rawLng);
        geoId = geoResult.geoId;
        if (!geoId) {
          const geoOnlyEnrich = getEnrichedGeoData(rawAddr, '');
          geoId = createGeoPoint(rawLat, rawLng, 'manual',
            geoOnlyEnrich.fullAddress || rawAddr,
            geoOnlyEnrich.province || geoEnrich.province,
            geoOnlyEnrich.district || geoEnrich.district, placeId);
        }
      }

      let destId = null;
      if (geoId && (personId || placeId)) {
        destId = createDestination(personId, placeId, geoId, rawLat, rawLng, null);
      }

      upsertFactDelivery(srcObj, personId, placeId, geoId, destId,
        { action: 'CREATE_NEW', reason: 'REVIEW_APPROVED', confidence: 95, priority: 0 });

      // [FIX BUG-B2] 1 setValues แทน 5× setValue
      updateReviewRowStatus_(sheet, targetRow, 'Done', reviewer, now, decisionVal, 'Resolved (Created New)');
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
      // [FIX BUG-B2] 1 setValues
      updateReviewRowStatus_(sheet, targetRow, 'Done', reviewer, now, decisionVal, '');
      break;
    }

    case 'ESCALATE': {
      // [FIX BUG-B2] 1 setValues
      updateReviewRowStatus_(sheet, targetRow, 'Escalated', reviewer, now, decisionVal, '');
      logInfo('ReviewService', 'reviewId ' + reviewId + ' → Escalated');
      return;
    }

    case 'IGNORE': {
      // [FIX BUG-B2] 1 setValues
      updateReviewRowStatus_(sheet, targetRow, 'Done', reviewer, now, decisionVal, '');
      break;
    }

    default:
      logWarn('ReviewService', 'applyReviewDecision: Unknown decision ' + decisionVal);
      break;
  }

  logInfo('ReviewService', 'applyReviewDecision: ' + reviewId + ' → ' + decisionVal + ' โดย ' + reviewer);
}

// ============================================================
// SECTION 3.5: updateReviewRowStatus_ [NEW BUG-B2 Helper]
// รวม 5× getRange().setValue() → 1× getRange().setValues()
// ลด 5 API calls → 1 API call ต่อ decision
// ============================================================

/**
 * updateReviewRowStatus_ — Batch update status columns ใน Q_REVIEW
 * [NEW v5.4.003] แทนที่ 5× setValue ที่กระจายใน applyReviewDecision()
 */
function updateReviewRowStatus_(sheet, targetRow, status, reviewer, now, decisionVal, note) {
  // อ่าน block คอลัมน์ที่ต้องอัปเดต (STATUS ถึง NOTE เป็น consecutive range)
  const minCol = Math.min(
    REVIEW_IDX.STATUS, REVIEW_IDX.REVIEWER, REVIEW_IDX.REVIEWED_AT,
    REVIEW_IDX.DECISION, REVIEW_IDX.NOTE
  ) + 1; // 1-based

  const maxCol = Math.max(
    REVIEW_IDX.STATUS, REVIEW_IDX.REVIEWER, REVIEW_IDX.REVIEWED_AT,
    REVIEW_IDX.DECISION, REVIEW_IDX.NOTE
  ) + 1; // 1-based

  const numCols = maxCol - minCol + 1;
  const range   = sheet.getRange(targetRow, minCol, 1, numCols);
  const vals    = range.getValues()[0];  // อ่าน 1 ครั้ง

  // แก้ค่าใน RAM (0-based relative offset)
  vals[REVIEW_IDX.STATUS      - (minCol - 1)] = status;
  vals[REVIEW_IDX.REVIEWER    - (minCol - 1)] = reviewer;
  vals[REVIEW_IDX.REVIEWED_AT - (minCol - 1)] = now;
  vals[REVIEW_IDX.DECISION    - (minCol - 1)] = decisionVal;
  vals[REVIEW_IDX.NOTE        - (minCol - 1)] = note || '';

  range.setValues([vals]);  // ✅ 1 write API call
}

// ============================================================
// SECTION 4: Stats & Report (ไม่เปลี่ยน)
// ============================================================

function getReviewStats() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.Q_REVIEW);
  const stats = { pending: 0, done: 0, escalated: 0, total: 0 };
  if (!sheet || sheet.getLastRow() < 2) return stats;

  const statusCol  = REVIEW_IDX.STATUS + 1;
  const totalRows  = sheet.getLastRow() - 1;
  const statusData = sheet.getRange(2, statusCol, totalRows, 1).getValues();

  statusData.forEach(r => {
    const s = String(r[0] || '').trim();
    stats.total++;
    if (s === 'Done')           stats.done++;
    else if (s === 'Escalated') stats.escalated++;
    else                        stats.pending++;
  });
  return stats;
}

function highlightHighPriorityReviews() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.Q_REVIEW);
  if (!sheet || sheet.getLastRow() < 2) return;

  const totalRows = sheet.getLastRow() - 1;
  const totalCols = SCHEMA[SHEET.Q_REVIEW].length;
  const data      = sheet.getRange(2, 1, totalRows, totalCols).getValues();
  const bgColors  = [];

  data.forEach(row => {
    const priority = Number(row[REVIEW_IDX.PRIORITY] || 0);
    const status   = String(row[REVIEW_IDX.STATUS]   || '').trim();
    let color = null;
    if (status === 'Done')    color = '#d9ead3';
    else if (priority >= 3)   color = '#f4cccc';
    else if (priority === 2)  color = '#fff2cc';
    bgColors.push(Array(totalCols).fill(color));
  });

  sheet.getRange(2, 1, totalRows, totalCols).setBackgrounds(bgColors);
  logDebug('ReviewService', 'highlightHighPriorityReviews: ' + totalRows + ' แถว');
}
