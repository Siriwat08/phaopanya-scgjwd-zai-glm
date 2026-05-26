# บทวิเคราะห์เชิงลึก: NameMapping (V4.0) เทียบกับ M_PERSON_ALIAS/M_PLACE_ALIAS (V5.2)

## ขอบเขตที่วิเคราะห์
อิงโครงสร้างที่มีอยู่จริงในโค้ด LMDS ปัจจุบัน:
- `Database` (แนวคิดรวมตารางหลักจากสคีมา)
- `NameMapping` (จากเอกสาร V4.0)
- `M_PERSON`
- `M_PERSON_ALIAS`
- `FACT_DELIVERY`

## สรุปผู้บริหาร (Executive Summary)
- แนวคิด `Master_UUID + NameMapping กลาง` จาก V4.0 **ถูกทิศทางตาม MDM ระดับองค์กร** เพราะทำให้ identity ของ Entity คงที่ แม้ชื่อแปรผันตามการพิมพ์จริงหน้างาน.
- V5.2 ปัจจุบันมีจุดแข็งเรื่องแยกโดเมน (`M_PERSON_ALIAS`, `M_PLACE_ALIAS`) ซึ่งลด false positive ข้ามประเภทได้ดี.
- แต่ปัจจุบันยังมีช่องว่างสำคัญ: **ID หลักยังเป็น local ID (`Pxxx`, `PLxxx`) ไม่ใช่ global UUID**, และ **ยังไม่มี alias hub กลางเดียว** ทำให้ governance/traceability ข้ามโดเมนยังไม่เต็ม.
- ข้อเสนอที่เหมาะที่สุดคือ **Hybrid Alias Architecture**: คง segmented search runtime ไว้ แต่เพิ่ม global alias ledger (`M_ALIAS`) ที่อ้าง `master_uuid` ของทุก entity.

---

## 1) สิ่งที่ระบบ V5.2 ทำได้ดีอยู่แล้ว (เทียบหลักปฏิบัติองค์กรใหญ่)

### 1.1 โครงสร้าง M_PERSON และ M_PERSON_ALIAS สอดคล้อง MDM พื้นฐาน
- `M_PERSON` แยก canonical/normalized/phone/usage/status ชัดเจน รองรับ survivorship และการค่อยๆ ปรับคุณภาพข้อมูล.
- `M_PERSON_ALIAS` แยก alias ออกเป็นตารางลูก พร้อม `match_score`, `active_flag`, `created_at` เป็นรูปแบบที่ใช้จริงใน data stewardship.

### 1.2 มีกลไก Auto-enrichment จากธุรกรรมจริง
- ใน `flushBatches_` มีการเรียก `autoEnrichAliasesFromFactBatch_` หลังเขียน FACT สำเร็จ ทำให้ alias เพิ่มจากข้อมูลจริงแบบ near real-time.
- วิธีนี้สอดคล้องแนวทาง enterprise ที่ให้ operational data เป็น feedback loop กลับเข้า master data.

### 1.3 ทำ normalization ก่อนเทียบชื่อ
- ทั้ง person/place ใช้ `normalizeForCompare` ก่อนเทียบ alias/canonical.
- เป็นแนวทางที่ถูกต้อง: ต้องทำ standardization ก่อน matching เสมอ.

---

## 2) ช่องว่างเมื่อเทียบ V4.0 NameMapping และมาตรฐานระดับ Enterprise

### 2.1 Identity ไม่เป็น Global Key เดียว
- `M_PERSON` และ `M_PLACE` ยังไม่เห็นฟิลด์ `master_uuid` ใน schema ปัจจุบัน.
- ผลคือเวลา merge/split/ย้ายข้อมูลข้ามระบบ จะผูกด้วย local key เป็นหลัก ทำ cross-system lineage ยากกว่า UUID.

### 2.2 Alias ยังแยกเป็นไซโล
- Runtime ดี (เร็ว/ชัดเจน) แต่ governance ยังแตกเป็น `M_PERSON_ALIAS` และ `M_PLACE_ALIAS`.
- หากต้อง audit ว่า variant หนึ่งเคยถูก map เป็นอะไรบ้างทั้งระบบ จะต้องอ่านหลายตารางและรวมผลทีหลัง.

