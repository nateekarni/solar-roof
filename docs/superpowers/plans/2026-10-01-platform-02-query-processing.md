# Platform 02 — Query and Data Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** จำกัดต้นทุนต่อrequestและแยกงานหนัก เพื่อรองรับข้อมูลจำนวนมากโดยยังบันทึกMQTTถูกต้อง

**Architecture:** ใช้serverpagination, dedicatedingestionbudget, energyreadmodel และdurablePostgreSQLjobleasesในworker ไม่เพิ่มmessagebrokerใหม่และไม่ใช้Redisเป็นหลักฐานเดียวว่างาน/ข้อมูลถูกยอมรับแล้ว

**Tech Stack:** PostgreSQL16/TimescaleDB2.18.2, NestJS12, MQTT.js, S3, node:test/tsx; workerเพิ่ม`pg`/AWS SDKรุ่นเดียวกับAPIในlockfileเมื่อจำเป็น

**Spec:** [Assessment](../../system-assessment-2026-10-01.md), [ADR0011](../../adr/0011-tiered-telemetry-history-and-recovery.md), [แผนหลัก](2026-10-01-platform-improvement.md)

## Global Constraints

- 100 โรงเรียน / 1,000 มิเตอร์ / ข้อความทุก 1 นาที / ผู้ใช้พร้อมกัน 50 คน; หน้าใช้งานทั่วไปภายใน2วินาที
- raw90วัน/restorearchive1ชั่วโมง; recovery4ชั่วโมง/จุดกู้15นาที; noactualdatareset
- Node24.20.0/pnpm11.24.0; ต่อเติมmigrationไม่แก้ของเดิม; noaggregatecumulative-sum
- ใช้B1harnessและmetrics; testsแยกจากบริษัทstaging; rolloutreadmodelflagปิดจนbackfillตรวจถูกต้อง

## Review Focus

1. จำนวนแถวเพิ่มขณะเปลี่ยนหน้าต้องไม่ทำให้รายการซ้ำหรือscopeข้าม — Q1
2. Gatewayส่งซ้ำ/ส่งพร้อมกันเกินbudgetต้องไม่ACKก่อนdurablewrite — Q2
3. latearrivalเปลี่ยนค่าขอบวันถัดไปด้วย ต้องrecomputeทั้งสองฝั่ง — Q3
4. workerตายหลังuploadแต่ก่อนmarkreadyต้องretryได้โดยไม่สร้างreportซ้ำ — Q4
5. ผู้สร้างreportถูกถอนสิทธิ์ก่อนdownloadต้อง403แม้jobเสร็จแล้ว — Q4

## File ownership

Q1operationsDTO/query; Q2ingestionlimiter/pool; Q3energyrollup+indexesmigration020และworkerrefresh; Q4sharedjobmigration021และS3artifacts D1 ใช้ job interfaces นี้ต่อสำหรับ report/archive/restore; Q3 dirty-day claims อยู่ใน transaction ของ read model

### Task Q1: Server-side lists, summary และ audit pagination

**Files:** Create `packages/api-contracts/src/operations.ts`, `apps/api/src/modules/dashboard/operation-query.ts`, `apps/api/test/platform/operations.test.ts`; Modify `packages/api-contracts/src/index.ts`, `apps/api/src/modules/dashboard/operations.controller.ts`, `operations.service.ts`, `apps/web/features/shared/operation-page.tsx`, `apps/web/components/ui/data-table.tsx`, `apps/web/features/shared/operation-card-list.tsx`.

**Interfaces:** `OperationQuery={limit:number,cursor?:string,search?:string,sort:string,direction:'asc'|'desc',from?:string,to?:string}`; `OperationPage<T>={columns:string[],rows:T[],idKey:string,page:{limit:number,nextCursor:string|null,hasMore:boolean}}`. GET`/v1/operations/:resource` default25/max100, allowlistedfilters/sortsต่อresource; summaryแยกSQLaggregateและscopeเดียวกัน. Cursorvalidateversion+sort+filter/scopefingerprint, parameterizedSQLและtie-breakid; ไม่ใช้cursorเป็นauthorization.

