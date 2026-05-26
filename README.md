# LMDS V5.4.002 (Hybrid Alias Architecture)

**Logistics Master Data System — Google Apps Script + Google Sheets**

---

## ภาพรวมระบบ

LMDS (Logistics Master Data System) คือระบบ Master Data สำหรับงานขนส่งที่รับข้อมูลดิบจากงานประจำวัน (SCG API) ทำความสะอาดข้อมูล (Data Cleansing) จับคู่กับฐาน Master (Master Matching) และบันทึกผลเชิงธุรกรรมลง `FACT_DELIVERY` เพื่อให้ทีมปฏิบัติการใช้งานได้อย่างต่อเนื่องและตรวจสอบย้อนหลังได้ ระบบทำงานบนแพลตฟอร์ม Google Apps Script ที่ผูกกับ Google Spreadsheet ทำให้สามารถเข้าถึงและแก้ไขข้อมูลได้โดยตรงจาก Google Sheets โดยไม่ต้องมีเซิร์ฟเวอร์แยกต่างหาก

จุดเด่นสำคัญของ LMDS คือการเป็นทั้ง **Master Data Repository** และ **Matching Engine** ในระบบเดียวกัน โดยระบบออกแบบมาเพื่อรับมือกับข้อมูลขนส่งที่คุณภาพไม่สม่ำเสมอ อาจมีการพิมพ์ผิด ชื่อไม่ตรงกัน ที่อยู่ไม่ครบ หรือข้อมูลซ้ำซ้อน ระบบจะทำการ Normalize ข้อมูลเหล่านั้น จับคู่กับ Master ที่มีอยู่ และตัดสินใจว่าจะสร้างรายการใหม่ จับคู่อัตโนมัติ หรือส่งเข้าคิวตรวจสอบโดยมนุษย์ (Human-in-the-loop) ตามความเหมาะสม นอกจากนี้ยังมีระบบ Hybrid Alias ที่ช่วยจดจำชื่อที่เขียนแตกต่างกันแต่หมายถึงบุคคลหรือสถานที่เดียวกัน ทำให้การจับคู่มีประสิทธิภาพสูงขึ้นเรื่อยๆ เมื่อระบบทำงานต่อเนื่อง

ระบบแบ่งการทำงานออกเป็น 2 กลุ่มหลัก:
- **Group 1 (Cleansing & Master DB)**: รับข้อมูลดิบ → ทำความสะอาด → จับคู่กับ Master → บันทึกลง FACT_DELIVERY → สร้าง Alias อัตโนมัติ
- **Group 2 (Daily Ops & Search)**: ดึงข้อมูล SCG API → ประมวลผลชีตรายวัน → ค้นหาพิกัดจาก Master → ใส่ LatLong ให้ข้อมูลงานประจำวัน

---

## ข้อมูลเวอร์ชัน

| รายการ | ค่า |
|--------|-----|
| **App Version** | 5.4.002 |
| **Schema Version** | 5.4.001 |
| **App Name** | LMDS V5.4 |
| **Platform** | Google Apps Script + Google Sheets |
| **Core Engine** | MatchEngine V5.4 with Hybrid Alias Architecture |
| **Total Files** | 22 |
| **Total Lines** | ~8,700 |
| **Total Functions** | ~120 |
| **Total Sheets** | 20 |
| **Total Schemas** | 16 |

### ประวัติเวอร์ชัน

| เวอร์ชัน | วันที่ | การเปลี่ยนแปลงหลัก |
|----------|--------|-------------------|
| V4.0 | 2025-Q4 | ระบบเริ่มต้น: NameMapping, Hardcode Index, appendRow |
| V5.2.001–012 | 2026-Q1 | แก้ไข Bug 82 รายการ, เพิ่ม Smart Navigation, Auto-Alias, Batch SCG |
| V5.4.001 | 2026-05-24 | Hybrid Alias Architecture, Single Writer Pattern, M_ALIAS |
| V5.4.002 | 2026-05-26 | แก้ 7 Bug สำคัญ: Single Writer, Time Guard, Hardcode Index, Fake Call, Duplicate Function, Performance, safeAlert Consolidation |

---

## สถาปัตยกรรมหลัก

### The Trinity Framework

ระบบ LMDS ใช้ตรรกะ **"Trinity Framework"** — การมีอยู่ของการจัดส่ง 1 ชิ้น จะผูกกันด้วย 3 เสาหลัก:

| เสา | บทบาท | ตาราง | กลไกหลัก |
|-----|--------|--------|----------|
| **WHO** | ระบุตัวตนบุคคล | `M_PERSON` | กรอง Phone + Note จากข้อมูล Unstructured → Identify บุคคล |
| **WHERE-Address** | ระบุสถานที่ตามที่อยู่ | `M_PLACE` | RAW_ADDRESS + RESOLVED_ADDR + SYS_TH_GEO 16 คอลัมน์ → ประกอบร่างที่อยู่สมบูรณ์ |
| **WHERE-Coordinate** | ระบุพิกัด GPS | `M_GEO_POINT` | แกะ Coordinate จากเช็คอิน + GEO_RADIUS_M → จับรัศมีขยะ (Duplicate Location Merging ≤ 50m) |

และ **ตาราง Intersection** `M_DESTINATION` สร้าง Object Map:

```
Person_ID + Place_ID + Geo_ID = 1 Destination Node
```

Destination เป็น Object ที่เชื่อมโยงทั้ง 3 เสาเข้าด้วยกัน ทำให้สามารถอ้างอิงการจัดส่งได้อย่างชัดเจนและสมบูรณ์ หากมีการเปลี่ยนแปลงที่เสาใดเสาหนึ่ง สามารถระบุได้ทันทีว่ากระทบ Destination ใดบ้าง

### Hybrid Alias Architecture (V5.4 ใหม่)

