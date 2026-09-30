# System review — 2026-09-30

สถานะ: ตรวจโค้ดและเอกสารแล้วบางส่วนในทุกชั้นหลัก; ยังไม่ใช่การรับรองครบทุก endpoint หรือ production readiness

## ขอบเขตและหลักฐาน

- Baseline HEAD: `9b4ccd5beaa1dc193f531ed096947b725b16b393` รวม working tree เดิม 28 modified files และ migration 009 ที่ยัง untracked
- ตรวจ README, CONTEXT, design spec, ADRs, runbooks, API controllers/services, SQL migrations, Prisma model, worker wiring, domain tests และเส้นทาง UI หลัก
- แยก Standards / Spec ตาม code-review skill; ปัญหาหนึ่งอาจปรากฏทั้งสองแกน จึงไม่รวมยอดเป็นจำนวน unique defects
- ไม่แก้ application code, ไม่ migrate/seed ฐานข้อมูล และไม่เปลี่ยนงานเดิมของผู้ใช้
- หลักฐานส่วนใหญ่เป็น static trace ตามเส้นทางจริง ไม่ใช่ผลโจมตีหรือทดสอบระบบ production
- ไม่พบ listener บนพอร์ต local 3000/3001/3002/5432/6379/1883 ขณะตรวจ; ไม่ได้ตรวจ remote environment และไม่อ่าน .env

ข้อสรุป: เส้นทาง UI → controller → persistence หลายจุดยังไม่ตรงกับ invariants ในเอกสาร โดยเฉพาะ school isolation, cumulative billing, immutable documents และผลสำเร็จที่ต้องมีงานจริงรองรับ การปรับ performance ต้องทำหลังแก้ความถูกต้องของข้อมูลและขอบเขตสิทธิ์

## Standards

ข้อกำหนดอ้างอิง: `docs/superpowers/specs/2026-09-01-solar-energy-management-platform-design.md` §§2, 4, 6, 8, 11–12

| ID | ระดับ | หลักฐาน | ผลกระทบ / แนวแก้ |
|---|---|---|---|
| STD-01 | P1 | `apps/api/src/modules/billing/billing.controller.ts:299,357`; `apps/api/src/modules/dashboard/operations.service.ts:360` | อ่านรายละเอียด/ส่งชำระบิลด้วย ID โดยไม่ตรวจโรงเรียน; users/audit list ไม่มี scope ที่เหมาะสม ใช้ principal และ resource ownership ฝั่งเซิร์ฟเวอร์กับทุก read/write/export |
| STD-02 | P1 | `apps/api/src/modules/billing/billing.controller.ts:52`; `apps/api/src/modules/telemetry/mqtt-ingestion.service.ts:341` | สร้างบิลจาก energy_export_kwh แต่ ingestion เขียน total_energy; ไม่มีข้อมูลแล้วใช้ 2450.5 kWh, opening 10000 และ quality complete แทน ใช้ billing meter closing/opening snapshots; missing reading ต้อง invalid |
| STD-03 | P1 | `apps/api/src/modules/billing/billing.controller.ts:40` | เลือก tariff ล่าสุดโดยไม่อิง effective period; future rate เปลี่ยนยอดบิลย้อนหลังได้ เลือก rate ตามรอบและเก็บ snapshot |
| STD-04 | P1 | `apps/api/src/modules/billing/billing.controller.ts:628` | adjustment เปลี่ยนยอด cycle/invoice ที่ชำระแล้วได้ ทำให้ receipt/payment ไม่ตรงกัน ต้องใช้ adjustment record และคงเอกสารเดิม |
| STD-05 | P1 | `apps/api/src/modules/billing/billing.controller.ts:465` | payment/cycle เปลี่ยนก่อน insert receipt, ไม่มี transaction; COUNT+1 ชนเมื่ออนุมัติพร้อมกัน เหลือ paid แต่ไม่มี receipt ใช้ transaction, row locking, atomic series และ idempotency |
| STD-06 | P1 | `apps/api/src/modules/documents/documents.controller.ts:10` | authenticated school user สร้าง financial document ของ arbitrary site ได้ เพราะไม่มี role/scope constraint จำกัดผ่าน application service และตรวจ ownership |
| STD-07 | P2 | `apps/api/src/modules/billing/billing.controller.ts:519,603,650` | audit failures ถูกกลืน และบางเหตุการณ์ไม่ระบุ actor ควรบันทึก audit ใน transaction เดียวกับ mutation |
| STD-08 | P2 | `apps/api/src/modules/billing/billing.controller.ts:744` | SMTP error ถูก catch แล้วตอบสำเร็จ สถานะส่งเอกสารจึงเชื่อถือไม่ได้ ใช้ queued/sent/failed และ retry ที่ตรวจสอบได้ |

