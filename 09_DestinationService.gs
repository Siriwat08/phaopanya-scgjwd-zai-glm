/**
 * VERSION: 5.4.001
 * FILE: 09_DestinationService.gs
 * LMDS V5.4 — Destination Master Service
 * ===================================================
 * PURPOSE:
 *   จัดการ Master Destination — จับคู่ Person+Place+Geo เป็นจุดหมายปลายทาง
 * ===================================================
 * CHANGELOG:
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [ADD] Comprehensive header documentation
 *   v5.4.000 (2026-05-24):
 *     - [UPGRADE] Version bump to 5.4.000
 *     - [ADD] Comprehensive header documentation
 *     - [ADD] DEPENDENCIES section with module relationships
 *     - [ENHANCE] Detailed module interconnection mapping
 *   v003 (Round 1 — Critical Fixes):
 *     - [FIX] resolveDestination: && → || (Trinity ต้องครบ 3)
 *     - [FIX] loadAllDestinations_: filter ARCHIVED + MERGED
 *     - [FIX] updateDestinationStats: โหลดเฉพาะ dest_id + DEST_IDX + guard
 *     - [FIX] Query functions: !== ARCHIVED → === ACTIVE
 *     - [FIX] loadAllDestinations_: เพิ่ม route_label ใน map
 *     - [FIX] createDestination: deliveryDate instanceof Date check
 *     - [FIX] createDestination: Number() validate lat/lng
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config (SHEET.M_DESTINATION, DEST_IDX.*, AI_CONFIG.CACHE_TTL_SEC, APP_CONST.*)
 *     - 02_Schema (SCHEMA)
 *   CALLS (Invokes):
 *     - generateShortId() → 14_Utils
 *     - logDebug/logWarn/logError() → 03_SetupSheets
 *   EXPORTS TO:
 *     - 10_MatchEngine (resolveDestination, createDestination, updateDestinationStats, loadAllDestinations_)
 *     - 17_SearchService (getDestsByPersonId, getDestsByPersonAndPlace, getDestsByPlaceId)
 *     - 21_AliasService (destination lookups)
 *   SHEETS ACCESSED:
 *     - SHEET.M_DESTINATION (Read+Write: destination master data)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────┐
 *   │           Destination Master Hub                 │
 *   ├─────────────────────────────────────────────────┤
 *   │  resolveDestination                              │
 *   │    └─► Trinity check: personId+placeId+geoId     │
 *   │  createDestination                               │
 *   │  updateDestinationStats                          │
 *   │  Query Helpers:                                  │
 *   │    ├─► getDestsByPersonId                        │
 *   │    ├─► getDestsByPlaceId                         │
 *   │    ├─► getDestsByPersonAndPlace                  │
 *   │    └─► getDominantDestByGeo                      │
 *   │  Data Loader:                                    │
 *   │    └─► loadAllDestinations_ (cached)             │
 *   └─────────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: resolveDestination
// ============================================================

/**
 * resolveDestination — ค้นหา Destination จาก Trinity
 * [FIX v003] && → || : ถ้าขาดตัวใดตัวหนึ่งให้ reject ทันที
 *            เดิม: !personId && !placeId && !geoId (ต้องว่างทั้ง 3)
 *            ถูก:  !personId || !placeId || !geoId (ขาดตัวเดียวก็ reject)
 */
function resolveDestination(personId, placeId, geoId) {
  // [FIX v003] Trinity ต้องครบ 3 จึงจะค้นหาได้
  if (!personId || !placeId || !geoId) {
    return { destId: null, status: 'INSUFFICIENT', isNew: false };
  }

  // Normalize กัน null/'' ปน
  const pId = String(personId || '').trim();
  const plId = String(placeId  || '').trim();
  const gId  = String(geoId    || '').trim();

  if (!pId || !plId || !gId) {
    return { destId: null, status: 'INSUFFICIENT', isNew: false };
  }

  const allDests = loadAllDestinations_();

  // Exact Match ด้วย Trinity ทั้ง 3
  const exactMatch = allDests.find(d =>
    d.personId === pId && d.placeId === plId && d.geoId === gId
  );
  if (exactMatch) {
    return { destId: exactMatch.destId, status: 'FOUND', isNew: false };
  }

  // Partial Match (Person + Geo) — fallback กรณียังไม่รู้ Place
  const partialMatch = allDests.find(d =>
    d.personId === pId && d.geoId === gId
  );
  if (partialMatch) {
    return { destId: partialMatch.destId, status: 'PARTIAL_MATCH', isNew: false };
  }

  return { destId: null, status: 'NOT_FOUND', isNew: false };
}

