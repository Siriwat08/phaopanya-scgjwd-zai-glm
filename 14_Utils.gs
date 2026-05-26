/**
 * VERSION: 5.4.001
 * FILE: 14_Utils.gs
 * LMDS V5.4 — Utility Functions
 * ===================================================
 * PURPOSE:
 *   รวบรวมฟังก์ชันช่วยทั่วไปที่ใช้ร่วมกันทั่วระบบ
 *   เช่น ID Generator, Hash, String similarity, LatLng parser
 * ===================================================
 * CHANGELOG:
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [ADD] Comprehensive header documentation
 *   v5.4.000 (2026-05-24):
 *     - [UPGRADE] Version bump to 5.4.000
 *     - [ADD] Comprehensive header documentation
 *     - [ADD] DEPENDENCIES section with module relationships
 *     - [ENHANCE] Detailed module interconnection mapping
 *   v5.2.001 (PH2 Hardening):
 *     - [FIX] Consolidated all GPS & String utilities
 *     - [ADD] AI Reasoning Tier F Support
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config (SHEET.SOURCE, SRC_IDX.SYNC_STATUS, AI_CONFIG.MODEL)
 *   CALLS (Invokes):
 *     - logError/logInfo/logWarn() → 03_SetupSheets
 *     - getGeminiApiKey() → 01_Config
 *   EXPORTS TO:
 *     - ALL modules (06-21) — Most widely used utility module
 *   SHEETS ACCESSED:
 *     - SHEET.SOURCE (Write: resetSourceSyncStatus clears sync column)
 * ===================================================
 * ARCHITECTURE:
 *   Shared Utility Library
 *   ┌──────────────────────────────────────────────┐
 *   │  String Similarity                           │
 *   │  ├─ levenshteinDistance (edit distance)       │
 *   │  └─ diceCoefficient / buildBigramSet_        │
 *   │  GPS & Distance                              │
 *   │  ├─ haversineDistanceM (meters)              │
 *   │  ├─ haversineDistanceKm (kilometers)         │
 *   │  ├─ isValidLatLng (Thailand bounds check)    │
 *   │  └─ parseLatLng (string → object)            │
 *   │  ID Generation                               │
 *   │  ├─ generateShortId (12-char UUID prefix)    │
 *   │  └─ generateMd5Hash (cache key)              │
 *   │  AI Integration                              │
 *   │  ├─ callGeminiAPI (Gemini REST API)          │
 *   │  └─ cleanAIResponse_ (strip markdown)        │
 *   │  Infrastructure                              │
 *   │  ├─ callSpreadsheetWithRetry (exponential bf)│
 *   │  ├─ toThaiDateStr (Buddhist calendar)        │
 *   │  ├─ normalizeInvoiceNo (e-notation safe)     │
 *   │  └─ resetSourceSyncStatus (UI-driven reset)  │
 *   └──────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: String Similarity
// ============================================================

/**
 * levenshteinDistance — ระยะห่างระหว่าง 2 String
 * @param {string} strA
 * @param {string} strB
 * @return {number}
 */
