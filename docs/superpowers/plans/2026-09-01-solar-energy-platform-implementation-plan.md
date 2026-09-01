# Solar Energy Management Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้าง Phase 1 Website สำหรับบริหาร Solar Energy, Gateway/Telemetry, Contracts, Billing และเอกสารการเงินของหลายโรงเรียน พร้อม API/domain model ที่ใช้ต่อกับ Flutter Mobile ใน Phase 2 ได้

**Architecture:** ใช้ monorepo แบบ modular monolith แยก process เป็น Next.js Web, NestJS API, NestJS Worker และ package กลางสำหรับ domain/contracts โดยใช้ PostgreSQL + TimescaleDB, Redis queue, MQTT connector และ S3-compatible object storage การเชื่อมต่อทุกโมดูลผ่าน application service/event และ API contract ที่ตรวจสอบได้

**Tech Stack:** Next.js + TypeScript, NestJS, PostgreSQL + TimescaleDB, Prisma, Redis + BullMQ, MQTT.js, OpenAPI, Zod/class-validator, shadcn/ui, Tailwind CSS, Lucide, TanStack Query/Table, Recharts/ECharts, MapLibre, Vitest/Jest, Playwright, Docker Compose

**Spec:** [2026-09-01-solar-energy-management-platform-design.md](../specs/2026-09-01-solar-energy-management-platform-design.md)

## Global Constraints

- มี Role หลักเพียง `owner`, `admin`, `school_user`; owner เห็นข้อมูลทั้งบริษัท, admin จำกัดตาม assignment, school_user ผูกได้เพียงโรงเรียนเดียว
- Phase 1 ต้องครอบคลุม dashboard, school/site, gateway/device/register, telemetry, alarms, users/RBAC, contracts, billing, documents, reports, audit และ settings
- Default polling interval คือ 60 วินาที; raw telemetry retention 2 ปี; aggregate retention 7 ปี
- Billing ใช้ cumulative `Total Energy` ของ `Billing Meter` และคำนวณ `closing - opening` ที่ cutoff 23:59 `Asia/Bangkok`
- ใช้ tolerance 15 นาทีสำหรับ closing reading; `invalid` ห้าม finalize; `partial`/`estimated` ต้องมีผู้อนุมัติและเหตุผล
- Invoice/Receipt ที่ finalize แล้ว immutable; ใช้ cancellation หรือ credit/debit adjustment แทนการแก้ทับ
- ค่า rate เป็น versioned ต่อ contract และ fixed rate/kWh ใน Phase 1; เตรียม model สำหรับ TOU/ขั้นบันได
- ใช้ server-side RBAC, MFA owner/admin, TLS/MQTT ACL, private object storage, signed URL และ append-only audit log
- UI ใช้ภาษาไทยเป็นค่าเริ่มต้นและใช้ translation keys/interpolation ตั้งแต่แรก
- เป้าหมาย production คือ availability 99.5%, RPO 24 ชั่วโมง และ RTO 4 ชั่วโมง

## Repository Structure

สร้างโครงสร้างเริ่มต้นดังนี้:

```text
apps/
  web/                 # Next.js routes, layouts, feature UI
  api/                 # NestJS HTTP API
  worker/              # NestJS jobs and event consumers
packages/
  domain/              # domain types, policies, calculation functions
  api-contracts/       # OpenAPI-generated/shared DTOs
  ui/                  # shared shadcn/ui primitives and design tokens
  i18n/                # Thai dictionary and locale helpers
  connectors/          # EnergyConnector, simulator, import, Modbus TCP
infra/
  docker/              # local services and production container definitions
  migrations/          # database migration support
  observability/       # dashboards, alerts, log/metric conventions
tests/
  e2e/                 # Playwright journeys
  fixtures/            # deterministic schools, devices, readings, documents
docs/
  api/                 # OpenAPI and runbooks
```

## Execution Order and Milestones

ทำตามลำดับนี้เพื่อให้แต่ละช่วงใช้งานและทดสอบได้:

1. Foundation, repository, local infrastructure และ authentication
2. Organization/school/site/user scope
3. Gateway/device/register mapping และ connector abstraction
4. Telemetry ingestion, quality, aggregation และ alarms
5. Contract/rate และ monthly billing engine
6. Documents, payments, receipts และ reports
7. Website dashboard และทุก operational screens
8. Security hardening, observability, E2E, backup/restore และ staging release
9. Phase 2 Flutter ใช้ API ที่ล็อกไว้จาก Phase 1

