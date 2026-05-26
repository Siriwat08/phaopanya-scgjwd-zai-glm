# วิเคราะห์เปรียบเทียบ Alias Architecture: V4.0 vs V5.2 vs V5.4 Hybrid

> **เอกสารวิเคราะห์เปรียบเทียบสถาปัตยกรรม Alias ทั้ง 3 เวอร์ชัน**  
> วันที่จัดทำ: มีนาคม 2026 | เวอร์ชันเอกสาร: 1.0  
> ระบบ: LMDS (Logistics Master Data System) — การจัดการข้อมูลหลักด้านโลจิสติกส์

---

## สารบัญ

1. [การเปรียบเทียบโครงสร้าง (3 ระบบ)](#1-การเปรียบเทียบโครงสร้าง-3-ระบบ)
2. [ข้อดี-ข้อเสียของแต่ละระบบ](#2-ข้อดี-ข้อเสียของแต่ละระบบ)
3. [การทำงานของ V5.4 Hybrid Alias Architecture](#3-การทำงานของ-v54-hybrid-alias-architecture)
4. [ฟังก์ชันสำคัญใน 21_AliasService.gs (V5.4)](#4-ฟังก์ชันสำคัญใน-21_aliasservicegs-v54)
5. [การติดตั้งและ Migration (5 ขั้นตอน)](#5-การติดตั้งและ-migration-5-ขั้นตอน)
6. [ไฟล์ที่ถูกแก้ไข (11 ไฟล์)](#6-ไฟล์ที่ถูกแก้ไข-11-ไฟล์)
7. [สรุป: ทำไม Hybrid คือทางเลือกที่ถูกต้อง](#7-สรุป-ทำไม-hybrid-คือทางเลือกที่ถูกต้อง)

---

## 1. การเปรียบเทียบโครงสร้าง (3 ระบบ)

ตารางด้านล่างเปรียบเทียบคุณสมบัติของสถาปัตยกรรม Alias ทั้ง 3 เวอร์ชัน ตั้งแต่ V4.0 ที่ใช้ NameMapping แบบรวมศูนย์, V5.2 ที่แยก Entity-Specific tables ตามหลัก 3NF, ไปจนถึง V5.4 ที่ผสมผสานข้อดีของทั้งสองระบบเข้าด้วยกัน

| คุณสมบัติ | V4.0 (NameMapping) | V5.2 (Entity-Specific) | V5.4 (Hybrid) |
|---|---|---|---|
| **ชื่อตาราง** | NameMapping | M_PERSON_ALIAS + M_PLACE_ALIAS | M_ALIAS + M_PERSON_ALIAS + M_PLACE_ALIAS |
| **รหัสเชื่อมต่อ** | Master_UID (UUID) | person_id, place_id | master_uuid (UUID) + person_id, place_id |
| **ประเภท Entity** | ไม่แยก | แยก Person/Place | แยกแต่มีตารางกลาง |
| **การค้นหา** | โหลด NameMapping ทั้งหมด | โหลด alias ทุกตัว | Fast Track M_ALIAS → fallback entity tables |
| **Confidence Score** | มี (0-100) | มี (match_score) | มี (confidence) |
| **Audit Trail** | Mapped_By + Timestamp | created_at | source + created_at |
| **Active Flag** | ไม่มี | active_flag | active_flag |
| **Cross-Entity Matching** | รองรับ | ไม่รองรับ | รองรับผ่าน master_uuid |
| **Performance** | O(N) scan | O(N) scan + filter | O(1) reverse index + O(N) fallback |
| **มาตรฐาน Industry** | ไม่ได้มาตรฐาน | 3NF Normalization | Enterprise Hybrid (Salesforce/SAP model) |

### คำอธิบายเพิ่มเติมตามแถว

#### ชื่อตาราง
- **V4.0**: ใช้ตารางเดียว `NameMapping` เก็บ alias ของทุก entity type รวมกัน ไม่ว่าจะเป็นคน สถานที่ หรือองค์กร
- **V5.2**: แยกตารางตาม entity type เป็น `M_PERSON_ALIAS` และ `M_PLACE_ALIAS` ตามหลัก 3NF แต่ไม่มีตารางกลางสำหรับ cross-entity lookup
- **V5.4**: มีทั้งตารางกลาง `M_ALIAS` สำหรับ cross-entity matching และ entity-specific tables `M_PERSON_ALIAS` / `M_PLACE_ALIAS` สำหรับ normalized queries

#### รหัสเชื่อมต่อ
- **V4.0**: ใช้ `Master_UID` ซึ่งเป็น UUID เชื่อมโยง alias ทุกตัวเข้าหา master record
- **V5.2**: ใช้ `person_id` และ `place_id` แยกกันตาม entity type ไม่มีรหัสกลางร่วม
- **V5.4**: ใช้ `master_uuid` (UUID) เป็นรหัสกลาง + มี `person_id` / `place_id` สำหรับ entity-specific queries โดยมีฟังก์ชันแปลงระหว่าง UUID ↔ ID

#### ประเภท Entity
- **V4.0**: ไม่มีการแยก entity type อย่างชัดเจน — ทุกอย่างอยู่ในตารางเดียวกัน ทำให้ยากต่อการ query เฉพาะเจาะจง
- **V5.2**: แยก entity type ชัดเจนเป็น Person และ Place แต่ขาดกลไก cross-entity
- **V5.4**: แยก entity type แต่ยังคงมีตารางกลาง `M_ALIAS` เชื่อมโยง ทำให้สามารถ query ทั้งแบบเจาะจงและแบบข้าม entity ได้

#### การค้นหา
- **V4.0**: โหลด `NameMapping` ทั้งหมดเข้า memory แล้ว scan หา match — เรียบง่ายแต่ช้าเมื่อข้อมูลมาก
- **V5.2**: โหลด alias ทุกตัวจาก entity table ที่เกี่ยวข้อง แล้ว filter — เร็วกว่าเล็กน้อยเพราะกรองด้วย entity type แล้ว
- **V5.4**: ใช้ **Fast Track** ผ่าน `M_ALIAS` reverse index → O(1) lookup สำหรับ ShipToName ที่พบบ่อย ถ้าไม่เจอจึง fallback ไป entity tables → O(N) — เร็วที่สุด

#### Performance
- **V4.0**: O(N) scan ทุกครั้ง — ต้องวนดูทุกแถวใน NameMapping
- **V5.2**: O(N) scan + filter — วนดูใน entity table ที่เล็กกว่า แต่ก็ยังเป็น linear scan
- **V5.4**: O(1) reverse index lookup สำหรับ Fast Track + O(N) fallback เมื่อจำเป็น — โอกาสได้ O(1) สูงมากสำหรับ ShipToName ที่ใช้บ่อย

---

## 2. ข้อดี-ข้อเสียของแต่ละระบบ

### V4.0 NameMapping

#### ✅ ข้อดี
| # | ข้อดี | รายละเอียด |
|---|---|---|
| 1 | **ง่ายต่อการทำความเข้าใจ** | มีเพียงตารางเดียว โครงสร้างไม่ซับซ้อน นักพัฒนาใหม่สามารถเข้าใจได้ง่าย |
| 2 | **รวมศูนย์ข้อมูล** | alias ทุกประเภทอยู่ในที่เดียวกัน ไม่ต้องค้นหาหลายตาราง |
| 3 | **รองรับ Cross-Entity Matching** | สามารถค้นหา alias ข้าม entity type ได้ เช่น ชื่อบริษัทที่เป็นทั้ง Person และ Place |
| 4 | **ใช้ UUID เป็นหลัก** | master_uid เป็น UUID ที่สามารถอ้างอิงข้ามระบบได้ |

#### ❌ ข้อเสีย
| # | ข้อเสีย | รายละเอียด |
|---|---|---|
| 1 | **ไม่เป็น 3NF** | ผสมหลาย entity type ในตารางเดียว ละเมิดหลัก Normalization |
| 2 | **ไม่มี active_flag** | ไม่สามารถ mark alias ว่า inactive ได้ ทำให้ข้อมูลเก่าค้างอยู่ในระบบ |
| 3 | **ไม่แยก Entity Type ชัดเจน** | ยากต่อการ query เฉพาะ Person หรือ Place ต้อง filter เอง |
| 4 | **Performance จำกัด** | O(N) scan ทุกครั้ง ไม่มี index หรือ reverse lookup |
| 5 | **ไม่เป็นมาตรฐาน Industry** | ไม่ตรงกับแนวทางของ Salesforce, SAP หรือระบบ Enterprise อื่น |

---

### V5.2 Entity-Specific

#### ✅ ข้อดี
| # | ข้อดี | รายละเอียด |
|---|---|---|
| 1 | **เป็น 3NF Normalization** | แยกตารางตาม entity type ถูกต้องตามหลักฐานข้อมูลเชิงสัมพันธ์ |
| 2 | **มี active_flag** | สามารถ mark alias ว่า active/inactive ได้ จัดการข้อมูลเก่าได้ดีกว่า |
| 3 | **Query เฉพาะ Entity เร็ว** | ดึง alias เฉพาะ Person หรือ Place ได้โดยตรง ไม่ต้อง filter |
| 4 | **มี match_score** | มี confidence score แบบเฉพาะเจาะจงสำหรับแต่ละ entity type |

#### ❌ ข้อเสีย
| # | ข้อเสีย | รายละเอียด |
|---|---|---|
| 1 | **ไม่มีตารางกลาง** | ขาดกลไกสำหรับ cross-entity matching ที่มีประสิทธิภาพ |
| 2 | **Cross-Entity ยาก** | ต้อง query หลายตารางแล้ว merge ผลเอง ซับซ้อนและช้า |
| 3 | **M_ALIAS ว่างเปล่า** | ตาราง M_ALIAS ถูกสร้างไว้แต่ไม่มีข้อมูลเข้า เป็นตารางเปล่า |
| 4 | **ไม่มี Fast Track** | ทุกการค้นหาต้องผ่าน linear scan ไม่มี reverse index |
| 5 | **ขาด UUID กลาง** | ใช้ person_id/place_id แยกกัน ไม่มีรหัสร่วมสำหรับ cross-reference |

---

### V5.4 Hybrid

#### ✅ ข้อดี
| # | ข้อดี | รายละเอียด |
|---|---|---|
| 1 | **ได้ข้อดีทั้ง 2 ระบบ** | มีตารางกลาง M_ALIAS เหมือน V4.0 + entity-specific tables เหมือน V5.2 |
| 2 | **Fast Track สำหรับ ShipToName** | O(1) reverse index lookup สำหรับชื่อปลายทางที่ใช้บ่อย |
| 3 | **เหมาะกับ Enterprise** | สอดคล้องกับมาตรฐาน Salesforce Global Alias + SAP Cross-Object Reference |
| 4 | **M_ALIAS มีข้อมูลจริง** | รับข้อมูลจาก 5 แหล่ง: createPerson, createPlace, autoEnrich, SCG raw, FACT delivery |
| 5 | **มี UUID กลาง + Entity ID** | master_uuid สำหรับ cross-entity + person_id/place_id สำหรับ entity-specific queries |
| 6 | **Audit Trail ครบถ้วน** | มี source + created_at บอกได้ว่า alias มาจากไหน เมื่อไร |
| 7 | **Active Flag รองรับ** | สามารถ mark alias ว่า active/inactive ได้ |
| 8 | **Auto Sync 2 ทาง** | syncAliasToEntityTable_() ซิงค์ M_ALIAS → entity table อัตโนมัติ |

#### ❌ ข้อเสีย
| # | ข้อเสีย | รายละเอียด |
|---|---|---|
| 1 | **ซับซ้อนกว่า** | มีตาราง 3 ตาราง + sync logic ที่ต้องดูแล นักพัฒนาใหม่อาจใช้เวลาเข้าใจมากขึ้น |
| 2 | **ต้อง sync ข้อมูล 2 ที่** | ข้อมูลต้องเขียนทั้ง M_ALIAS และ entity table มีความเสี่ยงเรื่อง data inconsistency หาก sync ล้มเหลว |
| 3 | **Migration ซับซ้อน** | ต้องย้ายข้อมูลจากทั้ง NameMapping (เก่า) + ดึงจาก SCG ดิบ + ดึงจาก FACT |
| 4 | **ต้องดูแล Reverse Index** | loadGlobalAliasReverseIndex_() ต้อง maintain ให้ตรงกับ M_ALIAS เสมอ |

---

## 3. การทำงานของ V5.4 Hybrid Alias Architecture

### ภาพรวมสถาปัตยกรรม

```
┌─────────────────────────────────────────────────────────┐
│                    V5.4 Hybrid Alias                     │
│                                                          │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │  M_ALIAS  │◄──►│ M_PERSON_ALIAS│    │ M_PLACE_ALIAS │   │
│  │ (กลาง)    │    │ (เฉพาะคน)    │    │ (เฉพาะสถานที่)│   │
│  └─────┬────┘    └──────┬───────┘    └──────┬───────┘   │
│        │                │                    │           │
│        ▼                ▼                    ▼           │
│   master_uuid      person_id            place_id        │
│        │                │                    │           │
│        └────────────────┼────────────────────┘           │
│                         ▼                                │
│              Fast Track Lookup                           │
│         (Reverse Index O(1))                             │
└─────────────────────────────────────────────────────────┘
```

---

### 3.1 ข้อมูลจากชีต SCG นครหลวง JWD ภูมิภาค (ข้อมูลดิบ → ทำความสะอาด → บันทึกเข้าฐาน)

ขั้นตอนนี้อธิบายการไหลของข้อมูลตั้งแต่รับข้อมูลดิบเข้ามา จนกระทั่ง alias ถูกสร้างและบันทึกลงในทุกตาราง

```
ข้อมูลดิบ (SCG API / ฟอร์ม)
        │
        ▼
┌───────────────────────┐
│ 1. ข้อมูลดิบเข้ามา       │   ข้อมูลดิบเข้ามาในชีต SCG ผ่านการกรอกฟอร์มหรือ API
│    ในชีต SCG           │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 2. Run Full Pipeline   │   runLoadSource → runNormalize → runMatchEngine
│    ประมวลผลข้อมูล       │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 3. createPerson() /    │   สร้าง master_uuid + บันทึกเข้า M_ALIAS ทันที
│    createPlace()       │   เรียก createGlobalAlias() เพื่อ sync ไป entity table
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 4. autoEnrich          │   autoEnrichAliasesFromFactBatch_() → สร้าง alias ใหม่
│    Aliases             │   จาก FACT → เขียนทั้ง M_PERSON_ALIAS และ M_ALIAS
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 5. fetchDataFrom       │   ดึงข้อมูลจาก API → เรียก
│    SCGJWD()            │   populateAliasFromSCGRawData_() → ดึงชื่อปลายทาง
│                        │   ทั้งหมดจาก SCG ดิบเข้า M_ALIAS
└───────────────────────┘
```

#### รายละเอียดแต่ละขั้นตอน

**ขั้นที่ 1: ข้อมูลดิบเข้ามาในชีต SCG**
- ข้อมูลดิบจาก SCG API หรือการกรอกฟอร์มโดยผู้ใช้ จะถูกบันทึกลงในชีต SCG นครหลวง JWD ภูมิภาค
- ข้อมูลประกอบด้วย: ชื่อปลายทาง (ShipToName), ที่อยู่ (ShipToAddress), พิกัด (LatLong_SCG) ฯลฯ

**ขั้นที่ 2: ระบบ Run Full Pipeline**
- `runLoadSource()`: โหลดข้อมูลจากแหล่งต่างๆ
- `runNormalize()`: ทำความสะอาดข้อมูล — normalize ชื่อ, ที่อยู่, ตัดช่องว่าง, แปลงตัวพิมพ์
- `runMatchEngine()`: จับคู่ข้อมูลกับ master records ที่มีอยู่แล้ว

**ขั้นที่ 3: createPerson() / createPlace()**
- เมื่อพบ entity ใหม่ ระบบจะสร้าง record ใหม่พร้อม `master_uuid` ที่ generate ด้วย `generateUUID()`
- เรียก `createGlobalAlias()` เพื่อสร้าง alias ใน `M_ALIAS` ทันที
- เรียก `syncAliasToEntityTable_()` เพื่อ sync alias ไปยัง `M_PERSON_ALIAS` หรือ `M_PLACE_ALIAS`

**ขั้นที่ 4: autoEnrichAliasesFromFactBatch_()**
- วิเคราะห์ข้อมูลจาก `FACT_DELIVERY` เพื่อค้นหาชื่อ alias ใหม่ที่ยังไม่มีในระบบ
- สร้าง alias ใหม่จาก FACT → เขียนทั้ง `M_PERSON_ALIAS` / `M_PLACE_ALIAS` **และ** `M_ALIAS`
- ตัวอย่าง: ถ้า FACT มีชื่อ "บริษัท เอบีซี จำกัด" ที่ยังไม่อยู่ใน alias → สร้างใหม่ทั้ง 2 ที่

**ขั้นที่ 5: fetchDataFromSCGJWD()**
- ดึงข้อมูลจาก SCG API
- เรียก `populateAliasFromSCGRawData_()` → ดึงชื่อปลายทางทั้งหมดจากข้อมูล SCG ดิบ
- ชื่อที่ดึงได้จะถูก normalize และบันทึกเข้า `M_ALIAS` โดยอัตโนมัติ

---

### 3.2 ข้อมูลจากชีตตารางงานประจำวัน (ShipToName → ค้นหา → ได้พิกัด)

ขั้นตอนนี้อธิบายการค้นหาพิกัดจาก ShipToName ในชีตงานประจำวัน ซึ่งเป็น use case หลักของระบบ

```
ข้อมูลใหม่จาก API → ชีตตารางงานประจำวัน
        │
        ▼
┌───────────────────────┐
│ runLookupEnrichment()  │   วนทุกแถว → เรียก findBestGeoByPersonPlace()
└───────────┬───────────┘
            │
            ▼
┌─────────────────────────────────────┐
│ ⚡ Tier 0 Fast Track (NEW in V5.4)  │   fastLookupByShipToName(ShipToName)
│                                      │
│  normalize(ShipToName)               │
│        │                             │
│        ▼                             │
│  loadGlobalAliasReverseIndex_()      │   O(1) lookup
│        │                             │
│        ├── เจอ masterUuid ──────────►│  convertUuidToPersonId/PlaceId
│        │                             │       → getDestsByPersonId/PlaceId
│        │                             │       → lat, lng ✅
│        │                             │
│        └── ไม่เจอ ──────────────────►│  ไป Tier C
│                                      │
│  ⚠️ ใช้เฉพาะ ShipToName เท่านั้น      │
│     ไม่ต้องใช้ ShipToAddress หรือ       │
│     LatLong_SCG                      │
└───────────┬─────────────────────────┘
            │ (ถ้าไม่เจอ)
            ▼
┌───────────────────────┐
│ Tier C → A → B → D → G│   Fallback chain ตามลำดับความสำคัญ
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ กำหนดสีพื้นหลัง          │   เขียว=เจอ, เหลือง=Fallback, ฟ้า=SCG, แดง=ไม่พบ
└───────────────────────┘
```

#### รายละเอียด Tier 0 Fast Track (NEW in V5.4)

**Tier 0 Fast Track** เป็นจุดเปลี่ยนสำคัญของ V5.4 ที่ทำให้การค้นหา ShipToName เร็วขึ้นอย่างมาก:

| ขั้นตอน | รายละเอียด | Complexity |
|---|---|---|
| 1. normalize(ShipToName) | แปลงชื่อเป็นรูปแบบมาตรฐาน (ตัดช่องว่าง, ตัวพิมพ์เล็ก, ลบสรรพนาม) | O(1) |
| 2. loadGlobalAliasReverseIndex_() | โหลด reverse index {normalized: [{masterUuid, entityType}]} | O(N) ครั้งแรก, cached หลังจากนั้น |
| 3. Lookup | ค้นหา normalized name ใน reverse index | **O(1)** |
| 4. convertUuidToPersonId/PlaceId | แปลง master_uuid เป็น person_id หรือ place_id | O(1) |
| 5. getDestsByPersonId/PlaceId | ดึงพิกัดจาก destination | O(1) |

**ข้อสังเกตสำคัญ:**
- Tier 0 ใช้ **เฉพาะ ShipToName** เท่านั้น — ไม่ต้องใช้ ShipToAddress หรือ LatLong_SCG
- หมายความว่าแม้จะมีเพียงชื่อปลายทาง ก็สามารถหาพิกัดได้ทันที โดยไม่ต้องผ่าน fallback chain ที่ซับซ้อน
- Reverse index ถูก cache ไว้ใน memory หลังจากโหลดครั้งแรก ทำให้การค้นหาครั้งต่อไปเร็วมาก

#### Fallback Chain (เมื่อ Tier 0 ไม่เจอ)

| Tier | ชื่อ | วิธีการ | เงื่อนไข |
|---|---|---|---|
| Tier C | Person Anchor | ค้นหาจาก Person master → Place → Destination | ใช้เมื่อรู้ชื่อบุคคล/บริษัท |
| Tier A | Direct Place Match | ค้นหา Place โดยตรง | ใช้เมื่อรู้ชื่อสถานที่ชัดเจน |
| Tier B | Address Fallback | ค้นหาจากที่อยู่ | ใช้เมื่อชื่อไม่ตรงแต่ที่อยู่ตรง |
| Tier D | SCG LatLong | ใช้พิกัดจาก SCG โดยตรง | ใช้เมื่อมี LatLong_SCG อยู่แล้ว |
| Tier G | Google Maps API | เรียก Geocoding API | ใช้เป็นทางเลือกสุดท้าย |

#### ระบบสีพื้นหลัง (Visual Feedback)

| สี | ความหมาย | เงื่อนไข |
|---|---|---|
| 🟢 เขียว | เจอพิกัดจาก Fast Track หรือ Tier หลัก | ความมั่นใจสูง |
| 🟡 เหลือง | เจอจาก Fallback | ความมั่นใจปานกลาง |
| 🔵 ฟ้า | เจอจาก SCG | ใช้พิกัด SCG โดยตรง |
| 🔴 แดง | ไม่พบพิกัด | ต้องตรวจสอบเพิ่มเติม |

---

## 4. ฟังก์ชันสำคัญใน 21_AliasService.gs (V5.4)

ไฟล์ `21_AliasService.gs` เป็นไฟล์ใหม่ทั้งหมดที่เพิ่มเข้ามาใน V5.4 ประกอบด้วย Hybrid Alias Engine ที่จัดการ alias ทั้ง 3 ตาราง

| # | ฟังก์ชัน | ประเภท | คำอธิบาย |
|---|---|---|---|
| 1 | `createGlobalAlias()` | Public | สร้าง alias ใน M_ALIAS + sync ไป entity table (M_PERSON_ALIAS หรือ M_PLACE_ALIAS) อัตโนมัติ เป็นจุดเข้าหลักสำหรับการสร้าง alias ทุกประเภท |
| 2 | `loadGlobalAliasesMap_()` | Private | โหลด alias ทั้งหมดจาก M_ALIAS เป็น Map รูปแบบ `{entityType_uuid: [variants]}` ใช้สำหรับ resolve alias → master record |
| 3 | `loadGlobalAliasReverseIndex_()` | Private | โหลด alias เป็น reverse index รูปแบบ `{normalized: [{masterUuid, entityType}]}` ใช้สำหรับ Fast Track lookup แบบ O(1) |
| 4 | `resolveMasterUuidViaGlobalAlias()` | Public | ค้นหา variant → ได้ masterUuid ใช้โดย findPersonCandidates() และ findPlaceCandidates() เป็นกลไกหลักในการ resolve alias |
| 5 | `fastLookupByShipToName()` | Public | ⚡ **Fast Track** สำหรับ Daily Job — รับ ShipToName เท่านั้น → คืนพิกัด (lat, lng) เป็นฟังก์ชันที่เพิ่มเข้ามาใหม่ใน V5.4 เพื่อเพิ่มความเร็วในการ lookup |
| 6 | `syncAliasToEntityTable_()` | Private | sync จาก M_ALIAS → entity-specific table (M_PERSON_ALIAS หรือ M_PLACE_ALIAS) ทำงานอัตโนมัติทุกครั้งที่มีการสร้าง/แก้ไข alias |
| 7 | `convertUuidToPersonId()` | Public | แปลง master_uuid → person_id ใช้เมื่อได้ UUID จาก Fast Track แล้วต้องการดึงข้อมูล Person |
| 8 | `convertUuidToPlaceId()` | Public | แปลง master_uuid → place_id ใช้เมื่อได้ UUID จาก Fast Track แล้วต้องการดึงข้อมูล Place |
| 9 | `convertPersonIdToUuid()` | Public | แปลง person_id → master_uuid ใช้ในทิศทางตรงกันข้าม เช่น ต้องการค้นหาใน M_ALIAS จาก person_id |
| 10 | `convertPlaceIdToUuid()` | Public | แปลง place_id → master_uuid ใช้ในทิศทางตรงกันข้าม เช่น ต้องการค้นหาใน M_ALIAS จาก place_id |
| 11 | `assignMasterUuidIfMissing()` | Public | ตรวจสอบและเพิ่ม UUID ให้ทุก entity ที่ยังไม่มี master_uuid รันผ่านเมนู "🔗 ตรวจสอบ Master UUID" |
| 12 | `MIGRATION_HybridAliasSystem()` | Public (Menu) | ย้ายข้อมูลจากเก่า → M_ALIAS + ดึงจาก SCG ดิบ + FACT รันผ่านเมนู "🔄 Migration: Hybrid Alias System" |
| 13 | `populateAliasFromSCGRawData_()` | Private | ดึงชื่อจากชีต SCG ดิบ → normalize → บันทึกเข้า M_ALIAS รันหลังจาก import ข้อมูล SCG |
| 14 | `populateAliasFromFactDelivery_()` | Private | ดึงชื่อจาก FACT_DELIVERY → normalize → บันทึกเข้า M_ALIAS รันโดย autoEnrich |
| 15 | `generateUUID()` | Private | สร้าง UUID v4 ตามมาตรฐาน RFC 4122 ใช้สำหรับสร้าง master_uuid ใหม่ |

### ความสัมพันธ์ระหว่างฟังก์ชัน

```
createGlobalAlias()
    │
    ├── generateUUID()          → สร้าง master_uuid ใหม่
    ├── เขียน M_ALIAS            → บันทึก alias ในตารางกลาง
    └── syncAliasToEntityTable_() → sync ไป entity table
            │
            ├── เขียน M_PERSON_ALIAS  (ถ้าเป็น Person)
            └── เขียน M_PLACE_ALIAS   (ถ้าเป็น Place)

fastLookupByShipToName(shipToName)
    │
    ├── normalize(shipToName)
    ├── loadGlobalAliasReverseIndex_()
    │       └── โหลดจาก M_ALIAS → {normalized: [{masterUuid, entityType}]}
    ├── O(1) lookup → masterUuid
    ├── convertUuidToPersonId() / convertUuidToPlaceId()
    └── getDestsByPersonId() / getDestsByPlaceId() → {lat, lng}

MIGRATION_HybridAliasSystem()
    │
    ├── assignMasterUuidIfMissing()     → เพิ่ม UUID ให้ entity ที่ยังไม่มี
    ├── populateAliasFromSCGRawData_()  → ดึงจาก SCG ดิบ
    ├── populateAliasFromFactDelivery_()→ ดึงจาก FACT_DELIVERY
    └── syncAliasToEntityTable_()       → sync ทุก alias ไป entity table
```

---

## 5. การติดตั้งและ Migration (5 ขั้นตอน)

> ⚠️ **สำคัญ**: ต้องทำตามลำดับขั้นตอนอย่างเคร่งครัด ห้ามข้ามขั้นตอน

### ขั้นตอนที่ 1: คัดลอกไฟล์ทั้ง 11 ไฟล์ไปวางใน Google Apps Script Editor

| # | ไฟล์ | หมายเหตุ |
|---|---|---|
| 1 | `00_App.gs` | เพิ่ม M_ALIAS ใน requiredSheets + migration menu |
| 2 | `01_Config.gs` | VERSION 5.4.000 + ALIAS_IDX validation |
| 3 | `02_Schema.gs` | M_ALIAS ใน validateSchemaConsistency |
| 4 | `03_SetupSheets.gs` | สร้างชีต M_ALIAS อัตโนมัติ |
| 5 | `06_PersonService.gs` | createPerson/createPersonAlias → sync to M_ALIAS |
| 6 | `07_PlaceService.gs` | createPlace/createPlaceAlias → sync to M_ALIAS |
| 7 | `10_MatchEngine.gs` | autoEnrich → เขียน M_ALIAS ด้วย |
| 8 | `15_GoogleMapsAPI.gs` | VERSION update เท่านั้น |
| 9 | `17_SearchService.gs` | Tier 0 Fast Track via M_ALIAS |
| 10 | `18_ServiceSCG.gs` | เรียก populateAliasFromSCGRawData_ หลัง import |
| 11 | `21_AliasService.gs` | ไฟล์ใหม่ทั้งหมด (Hybrid Alias Engine) |

**วิธีการ:**
1. เปิด Google Apps Script Editor ของโปรเจกต์ LMDS
2. สร้างไฟล์ใหม่ `21_AliasService.gs` ถ้ายังไม่มี
3. คัดลอกเนื้อหาจากไฟล์ต้นฉบับไปวางแทนที่ไฟล์เดิมใน editor
4. บันทึกทุกไฟล์ (Ctrl+S)

---

### ขั้นตอนที่ 2: รันเมนู "🏗️ สร้างชีตทั้งหมด"

**วัตถุประสงค์:** สร้างชีต M_ALIAS อัตโนมัติพร้อมโครงสร้างคอลัมน์ที่ถูกต้อง

**โครงสร้างชีต M_ALIAS:**

| คอลัมน์ | ประเภท | คำอธิบาย |
|---|---|---|
| alias_id | Integer | รหัส alias (Auto-increment) |
| master_uuid | String (UUID) | รหัส UUID ของ master entity |
| entity_type | String | ประเภท entity: "PERSON" หรือ "PLACE" |
| variant | String | รูปแบบชื่อ alias |
| normalized | String | ชื่อที่ผ่านการ normalize แล้ว |
| confidence | Float | คะแนนความมั่นใจ (0.0 - 1.0) |
| source | String | แหล่งที่มา: "SCG_RAW", "FACT_DELIVERY", "MANUAL", "AUTO_ENRICH" |
| active_flag | String | "Y" หรือ "N" |
| created_at | DateTime | วันเวลาที่สร้าง |

**วิธีการ:**
1. รีเฟรชหน้า Google Sheets
2. เปิดเมนู LMDS ด้านบน
3. เลือก "🏗️ สร้างชีตทั้งหมด"
4. รอจนกว่าจะแจ้งว่าสร้างเสร็จสมบูรณ์
5. ตรวจสอบว่าชีต M_ALIAS ปรากฏขึ้นพร้อมคอลัมน์ที่ถูกต้อง

---

### ขั้นตอนที่ 3: รันเมนู "🔗 ตรวจสอบ Master UUID"

**วัตถุประสงค์:** ตรวจสอบและเพิ่ม UUID ให้ทุก entity ที่ยังไม่มี master_uuid

**ฟังก์ชันที่ทำงาน:** `assignMasterUuidIfMissing()`

**สิ่งที่เกิดขึ้น:**
1. วนทุกแถวใน M_PERSON → ตรวจสอบว่ามี master_uuid หรือยัง
2. ถ้ายังไม่มี → สร้าง UUID ใหม่ด้วย `generateUUID()` → บันทึก
3. วนทุกแถวใน M_PLACE → ตรวจสอบและเพิ่ม UUID เช่นเดียวกัน
4. แสดงสรุปจำนวน entity ที่ได้รับ UUID ใหม่

**ผลลัพธ์ที่คาดหวัง:**
```
✅ ตรวจสอบ Master UUID เสร็จสมบูรณ์
   - M_PERSON: เพิ่ม UUID ใหม่ 47 รายการ (จากทั้งหมด 152 รายการ)
   - M_PLACE: เพิ่ม UUID ใหม่ 23 รายการ (จากทั้งหมด 89 รายการ)
```

---

### ขั้นตอนที่ 4: รันเมนู "🔄 Migration: Hybrid Alias System"

**วัตถุประสงค์:** ย้ายข้อมูลจากระบบเก่า + ดึงจาก SCG ดิบ + FACT → เข้า M_ALIAS

**ฟังก์ชันที่ทำงาน:** `MIGRATION_HybridAliasSystem()`

**ขั้นตอนย่อยภายใน Migration:**

```
MIGRATION_HybridAliasSystem()
    │
    ├── 1. ตรวจสอบว่า M_ALIAS มีอยู่แล้วหรือยัง
    │
    ├── 2. ย้าย alias จาก M_PERSON_ALIAS → M_ALIAS
    │       (แปลง person_id → master_uuid)
    │
    ├── 3. ย้าย alias จาก M_PLACE_ALIAS → M_ALIAS
    │       (แปลง place_id → master_uuid)
    │
    ├── 4. populateAliasFromSCGRawData_()
    │       ดึงชื่อจากชีต SCG ดิบ → normalize → M_ALIAS
    │
    ├── 5. populateAliasFromFactDelivery_()
    │       ดึงชื่อจาก FACT_DELIVERY → normalize → M_ALIAS
    │
    └── 6. สรุปผล Migration
            - จำนวน alias ที่ย้ายจาก Person
            - จำนวน alias ที่ย้ายจาก Place
            - จำนวน alias ที่ดึงจาก SCG ดิบ
            - จำนวน alias ที่ดึงจาก FACT
            - จำนวน alias ทั้งหมดใน M_ALIAS
```

**⚠️ ข้อควรระวัง:**
- Migration อาจใช้เวลานานหากข้อมูลมีมาก (เกิน 6 นาทีของ Apps Script limit)
- หากเกินเวลา ให้รันซ้ำ — ระบบจะข้าม alias ที่มีอยู่แล้วอัตโนมัติ
- แนะนำให้สำรองข้อมูลก่อนรัน Migration

---

### ขั้นตอนที่ 5: ทดสอบ — รัน "📥 ดึงข้อมูล SCG API"

**วัตถุประสงค์:** ตรวจสอบว่า M_ALIAS มีข้อมูลเข้าแล้ว และ Fast Track ทำงานได้จริง

**วิธีทดสอบ:**

| # | ขั้นตอน | ผลลัพธ์ที่คาดหวัง |
|---|---|---|
| 1 | รัน "📥 ดึงข้อมูล SCG API" | ข้อมูลเข้ามาในชีต SCG |
| 2 | เปิดชีต M_ALIAS | มีข้อมูล alias ใหม่เพิ่มเข้ามา |
| 3 | รัน "📊 ประมวลผลข้อมูล" | ข้อมูลถูก normalize และ match |
| 4 | เปิดชีตตารางงานประจำวัน | พิกัดถูกเติมอัตโนมัติ สีเขียวแสดงว่าเจอจาก Fast Track |
| 5 | ตรวจสอบ Log | เห็นข้อความ "Fast Track hit" หรือ "Tier 0 resolved" |

**ตัวอย่าง Log ที่คาดหวัง:**
```
[FastTrack] ShipToName "บริษัท เอบีซี จำกัด" → master_uuid: abc123... → place_id: 42 → lat: 13.7563, lng: 100.5018
[FastTrack] Hit rate: 73/89 (82%) — 16 rows fell back to Tier C+
```

---

## 6. ไฟล์ที่ถูกแก้ไข (11 ไฟล์)

รายละเอียดการเปลี่ยนแปลงในแต่ละไฟล์:

### 1. `00_App.gs`

| การเปลี่ยนแปลง | รายละเอียด |
|---|---|
| เพิ่ม M_ALIAS ใน requiredSheets | เพิ่ม `"M_ALIAS"` เข้าไปในอาร์เรย์ `REQUIRED_SHEETS` เพื่อให้ระบบตรวจสอบว่าชีตนี้ต้องมีอยู่ก่อนรัน |
| เพิ่ม migration menu | เพิ่มเมนู "🔄 Migration: Hybrid Alias System" ใน `onOpen()` เพื่อให้ผู้ใช้เรียก Migration ได้จาก UI |
| เพิ่ม UUID check menu | เพิ่มเมนู "🔗 ตรวจสอบ Master UUID" สำหรับเรียก `assignMasterUuidIfMissing()` |

### 2. `01_Config.gs`

| การเปลี่ยนแปลง | รายละเอียด |
|---|---|
| VERSION → 5.4.000 | อัปเดตเวอร์ชันจาก 5.2.x เป็น 5.4.000 |
| เพิ่ม ALIAS_IDX | เพิ่ม constant `ALIAS_IDX` สำหรับ column index ของ M_ALIAS และ validation rules |
| เพิ่ม ALIAS_SOURCES | เพิ่ม constant สำหรับแหล่งที่มาที่ถูกต้อง: "SCG_RAW", "FACT_DELIVERY", "MANUAL", "AUTO_ENRICH" |

### 3. `02_Schema.gs`

| การเปลี่ยนแปลง | รายละเอียด |
|---|---|
| M_ALIAS schema | เพิ่มนิยาม schema ของ M_ALIAS ใน `SCHEMA_DEFS` พร้อม column types และ validation rules |
| validateSchemaConsistency | เพิ่ม M_ALIAS เข้าไปใน `validateSchemaConsistency()` เพื่อตรวจสอบความสอดคล้องของชีต |

### 4. `03_SetupSheets.gs`

| การเปลี่ยนแปลง | รายละเอียด |
|---|---|
| สร้างชีต M_ALIAS | เพิ่ม logic ใน `createAllSheets()` สำหรับสร้างชีต M_ALIAS อัตโนมัติพร้อม header row และ formatting |
| Column formatting | กำหนดประเภทข้อมูลแต่ละคอลัมน์: alias_id (Number), master_uuid (Text), entity_type (Text), variant (Text), normalized (Text), confidence (Number), source (Text), active_flag (Text), created_at (DateTime) |

### 5. `06_PersonService.gs`

| การเปลี่ยนแปลง | รายละเอียด |
|---|---|
| createPerson() | เพิ่มการเรียก `createGlobalAlias()` หลังจากสร้าง person ใหม่ เพื่อสร้าง alias ใน M_ALIAS ทันที |
| createPersonAlias() | เพิ่มการเรียก `syncAliasToEntityTable_()` เพื่อ sync alias ใหม่จาก M_PERSON_ALIAS ไป M_ALIAS ด้วย |
| assignMasterUuidIfMissing | เพิ่มการตรวจสอบและเพิ่ม master_uuid ให้ person ที่ยังไม่มี |

### 6. `07_PlaceService.gs`

| การเปลี่ยนแปลง | รายละเอียด |
|---|---|
| createPlace() | เพิ่มการเรียก `createGlobalAlias()` หลังจากสร้าง place ใหม่ เพื่อสร้าง alias ใน M_ALIAS ทันที |
| createPlaceAlias() | เพิ่มการเรียก `syncAliasToEntityTable_()` เพื่อ sync alias ใหม่จาก M_PLACE_ALIAS ไป M_ALIAS ด้วย |
| assignMasterUuidIfMissing | เพิ่มการตรวจสอบและเพิ่ม master_uuid ให้ place ที่ยังไม่มี |

### 7. `10_MatchEngine.gs`

| การเปลี่ยนแปลง | รายละเอียด |
|---|---|
| autoEnrich | เพิ่มการเขียน M_ALIAS ด้วยใน `autoEnrichAliasesFromFactBatch_()` — เมื่อสร้าง alias ใหม่จาก FACT จะเขียนทั้ง entity table และ M_ALIAS |
| populateAliasFromFactDelivery_ | เพิ่มการเรียก `createGlobalAlias()` สำหรับแต่ละ alias ใหม่ที่พบจาก FACT_DELIVERY |

### 8. `15_GoogleMapsAPI.gs`

| การเปลี่ยนแปลง | รายละเอียด |
|---|---|
| VERSION update | อัปเดตเวอร์ชันเป็น 5.4.000 เท่านั้น — ไม่มีการเปลี่ยนแปลง logic ในไฟล์นี้ |

### 9. `17_SearchService.gs`

| การเปลี่ยนแปลง | รายละเอียด |
|---|---|
| Tier 0 Fast Track | เพิ่ม `fastLookupByShipToName()` เป็น Tier 0 แรกสุดใน `findBestGeoByPersonPlace()` — ก่อน Tier C |
| Fallback chain | ปรับลำดับ: Tier 0 → Tier C → Tier A → Tier B → Tier D → Tier G |
| Logging | เพิ่ม log สำหรับ Fast Track hit/miss เพื่อติดตามประสิทธิภาพ |

### 10. `18_ServiceSCG.gs`

| การเปลี่ยนแปลง | รายละเอียด |
|---|---|
| populateAliasFromSCGRawData_ | เพิ่มการเรียก `populateAliasFromSCGRawData_()` หลังจาก import ข้อมูล SCG เสร็จ — เพื่อดึงชื่อปลายทางทั้งหมดจาก SCG ดิบเข้า M_ALIAS |
| fetchDataFromSCGJWD | เพิ่มการเรียก alias population ในตอนท้ายของ `fetchDataFromSCGJWD()` |

### 11. `21_AliasService.gs`

| การเปลี่ยนแปลง | รายละเอียด |
|---|---|
| ไฟล์ใหม่ทั้งหมด | สร้างไฟล์ใหม่ทั้งหมด — Hybrid Alias Engine ประกอบด้วยฟังก์ชัน 15 ฟังก์ชัน (ดูรายละเอียดในหัวข้อ 4) |

---

## 7. สรุป: ทำไม Hybrid คือทางเลือกที่ถูกต้อง

### ภาพรวม

สถาปัตยกรรม Hybrid Alias ของ V5.4 ไม่ใช่การออกแบบใหม่ที่คิดค้นขึ้นมาเอง แต่เป็น **มาตรฐานอุตสาหกรรม (Industry Standard)** ที่ได้รับการพิสูจน์แล้วจากระบบ Enterprise ระดับโลก โดยมีแนวคิดหลักว่า:

> **ตารางกลาง (Global Index) + ตารางเฉพาะ (Local Index) = ประสิทธิภาพสูงสุด**

### การเปรียบเทียบกับมาตรฐานอุตสาหกรรม

| ระบบ Enterprise | กลไก Global | กลไก Local | คล้ายกับ V5.4 ตรงไหน |
|---|---|---|---|
| **Salesforce** | Global Alias Table | Object-specific Index | M_ALIAS = Global Alias, M_PERSON_ALIAS = Object Index |
| **SAP** | Cross-Object Reference | Business Partner Index | master_uuid = Cross-Object Ref, entity tables = BP Index |
| **AWS Neptune** | Property Graph (Global) | Vertex-specific Properties | M_ALIAS = Property Graph, entity tables = Vertex Props |
| **MongoDB Atlas** | Global Search Index | Collection-specific Index | Reverse Index = Global Search, entity tables = Collection Index |
| **Elasticsearch** | Cross-index Alias | Per-index Mapping | M_ALIAS = Cross-index, entity tables = Per-index |

### ทำไม Hybrid ดีกว่า V4.0 NameMapping

| ประเด็น | V4.0 NameMapping | V5.4 Hybrid |
|---|---|---|
| โครงสร้าง | ผสมทุกอย่างในตารางเดียว | แยกตาม entity type แต่มีตารางกลาง |
| มาตรฐาน | ไม่เป็น 3NF | เป็น 3NF + มี Global Index |
| Active Flag | ไม่มี | มี active_flag |
| Performance | O(N) เสมอ | O(1) Fast Track + O(N) fallback |
| Audit | Mapped_By เท่านั้น | source + created_at |

### ทำไม Hybrid ดีกว่า V5.2 Entity-Specific

| ประเด็น | V5.2 Entity-Specific | V5.4 Hybrid |
|---|---|---|
| ตารางกลาง | ไม่มี (M_ALIAS ว่างเปล่า) | มี M_ALIAS พร้อมข้อมูลจาก 5 แหล่ง |
| Cross-Entity | ไม่รองรับ | รองรับผ่าน master_uuid |
| Fast Track | ไม่มี | มี reverse index O(1) |
| UUID กลาง | ไม่มี | มี master_uuid + ฟังก์ชันแปลง |
| แหล่งข้อมูล | Entity tables เท่านั้น | 5 แหล่ง: create, enrich, SCG, FACT, migration |

### จุดแข็งหลักของ V5.4 Hybrid

1. **ได้ข้อดีทั้งสองระบบ** — ตารางกลางสำหรับ cross-entity matching เหมือน V4.0 + entity-specific tables สำหรับ normalized queries เหมือน V5.2

2. **M_ALIAS ไม่ว่างเปล่าอีกต่อไป** — ปัญหาใหญ่ของ V5.2 คือ M_ALIAS ถูกสร้างไว้แต่ไม่มีข้อมูลเข้า V5.4 แก้ปัญหานี้โดยให้ M_ALIAS รับข้อมูลจาก 5 แหล่ง:
   - `createPerson()` / `createPlace()` → alias จากการสร้าง entity ใหม่
   - `autoEnrichAliasesFromFactBatch_()` → alias จากการวิเคราะห์ FACT_DELIVERY
   - `populateAliasFromSCGRawData_()` → alias จากข้อมูล SCG ดิบ
   - `populateAliasFromFactDelivery_()` → alias จาก FACT_DELIVERY โดยตรง
   - `MIGRATION_HybridAliasSystem()` → alias จากการย้ายข้อมูลจากระบบเก่า

3. **Fast Track เปลี่ยนประสบการณ์การใช้งาน** — การค้นหา ShipToName ที่เคยต้องวนหลาย Tier ตอนนี้จบที่ Tier 0 ด้วย O(1) lookup ทำให้งานประจำวันเร็วขึ้นอย่างมาก

4. **สอดคล้องกับมาตรฐานโลก** — Salesforce, SAP, AWS Neptune ล้วนใช้แนวทางเดียวกัน: Global Index + Local Index เพื่อให้ได้ทั้งความเร็วในการค้นหาและความถูกต้องในโครงสร้างข้อมูล

5. **ขยายได้ในอนาคต** — หากต้องการเพิ่ม entity type ใหม่ (เช่น M_VEHICLE_ALIAS, M_ROUTE_ALIAS) สามารถทำได้โดยเพิ่ม entity table ใหม่และเชื่อมโยงผ่าน M_ALIAS โดยไม่ต้องเปลี่ยนโครงสร้างหลัก

### บทสรุป

> **V5.4 Hybrid Alias Architecture คือจุดสมดุลที่ดีที่สุดระหว่างความเรียบง่ายและประสิทธิภาพ** — มันไม่ได้เลือกขั้วสุดอย่าง V4.0 (รวมศูนย์ทั้งหมด) หรือ V5.2 (แยกอย่างเดียว) แต่ผสานจุดแข็งของทั้งสองเข้าด้วยกัน ตามแนวทางที่ระบบ Enterprise ระดับโลกใช้กันจริง ผลลัพธ์คือระบบที่เร็วขึ้น (Fast Track O(1)) ถูกต้องกว่า (3NF + audit trail) และขยายได้ง่ายกว่า (Global + Local Index pattern)

---

> **เอกสารนี้จัดทำโดยทีมพัฒนา LMDS** | เวอร์ชัน 1.0 | มีนาคม 2026  
> หากมีข้อสงสัยหรือต้องการเพิ่มเติม กรุณาติดต่อทีมพัฒนา