Judgment call: การรันเลขเอกสารและ lifecycle ซ้ำใน controller/service/worker เป็น possible Duplicated Code ที่ทำให้กฎแตกต่างกัน ควรรวมเป็น application service หลังมี regression tests; ไม่ใช่ข้อเสนอให้ refactor ทุกไฟล์เพียงเพราะรูปแบบโค้ด

Standards: 8 findings; ประเด็นร้ายแรงที่สุดในแกนนี้คือการเข้าถึงข้อมูลการเงินข้ามโรงเรียน

## Spec

| ID | ระดับ | ความต้องการ / หลักฐาน | ความคลาดเคลื่อน |
|---|---|---|---|
| SPEC-01 | P1 | Spec §4: “เอกสารการเงินที่ออกแล้ว immutable”; ADR0010 receipt eligibility; `apps/web/features/shared/document-preview-modal.tsx:208,260` | เปลี่ยนเดือนแล้วใช้รายการ Jan–Aug 2026 ที่เขียนตายตัว พร้อมยอด/kWh/เลขเอกสารใหม่ โดยไม่โหลด cycle หรือ payment state จริง พิมพ์ receipt ของเดือนที่ไม่มี/ยังไม่ชำระได้ |
| SPEC-02 | P1 | Spec §8: “server-side RBAC/school scope ทุก endpoint”; `apps/api/src/modules/dashboard/dashboard.controller.ts:99` | dashboard ไม่ส่ง principal เข้า query และยอมรับ school/site จาก client; authenticated user อ่านข้อมูลข้ามโรงเรียนได้ |
| SPEC-03 | P1 | CONTEXT realtime power flow; `apps/api/src/modules/dashboard/dashboard.service.ts:540,692` | load/import/export ใช้สัดส่วน 1.25, daily ratio และค่าคงที่ 14.2/3.5 kW ต้องแยก measured/estimated/unavailable ให้ชัดเจน; ADR0004 เคยเรียกว่า simulation จึงต้องปรับเอกสารและ UI ให้ตรงกัน |
| SPEC-04 | P1 | Spec §§7,9 report PDF/CSV/XLSX; `apps/api/src/modules/reports/reports.controller.ts:17`; `apps/web/features/shared/detail-modals/report-detail-modal.tsx:56` | POST ตอบ ready โดยไม่สร้างงานหรือไฟล์จริง; list เป็นตัวอย่างและ download เป็น metadata .txt ต้องมี persisted job + artifact จริง |
| SPEC-05 | P2 | `apps/api/src/modules/dashboard/dashboard.service.ts:434`; migration002:14 | comparison ใช้ b.start_date/end_date แต่ schema คือ period_start/end; เมื่อส่ง date filters query จะผิด และ UI กลายเป็น empty results |
| SPEC-06 | P2 | Spec §9 overlap validation; `apps/api/src/modules/billing/billing.controller.ts:177` | create contract ไม่ผ่าน overlap validator และเพิ่ม active open-ended contract ได้หลายรายการ จึงเลือกสัญญา/ราคาได้กำกวม |

Spec: 6 findings; ประเด็นร้ายแรงที่สุดในแกนนี้คือเอกสารการเงินย้อนหลังที่สร้างค่าขึ้นเอง

## ข้อค้นพบเพิ่มเติมจากการตรวจเส้นทางข้อมูล

### TEL-01 — P1: MQTT อาจวนรับ ACK ของตัวเอง

`mqtt-ingestion.service.ts:91,102,292,304` subscribe `energy/#` และส่ง ACK ไป `energy/<gateway>/response`; handler ไม่กรองชนิด topic/message ACK มี deviceId/siteId จึง resolve ได้อีกครั้ง แต่ไม่มี timestamp แบบ payload ทำให้กำหนด source_time ใหม่และส่ง ACK ต่อ แม้ insert ล้มเหลวก็ยัง ACK เมื่อ broker ส่ง publication กลับให้ subscriber ตามปกติ จะเกิด loop, write amplification และข้อมูลปนเปื้อน ต้อง subscribe เฉพาะ telemetry และ reject response/config ก่อน parse/persist เป็น defense in depth ยังไม่ได้ reproduce กับ broker จริง