---

### Task 1: สร้าง monorepo และ local infrastructure

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.env.example`
- Create: `apps/web/package.json`, `apps/api/package.json`, `apps/worker/package.json`
- Create: `packages/domain/package.json`, `packages/api-contracts/package.json`, `packages/connectors/package.json`, `packages/i18n/package.json`, `packages/ui/package.json`
- Create: `infra/docker/compose.yml`, `infra/docker/init-timescaledb.sql`
- Create: `README.md`, `docs/runbooks/local-development.md`

**Interfaces:**
- Produces workspace scripts: `pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm db:migrate`
- Produces local services: PostgreSQL/TimescaleDB, Redis, MQTT broker, S3-compatible storage

- [ ] **Step 1: Create workspace manifests and package boundaries.** Pin Node.js LTS, pnpm and TypeScript versions in `package.json` and `.nvmrc`.
- [ ] **Step 2: Add Docker Compose services.** Expose PostgreSQL, Redis, MQTT and object storage only on local development ports; add healthchecks.
- [ ] **Step 3: Add environment validation.** Implement `packages/domain/src/config/env.ts` using a schema that fails startup when database, JWT, MQTT or storage secrets are absent.
- [ ] **Step 4: Add health endpoints/scripts.** Web, API and Worker must report dependency health without exposing secrets.
- [ ] **Step 5: Run the foundation checks.** Run `pnpm install`, `pnpm lint`, `pnpm test`, `docker compose -f infra/docker/compose.yml config`; expected result is success.
- [ ] **Step 6: Commit.** `git add . && git commit -m "chore: bootstrap solar energy platform monorepo"`

### Task 2: Database schema, migrations and audit primitives

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/`
- Create: `packages/domain/src/audit/audit-event.ts`, `packages/domain/src/audit/audit-policy.ts`
- Create: `apps/api/src/common/audit/audit.service.ts`, `apps/api/src/common/database/database.module.ts`
- Test: `apps/api/src/common/audit/audit.service.spec.ts`

**Interfaces:**
- `AuditService.append(input: AuditInput): Promise<AuditEvent>`
- Tables/entities: `User`, `School`, `Site`, `AdminAssignment`, `Gateway`, `Device`, `RegisterMappingVersion`, `TelemetryRaw`, `TelemetryAggregate`, `BillingMeter`, `Contract`, `RateVersion`, `BillingCycle`, `BillingStatement`, `Invoice`, `Payment`, `Receipt`, `Adjustment`, `Alarm`, `NotificationDelivery`, `AuditEvent`

- [ ] **Step 1: Write audit tests.** Verify actor/action/entity/before-after/reason/correlation fields are persisted and audit events cannot be updated through the service.
- [ ] **Step 2: Write the relational schema.** Add UUID identifiers, timestamps, status enums, foreign keys, unique constraints and indexes for school scope, gateway last-seen, telemetry time and document series.
- [ ] **Step 3: Add TimescaleDB migration.** Convert `TelemetryRaw` to a hypertable on `sourceTime`, add retention policy metadata without enabling destructive deletion automatically.
- [ ] **Step 4: Implement audit service.** Use append-only insert transactions and reject update/delete operations at service level.
- [ ] **Step 5: Run migration and tests.** Run `pnpm db:migrate` and `pnpm test -- audit.service.spec.ts`; expected result is PASS.
- [ ] **Step 6: Commit.** `git add apps/api/prisma packages/domain apps/api/src/common && git commit -m "feat: add core schema and append-only audit"`

### Task 3: Authentication, RBAC and school scope

**Files:**
- Create: `apps/api/src/modules/identity/identity.module.ts`
- Create: `apps/api/src/modules/identity/auth.service.ts`, `users.service.ts`, `invitation.service.ts`, `mfa.service.ts`
- Create: `apps/api/src/common/auth/auth.guard.ts`, `roles.guard.ts`, `school-scope.guard.ts`
- Create: `apps/web/app/(auth)/login/page.tsx`, `apps/web/app/(auth)/accept-invitation/page.tsx`
- Create: `packages/domain/src/access/access-policy.ts`
- Test: `apps/api/src/modules/identity/*.spec.ts`, `apps/api/test/access-isolation.e2e-spec.ts`

