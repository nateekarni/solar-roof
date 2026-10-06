# ตรวจการเก็บข้อมูล Database / Storage

ตรวจโค้ดทั้งระบบที่ commit `f9d2e5eee472fcda1b79373231d22f75ab2b81fb` วันที่ 6 ตุลาคม 2026 ด้วย skill code-review แยก Standards และ Spec ไม่มี issue-tracker/มาตรฐานรวมที่ repository ระบุ จึงใช้ schema, CONTEXT และ runbooks เป็นหลักฐาน ไม่ใช่การตรวจ host ที่ deploy จริง และไม่ได้รัน restore drill ของปลายทางจริง

## โครงสร้างปัจจุบัน

| ข้อมูล | ที่เก็บ |
| --- | --- |
| โรงเรียน ไซต์ ผู้ใช้ สัญญา บิล ชำระเงิน Audit | PostgreSQL |
| Telemetry raw/aggregate | TimescaleDB hypertable และตาราง aggregate |
| รายงาน CSV / telemetry archives | MinIO พร้อม metadata/checksum/catalog ใน PostgreSQL |
| หลักฐานสลิปบาง flow | data URL/base64 ใน `payments.slip_url` ของ PostgreSQL |
| session และ invitation | PostgreSQL พร้อมสถานะเพิกถอน/หมดอายุ |

Compose ใช้ named volumes `postgres-data`, `minio-data`, `redis-data`; การเก็บ volume ในเครื่องเดียวไม่ใช่ backup

## Standards

1. **P1 — เอกสารอาจมี record แต่ไม่มีไฟล์ต้นฉบับจริง** [documents.controller.ts](../../apps/api/src/modules/documents/documents.controller.ts) สร้างชื่อ key PDF แล้ว insert metadata โดยไม่ upload/ตรวจ object ก่อน ควร upload จริง ตรวจ bytes/checksum แล้ว publish record; งานการเงินมี gate จึงต้องแก้ก่อนเปิดออกเอกสารจริง
2. **P2 — สลิปอยู่ใน DB แบบ base64** [payment-dialog.tsx](../../apps/web/features/billing/payment-dialog.tsx) → [billing.controller.ts](../../apps/api/src/modules/billing/billing.controller.ts) ทำให้ DB/WAL โตและไม่ได้ใช้ object inventory/checksum แบบรายงาน ควรย้ายเป็น private object reference พร้อม manifest และ compatibility migration
3. **P2 — API/worker ใช้ MinIO root credentials** [docker-compose.web.yml](../../infra/docker/docker-compose.web.yml) ควรแยก application user ที่จำกัด bucket และ user สำหรับ backup
4. **P2 — เลขเอกสาร count+1 แข่งกันได้** documents controller ไม่มีตัวจัดสรรเลขแบบ transaction ทำให้ concurrent requests ได้เลขเดียวกันและชน unique constraint ควรใช้ sequence/allocator แบบ atomic

สี่ findings; จุดสำคัญสุดของแกนนี้คือ record เอกสารไม่ได้ยืนยันว่ามีไฟล์จริง Generic FileStorageService เป็น in-memory stub ที่ยังไม่พบ public caller ไม่ถือว่า label `encrypted: true` ใน stub เป็นหลักฐานว่า active object เข้ารหัสแล้ว

## Spec

1. **P1 — ยังไม่ครบข้อกำหนดกู้คืนไฟล์ต้นฉบับตาม record** [disaster-recovery.md](../runbooks/disaster-recovery.md) ต้องกู้และตรวจไฟล์ที่ DB อ้างถึง แต่เอกสาร/invoice flow สร้าง key โดยไม่ยืนยันไฟล์ จึงอาจมี record ที่ไม่มี original ให้กู้
2. **P2 — ยังยืนยัน encryption at rest ของ live storage ไม่ได้** Compose ไม่ตั้ง KMS/encryption ของ MinIO ขณะที่ [backup-restore.md](../runbooks/backup-restore.md) กำหนด encryption การเข้ารหัส backup ไม่ใช่การเข้ารหัส live volume ต้องยืนยัน host disk encryption หรือกำหนด object encryption จริง

สอง findings; จุดสำคัญสุดของแกนนี้คือกู้คืน original ที่ record อ้างถึงไม่ได้หาก original ไม่เคยถูกเก็บ

## สิ่งที่ทำไว้ดีและขอบเขตที่ยังไม่ยืนยัน

- มี foreign keys/uniqueness และ versioned migrations
- CSV exports ใช้ streaming, stable cursor, repeatable-read snapshot, tenant scope, bounded jobs และ checksum/read-back
- Archive catalog มี hash/generation และป้องกันการแก้ manifest
- pgBackRest มี full/differential/WAL/PITR และ encrypted off-host artifact/config backup utilities
- Restore ปฏิเสธปลายทางที่มีข้อมูล และตรวจ inventory
- Raw retention ยังไม่ลบจนผ่าน coverage/policy proof จึงไม่เสี่ยงลบทิ้งโดยไม่มี archive แต่ต้องวางแผนพื้นที่และติดตาม disk growth

ชุด web-first default `BACKUP_ENABLED=false`; artifact/config backup ต้องตั้งปลายทางแยก ไม่ได้เปิดเพียงเพราะเว็บ healthy ยังไม่ยืนยัน off-host destination, key escrow, independent recovery drill, RPO/RTO ของเครื่องลูกค้า

## ลำดับปรับปรุงที่แนะนำ

1. เก็บ original เอกสารจริงพร้อม checksum และ allocator เลขเอกสาร
2. แยก MinIO credentials และยืนยัน live storage encryption
3. จัดรูปแบบ object keys/manifests ของสลิปให้เหมือนหลักฐานอื่น พร้อม export inventory
4. ตั้ง off-host DB/object/config backup และทดสอบ restore บนเครื่องแยก จับเวลาจริงและเทียบจำนวน record/object/hash
5. จัด maintenance runbook รายวัน/รายเดือนสำหรับ backup heartbeat, disk growth, vacuum/analyze, archive coverage และการเก็บกุญแจ

โครงสร้างค่อนข้างเป็นระเบียบและมีฐานสำหรับ export/maintenance แล้ว แต่ยังสรุปว่าเก็บปลอดภัยครบถ้วนและกู้คืนได้ทุกส่วนไม่ได้จนแก้ข้อ 1 และมีหลักฐาน restore จริง