function levenshteinDistance(strA, strB) {
  const lenA = strA.length;
  const lenB = strB.length;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;
  if (strA === strB) return 0;

  const matrix = [];
  for (let i = 0; i <= lenA; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= lenB; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = strA[i - 1] === strB[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j]     + 1,
        matrix[i][j - 1]     + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[lenA][lenB];
}

/**
 * diceCoefficient — Dice Similarity ด้วย Bigram
 * @param {string} strA
 * @param {string} strB
 * @return {number} 0.0 – 1.0
 */
function diceCoefficient(strA, strB) {
  if (!strA || !strB) return 0;
  if (strA === strB) return 1;
  if (strA.length < 2 || strB.length < 2) return 0;

  const bigramsA    = buildBigramSet_(strA);
  const bigramsB    = buildBigramSet_(strB);
  let intersection  = 0;

  bigramsA.forEach(bg => {
    if (bigramsB.has(bg)) intersection++;
  });

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

/**
 * buildBigramSet_ — สร้าง Set ของ Bigram จาก String
 */
function buildBigramSet_(str) {
  const set = new Set();
  for (let i = 0; i < str.length - 1; i++) {
    set.add(str.substring(i, i + 2));
  }
  return set;
}

/**
 * resetSourceSyncStatus — [NEW v5.2.003] เคลียร์ค่า SYNC_STATUS เพื่อรันใหม่
 * @summary ใช้สำหรับกรณีที่ต้องการประมวลผลข้อมูลในชีตต้นทางใหม่อีกครั้ง
 */
function resetSourceSyncStatus() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.alert(
    '🔄 ยืนยันการรีเซ็ตสถานะ?',
    'ระบบจะล้างค่าในคอลัมน์ SYNC_STATUS ของชีตต้นทางทั้งหมด\n' +
    'เพื่อให้ระบบกลับมาประมวลผลแถวเหล่านั้นใหม่อีกครั้งเมื่อกด Run Pipeline\n\n' +
    'ยืนยันการดำเนินการหรือไม่?',
    ui.ButtonSet.YES_NO
  );
  
  if (resp !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.SOURCE);
  if (!sheet) {
    ui.alert('❌ ไม่พบชีตต้นทาง: ' + SHEET.SOURCE);
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    ui.alert('ℹ️ ไม่มีข้อมูลให้รีเซ็ต');
    return;
  }

  // คอลัมน์ SYNC_STATUS (Index 36 = คอลัมน์ AK)
  const colIdx = SRC_IDX.SYNC_STATUS + 1; 
  
  try {
    sheet.getRange(2, colIdx, lastRow - 1, 1).clearContent();
    // ระบายสีพื้นหลังกลับเป็นปกติ
    sheet.getRange(2, colIdx, lastRow - 1, 1).setBackground(null);
    
    ui.alert('✅ รีเซ็ตสถานะสำเร็จ!\n\nคุณสามารถกดเมนู "Run Full Pipeline" เพื่อเริ่มประมวลผลใหม่ได้เลยครับ');
    logInfo('Utils', 'รีเซ็ตสถานะ SYNC ในชีตต้นทางเรียบร้อยแล้ว');
  } catch (err) {
    logError('Utils', 'เกิดข้อผิดพลาดในการรีเซ็ต: ' + err.message);
    ui.alert('❌ เกิดข้อผิดพลาด: ' + err.message);
  }
}

// ============================================================
// SECTION 2: GPS Distance
// ============================================================

/**
 * haversineDistanceM — ระยะทางระหว่าง 2 พิกัด GPS (เมตร)
 * [FIX v003] เพิ่ม Math.min(1, aVal) ป้องกัน aVal>1 → sqrt(NaN)
 */
function haversineDistanceM(lat1, lng1, lat2, lng2) {
  const earthRadius = 6371000;
  const toRad       = Math.PI / 180;

  const diffLat    = (lat2 - lat1) * toRad;
  const diffLng    = (lng2 - lng1) * toRad;

  const sinHalfLat = Math.sin(diffLat / 2);
  const sinHalfLng = Math.sin(diffLng / 2);

  const aVal = sinHalfLat * sinHalfLat +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
    sinHalfLng * sinHalfLng;

  // [FIX v003] clamp aVal ให้อยู่ใน [0,1] ป้องกัน Floating Point error
  const safeAVal    = Math.min(1, Math.max(0, aVal));
  const centralAngle = 2 * Math.atan2(Math.sqrt(safeAVal),
                                       Math.sqrt(1 - safeAVal));
  return earthRadius * centralAngle;
}

/**
 * haversineDistanceKm — ระยะทาง (กิโลเมตร)
 */
function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  return haversineDistanceM(lat1, lng1, lat2, lng2) / 1000;
}

