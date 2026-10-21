# Telemetry-First Gateway Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace first-contact `/register` messages with schema 1.2 telemetry discovery keyed by Gateway and Device serials.

**Architecture:** The ingestion boundary classifies schema 1.2 telemetry before production normalization. Exact approved serial bindings continue through normal ingestion; every unknown or mismatched serial is stored as bounded discovery evidence and reviewed through the existing pairing workspace. MQTT credentials and client IDs use `gatewaySerial`, while topic IDs remain admin-approved aliases.

**Tech Stack:** TypeScript 7, NestJS 12, PostgreSQL migrations, MQTT.js/EMQX HTTP auth, React 19/Next.js 16, Node test runner, pnpm/Turbo.

**Spec:** `docs/superpowers/specs/2026-10-21-telemetry-first-gateway-discovery-design.md`

## Global Constraints

- New discovery requires schema version `1.2` with required `gatewaySerial` and `device.deviceSerial`.
- Existing bound schema 1.1 telemetry remains compatible but cannot discover assets.
- Topic codes are claims; serial bindings are authoritative.
- Discovery evidence must never enter production telemetry, aggregates, reports, or billing.
- The `/register` topic is not subscribed, authorized, or documented.
- MQTT QoS is 1 and Retain is false.

---

### Task 1: Persist serial identity and update public contracts

**Files:**
- Create: `infra/migrations/071_telemetry_first_gateway_discovery.sql`
- Modify: `packages/api-contracts/src/gateway-control.ts`
- Modify: `apps/api/src/modules/telemetry/payload-profile.ts`
- Test: `apps/api/src/modules/telemetry/payload-profile.spec.ts`

**Interfaces:**
- Produces: `TelemetryDiscoveryEnvelope`, required `gatewaySerial`, required `deviceSerial`, and nullable `gateways.gateway_serial` migration support.
- Consumes: existing schema 1.1 telemetry normalization and gateway configuration device contracts.

- [ ] **Step 1: Write failing schema 1.2 contract tests**

Add literal fixtures that prove a 1.2 envelope requires both serial fields,
preserves them after parsing, and rejects topic/envelope code mismatches.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm --filter @solar/api test -- payload-profile.spec.ts`

Expected: FAIL because schema 1.2 serial fields are not parsed.

- [ ] **Step 3: Add contract types, strict serial validation, and migration**

Add `gateway_serial` to `gateways`; add gateway/device serial evidence to
`discovered_gateways`; replace the discovery uniqueness key with broker plus
gateway serial; and expose the serial fields through API contracts.

- [ ] **Step 4: Run focused API and contract tests**

Run: `pnpm --filter @solar/api test -- payload-profile.spec.ts`

Run: `pnpm --filter @solar/api-contracts test`

- [ ] **Step 5: Commit the contract slice**

```bash
git add infra/migrations/071_telemetry_first_gateway_discovery.sql packages/api-contracts/src/gateway-control.ts apps/api/src/modules/telemetry/payload-profile.ts apps/api/src/modules/telemetry/payload-profile.spec.ts
git commit -m "feat(mqtt): add serial telemetry identity"
```

### Task 2: Discover unknown serials from telemetry

**Files:**
- Modify: `apps/api/src/modules/telemetry/payload-ingestion.ts`
- Modify: `apps/api/src/modules/gateway-control/gateway-registration.service.ts`
- Test: `apps/api/src/modules/telemetry/gateway-discovery.spec.ts`
- Test: `apps/api/src/modules/gateway-control/gateway-registration.service.spec.ts`

**Interfaces:**
- Consumes: parsed schema 1.2 serial evidence from Task 1.
- Produces: `GatewayRegistrationService.observeTelemetry(input)` and discovery details assembled from accumulated device evidence.

- [ ] **Step 1: Replace rejection expectations with failing discovery tests**

Cover unseen serial creation, same-serial device merging, duplicate claimed
codes remaining separate, exact bound serial ingestion, mismatched serial
quarantine, schema 1.1 unknown rejection, and absence of production ACK/config.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm --filter @solar/api test -- gateway-discovery.spec.ts gateway-registration.service.spec.ts`

- [ ] **Step 3: Implement bounded telemetry observation**

Parse serial evidence before binding lookup, upsert by broker/gateway serial,
merge devices by device serial, increment revisions only for changed evidence,
store the latest immutable evidence snapshot, and return no production ACK.