// ============================================================
// SECTION 2: CRUD
// ============================================================

/**
 * createDestination — สร้าง Destination ใหม่ (Trinity)
 * [FIX v003] deliveryDate instanceof Date check
 * [FIX v003] Number() validate lat/lng
 */
function createDestination(personId, placeId, geoId, lat, lng, deliveryDate) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_DESTINATION);
  const now   = new Date();
  const newId = generateShortId('D');

  // [FIX v003] Validate lat/lng เป็น Number
  const numLat = Number(lat);
  const numLng = Number(lng);
  const safeLat = !isNaN(numLat) ? numLat : 0;
  const safeLng = !isNaN(numLng) ? numLng : 0;

  // [FIX v003] deliveryDate instanceof Date check แทน || now
  let safeDate = now;
  if (deliveryDate instanceof Date && !isNaN(deliveryDate.getTime())) {
    safeDate = deliveryDate;
  } else if (deliveryDate) {
    const parsed = new Date(deliveryDate);
    safeDate = !isNaN(parsed.getTime()) ? parsed : now;
  }

  const newRow = [
    newId,
    personId  || '',
    placeId   || '',
    geoId     || '',
    safeLat,
    safeLng,
    '',
    safeDate,
    1,
    now,
    APP_CONST.STATUS_ACTIVE,
  ];

  sheet.appendRow(newRow);
  invalidateDestCache_();
  logDebug('DestinationService',
    `createDestination: ${newId} P:${personId} PL:${placeId} G:${geoId}`);
  return newId;
}

/**
 * updateDestinationStats
 * [FIX v003] โหลดเฉพาะ dest_id + ใช้ DEST_IDX + guard + const now
 * [FIX v5.4.002] เปลี่ยนจาก row-by-row setValue เป็น batch setValues (Performance)
 */
function updateDestinationStats(destId, deliveryDate) {
  if (!destId) return;
  try {
    const ss      = SpreadsheetApp.getActiveSpreadsheet();
    const sheet   = ss.getSheetByName(SHEET.M_DESTINATION);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const idCol   = DEST_IDX.DEST_ID + 1;
    const idData  = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
    let targetRow = -1;

    for (let i = 0; i < idData.length; i++) {
      if (String(idData[i][0]).trim() === destId) {
        targetRow = i + 2; break;
      }
    }

    if (targetRow === -1) {
      logWarn('DestinationService', `updateDestinationStats: ไม่พบ destId ${destId}`);
      return;
    }

    // [FIX v5.4.002] Batch write — อ่าน 3 คอลัมน์ แก้ 3 คอลัมน์ ในครั้งเดียว
    const lastSeenCol    = DEST_IDX.LAST_SEEN      + 1;
    const usageCountCol  = DEST_IDX.USAGE_COUNT    + 1;
    const delivDateCol   = DEST_IDX.DELIVERY_DATE  + 1;

    const now = new Date();
    const currUsageCount = Number(sheet.getRange(targetRow, usageCountCol).getValue()) || 0;

    // สร้าง Array สำหรับ Batch Write (3 คอลัมน์ติดกัน: LAST_SEEN, USAGE_COUNT, DELIVERY_DATE)
    const minCol = Math.min(lastSeenCol, usageCountCol, delivDateCol);
    const maxCol = Math.max(lastSeenCol, usageCountCol, delivDateCol);
    const numCols = maxCol - minCol + 1;

    // อ่านแถวปัจจุบัน
    const rowData = sheet.getRange(targetRow, minCol, 1, numCols).getValues()[0];

    // แก้ไขค่าที่ต้องการ
    rowData[lastSeenCol - minCol]    = now;
    rowData[usageCountCol - minCol]  = currUsageCount + 1;

    if (deliveryDate) {
      const safeDate = deliveryDate instanceof Date ? deliveryDate : new Date(deliveryDate);
      if (!isNaN(safeDate.getTime())) {
        rowData[delivDateCol - minCol] = safeDate;
      }
    }

    // Batch Write ทีเดียว
    sheet.getRange(targetRow, minCol, 1, numCols).setValues([rowData]);

    invalidateDestCache_();

  } catch (err) {
    logError('DestinationService', `updateDestinationStats ล้มเหลว: ${err.message}`);
  }
}