### TEL-02 — P1: ชี้ข้อมูลไม่รู้จักไปยังไซต์แรก

`mqtt-ingestion.service.ts:419` fallback เลือกไซต์แรกที่มี gateway/device เมื่อ resolve ไม่สำเร็จ ข้อมูลผิดชื่อหรือจากอุปกรณ์ไม่รู้จักจึงปนกับมิเตอร์จริง ต้อง exact-match identity ที่ provision ไว้และ quarantine/reject unknown identity โดยไม่กำหนด tenant จากการค้นหาแบบ wildcard

### TEL-03 — P1: ยืนยันรับข้อมูลแม้บันทึกไม่สำเร็จ

`mqtt-ingestion.service.ts:235,304` catch insert failure แล้วเดินต่ออัปเดตสถานะ/aggregate/cache/ACK อุปกรณ์อาจทิ้ง offline buffer โดย raw ไม่ durable ต้อง ACK หลัง durable accepted transaction เท่านั้น และ retry ได้ด้วย stable identity

### TEL-04 — P2: สูตร activePower precedence ผิด

`mqtt-ingestion.service.ts:182` expression `Number(m.activePower ?? m.active_power ?? m.activePowerKw ? Number(m.activePowerKw) * 1000 : 0)` ให้ NaN สำหรับ `{activePower:1200}` และ `{active_power:1200}`; ให้1200 เฉพาะ `{activePowerKw:1.2}` ยืนยันด้วย Node expression reproduction แล้ว แยก canonical field selection จาก unit conversion และตรวจ finite number

### TEL-05 — P1: Replay/late data ทำให้ aggregate และค่าล่าสุดผิด

`mqtt-ingestion.service.ts:142,344,499` สุ่ม ingestion ID เมื่อไม่มี ID; aggregate ยังอัปเดตแม้ raw conflict, เพิ่ม sample_count ซ้ำ และใช้ค่าที่มาทีหลังแทนค่าที่ source_time ใหม่กว่า Cache ไม่มี expiry และสถานะ online คงอยู่ ต้อง stable dedupe, update aggregate เฉพาะ accepted sample, source-time ordering และ freshness policy

### SCH-01 — P1: Register editor INSERT ไม่ตรง schema

`apps/api/src/modules/telemetry/telemetry.controller.ts` saveDeviceRegisterMapping INSERT ไม่ระบุ byte_order แต่ `infra/migrations/002_platform_data.sql:8` กำหนด NOT NULL และไม่มี default ใน migrations ที่ตรวจ แม้ UPSERT record เดิมก็ไม่ผ่าน NOT NULL ของ proposed insert แก้ DTO/mapping/schema ให้ตรงและทดสอบกับฐานข้อมูลที่ migrate ใหม่

### SCH-02 — P2: Mapping ที่ชื่อ versioned ถูกแก้ทับ/ลบ

TelemetryController ใช้ ON CONFLICT UPDATE และ DELETE; getDeviceMappings ไม่เลือก effective period และ ingestion ไม่เก็บ mapping_version_id ข้อมูลย้อนหลังจึงพิสูจน์วิธี decode ไม่ได้ ใช้ immutable versions + effective window + reference บน raw sample

### JOB-01 — P1: Worker ยังไม่ทำ automation ที่ระบุไว้

`apps/worker/src/app.module.ts:4` ลงทะเบียนเพียง CloseBillingCycleJob; `main.ts` เปิด health HTTP server ไม่พบ scheduler/queue consumer ที่เรียก jobs หรือสร้าง hour/day/month aggregates CloseBillingCycleJob ใช้ completed Map ใน memory; GenerateMonthlyInvoicesJob ไม่ได้ลงทะเบียน จึงยังไม่มี durable month-end/retry/restart guarantee Cutoff helper เป็น23:59:59.999 แทน23:59:00ใน spec และเลือกเดือนจาก UTC ของ now ซึ่งเสี่ยงผิดเดือนช่วงต้นเดือน Bangkok

### DOC-01 — P1: ตัวอย่างบัญชีรับเงินยังแสดงเมื่อโหลด settings ไม่สำเร็จ

`document-preview-modal.tsx:135,228` เริ่มด้วย example bank accounts และ swallow fetch errors จึงอาจแสดงข้อมูลรับเงินที่ไม่ใช่บัญชีที่ตั้งค่าจริง ต้อง unavailable/error และห้ามพิมพ์เอกสารทางการเมื่อ required snapshot ไม่ครบ