- [x] เขียนoperationscase1001billingrows: `assert.equal(page.rows.length,25)`; followcursorจนจบไม่มีซ้ำ; insertระหว่างpageไม่ทำให้stableexistingrowsซ้ำ; schoolBไม่ปรากฏ; audit501รายการต้องhasMoreและค้นรายการเก่าได้.
- [x] รัน`bash scripts/ci/platform-check.sh operations` → FAIL; implementSQLLIMIT(limit+1), keysetorderที่stableสำหรับbilling/audit/documentsและallowlistresourceอื่น; summaryห้ามเรียกlistหรือโหลดrowsทั้งหมด.
- [x] เปลี่ยนURLquery→APIและUIpagination ให้search/filterเปลี่ยนแล้วresetcursor; debounce300ms+cancelstale fetch; exportไม่เรียกpaginatedlistแล้วอ้างว่าexportครบ ให้ใช้Q4หลังพร้อม และก่อนนั้นคงexplicitboundedexport.
- [x] รันoperations PASSและroleE2Eเดิม; EXPLAINfixtureต้องแสดงboundedreturnedrowsและresponseไม่โตตามประวัติทั้งหมด; นับsummaryqueriesไม่อ่านcollectionซ้ำ.
- [x] StageFilesข้างบนและcommit `perf: paginate operations and compute scoped summaries in SQL`.

### Task Q2: Bounded MQTT และ resource budgets

**Files:** Create `apps/api/src/modules/telemetry/ingestion-limiter.ts`, `ingestion-database.service.ts`, `apps/api/test/platform/ingestion.test.ts`; Modify `mqtt-ingestion.service.ts`, `telemetry.module.ts`, `apps/api/src/database/database.service.ts`, `infra/docker/mosquitto/managed.conf`, `infra/docker/.env.staging.example`, `infra/docker/docker-compose.staging.yml`, `docs/gateway-handoff/gateway-connection-draft-th.md`.

**Interfaces:** `IngestionLimiter.submit(gateway:string,bytes:number,work:()=>Promise<void>):'queued'|'rejected'`; defaultsเริ่มต้นเสนอ`MQTT_MAX_PAYLOAD_BYTES=131072`, JSONdepth16, `INGEST_CONCURRENCY=8`, pendingqueue1024, perGateway50msg/s burst100. APIreadpool12/ingestpool8รวม20ต่อprocess; ทั้งสองconnectionwait5s, readstatementbudget1500msเป็นinitialconfigต้องทดสอบกับB2ก่อนใช้จริง.

- [x] เขียนtestส่ง2000workitemsพร้อมกัน: `assert.ok(maxRunning<=8)`และpending<=1024; rejectedไม่มีapplicationACK; huge/deepJSONถูกrejectก่อนDB; twoGatewayfairness; duplicateacceptedหนึ่งrawrow.
- [x] รัน`bash scripts/ci/platform-check.sh ingestion` → FAIL; parsebytes/depthboundedก่อนcanonicalization จัดperGatewayround-robinqueueและdedicatedDBpoolสำหรับidentity/mapping/writeด้วย ไม่แยกเฉพาะINSERT.
- [x] คงACKหลังcommit; busy/errorไม่ส่งsuccessACKและGatewayต้องretryด้วยingestionId/sourceTimeเดิม จัดbroker`message_size_limit`ตรง128KiB; shutdownหยุดรับและรองานที่commitแล้วก่อนexitโดยมีdeadline ไม่ทิ้งงานแล้วตอบสำเร็จ.
- [x] รันingestion PASSรวมDBdown/reconnect/brokerrestart; HTTPhealthต้องตอบได้ระหว่างburst; metricsต้องมีrejected/backlog/ACKlatency แต่ไม่มีpayloadcredentials. Firmware compatibility remains an external pilot gate (not yet verified).
- [x] StageFilesข้างบนและcommit `perf: bound MQTT ingestion and isolate database capacity`.

### - [ ] ยืนยัน payload/rate/retry กับ firmware จริงก่อนเปิด pilot.

