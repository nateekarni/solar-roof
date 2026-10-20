# EMQX Gateway Onboarding and Configuration Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete anonymous discovery, admin pairing, versioned configuration synchronization, status, telemetry admission, and `dataAcept` flow against EMQX.

**Architecture:** Add a focused `gateway-control` API module that owns registration snapshots, credentials, immutable configuration revisions, proposals, and status transitions. Keep the site-scoped telemetry data plane in the telemetry module, but route the new gateway-scoped control topics through a dedicated handler and admit telemetry only for an active applied configuration. Replace the current one-step pairing dialog with a shadcn-based four-step workflow backed by conflict-aware APIs and live sync polling.

**Tech Stack:** TypeScript 7, Node.js 24, NestJS 12, PostgreSQL, MQTT.js 5, EMQX 5.8.3, Next.js 16, React 19, TanStack Query, shadcn/ui, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-19-emqx-gateway-onboarding-config-sync-design.md`

## Global Constraints

- Preserve the existing telemetry topic `solar/v1/sites/{siteId}/gateways/{gatewayId}/devices/{deviceId}/telemetry`.
- Preserve the exact protocol spelling `dataAcept`; publish it only after validation and durable database commit.
- Use the exact gateway control topics `solar/v1/gateways/{gatewayId}/register`, `solar/v1/gateways/{gatewayId}/config`, `solar/v1/gateways/{gatewayId}/configUpdate`, `solar/v1/gateways/{gatewayId}/configStatus`, and `solar/v1/gateways/{gatewayId}/status`.
- Anonymous clients may publish only `solar/v1/gateways/{clientId}/register`; they may not subscribe or access runtime topics.
- Require `username == clientId == gatewayId` and a permanent hashed credential after admin confirmation.
- Treat `register` and `configUpdate` as complete snapshots. Last-write-wins applies only to the unapproved discovery draft.
- Require manual admin approval for every post-activation `configUpdate` in version 1.
- Publish `config` at QoS 1 with retain enabled. Keep `register`, `configUpdate`, `configStatus`, telemetry, and `dataAcept` non-retained. Retain `status` and use an offline Last Will.
- Keep desired and active configuration revisions separate; advance the active revision only after a matching `configStatus: applied`.
- Use shadcn/ui or existing reusable application components for all UI controls, dialogs, tabs, tables, badges, alerts, loading states, and form fields.
- Use existing design tokens and component variants. Do not add raw replacement controls or hard-coded visual values when a system component or semantic token exists.
- Do not invent vendor register addresses, datatypes, byte order, word order, scaling, or units. Presets, gateway reports, and explicit admin input are valid sources.
- Keep migrations additive and preserve existing gateways, payload profiles, readings, financial records, and the legacy ingestion mode.
- Pin and test the deployed broker as `emqx/emqx:5.8.3`; do not rely on features introduced in later EMQX versions.

## File Structure

### New shared contracts

- `packages/api-contracts/src/gateway-control.ts` — MQTT payload, onboarding API, sync state, proposal, and device draft interfaces.
- `apps/api/src/modules/gateway-control/gateway-control-payload.ts` — Zod validation, topic parsing, canonical hashing, and payload size limits.

### New API module

- `apps/api/src/modules/gateway-control/gateway-control.module.ts` — module boundary and exports.
- `apps/api/src/modules/gateway-control/gateway-registration.service.ts` — anonymous snapshots, discovery revisions, rate limits, and preset suggestions.
- `apps/api/src/modules/gateway-control/gateway-credential.service.ts` — one-time secret generation, Argon2 hashing, verification, and rotation.
- `apps/api/src/modules/gateway-control/gateway-configuration.service.ts` — atomic assignment, desired/active revisions, proposals, config statuses, and sync state.
- `apps/api/src/modules/gateway-control/gateway-control-message-handler.ts` — dispatch for `register`, `configUpdate`, `configStatus`, and `status`.
- `apps/api/src/modules/gateway-control/gateway-onboarding.controller.ts` — admin discovery, confirmation, credential rotation, sync, and proposal endpoints.

### Existing API integration points

- `apps/api/src/modules/telemetry/mqtt-ingestion.service.ts` — subscribe to control filters, route control messages, publish gateway-rooted config, and expose per-broker readiness.
- `apps/api/src/modules/telemetry/mqtt-auth.controller.ts` — anonymous quarantine authentication plus permanent credential and site-scoped ACL enforcement.
- `apps/api/src/modules/telemetry/payload-ingestion.ts` — remove telemetry-driven discovery and admit only active configured gateways.
- `apps/api/src/modules/assets/assets.controller.ts` — remove the old one-step discovery assignment routes after their replacements are registered.

### Database and operations

- `infra/migrations/066_gateway_onboarding_control_plane.sql` — discovery history, credentials, lifecycle/config state, hashes, proposals, and status events.
- `infra/docker/docker-compose.emqx.yml` and `infra/docker/emqx/emqx.conf` — signed internal webhook headers and production-safe auth/ACL settings.
- `docs/runbooks/gateway-mqtt-onboarding-th.md` — MQTTBox and physical gateway workflow.

### Web

- `apps/web/features/sites/gateway-onboarding-api.ts` — TanStack Query hooks and mutation invalidation.
- `apps/web/features/sites/gateway-onboarding-draft.ts` — pure draft conversion, preset suggestion selection, validation, and revision-conflict handling.
- `apps/web/features/sites/pair-discovered-gateway-dialog.tsx` — four-step shadcn dialog orchestration.
- `apps/web/features/sites/gateway-discovery-review.tsx` — gateway facts and site assignment.
- `apps/web/features/sites/gateway-device-configuration.tsx` — preset/manual/device/register configuration using existing editors.
- `apps/web/features/sites/gateway-sync-status.tsx` — credential reveal and live configuration state.
- `apps/web/features/sites/gateway-config-proposals.tsx` — manual review and approval of full update proposals.

---

### Task 1: Define Shared Topic and Payload Contracts

**Files:**
- Create: `packages/api-contracts/src/gateway-control.ts`
- Modify: `packages/api-contracts/src/index.ts`
- Create: `apps/api/src/modules/gateway-control/gateway-control-payload.ts`
- Test: `apps/api/src/modules/gateway-control/gateway-control-payload.spec.ts`

**Interfaces:**
- Produces: `GatewayRegisterPayload`, `GatewayConfigPayload`, `GatewayConfigUpdatePayload`, `GatewayConfigStatusPayload`, `GatewayStatusPayload`, `GatewayDeviceConfig`, `GatewayRegisterMapping`, `DiscoveredGatewayDetail`, `ConfirmGatewayRequest`, `ConfirmGatewayResponse`, `GatewaySyncState`, and `GatewayConfigProposal`.
- Produces: `gatewayControlTopic(gatewayId, kind)`, `parseGatewayControlTopic(topic)`, `parseGatewayControlPayload(kind, input)`, and `gatewayConfigHash(config)`.

- [ ] **Step 1: Write failing contract validation tests**

```ts
test('parses the five exact control topics without accepting a site-scoped alias', () => {
  assert.deepEqual(parseGatewayControlTopic('solar/v1/gateways/GW-001/configStatus'), {
    gatewayId: 'GW-001', kind: 'configStatus',
  });
  assert.equal(parseGatewayControlTopic('solar/v1/sites/S1/gateways/GW-001/configStatus'), null);
});

