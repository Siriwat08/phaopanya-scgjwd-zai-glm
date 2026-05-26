# BLUEPRINT: LMDS Architecture V5.4.002

> เอกสารสถาปัตยกรรมระบบ LMDS (Logistics Master Data System) ฉบับเต็ม
> ร่างสถาปัตยกรรมระดับ Core-System ชี้แจ้ง Data Schema, Pipeline Mechanics, Module Specification, Bug Status, Performance Analysis สำหรับนักพัฒนาระบบ
> Version: 5.4.002 | Last Updated: 2026-05-26

---

## สารบัญ

1. [เป้าหมายระบบ](#1-เป้าหมายระบบ)
2. [The Trinity Framework](#2-the-trinity-framework)
3. [Hybrid Alias Architecture](#3-hybrid-alias-architecture)
4. [Layered Architecture](#4-layered-architecture)
5. [Data Model](#5-data-model)
6. [Module Specification](#6-module-specification)
7. [Global Pipeline Mechanics](#7-global-pipeline-mechanics)
8. [Match Engine — Rules Matrix](#8-match-engine--rules-matrix)
9. [Execution Flow](#9-execution-flow)
10. [Caching Strategy](#10-caching-strategy)
11. [Dependencies Matrix](#11-dependencies-matrix)
12. [Error Handling & Disaster Prevention](#12-error-handling--disaster-prevention)
13. [Configuration & Schema System](#13-configuration--schema-system)
14. [Search Service — Tier Architecture](#14-search-service--tier-architecture)
15. [Migration Guide](#15-migration-guide)
16. [Single Writer Pattern (V5.4.002)](#16-single-writer-pattern-v54002)
17. [Bug Status & Improvement History](#17-bug-status--improvement-history)
18. [Performance Analysis](#18-performance-analysis)
19. [Pre-Deploy Checklist](#19-pre-deploy-checklist)
20. [Production Notes](#20-production-notes)

---

## 1. เป้าหมายระบบ

LMDS ออกแบบเพื่อเป็น **Master Data + Matching Engine** สำหรับข้อมูลขนส่งที่คุณภาพไม่สม่ำเสมอ โดยเน้น 3 เสาหลัก:

| เสาหลัก | คำอธิบาย | กลไกในระบบ |
|---------|----------|------------|
| **Data Quality** | ข้อมูลถูกทำความสะอาด Normalize และตรวจสอบก่อนเข้าระบบ | NormalizeService, ThGeoService, 4-level Address Enrichment |
| **Traceability** | ทุกการตัดสินใจของระบบมีหลักฐานบันทึกสำรวจย้อนหลัง | `match_evidence`, `SYNC_STATUS`, `SYS_LOG`, Audit Trail |
| **Operational Continuity** | ระบบรันได้ทันทีกับข้อมูลใหม่ ไม่ต้อง Backfill ข้อมูลเก่า | Incremental Processing, Time Guard + Auto-Resume, LockService |

จุดเด่นสำคัญของ LMDS คือการเป็นทั้ง **Master Data Repository** และ **Matching Engine** ในระบบเดียวกัน ระบบออกแบบมาเพื่อรับมือกับข้อมูลขนส่งที่คุณภาพไม่สม่ำเสมอ อาจมีการพิมพ์ผิด ชื่อไม่ตรงกัน ที่อยู่ไม่ครบ หรือข้อมูลซ้ำซ้อน ระบบจะทำการ Normalize ข้อมูลเหล่านั้น จับคู่กับ Master ที่มีอยู่ และตัดสินใจว่าจะสร้างรายการใหม่ จับคู่อัตโนมัติ หรือส่งเข้าคิวตรวจสอบโดยมนุษย์ (Human-in-the-loop) ตามความเหมาะสม นอกจากนี้ยังมีระบบ Alias ที่ช่วยจดจำชื่อที่เขียนแตกต่างกันแต่หมายถึงบุคคลหรือสถานที่เดียวกัน ทำให้การจับคู่มีประสิทธิภาพสูงขึ้นเรื่อยๆ เมื่อระบบทำงานต่อเนื่อง

### Business Flow 2 กลุ่ม

| กลุ่ม | ชื่อ | โมดูล | หน้าที่ |
|-------|------|--------|--------|
| **Group 1** | Cleansing & Master DB | 00–14 | รับข้อมูลดิบ → ทำความสะอาด → จับคู่กับ Master → บันทึก FACT_DELIVERY → สร้าง Alias |
| **Group 2** | Daily Ops & Search | 15–18 | ดึงข้อมูล SCG API → ค้นหาพิกัดจาก Master → ใส่ LatLong ให้ข้อมูลงานประจำวัน |

กลุ่มทั้งสองทำงานแยกกัน — Search Service (`17_SearchService.gs`) เป็นสะพานเชื่อมเท่านั้น กฎสำคัญคือ **Group 2 ห้ามเขียน Master Data โดยตรง** (ต้องผ่าน Search Service เท่านั้น)

---

## 2. The Trinity Framework

LMDS Architecture รันด้วยตรรกะแบบแยกฐานข้อมูลเชิงสัมพันธ์ **"The Trinity Framework"**:

> การมีอยู่ของการจัดส่ง (Transaction/Fact) 1 ชิ้น จะผูกกันด้วย 3 เสาหลัก + 1 ตาราง Intersection

### 2.1 เสาหลักทั้ง 3

| เสา | ตาราง | บทบาท | กลไกหลัก |
|-----|-------|--------|----------|
| **WHO** | `M_PERSON` (10 คอลัมน์) | ระบุตัวตนบุคคล | กรอง Phone + Note จากข้อมูล Unstructured → Identify บุคคล |
| **WHERE-Address** | `M_PLACE` (14 คอลัมน์) | ระบุสถานที่ตามที่อยู่ | `RAW_ADDRESS` + `RESOLVED_ADDR` + `SYS_TH_GEO` 16 คอลัมน์ → ประกอบร่างที่อยู่สมบูรณ์ |
| **WHERE-Coordinate** | `M_GEO_POINT` (14 คอลัมน์) | ระบุพิกัด GPS | แกะ Coordinate จากเช็คอิน + `GEO_RADIUS_M` → จับรัศมีขยะ (Duplicate Location Merging ≤ 50m) |

แต่ละเสาทำงานอย่างอิสระในการจับคู่และสร้างข้อมูล แต่เชื่อมโยงกันผ่านตาราง Intersection ทำให้สามารถสืบค้นข้อมูลข้ามเสาได้อย่างมีประสิทธิภาพ เช่น การค้นหาพิกัดจากชื่อบุคคล หรือการหาสถานที่ทั้งหมดที่บุคคลหนึ่งเคยรับสินค้า การแยกเสาทำให้สามารถอัปเดตข้อมูลเสาใดเสาหนึ่งได้โดยไม่กระทบเสาอื่น เช่น การเปลี่ยนพิกัด GPS ไม่จำเป็นต้องเปลี่ยนข้อมูลที่อยู่

### 2.2 ตาราง Intersection

`M_DESTINATION` — ตารางศูนย์กลางสร้าง **Intersection Object Map**:

```
Person_ID + Place_ID + Geo_ID = 1 Destination Node
```

Destination เป็น Object ที่เชื่อมโยงทั้ง 3 เสาเข้าด้วยกัน ทำให้สามารถอ้างอิงการจัดส่งได้อย่างชัดเจนและสมบูรณ์ หากมีการเปลี่ยนแปลงที่เสาใดเสาหนึ่ง สามารถระบุได้ทันทีว่ากระทบ Destination ใดบ้าง ตัวอย่างเช่น ถ้าบุคคล A มีพิกัดอยู่ 3 จุด (บ้าน, ออฟฟิศ, คลังสินค้า) ระบบจะสร้าง Destination 3 รายการ แต่ละรายการจะผูก Person A เข้ากับ Place และ Geo ที่แตกต่างกัน

**ข้อสังเกตสำคัญ**: Destination ต้องมีทั้ง 3 FK (personId, placeId, geoId) จึงจะสมบูรณ์ — หากขาดเสาใดเสาหนึ่ง ระบบจะไม่สร้าง Destination และจะส่งเข้า Q_REVIEW แทน (Bug #V003: เคยใช้ `&&` แทน `||` ในการตรวจสอบ Trinity completeness)

---

## 3. Hybrid Alias Architecture

### 3.1 ภาพรวม

Hybrid Alias Architecture เป็นระบบจัดการชื่อแฝง (Alias) แบบคู่ ที่รองรับทั้ง **Entity-specific Alias** (ระดับ Local) และ **Global Alias Ledger** (ระดับ Global) โดยมี `master_uuid` เป็นกุญแจเชื่อมโยง ระบบนี้ช่วยแก้ปัญหาหลักคือ ข้อมูลขนส่งมักมีชื่อเดียวกันแต่เขียนต่างกัน เช่น "บริษัท สยาม คอนกรีต จำกัด", "สยามคอนกรีต", "Siam Concrete" ทั้งหมดหมายถึงบริษัทเดียวกัน ระบบ Alias จะจดจำชื่อทั้งหมดและเชื่อมโยงกลับไปยัง Master เดียวกัน

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

### 3.2 หลักการสำคัญ

| หลักการ | รายละเอียด |
|---------|-----------|
| **Single Writer Pattern** | `autoEnrichAliasesFromFactBatch_()` ใน `10_MatchEngine.gs` เป็นจุดเขียน M_ALIAS จุดเดียวใน Pipeline อัตโนมัติ การเขียนจากที่อื่น (Migration/Admin) ต้องผ่าน `21_AliasService.gs` เท่านั้น |
| **master_uuid เป็นกุญแจข้ามโดเมน** | `M_PERSON` และ `M_PLACE` มีคอลัมน์ `master_uuid` (UUID v4) เพื่อเชื่อมโยง Entity เดียวกันที่อาจมีหลายรูปแบบชื่อ UUID นี้ถูกสร้างตอน `createPerson()` / `createPlace()` และไม่เปลี่ยนแปลงตลอดอายุของ Entity |
| **Runtime Fast-path** | resolve global alias → `master_uuid` → map → `person_id`/`place_id` → ลด false-negative ในเคสพิมพ์ไม่ตรงมาตรฐาน เส้นทางนี้ใช้โดย `fastLookupByShipToName()` สำหรับ Group 2 ทำให้ค้นหาพิกัดจากชื่อเร็วขึ้นมากโดยไม่ต้องผ่าน resolvePerson/resolvePlace |
| **Backward Compatibility** | ระบบยังคงรองรับ `M_PERSON_ALIAS` และ `M_PLACE_ALIAS` แบบเดิม สามารถทำงานร่วมกับ Global Alias ได้ การค้นหา Candidate จะค้นในทั้ง Local Alias และ Global Alias |
| **Circular Dependency Prevention** | ลบ `syncAliasToEntityTable_()` ออกแล้ว (V5.4.001) — เดิมทีมีปัญหา `createGlobalAlias() → syncAliasToEntityTable_() → createPersonAlias() → createGlobalAlias()` วนลูปไม่รู้จบ ตอนนี้ M_PERSON_ALIAS และ M_PLACE_ALIAS เขียนที่ `autoEnrichAliasesFromFactBatch_()` เท่านั้น |

### 3.3 M_ALIAS Schema (8 คอลัมน์)

| ดัชนี | ชื่อคอลัมน์ | ประเภท | คำอธิบาย |
|-------|-----------|--------|----------|
| 0 | `alias_id` | string | รหัส Alias เช่น `A_xxxx` (สร้างด้วย `generateShortId('A')`) |
| 1 | `master_uuid` | string | UUID v4 ที่เชื่อมโยงกับ M_PERSON หรือ M_PLACE |
| 2 | `variant_name` | string | ชื่อแฝง/รูปแบบอื่นที่ใช้เรียก Entity เดียวกัน (เก็บชื่อดิบไว้ ยังไม่ normalize) |
| 3 | `entity_type` | string | `PERSON` หรือ `PLACE` — บอกว่า UUID นี้เชื่อมกับโดเมนไหน |
| 4 | `confidence` | number | ระดับความมั่นใจ (0-100) — canonical=100, PERSON variant=95, PLACE variant=90 |
| 5 | `source` | string | แหล่งที่มา: `AUTO_ENRICH_FACT`, `MIGRATION`, `ADMIN_MERGE_ACT`, `SCG_RAW_IMPORT`, `FACT_DELIVERY_IMPORT` |
| 6 | `created_at` | datetime | วันเวลาที่สร้าง |
| 7 | `active_flag` | boolean | `true` (Active) หรือ `false` (Inactive) — ใช้ในการกรองตอนค้นหา |

### 3.4 Auto-Enrich กลไก

เมื่อ Pipeline ประมวลผลเสร็จ ระบบจะเขียน Alias อัตโนมัติจาก FACT_DELIVERY ผ่าน `autoEnrichAliasesFromFactBatch_()`:

1. **PERSON canonical** → M_ALIAS (confidence 100) — ชื่อสะอาดที่ได้จาก Normalize
2. **PERSON variant** (ShipToName) → M_ALIAS (confidence 95) + M_PERSON_ALIAS — ชื่อดิบที่ยังไม่ผ่านการทำความสะอาด
3. **PLACE canonical** → M_ALIAS (confidence 100) — ชื่อสถานที่สะอาด
4. **PLACE variant** (ShipToAddr) → M_ALIAS (confidence 90) + M_PLACE_ALIAS — ที่อยู่ดิบจาก SCG

ทั้งหมดใช้ Set-based dedup เพื่อป้องกันการเขียนซ้ำ — ระบบจะโหลด Alias ที่มีอยู่แล้วใน M_ALIAS, M_PERSON_ALIAS, M_PLACE_ALIAS มาสร้างเป็น Set ก่อน แล้วตรวจสอบว่าชื่อที่จะเขียนซ้ำหรือไม่ ถ้าซ้ำจะข้ามไป

### 3.5 Dedup Key Format

| ชีต | Dedup Key | ตัวอย่าง |
|------|-----------|---------|
| M_ALIAS | `ENTITY_TYPE::masterUuid::normalizedVariant` | `PERSON::a1b2c3d4::สยามคอนกรีต` |
| M_PERSON_ALIAS | `personId::normalizedVariant` | `PS1234::สยามคอนกรีต` |
| M_PLACE_ALIAS | `placeId::normalizedVariant` | `PL5678::123/45ถ.พระราม9` |

### 3.6 วิวัฒนาการ Alias Architecture

| เวอร์ชัน | ระบบ | จุดแข็ง | จุดอ่อน |
|----------|------|---------|---------|
| V4.0 | NameMapping | ง่าย ใช้ได้ทันที | ไม่ 3NF, ไม่มี active_flag, ชื่อซ้ำได้ |
| V5.2 | Entity-Specific (M_PERSON_ALIAS + M_PLACE_ALIAS) | 3NF, auto-enrichment, normalization | Alias อยู่ใน silo, ไม่มี cross-entity matching, M_ALIAS ว่าง |
| V5.4 | Hybrid (Local + Global M_ALIAS) | รวมจุดแข็งทั้ง 2 แบบ, Fast Track O(1) via reverse index, Single Writer | ต้อง Migration, ซับซ้อนกว่า |

---

## 4. Layered Architecture

ระบบ LMDS ออกแบบด้วยสถาปัตยกรรมแบบแยกชั้น 6 ชั้นหลัก:

### Layer A: Ingestion Layer

| รายการ | รายละเอียด |
|--------|-----------|
| **โมดูล** | `04_SourceRepository.gs` |
| **แหล่งข้อมูล** | SCG API, ไฟล์รายวัน, Input จากผู้ใช้งาน |
| **Landing Sheets** | `SCGนครหลวงJWDภูมิภาค` (37 คอลัมน์), `ตารางงานประจำวัน` (29 คอลัมน์), `Input` |
| **กลไกหลัก** | อ่านเฉพาะ Record ที่ `SYNC_STATUS != SUCCESS` สร้าง Source Object ต่อ Record กรอง Invoice ที่มีอยู่แล้วใน FACT_DELIVERY แบบ Set-based lookup |
| **Caching** | `CACHE_KEY_SOURCE` — Cache source rows ที่อ่านแล้ว, `CACHE_KEY_INVOICES` — Invoice set จาก FACT |
| **Source Object** | `{ sourceSheet, sourceRow, invoiceNo, shipmentNo, deliveryDate, deliveryTime, driverName, truckLicense, soldToCode, soldToName, rawPersonName, rawPlaceName, rawAddress, scgAddress, resolvedAddr, rawLat, rawLng, hasGeo, warehouse, province, sourceId, remark }` |

### Layer B: Normalization Layer

| รายการ | รายละเอียด |
|--------|-----------|
| **โมดูล** | `05_NormalizeService.gs`, `20_ThGeoService.gs` |
| **งานหลัก** | ทำความสะอาดชื่อ, เบอร์โทร, ที่อยู่, จังหวัด/อำเภอ/ตำบล, รหัสไปรษณีย์ |
| **กลไกหลัก** | 7-step Person Normalization (strip prefix → extract phone → extract doc ID → clean → normalize → build phonetic key → assemble), 4-step Place Normalization, Thai Phonetic Key, 80+ คำนำหน้าชื่อไทย |
| **ผลลัพธ์ Person** | `{ cleanName, isCompany, extractedPhone, extractedDocNo, deliveryNotes[], originalName }` |
| **ผลลัพธ์ Place** | `{ cleanPlace, placeType, notes[] }` |
| **Phonetic Key** | Thai consonants only, max 6 chars — ใช้ `normalizeForCompare()` ลดช่องว่างและตัวพิมพ์ |
| **ขยะไม่ทิ้ง** | ข้อมูลที่สกัดได้ (เลขบัตร, เบอร์โทร, คำนำหน้า) ถูกเก็บใน `deliveryNotes[]` → คอลัมน์ `NOTE` เพื่อใช้ Deep Note Search ภายหลัง |

### Layer C: Master Resolution Layer

| รายการ | รายละเอียด |
|--------|-----------|
| **โมดูล** | `06_PersonService.gs`, `07_PlaceService.gs`, `08_GeoService.gs`, `09_DestinationService.gs`, `10_MatchEngine.gs` |
| **กลไกหลัก** | Multi-strategy Candidate Search — Person 5 กลยุทธ์ (M_ALIAS Fast Path → Phone → Alias → Phonetic → Note Search), Place 4 กลยุทธ์ (M_ALIAS Fast Path → Alias → Phonetic → Note Search), Grid-based Proximity สำหรับ Geo, Trinity Intersection สำหรับ Destination |
| **Scoring Person** | Phone=95, Dice(0.5)+Levenshtein(0.3)+Ratio(0.2) สำหรับชื่อ ≥4 ตัวอักษร, Dice(0.6)+Levenshtein(0.4) สำหรับชื่อสั้น |
| **Scoring Place** | Exact=100, Dice(0.6)+Levenshtein(0.4), Place_SCORE_MIN=55 |

### Layer D: Hybrid Alias Layer

| รายการ | รายละเอียด |
|--------|-----------|
| **โมดูล** | `21_AliasService.gs` |
| **Local Alias** | `M_PERSON_ALIAS` (6 คอลัมน์), `M_PLACE_ALIAS` (6 คอลัมน์) |
| **Global Alias** | `M_ALIAS` (8 คอลัมน์ — Global Alias Ledger) |
| **Cross-domain Identity** | `master_uuid` ใน `M_PERSON` (col 9), `M_PLACE` (col 13) |
| **Runtime Fast-path** | `fastLookupByShipToName()` — ShipToName → M_ALIAS reverse index → masterUuid → entityId → dest → lat,lng |
| **Read Path** | `loadGlobalAliasesMap_()` — uuid → variants[], `loadGlobalAliasReverseIndex_()` — variant → {masterUuid, entityType}[] |
| **Write Path** | ⚠️ Pipeline: `autoEnrichAliasesFromFactBatch_()` เท่านั้น, Admin/Migration: `createGlobalAlias()`, `MIGRATION_HybridAliasSystem()` |

### Layer E: Transaction & Review Layer

| รายการ | รายละเอียด |
|--------|-----------|
| **โมดูล** | `11_TransactionService.gs`, `12_ReviewService.gs` |
| **ธุรกรรม** | ข้อมูลลง `FACT_DELIVERY` — 32 คอลัมน์ บันทึกผลการจับคู่ทั้งหมด รวมถึง match_evidence สำหรับตรวจสอบย้อนหลัง |
| **คิวรอตรวจ** | เคสคลุมเครือเข้า `Q_REVIEW` — 22 คอลัมน์ พร้อม Candidate IDs (JSON-encoded) และ Recommendation |
| **Human Decision** | `CREATE_NEW` / `MERGE_TO_CANDIDATE` / `IGNORE` / `ESCALATE` — เลือกผ่าน Dropdown ในชีต Q_REVIEW ระบบประมวลผลทันทีผ่าน `onEdit()` trigger |
| **Color Coding** | Done=`#d9ead3`, P3 (สูง)=`#f4cccc`, P2 (กลาง)=`#fff2cc`, GEO_NEARBY_YELLOW=`#fff2cc`, GEO_NEARBY_ORANGE=`#fce5cd` |

### Layer F: Governance & Hardening Layer

| รายการ | รายละเอียด |
|--------|-----------|
| **โมดูล** | `19_Hardening.gs`, `03_SetupSheets.gs` (SYS_LOG), `13_ReportService.gs` |
| **งานหลัก** | Preflight checks (ตรวจสอบชีต, Schema, API Key ก่อนรัน), Audit Log (SYS_LOG auto-clean at 5,000 rows), Quality Reporting (RPT_DATA_QUALITY), Duplicate Detection (detectDoubleProcessing) |
| **Diagnostic** | `diagnoseSystemState()` — วินิจฉัยแบบครบวงจร: ตรวจชีต, คอลัมน์, ข้อมูลว่าง, SYNC_STATUS, SYS_LOG Errors พร้อมวิธีแก้ |

---

## 5. Data Model

### 5.1 Master Tables

#### M_PERSON (10 คอลัมน์) — Index Constant: `PERSON_IDX`

| ดัชนี | ชื่อ | ประเภท | คำอธิบาย |
|-------|------|--------|----------|
| 0 | `person_id` | string | รหัสบุคคล เช่น `P_xxxx` (สร้างด้วย `generateShortId('P')`) |
| 1 | `canonical_name` | string | ชื่อมาตรฐานที่สะอาดแล้ว (ผ่าน `normalizePersonNameFull()`) |
| 2 | `normalized_name` | string | ชื่อที่ normalize แล้วสำหรับการเปรียบเทียบ (ใช้ `normalizeForCompare()`) |
| 3 | `phone` | string | เบอร์โทรที่สกัดได้ (เก็บด้วย single-quote prefix เพื่อรักษา leading zero) |
| 4 | `first_seen` | datetime | วันที่พบครั้งแรก |
| 5 | `last_seen` | datetime | วันที่พบล่าสุด (อัปเดตทุกครั้งที่ AUTO_MATCH) |
| 6 | `usage_count` | number | จำนวนครั้งที่ใช้ใน FACT (อัปเดตทุกครั้งที่ AUTO_MATCH) |
| 7 | `status` | string | `Active` / `Merged` (Merged = ถูกรวมเข้า personId อื่น) |
| 8 | `note` | string | หมายเหตุ/รหัสที่สกัดได้ (Deep Note Search) — เก็บเป็น comma-separated |
| 9 | `master_uuid` | string | UUID v4 สำหรับเชื่อมโยงข้ามโดเมน (สร้างด้วย `Utilities.getUuid()`) |

#### M_PLACE (14 คอลัมน์) — Index Constant: `PLACE_IDX`

| ดัชนี | ชื่อ | ประเภท | คำอธิบาย |
|-------|------|--------|----------|
| 0 | `place_id` | string | รหัสสถานที่ เช่น `PL_xxxx` |
| 1 | `canonical_name` | string | ชื่อมาตรฐาน (ใช้ที่อยู่ที่ซ่อมแล้วจาก `getEnrichedGeoData()`) |
| 2 | `normalized_name` | string | ชื่อที่ normalize แล้วสำหรับเปรียบเทียบ |
| 3 | `place_type` | string | ประเภทสถานที่ (condo/mall/house/site/other) |
| 4 | `sub_district` | string | ตำบล/แขวง (จาก SYS_TH_GEO 100%) |
| 5 | `district` | string | อำเภอ/เขต (จาก SYS_TH_GEO 100%) |
| 6 | `province` | string | จังหวัด (จาก Whitelist 77 จังหวัด) |
| 7 | `postcode` | string | รหัสไปรษณีย์ |
| 8 | `first_seen` | datetime | วันที่พบครั้งแรก |
| 9 | `last_seen` | datetime | วันที่พบล่าสุด |
| 10 | `usage_count` | number | จำนวนครั้งที่ใช้ |
| 11 | `status` | string | `Active` / `Merged` |
| 12 | `note` | string | หมายเหตุ (เก็บ suffix, delivery note) |
| 13 | `master_uuid` | string | UUID v4 สำหรับเชื่อมโยงข้ามโดเมน |

#### M_GEO_POINT (14 คอลัมน์) — Index Constant: `GEO_IDX`

| ดัชนี | ชื่อ | ประเภท | คำอธิบาย |
|-------|------|--------|----------|
| 0 | `geo_id` | string | รหัสพิกัด เช่น `GE_xxxx` |
| 1 | `lat` | number | ละติจูด |
| 2 | `lng` | number | ลองจิจูด |
| 3 | `radius_m` | number | รัศมีรวมจุด (เมตร) — ใช้สำหรับ Tiered Spatial |
| 4 | `resolved_addr` | string | ที่อยู่ที่แก้แล้ว (จาก Google Maps หรือ Dictionary) |
| 5 | `province` | string | จังหวัด |
| 6 | `district` | string | อำเภอ/เขต |
| 7 | `source` | string | แหล่งที่มาของพิกัด (`driver`, `geocode`, `manual`) |
| 8 | `confidence` | number | ระดับความมั่นใจ |
| 9 | `first_seen` | datetime | วันที่พบครั้งแรก |
| 10 | `last_seen` | datetime | วันที่พบล่าสุด |
| 11 | `usage_count` | number | จำนวนครั้งที่ใช้ |
| 12 | `status` | string | `Active` / `Merged` |
| 13 | `extraction` | string | ข้อมูลการสกัดพิกัด |

#### M_DESTINATION (11 คอลัมน์) — Index Constant: `DEST_IDX`

| ดัชนี | ชื่อ | ประเภท | คำอธิบาย |
|-------|------|--------|----------|
| 0 | `dest_id` | string | รหัส Destination เช่น `DS_xxxx` |
| 1 | `person_id` | string | FK → M_PERSON |
| 2 | `place_id` | string | FK → M_PLACE |
| 3 | `geo_id` | string | FK → M_GEO_POINT |
| 4 | `lat` | number | ละติจูด (validated) |
| 5 | `lng` | number | ลองจิจูด (validated) |
| 6 | `route_label` | string | ป้ายกำกับเส้นทาง |
| 7 | `delivery_date` | string | วันที่จัดส่งล่าสุด |
| 8 | `usage_count` | number | จำนวนครั้งที่ใช้ |
| 9 | `last_seen` | string | วันที่พบล่าสุด |
| 10 | `status` | string | `Active` / `Merged` |

### 5.2 Alias Tables

#### M_PERSON_ALIAS (6 คอลัมน์) — Index Constant: `PERSON_ALIAS_IDX`

| ดัชนี | ชื่อ | ประเภท | คำอธิบาย |
|-------|------|--------|----------|
| 0 | `alias_id` | string | รหัส Alias เช่น `PA_xxxx` |
| 1 | `person_id` | string | FK → M_PERSON |
| 2 | `alias_name` | string | ชื่อแฝง (เก็บชื่อดิบ) |
| 3 | `match_score` | number | คะแนนจับคู่ (95 สำหรับ auto-enrich) |
| 4 | `created_at` | datetime | วันที่สร้าง |
| 5 | `active_flag` | boolean | `true` / `false` |

#### M_PLACE_ALIAS (6 คอลัมน์) — Index Constant: `PLACE_ALIAS_IDX`

| ดัชนี | ชื่อ | ประเภท | คำอธิบาย |
|-------|------|--------|----------|
| 0 | `alias_id` | string | รหัส Alias เช่น `PLA_xxxx` |
| 1 | `place_id` | string | FK → M_PLACE |
| 2 | `alias_name` | string | ชื่อแฝง (เก็บชื่อดิบ) |
| 3 | `match_score` | number | คะแนนจับคู่ (90 สำหรับ auto-enrich) |
| 4 | `created_at` | datetime | วันที่สร้าง |
| 5 | `active_flag` | boolean | `true` / `false` |

#### M_ALIAS — Global Alias Ledger (8 คอลัมน์) — Index Constant: `ALIAS_IDX`

(ดูรายละเอียดที่หัวข้อ 3.3)

### 5.3 Transaction Tables

#### FACT_DELIVERY (32 คอลัมน์) — Index Constant: `FACT_IDX`

| กลุ่ม | คอลัมน์หลัก | คำอธิบาย |
|-------|-----------|----------|
| **Identity** | `tx_id`, `invoice_no`, `shipment_no` | รหัสธุรกรรมและเอกสาร — tx_id สร้างด้วย `generateShortId('TX')` |
| **Trinity FK** | `person_id`, `place_id`, `geo_id`, `dest_id` | Foreign Key ไปยัง 3 เสา + Intersection |
| **Coordinate** | `raw_lat`, `raw_lng`, `resolved_lat`, `resolved_lng` | พิกัดจาก Master + พิกัดจริงจาก Source |
| **Match Info** | `match_status`, `match_confidence`, `match_reason`, `match_action`, `evidence` | หลักฐานการจับคู่ (Traceability) — evidence เช่น `name|geo`, `name|place|geo` |
| **Delivery** | `delivery_date`, `delivery_time`, `sold_to_name`, `ship_to_name`, `ship_to_address` | ข้อมูลการจัดส่ง |
| **Source** | `source_sheet`, `source_row`, `source_rec_id` | ตำแหน่งข้อมูลต้นทางสำหรับสืบค้นย้อนหลัง |
| **Status** | `record_status`, `created_at`, `updated_at` | สถานะและการติดตาม |

#### Q_REVIEW (22 คอลัมน์) — Index Constant: `REVIEW_IDX`

| กลุ่ม | คอลัมน์หลัก | คำอธิบาย |
|-------|-----------|----------|
| **Identity** | `review_id`, `invoice_no` | รหัส Review |
| **Decision** | `status`, `decision`, `priority` | สถานะ/การตัดสินใจ/ความสำคัญ (priority 1=สูงสุด, 3=ต่ำสุด) |
| **Source** | `raw_person`, `raw_place`, `raw_sys_addr`, `raw_lat`, `raw_lng` | ข้อมูลดิบจาก Source |
| **Candidates** | `cand_persons`, `cand_places`, `cand_geos`, `cand_dests` | JSON-encoded candidate IDs |
| **Recommendation** | `match_score`, `recommend` | คะแนนและคำแนะนำจากระบบ |

### 5.4 System Tables

#### SYS_LOG (6 คอลัมน์) — Index Constant: `SYS_LOG_IDX`
`timestamp`, `level` (INFO/WARN/ERROR/DEBUG), `module`, `message`, `detail`, `session_id` — Auto-clean ที่ 5,000 แถว ป้องกันชีตบวม

#### SYS_CONFIG (4 คอลัมน์)
`key`, `value`, `description`, `updated_at` — เก็บค่าที่ผู้ใช้ตั้งเอง เช่น GEMINI_API_KEY

#### SYS_TH_GEO (16 คอลัมน์) — Index Constant: `TH_GEO_IDX`
ข้อมูลภูมิศาสตร์ไทย 7,537 รายการ — จังหวัด อำเภอ ตำบล รหัสไปรษณีย์ พร้อม metadata สำหรับค้นหา (tambon_clean, amphoe_clean, changwat_clean, tambon_label, amphoe_label, changwat_label, tambon_norm, amphoe_norm, changwat_norm, search_key, postal_key, note_type, note_scope) เป็น Single Source of Truth สำหรับการแกะที่อยู่ภาษาไทย ค่าที่คืนจาก `getEnrichedGeoData()` ต้องตรงกับ SYS_TH_GEO 100%

#### MAPS_CACHE (10 คอลัมน์) — Index Constant: `MAPS_CACHE_IDX`
แคชผลลัพธ์ Google Maps API — `cache_key`, `input_addr`, `lat`, `lng`, `resolved_addr`, `province`, `district`, `hit_count`, `created_at`, `updated_at` — ป้องกันการเรียก API ซ้ำเมื่อที่อยู่เดียวกัน

### 5.5 Source Sheet

#### SCGนครหลวงJWDภูมิภาค (37 คอลัมน์) — Index Constant: `SRC_IDX`
ข้อมูลดิบจาก SCG API — ประกอบด้วย ลำดับ, ID, วันที่ส่ง, เวลา, พิกัดรวม, ชื่อคนขับ, ทะเบียนรถ, Shipment No, Invoice No, ชื่อปลายทาง, ที่อยู่ปลายทาง, ชื่อเจ้าของสินค้า, LAT, LNG, คลังสินค้า, ฯลฯ และ `SYNC_STATUS` ที่คอลัมน์ 36 (0-based) ซึ่งเป็นตัวบอกว่าแถวนั้นถูกประมวลผลแล้วหรือยัง

---

## 6. Module Specification

### 6.1 โมดูลหลัก (22 ไฟล์)

| ไฟล์ | บรรทัด | หน้าที่ | ฟังก์ชันสำคัญ | Dependencies |
|------|--------|--------|--------------|-------------|
| `00_App.gs` | 779 | จุดเริ่มระบบ, เมนู, Pipeline orchestration, Smart Navigation, Diagnostic | `onOpen()`, `onEdit()`, `runFullPipeline()`, `diagnoseSystemState()`, `safeRun()` | 01, 02, 10, 17, 13, 18, 16, 21 |
| `01_Config.gs` | 538 | Single Source of Truth สำหรับค่าคงที่ (20 ชีต, 13 IDX sets, AI/SCG/APP configs) | `validateConfig()`, `getGeminiApiKey()`, `invalidateAllGlobalCaches()` | None (root) |
| `02_Schema.gs` | 492 | นิยาม Header ทุกชีต (16 schema) + Validation | `getSheetHeaders()`, `validateSheetHeaders()`, `getColIndex()`, `validateSchemaConsistency()` | 01 |
| `03_SetupSheets.gs` | 491 | สร้างชีตทั้งหมด, auto-repair, ระบบ Logging (SYS_LOG) | `setupAllSheets()`, `logInfo/Warn/Error/Debug()`, `clearOldLogs_()` | 01, 02, 14 |
| `04_SourceRepository.gs` | 372 | อ่าน/กรอง/สร้าง Object จากข้อมูลดิบ + Caching | `getAllSourceRows()`, `getUnprocessedRows()`, `updateSyncStatus_()` | 01, 02, 14 |
| `05_NormalizeService.gs` | 408 | ทำความสะอาดชื่อและที่อยู่ภาษาไทย (80+ prefixes) | `normalizePersonNameFull()`, `normalizePlaceName()`, `buildThaiPhoneticKey()`, `normalizeForCompare()` | 14 |
| `06_PersonService.gs` | 483 | Person CRUD + 5-strategy Candidate Search + Scoring | `resolvePerson()`, `findPersonCandidates()`, `createPerson()`, `mergePersonRecords()` | 01, 02, 05, 14, 21 |
| `07_PlaceService.gs` | 727 | Place CRUD + 4-level Address Enrichment + Branch Matching | `resolvePlace()`, `findPlaceCandidates()`, `getEnrichedGeoData()`, `tryMatchBranch()` | 01, 02, 05, 14, 21, 16, 20 |
| `08_GeoService.gs` | 403 | Geo CRUD + Grid-based Proximity + Tiered Spatial | `resolveGeo()`, `findGeoCandidates_()`, `haversineDistance()`, `createGeoPoint()` | 01, 02, 14, 07, 15 |
| `09_DestinationService.gs` | 321 | Destination CRUD + Trinity Intersection | `resolveDestination()`, `createDestination()`, `getDestsByPersonId()`, `getDestsByPersonAndPlace()` | 01, 02, 14 |
| `10_MatchEngine.gs` | 902 | หัวใจ Pipeline: 8 Rules + Single Writer M_ALIAS + Auto-Resume | `runMatchEngine()`, `processOneRow()`, `makeMatchDecision()`, `executeDecision()`, `autoEnrichAliasesFromFactBatch_()` | 01, 02, 05, 06-09, 11, 12, 14 |
| `11_TransactionService.gs` | 247 | FACT_DELIVERY upsert (32-col array) | `upsertFactDelivery()`, `findFactRowByInvoice_()` | 01, 02, 06-08, 14 |
| `12_ReviewService.gs` | 460 | Human-in-the-loop management (4 decisions) | `enqueueReview()`, `applyReviewDecision()`, `applyAllPendingDecisions()` | 01, 02, 06-09, 11, 14 |
| `13_ReportService.gs` | 224 | รายงานคุณภาพข้อมูล (autoMatchRate vs processedRate) | `buildFullQualityReport()`, `highlightHighPriorityReviews()` | 01, 02, 06-09, 12 |
| `14_Utils.gs` | 446 | ไลบรารีใช้ร่วม — String Similarity, GPS, AI, Retry, UI Alert | `diceCoefficient()`, `levenshteinDistance()`, `callGeminiAPI()`, `generateShortId()`, `safeUiAlert_()`, `normalizeInvoiceNo()` | 01 |
| `15_GoogleMapsAPI.gs` | 348 | Geocoding + 3-layer Cache (RAM → Sheet → API) | `geocodeAddress()`, `reverseGeocode()`, `getRouteDistanceKm()`, `clearMapsCache()` | 01, 02, 14 |
| `16_GeoDictionaryBuilder.gs` | 477 | สร้าง/จัดการพจนานุกรมภูมิศาสตร์ไทย + Chunked Cache | `buildGeoDictionary()`, `lookupByPostcode()`, `scanAddressAgainstDictionary()` | 01, 02, 05, 20, 14 |
| `17_SearchService.gs` | 406 | สะพาน Group 2→1, 6-tier Search for Daily Job | `findBestGeoByPersonPlace()`, `runLookupEnrichment()`, `lookupSingleRow()` | 01, 02, 05, 14, 21, 06, 07, 09 |
| `18_ServiceSCG.gs` | 415 | ดึงข้อมูล SCG → ชีตรายวัน + Summaries | `fetchDataFromSCGJWD()`, `applyMasterCoordinatesToDailyJob()`, `buildOwnerSummary()`, `buildShipmentSummary()` | 01, 02, 17 |
| `19_Hardening.gs` | 312 | Preflight Audit, Duplicate Detection, Alias Generation | `runPreflightAudit()`, `detectDoubleProcessing()`, `generatePersonAliasesFromHistory()` | 01, 02, 05-09, 14 |
| `20_ThGeoService.gs` | 170 | สกัดภูมิศาสตร์ไทยจากที่อยู่ดิบ + Metadata | `extractGeoFromAddress()`, `populateGeoMetadata()` | 01, 02, 05, 16, 14 |
| `21_AliasService.gs` | 828 | Hybrid Alias — Fast Track, Global Alias, Migration, UUID | `fastLookupByShipToName()`, `resolveMasterUuidViaGlobalAlias()`, `createGlobalAlias()`, `MIGRATION_HybridAliasSystem()`, `assignMasterUuidIfMissing()` | 01, 02, 05, 06, 07, 09, 14 |

### 6.2 สถิติโมดูล

| ตัวชี้วัด | ค่า |
|----------|-----|
| **Total Files** | 22 |
| **Total Lines** | ~8,700 |
| **Total Functions** | ~120 |
| **Largest File** | `10_MatchEngine.gs` (902 บรรทัด) |
| **Smallest File** | `20_ThGeoService.gs` (170 บรรทัด) |
| **Most Dependencies** | `10_MatchEngine.gs`, `12_ReviewService.gs` (6+ modules) |

---

## 7. Global Pipeline Mechanics

### Phase A: Ingestion (04_SourceRepository.gs)

1. อ่าน `SCGนครหลวงJWDภูมิภาค` จำกัดเพดาน Caching เฉพาะ Record ที่ `SYNC_STATUS != SUCCESS`
2. Filter และสร้าง Object Context 1 Record (รวบรวม `sysAddr`, `rawPlaceName`, `rawPersonName`, `lat`, `lng`, `invoiceNo`, `deliveryDate`)
3. กรอง Invoice ที่มีอยู่แล้วใน FACT_DELIVERY (Set-based lookup เพื่อป้องกัน duplicate)
4. Auto-mark รายการที่ถูกข้ามเป็น SUCCESS — แถวที่มี Invoice ซ้ำจะถูก mark เป็น SUCCESS ทันทีโดยไม่ต้องประมวลผลซ้ำ

### Phase B: Enrichment & Extraction (05_NormalizeService.gs / 07_PlaceService.gs / 20_ThGeoService.gs)

1. นำ Name เข้า Normalizer สกัดเลขรหัส (`\b[0-9]{8,}\b`) หรือเบอร์โทร (`+66..`)
2. วัตถุดิบ "ขยะ" ไม่ทิ้ง — Push Array แยกด้วย Comma → คอลัมน์ `NOTE` (Context for Deep Note Search)
3. Geo Hierarchy Strategy: แกะด้วย Array Regex หรือโค้ดไปรษณีย์ → เข้า Dictionary ลำดับคือ `extractGeoFromAddress` (16-col Search Key) → `scanAddressAgainstDictionary` → Regex+Fuzzy Lookup → `lookupByPostcode` (Fallback สุดท้าย)
4. Fallback (Plus Code + ภูมิลำเนาแหว่ง): `lookupPlaceAdminById_()` กู้คืน Province & District จาก M_PLACE ที่เชื่อมอยู่

### Phase C: Rules Matrix Resolution (10_MatchEngine.gs)

(ดูรายละเอียดที่หัวข้อ 8)

### Phase D: Persistence Control (Checkpoint & Chunking)

1. อัด Data เข้า Array — ทุกรอบ Batches (`BATCH_SIZE = 20`):
   - สาด Record Status ผ่าน `RangeList` (A1 Notations) ลด Overhead API Data Write 15-25%
   - บันทึก FACT_DELIVERY + Q_REVIEW + M_ALIAS + M_PERSON_ALIAS + M_PLACE_ALIAS ในครั้งเดียว (flush at end)
2. Time guard: นับ `Date.now()` หาก > 300,000ms (5 นาที):
   - เซ็ต Trigger Script สวมวิญญาณ Job ยิงคำสั่งตื่นภายใน 60 วิ
   - ตัวเอง Kill การทำงาน — ป้องกันอาการค้างหรือ Corrupted Caches
3. Checkpoint: SYNC_STATUS ทำหน้าที่แทน Checkpoint — แถวที่ประมวลผลแล้วจะถูก mark เป็น SUCCESS ทำให้รอบถัดไปไม่ต้องทำซ้ำ

---

## 8. Match Engine — Rules Matrix

ตารางน้ำหนักการประเมิน 8 กฎหลัก ของ `makeMatchDecision()`:

| กฎ | ชื่อ | เงื่อนไข | Action | Priority |
|----|------|---------|--------|----------|
| 1 | **INVALID_LATLNG** | พิกัดจาก Source หายไป (lat=0, lng=0 หรือว่าง) | `REVIEW_INVALID` Confidence: 0 | CRITICAL |
| 2 | **LOW_QUALITY** | ข้อมูลคุณภาพต่ำ (ชื่อสั้นเกิน/ที่อยู่ไม่ครบ) | `REVIEW` | HIGH |
| 3 | **GEO_PROVINCE_CONFLICT** | จังหวัดจาก Geo (ใน Master) ไม่ตรงกับจังหวัดจากที่อยู่ (ใน Source) | `REVIEW` Confidence: 50 | HIGH |
| 3.5 | **NEARBY_PENDING** | Tiered Spatial: ≤50m AutoMerge, 51-79m Yellow, 80-100m Orange, >100m Area ใหม่ | ตามระยะ | MEDIUM |
| 4 | **FULL_MATCH** | Person + Place + Geo ตรงทั้งหมด → `AUTO_MATCH` | `AUTO_MATCH` | — |
| 5 | **GEO_ANCHOR** | เจอ Geo เดิม + Person เดิม (Place อาจใหม่) → ใช้พิกัดเดิม | `AUTO_MATCH` | — |
| 6 | **FUZZY_MATCH** | Score ≥ THRESHOLD_AUTO (90) → จับคู่อัตโนมัติ | `AUTO_MATCH` | — |
| 7 | **ALL_NEW_WITH_GEO** | ทุกอย่างใหม่ มีพิกัด → สร้าง Master ใหม่ | `CREATE_NEW` | — |
| 8 | **DEFAULT** | ไม่เข้ากฎใดข้างต้น → ส่งตรวจสอบ | `REVIEW` | — |

### Decision Flow

```
makeMatchDecision(ctx)
  │
  ├─ Rule 1: INVALID_LATLNG? → REVIEW_INVALID
  ├─ Rule 2: LOW_QUALITY? → REVIEW
  ├─ Rule 3: GEO_PROVINCE_CONFLICT? → REVIEW
  ├─ Rule 3.5: NEARBY_PENDING? → ตามระยะ (FOUND/NEARBY_YELLOW/NEARBY_ORANGE/NOT_FOUND)
  ├─ Rule 4: FULL_MATCH (Person+Place+Geo)? → AUTO_MATCH
  ├─ Rule 5: GEO_ANCHOR (Geo+Person เดิม)? → AUTO_MATCH
  ├─ Rule 6: FUZZY_MATCH (Score ≥ 90)? → AUTO_MATCH
  ├─ Rule 7: ALL_NEW_WITH_GEO? → CREATE_NEW
  └─ Rule 8: DEFAULT → REVIEW
```

### กฎพิเศษ: Same-Day Destination

`getSameDayDestinations()` ตรวจสอบว่ามีการจัดส่งในวันเดียวกันไปยัง Destination เดียวกันแล้วหรือยัง ถ้ามี ระบบจะใช้ Destination เดิมแทนการสร้างใหม่ ป้องกัน Duplicate Destination

### กฎพิเศษ: Same Geo Multi-Person

`detectSameGeoMultiPerson()` ตรวจจับว่ามีหลายบุคคลใช้พิกัดเดียวกัน (ซ้ำซ้อน) — ถ้าพบ จะส่งเข้า Q_REVIEW เพื่อให้ผู้ตรวจสอบพิจารณาว่าเป็นบุคคลเดียวกันหรือไม่

---

## 9. Execution Flow

### 9.1 Group 1: Full Pipeline Flow

```
onOpen() → สร้างเมนู "LMDS V5.4"
    │
    ▼ ผู้ใช้กด "Run Full Pipeline"
runFullPipeline()
    │
    ├─ runLoadSource() → อ่านข้อมูลดิบ (04_SourceRepository)
    │    └─ getUnprocessedRows() → กรอง SYNC_STATUS != SUCCESS
    │
    ├─ runMatchEngine() → ประมวลผลทีละแถว (10_MatchEngine)
    │    ├─ for each row:
    │    │   ├─ normalizePersonNameFull() → 7-step Person Normalization
    │    │   ├─ normalizePlaceName() → 4-step Place Normalization
    │    │   ├─ getEnrichedGeoData() → 4-level Address Enrichment
    │    │   ├─ extractGeoFromAddress() → 3-tier Geo Search
    │    │   ├─ resolvePerson() → 5-strategy Candidate Search
    │    │   ├─ resolvePlace() → 4-strategy Candidate Search
    │    │   ├─ resolveGeo() → Grid-based Proximity Search
    │    │   ├─ resolveDestination() → Trinity Intersection
    │    │   ├─ makeMatchDecision() → 8 Rules
    │    │   ├─ executeDecision() → AUTO_MATCH / CREATE_NEW / REVIEW
    │    │   └─ upsertFactDelivery() / enqueueReview()
    │    │
    │    ├─ flushBatches_() → บันทึกทั้งหมดลง Sheet
    │    └─ autoEnrichAliasesFromFactBatch_() → Single Writer M_ALIAS
    │
    └─ Time Guard: ถ้า > 5 นาที → saveCheckpoint_() + installAutoResume_()
```

### 9.2 Group 2: Daily Ops Flow

```
onOpen() → เมนู "ดึงข้อมูล SCG"
    │
    ▼ ผู้ใช้กด
fetchDataFromSCGJWD() → ดึงข้อมูลจาก SCG API
    │
    ├─ fetchWithRetry_() → API call (Cookie-based auth)
    ├─ flatten ข้อมูลลง ตารางงานประจำวัน
    ├─ buildOwnerSummary() → สรุปตาม SoldToName
    └─ buildShipmentSummary() → สรุปตาม ShipmentNo+Truck
    │
    ▼ ผู้ใช้กด "Run Full Pipeline" (หรือ auto)
applyMasterCoordinatesToDailyJob()
    │
    └─ runLookupEnrichment() → ค้นหาพิกัด (17_SearchService)
         ├─ findBestGeoByPersonPlace() → 6-tier Search
         │   ├─ Tier 0: fastLookupByShipToName() → M_ALIAS Fast Track
         │   ├─ Tier C: Person Anchor → Destination
         │   ├─ Tier A: Person + Place → Destination
         │   ├─ Tier B: Place Only → Destination
         │   ├─ Tier D: SCG API Data
         │   └─ Tier E: AI Reasoning (Gemini)
         └─ เขียน LatLong_Actual + ระบายสี (Green/Yellow/Red)
```

### 9.3 Review Decision Flow

```
onEdit() → ตรวจจับการเปลี่ยนแปลงใน Q_REVIEW
    │
    ▼ ผู้ใช้เลือก Decision
applyReviewDecision()
    │
    ├─ CREATE_NEW → สร้าง Person/Place/Geo/Destination ใหม่ + upsertFactDelivery
    ├─ MERGE_TO_CANDIDATE → ใช้ Candidate เดิม + upsertFactDelivery
    ├─ IGNORE → ทำเครื่องหมายว่าไม่สนใจ
    └─ ESCALATE → เปลี่ยน Priority เป็น 1 (สูงสุด) รอผู้บริหารตรวจสอบ
```

---

## 10. Caching Strategy

### 10.1 3-Layer Cache Architecture

```
┌─────────────────────────────────────────────┐
│ Layer 1: RAM (Global Variables)             │
│   _GLOBAL_GEO_DICT_CACHE                    │
│   _GLOBAL_GEO_POINTS_CACHE                  │
│   → เร็วสุด แต่หายเมื่อ script จบ           │
│   → ใช้สำหรับข้อมูลที่อ่านบ่อยภายใน execution│
├─────────────────────────────────────────────┤
│ Layer 2: CacheService (Script Cache)        │
│   TTL: 6 ชั่วโมง (21,600 วินาที)           │
│   → แชร์ข้าม execution                      │
│   → Chunked สำหรับข้อมูลใหญ่ (>100KB)      │
│   → ใช้สำหรับ GEO Dictionary, Source Rows  │
├─────────────────────────────────────────────┤
│ Layer 3: Sheet (Google Sheets)              │
│   MAPS_CACHE, SYS_TH_GEO, etc.             │
│   → ถาวร แต่ช้าที่สุด                       │
│   → ใช้สำหรับข้อมูลที่ต้องเก็บถาวร          │
└─────────────────────────────────────────────┘
```

### 10.2 Cache Keys

| Cache Key | ข้อมูล | TTL | Chunked |
|-----------|--------|-----|---------|
| `CACHE_KEY_SOURCE` | Source rows (unprocessed) | 21,600s | No |
| `CACHE_KEY_INVOICES` | Invoice set from FACT | 21,600s | No |
| `GEO_DICT_POSTCODE_*` | Postcode map (350 keys/chunk) | 21,600s | Yes |
| `GEO_DICT_PROVINCES` | Province set | 21,600s | No |
| `GEO_DICT_DISTRICTS_*` | District map | 21,600s | Yes |
| `GEO_`+MD5 / `RGEO_`+MD5 | Maps API results | 21,600s | No |

### 10.3 Cache Invalidation

`invalidateAllGlobalCaches()` ใน `01_Config.gs` เป็นจุดกลางล้างแคชทั้งหมด — เรียกเมื่อ:
- เปลี่ยนแปลง Schema
- รัน `setupAllSheets()`
- ต้องการ refresh ข้อมูล

ฟังก์ชัน invalidate เฉพาะก็มี:
- `invalidateSourceCache()` — ล้าง source rows cache
- `invalidatePersonCache_()` — ล้าง person cache
- `invalidatePlaceCache_()` / `invalidatePlaceAliasCache_()` — ล้าง place caches
- `invalidateGeoCache_()` — ล้าง geo cache
- `invalidateDestCache_()` — ล้าง destination cache
- `invalidateGeoDictCache()` — ล้าง geo dictionary cache
- `clearMapsCache()` — ล้าง Maps API cache (ลบจาก Sheet + CacheService)

---

## 11. Dependencies Matrix

### 11.1 Module Dependencies

```
01_Config ← (None — root module)
02_Schema ← 01_Config
03_SetupSheets ← 01_Config, 02_Schema, 14_Utils
04_SourceRepository ← 01_Config, 02_Schema, 14_Utils
05_NormalizeService ← 14_Utils
06_PersonService ← 01_Config, 02_Schema, 05_Normalize, 14_Utils, 21_AliasService
07_PlaceService ← 01_Config, 02_Schema, 05_Normalize, 14_Utils, 21_AliasService, 16_GeoDictionary, 20_ThGeoService
08_GeoService ← 01_Config, 02_Schema, 14_Utils, 07_PlaceService, 15_GoogleMapsAPI
09_DestinationService ← 01_Config, 02_Schema, 14_Utils
10_MatchEngine ← 01_Config, 02_Schema, 05_Normalize, 06_Person, 07_Place, 08_Geo, 09_Dest, 11_Transaction, 12_Review, 14_Utils
11_TransactionService ← 01_Config, 02_Schema, 06_Person, 07_Place, 08_Geo, 14_Utils
12_ReviewService ← 01_Config, 02_Schema, 06_Person, 07_Place, 08_Geo, 09_Dest, 11_Transaction, 14_Utils
13_ReportService ← 01_Config, 02_Schema, 06-09 Services, 12_Review
14_Utils ← 01_Config
15_GoogleMapsAPI ← 01_Config, 02_Schema, 14_Utils
16_GeoDictionaryBuilder ← 01_Config, 02_Schema, 05_Normalize, 20_ThGeoService, 14_Utils
17_SearchService ← 01_Config, 02_Schema, 05_Normalize, 14_Utils, 21_AliasService, 06_Person, 07_Place, 09_Dest
18_ServiceSCG ← 01_Config, 02_Schema, 17_SearchService
19_Hardening ← 01_Config, 02_Schema, 05-09 Services, 14_Utils
20_ThGeoService ← 01_Config, 02_Schema, 05_Normalize, 16_GeoDictionary, 14_Utils
21_AliasService ← 01_Config, 02_Schema, 05_Normalize, 06_Person, 07_Place, 09_Dest, 14_Utils
```

### 11.2 Cross-Module Reference Count

| Module | ถูกอ้างอิงโดย | จำนวน |
|--------|-------------|--------|
| `01_Config.gs` | ทุกไฟล์ | 21 |
| `14_Utils.gs` | 15 ไฟล์ | 15 |
| `02_Schema.gs` | 14 ไฟล์ | 14 |
| `05_NormalizeService.gs` | 5 ไฟล์ | 5 |
| `21_AliasService.gs` | 3 ไฟล์ | 3 |

---

## 12. Error Handling & Disaster Prevention

### 12.1 Error Handling Pattern

| ระดับ | รูปแบบ | ตัวอย่าง |
|-------|--------|---------|
| **Entry Point** (เมนู) | `try-catch` + `logError()` + `safeUiAlert_()` | `runFullPipeline()`, `fetchDataFromSCGJWD()` |
| **Pipeline Core** | Throw → catch ที่ Entry Point | `processOneRow()` ไม่มี try-catch ให้ catch ที่ `runMatchEngine()` |
| **Utility** (pure function) | ไม่ต้อง try-catch (ถ้า pure) | `diceCoefficient()`, `normalizeForCompare()` |
| **External API** | `callSpreadsheetWithRetry()` + exponential backoff | การเขียน Sheet ที่อาจ rate-limited |

### 12.2 `safeUiAlert_()` (V5.4.002)

ฟังก์ชัน `safeUiAlert_()` ใน `14_Utils.gs` เป็น consolidated UI alert ที่มี guard ตรวจสอบว่า `SpreadsheetApp.getUi()` พร้อมใช้งานหรือไม่ ถ้าไม่พร้อม (เช่น รันจาก Timer Trigger) จะข้ามการแสดง alert และ log เฉยๆ แทน ฟังก์ชันนี้รวม `safeAlert_()` (เดิมใน 16_GeoDictionaryBuilder) และ `safeUiAlert_Report_()` (เดิมใน 13_ReportService) มาไว้ที่เดียว

### 12.3 SYS_LOG Auto-Clean

ระบบ Logging มี auto-clean mechanism ที่ `clearOldLogs_()` — ลบแถวเก่าเมื่อ SYS_LOG เกิน 5,000 แถว ป้องกันชีตบวมจนกระทบประสิทธิภาพ

### 12.4 LockService

Pipeline ใช้ `LockService.getScriptLock()` เพื่อป้องกันการรันพร้อมกัน (concurrent execution) ที่อาจทำให้ข้อมูลเสียหาย

---

## 13. Configuration & Schema System

### 13.1 Config System (`01_Config.gs`)

**SHEET Object** (frozen, 20 entries):
```javascript
var SHEET = Object.freeze({
  SOURCE: 'SCGนครหลวงJWDภูมิภาค',
  DAILY_JOB: 'ตารางงานประจำวัน',
  M_PERSON: 'M_PERSON',
  M_PERSON_ALIAS: 'M_PERSON_ALIAS',
  M_PLACE: 'M_PLACE',
  M_PLACE_ALIAS: 'M_PLACE_ALIAS',
  M_ALIAS: 'M_ALIAS',
  M_GEO_POINT: 'M_GEO_POINT',
  M_DESTINATION: 'M_DESTINATION',
  FACT_DELIVERY: 'FACT_DELIVERY',
  Q_REVIEW: 'Q_REVIEW',
  SYS_CONFIG: 'SYS_CONFIG',
  SYS_LOG: 'SYS_LOG',
  SYS_TH_GEO: 'SYS_TH_GEO',
  RPT_QUALITY: 'RPT_DATA_QUALITY',
  MAPS_CACHE: 'MAPS_CACHE',
  INPUT: 'Input',
  EMPLOYEE: 'ข้อมูลพนักงาน',
  OWNER_SUMMARY: 'สรุป_เจ้าของสินค้า',
  SHIPMENT_SUM: 'สรุป_Shipment'
});
```

**Index Constant Sets** (13 sets, all frozen):
- `PERSON_IDX` (10), `PERSON_ALIAS_IDX` (6), `PLACE_IDX` (14), `PLACE_ALIAS_IDX` (6), `ALIAS_IDX` (8), `GEO_IDX` (14), `DEST_IDX` (11), `FACT_IDX` (32), `REVIEW_IDX` (22), `SYS_LOG_IDX` (6), `TH_GEO_IDX` (16), `EMPLOYEE_IDX` (8), `SRC_IDX` (37), `DATA_IDX` (29)

**AI_CONFIG** (12 match parameters):
- `GEO_GRID_SIZE` = 0.01, `SCORE_MIN_THRESHOLD` = 60, `THRESHOLD_AUTO` = 90, `NEARBY_YELLOW_M` = 79, `NEARBY_ORANGE_M` = 100, `PLACE_SCORE_MIN` = 55, etc.

**SCG_CONFIG** (10 API parameters):
- API URL, Cookie format, E-POD owners, etc.

**APP_CONST** (13 status/color/match constants):
- Match statuses, colors, action types, etc.

### 13.2 Schema System (`02_Schema.gs`)

**SCHEMA Object** (frozen, 16 sheet schemas):
- แต่ละ schema เป็น array ของ column header names
- `validateSchemaConsistency()` ตรวจสอบว่า schema ตรงกับ IDX constants
- `getColIndex(schemaKey, colName)` สำหรับ dynamic column lookup
- `validateSheetHeaders()` ตรวจสอบว่า headers ในชีตจริงตรงกับ schema

### 13.3 Schema-Config-Setup Triangle

```
01_Config.gs (IDX constants) ←→ 02_Schema.gs (SCHEMA headers) ←→ 03_SetupSheets.gs (create sheets)
        ↑                              ↑                                    ↑
        └──── ต้องอัปเดตพร้อมกันทุกครั้ง ────┘                                    │
                    validateSchemaConsistency() ←────────────────────────────┘
```

กฎสำคัญ: ทุกการเปลี่ยนแปลง Schema ต้องอัปเดตทั้ง 3 ไฟล์พร้อมกัน — ถ้าอัปเดตไม่ครบ ระบบจะผิดพลาดได้

---

## 14. Search Service — Tier Architecture

### 14.1 6-Tier Search (17_SearchService.gs)

| Tier | ชื่อ | กลไก | ความแม่นยำ | ความเร็ว |
|------|------|------|----------|----------|
| Tier 0 | **M_ALIAS Fast Track** | ShipToName → M_ALIAS reverse index → masterUuid → dest → lat,lng | สูงสุด | O(1) |
| Tier C | **Person Anchor** | ค้นหา Person จากชื่อ → ใช้ Destination ที่ใช้บ่อยสุด | สูง | O(N) |
| Tier A | **Person+Place** | จับคู่ Person + Place → หา Destination | สูง | O(N*M) |
| Tier B | **Place Only** | ค้นหาจาก Place เท่านั้น | กลาง | O(N) |
| Tier D | **SCG API** | ใช้ข้อมูลจาก SCG โดยตรง | ต่ำ | O(1) |
| Tier E | **AI Reasoning** | เรียก Gemini AI วิเคราะห์ | ทดลอง | API call |

### 14.2 Color Coding (ผลลัพธ์ในชีตรายวัน)

| สี | ความหมาย |
|-----|---------|
| เขียว `#b6d7a8` | พบพิกัดจาก Master (สูงมั่นใจ) |
| เหลือง `#ffe599` | พบพิกัดแบบ fuzzy (กลางมั่นใจ) |
| แดง `#f4cccc` | ไม่พบพิกัด |

### 14.3 Tier 0 Fast Track Detail

Tier 0 ใช้ `fastLookupByShipToName()` ใน `21_AliasService.gs`:
1. Normalize ShipToName ด้วย `normalizeForCompare()`
2. ค้นหาใน Global Alias Reverse Index (variant → {masterUuid, entityType}[])
3. ถ้าพบ → แปลง masterUuid → entityId (ผ่าน `convertUuidToPersonId()` หรือ `convertUuidToPlaceId()`)
4. หา Destination จาก entityId → lat, lng
5. คืนผลทันทีโดยไม่ต้องผ่าน Tier อื่น

---

## 15. Migration Guide

### 15.1 Hybrid Alias Migration (V5.4)

Migration ใช้ `MIGRATION_HybridAliasSystem()` ใน `21_AliasService.gs` มี 5 ขั้นตอน:

| ขั้น | ชื่อ | งาน | ประมาณการเวลา |
|------|------|-----|-------------|
| 1 | **Assign UUID** | ตรวจสอบและกำหนด `master_uuid` ให้ M_PERSON และ M_PLACE ที่ยังไม่มี | 1-2 นาที |
| 2 | **Person Alias → M_ALIAS** | อ่าน M_PERSON_ALIAS ทั้งหมด → สร้าง M_ALIAS entries (entity_type=PERSON) | 2-5 นาที |
| 3 | **Place Alias → M_ALIAS** | อ่าน M_PLACE_ALIAS ทั้งหมด → สร้าง M_ALIAS entries (entity_type=PLACE) | 2-5 นาที |
| 4 | **Canonical Names → M_ALIAS** | อ่าน canonical_name จาก M_PERSON และ M_PLACE → สร้าง M_ALIAS entries (confidence=100) | 1-3 นาที |
| 5 | **Build Reverse Index** | สร้าง Global Alias Reverse Index สำหรับ Tier 0 Fast Track | <1 นาที |

### 15.2 Migration Safety

- **Time Guard**: V5.4.002 เพิ่ม `hasTimePassed_()` ทุก 100 รายการ — ถ้าใกล้ timeout จะบันทึก checkpoint
- **Checkpoint Resume**: `saveMigrationCheckpoint_()` / `loadMigrationCheckpoint_()` — ใช้ PropertiesService เก็บขั้นตอนปัจจุบัน
- **Batch Write**: `batchAppendToAliasSheet_()` เขียน M_ALIAS แบบ batch แทนที่จะใช้ `appendRow()` ทีละแถว (ลด API calls จาก O(N) เป็น O(N/20))
- **Idempotent**: Migration สามารถรันซ้ำได้โดยไม่ทำให้ข้อมูลเสีย — dedup key ป้องกัน alias ซ้ำ

### 15.3 Pre-Migration Checklist

- [ ] M_PERSON มีคอลัมน์ `master_uuid` (col 9)
- [ ] M_PLACE มีคอลัมน์ `master_uuid` (col 13)
- [ ] M_ALIAS ชีตถูกสร้างแล้ว (8 คอลัมน์)
- [ ] M_PERSON_ALIAS และ M_PLACE_ALIAS มีข้อมูลอยู่
- [ ] รัน `checkSystemIntegrity()` ผ่าน

---

## 16. Single Writer Pattern (V5.4.002)

### 16.1 หลักการ

**M_ALIAS ถูกเขียนจากจุดเดียวใน Pipeline** — `autoEnrichAliasesFromFactBatch_()` ใน `10_MatchEngine.gs` เป็นจุดเขียน M_ALIAS จุดเดียวใน Pipeline อัตโนมัติ การเขียนจากที่อื่น (Migration/Admin) ต้องผ่าน `21_AliasService.gs` เท่านั้น

### 16.2 Write Path Map

| ตาราง | Pipeline Writer | Admin/Migration Writer | ห้ามเขียนจาก |
|--------|----------------|----------------------|-------------|
| M_ALIAS | `autoEnrichAliasesFromFactBatch_()` (10_MatchEngine.gs) | `createGlobalAlias()` (21_AliasService.gs) | 06, 07, 18, 19 |
| M_PERSON_ALIAS | `autoEnrichAliasesFromFactBatch_()` (10_MatchEngine.gs) | `createPersonAlias()` (06_PersonService.gs) | 18, 19 |
| M_PLACE_ALIAS | `autoEnrichAliasesFromFactBatch_()` (10_MatchEngine.gs) | `createPlaceAlias()` (07_PlaceService.gs) | 18, 19 |

### 16.3 สิ่งที่ถูกลบ (V5.4.001–002)

| ฟังก์ชัน | สาเหตุที่ลบ |
|----------|-----------|
| `syncAliasToEntityTable_()` | Circular Dependency: createGlobalAlias() → syncAliasToEntityTable_() → createPersonAlias() → createGlobalAlias() วนลูป |
| `populateAliasFromSCGRawData_()` (ใน 18_ServiceSCG.gs) | Single Writer Violation: Group 2 เขียน M_ALIAS โดยตรง ไม่ผ่าน Pipeline |

---

## 17. Bug Status & Improvement History

### 17.1 V5.4.002 Bug Fixes (7 รายการ — แก้แล้วทั้งหมด)

| ID | ระดับ | รายละเอียด | วิธีแก้ | ไฟล์ที่แก้ |
|----|--------|-----------|---------|-----------|
| C1 | CRITICAL | Single Writer Violation — `populateAliasFromSCGRawData_()` เขียน M_ALIAS จากนอก Pipeline | ลบออกจาก Group 2 pipeline | 18_ServiceSCG.gs |
| C4 | CRITICAL | MIGRATION ไม่มี Time Guard — อาจ timeout กลางคันกับข้อมูลใหญ่ | เพิ่ม hasTimePassed_, saveMigrationCheckpoint_(), batchAppendToAliasSheet_() | 21_AliasService.gs |
| F1 | HIGH | Fake Function Call — `autoInstallSmartNav_()` ไม่มีอยู่จริง ทำให้ error เมื่อเรียก | สร้างฟังก์ชันจริง | 00_App.gs |
| H1 | HIGH | Hardcode Index ใน `18_ServiceSCG.gs` — 8 จุดใช้เลขคอลัมน์ตรง (r[28], r[14], r[16] ฯลฯ) | เปลี่ยนเป็น `DATA_IDX.*` constants | 18_ServiceSCG.gs |
| D1 | MEDIUM | Duplicate Function — `loadCachedGeoRows_()` ซ้ำใน 07_PlaceService.gs ทำให้ GAS ใช้ตัวสุดท้ายที่โหลด | ลบออกจาก 07_PlaceService ใช้จาก 16_GeoDictionaryBuilder.gs | 07_PlaceService.gs |
| P1 | HIGH | Performance — `updateDestinationStats` ใช้ setValue ทีละแถว ทำให้ช้ากับข้อมูลมาก | เปลี่ยนเป็น batch setValues | 09_DestinationService.gs |
| C2 | MEDIUM | Consolidate safeAlert — `safeAlert_()` + `safeUiAlert_()` + `safeUiAlert_Report_()` กระจายอยู่หลายไฟล์ | รวมเป็น `safeUiAlert_()` ใน `14_Utils.gs` | 14_Utils.gs, 16, 13 |

### 17.2 ปัญหาที่ทราบ (ยังไม่ได้แก้)

| ID | ระดับ | รายละเอียด | สถานะ |
|----|--------|-----------|--------|
| EH-1 | HIGH | 21/26 entry points ยังไม่มี try-catch (Quick fix: ใช้ `safeRun()`) | Open |
| TG-1 | HIGH | 5 pipeline functions ยังไม่มี Time Guard | Open |
| NS-1 | MEDIUM | 0/22 ไฟล์ใช้ Object Namespace Pattern | Open |
| GS-1 | MEDIUM | 19 global variables ใน 4 ไฟล์ | Open |
| LG-1 | MEDIUM | `logError()` ไม่มี stack trace | Open |
| AP-1 | MEDIUM | `appendRow()` ยังใช้ในบางจุด (non-critical path) | Open |
| SC-1 | LOW | SCG Cookie เป็น plaintext ใน SYS_CONFIG | Open |

### 17.3 ประวัติการพัฒนา (V4.0 → V5.4.002)

| เวอร์ชัน | ช่วงเวลา | การเปลี่ยนแปลงสำคัญ |
|----------|----------|-------------------|
| V4.0 | 2025-Q4 | ระบบเริ่มต้น: NameMapping, Hardcode Index, appendRow, 17 โมดูล |
| V5.2.001 | 2026-Q1 | แยก Load/Match, Regex fix, COMPANY_SUFFIX sort |
| V5.2.003 | 2026-Q1 | Auto-Trigger Resume, SYS_TH_GEO corrected |
| V5.2.007 | 2026-Q1 | Checkpoint index → SYNC_STATUS |
| V5.2.008 | 2026-Q1 | 16-column Geo Dictionary, Plus Code fallback |
| V5.2.010 | 2026-Q1 | Auto Alias generation from history |
| V5.2.011 | 2026-Q1 | Smart Navigation (onSelectionChange) |
| V5.2.012 | 2026-Q1 | Batch SCG API mode |
| V5.2.015 | 2026-Q1 | callSpreadsheetWithRetry, Lock fix |
| V5.2.016 | 2026-Q1 | normalizeInvoiceNo (e-notation fix) |
| V5.4.001 | 2026-05-24 | Hybrid Alias Architecture, M_ALIAS, Single Writer Pattern, 22 โมดูล |
| V5.4.002 | 2026-05-26 | แก้ 7 Bug สำคัญ, Hardcode Index → DATA_IDX, safeUiAlert_ consolidated |

---

## 18. Performance Analysis

### 18.1 ปัญหา Performance ที่ทราบ

| ระดับ | ปัญหา | ตำแหน่ง | ผลกระทบ | สถานะ |
|--------|-------|---------|----------|--------|
| CRITICAL | applyAllPendingDecisions ไม่มี Time Guard | 12_ReviewService.gs | Timeout กับ Q_REVIEW ใหญ่ | Open |
| CRITICAL | Migration appendRow per alias | 21_AliasService.gs | O(N) API calls | ✅ Fixed (v5.4.002) |
| HIGH | setValue in for loop (Maps cache) | 15_GoogleMapsAPI.gs | ช้าเมื่อ cache ใหญ่ | Open |
| HIGH | 5x setValue per review decision | 12_ReviewService.gs | 5 API calls ต่อ decision | Open |
| HIGH | updatePersonStats/PlaceStats/GeoStats ทีละแถว | 06/07/08 Services | 3 API calls each | ✅ Fixed (Dest only) |
| MEDIUM | TH_GEO_POSTCODE chunk > 100KB | 16_GeoDictionaryBuilder.gs | Cache truncation | Mitigated (350 keys/chunk) |
| MEDIUM | Linear scans O(N) ใน candidate search | 06/07 Services | ช้าเมื่อ Master ใหญ่ | Open |
| MEDIUM | Nested loops O(N*M) ใน some paths | 10_MatchEngine.gs | ช้าเมื่อข้อมูลเยอะ | Open |

### 18.2 Time Guard Coverage

| ฟังก์ชัน | มี Time Guard? | มี Auto-Resume? |
|----------|---------------|----------------|
| `runMatchEngine()` | ✅ Yes | ✅ Yes |
| `MIGRATION_HybridAliasSystem()` | ✅ Yes (v5.4.002) | ✅ Yes |
| `fetchDataFromSCGJWD()` | ✅ Yes (batch mode) | ❌ No |
| `applyAllPendingDecisions()` | ❌ No | ❌ No |
| `generatePersonAliasesFromHistory()` | ❌ No | ❌ No |
| `buildGeoDictionary()` | ❌ No | ❌ No |
| `populateGeoMetadata()` | ❌ No | ❌ No |
| `runLookupEnrichment()` | ❌ No | ❌ No |

### 18.3 แนวทางปรับปรุง Performance (3 Phase)

| Phase | ระยะเวลา | งานหลัก |
|-------|----------|--------|
| Phase 1 | สัปดาห์ที่ 1-2 | เพิ่ม Time Guard ให้ 5 ฟังก์ชันที่ขาด, แก้ setValue→batch setValues |
| Phase 2 | สัปดาห์ที่ 3-4 | ย้าย constants ที่กระจายอยู่เข้า 01_Config, สร้าง utility functions |
| Phase 3 | สัปดาห์ที่ 5-6 | Split ฟังก์ชันยาว, เพิ่ม Object Namespace, ลด nested loops |

---

## 19. Pre-Deploy Checklist

### 19.1 Readiness Assessment (V5.4.002)

| หมวด | ตรวจสอบ | สถานะ |
|------|----------|--------|
| **Phantom Functions** | ไม่มีฟังก์ชันที่เรียกแต่ไม่มีอยู่จริง | ✅ PASS |
| **Duplicate Names** | ไม่มีชื่อฟังก์ชันซ้ำข้ามไฟล์ | ✅ PASS |
| **Header Comments** | ทุกไฟล์มี Dependencies comment | ✅ PASS |
| **TODOs** | ไม่มี TODO ที่ยังไม่ได้จัดการ | ✅ PASS |
| **Batch Operations** | ไม่มี getValue/setValue ในลูป (critical path) | ⚠️ PARTIAL |
| **Hardcoded Indexes** | ไม่มีเลขคอลัมน์ตรงในโค้ด | ✅ PASS (v5.4.002) |
| **Try-Catch** | ทุก entry point มี try-catch | ❌ FAIL (21/26 ขาด) |
| **Time Guard** | ทุก long-running function มี Time Guard | ❌ FAIL (5 ขาด) |

### 19.2 ขั้นตอนก่อน Deploy

1. รัน `checkSystemIntegrity()` — ตรวจ 20 ชีต + API Key
2. รัน `runPreflightAudit()` — ตรวจ Schema + SYNC_STATUS
3. รัน `diagnoseSystemState()` — วินิจฉัยแบบละเอียด
4. ทดสอบ Pipeline ด้วยข้อมูลจริง 10 รายการ
5. ตรวจสอบ FACT_DELIVERY ว่าข้อมูลถูกต้อง
6. ตรวจสอบ Q_REVIEW ว่า Dropdown ทำงาน
7. ตรวจสอบ M_ALIAS ว่า Auto-Enrich ทำงาน
8. ทดสอบ Smart Navigation
9. ทดสอบ Group 2: ดึงข้อมูล SCG → ใส่พิกัด
10. รัน `buildFullQualityReport()` ตรวจสอบ Match Rate

---

## 20. Production Notes

### 20.1 ข้อจำกัดของ Platform (Google Apps Script)

| ข้อจำกัด | ค่า | วิธีรับมือใน LMDS |
|----------|-----|-----------------|
| Execution Time Limit | 6 นาที (360 วินาที) | Time Guard ที่ 5 นาที + Auto-Resume via Trigger |
| Spreadsheet Read/Write | Rate limited | `callSpreadsheetWithRetry()` + exponential backoff |
| CacheService Limit | 100KB per key | Chunked cache (350 keys/chunk สำหรับ Geo Dictionary) |
| Global Scope | ทุกไฟล์แชร์ scope เดียวกัน | Dependency Map ในหัวไฟล์ + Namespace convention |
| LockService | Script Lock | ป้องกัน concurrent pipeline execution |

### 20.2 ข้อควรระวังเพิ่มเติม

- **SCG Cookie หมดอายุ**: Cookie ที่ใช้ดึงข้อมูล SCG API มีอายุจำกัด ต้องใส่ใหม่ทุกครั้งก่อนดึงข้อมูล
- **E-POD Logic**: เจ้าของสินค้าบางราย (BETTERBE, SCG EXPRESS, เบทเตอร์แลนด์, JWD TRANSPORT, DENSO) ใช้ระบบ E-POD ซึ่งมี logic พิเศษในการนับจำนวน
- **normalizeInvoiceNo**: Invoice จาก SCG บางรายการถูกแปลงเป็น e-notation (เช่น 2.4E+12) ฟังก์ชัน `normalizeInvoiceNo()` จะแก้ไขให้เป็นตัวเลขปกติ
- **1899 Bug**: `formatTimeValue_()` แก้ไขปัญหาเวลาที่แสดงเป็นปี 1899 เนื่องจาก GAS date serial
- **Plus Code Fallback**: ถ้าพิกัด GPS หาย แต่ที่อยู่มี ระบบจะใช้ `lookupPlaceAdminById_()` กู้คืน Province & District จาก M_PLACE ที่เชื่อมอยู่

### 20.3 กฎสำคัญที่ต้องจำ

1. **Single Writer Pattern**: M_ALIAS เขียนจาก Pipeline เท่านั้น (10_MatchEngine.gs) หรือ Admin/Migration (21_AliasService.gs)
2. **Group Boundary**: Group 2 ห้ามเขียน Master Data โดยตรง — ต้องผ่าน Search Service เท่านั้น
3. **Search Key = ShipToName**: ใน Group 2 ชื่อปลายทาง (ShipToName) คือ search key หลัก ไม่ใช่ Person Name
4. **SCG API Fetch Code**: ห้ามแก้ไขโค้ดส่วนที่เรียก SCG API โดยไม่จำเป็น เพราะมีข้อจำกัดด้าน Cookie และ Rate Limit
5. **Schema-Config-Setup Triangle**: ทุกการเปลี่ยนแปลง Schema ต้องอัปเดต 01_Config + 02_Schema + 03_SetupSheets พร้อมกัน
6. **ข้อมูลใหม่ทันที**: ระบบรองรับการรันกับข้อมูลใหม่ได้ทันที ไม่บังคับ Backfill ข้อมูลเก่า
7. **Header Order**: ต้องรักษาลำดับ Header ให้ตรง Schema เสมอ — การเปลี่ยนลำดับคอลัมน์ทำให้ข้อมูลผิดตำแหน่ง