ระบบจัดการชื่อแฝงแบบคู่ ที่รองรับทั้ง Entity-specific Alias (Local) และ Global Alias Ledger:

- **Local Alias**: `M_PERSON_ALIAS` (6 คอลัมน์), `M_PLACE_ALIAS` (6 คอลัมน์) — เก็บชื่อแฝงระดับ Entity แยกกัน
- **Global Alias Ledger**: `M_ALIAS` (8 คอลัมน์) — ตารางกลางจัดการ alias ข้ามโดเมน
- **Cross-domain Identity**: `master_uuid` (UUID v4) ใน `M_PERSON` (col 9) และ `M_PLACE` (col 13)
- **Runtime Fast-path**: variant name → M_ALIAS → master_uuid → person_id/place_id — ลด false-negative ในเคสพิมพ์ไม่ตรงมาตรฐาน
- **Single Writer Pattern**: `autoEnrichAliasesFromFactBatch_()` ใน `10_MatchEngine.gs` เป็นจุดเขียน M_ALIAS จุดเดียวใน Pipeline อัตโนมัติ — ห้ามเพิ่มจุดเขียนอื่นนอกจาก `21_AliasService.gs` (Admin/Migration)

```
┌─────────────────────────────────────────────────────────────┐
│                    Hybrid Alias Architecture                 │
│                                                              │
│  ┌──────────────┐     ┌──────────────┐                      │
│  │ M_PERSON      │     │ M_PLACE      │                      │
│  │ person_id     │     │ place_id     │                      │
│  │ master_uuid ◄─┤     │ master_uuid ◄─┤                      │
│  └──────┬───────┘     └──────┬───────┘                      │
│         │                    │                               │
│  ┌──────▼───────┐     ┌──────▼───────┐                      │
│  │M_PERSON_ALIAS│     │M_PLACE_ALIAS │   ← Entity-specific  │
│  │ (Local)      │     │ (Local)      │                      │
│  └──────┬───────┘     └──────┬───────┘                      │
│         │                    │                               │
│         └───────┬────────────┘                               │
│                 ▼                                             │
│          ┌─────────────┐                                     │
│          │   M_ALIAS    │   ← Global Alias Ledger            │
│          │ master_uuid  │                                     │
│          │ variant_name │                                     │
│          │ entity_type  │                                     │
│          │ confidence   │                                     │
│          └─────────────┘                                     │
└─────────────────────────────────────────────────────────────┘
```

### Layered Architecture (6 ชั้น)

| Layer | ชื่อ | โมดูล | หน้าที่หลัก |
|-------|------|--------|----------|
| A | Ingestion | `04_SourceRepository.gs` | อ่าน/กรองข้อมูลดิบจาก SCG API |
| B | Normalization | `05_NormalizeService.gs`, `20_ThGeoService.gs` | ทำความสะอาดชื่อ/ที่อยู่/เบอร์โทรภาษาไทย |
| C | Master Resolution | `06_PersonService.gs`, `07_PlaceService.gs`, `08_GeoService.gs`, `09_DestinationService.gs`, `10_MatchEngine.gs` | Multi-strategy Candidate Search + Scoring + Decision |
| D | Hybrid Alias | `21_AliasService.gs` | Fast Track Lookup, Global Alias, UUID Management |
| E | Transaction & Review | `11_TransactionService.gs`, `12_ReviewService.gs` | FACT_DELIVERY upsert, Q_REVIEW Human-in-the-loop |
| F | Governance & Hardening | `19_Hardening.gs`, `03_SetupSheets.gs`, `13_ReportService.gs` | Preflight Audit, SYS_LOG, Quality Reporting |

---

## โครงสร้างข้อมูลหลัก

### Master Tables

| ตาราง | คอลัมน์ | คำอธิบาย | Index Constant |
|--------|---------|----------|---------------|
| `M_PERSON` | 10 | ข้อมูลบุคคลหลัก + master_uuid | `PERSON_IDX` |
| `M_PERSON_ALIAS` | 6 | Alias ระดับ Local สำหรับบุคคล | `PERSON_ALIAS_IDX` |
| `M_PLACE` | 14 | ข้อมูลสถานที่หลัก + ที่อยู่ Enrich + master_uuid | `PLACE_IDX` |
| `M_PLACE_ALIAS` | 6 | Alias ระดับ Local สำหรับสถานที่ | `PLACE_ALIAS_IDX` |
| `M_ALIAS` | 8 | Global Alias Ledger (ข้ามโดเมน) | `ALIAS_IDX` |
| `M_GEO_POINT` | 14 | จุดพิกัด GPS + Grid-based Proximity | `GEO_IDX` |
| `M_DESTINATION` | 11 | Trinity Intersection (Person+Place+Geo) | `DEST_IDX` |

### Transaction / Operations

| ตาราง | คอลัมน์ | คำอธิบาย | Index Constant |
|--------|---------|----------|---------------|
| `FACT_DELIVERY` | 32 | ตารางธุรกรรมหลัก ผูกกับทุก Entity | `FACT_IDX` |
| `Q_REVIEW` | 22 | คิวรอตรวจสอบ Human-in-the-loop | `REVIEW_IDX` |
| `ตารางงานประจำวัน` | 29 | ข้อมูลงานรายวันจาก SCG API | `DATA_IDX` |
| `SCGนครหลวงJWDภูมิภาค` | 37 | Landing Sheet ข้อมูลดิบจาก SCG | `SRC_IDX` |

### System Tables

