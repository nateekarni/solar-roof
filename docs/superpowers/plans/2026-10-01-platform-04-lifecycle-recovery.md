# Platform 04 — Data Lifecycle and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เก็บประวัติมิเตอร์อย่างตรวจสอบได้ และพิสูจน์ว่ากู้ข้อมูลและระบบได้ภายในเวลาที่ตกลง

**Architecture:** ใช้ durable jobs จาก Q4 สำหรับ archive/restore และเก็บไฟล์พร้อม manifest นอกเครื่องบริษัท ใช้ physical backup กับ WAL สำหรับกู้ฐานข้อมูล แยกจาก archive ที่ใช้ค้นประวัติ และทดสอบบนระบบแยกก่อนเปิดนโยบายลบข้อมูล

**Tech Stack:** PostgreSQL16/TimescaleDB2.18.2, worker TypeScript, S3-compatible storage, pgBackRest, Coolify managed containers, node:test/tsx

**Spec:** [Assessment](../../system-assessment-2026-10-01.md), [ADR0011](../../adr/0011-tiered-telemetry-history-and-recovery.md), [แผนหลัก](2026-10-01-platform-improvement.md)

## Global Constraints

- ขนาดประเมิน 100 โรงเรียน / 1,000 มิเตอร์ / ส่งทุก 1 นาที / 50 ผู้ใช้พร้อมกัน; หน้าทั่วไปภายใน 2 วินาที
- raw ล่าสุด 90 วันอยู่ในฐานหลัก; รายละเอียดเก่าเรียกคืนภายใน 1 ชั่วโมง; summary และหลักฐานออกบิลยังตรวจสอบได้
- กู้ระบบภายใน 4 ชั่วโมง และจุดกู้ฐานย้อนหลังไม่เกิน 15 นาที; Gateway replay ไม่แทน backup ของข้อมูลผู้ใช้และการเงิน
- อายุเก็บ archive/summary และขนาดคำขอ restore ยังต้องตกลง; default เก็บต่อและปิดการลบ ห้ามกำหนดอายุลบเอง
- ไม่ทดสอบล้างข้อมูลบน staging บริษัท; deployment ผ่าน Coolify UI ด้วย immutable images และ named volumes ไม่ให้ผู้ใช้ SSH
- Node24.20.0/pnpm11.24.0; ไม่แก้ checksum ของ migration เดิม; เครื่อง pilot 2CPU/4GB ต้องวัดก่อนเพิ่มงานเบื้องหลัง

## Review Focus

1. archive เสร็จบางส่วนหรือ checksum ผิดต้องไม่อนุญาตลบ raw — D1
2. ข้อมูลย้อนหลังเข้าหลัง archive แล้วต้องไม่หายจากการค้นคืน — D1
3. Timescale chunk มีหลายโรงเรียน ห้ามลบทั้ง chunk เพราะ archive โรงเรียนเดียวสำเร็จ — D1
4. backup บนเครื่องเดียวกันใช้กู้เมื่อเสียทั้งเครื่องไม่ได้ — D2
5. กู้ DB ได้แต่ไฟล์บิล/secret/config หายยังไม่ถือว่ากู้ระบบสำเร็จ — D2/D3

### Task D1: Archive catalog, verified retention และ scoped restore

**Files:** Create `infra/migrations/022_archive_catalog.sql`, `packages/api-contracts/src/history.ts`, `apps/worker/src/jobs/archive-telemetry.job.ts`, `apps/worker/src/jobs/restore-history.job.ts`, `apps/api/src/modules/history/history.controller.ts`, `history.service.ts`, `history.module.ts`, `apps/api/test/platform/archive.test.ts`, `apps/web/features/reports/history-request-dialog.tsx`; Modify `packages/api-contracts/src/index.ts`, `apps/api/src/app.module.ts`, `apps/api/src/scripts/db-migrate.ts`, `apps/worker/src/app.module.ts`, `apps/web/features/shared/operation-page.tsx`, `infra/docker/docker-compose.staging.yml`, `infra/docker/.env.staging.example`.

