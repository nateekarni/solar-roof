# Pilot reception, preferences and storage implementation plan

> **For agentic workers:** Use executing-plans to implement each unfinished task with verification before completion. Steps use checkbox tracking.

**Goal:** แก้ UX ที่รายงานและจัดแผน profile/register กับผลตรวจ database/storage ทั้งหมดก่อนใช้งานข้อมูลจริง

**Architecture:** แยก MQTT routing จากการแปลค่าข้อมูล โปรไฟล์เป็น immutable revision ที่รวม semantic field และ optional register recipe การปรับใน modal ไซต์สร้าง revision เฉพาะไซต์/อุปกรณ์ ไม่แก้ shared profile หรือข้อมูลย้อนหลัง การเก็บ original และ backup มีการยืนยัน checksum/read-back จริง

**Tech Stack:** Next.js, React, shadcn, NestJS, Zod, PostgreSQL/TimescaleDB, MQTT, MinIO, pgBackRest

**Spec:** คำขอผู้ใช้ 2026-10-06 และ [whole-system audit](../../reviews/database-storage-current-th.md) ที่ commit f9d2e5e

## Global constraints
- Admin จัดการ mapping; Owner/School User ไม่มีสิทธิ์เปลี่ยนการรับข้อมูล
- ห้ามยอมรับ Topic ข้ามไซต์/Gateway เพื่อหลบ validation
- Profile revision เดิมและ raw evidence เดิมต้องไม่เปลี่ยน
- ห้ามสมมติ register ของ SPM91 จากชื่อรุ่น ต้องตรวจ register manual หรือรายการที่ผู้ดูแล gateway ให้ก่อนเผยแพร่ template
- ข้อมูลไม่ครบหรือไม่มี billing-import ห้ามผ่านเป็นหลักฐานคิดบิล
- แยก deployment เว็บกับ MQTT และใช้ external broker ได้
- การ migrate storage ต้องรองรับฐานข้อมูลเดิม ไม่ลบ base64 ก่อนยืนยัน object/checksum และ backup

## Findings reproduced
- `gatewayTopic('GW-001','solar/v1/sites/SITE-001/gateways/GW-001/devices/SPM91-01/telemetry')` ปฏิเสธด้วยข้อความที่ผู้ใช้รายงาน ขณะที่ `energy/GW-001/#` ผ่าน โค้ดเรียก validator นี้เมื่อไม่ได้เลือก payload revision จึงเป็น mode mismatch ไม่ใช่ wildcard ที่ผิดในตัวอย่าง
- Payload subscription รับ `solar/v1/sites/{externalSiteId}/gateways/{externalGatewayId}/devices/{Device ID หรือ +}/telemetry`; ID ต้องตรงกับที่บันทึก และ JSON ต้องตรงด้วย Topic อย่างเดียวไม่ทำให้ legacy JSON เป็น canonical envelope
- Main meter dropdown ใช้ `isBillingProfile`: DEFAULT_PAYLOAD_PROFILES มี Schneider PM2230 และ Huawei SmartLogger3000A แต่ Huawei เป็น logger และไม่มี billing-import จึงไม่ปรากฏใน main meter dropdown
- Payload profile fields รองรับ tag/group/unit/conversion/role แต่ยังไม่มี register address/count/type/order/scale
- Site modal แสดง field table แบบอ่านอย่างเดียว; settings profile editor มี field CRUD อยู่แล้ว
- `/settings/general` redirect ไปบริษัท แทน preferences; session refresh render paragraph เปล่าบน main