- [ ] **Step 4: Make exact serial binding mandatory for schema 1.2 ingestion**

Extend the production lookup to match `gateways.gateway_serial` and
`devices.serial_number`; route every other valid schema 1.2 message to
observation. Preserve bound schema 1.1 compatibility.

- [ ] **Step 5: Run focused tests and commit**

```bash
pnpm --filter @solar/api test -- gateway-discovery.spec.ts gateway-registration.service.spec.ts payload-ingestion.spec.ts
git add apps/api/src/modules/telemetry/payload-ingestion.ts apps/api/src/modules/gateway-control/gateway-registration.service.ts apps/api/src/modules/telemetry/gateway-discovery.spec.ts apps/api/src/modules/gateway-control/gateway-registration.service.spec.ts
git commit -m "feat(gateways): discover serials from telemetry"
```

### Task 3: Remove `/register` and move MQTT identity to Gateway Serial

**Files:**
- Modify: `apps/api/src/modules/telemetry/mqtt-ingestion.service.ts`
- Modify: `apps/api/src/modules/telemetry/mqtt-auth.controller.ts`
- Modify: `apps/api/src/modules/gateway-control/gateway-control-message-handler.ts`
- Modify: `apps/api/src/modules/gateway-control/gateway-control-payload.ts`
- Modify: `apps/api/src/modules/gateway-control/gateway-credential.service.ts`
- Test: `apps/api/src/modules/telemetry/mqtt-auth.spec.ts`
- Test: `apps/api/src/modules/telemetry/mqtt-ingestion.service.spec.ts`
- Test: `apps/api/src/modules/gateway-control/gateway-credential.service.spec.ts`

**Interfaces:**
- Consumes: `gateway_serial` and schema 1.2 topic parser.
- Produces: anonymous telemetry-only first contact and serial-based authenticated credentials.

- [ ] **Step 1: Write failing MQTT subscription/authentication tests**

Assert that `/register` is never subscribed or authorized; an unbound serial
Client ID can publish a telemetry topic only; a bound/retired serial cannot use
anonymous access; and issued credentials use Gateway Serial.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm --filter @solar/api test -- mqtt-auth.spec.ts mqtt-ingestion.service.spec.ts gateway-credential.service.spec.ts`

- [ ] **Step 3: Remove the registration route and implement serial identity**

Delete `register` from control kinds and handler routing, remove the required
subscription, permit bounded anonymous telemetry publish, and query credentials
by `gateway_serial` with an external-ID fallback only for legacy bound rows.

- [ ] **Step 4: Run focused tests and commit**

```bash
pnpm --filter @solar/api test -- mqtt-auth.spec.ts mqtt-ingestion.service.spec.ts gateway-credential.service.spec.ts
git add apps/api/src/modules/telemetry/mqtt-ingestion.service.ts apps/api/src/modules/telemetry/mqtt-auth.controller.ts apps/api/src/modules/gateway-control/gateway-control-message-handler.ts apps/api/src/modules/gateway-control/gateway-control-payload.ts apps/api/src/modules/gateway-control/gateway-credential.service.ts apps/api/src/modules/telemetry/mqtt-auth.spec.ts apps/api/src/modules/telemetry/mqtt-ingestion.service.spec.ts apps/api/src/modules/gateway-control/gateway-credential.service.spec.ts
git commit -m "feat(mqtt): replace register with telemetry discovery"
```

### Task 4: Pair telemetry-derived candidates

**Files:**
- Modify: `apps/api/src/modules/gateway-control/gateway-configuration.service.ts`
- Modify: `apps/web/features/sites/gateway-onboarding-api.ts`
- Modify: `apps/web/features/sites/gateway-workspace.tsx`
- Delete: `apps/web/features/sites/gateway-registration-required.tsx`
- Modify: `apps/web/features/sites/pair-discovered-gateway-dialog.tsx`
- Test: `apps/api/src/modules/gateway-control/gateway-configuration.service.spec.ts`
- Test: `apps/web/features/sites/gateway-pairing-flow.spec.tsx`

**Interfaces:**
- Consumes: serial-backed `DiscoveredGatewayDetail` from Task 2.
- Produces: pairing that stores gateway serial, uses observed device serials, and does not require registration readiness.

- [ ] **Step 1: Write failing API and UI pairing tests**

Assert that a telemetry candidate opens directly, serials pre-fill the draft,
confirmation persists `gateway_serial`, issued username equals that serial, and
stale revisions still fail closed.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm --filter @solar/api test -- gateway-configuration.service.spec.ts`