**Interfaces:** Consumes Q4 `JobRecord`, `JobStore` and authorization/download policy; U2 `useJobStatus`. Produces `ArchiveManifest={id:string,generation:number,siteId:string,from:string,to:string,rows:number,sha256:string,schemaVersion:number,objectKey:string,verifiedAt:string|null}` and `HistoryService.requestRestore(actorId:string,siteId:string,from:string,to:string):Promise<{jobId:string,status:'queued'}>`. POST `/v1/history/restore` accepts dates/site and idempotency key; job status/download use Q4 endpoints. Archive manifest catalog records mapping versions and immutable source identifiers with each generation.

- [ ] Write archive tests: `assert.equal(deletedRows,0)` for missing object/checksum mismatch/unpreserved billing evidence; two sites share a chunk and only one archived → chunk remains; late sample produces a new generation and restore contains it once; another school gets 403; crash after upload can resume without losing the verified generation.
- [ ] Run `bash scripts/ci/platform-check.sh archive` → FAIL, then implement streamed compressed JSONL objects with manifest and independent download/checksum verification. Publish manifest transactionally only after object verification; append generations for late data and deduplicate restore by immutable source identity. Never overwrite a verified generation in place.
- [ ] Add deletion eligibility checks: older than 90 days, verified archive covers every affected row, summary coverage complete, financial boundary readings/mapping versions/issued snapshots independently preserved, no legal/operational hold. Keep `RAW_RETENTION_ENABLED=false` until all checks and restore drill pass. Whole-chunk deletion requires coverage for all tenants/rows in that chunk; otherwise retain it. No automatic deletion of archive or summaries without an approved policy.
- [ ] Restore into a scoped downloadable artifact using Q4 leases and U2 status, not the live ingestion table. Record request start, completion, row count and checksum. Run archive PASS with denied scope, corrupted object, duplicate replay and slow storage; publish measured restoration within 3600 seconds for the agreed maximum request envelope before claiming the target is met. Record that envelope as a release prerequisite, not an unstated limitation.
- [ ] Stage task files and commit `feat: archive telemetry with verified manifests and scoped restoration`.

### Task D2: Off-host backup และ point-in-time recovery

**Files:** Create `infra/docker/postgres-backup/Dockerfile`, `entrypoint.sh`, `backup-scheduler.sh`, `restore.sh`, `infra/ci/recovery-compose.yml`, `scripts/ci/recovery-drill.sh`, `apps/api/test/platform/recovery.test.ts`, `docs/runbooks/disaster-recovery.md`; Modify `infra/docker/docker-compose.staging.yml`, `infra/docker/.env.staging.example`, `.github/workflows/ci-staging.yml`.

**Interfaces:** Managed database image preserves PostgreSQL16 and Timescale2.18.2 compatibility and adds a pinned pgBackRest build validated in CI. `bash scripts/ci/recovery-drill.sh --profile fixture|target` starts only disposable resources and emits `test/artifacts/recovery-result.json` with `revision,backupId,targetTime,latestRestoredCommitTime,rpoSeconds,rtoSeconds,artifactChecksPassed`. Production restore is a separate Coolify resource/volume configured with `RESTORE_TARGET_TIME`; refuse a nonempty destination volume. Backup credentials and encryption key are separate from application credentials.