**Interfaces:**
- `AccessPolicy.can(actor, action, resource): boolean`
- `InvitationService.create(input): Promise<Invitation>`
- `SchoolScopeGuard` injects resolved school/site IDs into request context

- [ ] **Step 1: Write policy tests.** Cover owner-all, admin-assigned-only, school_user-one-school-only, denied cross-school access and denied role escalation.
- [ ] **Step 2: Implement password/session auth.** Use short-lived access tokens, refresh-token rotation, password hashing and email verification; store only token hashes where persistence is needed.
- [ ] **Step 3: Implement invitation flow.** Generate single-use expiring invitation tokens and create one-school `school_user` membership on acceptance.
- [ ] **Step 4: Implement MFA.** Require MFA challenge for owner/admin and expose enrollment/recovery audit events.
- [ ] **Step 5: Add authorization guards to a protected test endpoint.** Verify authorization is enforced server-side even when UI navigation is bypassed.
- [ ] **Step 6: Run tests.** Run `pnpm test -- identity` and `pnpm test:e2e -- access-isolation`; expected result is PASS.
- [ ] **Step 7: Commit.** `git add apps/api apps/web packages/domain && git commit -m "feat: add authentication and scoped role access"`

### Task 4: School, Site, Gateway and Device management

**Files:**
- Create: `apps/api/src/modules/assets/assets.module.ts`
- Create: `apps/api/src/modules/assets/school.service.ts`, `site.service.ts`, `gateway.service.ts`, `device.service.ts`
- Create: `apps/api/src/modules/assets/assets.controller.ts`, `assets.dto.ts`
- Create: `apps/web/app/(dashboard)/schools/page.tsx`, `schools/[schoolId]/page.tsx`, `sites/[siteId]/page.tsx`
- Test: `apps/api/src/modules/assets/*.spec.ts`

**Interfaces:**
- `GatewayService.register(input): Promise<Gateway>`
- `GatewayService.getHealth(gatewayId): Promise<GatewayHealth>`
- `BillingMeterService.assign(siteId, meterId): Promise<BillingMeter>`

- [ ] **Step 1: Write service tests.** Cover school/site CRUD, admin assignment, one active Billing Meter policy and school-scoped reads.
- [ ] **Step 2: Implement APIs and constraints.** Reject duplicate serials, invalid school/site relationships and Billing Meter assignment outside the Site.
- [ ] **Step 3: Implement gateway credential references.** Store encrypted secret references, protocol/config metadata and last-seen status; never return secrets in DTOs.
- [ ] **Step 4: Build management pages.** Add list/detail/forms with loading, empty, validation, permission-denied and error states using shadcn/ui.
- [ ] **Step 5: Run unit/API tests.** Expected result is PASS with no cross-school records returned.
- [ ] **Step 6: Commit.** `git add apps/api apps/web && git commit -m "feat: add school site gateway and device management"`

### Task 5: Connector abstraction, simulator, import and Modbus TCP

**Files:**
- Create: `packages/connectors/src/energy-connector.ts`, `connector-config.ts`, `connector-health.ts`
- Create: `packages/connectors/src/simulator/simulator.connector.ts`, `file-import/file-import.connector.ts`, `modbus-tcp/modbus-tcp.connector.ts`
- Create: `apps/api/src/modules/connectors/connectors.module.ts`, `connectors.service.ts`, `connectors.controller.ts`
- Create: `apps/web/app/(dashboard)/gateways/[gatewayId]/connectors/page.tsx`
- Test: `packages/connectors/src/**/*.spec.ts`

**Interfaces:**
- `EnergyConnector.connect(config): Promise<void>`
- `EnergyConnector.read(requests): Promise<RegisterReadResult[]>`
- `EnergyConnector.health(): Promise<ConnectorHealth>`
- `ConnectorRegistry.resolve(type): EnergyConnector`

- [ ] **Step 1: Write decoding tests.** Cover signed/unsigned values, byte order, data types, scale, unit conversion and malformed payloads.
- [ ] **Step 2: Implement the connector interface and registry.** Keep connector packages independent from Billing and Telemetry persistence.
- [ ] **Step 3: Implement deterministic simulator.** Generate voltage/current/power/energy registers at configurable intervals with reproducible seed data.
- [ ] **Step 4: Implement CSV/JSON import.** Validate headers, timestamps, register values, source label and duplicate ingestion IDs.
- [ ] **Step 5: Implement generic Modbus TCP.** Read configured register ranges with timeout, retry, connection health and no plaintext credential logging.
- [ ] **Step 6: Add connector UI.** Allow owner/admin to test connection, start simulator/import and view health; block school_user configuration actions.
- [ ] **Step 7: Run connector tests.** Run `pnpm test --filter @solar/connectors`; expected result is PASS.
- [ ] **Step 8: Commit.** `git add packages/connectors apps/api apps/web && git commit -m "feat: add gateway connector abstraction and reference connectors"`