Task Q3: Correct energy rollup และ query indexes

**Files:** Create `infra/migrations/020_energy_read_models.sql`, `packages/domain/src/energy-increments.ts`, `apps/api/src/modules/dashboard/energy-read.service.ts`, `apps/worker/src/jobs/refresh-energy-summary.job.ts`, `apps/api/test/platform/rollup.test.ts`; Modify `packages/domain/src/index.ts`, `apps/api/src/modules/dashboard/dashboard.service.ts`, `dashboard.module.ts`, `apps/api/src/modules/telemetry/mqtt-ingestion.service.ts`, `apps/api/src/scripts/db-migrate.ts`, `apps/worker/src/app.module.ts`, `apps/worker/package.json`, `infra/docker/.env.staging.example`.

**Interfaces:** `deriveIncrement(previous:{at:string,kwh:number}|null,current:{at:string,kwh:number}):{kwh:number|null,quality:'complete'|'missing'|'reset'}`; `EnergyReadService.daily(siteIds:string[],from:string,to:string):Promise<Array<{siteId:string,day:string,kwh:number|null,quality:string}>>`. `energy_daily` keyeddevice/dayAsiaBangkokเก็บopening/closing/time/count/quality/version; `energy_dirty_days` keyeddevice/dayเป็นdurableupsertในingestiontransactionเดียวกัน. workerclaimdirtyrows, recomputeandreplaceidempotently.

- [x] เขียนrolluptest:100→125=25ไม่ใช่225; reset125→2ให้resetไม่ติดลบ; missingbaselineให้unknown; latenewsampleแก้currentdayและsuccessorday; duplicatesไม่เพิ่มยอด; SQLreadscopedtenantไม่มีleak.
- [x] รัน`bash scripts/ci/platform-check.sh rollup` → FAIL; implementpurecalculation+dirtydayworker, markaffecteddayและวันถัดไปเมื่อlatearrivalและmappingcorrection; ไม่แก้issuedsnapshotsและส่งfinancialimpactnoticeเข้าF2.
- [x] สำรวจactualindexes/EXPLAINแล้วสร้างcandidate `(site_id,source_time DESC)` และ `(device_id,source_time DESC)` เฉพาะตัวที่ช่วยworkload; ทดสอบwritecost. Migrationอยู่ในtransactionตามrunnerเดิมจึงไม่ใส่CREATE INDEX CONCURRENTLYโดยตรง; bigexistingDBใช้maintenance/nontransactionalindexedprocedureที่reviewและcheckpointได้ก่อนเปิดfeature.
- [x] Backfillbatchday/deviceพร้อมcheckpointและcompareกับreferencefixtures; เปิด`ENERGY_READ_MODEL_ENABLED`เมื่อcoverageครบช่วงที่อ่าน มิฉะนั้นแสดงpreparingแทนอ่านrawมหาศาลเงียบๆ. รันrollup PASSและqueryplan/B2ก่อนclaim2วินาที; ต้องแสดงwatermark/qualityเมื่อsummaryล่าช้า.
- [x] StageFilesข้างบนและcommit `perf: serve verified daily energy read models`.

### - [ ] พิสูจน์โหลดเต็มขนาดและเกณฑ์ 2 วินาทีใน B2 ก่อนเปิดใช้ในขนาดเป้าหมาย; flags ยังปิดเป็นค่าเริ่มต้น.

Task Q4: Durable jobs และ async reports

**Files:** Create `infra/migrations/021_platform_jobs.sql`, `packages/api-contracts/src/jobs.ts`, `apps/api/src/modules/reports/report-job.service.ts`, `apps/worker/src/jobs/job-store.ts`, `report-export.job.ts`, `apps/api/src/modules/jobs/jobs.controller.ts`, `apps/api/src/modules/jobs/jobs.module.ts`, `apps/api/src/modules/jobs/job-access.service.ts`, `apps/api/test/platform/reports.test.ts`; Modify `apps/api/src/app.module.ts`, `packages/api-contracts/src/index.ts`, `apps/api/src/modules/reports/reports.controller.ts`, `reports.module.ts`, `apps/api/src/scripts/db-migrate.ts`, `apps/worker/src/app.module.ts`, `apps/worker/package.json`, `infra/docker/docker-compose.staging.yml`, `infra/ci/compose.yml`.