## Task 1: Small UX corrections
Files: `apps/web/app/session/refresh/page.tsx`, `apps/web/features/settings/general-preferences.tsx`, `apps/web/app/(app)/settings/general/page.tsx`, `apps/web/features/sites/site-form-dialog.tsx`, `apps/api/src/modules/assets/assets.controller.ts`.
- [x] ใช้ AppLoading มี icon/label กลางหน้าจอทั้ง 390/1440px และแสดง error/login fallback ตำแหน่งเดียวกัน
- [x] สร้างหน้า preferences จริง: ภาษาไทย/English และ system/light/dark ใช้ preference API เดิม
- [x] แสดงคำแนะนำ Topic ตาม mode และ error เจาะจง solar topic ใน legacy mode โดยไม่เปิดสิทธิ์ข้าม Gateway
- [x] Verify typecheck (8 packages), delayed-refresh icon/label and timeout fallback, preferences rendering at 390/1440px before commit

## Task 2: Versioned profile + register schema
ปรับทิศทางตาม payload จริงเป็น Unified Preset สำหรับ JSON พร้อม legacy Register adapter: ดู [implementation และสถานะ](2026-10-06-unified-presets.md). ไม่บังคับ Register recipe สำหรับ JSON ที่ Gateway แปลแล้ว งาน register recipe/hardware configuration ด้านล่างยังแยกเป็นงานภายหลัง
Files: `apps/api/src/modules/telemetry/payload-profile.ts`, `apps/web/features/sites/payload-contracts.ts`, `apps/api/src/modules/settings/payload-presets.controller.ts`, `apps/api/src/modules/telemetry/payload-profile.spec.ts`.
Interface: เพิ่ม optional `register` ใน field: `{address:string,count:number,dataType:string,wordOrder:string,byteOrder:string,signed:boolean,scale:number}`; ใช้ enum/type เดียวกับ register mapping ปัจจุบัน ไม่เพิ่ม arbitrary expression execution
- [ ] เขียน failing tests: field เดิมยังผ่าน; register recipe ที่ขาด count/invalid type/nonfinite scale ถูกปฏิเสธ; duplicate tags/billing role/unit validation ยังทำงาน
- [ ] เพิ่ม schema และ frontend contract โดย register metadata ไม่เปลี่ยนการ normalize canonical values ซ้ำอีกครั้ง
- [ ] ทดสอบ publish revision ใหม่และ revision เดิมยังอ่านได้; ทดสอบ bytes/hash เก่าคงเดิมก่อนใช้ migration
- [ ] แยก logical decoder ของ payload กับ decoder ของ register แต่ให้ทั้งคู่คืน normalized semantic fields เดียวกัน
- [ ] เพิ่ม generic custom meter profile ผ่าน UI; ใส่ SPM91 template เฉพาะเมื่อยืนยัน register/manual และ source units จริง

## Task 3: Editable mapping in site modal
งาน JSON Preset selector/editor/manual fields/Preview/version separation ทำแล้วตาม [Unified Preset](2026-10-06-unified-presets.md); checklist เดิมด้านล่างเป็นขอบเขตข้อเสนอเดิม ไม่ใช่การอ้างว่าการส่ง config ไป hardware ถูกทำแล้ว
Files: `apps/web/features/shared/payload-fields-editor.tsx`, `apps/web/features/sites/site-form-dialog.tsx`, `apps/api/src/modules/assets/assets.controller.ts`, `apps/api/src/modules/assets/payload-provisioning.spec.ts`.
Interface: รับ draft fields และ source profile revision; validate/publish derived profile revision และ bind อุปกรณ์ใน transaction เดียว ไม่ใช้ client-provided revision โดยข้ามสิทธิ์
- [ ] แสดง field name/tag, group, source/target unit, conversion, billing role และ register recipe เมื่อเลือก profile
- [ ] reuse field editor เพิ่ม/แก้/ลบรายการใน modal และเพิ่ม editor ของ register โดย responsive card บน mobile/table บน desktop
- [ ] บันทึก derived revision โดยมี source revision/audit; conflict concurrent changes ต้องไม่ overwrite
- [ ] UI เพิ่มคำอธิบาย main billing meter vs additional logger และ preview ว่าค่าใดใช้คิดบิล
- [ ] ทดสอบ CRUD รายการจริง roundtrip, reload modal, reject removal of required billing field, denied non-Admin, old revision unchanged และ unknown incoming field อยู่ใน unmapped evidence
- [ ] ทดสอบ external broker fixture ของจริงใน isolated environment โดยไม่ส่ง hardware config จนได้รับการอนุญาตให้ส่ง