### Task 6: Register mapping, ingestion and data quality

**Files:**
- Create: `apps/api/src/modules/telemetry/telemetry.module.ts`
- Create: `apps/api/src/modules/telemetry/register-mapping.service.ts`, `ingestion.service.ts`, `quality.service.ts`
- Create: `apps/worker/src/jobs/poll-gateway.job.ts`, `ingest-telemetry.job.ts`
- Create: `packages/domain/src/telemetry/quality.ts`, `cumulative-energy.ts`
- Test: `packages/domain/src/telemetry/*.spec.ts`, `apps/api/src/modules/telemetry/*.spec.ts`

**Interfaces:**
- `RegisterMappingService.publishVersion(input): Promise<RegisterMappingVersion>`
- `TelemetryIngestionService.ingest(batch): Promise<IngestionResult>`
- `QualityService.evaluate(sample, rule): QualityResult`
- `CumulativeEnergy.calculate(opening, closing): EnergyDiffResult`

- [ ] **Step 1: Write domain tests.** Cover 60-second default, normalization to canonical units, duplicate messages, timestamp drift, missing data, invalid range, reset and negative diff.
- [ ] **Step 2: Implement versioned mappings.** Support address/register, data type, signed/unsigned, byte order, scale, unit, polling interval, quality rule and semantic field.
- [ ] **Step 3: Implement raw ingestion.** Persist raw payload, source/received timestamps, mapping version, normalized value, quality and idempotency key without update-in-place.
- [ ] **Step 4: Implement poll and ingest jobs.** Queue polling per Gateway, retry transient failures, record dead-letter state and emit `TelemetryReceived`.
- [ ] **Step 5: Implement mapping editor/test-read API.** Preview decoded values before publishing a mapping version.
- [ ] **Step 6: Run telemetry tests.** Expected result is PASS, including replaying the same message without duplicate raw rows.
- [ ] **Step 7: Commit.** `git add packages/domain apps/api apps/worker && git commit -m "feat: ingest versioned telemetry with quality checks"`

### Task 7: Aggregation, gateway health and alarms

**Files:**
- Create: `apps/worker/src/jobs/aggregate-telemetry.job.ts`, `gateway-health.job.ts`, `alarm-evaluation.job.ts`
- Create: `apps/api/src/modules/alarms/alarms.module.ts`, `alarm.service.ts`, `alarm-rules.service.ts`
- Create: `packages/domain/src/telemetry/aggregation.ts`, `alarm/alarm-policy.ts`
- Create: `apps/web/app/(dashboard)/telemetry/page.tsx`, `alarms/page.tsx`
- Test: `packages/domain/src/telemetry/aggregation.spec.ts`, `apps/api/src/modules/alarms/*.spec.ts`

**Interfaces:**
- `AggregationService.aggregate(window): Promise<TelemetryAggregate[]>`
- `AlarmService.evaluate(input): Promise<AlarmEvaluation>`
- `GatewayHealthService.status(lastSeen, expectedInterval): GatewayStatus`

- [ ] **Step 1: Write tests.** Cover 15-minute/hour/day/month buckets, quality summary, late data, online/degraded/offline thresholds and alarm deduplication.
- [ ] **Step 2: Implement aggregate jobs.** Produce deterministic aggregates from raw data and mark partial/estimated quality without mutating raw rows.
- [ ] **Step 3: Implement health and alarm rules.** Add offline/no telemetry, invalid quality, abnormal electrical values, communication and mapping errors.
- [ ] **Step 4: Implement alarm acknowledgement/history.** Record actor, timestamp, reason and notification delivery result.
- [ ] **Step 5: Build telemetry/alarm screens.** Add charts/tables, quality filters, last-seen state, severity, acknowledgement and export request controls.
- [ ] **Step 6: Run tests.** Expected result is PASS and duplicate alarm events do not create duplicate open alarms.
- [ ] **Step 7: Commit.** `git add apps/api apps/worker apps/web packages/domain && git commit -m "feat: aggregate energy data and manage alarms"`

