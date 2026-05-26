/**
 * VERSION: 5.4.001
 * FILE: 05_NormalizeService.gs
 * LMDS V5.4 — Thai Name & Place Normalization
 * ===================================================
 * PURPOSE:
 *   ทำความสะอาดและ normalize ชื่อบุคคลและสถานที่
 *   เป็น Single Source of Truth สำหรับการทำความสะอาดข้อมูล
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
 *     - [FIX] buildThaiPhoneticKey: ลด Regex range ซ้อน
 *     - [FIX] normalizePersonNameFull: replace global (g flag)
 *     - [FIX] COMPANY_SUFFIX_LIST: sort longest-first
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 14_Utils (diceCoefficient, levenshteinDistance) [for scoring in other files]
 *   CALLS (Invokes):
 *     - logInfo() → 03_SetupSheets
 *     - escapeRegex_() → (self)
 *     - buildNormResult_() → (self)
 *   EXPORTS TO:
 *     - 06_PersonService (normalizePersonNameFull)
 *     - 07_PlaceService (normalizePlaceName)
 *     - 17_SearchService (normalizePersonNameFull, normalizePlaceName)
 *     - 10_MatchEngine (all matching)
 *     - 16_GeoDictionaryBuilder (normalizeForCompare)
 *     - 21_AliasService (normalizeForCompare)
 *     - 19_Hardening (normalizeForCompare)
 *     - 20_ThGeoService (normalizeForCompare)
 *   SHEETS ACCESSED:
 *     - None (pure computation module)
 * ===================================================
 * ARCHITECTURE:
 *   Text Cleaner
 *   ┌──────────────────────────────────────────────────────┐
 *   │ normalizePersonNameFull (7 steps):                   │
 *   │   1. extractPhone                                   │
 *   │   2. extractDoc                                     │
 *   │   3. extractDeliveryNotes                           │
 *   │   4. checkCompany                                   │
 *   │   5. stripPrefix                                    │
 *   │   6. cleanSpecialChars                              │
 *   │   7. buildNormResult_                               │
 *   │                                                     │
 *   │ normalizePlaceName (4 steps):                        │
 *   │   1. extractPhone/Doc                               │
 *   │   2. detectType                                     │
 *   │   3. extractDeliveryNotes                           │
 *   │   4. stripSuffix                                    │
 *   │                                                     │
 *   │ buildThaiPhoneticKey → consonant key                │
 *   │ normalizeForCompare → lowercase + strip spaces      │
 *   └──────────────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: Dictionaries
// ============================================================

const PERSON_PREFIX_LIST = [
  'พลเอก','พลโท','พลตรี','พันเอก','พันโท','พันตรี',
  'ร้อยเอก','ร้อยโท','ร้อยตรี',
  'จ่าสิบเอก','จ่าสิบโท','จ่าสิบตรี',
  'สิบเอก','สิบโท','สิบตรี','พลทหาร',
  'พลเรือเอก','พลเรือโท','พลเรือตรี',
  'นาวาเอก','นาวาโท','นาวาตรี',
  'เรือเอก','เรือโท','เรือตรี',
  'พลอากาศเอก','พลอากาศโท','พลอากาศตรี',
  'นาวาอากาศเอก','นาวาอากาศโท','นาวาอากาศตรี',
  'เรืออากาศเอก','เรืออากาศโท','เรืออากาศตรี',
  'พลตำรวจเอก','พลตำรวจโท','พลตำรวจตรี',
  'พันตำรวจเอก','พันตำรวจโท','พันตำรวจตรี',
  'ร้อยตำรวจเอก','ร้อยตำรวจโท','ร้อยตำรวจตรี',
  'สิบตำรวจเอก','สิบตำรวจโท','สิบตำรวจตรี',
  'พลตำรวจ','ผู้กำกับ','รองผู้กำกับ',
  'ศาสตราจารย์','รองศาสตราจารย์','ผู้ช่วยศาสตราจารย์',
  'นายแพทย์','แพทย์หญิง','ทันตแพทย์','เภสัชกร',
  'วิศวกร','สถาปนิก',
  'นาย','นาง','นางสาว','น.ส.',
  'คุณ','ครู','อาจารย์',
  'ดร.','ดร',
  'พ.อ.','พ.ต.','ร.อ.','ร.ต.','ส.อ.',
  'พ.ต.อ.','พ.ต.ท.','พ.ต.ต.',
  'ร.ต.อ.','ร.ต.ท.','ร.ต.ต.',
];

/**
 * SORTED_PREFIX_LIST — [ADD v003] Pre-sort ครั้งเดียว
 * แทนการ sort ทุกครั้งที่เรียก normalizePersonNameFull
 */