### DOC-02 — P2: System documents ขัดกันและบางส่วนเป็นเป้าหมายไม่ใช่สิ่งที่ทำแล้ว

- Design ยัง Draft มี3 roles แต่ CONTEXT/migration008 มี5 roles; AuthUser type ยัง3 และ financial role decorators หลายจุดยังไม่มี accountant
- README ระบุ no static fallback แต่ telemetry, power-flow, report และ preview มี static values
- Design invoice finalized-only แต่ CONTEXT ระบุ invoice preview ได้ทันทีหลังคำนวณ ต้องแยก draft preview กับ issued document อย่างชัดเจน
- Number pattern รุ่นเก่า `INV-2026-000001` กับ CONTEXT `INV2026080001` และหลาย implementations ยังต่างกัน
- Prisma models ไม่ map กับ SQL runtime tables; runtime ใช้ pg จึงเป็น schema documentation drift ไม่ใช่หลักฐานว่า Prisma ทำข้อมูล runtime เสีย
- Retention/backup/runbooks เป็นข้อกำหนด แต่ยังไม่มีหลักฐานการติดตั้ง retention policies หรือผล restore drill; อย่าอ้างว่าได้ RPO/RTO ตามเป้าแล้ว

## Flow coverage และสิ่งที่ยังต้องยืนยัน

| Domain | ตรวจแล้ว | งานตรวจที่ยังเหลือ |
|---|---|---|
| Identity/RBAC | guard wiring, token/login, scopes ใน dashboard/billing/documents/operations | MFA/invitation/session revocation ครบวงจร, endpoint authorization matrix ทุก route |
| School/site/gateway | controller/service/schema, identity resolution, wizard ตาม code review | create/edit/archive/delete จริง, rollback เมื่อ commissioning ล้มเหลว, network timeout |
| Register/telemetry | decode unit tests, MQTT persistence/ACK/cache, schema | broker ACL/TLS, QoS/reconnect/offline burst, hardware meter fixtures |
| Billing/payment | tariff/cycle/approval/receipt/adjustment trace | real PostgreSQL concurrency, month boundary, decimal rounding, partial payment policy |
| Documents | preview period/bank/receipt eligibility, numbering | persisted PDF/hash/QR, signed URLs, upload validation และ malicious file tests |
| Dashboard | scope, queries, units/aggregates, compare, polling | EXPLAIN ANALYZE, real meters, browser charts/accessibility/mobile |
| Reports/alarms/settings | report stubs, retention wiring, settings paths | rule-to-notification delivery, exportsทุกformat, failure statesทุกcontrol |
| Operations | worker registration, test scripts, migrations, runbooks | clean install/build, deployment health, observability, backup restore drill |

## Verification ที่รันจริง

1. `pnpm test`: exit1; 5/8 package tasks successful, domain18/18 passed; API/Web พบ missing modules
2. API และ Web `tsc --noEmit` โดยตรง: exit1; ขาด mqtt, @nestjs/swagger, express-rate-limit, Next modules, lucide-react และอื่นๆ มี downstream type errors จึงยังแยกไม่ได้ว่าทั้งหมดเป็น source defect หรือ dependency-install defect
3. รัน domain/connectors/identity/API/worker tests รวมผ่าน tsx:24 passed,4 file-level failures; ครั้งแรก root tsconfig ทำให้ API decorators fail ด้วย
4. รัน API assets/telemetry ซ้ำด้วย apps/api/tsconfig.json: ตัด decorator invocation issue แล้วแต่ยัง fail เพราะ rxjs artifact ไม่ครบ
5. Pure activePower expression reproduction: NaN สำหรับ W fields ตาม TEL-04
6. Git status หลังตรวจไม่มี application edits จาก audit นี้

ข้อจำกัด: ยังไม่ได้ browser E2E, database integration, production build, load test, vulnerability exploit, PDF visual verification หรือ restore drill การตรวจ UI ครั้งนี้เป็น source review ไม่ใช่ interactive acceptance test

## Performance: หลักฐานและแผนวัด