// ============================================================
// SECTION 3: UUID / Hash
// ============================================================

/**
 * generateShortId — สร้าง ID สั้น 12 ตัวอักษร
 */
function generateShortId(prefix) {
  const raw = Utilities.getUuid().replace(/-/g, '').toUpperCase();
  return (prefix || '') + raw.substring(0, 12);
}

/**
 * generateMd5Hash — สร้าง MD5 Hex สำหรับ Cache Key
 */
function generateMd5Hash(input) {
  const rawBytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    String(input)
  );
  return rawBytes.map(b => {
    const hex = (b < 0 ? b + 256 : b).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

// ============================================================
// SECTION 4: Date Utilities
// ============================================================

/**
 * toThaiDateStr — แปลง Date เป็น String รูปแบบไทย
 * [FIX v003] เพิ่ม Invalid Date guard
 */
function toThaiDateStr(date) {
  if (!date) return '';
  const d = new Date(date);

  // [FIX v003] ป้องกัน Invalid Date → คืน '' แทน 'NaN/NaN/NaN'
  if (isNaN(d.getTime())) return '';

  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year  = d.getFullYear() + 543;
  return `${day}/${month}/${year}`;
}

/**
 * isValidLatLng — ตรวจสอบว่าพิกัดอยู่ในประเทศไทย
 * [FIX v003] && → || ป้องกัน lat=0.1, lng=0 ผ่านผิด
 */
function isValidLatLng(lat, lng) {
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (isNaN(numLat) || isNaN(numLng)) return false;

  // [FIX v003] เปลี่ยนเป็น || — ถ้า lat=0 หรือ lng=0 ถือว่าไม่มีพิกัด
  if (numLat === 0 || numLng === 0) return false;

  // กรอบประเทศไทย
  return numLat >= 5.5  && numLat <= 20.5 &&
         numLng >= 97.5 && numLng <= 105.7;
}

/**
 * parseLatLng — แปลง String "lat,lng" เป็น Object
 */
function parseLatLng(latLngStr) {
  if (!latLngStr) return null;
  const cleaned = String(latLngStr).trim();

  // รองรับ separator: , / | หรือ space
  const parts = cleaned.split(/[,\/|\s]+/);
  if (parts.length < 2) return null;

  const lat = parseFloat(parts[0].trim());
  const lng = parseFloat(parts[1].trim());
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng };
}

// ============================================================
// SECTION 5: AI Integration
// ============================================================

/**
 * callGeminiAPI — เรียกใช้งาน Google Gemini API
 * [ADD v003] รองรับ AI Reasoning Tier F
 */
function callGeminiAPI(prompt, modelName = 'gemini-1.5-flash') {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('กรุณาตั้งค่า GEMINI_API_KEY ในเมนูระบบ');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      topP: 1,
      topK: 1,
      maxOutputTokens: 2048,
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const resCode  = response.getResponseCode();
    const resText  = response.getContentText();

    if (resCode !== 200) {
      logError('Utils', `Gemini API Error (${resCode}): ${resText}`);
      return null;
    }

    const json = JSON.parse(resText);
    if (json.candidates && json.candidates[0].content && json.candidates[0].content.parts) {
      return json.candidates[0].content.parts[0].text;
    }
    return null;

  } catch (err) {
    logError('Utils', `callGeminiAPI ล้มเหลว: ${err.message}`);
    return null;
  }
}

/**
 * cleanAIResponse_ — ล้าง Markdown หรือข้อความส่วนเกินจาก AI
 */
function cleanAIResponse_(text) {
  if (!text) return '';
  return text.replace(/```json/g, '')
             .replace(/```/g, '')
             .trim();
}