const SORTED_PREFIX_LIST = PERSON_PREFIX_LIST
  .slice()
  .sort((a, b) => b.length - a.length);

/**
 * COMPANY_SUFFIX_LIST — [FIX v003] เรียงยาวไปสั้น (longest-first)
 * ป้องกัน "จำกัด" ตัดก่อน "ห้างหุ้นส่วนจำกัด"
 */
const COMPANY_SUFFIX_LIST = [
  'จำกัด(มหาชน)', 'จำกัด (มหาชน)',
  'ห้างหุ้นส่วนจำกัด', 'ห้างหุ้นส่วนสามัญ',
  'มหาชน', 'บริษัท', 'บมจ.', 'บจก.', 'หจก.', 'หสน.',
  'บจ.', 'หจ.', 'บมจ', 'บจก', 'หจก',
  'จำกัด', '(จำกัด)', 'จก.',
  'ร้านค้า', 'กิจการ', 'ร้าน',
].sort((a, b) => b.length - a.length); // sort ทันทีตอน declare

const CHAIN_STORE_LIST = [
  'ไทวัสดุ','โฮมโปร','โกลบอลเฮ้าส์','สยามโกลบอล',
  'แพลนท์ปูน','ปูนซีเมนต์','ศูนย์บริการ',
  'ไซต์งาน','โครงการ','หน่วยงาน',
  'วัสดุภัณฑ์','วัสดุก่อสร้าง',
];

const DELIVERY_NOTE_LIST = [
  'ฝากป้อม','ฝากรปภ','ฝากยาม','ฝากรักษาความปลอดภัย',
  'COD','เก็บเงินปลายทาง',
  'ห้ามโยน','ระวังแตก','ระวังหัก','บอบบาง',
  'แช่เย็น','เก็บในที่เย็น',
  'ส่งด่วน','ด่วนมาก','ด่วนพิเศษ',
  'ส่งก่อน','ส่งหลัง',
  'นัดส่ง','โทรก่อนส่ง','โทรนัด','โทร.','โทร','ติดต่อ','เบอร์โทร','เบอร์','เบอร์ติดต่อ',
].sort((a, b) => b.length - a.length); // [FIX v008] เรียงยาวไปสั้น

// ============================================================
// SECTION 2: Regex Patterns
// ============================================================

