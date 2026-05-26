LMDS Project — กฎพื้นฐาน & ข้อบังคับ
⚠️ ข้อบังคับก่อนวิเคราะห์
1.อ่านโค้ดจริงเท่านั้น — ห้ามอ้างอิงจากบทสนทนาหรือเอกสาร
2.ต้องค้นหาด้วย grep — สำหรับทุกข้อกล่าวอ้าง
3.ต้องมีหลักฐาน — file:line + code snippet
4.ห้ามสร้างข้อมูล — Hallucination คือข้อผิดพลาดร้ายแรง
📋 กฎอ้างอิง
ใช้ไฟล์ต่อไปนี้เป็นมาตรฐาน:
/กฎการเขียนโค้ด LMDS.md
/📋กฎการเขียนโค้ด.md
❌ สิ่งที่ห้ามทำ
บอก "✅ PASS" โดยไม่ได้ grep
บอก "ไม่พบปัญหา" โดยไม่ได้ค้นหาทุกไฟล์
สร้างข้อมูลที่ไม่มีในโค้ด (เช่น safeAlert_())
อ้างอิงจากบทสนทนาเก่า
# LMDS — Bug Hunt (Critical & High Priority)
## 🎯 จุดประสงค์
หา Bug ระดับ Critical และ High ที่ต้องแก้ก่อน Production
## 🔴 Critical Bugs (ต้องแก้ก่อน Deploy)
### 1. Phantom Function Calls
หาฟังก์ชันที่ถูกเรียกแต่ไม่มี definition
### 2. Duplicate Function Names
หาฟังก์ชันที่มีชื่อซ้ำกันในต่างไฟล์ (Global Scope Collision)
### 3. Hardcoded Array Indexes
หาการใช้ index ตรงๆ แทน constants
### 4. Single Writer Pattern Violation
หาการเขียน M_ALIAS นอก autoEnrichAliasesFromFactBatch_
### 5. Missing Time Guard
หาฟังก์ชันที่ทำงานนานโดยไม่มี Time Guard
## 🟠 High Priority Bugs
### 6. Row-by-Row Write Operations
หา setValue() ใน loop
### 7. Entry Points Without Try-Catch
หาฟังก์ชันที่เรียกจาก Menu โดยไม่มี error handling
## 📊 รูปแบบรายงาน
สำหรับแต่ละ Bug ที่พบ:
## 🔴 BUG-01: [ชื่อปัญหา]
- **ไฟล์:** XX_XXX.gs:บรรทัดที่
- **โค้ด:**
  ```javascript
  // code snippet
- **ผลกระทบ:** [ความรุนแรง]
- **ข้อเสนอแก้ไข:** [วิธีแก้]
## ✅ สิ่งที่ต้องมีในรายงาน
1. หลักฐานจากโค้ด (file:line)
2. Code snippet ที่พบปัญหา
3. ผลกระทบต่อระบบ
4. ข้อเสนอแก้ไขที่เป็นรูปธรรม
``````````````````````````````````````````````````````````````````````````````

LMDS Project — กฎพื้นฐาน & ข้อบังคับ
⚠️ ข้อบังคับก่อนวิเคราะห์
1.อ่านโค้ดจริงเท่านั้น — ห้ามอ้างอิงจากบทสนทนาหรือเอกสาร
2.ต้องค้นหาด้วย grep — สำหรับทุกข้อกล่าวอ้าง
3.ต้องมีหลักฐาน — file:line + code snippet
4.ห้ามสร้างข้อมูล — Hallucination คือข้อผิดพลาดร้ายแรง
📋 กฎอ้างอิง
ใช้ไฟล์ต่อไปนี้เป็นมาตรฐาน:
/กฎการเขียนโค้ด LMDS.md
/📋กฎการเขียนโค้ด.md
❌ สิ่งที่ห้ามทำ
บอก "✅ PASS" โดยไม่ได้ grep
บอก "ไม่พบปัญหา" โดยไม่ได้ค้นหาทุกไฟล์
สร้างข้อมูลที่ไม่มีในโค้ด (เช่น safeAlert_())
อ้างอิงจากบทสนทนาเก่า
# LMDS — Code Review (15 Rules Compliance)
## 🎯 จุดประสงค์
ตรวจสอบว่าโค้ดปฏิบัติตามกฎ 15 ข้อหรือไม่
## 📋 กฎ 15 ข้อที่ต้องตรวจ
| กฎ | ชื่อ | สิ่งที่ต้องตรวจ |
|----|------|---------------|
| 1 | Clean Code | Function ยาวเกิน 30 บรรทัด, ชื่อไม่ชัดเจน |
| 2 | Single Responsibility | Function ทำหลายอย่าง |
| 3 | No Hardcode Index | ใช้ DATA_IDX, PERSON_IDX, ฯลฯ |
| 4 | Batch Operations | setValues แทน loop setValue |
| 5 | Checkpoint & Resume | Time Guard + PropertyService |
| 6 | Document Dependencies | Header comment ครบ |
| 7 | No Fake Function Calls | ทุกการเรียกต้องมี definition |
| 8 | Namespace Collision | ไม่มี function ซ้ำชื่อ |
| 9 | No Global State | Constants อยู่ใน 01_Config.gs |
| 10 | Lock Library Version | ไม่ใช้ HEAD version |
| 11 | Separate HTML | ไม่มี hardcoded HTML ใน .gs |
| 12 | Error Handling | Menu functions มี try-catch |
| 13 | Logging with Context | logError มี stack trace |
| 14 | Structured File Names | XX_Component.gs |
| 15 | Full Files Only | ไม่มี ... old code |
## 🔍 คำสั่งตรวจสอบแต่ละกฎ
กฎ 3: No Hardcode Index
กฎ 7: No Fake Function Calls
กฎ 12: Error Handling
📊 รูปแบบรายงาน
## กฎที่ 3: No Hardcode Index
### ❌ FAIL
**ไฟล์ที่ไม่ผ่าน:**
- `18_ServiceSCG.gs:162` — `const key = r[28];`
- `18_ServiceSCG.gs:164` — `shopAgg[key].qty += Number(r[14]) || 0;`
**ควรเป็น:**
```javascript
const key = r[DATA_IDX.SHOP_KEY];
shopAgg[key].qty += Number(r[DATA_IDX.ITEM_QTY]) || 0;
## 🎯 สิ่งที่ต้องมีในรายงาน
1. สถานะแต่ละกฎ (PASS/FAIL/PARTIAL)
2. หลักฐานจากโค้ด (file:line)
3. ประเด็นที่ต้องแก้พร้อม code snippet
``````````````````````````````````````````````````````````````````````````````