| ตาราง | คอลัมน์ | คำอธิบาย | Index Constant |
|--------|---------|----------|---------------|
| `SYS_CONFIG` | 4 | ตั้งค่าระบบ (API Key, Parameters) | — |
| `SYS_LOG` | 6 | บันทึกประวัติการทำงาน (Auto-clean at 5,000 rows) | `SYS_LOG_IDX` |
| `SYS_TH_GEO` | 16 | ฐานข้อมูลภูมิศาสตร์ไทย (7,537 รายการ) | `TH_GEO_IDX` |
| `MAPS_CACHE` | 10 | แคชผลลัพธ์ Google Maps API | `MAPS_CACHE_IDX` |
| `RPT_DATA_QUALITY` | 8 | รายงานคุณภาพข้อมูล | — |

### Daily Operations Sheets

| ตาราง | คอลัมน์ | คำอธิบาย |
|--------|---------|----------|
| `Input` | 2 | ฟอร์มใส่ Cookie + ShipmentNos |
| `ข้อมูลพนักงาน` | 8 | ข้อมูลพนักงานขับรถ |
| `สรุป_เจ้าของสินค้า` | 6 | สรุปตาม SoldToName |
| `สรุป_Shipment` | 7 | สรุปตาม ShipmentNo+Truck |

---

## รายการไฟล์ในโปรเจกต์ (22 ไฟล์)

| # | ไฟล์ | บรรทัด | หน้าที่หลัก | ฟังก์ชันสำคัญ |
|---|------|--------|-----------|--------------|
| 00 | `00_App.gs` | 779 | จุดเริ่มระบบ — Custom Menu, Pipeline Orchestration, Smart Navigation, Diagnostic | `onOpen()`, `onEdit()`, `runFullPipeline()`, `diagnoseSystemState()`, `safeRun()` |
| 01 | `01_Config.gs` | 538 | ค่าคงที่ทั้งหมด — Sheet Names, Column Indices (13 ชุด), AI Thresholds, Cache | `validateConfig()`, `getGeminiApiKey()`, `invalidateAllGlobalCaches()` |
| 02 | `02_Schema.gs` | 492 | Schema ทุกชีต — Header Definitions (16 schema), Validation | `getSheetHeaders()`, `validateSheetHeaders()`, `getColIndex()`, `validateSchemaConsistency()` |
| 03 | `03_SetupSheets.gs` | 491 | สร้างชีตทั้งหมด — Auto-repair, Logging System (SYS_LOG) | `setupAllSheets()`, `logInfo/Warn/Error/Debug()`, `clearOldLogs_()` |
| 04 | `04_SourceRepository.gs` | 372 | อ่าน/กรองข้อมูลดิบ — Caching, Sync Status Update | `getAllSourceRows()`, `getUnprocessedRows()`, `updateSyncStatus_()` |
| 05 | `05_NormalizeService.gs` | 408 | ทำความสะอาดข้อมูล — 80+ Thai Prefixes, Phone/Doc Extraction, Phonetic Key | `normalizePersonNameFull()`, `normalizePlaceName()`, `buildThaiPhoneticKey()`, `normalizeForCompare()` |
| 06 | `06_PersonService.gs` | 483 | Person CRUD — 5-strategy Candidate Search, Scoring | `resolvePerson()`, `findPersonCandidates()`, `createPerson()`, `mergePersonRecords()` |
| 07 | `07_PlaceService.gs` | 727 | Place CRUD — 4-level Address Enrichment, Branch Matching | `resolvePlace()`, `findPlaceCandidates()`, `getEnrichedGeoData()`, `tryMatchBranch()` |
| 08 | `08_GeoService.gs` | 403 | Geo CRUD — Grid-based Proximity (3x3), Tiered Spatial | `resolveGeo()`, `findGeoCandidates_()`, `haversineDistance()`, `createGeoPoint()` |
| 09 | `09_DestinationService.gs` | 321 | Destination CRUD — Trinity Intersection | `resolveDestination()`, `createDestination()`, `getDestsByPersonId()` |
| 10 | `10_MatchEngine.gs` | 902 | หัวใจ Pipeline — 8 Rules Matrix, Single Writer M_ALIAS | `runMatchEngine()`, `processOneRow()`, `makeMatchDecision()`, `autoEnrichAliasesFromFactBatch_()` |
| 11 | `11_TransactionService.gs` | 247 | FACT_DELIVERY — Upsert, Invoice Lookup | `upsertFactDelivery()`, `findFactRowByInvoice_()` |
| 12 | `12_ReviewService.gs` | 460 | Review Queue — Human-in-the-loop, Decision Application | `enqueueReview()`, `applyReviewDecision()`, `applyAllPendingDecisions()` |
| 13 | `13_ReportService.gs` | 224 | รายงานคุณภาพ — Match Rates, Master Counts | `buildFullQualityReport()`, `highlightHighPriorityReviews()` |
| 14 | `14_Utils.gs` | 446 | ไลบรารีใช้ร่วม — Dice, Levenshtein, Haversine, Gemini AI, Retry, safeUiAlert | `diceCoefficient()`, `levenshteinDistance()`, `callGeminiAPI()`, `generateShortId()`, `safeUiAlert_()` |
| 15 | `15_GoogleMapsAPI.gs` | 348 | Geocoding — 3-layer Cache (RAM → Sheet → API) | `geocodeAddress()`, `reverseGeocode()`, `getRouteDistanceKm()`, `clearMapsCache()` |
| 16 | `16_GeoDictionaryBuilder.gs` | 477 | พจนานุกรมไทย — Postcode Lookup, Fuzzy Matching, Chunked Cache | `buildGeoDictionary()`, `lookupByPostcode()`, `scanAddressAgainstDictionary()` |
| 17 | `17_SearchService.gs` | 406 | สะพาน Group 2→1 — 6-tier Search for Daily Job | `findBestGeoByPersonPlace()`, `runLookupEnrichment()`, `lookupSingleRow()` |
| 18 | `18_ServiceSCG.gs` | 415 | SCG API — Fetch, Flatten, Aggregate, Summaries | `fetchDataFromSCGJWD()`, `applyMasterCoordinatesToDailyJob()`, `buildOwnerSummary()` |
| 19 | `19_Hardening.gs` | 312 | ระบบป้องกัน — Preflight Audit, Duplicate Detection | `runPreflightAudit()`, `detectDoubleProcessing()`, `generatePersonAliasesFromHistory()` |
| 20 | `20_ThGeoService.gs` | 170 | Thai Geo Extraction — 3-tier Dictionary Search | `extractGeoFromAddress()`, `populateGeoMetadata()` |
| 21 | `21_AliasService.gs` | 828 | Hybrid Alias — Fast Track Lookup, Migration, UUID Management | `fastLookupByShipToName()`, `resolveMasterUuidViaGlobalAlias()`, `createGlobalAlias()`, `MIGRATION_HybridAliasSystem()` |