test('register requires a full device array and matching envelope identity', () => {
  const payload = parseGatewayControlPayload('register', registerFixture);
  assert.equal(payload.messageType, 'register');
  assert.equal(payload.devices.length, 2);
  assert.throws(() => parseGatewayControlPayload('register', {...registerFixture, devices: undefined}));
});

test('config hash is stable across object-key order and changes with array order', () => {
  assert.equal(gatewayConfigHash({gatewayId:'G1', devices:[]}), gatewayConfigHash({devices:[], gatewayId:'G1'}));
  assert.notEqual(gatewayConfigHash({devices:[{deviceId:'A'},{deviceId:'B'}]}), gatewayConfigHash({devices:[{deviceId:'B'},{deviceId:'A'}]}));
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/gateway-control/gateway-control-payload.spec.ts
```

Expected: FAIL because the module and exported types do not exist.

- [ ] **Step 3: Add the shared payload and API interfaces**

Define the contracts with these discriminators and status unions:

```ts
export type GatewayControlKind = 'register'|'config'|'configUpdate'|'configStatus'|'status';
export type GatewayConfigApplyStatus = 'received'|'applied'|'failed';
export type GatewayLifecycleState = 'discovered'|'configuring'|'active'|'disabled';
export type GatewayConfigState = 'draft'|'pending_sync'|'applied'|'failed'|'drifted';
export type GatewayConnectionState = 'online'|'offline'|'unknown';

export interface GatewayRegisterPayload {
  schemaVersion:'1.1'; messageType:'register'; messageId:string; sentAt:string;
  gateway:{gatewayId:string;model:string;firmwareVersion:string};
  reportedSiteId?:string; devices:GatewayReportedDevice[];
}

export interface GatewayConfigStatusPayload {
  schemaVersion:'1.1'; messageType:'configStatus'; messageId:string; gatewayId:string;
  configVersion:number; configHash:string; status:GatewayConfigApplyStatus;
  reportedAt:string; error?:{code:string;message?:string;deviceId?:string;tag?:string};
}
```

Export them from `packages/api-contracts/src/index.ts`.

- [ ] **Step 4: Implement strict Zod schemas, topic helpers, and deterministic SHA-256 hashing**

```ts
const gatewayId = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const controlKinds = ['register','config','configUpdate','configStatus','status'] as const;

export function gatewayControlTopic(id:string, kind:GatewayControlKind) {
  return `solar/v1/gateways/${gatewayId.parse(id)}/${kind}`;
}

export function gatewayConfigHash(input:unknown) {
  const withoutHash = structuredClone(input) as Record<string,unknown>;
  delete withoutHash.configHash;
  return createHash('sha256').update(JSON.stringify(sortObjectKeys(withoutHash))).digest('hex');
}
```

Limit complete MQTT payloads to 256 KiB, device snapshots to 32 devices, poll groups to 16 per device, and mappings to 256 per device. Reject duplicate device IDs, poll-group names, tags, and register identities.

- [ ] **Step 5: Run contract tests and package type checking**

Run:

```bash
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/gateway-control/gateway-control-payload.spec.ts
pnpm --filter @solar/api-contracts lint
```

Expected: PASS.

- [ ] **Step 6: Commit the contract boundary**

```bash
git add packages/api-contracts/src/gateway-control.ts packages/api-contracts/src/index.ts apps/api/src/modules/gateway-control/gateway-control-payload.ts apps/api/src/modules/gateway-control/gateway-control-payload.spec.ts
git commit -m "feat(mqtt): define gateway control contracts"
```

### Task 2: Add Durable Onboarding and Configuration State

**Files:**
- Create: `infra/migrations/066_gateway_onboarding_control_plane.sql`
- Modify: `apps/api/src/scripts/db-migrate.ts:72-75`
- Modify: `apps/api/src/scripts/db-migrate.spec.ts:7`

**Interfaces:**
- Consumes: topic and state names from Task 1.
- Produces: discovery snapshots, permanent credential records, desired/active configuration metadata, proposals, and status event tables.

- [ ] **Step 1: Extend the migration runner test to require migration 066**

Add the new filename to the migration cases:

```ts
for (const migration of [
  'infra/migrations/058_user_document_identity.sql',
  'infra/migrations/059_billing_issuance_approval.sql',
  'infra/migrations/060_payload_samples_generation_energy_idx.sql',
  'infra/migrations/066_gateway_onboarding_control_plane.sql',
])
```

- [ ] **Step 2: Run the migration test and verify failure**

Run:

```bash
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/scripts/db-migrate.spec.ts
```

Expected: FAIL because migration 066 is absent from disk and the runner.

- [ ] **Step 3: Create the additive migration**

The migration must perform these concrete changes:

```sql
ALTER TABLE discovered_gateways
  ADD COLUMN mqtt_broker_id uuid REFERENCES mqtt_brokers(id),
  ADD COLUMN client_id text,
  ADD COLUMN firmware_version text,
  ADD COLUMN discovery_revision integer NOT NULL DEFAULT 1 CHECK(discovery_revision > 0),
  ADD COLUMN devices jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(devices)='array'),
  ADD COLUMN source_address text;

ALTER TABLE discovered_gateways DROP CONSTRAINT discovered_gateways_external_gateway_id_key;
CREATE UNIQUE INDEX discovered_gateways_broker_gateway_unique
  ON discovered_gateways ((coalesce(mqtt_broker_id::text,'default')), external_gateway_id);

CREATE TABLE gateway_discovery_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discovered_gateway_id uuid NOT NULL REFERENCES discovered_gateways(id),
  revision integer NOT NULL CHECK(revision > 0),
  message_id text NOT NULL,
  payload jsonb NOT NULL,
  source_address text,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(discovered_gateway_id, revision),
  UNIQUE(discovered_gateway_id, message_id)
);