const PHONE_PATTERN   = /(?:\+66|0)[0-9]{1,2}[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{4}/g;
const DOC_NO_PATTERN  = /\b[0-9]{8,}\b/g;
const REF_NO_PATTERN  = /#[0-9]+|No\.?\s*[0-9]+/gi;

// ============================================================
// SECTION 3: normalizePersonNameFull
// ============================================================

/**
 * runNormalize — Entry Point จาก Menu / Pipeline
 * [FIX v003] เพิ่ม comment อธิบายว่า Normalize เกิดใน processOneRow()
 * ไม่ใช่ Batch แยก — ฟังก์ชันนี้เป็น Placeholder สำหรับขยายอนาคต
 */
function runNormalize() {
  // Normalize เกิดใน processOneRow() ของ 10_MatchEngine.gs ต่อทุก row
  // ไม่ต้องทำ Batch แยก เพราะ Source Repository ส่ง srcObj เข้า Engine แล้ว
  logInfo('NormalizeService', 'Normalize ทำงานใน processOneRow() ของ MatchEngine');
}

/**
 * normalizePersonNameFull — ล้างชื่อบุคคลแบบสมบูรณ์
 * @param {string} rawName
 */
function normalizePersonNameFull(rawName) {
  const original      = String(rawName || '').trim();
  let working         = original;
  const notes         = [];
  let extractedPhone  = '';
  let extractedDoc    = '';
  let isCompany       = false;

  if (!working) {
    return buildNormResult_(original, '', false, '', '', []);
  }

  // --- Step 1: ดึงเบอร์โทรออก ---
  const phoneMatches = working.match(PHONE_PATTERN);
  if (phoneMatches) {
    extractedPhone = phoneMatches[0].replace(/[-.\s]/g, '');
    // [UPGRADE v5.2.003] ไม่เก็บลง Note สำหรับ Person (เพราะมีคอลัมน์ Phone แยกแล้ว)
    working = working.replace(PHONE_PATTERN, '').trim();
  }

  // --- Step 2: ดึงเลขเอกสารออก ---
  const docMatches = working.match(DOC_NO_PATTERN);
  if (docMatches) {
    extractedDoc = docMatches.join(',');
    // [FIX v5.2.002] เก็บลง Note ห้ามทิ้ง
    docMatches.forEach(d => notes.push(d));
    working = working.replace(DOC_NO_PATTERN, '').trim();
  }
  const refMatches = working.match(REF_NO_PATTERN);
  if (refMatches) {
    const refStr = refMatches.join(',');
    extractedDoc = extractedDoc ? `${extractedDoc},${refStr}` : refStr;
    // [FIX v5.2.002] เก็บลง Note ห้ามทิ้ง
    refMatches.forEach(r => notes.push(r));
    working = working.replace(REF_NO_PATTERN, '').trim();
  }

  // --- Step 3: ดึง Delivery Notes ออก (global replace) ---
  DELIVERY_NOTE_LIST.forEach(noteWord => {
    if (working.includes(noteWord)) {
      notes.push(noteWord);
      const safeNote = escapeRegex_(noteWord);
      working = working.replace(new RegExp(safeNote, 'g'), '').trim();
    }
  });

  // --- Step 4: ตรวจสอบนิติบุคคล ---
  const hasCompanySuffix = COMPANY_SUFFIX_LIST.some(s => {
    const idx = working.indexOf(s);
    if (idx === -1) return false;
    const before = idx > 0 ? working[idx - 1] : ' ';
    return /[\s\(ก-๙a-zA-Z]/.test(before) || idx === 0;
  });
  const hasChainStore = CHAIN_STORE_LIST.some(s => working.includes(s));

  if (hasCompanySuffix || hasChainStore) {
    isCompany = true;
    // [FIX v5.2.002] เก็บ Suffix ลง Note ก่อนตัดออก
    COMPANY_SUFFIX_LIST.forEach(suffix => {
      if (working.includes(suffix)) {
        notes.push(suffix);
        const safeSuffix = escapeRegex_(suffix);
        working = working.replace(new RegExp(safeSuffix, 'gi'), '').trim();
      }
    });
    // [FIX v5.2.002] เก็บ Chain Store ลง Note ก่อนตัดออก
    CHAIN_STORE_LIST.forEach(chain => {
      if (working.includes(chain)) {
        notes.push(chain);
        const safeChain = escapeRegex_(chain);
        working = working.replace(new RegExp(safeChain, 'gi'), '').trim();
      }
    });
  }

  // --- Step 5: ตัดคำนำหน้า ---
  if (!isCompany) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const prefix of SORTED_PREFIX_LIST) {
        if (working.startsWith(prefix)) {
          notes.push(prefix);
          working = working.substring(prefix.length).trim();
          changed = true;
          break;
        }
      }
    }
  }

  // --- Step 5.1: หักหัวเขา (Thai Acronyms) ---
  const tailPatterns = [/^\s*ว่าน\s+/, /^\s*โอ๊ะ\s+/, /^\s*ชาย\s+/, /^\s*หญิง\s+/];
  tailPatterns.forEach(pattern => {
    const match = working.match(pattern);
    if (match) {
      notes.push(match[0].trim()); // [FIX v5.2.002] เก็บลง Note
      working = working.replace(pattern, '').trim();
    }
  });

  // --- Step 6: ล้างช่องว่างและอักขระพิเศษ ---
  working = working.replace(/\s+/g, ' ')
                   .replace(/[^\u0E00-\u0E7Fa-zA-Z0-9\s]/g, '')
                   .trim();

  return buildNormResult_(
    original, working, isCompany,
    extractedPhone, extractedDoc, notes
  );
}

/**
 * buildNormResult_ — สร้าง Object ผลลัพธ์ Normalize
 */
function buildNormResult_(original, cleanName, isCompany, phone, docNo, notes) {
  return {
    cleanName:      cleanName,
    isCompany:      isCompany,
    extractedPhone: phone,
    extractedDocNo: docNo,
    deliveryNotes:  notes,
    originalName:   original,
  };
}

// ============================================================
// SECTION 4: normalizePlaceName
// ============================================================