---

## การติดตั้ง (First-time Setup)

### ขั้นตอนที่ 1: ผูก Apps Script กับ Google Spreadsheet

1. เปิด Google Spreadsheet ที่ต้องการใช้งาน
2. ไปที่ **Extensions → Apps Script**
3. คัดลอกไฟล์ `.gs` ทั้ง 22 ไฟล์ไปวางใน Script Editor (หรือใช้ clasp push)
4. ตรวจสอบว่าไฟล์ทั้งหมดอยู่ในลำดับที่ถูกต้อง (00-21)

### ขั้นตอนที่ 2: ตั้งค่า API Key

1. เปิดเมนู **LMDS V5.4** → **ตั้งค่าระบบ**
2. ใส่ Gemini API Key (รูปแบบ `AIza...`)
3. กดบันทึก

### ขั้นตอนที่ 3: สร้างชีตทั้งหมด

1. เปิดเมนู **LMDS V5.4** → **สร้างชีตทั้งหมด**
2. รอจนกว่าระบบจะสร้างชีตครบทั้งหมด (รวมถึง Header + Dropdown + Default Config)
3. ตรวจสอบว่ามีชีตครบ 20 ชีต

### ขั้นตอนที่ 4: เติมข้อมูล SYS_TH_GEO

1. นำเข้าข้อมูลภูมิศาสตร์ไทย (7,537 รายการ) ลงชีต `SYS_TH_GEO`
2. รันเมนู **เตรียม Geo Dictionary** เพื่อสร้าง Metadata columns (search_key, postal_key ฯลฯ)

### ขั้นตอนที่ 5: ทดสอบ Pipeline

1. ใส่ Cookie และ ShipmentNos ในชีต `Input`
2. รันเมนู **ดึงข้อมูล SCG** เพื่อดึงข้อมูลดิบ
3. รันเมนู **Run Full Pipeline** เพื่อทดสอบ 1 รอบ
4. ตรวจสอบผลใน `FACT_DELIVERY` และ `Q_REVIEW`

### ขั้นตอนที่ 6: (ถ้าย้ายระบบ) รัน Hybrid Alias Migration

1. รันเมนู **Hybrid Alias Migration** ใน `21_AliasService.gs`
2. ตรวจสอบจำนวน Alias ที่สร้างในแต่ละขั้น (5 ขั้นตอน พร้อม Time Guard + Checkpoint Resume)
3. ดูรายละเอียดเพิ่มเติมที่ `BLUEPRINT.md` หัวข้อ Migration Guide

---

## การใช้งานหลัก

### เมนูหลัก (LMDS V5.4)

| เมนู | ฟังก์ชัน | คำอธิบาย |
|------|----------|----------|
| **ดึงข้อมูล SCG** | `fetchDataFromSCGJWD()` | ดึงข้อมูลงานรายวันจาก SCG API → ชีตรายวัน + สรุป |
| **Run Full Pipeline** | `runFullPipeline()` | ประมวลผลข้อมูลดิบ → Master + FACT_DELIVERY |
| **ตรวจ Q_REVIEW** | `openReviewQueue()` | เปิดชีต Q_REVIEW สำหรับ Human-in-the-loop |

### เมนูระบบ

| เมนู | ฟังก์ชัน | คำอธิบาย |
|------|----------|----------|
| **ตั้งค่าระบบ** | `setupEnvironment()` | ตั้งค่า Gemini API Key |
| **สร้างชีตทั้งหมด** | `setupAllSheets()` | สร้าง/ซ่อมแซมชีตทั้งหมด (auto-repair headers) |
| **ตรวจสอบระบบ** | `checkSystemIntegrity()` | ตรวจ 20 ชีต + API Key |
| **วินิจฉัยระบบ** | `diagnoseSystemState()` | วินิจฉัยแบบละเอียด (ชีต, คอลัมน์, ข้อมูลว่าง, SYNC_STATUS, Errors) |
| **แสดงเวอร์ชัน** | `showVersionInfo()` | แสดงเวอร์ชันทุกโมดูล |

### เมนูรายงาน

| เมนู | ฟังก์ชัน | คำอธิบาย |
|------|----------|----------|
| **รายงานคุณภาพข้อมูล** | `buildFullQualityReport()` | สร้างรายงาน RPT_DATA_QUALITY |
| **จัดลำดับความสำคัญ** | `highlightHighPriorityReviews()` | ระบายสี Q_REVIEW ตาม Priority |

### เมนูขั้นสูง

| เมนู | ฟังก์ชัน | คำอธิบาย |
|------|----------|----------|
| **ตรวจ Preflight** | `runPreflightAudit()` | ตรวจสอบก่อนรัน Pipeline |
| **ตรวจ Invoice ซ้ำ** | `detectDoubleProcessing()` | ตรวจ Invoice ซ้ำใน FACT |
| **สร้าง Alias จากประวัติ** | `generatePersonAliasesFromHistory()` | สร้าง Alias จาก FACT_DELIVERY |
| **รีเซ็ต Sync Status** | `resetSourceSyncStatus()` | รีเซ็ต SYNC_STATUS ทั้งหมดเป็น PENDING |
| **ล้าง Maps Cache** | `clearMapsCache()` | ล้างแคช Google Maps API |

