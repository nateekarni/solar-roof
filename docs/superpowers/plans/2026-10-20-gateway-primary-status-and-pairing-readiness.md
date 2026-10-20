# Gateway Primary Status and Pairing Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace multi-badge gateway status with one lifecycle-derived primary status and make legacy discoveries fail with actionable registration guidance instead of a generic 404.

**Architecture:** Derive the primary UI status from discovery/persisted lifecycle plus the API's existing recency status, without adding mutable database state. Extend discovery summaries with computed onboarding readiness and use a stable conflict code at the detail boundary so the UI can route ready rows into the existing wizard and legacy rows into explicit registration guidance.

**Tech Stack:** TypeScript 7, React 19, Next.js 16 client components, TanStack Query, NestJS 12, PostgreSQL, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-20-gateway-primary-status-and-pairing-readiness-design.md`

## Global Constraints

- Show one and only one primary status badge per gateway row and detail header.
- Primary statuses are `unconnected`, `connecting`, `online`, and `offline`.
- Never synthesize registration snapshots or mappings from legacy telemetry.
- Preserve the existing four-step pairing, credential, sync, permission, and MQTT control-plane behavior.
- Preserve unrelated working-tree changes, including `docs/research/`.

---

### Task 1: Primary gateway status model and rendering

**Files:**
- Modify: `apps/web/features/sites/gateway-operational-status.tsx`
- Modify: `apps/web/features/sites/gateway-index.tsx`
- Modify: `apps/web/features/sites/gateway-detail-page-view.tsx`
- Modify: `apps/web/features/sites/gateway-index.spec.tsx`
- Modify: `apps/web/features/sites/gateway-detail-page-view.spec.tsx`

**Interfaces:**
- Produces: `GatewayPrimaryStatus = 'unconnected' | 'connecting' | 'online' | 'offline'`
- Produces: `gatewayPrimaryStatus(source): GatewayPrimaryStatus`
- Produces: `GatewayOperationalStatus` rendering exactly one localized badge

- [ ] **Step 1: Write failing primary-status tests**

Add literal truth-table assertions covering discovered, configuring, active-online, active-offline, stale stored-online, and active pending/failed configuration inputs. Update rendered index/detail expectations to require one primary label and reject the old peer labels.

```ts
assert.equal(gatewayPrimaryStatus({isDiscovered:true,status:'unconnected'}),'unconnected');
assert.equal(gatewayPrimaryStatus({lifecycleState:'configuring',status:'offline'}),'connecting');
assert.equal(gatewayPrimaryStatus({lifecycleState:'active',status:'online'}),'online');
assert.equal(gatewayPrimaryStatus({lifecycleState:'active',status:'offline',connectionState:'online'}),'offline');
```

- [ ] **Step 2: Run focused web tests and verify RED**

Run:

```powershell
..\..\node_modules\.bin\tsx.cmd --tsconfig tsconfig.ui-tests.json --test features\sites\gateway-index.spec.tsx features\sites\gateway-detail-page-view.spec.tsx
```

Expected: FAIL because `gatewayPrimaryStatus` and single-badge rendering do not exist.

- [ ] **Step 3: Implement the minimal shared primary status**

Replace the four-item rendering in `GatewayOperationalStatus` with one badge. Use `status` for active online/offline decisions and lifecycle/discovery precedence for earlier states. Update `GatewayIndexLifecycle` and filtering to use the same result.

```ts
export type GatewayPrimaryStatus='unconnected'|'connecting'|'online'|'offline';

export function gatewayPrimaryStatus(gateway:GatewayOperationalSource):GatewayPrimaryStatus {
  if(gateway.lifecycleState==='discovered')return 'unconnected';
  if(gateway.lifecycleState!=='active')return 'connecting';
  return gateway.status==='online'?'online':'offline';
}
```

- [ ] **Step 4: Correct tab partition semantics**

Persisted rows belong to Connected regardless of configuring/active state; discovered rows alone belong to Not connected.

```ts
const connectedItems=persisted.map(item=>({...item,isConnected:true}));
const unconnectedItems=discovered;
```

- [ ] **Step 5: Run focused web tests and verify GREEN**

Run the Step 2 command. Expected: all selected tests pass with one badge per rendered gateway.

### Task 2: Discovery readiness and stable API conflict

**Files:**
- Modify: `packages/api-contracts/src/index.ts`
- Modify: `apps/api/src/modules/gateway-control/gateway-registration.service.ts`
- Modify: `apps/api/src/modules/gateway-control/gateway-registration.service.spec.ts`
- Modify: `apps/api/src/modules/gateway-control/gateway-onboarding.controller.spec.ts`

**Interfaces:**
- Produces: `DiscoveredGatewayRow.onboardingState: 'ready' | 'registration_required'`
- Produces: HTTP 409 error body `{code:'GATEWAY_REGISTRATION_REQUIRED', message:string}` for an existing unpairable discovery

- [ ] **Step 1: Write failing service tests**

Add cases proving that list readiness is computed from current snapshot plus verified client identity, and detail distinguishes an absent discovery from an existing row missing its current snapshot.

```ts
assert.equal(result[0]?.onboardingState,'registration_required');
await assert.rejects(service.detail(discoveryId),error=>
  error instanceof HttpException && error.getStatus()===409 &&
  (error.getResponse() as {code?:string}).code==='GATEWAY_REGISTRATION_REQUIRED');
