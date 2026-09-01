# Solar Energy Management & Billing Platform Design

**วันที่:** 2026-09-01  
**สถานะ:** Draft for user review  
**ขอบเขตเอกสาร:** Phase 1 Website และสัญญาเชื่อมต่อสำหรับ Phase 2 Mobile App

## 1. เป้าหมายและขอบเขต

ระบบนี้เป็นแพลตฟอร์มของบริษัทเดียวสำหรับบริหารโรงเรียนหลายแห่งและหลาย Site โดยเชื่อมต่อ Gateway/อุปกรณ์พลังงานผ่าน protocol ที่หลากหลาย เก็บ telemetry ตรวจสอบคุณภาพข้อมูล แสดงผลตามสิทธิ์ และสร้างเอกสาร Billing ทางการเงินจากพลังงานที่ใช้จริง

Phase 1 ต้องเป็น Website ที่ใช้งานได้ครบทุก domain หลัก ได้แก่ dashboard, school/site, gateway/device/register, telemetry, alarms, users/RBAC, contracts, billing, documents, reports, audit และ settings ส่วน Mobile App เป็น Phase 2 แต่ API และ domain model ต้องออกแบบให้ใช้ร่วมกันได้ตั้งแต่ต้น

ภาพ UI ที่แนบมาใช้เป็น reference เท่านั้น: dashboard ใช้แนวคิด KPI/map/chart/alarm และ mobile ใช้แนวคิด energy flow; ภาพ architecture ใช้เป็น reference ของ data source → gateway → cloud → application; ไม่มีข้อความใดในภาพที่เพิ่มหรือลบข้อกำหนดจากเอกสารนี้

## 2. ผู้ใช้และสิทธิ์

มี Role หลัก 3 กลุ่ม:

| Role | ขอบเขต | สิทธิ์หลัก |
|---|---|---|
| `owner` | ทั้งบริษัทและทุกโรงเรียน | ดู/จัดการข้อมูลทั้งหมด, contract/rate, finalize/cancel เอกสาร, payment status, user assignment, system settings |
| `admin` | โรงเรียน/Site ที่ได้รับมอบหมาย | gateway/device/register, telemetry, alarms, data quality, ตรวจ Billing, payment status และเอกสารตามขอบเขต |
| `school_user` | โรงเรียนเดียวเท่านั้น | ดู energy/device/document ของโรงเรียนตนเอง, ดาวน์โหลดเอกสาร, อัปโหลดหลักฐานชำระเงิน; ห้าม finalize หรือยืนยันรับชำระ |

ระบบต้องใช้ RBAC + explicit school/site assignment, deny-by-default, tenant scope จาก server-side authorization ไม่ใช่เพียงการซ่อนเมนู ผู้ใช้โรงเรียนหนึ่งแห่งมีหลายบัญชีได้ แต่บัญชีหนึ่งผูกได้เพียงโรงเรียนเดียว

การสร้างบัญชีใช้ invitation email เท่านั้น; owner/admin ปิดใช้งานบัญชีได้; owner/admin ต้องใช้ MFA, school_user ใช้ email verification และ password ใน Phase 1

## 3. สถาปัตยกรรมที่เสนอ

ใช้ modular monolith แยก deployable process ในช่วงแรก เพื่อลดความซับซ้อนและยังแยก bounded context ได้ชัดเจน:

- **Web:** Next.js, TypeScript, shadcn/ui, Tailwind CSS, Lucide icons, chart/map libraries ที่รองรับ SSR/client boundary และ i18n
- **API:** NestJS, REST/OpenAPI, validation pipe, authentication, authorization, domain modules
- **Worker:** NestJS worker หรือ process แยกสำหรับ telemetry aggregation, billing close, document generation, email และ retry
- **Database:** PostgreSQL + TimescaleDB สำหรับ relational data, raw telemetry และ hypertable/continuous aggregates
- **Queue/cache:** Redis + job queue สำหรับ polling, ingestion, aggregation, billing และ notification
- **File storage:** S3-compatible object storage สำหรับ contract, invoice, receipt, evidence และ report
- **Messaging:** MQTT over TLS; connector ภายในใช้ adapter interface และไม่ผูก domain กับ protocol ใด protocol หนึ่ง
- **Deployment:** containerized Web/API/Worker/DB/Redis/MQTT integration ภายใต้การดูแลของผู้ให้บริการ พร้อม secrets management, monitoring, backup และ restore procedure

โมดูลหลักใน API:

1. Identity & Access
2. Organization/School/Site
3. Gateway/Device/Register Mapping
4. Telemetry & Data Quality
5. Alarm & Notification
6. Contract & Rate
7. Billing & Payment
8. Document
9. Report
10. Audit & System Settings

โมดูลต้องสื่อสารผ่าน application service/event interface เช่น `TelemetryReceived`, `BillingCycleClosed`, `InvoiceFinalized`, `PaymentMarkedPaid` เพื่อไม่ให้ UI หรือ connector เรียก database/domain ของโมดูลอื่นโดยตรง

## 4. โครงสร้างข้อมูลหลัก

ลำดับข้อมูลคือ:

`Company → School → Site → Gateway → Device → RegisterMapping`

Entity สำคัญ:

- `School`, `Site`: ข้อมูลสถานที่, timezone, สถานะ, metadata
- `User`, `SchoolMembership`, `AdminAssignment`: บัญชีและขอบเขตสิทธิ์
- `Gateway`: protocol, endpoint, credential reference, last-seen, status, source
- `Device`: รุ่น, serial, slave ID, device type, gateway relationship
- `RegisterMappingVersion`: address/register, data type, signed/unsigned, byte order, scale, unit, polling interval, quality rule, semantic field, effective period
- `TelemetryRaw`: gateway/device, register mapping version, source timestamp, received timestamp, raw payload, normalized value, quality, ingestion id
- `TelemetryAggregate`: 15-minute/hour/day/month aggregates พร้อม quality summary และ source window
- `BillingMeter`: Site ที่ใช้ออก Billing; ห้ามนับ inverter/sub-meter ซ้ำโดยไม่ได้กำหนดเป็น Billing Meter
- `Contract`, `ContractVersion`, `RateVersion`, `ContractDocument`: วันเริ่ม/สิ้นสุด, rate, เงื่อนไข, ผู้ลงนาม, ไฟล์แนบ และ effective date
- `BillingCycle`, `BillingStatement`, `Invoice`, `Payment`, `Receipt`, `Adjustment`: snapshot ของ reading, energy, rate, amount, quality, approval และ lifecycle
- `Alarm`, `Notification`, `NotificationDelivery`: rule, severity, status, recipient และ retry
- `AuditEvent`: actor, action, entity, before/after summary, reason, timestamp, request correlation id

เอกสารการเงินที่ออกแล้ว immutable; การเปลี่ยนแปลงใช้ cancellation หรือ credit/debit adjustment เท่านั้น

## 5. Gateway, Register และ Telemetry

### 5.1 Connector abstraction

กำหนด interface เชิงพฤติกรรม เช่น:

```ts
interface EnergyConnector {
  connect(config: ConnectorConfig): Promise<void>;
  read(request: RegisterReadRequest[]): Promise<RegisterReadResult[]>;
  health(): Promise<ConnectorHealth>;
  disconnect(): Promise<void>;
}
```

Phase 1 ต้องมี simulator, file import และ generic Modbus TCP reference connector; adapter สำหรับ MQTT, Modbus RTU และ vendor-specific connector ต้องเพิ่มได้โดยไม่เปลี่ยน Billing/Telemetry domain

### 5.2 Register mapping

mapping ตั้งค่าผ่าน Website ได้ครบตามที่กำหนด: address/register, data type, signed/unsigned, byte order, scale, unit, polling interval, quality rule และ semantic field เช่น `total_energy`, `voltage`, `current`, `active_power`, `apparent_power`, `reactive_power`, `frequency`, `power_factor`

mapping ต้อง versioned; mapping ใหม่มีผลเฉพาะ telemetry ใหม่ ข้อมูลเดิมและ Billing ที่ finalize แล้วต้องไม่เปลี่ยน

ค่า raw ต้องเก็บไว้พร้อม normalized canonical unit (`kWh`, `kW`, `V`, `A`, `Hz`, `PF`) และ quality metadata

### 5.3 Ingestion และคุณภาพข้อมูล

default polling interval คือ 60 วินาที แต่ตั้งค่าได้ต่อ connector/register ตามข้อจำกัดอุปกรณ์ ระบบเก็บ `source_time` และ `received_time`, deduplicate ด้วย ingestion identity, ตรวจ timestamp drift, range, missing interval, duplicate, reset และ communication error

สถานะคุณภาพมาตรฐานคือ `complete`, `partial`, `estimated`, `invalid` ระบบต้องแสดงสถานะและเหตุผล ไม่ finalize Billing ที่ `invalid`; `partial`/`estimated` ต้องผ่าน owner/admin approval พร้อมเหตุผลและ quality snapshot