LMDS Project — กฎพื้นฐาน & ข้อบังคับ
⚠️ ข้อบังคับก่อนวิเคราะห์
1.อ่านโค้ดจริงเท่านั้น — ห้ามอ้างอิงจากบทสนทนาหรือเอกสาร
2.ต้องค้นหาด้วย grep — สำหรับทุกข้อกล่าวอ้าง
3.ต้องมีหลักฐาน — file:line + code snippet
4.ห้ามสร้างข้อมูล — Hallucination คือข้อผิดพลาดร้ายแรง
📋 กฎอ้างอิง
ใช้ไฟล์ต่อไปนี้เป็นมาตรฐาน:
/กฎการเขียนโค้ด LMDS.md
/📋กฎการเขียนโค้ด.md
❌ สิ่งที่ห้ามทำ
บอก "✅ PASS" โดยไม่ได้ grep
บอก "ไม่พบปัญหา" โดยไม่ได้ค้นหาทุกไฟล์
สร้างข้อมูลที่ไม่มีในโค้ด (เช่น safeAlert_())
อ้างอิงจากบทสนทนาเก่า
# LMDS — Performance Analysis
## 🎯 จุดประสงค์
หาจุดที่ทำให้ระบบช้า หรืออาจ Timeout (GAS 6 นาที)
## 🔴 High-Risk Areas
### 1. Loop ที่ใช้ Spreadsheet API
### 2. Cache Size Limits
### 3. N+1 Query Problems
### 4. Time Guard Coverage
### 5. Migration ที่ไม่มี Time Guard
## 📊 รูปแบบรายงาน
## Performance Issue #1
- **ไฟล์:** XX_XXX.gs:บรรทัดที่
- **ประเด็น:** [ชื่อปัญหา]
- **ผลกระทบ:** Timeout / Quota exceed
- **ข้อเสนอแก้ไข:** [วิธีแก้]
## ⚠️ ประเด็นที่ต้องระวัง
1. **setValue() ใน loop** — ทุกครั้ง = 1 API call
2. **appendRow() บ่อย** — ควรใช้ setValues batch
3. **โหลดชีตทั้งหมดทุกครั้ง** — ควรใช้ Cache
4. **Migration ไม่มี Time Guard** — ข้อมูลมาก = Timeout
`````````````````````````````````````````````````````````````````````````````````

LMDS Project — กฎพื้นฐาน & ข้อบังคับ
⚠️ ข้อบังคับก่อนวิเคราะห์
1.อ่านโค้ดจริงเท่านั้น — ห้ามอ้างอิงจากบทสนทนาหรือเอกสาร
2.ต้องค้นหาด้วย grep — สำหรับทุกข้อกล่าวอ้าง
3.ต้องมีหลักฐาน — file:line + code snippet
4.ห้ามสร้างข้อมูล — Hallucination คือข้อผิดพลาดร้ายแรง
📋 กฎอ้างอิง
ใช้ไฟล์ต่อไปนี้เป็นมาตรฐาน:
/กฎการเขียนโค้ด LMDS.md
/📋กฎการเขียนโค้ด.md
❌ สิ่งที่ห้ามทำ
บอก "✅ PASS" โดยไม่ได้ grep
บอก "ไม่พบปัญหา" โดยไม่ได้ค้นหาทุกไฟล์
สร้างข้อมูลที่ไม่มีในโค้ด (เช่น safeAlert_())
อ้างอิงจากบทสนทนาเก่า
# LMDS — Refactoring Plan
## 🎯 จุดประสงค์
สร้างแผนปรับปรุงโค้ดที่ซ้ำซ้อนหรือไม่ปฏิบัติตามกฎ
## 📋 ขอบเขตการปรับปรุง
1. Function ที่ยาวเกินไป (>100 บรรทัด)
2. Function ที่ทำหลายหน้าที่
3. Duplicate code
4. Constants ที่กระจายนอก 01_Config.gs
## 🔍 คำสั่งหาจุดที่ต้อง Refactor
### หา Function ยาว
### หา Duplicate Function Names
### หา Function ที่ทำหลายอย่าง
# หา autoEnrichAliasesFromFactBatch_ ที่ยาว 266 บรรทัด
## 📊 รูปแบบแผนปรับปรุง
## Refactor #1: [ชื่อปัญหา]
**ไฟล์:** XX_XXX.gs:บรรทัดที่
**ปัญหา:**
- Function ยาว XXX บรรทัด
- ทำหลายขั้นตอน: [1] [2] [3]
**ขั้นตอนการแก้:**
1. แยก function ใหม่: `loadXXX_()`
2. แยก function ใหม่: `processXXX_()`
3. เรียกจาก function เดิม
**Code ตัวอย่าง:**
```javascript
// ก่อนแก้
function bigFunction() {
  // 100+ บรรทัด
}
// หลังแก้
function loadXXX_() { /* ... */ }
function processXXX_() { /* ... */ }
function bigFunction() {
  loadXXX_();
  processXXX_();
}
````````````````````````````````````````````````````````````