/**
 * callSpreadsheetWithRetry — [NEW v5.2.015] ป้องกันความล้มเหลวชั่วคราวของ Google Spreadsheet Service
 * @param {Function} apiFunc - ฟังก์ชันที่เข้าถึงสเปรดชีต
 * @param {number} maxRetries - จำนวนครั้งสูงสุดในการลองใหม่
 * @param {number} baseDelayMs - เวลาหน่วงตั้งต้น (ms)
 * @return {*}
 */
function callSpreadsheetWithRetry(apiFunc, maxRetries = 3, baseDelayMs = 500) {
  let lastErr = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return apiFunc();
    } catch (err) {
      lastErr = err;
      const errMsg = err.message || '';
      // เช็คว่ามีคำสำคัญเกี่ยวกับความผิดพลาดของระบบ Google Spreadsheet หรือไม่
      if (
        errMsg.indexOf('Spreadsheet') !== -1 ||
        errMsg.indexOf('สเปรดชีต') !== -1 ||
        errMsg.indexOf('Action not allowed') !== -1 ||
        errMsg.indexOf('Service error') !== -1 ||
        errMsg.indexOf('failed while accessing') !== -1 ||
        errMsg.indexOf('หยุดทำงานขณะเข้าถึงเอกสาร') !== -1
      ) {
        logWarn('Utils', `Spreadsheet Service Crash (Attempt ${attempt}/${maxRetries}): ${errMsg}. กำลังรอเพื่อลองใหม่...`);
        if (attempt < maxRetries) {
          Utilities.sleep(baseDelayMs * attempt * (1 + Math.random())); // Exponential backoff + jitter
          continue;
        }
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * normalizeInvoiceNo — [NEW v5.2.016] จัดรูปแบบเลขที่ Invoice ให้เป็น String ปกติ
 * ช่วยป้องกันความซ้ำซ้อนและการประมวลผลวนลูปเมื่อ Google อ่านค่า 122,206,552,193,122,000,000,000 
 * เป็น e-notation (เช่น 1.22206552193122e+23) หรือมีลูกน้ำปนเป
 * @param {*} inv - เลขที่ Invoice
 * @return {string}
 */
function normalizeInvoiceNo(inv) {
  if (inv === null || inv === undefined) return '';
  let str = String(inv).trim();
  str = str.replace(/,/g, '');
  if (/^\d+(\.\d+)?[eE]\+?\d+$/.test(str)) {
    try {
      const parts = str.toLowerCase().split('e');
      let numStr = parts[0];
      const exp = parseInt(parts[1], 10);
      const dotIndex = numStr.indexOf('.');
      if (dotIndex !== -1) {
        const decimals = numStr.length - dotIndex - 1;
        numStr = numStr.replace('.', '');
        if (exp >= decimals) {
          str = numStr + '0'.repeat(exp - decimals);
        } else {
          str = numStr.slice(0, dotIndex + exp) + '.' + numStr.slice(dotIndex + exp);
        }
      } else {
        str = numStr + '0'.repeat(exp);
      }
    } catch (e) {}
  }
  if (str.endsWith('.0')) str = str.slice(0, -2);
  return str;
}

/**
 * safeUiAlert_ — แสดง alert เฉพาะเมื่อมี UI context (trigger-safe)
 * [NEW v5.4.002] ย้ายมาจาก 13_ReportService.gs + 16_GeoDictionaryBuilder.gs
 * เพื่อไม่ให้ซ้ำกัน — ฟังก์ชันเดียวกันใช้ได้ทุกโมดูล
 * @param {string} message - ข้อความที่จะแสดง
 * @param {string} [title] - หัวข้อ (optional)
 */
function safeUiAlert_(message, title) {
  try {
    if (title) {
      SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
    } else {
      SpreadsheetApp.getUi().alert(message);
    }
  } catch (e) {
    // รันจาก Trigger ไม่มี UI context → log เงียบๆ
    try { logInfo('System', `[UI Message] ${String(message).substring(0, 200)}`); } catch (_) {}
  }
}