### Task 8: Contracts, rates and monthly billing engine

**Files:**
- Create: `apps/api/src/modules/billing/billing.module.ts`
- Create: `apps/api/src/modules/billing/contract.service.ts`, `rate.service.ts`, `billing-cycle.service.ts`, `billing-calculation.service.ts`
- Create: `apps/worker/src/jobs/close-billing-cycle.job.ts`
- Create: `packages/domain/src/billing/cumulative-diff.ts`, `billing-lifecycle.ts`, `rate-calculator.ts`
- Test: `packages/domain/src/billing/*.spec.ts`, `apps/api/src/modules/billing/*.spec.ts`

**Interfaces:**
- `BillingCalculationService.preview(input): Promise<BillingPreview>`
- `BillingCycleService.close(cycleKey): Promise<BillingStatement>`
- `ContractService.validateNoOverlap(siteId, period): Promise<void>`
- `RateCalculator.calculate(kwh, rateVersion): Money`

- [ ] **Step 1: Write calculation tests.** Cover opening/closing snapshots, 15-minute tolerance, no reading, negative diff, multi-meter sum, fixed rate, rounding and idempotent cycle key.
- [ ] **Step 2: Implement contract/rate versioning.** Enforce one active contract per Site and reject overlapping effective periods.
- [ ] **Step 3: Implement cutoff reader.** Resolve latest reading ≤ 23:59 `Asia/Bangkok`, store actual timestamp and target cutoff separately, and assign quality.
- [ ] **Step 4: Implement preview and approval workflow.** Store opening/closing/energy/rate/quality snapshots; require reason for partial/estimated approval.
- [ ] **Step 5: Implement worker close job.** Run at month-end, retry safely, emit `BillingCycleClosed`, and never create duplicate statements.
- [ ] **Step 6: Add owner/admin billing API.** Support review, approve, reject for correction, finalize and cancel with audit events.
- [ ] **Step 7: Run billing tests.** Expected result is PASS for rerun, late data, invalid data and cross-school authorization.
- [ ] **Step 8: Commit.** `git add apps/api apps/worker packages/domain && git commit -m "feat: add versioned contracts and monthly billing"`

### Task 9: Invoice, receipt, payment, files and reports

**Files:**
- Create: `apps/api/src/modules/documents/documents.module.ts`
- Create: `apps/api/src/modules/documents/document.service.ts`, `number-series.service.ts`, `pdf.service.ts`, `verification.service.ts`
- Create: `apps/api/src/modules/payments/payments.module.ts`, `payment.service.ts`, `receipt.service.ts`
- Create: `apps/api/src/modules/reports/reports.module.ts`, `report.service.ts`
- Create: `apps/worker/src/jobs/generate-document.job.ts`, `send-notification.job.ts`, `export-report.job.ts`
- Create: `apps/web/app/(dashboard)/billing/page.tsx`, `documents/page.tsx`, `documents/[documentId]/page.tsx`
- Test: `apps/api/src/modules/documents/*.spec.ts`, `apps/api/src/modules/payments/*.spec.ts`

**Interfaces:**
- `DocumentService.finalize(input): Promise<FinalDocument>`
- `NumberSeriesService.next(type, year): Promise<string>`
- `PaymentService.markPaid(input): Promise<Payment>`
- `ReceiptService.issueForPayment(paymentId): Promise<Receipt>`
- `VerificationService.verify(publicId, hash): Promise<VerificationResult>`

- [ ] **Step 1: Write lifecycle tests.** Verify numbers are allocated only at finalize, final documents are immutable, cancel/adjustment is auditable and payment paid emits exactly one receipt.
- [ ] **Step 2: Implement private file storage.** Add MIME/size validation, generated object keys, encryption configuration and expiring signed URLs.
- [ ] **Step 3: Implement PDF templates.** Create Thai Invoice/Receipt/Billing Statement templates with variable interpolation, company/school/rate/energy snapshots and QR verification URL.
- [ ] **Step 4: Implement payment flow.** Allow school_user evidence upload; allow owner/admin payment status changes; create receipt transactionally/idempotently.
- [ ] **Step 5: Implement CSV/XLSX/PDF report jobs.** Cover energy, device health, billing, payment and audit with server-side scope filtering.
- [ ] **Step 6: Build document/payment pages.** Add review/finalize, download/print, evidence and payment status history.
- [ ] **Step 7: Run tests.** Expected result is PASS, including verification after cancellation and signed URL expiry.
- [ ] **Step 8: Commit.** `git add apps/api apps/worker apps/web && git commit -m "feat: generate immutable financial documents and receipts"`

