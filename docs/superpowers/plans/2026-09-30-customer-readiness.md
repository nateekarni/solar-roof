# Customer feedback readiness implementation plan

> Execute independent subsystem tasks with dispatching-parallel-agents and test-driven-development; review integrations before completion.

**Goal:** Make the current web platform follow the customer's meeting feedback using persisted measurements/documents or explicit empty/error states.
**Architecture:** Preserve Next/Nest/pg modular monolith. Centralize authorization and financial/telemetry invariants; retain current uncommitted user work. No mobile app, deployment, reset, or production seed.
**Spec:** Latest user meeting feedback in this chat supersedes older design docs; prior evidence in `docs/system-review-2026-09-30.md`.
**Tech Stack:** TypeScript, Next, Nest, PostgreSQL/Timescale, MQTT.

## Constraints and rulings

- One school → one site → one gateway → many devices; school is an input; school navigation hidden.
- Only admin/mechanic configures sites/gateways; owner views. MQTT only. Gateway-driven telemetry with durable server ACK, both timestamps, interval/config delivery, configured wildcard subscription.
- No synthetic production measurements, financial history, recipient accounts, or successful operations without durable results. Missing data means empty; unavailable infrastructure means error.
- Ruling: annual selection disabled, monthly range max3 months; this follows customer's later explicit prohibition over earlier one-year limit. Cost if wrong: re-enable yearly option with a bounded range.
- Ruling: work in current checkout to preserve and build on 28 modified files; no automatic commits of pre-existing work.
- Ruling: test fixtures may simulate external dependencies, but application responses may not use fixtures.

## Tasks and review gates

### Execution status — 2026-09-30

Nonfinancial slices1–3 and scoped reports/notification persistence were implemented and verified with workspace tests/lint/build, isolated PostgreSQL/MQTT integration and desktop/mobile browser checks. Independent review found authorization and data export defects that were repaired. Full feedback coverage and limitations are tracked in `docs/customer-feedback-status-2026-09-30.md`.

Slice4 remains deliberately incomplete: after automatic approval review rejected the financial rewrite, the user explicitly requested a reviewable diff first. `docs/financial-proposal.patch` contains20 unapplied files; isolated proposal API typecheck,7 tests and `git apply --check` passed. Migration011 is not active. Real concurrency, SMTP, tax/correction policy and financial print acceptance remain required. Original task checkboxes below preserve planned scope rather than implying financial completion.

### 1. Runtime and cross-cutting authorization

Files: package scripts/lockfile as needed; `apps/api/src/common`, `app.module.ts`, `database`; operations/reports modules; validation tests.
- [ ] Restore dependencies with frozen lockfile; record failures without changing package versions to hide errors.
- [ ] Test school-owned access, owner view-only gateway mutations, admin mutation, missing-role deny.
- [ ] Implement server-resolved resource ownership and scoped read/export; avoid client-controlled scope/action.
- [ ] Run typecheck and API tests; inspect cross-module integration.

### 2. Site/gateway/telemetry vertical slice

Files: assets and telemetry modules, site/gateway forms, migration010 reserved for this task.
- [ ] Test unknown identity rejection, ACK-loop rejection, duplicate delivery, late data and timestamp freshness at120s.
- [ ] Enforce MQTT and one-school/site/gateway relationships without destroying legacy rows; show migration conflicts clearly.
- [ ] School text input, generated topic, visible preset register list, meter serial label, interval/severity configuration, admin-only controls.
- [ ] Persist measurements before ACK; deliver named gateway configuration with interval; no made-up metrics; source/server timestamps and last-updated.
- [ ] Validate runtime contracts and regression tests.

### 3. Dashboard/navigation vertical slice

Files: dashboard API/Web features, navigation, refresh hook, operations site list rendering.
- [ ] Test date range limits, site filtering and absent measurements.
- [ ] Hide school menu/card; merge system with home; site/gateway dashboard/filter/compare; monetary amounts in THB and billing counts.
- [ ]10s visibility-aware refresh,2min freshness, last-updated relative time; empty states instead of inferred measurements.
- [ ] Apply query time bounds and repair comparison column names; run typecheck and focused tests.

### 4. Contracts/billing/documents vertical slice

Files: billing/payment/document/settings API modules, contract/billing/document UI, migration011 reserved.
- [ ] Test effective rates/open end/overlap, missing meter readings, atomic payment/receipt and immutable documents.
- [ ] Site contracts + tax fields + editable effective rate intervals; cumulative meter billing with real readings only.
- [ ] Company/bank setup, recipient email and actual email failure states; admin drag/drop evidence.
- [ ] Billing/receipt shared A4 layout inspired by customer example; persisted period selector and real eligibility; no default company/account/history.
- [ ] Run regression tests and cross-check DTOs/schema/UI.

### 5. Integration and acceptance ledger

- [ ] Execute tests/lint/build after merging subsystem edits; fix failures.
- [ ] Run local services/browser when dependencies permit; verify role-specific flows, empty/error states and documents.
- [ ] Review complete change with independent reviewer; fix concrete important findings.
- [ ] Update feedback matrix with each of29 meeting items, file evidence, verification and remaining environment limitations. Never label untested production readiness as complete.

## Validation patterns

Telemetry fixtures: `{activePower:1200}` stays1200W; `{activePowerKw:1.2}` becomes1200W; response/config topics do not ingest; no rows => no ACK; identical replay => one raw/aggregate update.
Authorization fixtures: schoolA token cannot fetch/write schoolB cycle/site/device; owner cannot PATCH gateway; admin can configure assigned site.
Financial fixtures: opening100kWh/closing125kWh at4THB yields100THB; absent baseline rejects; two concurrent receipt approvals yield one receipt; finalized amount cannot be overwritten.
Period fixtures: Jan–Mar accepted, Jan–Apr rejected; yearly unavailable; comparison uses real site IDs and selected range.

Commands: `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm lint`, `pnpm build`; focused node/tsx tests as added. Database migration tests must use disposable database, never production/reset existing user data.