## Task 4: Persist original documents and atomic numbers (Standards P1/P2, Spec P1)
Files: `apps/api/src/modules/documents/documents.controller.ts`, `apps/api/src/modules/billing/billing.controller.ts`, `apps/api/src/database/migrations`.
- [ ] Regression: record มี key แต่ GET original ไม่พบต้องไม่ถือว่าพร้อมดาวน์โหลด; concurrent issue 20 requests ต้องได้เลขไม่ซ้ำ
- [ ] สร้าง/upload original จริง ตรวจ bytes/hash/read-back ก่อน publish metadata; มี pending/failed state และ retry ที่ไม่สร้างเลข/เอกสารซ้ำ
- [ ] ใช้ atomic allocator ต่อ document type/period ใน transaction แทน count+1
- [ ] ตรวจ inventory ของเอกสารเดิม แยก missing original อย่างตรงไปตรงมา ไม่สร้างหลักฐานย้อนหลังโดยแอบแทน original

## Task 5: Slip migration and least-privilege storage (Standards P2)
Files: `apps/web/features/billing/payment-dialog.tsx`, `apps/api/src/modules/billing/billing.controller.ts`, `infra/docker/docker-compose.web.yml`, `apps/api/src/database/migrations`.
- [ ] private upload บังคับ size/type, checksum และ school-scope download authorization
- [ ] ย้าย base64 เป็น object พร้อม manifest ด้วย resumable batch และตรวจ read-back; เก็บ compatibility reader ก่อน cleanup
- [ ] แยก application/worker/backup MinIO identities จำกัด bucket/action; ไม่ให้แอปใช้ root key
- [ ] ทดสอบ cross-school denied, missing/tampered object rejected, migrate rerun idempotent และ export original inventory ครบ

## Task 6: Encryption and verified off-host recovery (Spec P2 / operational gaps)
Files: `docs/runbooks/backup-restore.md`, `docs/runbooks/disaster-recovery.md`, `infra/docker/docker-compose.web.yml`, existing backup/recovery scripts.
- [ ] ยืนยัน live disk encryption หรือกำหนด MinIO encryption/KMS จริง พร้อม key escrow แยก host; ห้ามอ้าง encrypted backup แทน live encryption
- [ ] ตั้ง off-host full/differential/WAL และ object/config backup; ตรวจ BACKUP_ENABLED และ scheduler จริง ไม่เปิดโดยถือว่าเว็บ healthy
- [ ] Restore เข้า empty independent host ตรวจ record counts/object inventories/checksums, config และ secrets/key availability พร้อมจับเวลา RPO/RTO
- [ ] บันทึก drill evidence และ fail recovery readiness เมื่อ backup stale หรือ object inventory ไม่ครบ

## Task 7: Maintenance and export operations
Files: `docs/runbooks/backup-restore.md`, `docs/runbooks/disaster-recovery.md`, new `docs/runbooks/data-maintenance-th.md`.
- [ ] เพิ่ม daily backup heartbeat, disk growth, object/DB inventory; monthly independent restore/key check
- [ ] ระบุ vacuum/analyze, hypertable growth, failed export cleanup และ orphan object quarantine ตาม retention
- [ ] raw telemetry retention เปิดลบหลัง archive coverage/checksum/policy proof เท่านั้น พร้อม rollback window
- [ ] ให้ export metadata/CSV/originals และ checksum manifest โดยรักษา tenant scope; ทดสอบ export ของชุด fixture เทียบก่อน/หลัง restore

## Coverage
Standards ทั้ง 4 findings และ Spec ทั้ง 2 findings อยู่ Tasks 4–6; backup disabled, destination/key escrow, restore drill และ maintenance อยู่ Tasks 6–7. Tasks 2–7 เป็นงานในแผน ยังไม่ใช่การแก้ที่เสร็จแล้ว