LMDS Project — กฎพื้นฐาน & ข้อบังคับ
⚠️ ข้อบังคับก่อนวิเคราะห์
1.อ่านโค้ดจริงเท่านั้น — ห้ามอ้างอิงจากบทสนทนาหรือเอกสาร
2.ต้องค้นหาด้วย grep — สำหรับทุกข้อกล่าวอ้าง
3.ต้องมีหลักฐาน — file:line + code snippet
4.ห้ามสร้างข้อมูล — Hallucination คือข้อผิดพลาดร้ายแรง
📋 กฎอ้างอิง
ใช้ไฟล์ต่อไปนี้เป็นมาตรฐาน:
/กฎการเขียนโค้ด LMDS.md
/📋กฎการเขียนโค้ด.md
❌ สิ่งที่ห้ามทำ
บอก "✅ PASS" โดยไม่ได้ grep
บอก "ไม่พบปัญหา" โดยไม่ได้ค้นหาทุกไฟล์
สร้างข้อมูลที่ไม่มีในโค้ด (เช่น safeAlert_())
อ้างอิงจากบทสนทนาเก่า
# LMDS — Pre-Deploy Checklist
## 🎯 จุดประสงค์
ตรวจสอบความพร้อมก่อน Deploy จริง
## ✅ Checklist
### 🔴 Critical (ต้องผ่านทั้งหมด)
- [ ] ไม่มี Phantom Function Calls
- [ ] ไม่มี Duplicate Function Names
- [ ] ไม่มี Hardcoded Indexes ใน 18_ServiceSCG.gs
### 🟠 High Priority
- [ ] Entry Points มี Try-Catch
- [ ] Pipeline มี Time Guard
- [ ] Batch Operations ใช้ setValues
### 🟡 Documentation
- [ ] Header Comments ครบ
- [ ] ไม่มี TODO ที่สำคัญค้างอยู่
## 🔍 คำสั่งตรวจสอบ
### 1. ตรวจ Phantom Functions
### 2. ตรวจ Hardcoded Index
### 3. ตรวจ Error Handling
### 4. ตรวจ Duplicate Functions
## 📊 รายงานสรุป
## Pre-Deploy Status
### ✅ พร้อม Deploy
- [รายการที่ผ่าน]
### 🔴 ต้องแก้ก่อน
- [รายการที่ไม่ผ่านพร้อมลิงก์ไป BUG_HUNT]
### สรุป: X/Y ผ่าน (Z%)
``````````````````````````````````````````````````````````````````