### การใช้งานประจำวัน (Workflow)

1. **ดึงข้อมูล SCG**: ใส่ Cookie + ShipmentNos → กดดึงข้อมูล
2. **Run Full Pipeline**: ประมวลผลข้อมูลเข้า Master + FACT_DELIVERY (ระบบ Auto-Resume ถ้าเกิน 5 นาที)
3. **ตรวจ Q_REVIEW**: ดูเคสกำกวม → เลือก Decision (CREATE_NEW / MERGE_TO_CANDIDATE / IGNORE / ESCALATE)
4. **รายงานคุณภาพ**: ตรวจสอบ Match Rate และ Master Data สถิติ

### Smart Navigation

เมื่อคลิกที่ Candidate ID ใน Q_REVIEW ระบบจะนำทางไปยังชีตที่เกี่ยวข้องอัตโนมัติผ่าน Installable Trigger (`onSelectionChange`):
- Person ID → M_PERSON
- Place ID → M_PLACE
- Geo ID → M_GEO_POINT
- TX ID → FACT_DELIVERY

---

## กลไกการจับคู่ (Matching)

### Person Candidate Search (5 กลยุทธ์)

| ลำดับ | กลยุทธ์ | คำอธิบาย | คะแนนหากตรง |
|-------|--------|----------|-------------|
| 1 | **M_ALIAS Fast Path** | ค้นหาใน Global Alias Ledger → masterUuid → personId | 100 (exact), 95 (substring), 90 (reverse substring) |
| 2 | **Phone Match** | จับคู่ด้วยเบอร์โทร (ทำความสะอาดแล้ว 9+ หลัก) | 95 |
| 3 | **Alias Match** | ค้นหาใน M_PERSON_ALIAS (normalize เทียบ) | ไปต่อ scoring |
| 4 | **Phonetic/Name Match** | Thai Phonetic Key + prefix 3 ตัวอักษร + `normalizeForCompare()` | Dice + Levenshtein + Ratio |
| 5 | **Note Search (Deep Match)** | ค้นหาในคอลัมน์ Note แบบ tokenized (แตกคำ ≥2 ตัวอักษร) | ไปต่อ scoring |

### Place Candidate Search (4 กลยุทธ์)

| ลำดับ | กลยุทธ์ | คำอธิบาย | คะแนนหากตรง |
|-------|--------|----------|-------------|
| 1 | **M_ALIAS Fast Path** | ค้นหาใน Global Alias Ledger → masterUuid → placeId | 100/95/90 |
| 2 | **Alias Match** | ค้นหาใน M_PLACE_ALIAS | ไปต่อ scoring |
| 3 | **Phonetic/Name Match** | Thai Phonetic Key + prefix 3 ตัวอักษร | Dice + Levenshtein |
| 4 | **Note Search** | ค้นหาในคอลัมน์ Note | ไปต่อ scoring |