/**
 * normalizePlaceName — ล้างชื่อสถานที่
 * [FIX v003] Regex บ้าน → กัน false positive "บ้านโป่ง" "บ้านนา"
 */
function normalizePlaceName(rawPlace) {
  let working   = String(rawPlace || '').trim();
  const notes   = [];
  let placeType = 'other';

  if (!working) {
    return { cleanPlace: '', placeType, notes: [] };
  }

  // --- Step 1: ดึงเบอร์โทรและเลขเอกสารออก (เก็บลง Note) ---
  const phoneMatches = working.match(PHONE_PATTERN);
  if (phoneMatches) {
    phoneMatches.forEach(p => notes.push(p));
    working = working.replace(PHONE_PATTERN, '').trim();
  }
  const docMatches = working.match(DOC_NO_PATTERN);
  if (docMatches) {
    docMatches.forEach(d => notes.push(d));
    working = working.replace(DOC_NO_PATTERN, '').trim();
  }

  // --- Step 2: ตรวจจับประเภทสถานที่ ---
  if (/คอนโด|คอนโดมิเนียม|Condo|อาคารชุด/i.test(working)) {
    placeType = 'condo';
  } else if (/ห้างสรรพสินค้า|เซ็นทรัล|เทสโก้|โลตัส|มอลล์|Mall|Plaza|Center|Centre/i.test(working)) {
    placeType = 'mall';
  } else if (
    /หมู่บ้าน|บ้านเลขที่|^บ้าน\s|Village|Moo\s*[0-9]/i.test(working)
  ) {
    placeType = 'house';
  } else if (/ไซต์งาน|โครงการ|ก่อสร้าง|Site/i.test(working)) {
    placeType = 'site';
  }

  // --- Step 3: ดึง Delivery Notes ออก ---
  DELIVERY_NOTE_LIST.forEach(noteWord => {
    if (working.includes(noteWord)) {
      notes.push(noteWord);
      const safeNote = escapeRegex_(noteWord);
      working = working.replace(new RegExp(safeNote, 'g'), '').trim();
    }
  });

  // --- Step 4: ดึงพวก บจก./จำกัด ออก ---
  COMPANY_SUFFIX_LIST.forEach(suffix => {
    if (working.includes(suffix)) {
      notes.push(suffix);
      const safeSuffix = escapeRegex_(suffix);
      working = working.replace(new RegExp(safeSuffix, 'gi'), '').trim();
    }
  });

  working = working.replace(/\s+/g, ' ').trim();
  return { cleanPlace: working, placeType, notes };
}

// ============================================================
// SECTION 5: Phonetic & Compare
// ============================================================

/**
 * buildThaiPhoneticKey — สร้าง Phonetic Key จากชื่อไทย
 * [FIX v003] ลด Regex range ซ้อน: เดิม [\u0E30-\u0E4E\u0E47-\u0E4E]
 *            \u0E47-\u0E4E ซ้อนกับ \u0E30-\u0E4E อยู่แล้ว → ลดเป็นช่วงเดียว
 */
function buildThaiPhoneticKey(thaiName) {
  if (!thaiName) return '';
  // ลบสระและวรรณยุกต์ไทย (U+0E30–U+0E4E) และ space
  return thaiName.replace(/[\u0E30-\u0E4E\s]/g, '').substring(0, 6);
}

/**
 * normalizeForCompare — แปลงชื่อเพื่อเปรียบเทียบ
 */
function normalizeForCompare(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[.\-_]/g, '')
    .toLowerCase();
}

// ============================================================
// SECTION 6: Helper
// ============================================================

/**
 * escapeRegex_ — escape special chars สำหรับ new RegExp()
 */
function escapeRegex_(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/**
 * validatePersonName — [ADD v5.1.001] ตรวจสอบชื่อมีคุณภาพ
 */
function validatePersonName(name) {
  if (!name) return false;
  const normalized = String(name).toLowerCase().trim();
  if (normalized.length < 2) return false;
  if (/^[0-9]+$/.test(normalized)) return false;
  return true;
}

/**
 * validateAddress — [ADD v5.1.001] ตรวจสอบที่อยู่มีคุณภาพ
 */
function validateAddress(address) {
  if (!address) return false;
  const normalized = String(address).toLowerCase().trim();
  if (normalized.length < 5) return false;
  return true;
}