### Task 10: Next.js Website shell, dashboard and localization

**Files:**
- Create: `apps/web/app/layout.tsx`, `app/(dashboard)/layout.tsx`, `middleware.ts`
- Create: `packages/ui/src/`, `packages/i18n/src/th.ts`, `packages/i18n/src/locale.ts`
- Create: `apps/web/components/navigation/sidebar.tsx`, `topbar.tsx`, `permission-gate.tsx`
- Create: `apps/web/features/dashboard/`, `features/energy/`, `features/shared/`
- Test: `apps/web/**/*.test.tsx`, `apps/web/e2e/dashboard.spec.ts`

**Interfaces:**
- `useCurrentUser(): CurrentUser`
- `useDashboardSummary(filters): DashboardSummary`
- `t(key, variables): string`

- [ ] **Step 1: Write component/accessibility tests.** Cover role-based navigation, Thai fallback, keyboard navigation, contrast-safe status colors and responsive layout.
- [ ] **Step 2: Set up shadcn/ui design system.** Add tokens for dark navy/green/blue status colors, typography, cards, tables, dialogs, charts and Lucide icons.
- [ ] **Step 3: Implement i18n keys.** Keep all user-facing text in dictionaries with interpolation; provide Thai locale and fallback behavior for missing keys.
- [ ] **Step 4: Implement authenticated dashboard shell.** Add sidebar menus, breadcrumbs, profile/MFA state, notifications and permission-aware actions.
- [ ] **Step 5: Implement executive dashboard.** Add KPI cards, school map, production/consumption charts, revenue, alarms, payment overview and refresh/last-updated state based on the reference image.
- [ ] **Step 6: Implement shared data states.** Every screen must provide loading, empty, partial-quality, offline, error and permission-denied states.
- [ ] **Step 7: Run Web tests.** Run `pnpm test --filter web` and `pnpm e2e -- dashboard`; expected result is PASS.
- [ ] **Step 8: Commit.** `git add apps/web packages/ui packages/i18n && git commit -m "feat: add Thai localized responsive web dashboard shell"`

### Task 11: User, contract, settings, audit and notification screens

**Files:**
- Create: `apps/web/app/(dashboard)/users/page.tsx`, `contracts/page.tsx`, `settings/page.tsx`, `audit/page.tsx`, `notifications/page.tsx`
- Create: `apps/web/features/users/`, `features/contracts/`, `features/settings/`, `features/audit/`
- Modify: `apps/web/features/shared/export-button.tsx`
- Test: `apps/web/e2e/operations.spec.ts`

**Interfaces:**
- `useUsers(filters): UserList`
- `useContract(contractId): ContractDetail`
- `useAuditEvents(filters): AuditEventPage`

- [ ] **Step 1: Write E2E acceptance flows.** Cover invite, deactivate, assignment, contract attachment, rate effective date, mapping/audit visibility and notification preferences.
- [ ] **Step 2: Build user screens.** Enforce one-school school_user rule in UI while preserving server-side enforcement.
- [ ] **Step 3: Build contract/rate screens.** Show overlap validation, versions, signer, attachments and effective periods; prevent editing finalized financial snapshots.
- [ ] **Step 4: Build settings/audit screens.** Add document series, retention display, locale, notification templates, audit filters and export.
- [ ] **Step 5: Build notification center.** Display alarm/document/payment notifications and email delivery status to permitted users.
- [ ] **Step 6: Run E2E tests.** Expected result is PASS for owner, admin and school_user journeys.
- [ ] **Step 7: Commit.** `git add apps/web && git commit -m "feat: add operational management and audit screens"`

### Task 12: API contract, observability and production readiness

**Files:**
- Create: `apps/api/src/openapi/openapi.ts`, `docs/api/openapi.json`
- Create: `infra/observability/metrics.md`, `infra/observability/alerts.yml`, `docs/runbooks/incident-response.md`, `docs/runbooks/billing-reconciliation.md`, `docs/runbooks/backup-restore.md`
- Create: `infra/docker/Dockerfile.web`, `Dockerfile.api`, `Dockerfile.worker`
- Create: `tests/e2e/full-billing-journey.spec.ts`, `tests/e2e/security-isolation.spec.ts`
- Modify: `README.md`, `.env.example`