**Interfaces:** `JobStatus='queued'|'running'|'ready'|'failed'|'cancelled'`; `JobRecord={id:string,kind:'report'|'archive'|'restore',status:JobStatus,progress:number|null,rowCount:number|null,snapshotAt:string|null,createdBy:string|null,attempt:number,errorCode:string|null,objectKey:string|null}`. JobStore`claim(kind,workerId,leaseSeconds=60)`, `heartbeat(id,workerId)`, `complete(id,workerId,objectKey)`, `fail(id,workerId,errorCode)`ใช้SKIPLOCKED+lease+ownerCAS. DBrowคือsourceoftruth ไม่ใช้processMap. POST`/v1/reports`→202`{jobId,status:'queued'}`; GET`/v1/jobs?cursor=&limit=25` คืน scoped paginated jobs; GET`/v1/jobs/:id`; POST`/v1/jobs/:id/cancel`; POST`/v1/jobs/:id/retry` สร้าง attempt ใหม่เฉพาะ failed jobs ตาม quota; GET`/v1/jobs/:id/download` ตรวจสิทธิ์ปัจจุบันก่อนส่ง artifact. Idempotency-Key เก็บ unique(createdBy,key) และ normalized payload hash ใน migration021; payload เดิมได้ job เดิม ต่าง payload คืน409. progress/rowCount/snapshotAt ที่ยังไม่ทราบให้เป็น null ไม่สร้างค่าประมาณเอง.

- [x] เขียนreportsfixtureเกิน100000แถว→202และได้ครบตามfilter; workerrestartหลังuploadก่อนcompleteไม่สร้างartifactคนละชุด; roleถอนก่อนdownload403; tenantอื่นjob403; CSVformulaยังneutralized; cancellationไม่เผยpartialfile.
- [x] รัน`bash scripts/ci/platform-check.sh reports` → FAIL; persistjob+normalizedscopeในtransactionก่อน202, workerแยกpool/process; SQL extract แบบ keyset batch10000 บน connection เดียวใน BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; บันทึก snapshotAt ตอนเริ่ม execution ไม่อ้างว่าเป็นเวลา enqueue; จำกัดเวลา extract และ rollback เมื่อยกเลิก/หมด lease.
- [x] streamCSVไปS3multipartตามdeterministicjobobjectkey, checksum/rowcountmanifest, abortmultipartเมื่อfail; retry เพิ่มได้3ครั้งหลัง attempt แรก (รวม4 attempts), backoff10/60/300s, leaseheartbeat15s. Recheckcurrentpermissionsก่อนเริ่มและก่อนdownload; จำกัด active report2งานรวมทุก worker ด้วย DB lease; ต่อ user มี queued/running ได้1งาน และ queue รวมไม่เกิน1000; ตรวจ quota ใน transaction คืน429เมื่อเกิน.
- [x] รันreports PASSรวมstorage503และleaseexpiry; ready สร้าง in-app notification โดย migration021 เพิ่ม dedupe key และ unique(jobId,recipient); complete transaction บันทึก notification/outbox พร้อมสถานะ ready. เพิ่มworkerDB/storageenvจริงในComposeโดยไม่ให้Cloudflaretoken. LegacyCSVในDBยังdownloadได้ตามscope; ใหม่ไม่เพิ่มbyteaไฟล์ใหญ่.
- [x] StageFilesข้างบนและcommit `feat: generate large reports with durable workers and stored artifacts`.

ข้อจำกัด Q4: UI งานเบื้องหลังยังรอ U2; legacy ที่ไม่มีหลักฐาน scope คืน403เมื่อสิทธิ์ปัจจุบันไม่ครอบคลุม; retry ผ่าน POST ตามผู้ใช้สั่ง; orphan/incomplete multipart ต้องมี storage lifecycle ภายหลัง; functional fixture ไม่ใช่ capacity proof.
