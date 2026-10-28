# Asset Lifecycle and Identity Reuse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Soft-delete sites, gateways, and devices safely; release human-facing identifiers only after connection shutdown; and ensure a recreated asset starts a new telemetry generation.

**Architecture:** Add active-only database uniqueness and explicit lifecycle timestamps, then move the two-phase decommission workflow into a focused `AssetLifecycleService`. Creation, discovery, ingestion, dashboard, and billing queries will treat the new UUID generation as authoritative while retaining retired history.

**Tech Stack:** PostgreSQL migrations, NestJS 12, `pg`, EMQX management adapter, Node test runner, React 19, Next.js 16, shadcn/Radix dialogs.

**Spec:** `docs/superpowers/specs/2026-10-28-payment-and-asset-lifecycle-design.md`

## Global Constraints

- Do not rename, rewrite, or physically delete retired business, telemetry, financial, configuration, discovery, or audit records.
- A reused site/gateway/device identity always receives new UUIDs.
- A disconnecting gateway still reserves its name, code, serial, and MQTT username.
- Revoke credential access before releasing active-only uniqueness.
- Existing uncommitted workspace changes belong to the user; preserve them and edit only overlapping lines required by this plan.
- Follow `apps/web/AGENTS.md` for web changes and use existing shadcn/Radix components.

---

### Task 1: Add lifecycle columns and active-only uniqueness

**Files:**
- Create: `infra/migrations/075_asset_lifecycle_identity_reuse.sql`
- Modify: `apps/api/src/scripts/db-migrate.ts`
- Modify: `apps/api/src/scripts/db-migrate.spec.ts`
- Create: `apps/api/src/modules/assets/asset-lifecycle-migration.spec.ts`
- Modify: `apps/api/src/modules/assets/identity-allocation.ts`
- Modify: `apps/api/src/modules/assets/identity-allocation.spec.ts`

**Interfaces:**
- Produces: `sites.retired_at`, `gateways.decommission_started_at`, `devices.retired_at`, and `gateway_dashboard_sources.retired_at`.
- Produces: partial unique indexes used by every later task.
- Consumes: existing `gateways.retired_at`, `sites.status`, and `gateway_installation_history`.

- [ ] **Step 1: Write the migration contract test**

Create `asset-lifecycle-migration.spec.ts` with assertions that the migration contains the lifecycle columns, removes all-history guards, recreates active-only guards, and limits legacy discovery uniqueness to unassigned rows:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const migration=new URL('../../../../../infra/migrations/075_asset_lifecycle_identity_reuse.sql',import.meta.url);