// ============================================================
// SECTION 3: Query Functions
// ============================================================

/**
 * getDestsByPersonId
 * [FIX v003] !== ARCHIVED → === ACTIVE
 */
function getDestsByPersonId(personId) {
  const allDests = loadAllDestinations_();
  return allDests
    .filter(d => d.personId === personId && d.status === APP_CONST.STATUS_ACTIVE)
    .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
}

function getDestsByPlaceId(placeId) {
  const allDests = loadAllDestinations_();
  return allDests
    .filter(d => d.placeId === placeId && d.status === APP_CONST.STATUS_ACTIVE)
    .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
}

function getDestsByPersonAndPlace(personId, placeId) {
  const allDests = loadAllDestinations_();
  return allDests
    .filter(d =>
      d.personId === personId &&
      d.placeId  === placeId  &&
      d.status   === APP_CONST.STATUS_ACTIVE
    )
    .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
}

function getDominantDestByGeo(geoId) {
  const allDests  = loadAllDestinations_();
  const filtered  = allDests
    .filter(d => d.geoId === geoId && d.status === APP_CONST.STATUS_ACTIVE)
    .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
  return filtered.length > 0 ? filtered[0] : null;
}

// ============================================================
// SECTION 4: Data Loaders
// ============================================================

function loadAllDestinations_() {
  const cacheKey = 'M_DEST_ALL';
  const cache    = CacheService.getScriptCache();
  const cached   = cache.get(cacheKey);
  if (cached) { try { return JSON.parse(cached); } catch(e) {} }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_DESTINATION);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1,
                SCHEMA[SHEET.M_DESTINATION].length).getValues();

  const result = rows
    .filter(r => r[DEST_IDX.DEST_ID])
    // [FIX v003] filter ก่อน map — กรอง ARCHIVED และ MERGED
    .filter(r => r[DEST_IDX.STATUS] !== APP_CONST.STATUS_ARCHIVED &&
                 r[DEST_IDX.STATUS] !== APP_CONST.STATUS_MERGED)
    .map(r => ({
      destId:     String(r[DEST_IDX.DEST_ID]      || ''),
      personId:   String(r[DEST_IDX.PERSON_ID]    || ''),
      placeId:    String(r[DEST_IDX.PLACE_ID]     || ''),
      geoId:      String(r[DEST_IDX.GEO_ID]       || ''),
      lat:        Number(r[DEST_IDX.LAT]           || 0),
      lng:        Number(r[DEST_IDX.LNG]           || 0),
      routeLabel: String(r[DEST_IDX.ROUTE_LABEL]  || ''),  // [FIX v003] เพิ่ม
      usageCount: Number(r[DEST_IDX.USAGE_COUNT]  || 0),
      lastSeen:   r[DEST_IDX.LAST_SEEN]            || '',
      status:     String(r[DEST_IDX.STATUS]        || ''),
    }));

  try { cache.put(cacheKey, JSON.stringify(result), AI_CONFIG.CACHE_TTL_SEC); }
  catch(e) { logWarn('DestinationService', 'M_DESTINATION Cache เต็ม'); }
  return result;
}

function invalidateDestCache_() {
  CacheService.getScriptCache().remove('M_DEST_ALL');
}

/**
 * getDestinationsByPerson — [ADD v5.1.001] ดึง Destination ทั้งหมดของบุคคล
 * @param {string} personId
 */
function getDestinationsByPerson(personId) {
  return getDestsByPersonId(personId);
}

/**
 * getDestinationsByPlace — [ADD v5.1.001] ดึง Destination ทั้งหมดของสถานที่
 * @param {string} placeId
 */
function getDestinationsByPlace(placeId) {
  return getDestsByPlaceId(placeId);
}