Run: `pnpm --filter @solar/web test -- gateway-pairing-flow.spec.tsx`

- [ ] **Step 3: Implement serial pairing and remove registration guidance**

Replace registration readiness with telemetry evidence readiness, store serial
identity during confirmation, retain explicit admin selection for Site/profile/
connection/mappings, and render code-collision warnings as facts rather than
extra primary statuses.

- [ ] **Step 4: Run focused tests and commit**

```bash
pnpm --filter @solar/api test -- gateway-configuration.service.spec.ts
pnpm --filter @solar/web test -- gateway-pairing-flow.spec.tsx gateway-index.spec.tsx
git add apps/api/src/modules/gateway-control/gateway-configuration.service.ts apps/web/features/sites/gateway-onboarding-api.ts apps/web/features/sites/gateway-workspace.tsx apps/web/features/sites/pair-discovered-gateway-dialog.tsx apps/web/features/sites/gateway-pairing-flow.spec.tsx apps/api/src/modules/gateway-control/gateway-configuration.service.spec.ts
git rm apps/web/features/sites/gateway-registration-required.tsx
git commit -m "feat(gateways): pair telemetry discovery candidates"
```

### Task 5: Update MQTT documentation and examples

**Files:**
- Modify: `docs/runbooks/gateway-mqtt-onboarding-th.md`
- Create: `docs/runbooks/MQTT_Payload_Examples_v1.2.json`
- Modify: `CONTEXT.md`

**Interfaces:**
- Consumes: final topic, identity, auth, and payload behavior from Tasks 1–4.
- Produces: the handoff guide and copy-ready MQTT client settings used by the Gateway team.

- [ ] **Step 1: Rewrite first-contact instructions**

Document serial Client IDs, telemetry-only discovery, required schema 1.2
fields, duplicate-code behavior, pairing, post-pair credentials, ACK semantics,
QoS 1, Retain false, and troubleshooting.

- [ ] **Step 2: Add complete schema 1.2 examples**

Copy the existing PM2230 and SmartLogger examples, add `gatewaySerial` and
`deviceSerial` to every telemetry envelope, and keep non-telemetry envelopes
consistent with the documented lifecycle.

- [ ] **Step 3: Update canonical vocabulary and ADR references**

Define claimed IDs, Gateway Serial, Device Serial, telemetry discovery
candidate, and approved binding in `CONTEXT.md`.

- [ ] **Step 4: Validate JSON and search for stale onboarding instructions**

Run: `node -e "JSON.parse(require('node:fs').readFileSync('docs/runbooks/MQTT_Payload_Examples_v1.2.json','utf8'))"`

Run: `rg -n "gateways/.+/register|registration snapshot|GATEWAY_REGISTRATION_REQUIRED" docs/runbooks apps/web/features/sites apps/api/src/modules`

- [ ] **Step 5: Commit documentation**

```bash
git add docs/runbooks/gateway-mqtt-onboarding-th.md docs/runbooks/MQTT_Payload_Examples_v1.2.json CONTEXT.md docs/adr/0048-telemetry-first-serial-gateway-discovery.md docs/superpowers/specs/2026-10-21-telemetry-first-gateway-discovery-design.md docs/superpowers/plans/2026-10-21-telemetry-first-gateway-discovery.md
git commit -m "docs(mqtt): document telemetry-first discovery"
```

### Task 6: Full verification, CI review, and delivery

**Files:**
- Verify: `.github/workflows/*`
- Verify: all files changed in Tasks 1–5

**Interfaces:**
- Consumes: completed implementation and repository CI configuration.
- Produces: a verified commit pushed to the current approved branch.

- [ ] **Step 1: Run migration and changed-surface checks**

Run the repository migration tests or a disposable database migration sequence
used by CI, then run API contracts, API, and Web tests.

- [ ] **Step 2: Run CI-equivalent quality gates**

```bash
pnpm lint
pnpm test
pnpm build
```

- [ ] **Step 3: Review the final diff and plan coverage**

Confirm no user-owned `docs/research/` files are staged; verify every acceptance
criterion in the design has a test or documented manual check.

- [ ] **Step 4: Commit any verification-only corrections and push**

```bash
git status --short
git push origin main
```

- [ ] **Step 5: Inspect the pushed CI run**

Use the repository's GitHub checks to report every job result and distinguish
an intentionally skipped deployment from a failed CI job.