**Interfaces:**
- OpenAPI is the source contract consumed by Web and future Flutter clients
- Health metrics: `connector_last_seen`, `telemetry_ingest_lag_seconds`, `aggregate_job_lag_seconds`, `billing_job_status`, `document_generation_failures`, `email_delivery_failures`

- [ ] **Step 1: Write full E2E tests.** Cover invitation → simulator → mapping → telemetry → aggregate → month close → review → invoice → paid → receipt → verify/download.
- [ ] **Step 2: Add security E2E tests.** Attempt cross-school reads, admin escalation, signed URL reuse after expiry, invalid upload and unauthenticated access; each must be rejected.
- [ ] **Step 3: Generate and validate OpenAPI.** Include auth, pagination, filters, error envelope, idempotency headers and webhook/event documentation.
- [ ] **Step 4: Add structured observability.** Emit JSON logs with correlation ID, metrics for every worker and traces across ingestion/billing/document jobs.
- [ ] **Step 5: Add backup/restore automation.** Document daily PostgreSQL/object-storage backups, retention, restore verification, RPO/RTO measurement and operator ownership.
- [ ] **Step 6: Build production containers.** Use non-root runtime, locked dependencies, healthchecks, secret injection and separate Web/API/Worker processes.
- [ ] **Step 7: Run release gates.** Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build` and a clean Docker Compose smoke test; all must pass.
- [ ] **Step 8: Commit.** `git add . && git commit -m "chore: harden platform for staging release"`

### Task 13: Phase 2 Flutter Mobile App

**Files:**
- Create: `apps/mobile/pubspec.yaml`, `apps/mobile/lib/`
- Create: `apps/mobile/lib/core/api/`, `auth/`, `i18n/`, `features/energy/`, `features/devices/`, `features/documents/`, `features/notifications/`
- Create: `apps/mobile/test/`, `apps/mobile/integration_test/`

**Interfaces:**
- Consumes the versioned OpenAPI contract from Task 12
- Targets `school_user` and one-school scope; no duplicate admin configuration workflow

- [ ] **Step 1: Generate typed API client.** Use the committed OpenAPI schema and fail CI when generated client is stale.
- [ ] **Step 2: Implement authentication and secure storage.** Add email verification, token refresh, logout and device session revocation.
- [ ] **Step 3: Implement energy flow.** Show production, consumption, Total Energy, last update and quality/offline states following the mobile reference image.
- [ ] **Step 4: Implement devices/alarms/documents.** Add status, alarms, invoice/receipt viewing, signed downloads and payment evidence upload.
- [ ] **Step 5: Add Thai localization and accessibility.** Support Thai first, scalable text and semantic labels.
- [ ] **Step 6: Run Flutter tests and integration tests.** Expected result is PASS against simulator-backed staging API.
- [ ] **Step 7: Commit.** `git add apps/mobile && git commit -m "feat: add school user Flutter mobile app"`

## Verification Checklist Before Claiming Completion

- [ ] All Phase 1 domains have working API, UI, authorization and tests.
- [ ] Replaying telemetry or billing jobs is idempotent.
- [ ] `Total Energy` billing uses only configured Billing Meters and cumulative diff snapshots.
- [ ] Cutoff and late-reading behavior is tested at `Asia/Bangkok` month boundaries.
- [ ] Invalid readings cannot finalize an invoice; partial/estimated approvals require reason and audit.
- [ ] Invoice/Receipt numbering happens only at finalize and finalized documents cannot be edited.
- [ ] Paid status issues exactly one receipt and school_user cannot self-confirm payment.
- [ ] Cross-school access tests fail safely for every role.
- [ ] Raw/aggregate/document retention, backup/restore and RPO/RTO procedures are documented and tested.
- [ ] Thai locale, responsive Web UI, PDF/CSV/XLSX exports, QR/hash verification and email/in-app notification are verified on staging.

## Execution Handoff

Recommended execution is **Subagent-Driven Development**: dispatch one fresh worker per task, run the task's tests, review the diff, then proceed to the next task. Because this is a new repository with multiple independent subsystems, each task should be treated as a reviewable milestone and merged only after its acceptance checks pass.