```

- [ ] **Step 2: Run focused API tests and verify RED**

Run:

```powershell
..\..\node_modules\.bin\tsx.cmd --tsconfig tsconfig.json --test src\modules\gateway-control\gateway-registration.service.spec.ts src\modules\gateway-control\gateway-onboarding.controller.spec.ts
```

Expected: FAIL because readiness and the stable conflict do not exist.

- [ ] **Step 3: Implement readiness in list SQL**

Select an `onboardingState` expression that requires `client_id=external_gateway_id` and an `EXISTS` row at the current revision. Keep the list bounded and read-only.

```sql
CASE WHEN d.client_id=d.external_gateway_id AND EXISTS(
  SELECT 1 FROM gateway_discovery_snapshots s
  WHERE s.discovered_gateway_id=d.id AND s.revision=d.discovery_revision
) THEN 'ready' ELSE 'registration_required' END AS "onboardingState"
```

- [ ] **Step 4: Split detail lookup from snapshot lookup**

Load the discovery row first. Return 404 only if it is absent. Return `ConflictException` with code `GATEWAY_REGISTRATION_REQUIRED` if identity or current snapshot evidence is missing. Continue using the existing snapshot to derive every reported field when ready.

- [ ] **Step 5: Run focused API tests and verify GREEN**

Run the Step 2 command. Expected: all selected tests pass, including existing historical-replay behavior.

### Task 3: Registration-required interaction and retry

**Files:**
- Modify: `apps/web/features/sites/gateway-index.tsx`
- Modify: `apps/web/features/sites/gateway-workspace.tsx`
- Modify: `apps/web/features/sites/pair-discovered-gateway-dialog.tsx`
- Modify: `apps/web/features/sites/gateway-onboarding-api.ts`
- Modify: `apps/web/features/sites/gateway-index.spec.tsx`
- Modify: `apps/web/features/sites/gateway-pairing-flow.spec.tsx`
- Modify: `apps/web/features/sites/gateway-onboarding-api.spec.ts`

**Interfaces:**
- Consumes: `DiscoveredGatewayRow.onboardingState`
- Produces: a registration-required guidance surface and retry callback

- [ ] **Step 1: Write failing interaction tests**

Add tests proving that a registration-required row exposes guidance rather than the pairing action, a ready row still exposes pairing, and the detail error code selects the registration guidance surface.

```ts
assert.match(legacyHtml,/Publish a schema 1\.1 register message/);
assert.doesNotMatch(legacyHtml,/Pair site/);
assert.match(readyHtml,/Pair site/);
```

- [ ] **Step 2: Run focused web tests and verify RED**

Run:

```powershell
..\..\node_modules\.bin\tsx.cmd --tsconfig tsconfig.ui-tests.json --test features\sites\gateway-index.spec.tsx features\sites\gateway-pairing-flow.spec.tsx features\sites\gateway-onboarding-api.spec.ts
```

Expected: FAIL because the UI does not branch on onboarding readiness or the stable error code.

- [ ] **Step 3: Implement the guidance surface**

Use existing Alert/Dialog/Button components. Include the exact topic, QoS 1, Retain off, anonymous first-stage connection, and Retry action. Do not expose credentials or fabricate a manual onboarding path.

- [ ] **Step 4: Route row actions by readiness**

Ready discoveries call the existing `onPairDiscovered`. Registration-required discoveries open guidance. After Retry refreshes the list, open pairing only if the refreshed row is ready.

- [ ] **Step 5: Handle the list/detail race**

Detect `error.code==='GATEWAY_REGISTRATION_REQUIRED'` in the pairing dialog and render the same guidance instead of the generic destructive 404 alert.

- [ ] **Step 6: Run focused web tests and verify GREEN**

Run the Step 2 command. Expected: all selected tests pass.

### Task 4: Documentation and full-flow verification

**Files:**
- Modify: `docs/runbooks/gateway-mqtt-onboarding-th.md`
- Modify: `apps/api/src/modules/gateway-control/gateway-onboarding.e2e.spec.ts` only if a missing observable transition is not already covered

**Interfaces:**
- Documents: anonymous discovery client settings and exact schema 1.1 register example
- Verifies: register → discovery-ready → confirm → connecting → applied → online/offline

- [ ] **Step 1: Update the runbook**

Clarify that old telemetry-only rows are not pairable and must publish a schema 1.1 register message. Include broker/TLS placeholders without secrets, Client ID identity rules, Topic, QoS, Retain, and the repository fixture path.

- [ ] **Step 2: Run focused regression suites**

Run the focused web tests from Tasks 1 and 3 and the gateway-control/API tests from Task 2 plus `gateway-configuration.service.spec.ts` and `platform-access.guard.spec.ts`.

- [ ] **Step 3: Run full CI-equivalent verification**

Run:

```powershell
pnpm lint
pnpm test
pnpm build
```

Expected: all commands exit 0 with no test failures or type errors.

- [ ] **Step 4: Review the complete diff**

Compare against the pre-change commit, confirm no unrelated `docs/research/` files are staged, and request an independent code review. Resolve every Critical or Important finding and rerun affected tests.

- [ ] **Step 5: Commit and push**

Stage only the spec, plan, gateway implementation/tests, contracts, and runbook. Commit with a scoped message, push the current branch without force, then inspect the resulting GitHub Actions run until it reaches a terminal state.

```powershell
git commit -m "fix(gateways): unify status and pairing readiness"
git push origin main
```

- [ ] **Step 6: Report MQTT test instructions**

Return a redacted, copy-ready configuration containing broker host/port placeholders, TLS verification requirements, anonymous Client ID, register Topic, QoS 1, Retain off, and a complete schema 1.1 register payload whose topic, Client ID, and payload gateway ID match.