- [ ] Write recovery assertions: known committed marker before target exists, marker after target does not; `assert.ok(rpoSeconds<=900)` and `assert.ok(rtoSeconds<=14400)`; original invoice file checksum matches; all roles retain expected scope. A missing WAL segment or inaccessible off-host repository must make the drill FAIL rather than silently fall back to an older backup.
- [ ] Run `bash scripts/ci/platform-check.sh recovery` → FAIL. Build pgBackRest into the compatible database image with scheduler startup/shutdown and health checks; pin tool version and source/image digest in the Dockerfile after a compatibility smoke test. Continuous WAL archiving plus weekly full/daily differential backups are the initial schedule. Start with `archive_timeout=300s`; monitor archive lag, failed archives and disk growth. Never configure queue overflow to discard WAL.
- [ ] Configure encrypted off-host S3 repository through Coolify environment settings, restrict bucket access and keep encryption keys recoverable outside the failed host. Set automatic expiration disabled until backup retention is approved. Back up original document objects and encrypted deployment configuration/credential references as well; MinIO on the same server alone is insufficient. CI uses isolated storage fixtures; actual off-host destination and credentials are deployment prerequisites.
- [ ] Run recovery PASS and perform the target drill on an independent host using the same image digest/extension version. Restore the whole physical cluster to a new volume, recover document objects/config, then verify login, scopes, financial evidence, dashboard, MQTT reconnect/replay and deduplication. Measure RTO from declared outage through usable service, not just database startup; measure RPO before Gateway replay so replay cannot mask backup loss. Record backup size, transfer rate and retained recovery chain.
- [ ] Stage task files and commit `feat: manage off-host backups and verify point-in-time recovery`. Publish the sixth managed image digest through CI without deploying it automatically.

### Task D3: Readiness evidence, alerts และ staged rollout

**Files:** Create `apps/api/src/common/observability/platform-readiness.service.ts`, `apps/api/test/platform/readiness.test.ts`, `scripts/ci/platform-release-check.sh`, `docs/runbooks/platform-rollout.md`, `docs/performance/platform-release-evidence.md`; Modify `apps/api/src/app.module.ts`, `scripts/ci/platform-check.sh`, `infra/docker/.env.staging.example`, `.github/workflows/ci-staging.yml`.

**Interfaces:** `PlatformReadinessService.evaluate():Promise<{monitoringReady:boolean,financialReady:boolean,retentionReady:boolean,recoveryVerified:boolean,blockers:string[]}>` consumes persisted test/deployment evidence with revision and configuration fingerprint; returns no credentials. `bash scripts/ci/platform-release-check.sh --evidence <file>` validates evidence schema, matching image/configuration, freshness and gate results; missing evidence means not verified. Readiness tests join `all-fast` only after implemented.

- [ ] Write readiness tests: expired/mismatched evidence cannot mark verified; flag true without financial approval cannot enable writes; stale summary is visible; WAL lag 10 minutes or failed archive produces an alert event; duplicate failure events deduplicate; recovery without document/config verification fails. Use a local alert receiver, not real recipient messaging.
- [ ] Run `bash scripts/ci/platform-check.sh readiness` → FAIL; implement evidence evaluation and alert configuration. Initial alerts: WAL lag ≥600s, backup overdue >26h for daily schedule, job lease retries exhausted, raw disk use ≥80%, sustained ingestion rejection or ACK backlog. Record thresholds as tunable deployment settings and verify receiver connectivity before enabling notifications.
- [ ] Write click-by-click Coolify rollout: select approved image digests → set secrets/flags → confirm named volumes and off-host destinations → run migration resource → deploy → inspect health/logs → run synthetic scoped smoke → verify Gateway replay. Record pre-deploy digest; rollback compatible images without dropping volumes or reversing data migrations. Keep financial writes and retention off until their own gates pass.
- [ ] Run readiness PASS, all implemented fast suites and existing integration/TLS smoke. Attach B2 capacity and D1/D2 restore evidence, outstanding gates and feature flags. Rehearse outage and rollback on isolated resources; document who declares outage, restores, verifies and changes DNS. Do not mark full production readiness from CI alone.
- [ ] Stage task files and commit `docs: establish evidence-based platform release and recovery gates`.

## Primary references

The backup design uses physical backups plus WAL for point-in-time recovery; retained backup files and the required WAL chain must both be available. See [PostgreSQL16 continuous archiving](https://www.postgresql.org/docs/16/continuous-archiving.html). pgBackRest provides full/differential backups, encrypted repositories and S3-compatible storage; confirm the exact packaged build against the database image during D2. See [pgBackRest user guide](https://pgbackrest.org/user-guide.html). These references support the proposed mechanism, not proof that this repository meets the recovery targets.