ALTER TABLE gateways
  ADD COLUMN lifecycle_state text NOT NULL DEFAULT 'active'
    CHECK(lifecycle_state IN ('discovered','configuring','active','disabled')),
  ADD COLUMN config_state text NOT NULL DEFAULT 'applied'
    CHECK(config_state IN ('draft','pending_sync','applied','failed','drifted')),
  ADD COLUMN desired_config_hash text,
  ADD COLUMN active_config_hash text,
  ADD COLUMN last_status_at timestamptz;

CREATE TABLE gateway_mqtt_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id uuid NOT NULL REFERENCES gateways(id),
  username text NOT NULL,
  password_hash text NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE UNIQUE INDEX gateway_mqtt_credentials_active_gateway
  ON gateway_mqtt_credentials(gateway_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX gateway_mqtt_credentials_active_username
  ON gateway_mqtt_credentials(username) WHERE revoked_at IS NULL;
```

Also add `config_hash` and `approved_by` to `gateway_configuration_revisions`, create `gateway_config_proposals`, `gateway_config_status_events`, and `gateway_connection_events`, and replace the discovered status check with `unassigned`, `configuring`, `assigned`, and `ignored`. Backfill existing revisions with a database digest only as legacy history; all new hashes come from Task 1's application canonicalizer.

- [ ] **Step 4: Register migration 066 after migration 065**

```ts
"infra/migrations/065_payload_samples_device_tag_latest_idx.sql",
"infra/migrations/066_gateway_onboarding_control_plane.sql",
```

- [ ] **Step 5: Run migration runner tests and apply to the disposable/local database**

Run:

```bash
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/scripts/db-migrate.spec.ts
pnpm db:migrate
```

Expected: tests PASS; migration applies once and a second `pnpm db:migrate` is a no-op.

- [ ] **Step 6: Commit the database foundation**

```bash
git add infra/migrations/066_gateway_onboarding_control_plane.sql apps/api/src/scripts/db-migrate.ts apps/api/src/scripts/db-migrate.spec.ts
git commit -m "feat(db): add gateway onboarding state"
```

### Task 3: Record Anonymous Registration Snapshots

**Files:**
- Create: `apps/api/src/modules/gateway-control/gateway-control.module.ts`
- Create: `apps/api/src/modules/gateway-control/gateway-registration.service.ts`
- Test: `apps/api/src/modules/gateway-control/gateway-registration.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `GatewayRegisterPayload` and `parseGatewayControlPayload()` from Task 1.
- Produces: `GatewayRegistrationService.record({brokerId, clientId, sourceAddress, payload})`, `.list(status)`, and `.detail(id)`.

- [ ] **Step 1: Write failing registration tests**

Cover full-snapshot insertion, duplicate `messageId`, last-write-wins revision increment, broker-scoped identity, payload/client/topic mismatch, 12 registrations per minute per gateway/source limit, and preset suggestions that never mutate the report.

```ts
test('a second message replaces the draft and appends an audit snapshot', async () => {
  const first = await service.record(context(registerFixture('m-1', ['DEV-1'])));
  const second = await service.record(context(registerFixture('m-2', ['DEV-1','DEV-2'])));
  assert.equal(first.discoveryRevision, 1);
  assert.equal(second.discoveryRevision, 2);
  assert.deepEqual(second.devices.map(d => d.deviceId), ['DEV-1','DEV-2']);
});
```

- [ ] **Step 2: Run and verify the tests fail**

```bash
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/gateway-control/gateway-registration.service.spec.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement registration persistence and matching suggestions**

Use one transaction and row lock per broker/gateway identity:

```ts
async record(input:RegistrationInput):Promise<DiscoveredGatewayDetail> {
  const payload = parseGatewayControlPayload('register', input.payload);
  if (payload.gateway.gatewayId !== input.clientId) throw new Error('Gateway identity mismatch');
  return this.db.transaction(async client => {
    await this.enforceRateLimit(client, input);
    const row = await this.upsertDraftForUpdate(client, input, payload);
    await this.insertSnapshot(client, row.id, row.discoveryRevision, payload, input.sourceAddress);
    return this.loadDetail(client, row.id);
  });
}
```

Match presets by normalized manufacturer/model/profile ID and return ranked suggestions. Do not select a preset automatically when more than one candidate has the same rank. Preserve the complete gateway-reported mapping as a `gateway`-source draft.

- [ ] **Step 4: Register and export the new module/service**

`GatewayControlModule` imports `DatabaseModule`, provides/exports `GatewayRegistrationService`, and is imported once from `AppModule`.

- [ ] **Step 5: Run focused tests and API type checking**

```bash
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/gateway-control/gateway-registration.service.spec.ts
pnpm --filter @solar/api lint
```

Expected: PASS.

- [ ] **Step 6: Commit registration persistence**

```bash
git add apps/api/src/modules/gateway-control apps/api/src/app.module.ts
git commit -m "feat(mqtt): persist gateway registration snapshots"
```

### Task 4: Enforce Anonymous Quarantine and Permanent Credentials

**Files:**
- Create: `apps/api/src/modules/gateway-control/gateway-credential.service.ts`
- Test: `apps/api/src/modules/gateway-control/gateway-credential.service.spec.ts`
- Modify: `apps/api/src/modules/gateway-control/gateway-control.module.ts`
- Modify: `apps/api/src/modules/telemetry/mqtt-auth.controller.ts`
- Modify: `apps/api/src/modules/telemetry/mqtt-auth.spec.ts`
- Modify: `apps/api/src/modules/telemetry/telemetry.module.ts`

**Interfaces:**
- Produces: `issue(client, gatewayId, createdBy) -> {username, password}`, `verify(gatewayId, password) -> boolean`, and `rotate(...)`.
- Changes EMQX authentication so empty username/password is allowed only as a valid anonymous discovery identity; registered gateways require the active Argon2 credential.

- [ ] **Step 1: Replace permissive auth expectations with failing security tests**

```ts
it('allows anonymous connect only when clientid is a valid gateway identity', async () => {
  assert.deepEqual(await controller.authenticate({clientid:'GW-NEW-001'}), {result:'allow', is_superuser:false});
  assert.deepEqual(await controller.authenticate({clientid:'bad/topic'}), {result:'deny'});
});

it('denies registered gateway when password or client identity is wrong', async () => {
  assert.deepEqual(await controller.authenticate({clientid:'GW-REGISTERED',username:'GW-REGISTERED',password:'wrong'}), {result:'deny'});
  assert.deepEqual(await controller.authenticate({clientid:'OTHER',username:'GW-REGISTERED',password:'valid'}), {result:'deny'});
});

it('anonymous ACL grants only an exact own register publish', async () => {
  assert.deepEqual(await controller.authorize({clientid:'GW-NEW',username:'',action:'publish',topic:'solar/v1/gateways/GW-NEW/register'}), {result:'allow'});
  assert.deepEqual(await controller.authorize({clientid:'GW-NEW',username:'',action:'subscribe',topic:'solar/v1/gateways/GW-NEW/config'}), {result:'deny'});
});
```

Add registered ACL cases for own `configUpdate`, `configStatus`, `status`, approved-site telemetry, own `config` subscription, and own `dataAcept` subscription. Add denials for cross-gateway, cross-site, wildcard, inactive lifecycle, and unassigned device topics.

- [ ] **Step 2: Run auth tests and verify failure**

```bash
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/telemetry/mqtt-auth.spec.ts src/modules/gateway-control/gateway-credential.service.spec.ts
```

Expected: FAIL because current registered gateways accept arbitrary passwords and anonymous clients require a username.

- [ ] **Step 3: Implement credential issuance and verification with existing Argon2 dependency**

```ts
const password = randomBytes(32).toString('base64url');
const passwordHash = await argon2.hash(password, {type: argon2.argon2id});
await client.query(`UPDATE gateway_mqtt_credentials SET revoked_at=now()
  WHERE gateway_id=$1 AND revoked_at IS NULL`, [gatewayId]);
await client.query(`INSERT INTO gateway_mqtt_credentials
  (id,gateway_id,username,password_hash,created_by) VALUES($1,$2,$3,$4,$5)`,
  [randomUUID(),gatewayId,gatewayId,passwordHash,createdBy]);
return {username:gatewayId,password};
```

Never log or persist plaintext. Return it only from confirmation/rotation responses.

- [ ] **Step 4: Implement database-backed authentication and lifecycle-aware ACLs**

Use `effectiveIdentity = username || clientid` for anonymous authorization, but require all three identities to match after registration. Require the internal webhook header whenever `INTERNAL_MQTT_SECRET` is configured; missing and incorrect headers both deny.

The registered ACL query must return the gateway's external ID, assigned external site ID, lifecycle state, active devices, and active credential. Build exact regexes from escaped database identities rather than trusting the request username.

- [ ] **Step 5: Run security tests and telemetry module type checking**

```bash
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/telemetry/mqtt-auth.spec.ts src/modules/gateway-control/gateway-credential.service.spec.ts
pnpm --filter @solar/api lint
```

Expected: PASS.

- [ ] **Step 6: Commit authentication and ACL enforcement**

```bash
git add apps/api/src/modules/gateway-control apps/api/src/modules/telemetry/mqtt-auth.controller.ts apps/api/src/modules/telemetry/mqtt-auth.spec.ts apps/api/src/modules/telemetry/telemetry.module.ts
git commit -m "feat(emqx): quarantine anonymous gateway access"
```

### Task 5: Implement Atomic Assignment and Versioned Configuration APIs

**Files:**
- Create: `apps/api/src/modules/gateway-control/gateway-configuration.service.ts`
- Create: `apps/api/src/modules/gateway-control/gateway-onboarding.controller.ts`
- Test: `apps/api/src/modules/gateway-control/gateway-configuration.service.spec.ts`
- Test: `apps/api/src/modules/gateway-control/gateway-onboarding.controller.spec.ts`
- Modify: `apps/api/src/modules/gateway-control/gateway-control.module.ts`
- Modify: `apps/api/src/modules/assets/assets.controller.ts:76-188`
- Modify: `apps/api/src/modules/assets/gateway-lifecycle.ts`

**Interfaces:**
- Produces admin endpoints:
  - `GET /v1/gateways/discovered?status=unassigned|configuring|assigned|ignored`
  - `GET /v1/gateways/discovered/:id`
  - `POST /v1/gateways/discovered/:id/confirm`
  - `GET /v1/gateways/:id/sync-state`
  - `POST /v1/gateways/:id/credentials/rotate`
  - `GET /v1/gateways/:id/config-proposals`
  - `POST /v1/gateways/:id/config-proposals/:proposalId/approve`
  - `POST /v1/gateways/:id/config-proposals/:proposalId/reject`
- Produces `GatewayConfigurationService.confirmDiscovery()`, `.syncState()`, `.recordProposal()`, `.approveProposal()`, `.rejectProposal()`, `.recordConfigStatus()`, and `.recordConnectionStatus()`.

- [ ] **Step 1: Write failing transactional and conflict tests**

Cover stale `discoveryRevision` returning HTTP 409, invalid enabled device mapping, disabled incomplete device, reported/assigned site mismatch allowed, preset revision copy, manual local profile creation, complete register snapshot, credential one-time response, rollback on any insert failure, and existing active gateway/site uniqueness.

```ts
test('confirmation creates configuring gateway, devices, revision and credential atomically', async () => {
  const result = await service.confirmDiscovery(request, actorId);
  assert.equal(result.sync.lifecycleState, 'configuring');
  assert.equal(result.sync.configState, 'pending_sync');
  assert.equal(result.config.configVersion, 1);
  assert.equal(result.credential.username, 'GW-001');
  assert.ok(result.credential.password.length >= 32);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

```bash
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/gateway-control/gateway-configuration.service.spec.ts src/modules/gateway-control/gateway-onboarding.controller.spec.ts
```

Expected: FAIL because the service and controller do not exist.

- [ ] **Step 3: Implement confirmation as one database transaction**

Within the transaction:

1. Lock the discovery row and compare `discoveryRevision`.
2. Lock the selected active site and enforce its gateway constraint.
3. Validate every enabled device and resolve preset or local profile revision.
4. Insert the gateway as `configuring/pending_sync/offline` with its broker identity.
5. Insert devices with non-null `payload_profile_revision_id` for every enabled device.
6. Snapshot a self-contained configuration, compute `configHash`, and set desired version/hash.
7. Issue the permanent credential through `GatewayCredentialService`.
8. Mark discovery `configuring` and commit.

Use an explicit response that reveals the password once:

```ts
return {
  gatewayId, credential:{username:externalGatewayId,password},
  config:{configVersion:revision.version,configHash:revision.configHash},
  sync:await this.syncState(gatewayId),
};
```

- [ ] **Step 4: Implement immutable proposal approval**

`configUpdate` creates a `pending` proposal with `baseConfigVersion`. Approval locks the gateway and proposal, requires the base to equal the active version, creates the next desired immutable revision, and marks the proposal approved. Rejection records reviewer and reason without changing desired or active state.

- [ ] **Step 5: Replace old assignment endpoints and adapt lifecycle helpers**

Remove `AssetsController.assignDiscoveredGateway()` and its direct device creation. Keep the public route shape only through `GatewayOnboardingController`. Update lifecycle helpers to use config hashes and status names `received/applied/failed`; retain legacy acknowledgement columns as compatibility counters.

- [ ] **Step 6: Run service/controller/lifecycle tests**

```bash
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/gateway-control/*.spec.ts src/modules/assets/gateway-lifecycle.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the onboarding API**

```bash
git add apps/api/src/modules/gateway-control apps/api/src/modules/assets/assets.controller.ts apps/api/src/modules/assets/gateway-lifecycle.ts apps/api/src/modules/assets/gateway-lifecycle.spec.ts
git commit -m "feat(gateways): add atomic onboarding workflow"
```

### Task 6: Route MQTT Control Messages and Publish Retained Config

**Files:**
- Create: `apps/api/src/modules/gateway-control/gateway-control-message-handler.ts`
- Test: `apps/api/src/modules/gateway-control/gateway-control-message-handler.spec.ts`
- Modify: `apps/api/src/modules/gateway-control/gateway-control.module.ts`
- Modify: `apps/api/src/modules/telemetry/mqtt-ingestion.service.ts:34-235,338-350`
- Modify: `apps/api/src/modules/telemetry/mqtt-ingestion.service.spec.ts`
- Modify: `apps/api/src/modules/telemetry/multi-broker.spec.ts`
- Modify: `apps/api/src/modules/telemetry/mqtt-readiness.spec.ts`

**Interfaces:**
- Consumes: registration/configuration services from Tasks 3 and 5.
- Produces: `GatewayControlMessageHandler.handle({topic,payload,brokerId,clientMetadata})` and `MqttIngestionService.publishGatewayConfig(gatewayId, version)`.

- [ ] **Step 1: Write failing topic-routing and subscription tests**

Require every broker session, including a broker with zero assigned gateways, to subscribe successfully to:

```text
solar/v1/gateways/+/register
solar/v1/gateways/+/configUpdate
solar/v1/gateways/+/configStatus
solar/v1/gateways/+/status
solar/v1/sites/+/gateways/+/devices/+/telemetry
```

Verify `config` is never subscribed by the backend, each control topic reaches exactly one handler, refused SUBACK leaves readiness false, and the old site-scoped `configAck` is subscribed only when the compatibility flag is enabled.

- [ ] **Step 2: Run focused MQTT tests and verify failure**

```bash
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/gateway-control/gateway-control-message-handler.spec.ts src/modules/telemetry/mqtt-ingestion.service.spec.ts src/modules/telemetry/multi-broker.spec.ts src/modules/telemetry/mqtt-readiness.spec.ts
```

Expected: FAIL because the service only derives subscriptions from existing gateways and routes unknown telemetry as discovery.

- [ ] **Step 3: Implement the control message dispatcher**

```ts
async handle(input:GatewayControlMessage):Promise<void> {
  const route = parseGatewayControlTopic(input.topic);
  if (!route) throw new Error('Unsupported gateway control topic');
  const payload = parseGatewayControlPayload(route.kind, input.payload);
  assertPayloadGateway(route.gatewayId, payload);
  if (route.kind === 'register') await this.registration.record({...input,payload,clientId:route.gatewayId});
  if (route.kind === 'configUpdate') await this.configuration.recordProposal(input.brokerId,payload);
  if (route.kind === 'configStatus') await this.configuration.recordConfigStatus(input.brokerId,payload);
  if (route.kind === 'status') await this.configuration.recordConnectionStatus(input.brokerId,payload);
}
```

Record stable rejection metrics and structured logs without logging credential or full sensitive connection settings.

- [ ] **Step 4: Make broker sessions independent of assigned gateways**

Change remote broker discovery from an inner join on `gateways` to all configured `mqtt_brokers`. Build one deduplicated subscription set from constant control/data filters plus explicitly enabled legacy filters. The default broker subscribes to the same filters even when the database has no site or gateway.

- [ ] **Step 5: Replace `publishHardwareConfig` for standard gateways**

```ts
async publishGatewayConfig(gatewayId:string, version:number) {
  const revision = await this.configuration.desiredForPublish(gatewayId, version);
  const client = this.clientForBroker(revision.brokerId);
  if (!client?.connected) return {delivery:'pending' as const};
  await publishAsync(client, gatewayControlTopic(revision.externalGatewayId,'config'), revision.payload, {qos:1,retain:true});
  await this.configuration.recordPublished(gatewayId, version);
  return {delivery:'published' as const};
}
```

Keep legacy hardware config publishing behind an explicit legacy branch; no new standard flow uses the site-scoped `/config` or `/configAck` topic.

- [ ] **Step 6: Run MQTT tests and readiness assertions**

```bash
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/gateway-control/gateway-control-message-handler.spec.ts src/modules/telemetry/mqtt-ingestion.service.spec.ts src/modules/telemetry/multi-broker.spec.ts src/modules/telemetry/mqtt-readiness.spec.ts
```

Expected: PASS, including readiness only after all required SUBACKs are granted.

- [ ] **Step 7: Commit the MQTT control plane**

```bash
git add apps/api/src/modules/gateway-control apps/api/src/modules/telemetry/mqtt-ingestion.service.ts apps/api/src/modules/telemetry/mqtt-ingestion.service.spec.ts apps/api/src/modules/telemetry/multi-broker.spec.ts apps/api/src/modules/telemetry/mqtt-readiness.spec.ts
git commit -m "feat(mqtt): route gateway control plane"
```

### Task 7: Gate Telemetry and Correct Data Acceptance

**Files:**
- Modify: `apps/api/src/modules/telemetry/payload-ingestion.ts:20-107,148-240`
- Modify: `apps/api/src/modules/telemetry/payload-ingestion.spec.ts`
- Modify: `apps/api/src/modules/telemetry/gateway-discovery.spec.ts`
- Modify: `apps/api/src/modules/telemetry/payload-mqtt.spec.ts`
- Modify: `apps/api/src/modules/telemetry/payload-bundle-mqtt.spec.ts`

**Interfaces:**
- Consumes: gateway lifecycle, active version/hash, assigned site, and active device/profile data from Task 5.
- Produces: telemetry admission only for an active applied configuration and `dataAcept` only after durable commit or verified durable duplicate.

- [ ] **Step 1: Replace the false-discovery acceptance test with failing admission tests**

```ts
test('unknown telemetry is rejected without discovery, config push, or dataAcept', async () => {
  await ingest.acceptMany(topic, payload, null, ack => acknowledgements.push(ack));
  assert.equal(acknowledgements.length, 0);
  assert.equal(queries.some(q => q.sql.includes('INSERT INTO discovered_gateways')), false);
});

test('pending initial config rejects telemetry until exact version and hash are applied', async () => {
  assert.equal(await ingest.accept(activeTopic, payload, null), null);
});
```

Also cover an active previous revision continuing during a later pending desired revision, disabled devices, topic/site/gateway mismatch, duplicate replay, and commit failure.

- [ ] **Step 2: Run ingestion tests and verify failure**

```bash
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/telemetry/gateway-discovery.spec.ts src/modules/telemetry/payload-ingestion.spec.ts src/modules/telemetry/payload-mqtt.spec.ts src/modules/telemetry/payload-bundle-mqtt.spec.ts
```

Expected: FAIL because unknown telemetry currently creates discovery/config and emits accepted `dataAcept`.

- [ ] **Step 3: Remove telemetry-driven discovery and config publication**

Delete `recordDiscoveredGateway` and the unknown-context branch that manufactures acceptance. Unknown standard telemetry records a rejection reason only. Registration happens exclusively through the gateway-rooted `register` topic.

- [ ] **Step 4: Add lifecycle and applied-configuration predicates to entity lookup**

Require:

```sql
g.lifecycle_state = 'active'
AND g.applied_config_version > 0
AND g.active_config_hash IS NOT NULL
AND d.payload_profile_revision_id IS NOT NULL
```

When a later desired version is pending, use the active revision/profile bindings until the matching `applied` event advances them. Keep the existing transaction-before-ack and duplicate digest checks.

- [ ] **Step 5: Run ingestion regression tests**

```bash
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/telemetry/gateway-discovery.spec.ts src/modules/telemetry/payload-ingestion.spec.ts src/modules/telemetry/payload-mqtt.spec.ts src/modules/telemetry/payload-bundle-mqtt.spec.ts
```

Expected: PASS; no unpersisted message receives success `dataAcept`.

- [ ] **Step 6: Commit telemetry admission**

```bash
git add apps/api/src/modules/telemetry/payload-ingestion.ts apps/api/src/modules/telemetry/gateway-discovery.spec.ts apps/api/src/modules/telemetry/payload-ingestion.spec.ts apps/api/src/modules/telemetry/payload-mqtt.spec.ts apps/api/src/modules/telemetry/payload-bundle-mqtt.spec.ts
git commit -m "fix(mqtt): admit telemetry only after config application"
```

### Task 8: Add the Web Data Layer and Live Discovery Refresh

**Files:**
- Create: `apps/web/features/sites/gateway-onboarding-api.ts`
- Create: `apps/web/features/sites/gateway-onboarding-draft.ts`
- Test: `apps/web/features/sites/gateway-onboarding-draft.spec.ts`
- Modify: `apps/web/features/sites/gateway-workspace.tsx:40-70`
- Modify: `apps/web/features/sites/gateway-index.tsx`
- Modify: `apps/web/features/sites/gateway-index.spec.tsx`

**Interfaces:**
- Consumes: Task 1 API contracts and Task 5 endpoints.
- Produces: `useDiscoveredGateways()`, `useDiscoveredGateway(id)`, `useConfirmGateway()`, `useGatewaySyncState(id)`, `useGatewayConfigProposals(id)`, and pure draft conversion/validation helpers.

- [ ] **Step 1: Write failing draft and index tests**

Cover full device snapshot conversion, reported-site preselection without assignment, preset suggestion, manual fallback, disabled incomplete device, enabled invalid mapping, and stale discovery conflict.

Update the index SSR test to require visible `draft`, `pending_sync`, and `failed` labels and an explicit error surface instead of an empty count.

- [ ] **Step 2: Run focused web tests and verify failure**

```bash
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/sites/gateway-onboarding-draft.spec.ts features/sites/gateway-index.spec.tsx
```

Expected: FAIL because the query/draft modules and lifecycle labels do not exist.

- [ ] **Step 3: Implement TanStack Query hooks with bounded polling**

```ts
export function useDiscoveredGateways() {
  return useQuery({
    queryKey:['gateways','discovered'],
    queryFn:()=>apiClient.get<DiscoveredGatewayRow[]>('/v1/gateways/discovered'),
    refetchInterval:5_000,
    refetchIntervalInBackground:false,
  });
}
```

Mutations invalidate discovery, gateway index, detail, sync, and proposal keys after success. Errors remain in query state and are rendered through the existing `Alert` component.

- [ ] **Step 4: Implement pure draft mapping and validation**

Reuse `newDeviceDraft`, `selectDevicePreset`, `deviceProfilePayload`, and `validateDeviceProfile`. Keep reported data immutable and editable values in a separate draft. Send `discoveryRevision` on confirmation.

- [ ] **Step 5: Replace the one-shot swallowed discovery fetch**

Remove `.catch(() => {})` from `GatewayWorkspace`. Use the query hook and show a destructive `Alert` with retry action. Keep registered rows independently usable if discovery loading fails.

- [ ] **Step 6: Run focused tests and web type checking**

```bash
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/sites/gateway-onboarding-draft.spec.ts features/sites/gateway-index.spec.tsx
pnpm --filter @solar/web lint
```

Expected: PASS.

- [ ] **Step 7: Commit the web data layer**

```bash
git add apps/web/features/sites/gateway-onboarding-api.ts apps/web/features/sites/gateway-onboarding-draft.ts apps/web/features/sites/gateway-onboarding-draft.spec.ts apps/web/features/sites/gateway-workspace.tsx apps/web/features/sites/gateway-index.tsx apps/web/features/sites/gateway-index.spec.tsx
git commit -m "feat(web): refresh gateway discovery state"
```

### Task 9: Build the Four-Step Pairing and Sync Dialog

**Files:**
- Modify: `apps/web/features/sites/pair-discovered-gateway-dialog.tsx`
- Create: `apps/web/features/sites/gateway-discovery-review.tsx`
- Create: `apps/web/features/sites/gateway-device-configuration.tsx`
- Create: `apps/web/features/sites/gateway-sync-status.tsx`
- Modify: `apps/web/features/sites/gateway-workspace.tsx`
- Modify: `apps/web/features/sites/gateway-modals.spec.tsx`
- Create: `apps/web/features/sites/gateway-pairing-flow.spec.tsx`

**Interfaces:**
- Consumes: Task 8 hooks/draft and existing `PresetPicker`, `DeviceProfileEditor`, `DeviceFieldRegisterEditor`, `Dialog`, `Tabs`, `Alert`, `Badge`, `Field`, `Button`, `Input`, `Select`, `Skeleton`, and `Spinner`.
- Produces: the approved review → site → devices/mappings → confirmation → sync experience.

- [ ] **Step 1: Write failing static and pure interaction-state tests**

Assert the dialog exposes four named steps, preselects but does not assign `reportedSiteId`, warns on a different selected site, permits manual mapping, disables confirmation for invalid enabled devices, allows disabled incomplete devices, and renders credential/config sync states after confirmation.

Add source-level guard assertions that the new files import controls from `components/ui` and do not contain raw `<input`, `<select`, `<table`, or `<dialog` tags.

- [ ] **Step 2: Run pairing tests and verify failure**

```bash
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/sites/gateway-modals.spec.tsx features/sites/gateway-pairing-flow.spec.tsx
```

Expected: FAIL because the current modal has one site/name form only.

- [ ] **Step 3: Implement the dialog shell with existing shadcn components**

Use `DialogContent` with `data-slot="dialog-body"`, existing responsive sizing, controlled step state, and `DialogFooter`. Use `Tabs` as the step navigation without allowing users to skip validation. Use `Alert` for mismatches/errors, `Badge` for matching states, `Skeleton`/`Spinner` for async state, and existing `Field`/`Label` controls for accessible errors.

- [ ] **Step 4: Implement gateway/site review and device configuration**

`GatewayDiscoveryReview` renders immutable gateway facts and site selection. `GatewayDeviceConfiguration` reuses existing preset/manual editors per device, displays mapping source, and allows a device to be disabled. Do not duplicate register editor logic or hard-code status colors.

- [ ] **Step 5: Implement confirmation, one-time credential display, and live sync**

After `POST /confirm`, retain the returned plaintext password only in component memory. Render copy actions through existing `Button`, never store it in browser storage, and warn that closing discards it. Poll sync state until `applied`, `failed`, or the dialog closes. Provide credential rotation only through the explicit API and a confirmation dialog.

- [ ] **Step 6: Handle stale discovery revision without losing deliberate edits silently**

On HTTP 409, show an `Alert` explaining that the gateway snapshot changed, disable confirmation, and offer a reload action. Reload reconstructs a draft from the latest full snapshot; it does not merge register arrays implicitly.

- [ ] **Step 7: Run UI tests, accessibility-oriented assertions, and type checking**

```bash
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/sites/gateway-modals.spec.tsx features/sites/gateway-pairing-flow.spec.tsx
pnpm --filter @solar/web test
```

Expected: PASS, with no raw replacement controls in the new workflow.

- [ ] **Step 8: Commit the pairing workflow**

```bash
git add apps/web/features/sites/pair-discovered-gateway-dialog.tsx apps/web/features/sites/gateway-discovery-review.tsx apps/web/features/sites/gateway-device-configuration.tsx apps/web/features/sites/gateway-sync-status.tsx apps/web/features/sites/gateway-workspace.tsx apps/web/features/sites/gateway-modals.spec.tsx apps/web/features/sites/gateway-pairing-flow.spec.tsx
git commit -m "feat(web): add gateway pairing and sync workflow"
```

### Task 10: Add Proposal Approval and Operational Status Views

**Files:**
- Create: `apps/web/features/sites/gateway-config-proposals.tsx`
- Test: `apps/web/features/sites/gateway-config-proposals.spec.tsx`
- Modify: `apps/web/features/sites/gateway-detail-page-view.tsx`
- Modify: `apps/web/features/sites/gateway-detail-page-view.spec.tsx`
- Modify: `apps/web/features/sites/gateway-index.tsx`

**Interfaces:**
- Consumes: proposal/sync hooks from Task 8 and approval APIs from Task 5.
- Produces: admin review of complete `configUpdate` proposals plus distinct lifecycle, config, connection, and telemetry-freshness indicators.

- [ ] **Step 1: Write failing proposal and status tests**

Require pending/stale/approved/rejected labels, base-versus-active version display, device/register change summary, approve/reject actions, and separate badges for `active`, `offline`, `drifted`, and stale telemetry.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/sites/gateway-config-proposals.spec.tsx features/sites/gateway-detail-page-view.spec.tsx
```

Expected: FAIL because proposal review does not exist and current status conflates connection with lifecycle.

- [ ] **Step 3: Implement proposal review with existing components**

Use `Card`, `Badge`, `DataTable`, `AlertDialog`, `Button`, and existing device/profile display helpers. Approval is disabled for stale proposals and submits the expected proposal/base version. Rejection requires a non-empty reason through existing form components.

- [ ] **Step 4: Separate lifecycle, configuration, connection, and freshness in gateway views**

Display:

```text
Assignment: Discovered | Configuring | Active | Disabled
Configuration: Draft | Pending sync | Applied vN | Failed | Drifted
Connection: Online | Offline | Unknown
Telemetry: Last received timestamp and freshness
```

Reuse semantic badge variants; extend `Badge` centrally only if no suitable status variant exists.

- [ ] **Step 5: Run UI tests and commit**

```bash
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/sites/gateway-config-proposals.spec.tsx features/sites/gateway-detail-page-view.spec.tsx features/sites/gateway-index.spec.tsx
git add apps/web/features/sites/gateway-config-proposals.tsx apps/web/features/sites/gateway-config-proposals.spec.tsx apps/web/features/sites/gateway-detail-page-view.tsx apps/web/features/sites/gateway-detail-page-view.spec.tsx apps/web/features/sites/gateway-index.tsx
git commit -m "feat(web): review gateway config proposals"
```

### Task 11: Harden EMQX Deployment and Document MQTTBox Setup

**Files:**
- Modify: `infra/docker/docker-compose.emqx.yml`
- Modify: `infra/docker/emqx/emqx.conf`
- Modify: `infra/docker/.env.emqx.example`
- Modify: `infra/docker/docker-compose.web.yml`
- Modify: `infra/docker/docker-compose.staging.yml`
- Modify: `docs/runbooks/coolify-mqtt-deployment-th.md`
- Create: `docs/runbooks/gateway-mqtt-onboarding-th.md`
- Create: `apps/api/src/modules/gateway-control/fixtures/register-v1.1.json`
- Create: `apps/api/src/modules/gateway-control/fixtures/config-update-v1.1.json`
- Create: `apps/api/src/modules/gateway-control/fixtures/config-status-v1.1.json`
- Create: `apps/api/src/modules/gateway-control/fixtures/status-v1.1.json`

**Interfaces:**
- Consumes: exact topics, payloads, auth rules, and EMQX 5.8.3 boundary from prior tasks.
- Produces: one reproducible deployment and copy/paste MQTTBox workflow.

- [ ] **Step 1: Add configuration assertions before changing compose**

Extend an API/infrastructure test to read the compose/config files and assert:

```ts
assert.match(compose, /emqx\/emqx:5\.8\.3/);
assert.match(compose, /x-internal-secret/);
assert.doesNotMatch(compose, /"verify":"verify_none"/);
assert.match(compose, /MQTT_URL/);
```

- [ ] **Step 2: Run the assertion and verify failure**

```bash
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/gateway-control/emqx-deployment.spec.ts
```

Expected: FAIL because outgoing HTTP auth TLS currently uses `verify_none` and no internal secret header.

- [ ] **Step 3: Harden EMQX HTTP authentication and authorization calls**

Add `x-internal-secret` to both webhook sources from a required environment value. Enable peer verification and server-name indication for `solar.fowir.com`; mount/use a CA bundle supported by the image. Keep public MQTTS on 8883 and the backend listener inside the private network. Replace dashboard default credentials in examples with required secrets.

- [ ] **Step 4: Align API broker variables across deployment files**

Set `MQTT_ENABLED=true`, `MQTT_DEFAULT_BROKER_ENABLED=true`, the same EMQX `MQTT_URL`, `MQTT_USERNAME=solar-backend`, matching `MQTT_PASSWORD`, and `INTERNAL_MQTT_SECRET`. Remove staging instructions that point the API to a separate managed Mosquitto when EMQX is the selected broker.

- [ ] **Step 5: Write the Thai gateway/MQTTBox runbook and fixtures**

Document two stages:

1. Anonymous MQTTBox client sets Client ID `GW-TEST-001`, leaves username/password empty, and publishes the full snapshot to `solar/v1/gateways/GW-TEST-001/register`.
2. After admin confirmation, reconnect with returned username/password, subscribe to `config` and `dataAcept`, publish `configStatus`, `status`, canonical telemetry, and a full `configUpdate` proposal.

Include expected EMQX client/subscription counts, API `/ready/mqtt` output, tab/status transitions, retained flags, QoS values, and failure diagnostics.

- [ ] **Step 6: Validate compose rendering and test fixtures**

```bash
docker compose --env-file infra/docker/.env.emqx.example -f infra/docker/docker-compose.emqx.yml config
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/gateway-control/gateway-control-payload.spec.ts src/modules/gateway-control/emqx-deployment.spec.ts
```

Expected: compose renders without missing variables when test-safe values are supplied; every fixture passes the strict payload parser.

- [ ] **Step 7: Commit deployment and operator documentation**

```bash
git add infra/docker docs/runbooks apps/api/src/modules/gateway-control/fixtures apps/api/src/modules/gateway-control/emqx-deployment.spec.ts
git commit -m "docs(mqtt): align EMQX onboarding deployment"
```

### Task 12: Prove the End-to-End Flow with a Real Broker

**Files:**
- Create: `apps/api/src/scripts/verify-gateway-onboarding.ts`
- Create: `apps/api/src/modules/gateway-control/gateway-onboarding.e2e.spec.ts`
- Modify: `apps/api/package.json`
- Create: `docs/reports/2026-10-19-gateway-onboarding-verification.md`

**Interfaces:**
- Consumes: every previous task.
- Produces: `pnpm --filter @solar/api verify:gateway-onboarding` and a durable verification report.

- [ ] **Step 1: Write the skipped-unless-configured E2E test**

Require `MQTT_E2E_URL`, `DATABASE_URL`, `E2E_ADMIN_ACCESS_TOKEN`, and `E2E_SITE_ID`. The test must fail rather than silently skip when `MQTT_E2E_REQUIRED=true`.

```ts
test('register -> approve -> config -> applied -> telemetry -> dataAcept',
  {skip: !process.env.MQTT_E2E_URL && process.env.MQTT_E2E_REQUIRED !== 'true'},
  async () => { /* invoke the real harness */ });
```

- [ ] **Step 2: Implement the real MQTT/API harness**

The script performs and asserts this sequence:

1. Connect anonymously with a unique gateway ID.
2. Verify a config subscription is denied.
3. Publish `register` and poll the admin API until the unconnected row appears.
4. Confirm it against the configured test site with a valid manual or preset mapping.
5. Capture the one-time credential, disconnect, and reconnect authenticated.
6. Subscribe to retained `config` and assert version/hash.
7. Publish `configStatus: received` and `applied`.
8. Verify the gateway moves to active/connected.
9. Publish canonical telemetry and receive matching `dataAcept` only after the database row exists.
10. Replay the same QoS 1 message and assert no duplicate reading.
11. Publish full `configUpdate`, approve it through the API, receive the next retained config, and apply it.
12. Exercise online, graceful offline, abnormal Last Will, and reconnect.
13. Attempt cross-site/cross-gateway topics and assert authorization denial.

- [ ] **Step 3: Add the package script and run focused unit/integration suites first**

```json
"verify:gateway-onboarding": "tsx src/scripts/verify-gateway-onboarding.ts"
```

Run:

```bash
pnpm --filter @solar/api test
pnpm --filter @solar/web test
```

Expected: PASS before starting the broker E2E test.

- [ ] **Step 4: Run the real broker verification**

```bash
pnpm --filter @solar/api verify:gateway-onboarding
```

Expected: every lifecycle assertion passes; EMQX shows the backend wildcard subscriptions and the authenticated gateway's exact subscriptions.

- [ ] **Step 5: Run repository-wide verification**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 6: Write the verification report with exact evidence**

Record the tested commit, EMQX version, environment, topic list, message IDs, config versions/hashes, database evidence, UI states, test commands, results, and any physical-hardware limitation. Do not claim PM2230 register correctness without the real verified device profile and hardware.

- [ ] **Step 7: Commit the E2E harness and evidence**

```bash
git add apps/api/src/scripts/verify-gateway-onboarding.ts apps/api/src/modules/gateway-control/gateway-onboarding.e2e.spec.ts apps/api/package.json docs/reports/2026-10-19-gateway-onboarding-verification.md
git commit -m "test(mqtt): verify gateway onboarding end to end"
```

## Final Review Gate

- [ ] Confirm the spec requirements map to Tasks 1-12 with no omitted topic, state, UI, security, migration, or deployment behavior.
- [ ] Run a targeted red-flag scan and confirm the plan contains no unfinished markers, omitted implementation blocks, or vague instructions.
- [ ] Confirm contract names and payload fields are identical across shared types, API validators, MQTT handler, web hooks, fixtures, and runbook.
- [ ] Confirm `git status --short` contains no unrelated staged files before the final commit or pull request.