### 2.3 FACT_DELIVERY ยังเก็บ local FK เป็นหลัก
- FACT ตอนนี้อ้าง `person_id/place_id/geo_id/dest_id` ได้ดีสำหรับงานในระบบเดียว.
- แต่ถ้าต้อง federation กับภายนอก (DWH/Lakehouse/CRM) การมี `master_uuid` ใน fact จะช่วย data contract และ historical stability สูงกว่า.

---

## 3) ประเมินข้อเสนอ Hybrid Alias Architecture (จากข้อความของคุณ)

## ข้อดีที่ "ใช่" และควรรับทันที
1. เพิ่ม `master_uuid` ให้ `M_PERSON`/`M_PLACE`.
2. มี `M_ALIAS` กลางเพื่อรวม alias ทั้ง PERSON/PLACE ด้วย `entity_type`.
3. ยังคง segmented runtime search (PERSON ค้น PERSON, PLACE ค้น PLACE) เพื่อลด context collision.
4. เพิ่ม migration จาก alias เดิมเข้าสู่ global hub.

## จุดที่ควรปรับก่อนใช้จริง (เพื่อความ enterprise-grade)
1. **ห้ามใช้ `appendRow` ทีละรายการในโหลดสูง** → ควร batch write.
2. `resolveMasterUuidViaGlobalAlias` แบบวนทุก key อาจช้าเมื่อข้อมูลโตมาก → ควรมี inverted index (`entity_type + normalized_variant -> [master_uuid]`).
3. substring match (`includes`) ต้องมี guard เพิ่ม ไม่งั้นเสี่ยงจับผิดบริบทชื่อสั้น.
4. ต้องมี uniqueness constraint เชิงตรรกะ: `(entity_type, master_uuid, normalized_variant, active_flag=true)`.
5. ควรเพิ่ม confidence governance: auto-generated alias เริ่มที่คะแนนกลาง และค่อย promote เมื่อเกิดซ้ำ.

---

## 4) คำตอบคำถามหลัก: “เป็นไปตามจริงแบบบริษัทใหญ่ไหม?”

**คำตอบสั้น:** ใช่ในเชิงแนวคิด และไปถูกทางมาก แต่ต้องเพิ่มชั้น governance/constraints/indexing อีกเล็กน้อยให้ production-grade เต็มรูปแบบ.

**ภาพเทียบแนวทางองค์กรใหญ่**
- สิ่งที่ตรง: canonical master, alias table, normalization, review queue, confidence score, active flag, auto learning from transaction.
- สิ่งที่ควรเติม: global immutable identity (`master_uuid`), central alias ledger, deterministic constraints, lineage/event log, data quality SLA.

---

## 5) ข้อเสนอ Implementation Blueprint สำหรับ LMDS V5.2 → V5.3

1. **Schema Step**
   - เพิ่ม `master_uuid` ใน `M_PERSON`, `M_PLACE`.
   - เพิ่มชีต `M_ALIAS` ตามคอลัมน์ที่เสนอ.

2. **Backfill Step**
   - รัน assign UUID ให้ records เดิมทั้งหมด (idempotent).
   - migrate `M_PERSON_ALIAS` และ `M_PLACE_ALIAS` เข้า `M_ALIAS` โดยบันทึก `source='V52_LEGACY_SYNC'`.

3. **Runtime Step**
   - ใน `findPersonCandidates` / `findPlaceCandidates` ให้ลอง fast-path จาก `M_ALIAS` ก่อน.
   - fallback เป็น logic เดิมเพื่อคงความแม่น/ความเข้ากันได้ย้อนหลัง.

4. **Governance Step**
   - เพิ่ม report คุณภาพ alias: duplicate rate, conflict rate, promote/demote count, false-match feedback.

5. **Fact Step (แนะนำสูง)**
   - เพิ่ม `person_master_uuid` และ `place_master_uuid` ลง FACT เพื่อรองรับ analytics ภายนอกระยะยาว.

---

## 6) บทสรุปเชิงกลยุทธ์

สถาปัตยกรรมที่คุณเสนอคือการผสาน “ความเร็วของการแยกโดเมน” กับ “ความมั่นคงของ identity กลาง” ซึ่งเป็นแกนเดียวกับระบบ MDM ขนาดใหญ่ในองค์กรชั้นนำ. สำหรับ LMDS เวอร์ชันถัดไป แนวทาง Hybrid นี้ **ควรทำ** และควรทำแบบ incremental migration เพื่อไม่ให้กระทบงานรายวัน.