นอกจากนี้ยังมี **Branch Match** (`tryMatchBranch()`) สำหรับร้านค้าห่วงโซ่ — ถ้าหาชื่อไม่เจอใน Candidate ปกติ ระบบจะลองค้นหาในรายชื่อ Chain Store (เช่น 7-Eleven, Lotus's, Big C) และจับคู่ตามจังหวัด

### Geo Proximity Search

- Grid-based 3x3 Pre-filter (`GEO_GRID_SIZE = 0.01` ≈ 1.1 km)
- Haversine Distance คำนวณระยะทางจริงเป็นเมตร
- Tiered Classification: ≤50m FOUND (auto-merge) / 51-79m NEARBY_YELLOW (review) / 80-100m NEARBY_ORANGE (review) / >100m NOT_FOUND (สร้างใหม่)

### Match Engine Rules (8 กฎ)

| กฎ | ชื่อ | Action | เงื่อนไข | Priority |
|----|------|--------|---------|----------|
| 1 | **INVALID_LATLNG** | `REVIEW_INVALID` (Confidence: 0) | พิกัดจาก Source หาย (lat=0, lng=0 หรือว่าง) | CRITICAL |
| 2 | **LOW_QUALITY** | `REVIEW` | ข้อมูลคุณภาพต่ำ (ชื่อสั้นเกิน/ที่อยู่ไม่ครบ) | HIGH |
| 3 | **GEO_PROVINCE_CONFLICT** | `REVIEW` (Confidence: 50) | จังหวัดจาก Geo ไม่ตรงกับจังหวัดจากที่อยู่ | HIGH |
| 3.5 | **NEARBY_PENDING** | ตามระยะ | Tiered Spatial: ≤50m AutoMerge, 51-79m Yellow, 80-100m Orange, >100m สร้างใหม่ | MEDIUM |
| 4 | **FULL_MATCH** | `AUTO_MATCH` | Person + Place + Geo ตรงทั้งหมด | — |
| 5 | **GEO_ANCHOR** | `AUTO_MATCH` | เจอ Geo เดิม + Person เดิม (Place อาจใหม่) | — |
| 6 | **FUZZY_MATCH** | `AUTO_MATCH` | Score ≥ 90 | — |
| 7 | **ALL_NEW_WITH_GEO** | `CREATE_NEW` | ทุกอย่างใหม่ มีพิกัด | — |
| 8 | **DEFAULT** | `REVIEW` | ไม่เข้ากฎใดข้างต้น | — |

### Scoring Algorithm

**Person Scoring:**
```
IF phone match → score = 95
ELSE IF name length ≥ 4:
  score = Dice(0.5) + Levenshtein(0.3) + Ratio(0.2)
ELSE:
  score = Dice(0.6) + Levenshtein(0.4)

IF score < SCORE_MIN_THRESHOLD (60) → score = 0
```

**Place Scoring:**
```
IF exact match → score = 100
ELSE:
  score = Dice(0.6) + Levenshtein(0.4)

IF score < PLACE_SCORE_MIN (55) → score = 0
```

### Scoring Thresholds

| Score | Action | สี |
|-------|--------|-----|
| ≥ 90 | AUTO_MATCH | เขียว `#b6d7a8` |
| 70-89 | REVIEW | เหลือง `#ffe599` |
| < 50 | NOT_FOUND | แดง `#f4cccc` |

---

## กลไกการทำงานของ Pipeline

```
รับข้อมูลดิบ (SourceRepository)
    │  → อ่านเฉพาะ SYNC_STATUS != SUCCESS
    │  → กรอง Invoice ซ้ำ (Set-based lookup)
    │  → Auto-mark รายการที่ถูกข้ามเป็น SUCCESS
    ▼
Normalize (NormalizeService + ThGeoService)
    │   - 7-step Person Normalization
    │   - 4-step Place Normalization
    │   - 4-level Address Enrichment
    │   - "ขยะไม่ทิ้ง" → deliveryNotes[] → คอลัมน์ NOTE
    ▼
Resolve Person / Place / Geo / Destination
    │   - Person: 5-strategy Candidate Search
    │   - Place: 4-strategy Candidate Search + Branch Match
    │   - Geo: Grid-based Proximity (3×3)
    │   - Destination: Trinity Intersection
    ▼
Match Engine Decision (8 Rules)
    │
    ├──→ AUTO_MATCH → FACT_DELIVERY
    ├──→ CREATE_NEW → Master ใหม่ + FACT_DELIVERY
    └──→ REVIEW → Q_REVIEW (Human-in-the-loop)
            │
            ▼
    Auto-enrich Aliases (M_ALIAS + M_PERSON_ALIAS + M_PLACE_ALIAS)
         ↑ Single Writer: autoEnrichAliasesFromFactBatch_()
```

### Time Guard & Auto-Resume

Pipeline มี Time Guard ที่ 300,000ms (5 นาที) เพื่อไม่ให้เกิน GAS Timeout (6 นาที) หากใกล้หมดเวลา ระบบจะ:
1. บันทึก Checkpoint ปัจจุบัน (SYNC_STATUS ทำหน้าที่แทน — แถวที่ประมวลผลแล้วถูก mark เป็น SUCCESS)
2. ตั้ง Time-based Trigger ให้ Resume ภายใน 60 วินาที
3. Kill การทำงานปัจจุบัน
4. Resume จาก Checkpoint ในรอบถัดไป

### Batch & Chunking

- ข้อมูลถูกอัดเข้า Array — ทุกรอบ Batches (`BATCH_SIZE = 20`)
- สาด Record Status ผ่าน `RangeList` (A1 Notations) ลด Overhead API Data Write 15-25%
- บันทึก FACT_DELIVERY + Q_REVIEW + M_ALIAS + M_PERSON_ALIAS + M_PLACE_ALIAS ในครั้งเดียว (flush at end)

---

## Search Service (Group 2 → Group 1 Bridge)

Search Service เป็นสะพานเชื่อมระหว่าง Group 2 (Daily Ops) กับ Group 1 (Master DB) โดยใช้ระบบ 6-Tier Search:

| Tier | ชื่อ | กลไก | ความแม่นยำ |
|------|------|------|----------|
| Tier 0 | **M_ALIAS Fast Track** | ShipToName → M_ALIAS reverse index → masterUuid → dest → lat,lng | สูงสุด |
| Tier C | **Person Anchor** | ค้นหา Person จากชื่อ → ใช้ Destination ที่ใช้บ่อยสุด | สูง |
| Tier A | **Person+Place** | จับคู่ Person + Place → หา Destination | สูง |
| Tier B | **Place Only** | ค้นหาจาก Place เท่านั้น | กลาง |
| Tier D | **SCG API** | ใช้ข้อมูลจาก SCG โดยตรง | ต่ำ |
| Tier E | **AI Reasoning** | เรียก Gemini AI วิเคราะห์ | ทดลอง |

---

## ระบบ Cache (3-Layer)

```
┌─────────────────────────────────────────────┐
│ Layer 1: RAM (Global Variables)             │
│   _GLOBAL_GEO_DICT_CACHE                    │
│   _GLOBAL_GEO_POINTS_CACHE                  │
│   → เร็วสุด แต่หายเมื่อ script จบ           │
├─────────────────────────────────────────────┤
│ Layer 2: CacheService (Script Cache)        │
│   TTL: 6 ชั่วโมง (21,600 วินาที)           │
│   → แชร์ข้าม execution                      │
│   → Chunked สำหรับข้อมูลใหญ่ (>100KB)      │
├─────────────────────────────────────────────┤
│ Layer 3: Sheet (Google Sheets)              │
│   MAPS_CACHE, SYS_TH_GEO, etc.             │
│   → ถาวร แต่ช้าที่สุด                       │
└─────────────────────────────────────────────┘
```

### Cache Invalidation

`invalidateAllGlobalCaches()` ใน `01_Config.gs` เป็นจุดกลางล้างแคชทั้งหมด — เรียกเมื่อ:
- เปลี่ยนแปลง Schema
- รัน `setupAllSheets()`
- ต้องการ refresh ข้อมูล

---

## ข้อควรระวังก่อน Production Run

### ตรวจสอบก่อนรัน

- [ ] Header ทุกชีตตรงกับ `SCHEMA` ใน `02_Schema.gs`
- [ ] `M_ALIAS` ถูกสร้างแล้วและเรียงคอลัมน์ถูกต้อง (8 คอลัมน์)
- [ ] `master_uuid` มีใน M_PERSON (col 9) และ M_PLACE (col 13)
- [ ] API Key ตั้งค่าแล้ว
- [ ] รัน `checkSystemIntegrity()` ผ่าน
- [ ] รัน `runPreflightAudit()` ผ่าน
- [ ] ไม่มี Hardcode Index (ใช้ `XXX_IDX` เท่านั้น)
- [ ] ทุก Entry Point มี try-catch

### กฎสำคัญ

- **Single Writer Pattern**: `autoEnrichAliasesFromFactBatch_()` ใน `10_MatchEngine.gs` เป็นจุดเขียน M_ALIAS จุดเดียวใน Pipeline — ห้ามเพิ่มจุดเขียนอื่น (ยกเว้น `21_AliasService.gs` สำหรับ Admin/Migration)
- **Schema + Config ต้องอัปเดตพร้อมกัน**: ทุกการเปลี่ยนแปลง Schema ต้องอัปเดต `01_Config.gs` (IDX) และ `02_Schema.gs` (SCHEMA) พร้อมกัน
- **Header Order**: ต้องรักษาลำดับ Header ให้ตรง Schema เสมอ — การเปลี่ยนลำดับคอลัมน์ทำให้ข้อมูลผิดตำแหน่ง
- **ข้อมูลใหม่ทันที**: ระบบรองรับการรันกับข้อมูลใหม่ได้ทันที ไม่บังคับ Backfill ข้อมูลเก่า
- **Group Boundary**: Group 1 (Pipeline) กับ Group 2 (Daily Ops) ต้องแยกจากกัน — Search Service เป็นสะพานเชื่อมเท่านั้น

### สิ่งที่ห้ามทำ

- ❌ ห้ามเขียน M_ALIAS จากนอก `10_MatchEngine.gs` (Pipeline) และ `21_AliasService.gs` (Admin/Migration)
- ❌ ห้ามใช้ `syncAliasToEntityTable_()` — ถูกลบออกแล้ว (เคยเป็นสาเหตุ Circular Dependency)
- ❌ ห้ามข้าม `validateConfig()` หลังการเปลี่ยนแปลง Config
- ❌ ห้ามรัน Pipeline โดยไม่ตรวจสอบ `checkSystemIntegrity()` ก่อน
- ❌ ห้าม Hardcode Index (ใช้ `XXX_IDX` เท่านั้น)
- ❌ ห้าม `getValue()`/`setValue()`/`appendRow()` ในลูป
- ❌ ห้ามเรียกฟังก์ชันที่ไม่มีอยู่จริงในโปรเจกต์

---

## การแก้ปัญหา (Troubleshooting)

| อาการ | สาเหตุที่เป็นไปได้ | วิธีแก้ |
|-------|-------------------|--------|
| Pipeline รันแล้วไม่มีข้อมูลใน Master | ข้อมูลดิบ SYNC_STATUS เป็น SUCCESS แล้ว | รัน **รีเซ็ต Sync Status** |
| ชีตหาย | ไม่ได้รัน Setup | รัน **สร้างชีตทั้งหมด** (auto-repair) |
| Q_REVIEW ไม่มี Dropdown | Setup ไม่สมบูรณ์ | รัน **สร้างชีตทั้งหมด** ใหม่ |
| Maps API Error | Quota หมด / ไม่มี Internet | ตรวจสอบ Log, ใช้ Cache |
| Pipeline Timeout | ข้อมูลเยอะเกิน 5 นาที | Time Guard จะ Auto-Resume อัตโนมัติ |
| Match Rate ต่ำ | Alias ไม่ครบ | รัน **สร้าง Alias จากประวัติ** |
| Invoice ซ้ำใน FACT | Bug ใน Pipeline | รัน **ตรวจ Invoice ซ้ำ** |
| `safeUiAlert_` Error | UI context ไม่พร้อม | ระบบมี guard ป้องกันแล้ว (v5.4.002) |
| Geo Dictionary ไม่ทำงาน | SYS_TH_GEO ไม่มี Metadata | รัน **เตรียม Geo Dictionary** |
| `normalizeInvoiceNo` ผิด | e-notation (เช่น 2.4E+12) | v5.2.016 แก้ไขแล้ว |

---

## สถานะ Bug และการปรับปรุง (V5.4.002)

### Bug ที่แก้ไขแล้ว (7 รายการ)

| ID | ระดับ | รายละเอียด | สถานะ |
|----|--------|-----------|--------|
| C1 | CRITICAL | Single Writer Violation — `populateAliasFromSCGRawData_()` เขียน M_ALIAS จากนอก Pipeline | ✅ Done — ลบออกจาก Group 2 |
| C4 | CRITICAL | MIGRATION ไม่มี Time Guard — อาจ timeout กลางคัน | ✅ Done — เพิ่ม hasTimePassed_, saveMigrationCheckpoint_() |
| F1 | HIGH | Fake Function Call — `autoInstallSmartNav_()` ไม่มีอยู่จริง | ✅ Done — สร้างฟังก์ชันจริง |
| H1 | HIGH | Hardcode Index ใน `18_ServiceSCG.gs` — 8 จุดใช้เลขคอลัมน์ตรง | ✅ Done — เปลี่ยนเป็น `DATA_IDX.*` |
| D1 | MEDIUM | Duplicate Function — `loadCachedGeoRows_()` ซ้ำใน 07_PlaceService.gs | ✅ Done — ลบออก ใช้จาก 16_GeoDictionaryBuilder.gs |
| P1 | HIGH | Performance — `updateDestinationStats` ใช้ setValue ทีละแถว | ✅ Done — เปลี่ยนเป็น batch setValues |
| C2 | MEDIUM | Consolidate safeAlert — `safeAlert_()` + `safeUiAlert_()` กระจายอยู่หลายไฟล์ | ✅ Done — รวมเป็น `safeUiAlert_()` ใน `14_Utils.gs` |

### ไฟล์ที่แก้ไข (8 ไฟล์)

| ไฟล์ | การเปลี่ยนแปลง |
|------|---------------|
| `10_MatchEngine.gs` | ลบ `syncAliasToEntityTable_()`, เขียน M_ALIAS + M_PERSON_ALIAS + M_PLACE_ALIAS โดยตรง |
| `18_ServiceSCG.gs` | ลบ `populateAliasFromSCGRawData_()`, Hardcode Index → DATA_IDX.*, เพิ่ม `checkIsEPOD()` |
| `06_PersonService.gs` | ลบ `createGlobalAlias()` จาก `createPerson()`/`createPersonAlias()` (Single Writer) |
| `07_PlaceService.gs` | ลบ `createGlobalAlias()` จาก `createPlace()`/`createPlaceAlias()`, ลบ `loadCachedGeoRows_()` ซ้ำ |
| `14_Utils.gs` | เพิ่ม `safeUiAlert_()` (consolidated), `normalizeInvoiceNo()` |
| `16_GeoDictionaryBuilder.gs` | `safeAlert_()` deprecated → เรียก `safeUiAlert_()` แทน |
| `21_AliasService.gs` | เพิ่ม Time Guard + Checkpoint Resume ใน MIGRATION, เพิ่ม `batchAppendToAliasSheet_()` |
| `00_App.gs` | สร้าง `autoInstallSmartNav_()` จริง, `showVersionInfo()` แก้ 21→22 files |

### ไฟล์ที่ไม่เปลี่ยนแปลง (14 ไฟล์)

`01_Config.gs`, `02_Schema.gs`, `03_SetupSheets.gs`, `04_SourceRepository.gs`, `05_NormalizeService.gs`, `08_GeoService.gs`, `09_DestinationService.gs`, `11_TransactionService.gs`, `12_ReviewService.gs`, `13_ReportService.gs`, `15_GoogleMapsAPI.gs`, `17_SearchService.gs`, `19_Hardening.gs`, `20_ThGeoService.gs`

---

## กฎการเขียนโค้ด (15 ข้อ)

| ข้อ | ชื่อกฎ | ใจความสำคัญ | สถานะ |
|-----|--------|----------------|--------|
| 1 | Clean Code | camelCase, ชื่อสื่อความหมาย, ฟังก์ชันสั้น (≤30 บรรทัด ยกเว้นได้รับอนุมัติ) | PARTIAL |
| 2 | Single Responsibility | 1 ฟังก์ชัน = 1 หน้าที่ | FAIL |
| 3 | No Hardcode Index | ใช้ `XXX_IDX` แทนเลขคอลัมน์ | ✅ PASS (v5.4.002) |
| 4 | Safe Batching | ห้าม `setValue`/`getValue`/`appendRow` ในลูป | PARTIAL |
| 5 | Resumable State | มี checkpoint + resume สำหรับสคริปต์ยาว | ✅ PASS |
| 6 | Dependency Map | ระบุ dependencies ที่หัวไฟล์ | PASS |
| 7 | Zero Hallucination | ห้ามเรียกฟังก์ชันที่ไม่มี | ✅ PASS (v5.4.002) |
| 8 | Namespace Collision Prevention | ใช้ namespace/prefix ป้องกันชื่อซ้ำ | PARTIAL |
| 9 | No Cross-File Global Variables | หลีกเลี่ยง global state | FAIL |
| 10 | Library Versioning | ล็อคเวอร์ชัน library | PASS |
| 11 | HTML Service Include Pattern | `include()` สำหรับแยก HTML | PASS |
| 12 | Error Handling per Entry Point | try-catch ทุกเมนู | FAIL |
| 13 | Logging with File & Line | logError มี stack trace | PARTIAL |
| 14 | Structured File Naming | ชื่อไฟล์สื่อถึงหน้าที่ | PASS |
| 15 | Full Version Only | ห้ามตัดทอนโค้ด | PASS |

---

## เอกสารอ้างอิง

| เอกสาร | คำอธิบาย |
|---------|----------|
| **BLUEPRINT.md** | สถาปัตยกรรมเชิงลึก — Data Model, Pipeline Mechanics, Rules Matrix, Caching, Migration |
| **Cross_Validation_Report_LMDS_V5.4.md** | เปรียบเทียบผลวิเคราะห์จาก 5 AI systems เทียบกับโค้ดจริง |
| **LMDS_Code_Analysis_Report.md** | วิเคราะห์ 22 ไฟล์เทียบกับ 15 กฎการเขียนโค้ด |
| **LMDS_V54_Improvement_Plan.md** | แผนปรับปรุง V5.4.001 → V5.4.002 (7 Fixes) |
| **LMDS_V54_Improvement_Plan_v542.md** | สรุปผลการปรับปรุง V5.4.002 (7 Bugs แก้แล้ว) |
| **LMDS_Bug_Hunt_Report.md** | รายงาน Bug 7 หมวด (Phantom Functions → Entry Points) |
| **LMDS_15Rules_Code_Review.md** | รายงานตรวจสอบ 15 กฎ (5 PASS, 4 PARTIAL, 6 FAIL) |
| **LMDS_Performance_Analysis.md** | วิเคราะห์ Performance 15 ปัญหา + 3-Phase Priority |
| **LMDS_Refactoring_Plan.md** | แผน Refactoring 3 Phase (6 สัปดาห์) |
| **LMDS_PreDeploy_Checklist.md** | Checklist ก่อน Deploy (5/8 PASS) |
| **กฎการเขียนโค้ด LMDS.md** | กฎ 15 ข้อ (ฉบับสมบูรณ์) |
| **📋กฎการเขียนโค้ด.md** | กฎ 16 ข้อ (ฉบับ AI-Optimized, เพิ่ม Quick Reference) |