test('075 releases identifiers only for finalized retired generations',async()=>{
  const sql=await readFile(migration,'utf8');
  for(const column of ['sites ADD COLUMN IF NOT EXISTS retired_at','gateways ADD COLUMN IF NOT EXISTS decommission_started_at',
    'devices ADD COLUMN IF NOT EXISTS retired_at','gateway_dashboard_sources ADD COLUMN IF NOT EXISTS retired_at'])assert.match(sql,new RegExp(column));
  for(const predicate of [
    /sites\(external_site_id\)[\s\S]*retired_at IS NULL/,
    /gateways\(name\)[\s\S]*retired_at IS NULL/,
    /gateways\(site_id,external_gateway_id\)[\s\S]*retired_at IS NULL/,
    /gateways\(gateway_serial\)[\s\S]*retired_at IS NULL/,
    /devices\(serial_number\)[\s\S]*retired_at IS NULL/,
    /discovered_gateways[\s\S]*external_gateway_id[\s\S]*status='unassigned'/,
  ])assert.match(sql,predicate);
  assert.match(sql,/UPDATE devices[\s\S]*g\.retired_at/);
  assert.doesNotMatch(sql,/UPDATE gateways SET (?:name|external_gateway_id|gateway_serial)=/);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```powershell
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/assets/asset-lifecycle-migration.spec.ts
```

Expected: FAIL because migration `075_asset_lifecycle_identity_reuse.sql` does not exist.

- [ ] **Step 3: Write migration 075**

The migration must perform these operations in this order:

```sql
ALTER TABLE sites ADD COLUMN IF NOT EXISTS retired_at timestamptz;
ALTER TABLE gateways ADD COLUMN IF NOT EXISTS decommission_started_at timestamptz;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS retired_at timestamptz;
ALTER TABLE gateway_dashboard_sources ADD COLUMN IF NOT EXISTS retired_at timestamptz;

UPDATE sites SET retired_at=coalesce(updated_at,now())
WHERE status='archived' AND retired_at IS NULL;
UPDATE gateways SET decommission_started_at=retired_at
WHERE retired_at IS NOT NULL AND decommission_started_at IS NULL;
UPDATE devices d SET retired_at=g.retired_at,status='offline'
FROM gateways g WHERE g.id=d.gateway_id AND g.retired_at IS NOT NULL AND d.retired_at IS NULL;
UPDATE gateway_dashboard_sources s SET retired_at=g.retired_at
FROM gateways g WHERE g.id=s.gateway_id AND g.retired_at IS NOT NULL AND s.retired_at IS NULL;

CREATE UNIQUE INDEX sites_external_site_id_active_unique ON sites(external_site_id)
  WHERE external_site_id IS NOT NULL AND retired_at IS NULL;
CREATE UNIQUE INDEX gateways_name_active_unique ON gateways(name) WHERE retired_at IS NULL;
CREATE UNIQUE INDEX gateways_external_pair_active_unique ON gateways(site_id,external_gateway_id)
  WHERE external_gateway_id IS NOT NULL AND retired_at IS NULL;
CREATE UNIQUE INDEX gateways_gateway_serial_active_unique ON gateways(gateway_serial)
  WHERE gateway_serial IS NOT NULL AND retired_at IS NULL;
CREATE UNIQUE INDEX devices_serial_number_active_unique ON devices(serial_number)
  WHERE retired_at IS NULL;

ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_external_site_id_key;
DROP INDEX IF EXISTS gateways_name_unique_idx;
ALTER TABLE gateways DROP CONSTRAINT IF EXISTS gateways_external_pair;
DROP INDEX IF EXISTS gateways_gateway_serial_unique;
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_serial_number_key;

DROP INDEX IF EXISTS discovered_gateways_legacy_broker_gateway_unique;
CREATE UNIQUE INDEX discovered_gateways_legacy_broker_gateway_unique
  ON discovered_gateways((coalesce(mqtt_broker_id::text,'default')),external_gateway_id)
  WHERE gateway_serial IS NULL AND status='unassigned';
```

Before creating or dropping indexes/constraints, add `DO $$` preflight blocks that raise named `075:` errors for duplicate active site codes, gateway names, gateway site/code pairs, gateway serials, and device serials. Add checks ensuring `retired_at >= decommission_started_at` for finalized gateways and `retired_at IS NULL OR status='archived'` for sites. Create every new active-only index before removing its all-history guard; update the legacy discovery index inside the same migration transaction.

- [ ] **Step 4: Register migration 075 in the runner and runner test matrix**

Append the exact path after migration 074 in `db-migrate.ts` and in the migration array in `db-migrate.spec.ts`:

```ts
"infra/migrations/075_asset_lifecycle_identity_reuse.sql",
```

- [ ] **Step 5: Update uniqueness error mapping for the new index names**

In `identity-allocation.ts`, recognize both rollout-era names and the new active names:

```ts
const gatewayPairConstraints=new Set(['gateways_external_pair','gateways_external_pair_active_unique']);
const gatewayNameConstraints=new Set(['gateways_name_unique_idx','gateways_name_active_unique']);
```

Use these sets in both `identityConflict` and `retryGeneratedIdentity`. Extend `identity-allocation.spec.ts` so generated and supplied collisions carrying the new constraint names produce the same bounded retry/actionable conflict behavior as the old names.

- [ ] **Step 6: Run migration and identity tests**

Run:

```powershell
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/assets/asset-lifecycle-migration.spec.ts src/modules/assets/identity-allocation.spec.ts src/scripts/db-migrate.spec.ts
```

Expected: PASS with no failed subtests.

- [ ] **Step 7: Commit**

```powershell
git add infra/migrations/075_asset_lifecycle_identity_reuse.sql apps/api/src/scripts/db-migrate.ts apps/api/src/scripts/db-migrate.spec.ts apps/api/src/modules/assets/asset-lifecycle-migration.spec.ts apps/api/src/modules/assets/identity-allocation.ts apps/api/src/modules/assets/identity-allocation.spec.ts
git commit -m "feat(db): add reusable asset lifecycle identities"
```

---

### Task 2: Implement idempotent two-phase gateway and site decommissioning

**Files:**
- Create: `packages/api-contracts/src/asset-lifecycle.ts`
- Modify: `packages/api-contracts/src/index.ts`
- Create: `apps/api/src/modules/assets/asset-lifecycle.service.ts`
- Create: `apps/api/src/modules/assets/asset-lifecycle.service.spec.ts`
- Modify: `apps/api/src/modules/assets/gateway-lifecycle.ts`
- Modify: `apps/api/src/modules/assets/gateway-lifecycle.spec.ts`

**Interfaces:**
- Produces: `AssetRemovalResult`, `AssetRemovalError`, and `AssetLifecycleService.removeGateway/removeSite`.
- Consumes: `GatewaySessionRevoker.kick(brokerId, clientId)` and `MqttIngestionService.refreshSubscriptions()`.
- Produces for Task 3: controller-ready methods returning a final `retired` result or throwing a stable retryable 503 body.

- [ ] **Step 1: Add failing lifecycle service tests**

Before the tests, define a local `lifecycleFixture(options)` in the same file. It must construct the real `AssetLifecycleService` with:

- a fake `DatabaseService` whose `transaction` method records `BEGIN`, `COMMIT:SUSPEND`, and `COMMIT:RETIRE` and whose query dispatcher rejects every unhandled SQL statement;
- mutable rows for one site, gateway, active credential, device, billing meter, dashboard source, installation interval, site assignment, and audit event;
- a `GatewaySessionRevoker` double that records `KICK` and optionally throws;
- an `MqttIngestionService` double that records `REFRESH`; and
- returned `service`, `siteId`, `gatewayId`, `actorId`, `events`, `sql`, and `state` accessors used below.

This is a concrete test harness, not a mock of lifecycle outcomes: SQL mutations must update the mutable rows so the assertions observe committed state and rollback restores the pre-transaction snapshot.

Test these exact outcomes in `asset-lifecycle.service.spec.ts`:

```ts
test('gateway removal suspends and revokes before broker kick, then retires descendants',async()=>{
  const events:string[]=[];
  const fixture=lifecycleFixture({events,credential:true});
  const result=await fixture.service.removeGateway(fixture.gatewayId,fixture.actorId);
  assert.deepEqual(result,{success:true,resource:'gateway',id:fixture.gatewayId,phase:'retired',historyPreserved:true});
  assert.ok(events.indexOf('COMMIT:SUSPEND')<events.indexOf('KICK'));
  assert.ok(events.indexOf('KICK')<events.indexOf('COMMIT:RETIRE'));
  assert.match(fixture.sql.join('\n'),/UPDATE devices SET status='offline',retired_at=/);
  assert.match(fixture.sql.join('\n'),/UPDATE billing_meters SET active=false/);
  assert.match(fixture.sql.join('\n'),/UPDATE gateway_dashboard_sources SET retired_at=/);
});

test('failed kick preserves disconnecting state and identifiers for retry',async()=>{
  const fixture=lifecycleFixture({kickError:true,credential:true});
  await assert.rejects(()=>fixture.service.removeGateway(fixture.gatewayId,fixture.actorId),(error:any)=>
    error.getStatus?.()===503&&error.getResponse?.().code==='GATEWAY_DISCONNECT_UNCONFIRMED');
  assert.equal(fixture.state.decommissionStarted,true);
  assert.equal(fixture.state.retired,false);
  assert.equal(fixture.state.credentialActive,false);
});

test('site removal cascades through its gateway and revokes account assignments',async()=>{
  const fixture=lifecycleFixture({credential:true});
  const result=await fixture.service.removeSite(fixture.siteId,fixture.actorId);
  assert.equal(result.resource,'site');
  assert.equal(fixture.state.siteRetired,true);
  assert.equal(fixture.state.gatewayRetired,true);
  assert.match(fixture.sql.join('\n'),/UPDATE site_account_assignments SET revoked_at=/);
});
```

Also test: already-retired replay returns the same result without another kick/audit; a disconnecting retry skips credential revocation; a gateway with no active credential skips management kick but refreshes local subscriptions; a concurrent state change throws 409.

- [ ] **Step 2: Run the tests and confirm they fail**

Run:

```powershell
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/assets/asset-lifecycle.service.spec.ts
```

Expected: FAIL because `AssetLifecycleService` and contracts do not exist.

- [ ] **Step 3: Define the API contract**

Create `packages/api-contracts/src/asset-lifecycle.ts`:

```ts
export type AssetRemovalResource='gateway'|'site';
export interface AssetRemovalResult {
  success:true;
  resource:AssetRemovalResource;
  id:string;
  phase:'retired';
  historyPreserved:true;
}
export interface AssetRemovalError {
  statusCode:503;
  code:'GATEWAY_DISCONNECT_UNCONFIRMED';
  phase:'disconnecting';
  retryable:true;
  resource:AssetRemovalResource;
  id:string;
  message:string;
}
```

Export it from `packages/api-contracts/src/index.ts`.

- [ ] **Step 4: Split transaction helpers from orchestration**

In `gateway-lifecycle.ts`, replace the one-step `retireGateway/retireSite` helpers with focused functions:

```ts
export interface PendingGatewayDecommission {
  gatewayId:string;siteId:string;brokerId:string|null;clientId:string;
  requiresBrokerKick:boolean;alreadyRetired:boolean;
}
export async function beginGatewayDecommission(client:Pick<PoolClient,'query'>,gatewayId:string,actorId?:string):Promise<PendingGatewayDecommission>;
export async function finalizeGatewayDecommission(client:Pick<PoolClient,'query'>,gatewayId:string,actorId?:string):Promise<AssetRemovalResult>;
export async function beginSiteDecommission(client:Pick<PoolClient,'query'>,siteId:string,actorId?:string):Promise<{siteId:string;gateway:PendingGatewayDecommission|null;alreadyRetired:boolean}>;
export async function finalizeSiteDecommission(client:Pick<PoolClient,'query'>,siteId:string,actorId?:string):Promise<AssetRemovalResult>;
```

Use site-before-gateway locks. `beginGatewayDecommission` sets suspension and revokes credentials exactly once. Before setting `retired_at`, `finalizeGatewayDecommission` takes the same `gateway-identity:<externalGatewayId>` advisory lock used by creation, rechecks the locked generation, updates gateway/device/meter/dashboard-source/install-history rows, marks mutable pending configuration proposals cancelled/stale, and writes the final audit event. `finalizeSiteDecommission` calls the gateway finalizer inside the same transaction when needed, revokes assignments, sets both `status='archived'` and `retired_at`, and preserves all historical rows.

- [ ] **Step 5: Implement the orchestration service**

Create `AssetLifecycleService` with this public boundary:

```ts
@Injectable()
export class AssetLifecycleService {
  constructor(
    @Inject(DatabaseService) private readonly db:DatabaseService,
    @Inject(MqttIngestionService) private readonly mqtt:MqttIngestionService,
    @Optional() @Inject(GatewaySessionRevoker) private readonly sessions?:GatewaySessionRevoker,
  ){}
  async removeGateway(id:string,actorId?:string):Promise<AssetRemovalResult>;
  async removeSite(id:string,actorId?:string):Promise<AssetRemovalResult>;
}
```

For credential-backed gateways, absence/failure of `GatewaySessionRevoker` throws `ServiceUnavailableException` with the exact `AssetRemovalError` body after suspension commits. Successful or absent-session kicks proceed to finalization. Always refresh local MQTT subscriptions after finalization; refresh failure is logged/ignored only after database retirement is committed.

- [ ] **Step 6: Run lifecycle tests**

Run:

```powershell
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/assets/gateway-lifecycle.spec.ts src/modules/assets/asset-lifecycle.service.spec.ts src/modules/gateway-control/gateway-session-revoker.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add packages/api-contracts/src/asset-lifecycle.ts packages/api-contracts/src/index.ts apps/api/src/modules/assets/asset-lifecycle.service.ts apps/api/src/modules/assets/asset-lifecycle.service.spec.ts apps/api/src/modules/assets/gateway-lifecycle.ts apps/api/src/modules/assets/gateway-lifecycle.spec.ts
git commit -m "feat(api): add safe asset decommission workflow"
```

---

### Task 3: Wire lifecycle service into API modules and routes

**Files:**
- Modify: `apps/api/src/modules/gateway-control/gateway-control.module.ts`
- Modify: `apps/api/src/modules/assets/assets.module.ts`
- Modify: `apps/api/src/modules/assets/assets.controller.ts`
- Modify: `apps/api/src/common/auth/route-policy.ts`
- Modify: `apps/api/src/common/auth/route-policy.spec.ts`
- Modify: `apps/api/src/modules/assets/gateway-lifecycle.spec.ts`

**Interfaces:**
- Consumes: `AssetLifecycleService.removeGateway/removeSite`.
- Produces: unchanged route paths with the new `AssetRemovalResult` response.

- [ ] **Step 1: Write failing route/module tests**

Add tests proving:

```ts
test('gateway and site DELETE routes delegate to the lifecycle service',async()=>{
  const calls:string[]=[];
  const lifecycle={
    removeGateway:async(id:string)=>{calls.push('gateway:'+id);return {success:true as const,resource:'gateway' as const,id,phase:'retired' as const,historyPreserved:true as const};},
    removeSite:async(id:string)=>{calls.push('site:'+id);return {success:true as const,resource:'site' as const,id,phase:'retired' as const,historyPreserved:true as const};},
  };
  const controller=new AssetsController({} as DatabaseService,{} as MqttIngestionService,lifecycle as AssetLifecycleService);
  await controller.removeGateway('gateway-id',{user:{id:'actor'}});
  await controller.deleteSite('site-id',{user:{id:'actor'}});
  assert.deepEqual(calls,['gateway:gateway-id','site:site-id']);
});
```

Update route-policy coverage so only the currently approved administrative roles/capabilities can call both DELETE routes; do not broaden existing access.

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```powershell
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/assets/gateway-lifecycle.spec.ts src/common/auth/route-policy.spec.ts
```

Expected: FAIL because the controller still calls one-step helpers.

- [ ] **Step 3: Export and inject dependencies**

- Export `GatewaySessionRevoker` from `GatewayControlModule`.
- Import `GatewayControlModule` in `AssetsModule`.
- Register/export `AssetLifecycleService` in `AssetsModule`.
- Inject `AssetLifecycleService` in `AssetsController`.
- Replace route bodies with direct service calls; remove route-level MQTT refresh because the service owns it.

```ts
@Delete('gateways/:id')
@Roles('admin')
removeGateway(@Param('id') id:string,@Req() req:{user?:{id:string}}){
  return this.lifecycle.removeGateway(id,req.user?.id);
}

@Delete('sites/:id')
deleteSite(@Param('id') id:string,@Req() req:{user?:{id:string}}){
  return this.lifecycle.removeSite(id,req.user?.id);
}
```

- [ ] **Step 4: Run route/module tests**

Run:

```powershell
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/assets/gateway-lifecycle.spec.ts src/common/auth/route-policy.spec.ts
pnpm --filter @solar/api lint
```

Expected: PASS and TypeScript exits 0.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/gateway-control/gateway-control.module.ts apps/api/src/modules/assets/assets.module.ts apps/api/src/modules/assets/assets.controller.ts apps/api/src/common/auth/route-policy.ts apps/api/src/common/auth/route-policy.spec.ts apps/api/src/modules/assets/gateway-lifecycle.spec.ts
git commit -m "refactor(api): route removals through asset lifecycle"
```

---

### Task 4: Allow retired identity reuse while blocking active/disconnecting conflicts

**Files:**
- Modify: `apps/api/src/modules/assets/assets.controller.ts`
- Modify: `apps/api/src/modules/assets/gateway-lifecycle.ts`
- Modify: `apps/api/src/modules/assets/gateway-lifecycle.spec.ts`
- Modify: `apps/api/src/modules/gateway-control/gateway-registration.service.ts`
- Modify: `apps/api/src/modules/gateway-control/gateway-registration.service.spec.ts`
- Modify: `apps/api/src/modules/gateway-control/gateway-configuration.service.ts`
- Modify: `apps/api/src/modules/gateway-control/gateway-configuration.service.spec.ts`
- Modify: `apps/api/src/modules/telemetry/gateway-discovery.spec.ts`

**Interfaces:**
- Consumes: migration 075 partial uniqueness.
- Produces: `reserveGatewayIdentity` active-generation behavior and new unassigned discovery rows for retired identities.

- [ ] **Step 1: Change the existing retired-identity regression test to the approved behavior**

Replace `legacy creation cannot recycle a retired external identity from credential history` with:

```ts
test('legacy creation reuses a finalized retired external identity with a new UUID',async()=>{
  const f=identityFixture();
  const old=f.gateways[0]!;old.retired_at='2026-10-18T00:00:00Z';
  const result=await f.controller.createSite({name:'New Site',customerName:'Customer',gatewayName:'New',deviceSerial:'SERIAL',externalGatewayId:'TAKEN'});
  const active=f.gateways.find(g=>!g.retired_at&&g.external_gateway_id==='TAKEN');
  assert.ok(active);
  assert.notEqual(active.id,old.id);
  assert.equal(result.gateway.external_gateway_id,'TAKEN');
});
```

Add a separate test proving `decommission_started_at != null AND retired_at == null` still conflicts.

- [ ] **Step 2: Add discovery reuse tests**

Add serial and no-serial cases proving assigned historical discovery rows are not selected or updated. The insert conflict targets must include `status='unassigned'` in both modes.

- [ ] **Step 3: Run focused tests and confirm failure**

Run:

```powershell
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/assets/gateway-lifecycle.spec.ts src/modules/gateway-control/gateway-registration.service.spec.ts src/modules/gateway-control/gateway-configuration.service.spec.ts src/modules/telemetry/gateway-discovery.spec.ts
```

Expected: FAIL because `reserveGatewayIdentity` still treats retired rows as permanent conflicts and legacy discovery conflict target is all-history.

- [ ] **Step 4: Implement active-generation reservation**

Change the duplicate lookup to:

```sql
SELECT id FROM gateways
WHERE external_gateway_id=$1 AND retired_at IS NULL
  AND ($2::uuid IS NULL OR id<>$2::uuid)
LIMIT 1
```

Keep the same advisory key so final retirement and new creation serialize. Creation code must always call `randomUUID()` and materialize new device/profile/billing records; never update/reparent retired rows.

- [ ] **Step 5: Limit legacy discovery uniqueness to unassigned rows**

In `GatewayRegistrationService`, update legacy `conflictTarget` and legacy `record()` selection/insert/fallback queries to include `status='unassigned'`. Serial mode already uses this rule; make both modes symmetrical.

Managed onboarding confirmation must continue to call `reserveGatewayIdentity` after locking the discovery and site, and active/disconnecting conflicts remain 409.

Update the active-site/gateway creation and configuration guards in these files to require `sites.retired_at IS NULL`, `gateways.retired_at IS NULL`, and `gateways.decommission_started_at IS NULL` where appropriate. A site whose child gateway is disconnecting must reject new gateway/device/configuration mutations until retry completes.

- [ ] **Step 6: Run focused tests**

Run the command from Step 3.

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/src/modules/assets/assets.controller.ts apps/api/src/modules/assets/gateway-lifecycle.ts apps/api/src/modules/assets/gateway-lifecycle.spec.ts apps/api/src/modules/gateway-control/gateway-registration.service.ts apps/api/src/modules/gateway-control/gateway-registration.service.spec.ts apps/api/src/modules/gateway-control/gateway-configuration.service.ts apps/api/src/modules/gateway-control/gateway-configuration.service.spec.ts apps/api/src/modules/telemetry/gateway-discovery.spec.ts
git commit -m "feat(gateway): reuse retired external identities safely"
```

---

### Task 5: Separate telemetry, dashboard, and billing generations

**Files:**
- Modify: `apps/api/src/modules/telemetry/payload-ingestion.ts`
- Modify: `apps/api/src/modules/telemetry/payload-ingestion.spec.ts`
- Modify: `apps/api/src/modules/dashboard/generation-energy.ts`
- Modify: `apps/api/src/modules/dashboard/generation-energy.spec.ts`
- Modify: `apps/api/src/modules/dashboard/generation-hours.spec.ts`
- Modify: `apps/api/src/modules/billing/billing-source-readings.ts`
- Modify: `apps/api/src/modules/billing/billing-source-readings.spec.ts`
- Modify: `apps/api/src/modules/billing/financial-application.service.ts`
- Modify: `apps/api/src/modules/billing/financial-application.postgres.spec.ts`

**Interfaces:**
- Produces: production ingestion restricted to a non-retired gateway/device generation.
- Produces: per-generation dashboard increments and explicit billing continuity conflicts.

- [ ] **Step 1: Write ingestion and generation regression tests**

Add tests with two generations sharing the same external codes/serials but different UUIDs:

```ts
test('retired generation is never selected when aliases are reused',async()=>{
  assert.match(PAYLOAD_DEVICE_LOOKUP_SQL,/g\.retired_at IS NULL/);
  assert.match(PAYLOAD_DEVICE_LOOKUP_SQL,/g\.decommission_started_at IS NULL/);
  assert.match(PAYLOAD_DEVICE_LOOKUP_SQL,/d\.retired_at IS NULL/);
});

test('new cumulative source starts at its first reading instead of old closing value',()=>{
  const rows:GenerationWindowSample[]=[
    {site_id:'site',gateway_id:'old-gateway',device_id:'old-device',profile_revision_id:'old-profile',polled_at:'2026-10-28T02:00:00Z',value:'5000',installed_at:'2026-10-01T00:00:00Z',removed_at:'2026-10-28T02:30:00Z'},
    {site_id:'site',gateway_id:'new-gateway',device_id:'new-device',profile_revision_id:'new-profile',polled_at:'2026-10-28T03:00:00Z',value:'9000',installed_at:'2026-10-28T03:00:00Z',removed_at:null},
    {site_id:'site',gateway_id:'new-gateway',device_id:'new-device',profile_revision_id:'new-profile',polled_at:'2026-10-28T04:00:00Z',value:'9010',installed_at:'2026-10-28T03:00:00Z',removed_at:null},
  ];
  const result=generationSegments(rows,Date.parse('2026-10-28T00:00:00Z'),Date.parse('2026-10-29T00:00:00Z'));
  assert.equal(result.consumedWh,10);
  assert.notEqual(result.consumedWh,4010);
});
```

Add a billing test that a period whose opening and closing resolve to different `device_id`/binding generations throws `Changed billing source requires continuity review`.

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```powershell
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/telemetry/payload-ingestion.spec.ts src/modules/dashboard/generation-energy.spec.ts src/modules/dashboard/generation-hours.spec.ts src/modules/billing/billing-source-readings.spec.ts src/modules/billing/financial-application.postgres.spec.ts
```

Expected: at least the generation-separation assertions fail.

- [ ] **Step 3: Add active-generation admission predicates**

Every production lookup in `payload-ingestion.ts` must require:

```sql
g.retired_at IS NULL
AND g.decommission_started_at IS NULL
AND NOT g.mqtt_access_suspended
AND d.retired_at IS NULL
```

Discovery remains available only after final retirement releases identity reservation; disconnecting traffic receives no production acknowledgement.

- [ ] **Step 4: Compute dashboard energy within generation windows**

Extend `GENERATION_SAMPLES_SQL` with gateway installation identity and bounds. Introduce a pure helper:

```ts
export interface GenerationWindowSample extends GenerationSample {gateway_id:string;installed_at:string;removed_at:string|null}
export function generationSegments(samples:GenerationWindowSample[],opening:number,closing:number):{
  consumedWh:number|null;quality:'complete'|'partial'|'missing'|'reset';
}
```

Group by `[gateway_id,device_id,profile_revision_id]`, calculate `last-first` only inside each group's installation interval, and sum valid group deltas. Never subtract across group keys. Mark cutover days partial when the intervals/samples do not cover the whole day.

- [ ] **Step 5: Preserve billing continuity failure**

Include `tr.device_id` in the `candidates` projection in `billableBoundary`, the interval projection in `verifyBillingSegment`, and the nearest-row consistency tuple. Then include `device_id` in billing continuity identity and return a specific conflict when opening/closing or interval rows cross device/binding generations:

```ts
const identity=(row:any)=>`${row.device_id}:${row.payload_profile_revision_id}:${row.billing_source_binding_id}`;
```

Ensure the new active billing meter selects only the new device UUID. Do not copy the retired meter's binding onto the new meter.

- [ ] **Step 6: Run focused and package tests**

```powershell
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/telemetry/payload-ingestion.spec.ts src/modules/dashboard/generation-energy.spec.ts src/modules/dashboard/generation-hours.spec.ts src/modules/billing/billing-source-readings.spec.ts src/modules/billing/financial-application.postgres.spec.ts
pnpm --filter @solar/api test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/src/modules/telemetry/payload-ingestion.ts apps/api/src/modules/telemetry/payload-ingestion.spec.ts apps/api/src/modules/dashboard/generation-energy.ts apps/api/src/modules/dashboard/generation-energy.spec.ts apps/api/src/modules/dashboard/generation-hours.spec.ts apps/api/src/modules/billing/billing-source-readings.ts apps/api/src/modules/billing/billing-source-readings.spec.ts apps/api/src/modules/billing/financial-application.service.ts apps/api/src/modules/billing/financial-application.postgres.spec.ts
git commit -m "fix(telemetry): isolate recreated asset generations"
```

---

### Task 6: Update site and gateway removal dialogs

**Files:**
- Create: `apps/web/features/sites/gateway-remove-dialog.tsx`
- Create: `apps/web/features/sites/gateway-remove-dialog.spec.tsx`
- Modify: `apps/web/features/sites/gateway-detail-page-view.tsx`
- Modify: `apps/web/features/sites/site-delete-dialog.tsx`
- Create: `apps/web/features/sites/site-delete-dialog.spec.tsx`
- Modify: `apps/web/features/shared/operation-table.tsx`
- Modify: `apps/api/src/modules/dashboard/operations.service.ts`
- Modify: `apps/api/src/modules/dashboard/operations.service.spec.ts`
- Modify: `packages/i18n/src/th.ts`
- Modify: `packages/i18n/src/en.ts`

**Interfaces:**
- Consumes: `AssetRemovalResult` and stable retryable 503 error code.
- Produces: dialogs that explain cascade/history/new-generation semantics and retry safely.

- [ ] **Step 1: Write failing component tests**

Assert the site dialog no longer renders “remove gateways first,” includes gateway/device counts, and keeps the primary action available after a disconnect error:

```tsx
test('site removal explains cascade and fresh generation semantics',()=>{
  const html=renderToStaticMarkup(<SiteDeleteDialog open onOpenChange={()=>{}} site={{id:'s',name:'Site',gatewayCount:1,deviceCount:2}}/>);
  assert.match(html,/เกตเวย์ 1/);
  assert.match(html,/อุปกรณ์ 2/);
  assert.match(html,/ประวัติ.*เก็บ/);
  assert.match(html,/สร้างใหม่.*เริ่มนับใหม่/);
  assert.doesNotMatch(html,/ต้องนำเกตเวย์ออกก่อน/);
});
```

The gateway dialog test asserts matching history/new-generation copy, cancel/confirm controls, disabled controls while pending, and an inline retry message for `GATEWAY_DISCONNECT_UNCONFIRMED`.

- [ ] **Step 2: Run component tests and confirm failure**

Run:

```powershell
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/sites/gateway-remove-dialog.spec.tsx features/sites/site-delete-dialog.spec.tsx
```

Expected: FAIL because the extracted gateway dialog and count-aware site dialog do not exist.

- [ ] **Step 3: Add counts to site operation rows**

Extend the sites source query with active counts:

```sql
(SELECT count(*)::int FROM gateways g WHERE g.site_id=si.id AND g.retired_at IS NULL) AS "gatewayCount",
(SELECT count(*)::int FROM devices d WHERE d.site_id=si.id AND d.retired_at IS NULL) AS "deviceCount"
```

Also derive `status='removal_pending'` when an active child gateway has `decommission_started_at IS NOT NULL AND retired_at IS NULL`. Pass the status and count fields through `selectedDeleteSite` in `operation-table.tsx`; authorized users must still be able to reopen the removal dialog and retry from this state.

- [ ] **Step 4: Implement focused dialogs**

Extract the inline gateway dialog from `gateway-detail-page-view.tsx`. Both dialogs call DELETE, keep the dialog open on retryable 503, show safe inline copy, and close/navigate only after `phase:'retired'`.

Do not render the old gateway-first branch in `SiteDeleteDialog`. Use translation keys for all new copy.

- [ ] **Step 5: Run web tests**

```powershell
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/sites/gateway-remove-dialog.spec.tsx features/sites/site-delete-dialog.spec.tsx
pnpm --filter @solar/web test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/features/sites/gateway-remove-dialog.tsx apps/web/features/sites/gateway-remove-dialog.spec.tsx apps/web/features/sites/gateway-detail-page-view.tsx apps/web/features/sites/site-delete-dialog.tsx apps/web/features/sites/site-delete-dialog.spec.tsx apps/web/features/shared/operation-table.tsx apps/api/src/modules/dashboard/operations.service.ts apps/api/src/modules/dashboard/operations.service.spec.ts packages/i18n/src/th.ts packages/i18n/src/en.ts
git commit -m "feat(web): add recoverable asset removal dialogs"
```

---

### Task 7: Run end-to-end asset lifecycle verification

**Files:**
- Create: `apps/api/src/modules/assets/asset-lifecycle.postgres.spec.ts`
- Modify: `apps/api/package.json`
- Modify: `docs/deployment/verification.md`

**Interfaces:**
- Consumes: all prior asset lifecycle tasks.
- Produces: one repeatable PostgreSQL/EMQX verification path.

- [ ] **Step 1: Write the PostgreSQL integration scenario**

The test must create a site/gateway/device with known names/codes/serials, retire it through the service, recreate the same values, and assert:

```ts
assert.notEqual(newSite.id,oldSite.id);
assert.notEqual(newGateway.id,oldGateway.id);
assert.notEqual(newDevice.id,oldDevice.id);
assert.equal(await count('payload_samples','gateway_id',oldGateway.id),oldSampleCount);
assert.equal(await count('payload_samples','gateway_id',newGateway.id),newSampleCount);
assert.equal(await activeIdentityCount('GW-REUSE-001'),1);
```

Include rollback cleanup in the test schema, not hard deletion in production code.

- [ ] **Step 2: Add a script and run it**

Add:

```json
"test:asset-lifecycle": "tsx --tsconfig tsconfig.json --test src/modules/assets/asset-lifecycle.postgres.spec.ts"
```

Run:

```powershell
pnpm --filter @solar/api test:asset-lifecycle
pnpm --filter @solar/api test
pnpm --filter @solar/web test
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 3: Document the operational smoke test**

Add exact steps to `docs/deployment/verification.md`: create disposable gateway, ingest two readings, remove, verify disconnect, rediscover same identity, approve as new generation, ingest two new readings, verify first reading is baseline and old history remains accessible.

- [ ] **Step 4: Commit**

```powershell
git add apps/api/src/modules/assets/asset-lifecycle.postgres.spec.ts apps/api/package.json docs/deployment/verification.md
git commit -m "test: verify reusable asset lifecycle end to end"
```