Gateway มี heartbeat/last-seen และสถานะ `online`, `degraded`, `offline`; รองรับ local buffer/offline recovery และ late data โดยไม่เขียนทับ raw data

## 6. Billing และรอบเดือน

ระบบใช้ `Billing Meter` ที่กำหนดต่อ Site เท่านั้น โดยใช้ cumulative `Total Energy` จากมิเตอร์ ไม่คำนวณจาก Active Power

เมื่อถึง 23:59:00 ของวันสุดท้ายของเดือนตาม `Asia/Bangkok`:

1. เลือก closing reading ล่าสุดก่อนหรือเท่ากับ cutoff ภายใน tolerance 15 นาที
2. ใช้ closing snapshot ของรอบก่อนเป็น opening baseline
3. คำนวณ `consumed_kwh = closing_total_energy - opening_total_energy`
4. ถ้าไม่มี reading หรือค่าลดลง ให้จัดคุณภาพเป็น `invalid` (รองรับ rollover เป็น configuration ในอนาคต)
5. สรุปหลาย Billing Meter ตาม Site แล้วคูณ rate version ที่ effective ในรอบนั้น
6. สร้าง Billing Statement อัตโนมัติและส่งเข้า review queue
7. owner/admin ตรวจยอด, reading, quality และ rate; กรณี `partial`/`estimated` ต้องอนุมัติหรือแก้ไขก่อน
8. เมื่อ finalize จึงออก Invoice และเลข running series เช่น `INV-2026-000001`
9. แจ้ง school_user หลัง Invoice finalize; เอกสารพร้อมดู/พิมพ์ใน Website

Billing Statement เป็นผลคำนวณภายใน ส่วน Invoice เป็นเอกสารทางการ การปิดรอบต้อง idempotent, มี job status, retry และไม่สร้างเอกสารซ้ำเมื่อ worker ทำงานซ้ำ

Rate เป็น versioned ต่อ Contract มี effective date; Phase 1 เปิดใช้ fixed rate ต่อ kWh และเตรียม model สำหรับ TOU/ขั้นบันไดโดยไม่เปิดใช้จนกว่าจะมี requirement เพิ่ม

เมื่อ owner/admin เปลี่ยน Payment เป็น `paid` ระบบออก Receipt อัตโนมัติพร้อม snapshot ยอดเงิน วันที่ ผู้ดำเนินการ และ audit; school_user ดู/อัปโหลดหลักฐานได้แต่ยืนยันรับชำระไม่ได้

## 7. เอกสาร รายงาน และการแจ้งเตือน

เอกสารที่ต้องรองรับ: contract, billing statement, invoice, receipt, payment evidence และ report PDF/CSV/XLSX

Invoice/Receipt มีเลข series แยกประเภทและปี, verification URL/QR, document hash และสถานะ `draft`, `review`, `finalized`, `cancelled` ตามประเภท เอกสารที่ finalize แล้วแก้ทับไม่ได้

แจ้งเตือนผ่าน in-app และ email สำหรับ alarm สำคัญ, Invoice finalize, Receipt ออก และสถานะชำระเงิน; LINE/SMS/push ใช้ provider interface ที่เตรียมไว้แต่ยังไม่ต้องเปิดใช้ใน Phase 1

Alarm Phase 1: gateway/device offline, no telemetry, invalid quality, abnormal voltage/current/power, communication error และ register mapping error โดยกำหนด severity, threshold, acknowledgement และ notification policy ได้

## 8. Data correction, retention และ security

raw telemetry ห้ามแก้ทับ การแก้ไขใช้ correction/adjustment record และสามารถคำนวณ preview ใหม่ก่อน lock; หลัง lock ใช้ credit/debit adjustment พร้อม audit trail

ใช้ soft delete/deactivate สำหรับ master data; raw telemetry และ audit log เป็น append-only; เอกสารการเงินไม่ลบจริง

Retention เริ่มต้น: raw telemetry 2 ปี, aggregate 7 ปี, เอกสาร/สัญญา 7–10 ปีตาม policy บริษัท

ข้อกำหนดความปลอดภัย:

- TLS สำหรับ Web/API/MQTT และ per-gateway credential/certificate + topic ACL
- credential rotation และ secret ไม่เก็บใน source/database แบบ plain text
- MFA สำหรับ owner/admin, secure session/token rotation, rate limit และ login audit
- server-side RBAC/school scope ทุก endpoint
- object storage private พร้อม signed download URL และ malware/content validation สำหรับไฟล์ upload
- encryption at rest, daily backup, restore test และ audit log แบบ append-only
- เป้าหมาย Phase 1: availability 99.5%, RPO ไม่เกิน 24 ชั่วโมง, RTO ไม่เกิน 4 ชั่วโมง

## 9. Website Phase 1

หน้าหลักที่ต้องส่งมอบ:

1. Executive dashboard: KPI, map โรงเรียน, energy production/consumption, revenue, alarm และ payment overview
2. School/Site management: CRUD, status, contact, timezone, Billing Meter assignment
3. Gateway/Device: connection setup, health, last-seen, connector, simulator/import, raw registers
4. Register mapping: mapping editor, validation, version history, test read
5. Telemetry: realtime/near-realtime cards, chart, table, aggregate range, quality filter/export
6. Alarm: list/detail, acknowledge, threshold/rule, history, notification result
7. Users/RBAC: invite, deactivate, role, school/site assignment, MFA state
8. Contract/Rate: lifecycle, version, effective date, signer, attachments, overlap validation
9. Billing: cycle list, preview, quality summary, approval, finalize, cancellation, adjustment
10. Invoice/Receipt/Payment: document viewer/download/print, manual payment status, evidence
11. Reports: energy/device/billing/payment/audit exports
12. Audit/Settings: activity search, series settings, retention/configuration, notification templates, language dictionary

UI ต้อง responsive สำหรับการตรวจสอบบนหน้าจอเล็ก, ใช้ภาษาไทยเป็นค่าเริ่มต้น, แยกข้อความเป็น translation keys/words ที่มีตัวแปร interpolation และเตรียม locale อื่นได้โดยไม่แก้ business logic

## 10. Mobile Phase 2

Flutter ใช้ API/auth/domain model เดียวกับ Website และเน้น school_user: energy flow, production/consumption, device status, alarms, invoice/receipt, payment status, download/notification โดยไม่ทำ admin configuration ซ้ำใน Mobile เว้นแต่มี requirement เพิ่ม

## 11. Error handling และ observability

ทุก job ต้องมี idempotency key, retry policy, dead-letter/error state และ correlation id การรับข้อมูลต้องไม่ทำให้ข้อมูลซ้ำหรือทำให้ Billing ออกซ้ำ

ระบบต้องมี structured logs, metrics, traces, connector health, ingestion lag, missing data, aggregation lag, billing job status, document generation failures และ email delivery status พร้อม dashboard/alert ฝั่งผู้ให้บริการ

## 12. Test strategy และ acceptance boundary

- Unit tests: register decoding/scaling, quality rules, cumulative diff, reset detection, rate version, permission policy, document numbering, idempotency
- Integration tests: PostgreSQL/TimescaleDB, Redis job, MQTT simulator, object storage, email provider mock, transaction/outbox behavior
- Contract tests: OpenAPI API ที่ Website และ Flutter ใช้ร่วมกัน
- E2E: invite/login/MFA, create school/site, connect simulator, map registers, view telemetry, close billing cycle, approve partial, finalize invoice, mark paid, generate receipt, download/verify document
- Failure tests: offline gateway, duplicate message, late data, worker retry, invalid reading, missing cutoff reading, document/email failure, restore backup
- Security tests: horizontal access isolation, role escalation, signed URL expiry, upload validation, rate limiting และ audit completeness

Definition of Done ของ Phase 1 คือทุก domain ในหัวข้อ 9 ใช้งานได้บน staging, มี seeded simulator data, มี migration/backup/restore procedure, OpenAPI documentation, audit coverage, Thai locale, automated test suite และ runbook สำหรับ operator

## 13. การแบ่งโครงการ

เพื่อให้ส่งมอบได้เป็นระยะ แม้ Phase 1 จะครอบคลุมทุก domain ให้แยก implementation เป็นแผนย่อยที่ทดสอบได้:

- Foundation & access
- School/site and device inventory
- Gateway/connectors/register/telemetry
- Aggregation/quality/alarm
- Contract/rate/billing
- Document/payment/report
- Dashboard, settings, audit, hardening และ production readiness
- Phase 2 Flutter mobile

การตัด scope ต้องไม่ตัด security boundary, audit, data quality, billing idempotency หรือ document immutability เพราะเป็นเงื่อนไขความถูกต้องของระบบ
