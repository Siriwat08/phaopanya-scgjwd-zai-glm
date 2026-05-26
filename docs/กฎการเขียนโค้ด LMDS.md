\# กฎการเขียนโค้ด LMDS  
\> \*\*เป้าหมาย:\*\* โค้ดสะอาด บำรุงรักษาง่าย ปลอดภัย ทำงานได้จริงใน GAS (Time Limit 6 นาที, Shared Global Scope)  
\---  
\#\# สารบัญ  
1\. \[Clean Code\](\#ข้อ-1--clean-code)  
2\. \[Single Responsibility\](\#ข้อ-2--single-responsibility)  
3\. \[No Hardcode Index\](\#ข้อ-3--no-hardcode-index)  
4\. \[Batch Operations Only\](\#ข้อ-4--batch-operations-only)  
5\. \[Checkpoint & Resume\](\#ข้อ-5--checkpoint--resume)  
6\. \[Document Dependencies\](\#ข้อ-6--document-dependencies)  
7\. \[No Fake Function Calls\](\#ข้อ-7--no-fake-function-calls)  
8\. \[Namespace Pattern\](\#ข้อ-8--namespace-pattern)  
9\. \[No Global State\](\#ข้อ-9--no-global-state)  
10\. \[Lock Library Version\](\#ข้อ-10--lock-library-version)  
11\. \[Separate HTML Files\](\#ข้อ-11--separate-html-files)  
12\. \[Error Handling\](\#ข้อ-12--error-handling)  
13\. \[Logging with Context\](\#ข้อ-13--logging-with-context)  
14\. \[Structured File Names\](\#ข้อ-14--structured-file-names)  
15\. \[Full Files Only\](\#ข้อ-15--full-files-only)  
16\. \[Quick Reference\](\#-quick-reference-checklist)

\---

\#\# ข้อ 1 – Clean Code

\#\#\# กฎ

\- ใช้ \`camelCase\` สำหรับชื่อตัวแปรและฟังก์ชัน  
\- ชื่อต้องสื่อความหมาย ห้ามใช้ \`data\`, \`temp\`, \`x\` โดยไม่มีคำอธิบาย  
\- ฟังก์ชันควรดูได้ใน 1 หน้าจอ (\~30-50 บรรทัด)  
\- ถ้ายาวกว่านี้ → แยกเป็นฟังก์ชันย่อย (prefix ด้วย \`\_\`)

\#\#\# Pattern

\`\`\`javascript  
// ✅ ถูกต้อง  
function normalizePersonName(rawName) {  
  var name \= String(rawName).trim();  
  return name.replace(/\\s+/g, ' ');  
}

function loadAllPlaces\_() {  
  return SpreadsheetApp.getActiveSpreadsheet()  
    .getSheetByName('Places')  
    .getDataRange()  
    .getValues();  
}

// ❌ ผิด \- ชื่อไม่สื่อความหมาย  
function process(x) {  
  var temp \= x\[0\];  
  var data \= temp.split(',');  
  return data;  
}  
\`\`\`

\#\#\# เมื่อไหร่ต้องขออนุมัติ

\- ฟังก์ชันที่มีตรรกะต่อเนื่องหลายขั้นตอน (เช่น normalize \+ validate \+ transform)  
\- ฟังก์ชัน pure transformation ที่ต้องยาวเพื่อความเข้าใจ  
\- แจ้ง: ชื่อฟังก์ชัน, จำนวนบรรทัด, เหตุผล

\---

\#\# ข้อ 2 – Single Responsibility

\#\#\# กฎ

\- ฟังก์ชันเดียว \= 1 หน้าที่ (อธิบายได้โดยไม่ใช้คำว่า "และ")  
\- ถ้าทำหลายอย่าง → แยกเป็น \`\_helperFunction()\`

\#\#\# Pattern

\`\`\`javascript  
// ✅ ถูกต้อง \- แยกหน้าที่ชัดเจน  
function processPersonRow(row) {  
  var normalized \= normalizePersonName\_(row\[0\]);  
  var validated \= validatePhone\_(normalized);  
  return validated;  
}

function normalizePersonName\_(raw) {  
  return String(raw).trim().replace(/\\s+/g, ' ');  
}

function validatePhone\_(name) {  
  return name.length \> 0 ? name : null;  
}

// ❌ ผิด \- ทำหลายอย่างในฟังก์ชันเดียว  
function processData(data) {  
  // normalize \+ match \+ save \+ log  
  var clean \= normalize(data);  
  var matched \= match(clean);  
  save(matched);  
  log('done');  
}  
\`\`\`

\---

\#\# ข้อ 3 – No Hardcode Index

\#\#\# กฎ

\- ห้ามใช้ตัวเลขตรงกับคอลัมน์ เช่น \`row\[7\]\`, \`col \=== 11\`  
\- ใช้ constants จาก \`01\_Config.gs\` เท่านั้น  
\- ถ้าต้องหา dynamic → ใช้ \`getColIndex()\` จาก \`02\_Schema.gs\`

\#\#\# Pattern

\`\`\`javascript  
// ✅ ถูกต้อง  
// 01\_Config.gs  
var PERSON\_IDX \= {  
  NAME: 0,  
  PHONE: 1,  
  EMAIL: 2,  
  ADDRESS: 3,  
  STATUS: 4  
};

// ในไฟล์อื่น  
function processRow(row) {  
  var name \= row\[PERSON\_IDX.NAME\];  
  var phone \= row\[PERSON\_IDX.PHONE\];  
  return { name: name, phone: phone };  
}

// หา index จากชื่อคอลัมน์  
var colIndex \= getColIndex('PERSON', 'Email');

// ❌ ผิด \- hardcode  
var name \= row\[0\];  
var email \= row\[2\];  
sheet.getRange(2, 11, 100, 1).setValues(...);  
\`\`\`

\---

\#\# ข้อ 4 – Batch Operations Only

\#\#\# กฎ

\- ห้าม \`getValue()\`/\`setValue()\`/\`setBackground()\`/\`appendRow()\` ในลูป  
\- ต้องใช้ \`getValues()\`/\`setValues()\`/\`setBackgrounds()\` ครั้งเดียว  
\- ใช้ \`chunkArray\_()\` สำหรับข้อมูลใหญ่ (\>10,000 แถว)

\#\#\# Pattern

\`\`\`javascript  
// ✅ ถูกต้อง \- batch ครั้งเดียว  
function updateAllNames(names) {  
  var sheet \= SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Person');  
  var range \= sheet.getRange(2, PERSON\_IDX.NAME \+ 1, names.length, 1);  
  range.setValues(names.map(function(n) { return \[n\]; }));  
}

// หรือใช้ TextFinder แทนการวนหา  
function findAndUpdate() {  
  var finder \= sheet.createTextFinder('OLD\_VALUE').matchEntireCell(true);  
  var cells \= finder.findAll();  
  cells.forEach(function(cell) {  
    cell.setValue('NEW\_VALUE');  
  });  
}

// ❌ ผิด \- เรียกในลูป  
for (var i \= 0; i \< data.length; i++) {  
  sheet.getRange(i \+ 2, 5).setValue(data\[i\]\[4\]);  
}  
\`\`\`

\---

\#\# ข้อ 5 – Checkpoint & Resume

\#\#\# กฎ

Script ที่รัน \>1,000 แถว หรือใกล้ 6 นาที ต้องมี:

1\. \*\*PropertiesService\*\* เก็บ index ปัจจุบัน  
2\. \*\*Time Guard\*\* ตรวจเวลาทุก 100 แถว  
3\. \*\*saveCheckpoint\_()\*\* เมื่อใกล้ timeout

\#\#\# Pattern

\`\`\`javascript  
var CHECKPOINT\_KEY \= 'PIPELINE\_INDEX';  
var TIME\_LIMIT\_SEC \= 5 \* 60; // 5 นาที (เผื่อเวลา)

function runPipeline() {  
  var state \= loadCheckpoint\_();  
  var startTime \= Date.now();  
  var totalRows \= getDataRows\_().length;

  for (var i \= state.startIndex; i \< totalRows; i++) {  
    var row \= getDataRows\_()\[i\];  
    processRow(row);

    // ⏰ Time Guard ทุก 100 แถว  
    if (i % 100 \=== 0 && hasTimePassed\_(startTime, TIME\_LIMIT\_SEC)) {  
      saveCheckpoint\_(i);  
      logInfo('Checkpoint saved at row ' \+ i);  
      return; // หยุดและรันต่อครั้งหน้า  
    }  
  }

  // ✅ งานเสร็จสมบูรณ์ \- ลบ checkpoint  
  clearCheckpoint\_();  
  logInfo('Pipeline completed');  
}

function saveCheckpoint\_(index) {  
  PropertiesService.getScriptProperties()  
    .setProperty(CHECKPOINT\_KEY, index);  
}

function loadCheckpoint\_() {  
  var idx \= PropertiesService.getScriptProperties()  
    .getProperty(CHECKPOINT\_KEY);  
  return idx ? { startIndex: parseInt(idx) } : { startIndex: 0 };  
}

function clearCheckpoint\_() {  
  PropertiesService.getScriptProperties()  
    .deleteProperty(CHECKPOINT\_KEY);  
}

function hasTimePassed\_(startTime, limitSec) {  
  return (Date.now() \- startTime) / 1000 \> limitSec;  
}  
\`\`\`

\---

\#\# ข้อ 6 – Document Dependencies

\#\#\# กฎ

ทุกไฟล์ต้องมี comment หัวไฟล์ระบุ dependencies

\#\#\# Pattern

\`\`\`javascript  
// \============================================================================  
// 06\_PersonService.gs  
// \============================================================================  
// ⚠️ Dependencies:  
//   \- SHEET, PERSON\_IDX → 01\_Config.gs  
//   \- normalizeForCompare, getCacheJson\_ → 14\_Utils.gs  
//   \- logInfo, logError → 03\_Setup.gs  
//   \- getColIndex → 02\_Schema.gs  
// \============================================================================

var PersonService \= {  
  resolvePerson: function(row) {  
    // ...  
  }  
};  
\`\`\`

\---

\#\# ข้อ 7 – No Fake Function Calls

\#\#\# กฎ

\- ห้ามเรียกฟังก์ชันที่ไม่มีจริงในโปรเจกต์  
\- ถ้าต้องใช้ฟังก์ชันใหม่ → ถามก่อน หรือสร้าง stub

\#\#\# Pattern

\`\`\`javascript  
// ✅ ถูกต้อง \- สร้าง stub ก่อน  
function advancedNormalizer\_(input) {  
  throw new Error('advancedNormalizer\_ ยังไม่ได้ implement');  
}

// ✅ ถูกต้อง \- ถามก่อน  
// TODO: ต้องใช้ getEmployeeEmail() \- ยังไม่มีในโปรเจกต์ รบกวนสร้างให้ด้วย

// ❌ ผิด \- สมมติว่ามีแต่จริงๆ ไม่มี  
function getEmail(row) {  
  return getEmployeeEmail(row.id); // ❌ ไม่มีฟังก์ชันนี้  
}  
\`\`\`

\---

\#\# ข้อ 8 – Namespace Pattern

\#\#\# กฎ

\- ห้ามตั้งชื่อฟังก์ชันซ้ำกันในไฟล์ต่างๆ  
\- ใช้ \*\*Object Namespace\*\* หรือ \*\*Prefix\*\*

\#\#\# Pattern

\`\`\`javascript  
// ✅ ถูกต้อง \- Object Namespace  
var PersonService \= {  
  resolve: function(row) { /\* ... \*/ },  
  match: function(name, data) { /\* ... \*/ },  
  validate: function(person) { /\* ... \*/ }  
};

var PlaceService \= {  
  findCandidates: function(query) { /\* ... \*/ },  
  resolve: function(placeData) { /\* ... \*/ }  
};

// หรือใช้ Prefix  
function personResolve(row) { /\* ... \*/ }  
function placeFindCandidates(query) { /\* ... \*/ }

// ❌ ผิด \- ชื่อกว้างเกิน  
function resolve(row) { /\* ทำอะไร? \*/ }  
function find(query) { /\* ทำอะไร? \*/ }  
\`\`\`

\---

\#\# ข้อ 9 – No Global State

\#\#\# กฎ

\- ข้อมูลร่วม → ประกาศใน \`01\_Config.gs\`  
\- ห้าม \`var temp \= {}\` ในไฟล์อื่น  
\- ใช้ \*\*CacheService\*\* หรือ \*\*ส่งผ่าน parameter\*\* แทน

\#\#\# Pattern

\`\`\`javascript  
// ✅ ถูกต้อง \- ประกาศใน 01\_Config.gs  
var CONFIG \= {  
  SHEET\_NAME: 'MasterData',  
  CACHE\_TTL: 300, // 5 นาที  
  BATCH\_SIZE: 500  
};

// ใช้ CacheService  
function getCachedData(key) {  
  var cache \= CacheService.getScriptCache();  
  var cached \= cache.get(key);  
  if (cached) return JSON.parse(cached);

  var data \= loadFromSheet();  
  cache.put(key, JSON.stringify(data), 300);  
  return data;  
}

// ❌ ผิด \- global ในไฟล์อื่น  
// ใน 06\_PersonService.gs  
var tempStore \= {}; // ❌ ไม่ดี  
\`\`\`

\---

\#\# ข้อ 10 – Lock Library Version

\#\#\# กฎ

\- ระบุเวอร์ชันชัดเจน ไม่ใช่ HEAD  
\- อัปเกรด → ทดสอบใน dev ก่อน prod

\#\#\# Pattern

\`\`\`javascript  
// ✅ ถูกต้อง \- ระบุเวอร์ชัน  
var LDAP\_AUTH\_LIB \= {  
  id: 'MY\_LIBRARY\_ID',  
  version: '8', // ❌ ไม่ใช่ 'HEAD'  
  name: 'LdapAuth'  
};

// ❌ ผิด \- ใช้ HEAD  
// เลือก "HEAD" ในเมนู Library → เสี่ยง\!  
\`\`\`

\---

\#\# ข้อ 11 – Separate HTML Files

\#\#\# กฎ

\- แยก HTML ออกเป็นไฟล์ \`.html\`  
\- ใช้ \`include(filename)\` ดึง HTML  
\- ห้าม hardcode HTML ใน \`.gs\`

\#\#\# Pattern

\`\`\`javascript  
// ✅ ถูกต้อง  
// Sidebar.gs  
function showSidebar() {  
  var html \= HtmlService.createHtmlOutputFromFile('Sidebar')  
    .setTitle('LMDS Tools');  
  SpreadsheetApp.getUi().showSidebar(html);  
}

// Sidebar.html (ไฟล์แยก)  
\<\!DOCTYPE html\>  
\<html\>  
  \<head\>  
    \<base target="\_top"\>  
    \<link rel="stylesheet" href="https://ssl.gstatic.com/docs/script/css/add-ons1.css"\>  
  \</head\>  
  \<body\>  
    \<div class="sidebar"\>  
      \<h3\>LMDS Tools\</h3\>  
      \<button onclick="runPipeline()"\>รัน Pipeline\</button\>  
    \</div\>  
  \</body\>  
\</html\>

// ❌ ผิด \- hardcode ใน .gs  
var html \= '\<div\>\<h1\>Title\</h1\>\<p\>Content...\</p\>\</div\>';  
\`\`\`

\---

\#\# ข้อ 12 – Error Handling

\#\#\# กฎ

\- ฟังก์ชันที่เรียกจากเมนู → ต้องมี \`try-catch\`  
\- ทุก \`catch\` → มี \`logError\` พร้อม stack trace  
\- ฟังก์ชัน utility (pure function) → อาจไม่ต้องมี try-catch

\#\#\# Pattern

\`\`\`javascript  
// ✅ ถูกต้อง \- มี try-catch ที่ entry point  
function onMenuRunPipeline() {  
  try {  
    logInfo('Starting pipeline...');  
    runPipeline();  
    logInfo('Pipeline completed');  
  } catch (e) {  
    logError('Pipeline failed: ' \+ e.message, e);  
    showAlert('เกิดข้อผิดพลาด: ' \+ e.message);  
  }  
}

// ✅ ถูกต้อง \- ฟังก์ชันภายในอาจไม่ต้องมี  
function processRow(row) {  
  var normalized \= normalizeName(row\[0\]); // ถ้า throw ให้ catch ที่ onMenu...  
  return normalized;  
}  
\`\`\`

\---

\#\# ข้อ 13 – Logging with Context

\#\#\# กฎ

\- \`logError\` ต้องมี context (ไฟล์, line, stack trace)  
\- ใช้ \`new Error().stack\` หรือ \`console.error\`

\#\#\# Pattern

\`\`\`javascript  
// ✅ ถูกต้อง  
function logError(message, error) {  
  var context \= {  
    file: '06\_PersonService.gs',  
    error: message,  
    stack: error && error.stack ? error.stack : new Error().stack  
  };  
  Logger.log(JSON.stringify(context));

  // หรือเขียนลง SYS\_LOG sheet  
  var sheet \= SpreadsheetApp.getActiveSpreadsheet()  
    .getSheetByName('SYS\_LOG');  
  sheet.appendRow(\[  
    new Date(),  
    'ERROR',  
    '06\_PersonService.gs',  
    message,  
    error && error.stack ? error.stack : ''  
  \]);  
}

// ❌ ผิด \- ไม่มี context  
function logError(message) {  
  Logger.log(message); // ❌ ไม่รู้ว่ามาจากไหน  
}  
\`\`\`

\---

\#\# ข้อ 14 – Structured File Names

\#\#\# กฎ

\- รูปแบบ: \`XX\_ComponentName.gs\` (เลขนำหน้าคือลำดับการโหลด 00-19)  
\- ชื่อสื่อถึงหน้าที่ของไฟล์

\#\#\# Pattern

\`\`\`  
✅ ถูกต้อง  
├── 01\_Config.gs  
├── 02\_Schema.gs  
├── 03\_Setup.gs  
├── 04\_Logger.gs  
├── 05\_CacheService.gs  
├── 06\_PersonService.gs  
├── 07\_PlaceService.gs  
├── 08\_MatchEngine.gs  
├── 09\_Pipeline.gs  
└── 14\_Utils.gs

❌ ผิด  
├── code.gs  
├── myScript.gs  
├── Untitled.gs  
└── test.gs  
\`\`\`

\---

\#\# ข้อ 15 – Full Files Only

\#\#\# กฎ

\- ทุกไฟล์ที่ส่งต้องสมบูรณ์ ไม่มี \`"..."\`  
\- ถ้าแสดงการเปลี่ยนแปลง → ใช้ diff format หรือ comment บอกตำแหน่ง

\#\#\# Pattern

\`\`\`markdown  
\#\# การเปลี่ยนแปลงในไฟล์ 06\_PersonService.gs

\#\#\# ฟังก์ชัน resolvePerson (แก้ไข)  
\`\`\`javascript  
// บรรทัด 15-25 \- เดิม  
function resolvePerson(row) {  
  return row\[0\]; // ❌ ผิด: hardcode  
}

// บรรทัด 15-25 \- ใหม่  
function resolvePerson(row) {  
  return row\[PERSON\_IDX.NAME\]; // ✅ ถูกต้อง: ใช้ constant  
}  
\`\`\`

\#\#\# ฟังก์ชันอื่นๆ (ไม่เปลี่ยน)  
\- \`matchPerson()\` \- เหมือนเดิม  
\- \`validatePerson()\` \- เหมือนเดิม  
\`\`\`

\#\#\# Anti-Pattern ที่ห้าม

\`\`\`javascript  
// ❌ ห้ามเด็ดขาด  
function myFunction() {  
  // ... โค้ดส่วนเดิม ...  
}

function oldFunction() {  
  // ... ไม่เปลี่ยนแปลง ...  
}  
\`\`\`

\---

\#\# 📋 Quick Reference Checklist

ให้ AI ตรวจสอบก่อนส่งโค้ดทุกครั้ง:

\#\#\# Syntax & Naming  
\- \[ \] ใช้ \`camelCase\` สำหรับชื่อทั้งหมด  
\- \[ \] ชื่อสื่อความหมาย (ไม่ใช่ \`data\`, \`temp\`, \`x\`)  
\- \[ \] ชื่อไฟล์เป็น \`XX\_Name.gs\`

\#\#\# Data Access  
\- \[ \] ไม่มี \`row\[7\]\`, \`col \=== 11\` (ใช้ \`XXX\_IDX\`)  
\- \[ \] ไม่มี \`getValue()\`/\`setValue()\` ในลูป  
\- \[ \] ใช้ \`getValues()\`/\`setValues()\` แทน

\#\#\# Functions  
\- \[ \] ฟังก์ชันยาวไม่เกิน 1 หน้าจอ  
\- \[ \] แยกหน้าที่ชัดเจน (ไม่มี "และ" ในคำอธิบาย)  
\- \[ \] ไม่เรียกฟังก์ชันที่ไม่มีจริง  
\- \[ \] มี \`\_\` prefix สำหรับ helper functions

\#\#\# Long-Running Scripts  
\- \[ \] มี checkpoint \+ resume (ถ้ารัน \>1,000 แถว)  
\- \[ \] มี Time Guard ทุก 100 แถว

\#\#\# Error Handling  
\- \[ \] ฟังก์ชัน entry point (เมนู) มี try-catch  
\- \[ \] \`logError\` มี stack trace

\#\#\# Dependencies  
\- \[ \] มี comment หัวไฟล์ระบุ dependencies  
\- \[ \] ไม่ใช้ global variables ข้ามไฟล์  
\- \[ \] ใช้ Object Namespace หรือ prefix

\#\#\# File Quality  
\- \[ \] ไม่มี \`"..."\`, \`"โค้ดส่วนเดิม"\` หรือ \`"// old code"\`  
\- \[ \] ไม่ hardcode HTML ใน .gs

\---

\#\# 📌 ตารางสรุป

| ข้อ | ชื่อกฎ | สิ่งที่ต้องทำ | สิ่งที่ห้ามทำ |  
|-----|--------|-------------|-------------|  
| 1 | Clean Code | camelCase, ชื่อสื่อความ | data, temp, x |  
| 2 | Single Responsibility | 1 ฟังก์ชัน \= 1 หน้าที่ | รวมหลายอย่างในฟังก์ชันเดียว |  
| 3 | No Hardcode Index | ใช้ \`XXX\_IDX\` | \`row\[7\]\`, \`col \=== 11\` |  
| 4 | Batch Operations | \`getValues()\`, \`setValues()\` | \`getValue()\`, \`setValue()\` ในลูป |  
| 5 | Checkpoint & Resume | Time Guard \+ saveCheckpoint\_ | รันใหม่จากแถวแรกเสมอ |  
| 6 | Dependencies | Comment หัวไฟล์ | ไม่บอกว่าฟังก์ชันมาจากไหน |  
| 7 | No Fake Calls | stub ก่อน หรือถาม | เรียกฟังก์ชันที่ไม่มี |  
| 8 | Namespace | Object หรือ prefix | ชื่อซ้ำข้ามไฟล์ |  
| 9 | No Global State | ใช้ Config หรือ Cache | \`var temp \= {}\` ในไฟล์อื่น |  
| 10 | Library Version | ระบุเวอร์ชัน | ใช้ HEAD |  
| 11 | HTML Files | แยกไฟล์ \`.html\` | hardcode HTML ใน .gs |  
| 12 | Error Handling | try-catch ที่ entry point | ไม่ catch \= silent fail |  
| 13 | Logging | logError มี stack | log ธรรมดาไม่มี context |  
| 14 | File Names | \`XX\_Component.gs\` | \`code.gs\`, \`test.gs\` |  
| 15 | Full Files | ไม่ตัดทอน | \`"..."\`, \`"โค้ดเดิม"\` |

\---

\#\# 📞 เมื่อไม่แน่ใจ

ถ้าไม่แน่ใจว่าจะทำถูกต้องหรือไม่:

1\. \*\*ถามก่อน\*\* \- อธิบายสิ่งที่จะทำ แล้วรอ confirm  
2\. \*\*ทำตาม Pattern\*\* \- ถ้ามี pattern ตัวอย่าง ให้ทำตามนั้น  
3\. \*\*บอกทางเลือก\*\* \- ถ้ามีหลายวิธี ให้เสนอและถามว่าเลือกแบบไหน

\---

\> \*\*เวอร์ชัน:\*\* 5.3 (AI-Optimized)  
\> \*\*อัปเดตล่าสุด:\*\* 2026-05-15  
\> \*\*ตัวอย่างโค้ดทั้งหมด:\*\* Google Apps Script (JavaScript)  