- Dashboard summary ยิง7 queries พร้อมกัน (`dashboard.service.ts:16`); rankings/map join aggregate โดยไม่จำกัดวันที่ (`:59,:111`) ทำให้ผลไม่ตรงช่วงที่เลือกและงานเพิ่มตามข้อมูลสะสม
- หน้า dashboard router.refresh ทุก10วินาที (`dashboard-auto-refresh.tsx:6`); hook ไม่หยุดเมื่อ hidden/offline จึงมีงานซ้ำแม้ผู้ใช้ไม่ได้ดู
- Operations หลาย resource ดึงทั้งหมด ไม่มี server pagination; export สร้าง CSV ทั้งชุดใน memory
- Ingestion ทำ entity lookups และหลาย writes ต่อข้อความ ไม่มี bounded queue/backpressure; ACK loop และ replay amplification ต้องแก้ก่อนเพิ่ม concurrency
- ไม่อ้าง latency หรือ throughput improvement จนกว่าจะมี baseline เครื่อง/ข้อมูล/workload เดียวกัน

Proposed measurement: datasetหลายโรงเรียนและประวัติหลายเดือน; บันทึก p50/p95/p99 API, query count/duration, pool wait, rows scanned, payload size, ingestion lag, queue depth, event-loop delay; browser LCP/INP/CLS บน desktop/mobile; เปรียบเทียบ cold/warm และ burst/replay

Proposed acceptance budgets (ข้อเสนอ ยังไม่ใช่ค่าที่วัดได้): interactive read p95≤300ms ที่ API ภายใต้ workload ที่ตกลง, browser LCP≤2.5s/INP≤200ms/CLS≤0.1, ingest-to-visible p95≤5s ที่ steady state, zero acknowledged-but-lost samples/duplicate financial documents ใน failure tests เป้าต้องปรับตามจำนวนไซต์และhardwareจริง

## แบบปรับปรุงที่เสนอเพื่อพิจารณา

แนะนำคง modular monolith และ deployables เดิม แล้วปรับทีละ vertical slice ทางเลือก patch ทีละอาการเร็วกว่าแต่ยังเหลือกฎซ้ำ; rewrite/microservicesเพิ่ม migration และ operational complexity โดยยังไม่มี workload evidence รองรับ

1. **Reproducible environment + source of truth:** clean frozen-lockfile install ใน environment แยก, typecheck/build, SQL migration ledger/checksum/advisory lock, ระบุ SQL เป็น runtime schema, เก็บ role/lifecycle/unit/document contracts ในเอกสารเดียว
2. **Access boundary:** server-derived principal/school assignments, deny-by-default action policies, scope queriesทุกroute/exportและresource-by-ID, เพิ่ม two-school integration matrix ทั้ง5roles
3. **Telemetry correctness:** strict provisioned identity/topic/schema, finite canonical units, durable dedupe/ACK, versioned mappings, late data/freshness, durable aggregate jobs; UIไม่มีข้อมูลต้องบอก unavailable
4. **Financial core:** transaction-scoped servicesสำหรับ cycle/payment/document/audit, exact-decimal/rounding policy, effective tariff snapshots, atomic numbering, immutable issued docs และ adjustments, outboxสำหรับ PDF/email
5. **Honest interactions:** previewเลือก persisted cycle/document, receipt guardตาม cycleจริง, real report job/download; loading/empty/error/retry statesและkeyboard/mobile checks; settingsที่ยังไม่มีconsumerต้องแสดงสถานะชัด
6. **Measured optimization + operations:** time-bounded queries/indexesหลัง EXPLAIN, server pagination/streamed exports, tenant-aware cache, visibility-aware refresh, ingestion backpressure, metrics/alerts และ restore drill

แต่ละ slice ต้องมี failing regression ที่แสดง defect ก่อนแก้, green testsหลังแก้ และไม่มี production migration จนผ่าน rehearsal

Design decisions ที่ใช้เป็นฐานเสนอ: คง5rolesจากเอกสารล่าสุด แต่ admin จำกัดassignment; draft invoiceดูได้แต่ต้องมีdraft watermarkและไม่ถือเป็นissued; school userห้ามconfirm payment; unknown telemetryไม่fallback; unavailable measurementไม่แสดงเป็น0; finalized documentsไม่แก้ทับ

งานปรับ application ยังไม่ได้เริ่ม เพราะเป็นการเปลี่ยน authorization, financial lifecycle และ data interfaces ระดับสถาปัตยกรรม ต้องพิจารณาแบบข้างต้นก่อนตาม brainstorming skill; รายงานนี้เป็นผลตรวจและข้อเสนอ ไม่ใช่การยืนยันว่าระบบแก้แล้ว
