# Task 2 — durable payload API and ingestion

Implementation ready for review. Migration **024 is not applied**. No reset, seed runner, staging, commit, or broker publication was performed by this task. Prior dirty UI/API changes were preserved.

## API contract

All route identifiers (`sites/:id`, `devices/:id`) are internal UUIDs and continue through PlatformAccessGuard ownership checks. MQTT external aliases never occupy body.siteId. Existing role policy is unchanged: site/device writes require admin; profile revision writes require owner/admin and settings access. The local integration account is admin.

- `GET /v1/settings/payload-presets`: bare array `[{id,profileId,version,config,createdAt}]`, ordered by profile and newest creation time. Default IDs: `00000000-0000-4000-8000-000000000001` (PM2230), `00000000-0000-4000-8000-000000000002` (SmartLogger).
- `POST /v1/settings/payload-presets`: `{config: PayloadProfile}` → one revision in the same shape. Config is the Task1 declarative schema, strict and bounded. Invalid config is 400; duplicate `(config.id,config.version)` is 409. Editing means creating a new version. Active-power mappings must target W and at most one active-power role is allowed.
- `POST /v1/sites`: existing fields plus `payloadProfileRevisionId,externalSiteId,externalGatewayId,externalDeviceId`. Payload mode requires all three external aliases and a nonlogger profile with a billing-import role. Serial remains required. `meterPresetId` and payload profile are mutually exclusive. Site, gateway, meter binding and billing meter are committed together; return retains existing site response and configDelivery. Registered subscription is generated from aliases; caller endpoint does not override it.
- `POST /v1/sites/:id/devices`: existing `{name,model,serialNumber,slaveId?}` plus `{payloadProfileRevisionId,externalDeviceId}`. Response retains `{id,siteId,gatewayId}`. A standard gateway requires payload mode; payload device on a legacy gateway is rejected. SmartLogger becomes device_type logger and creates no billing assignment. External alias must be unique within its gateway.
- `GET /v1/sites/:id/devices`: existing device fields plus `externalDeviceId,payloadProfileRevisionId`.
- `PATCH /v1/devices/:id/payload-profile`: `{payloadProfileRevisionId}` → `{id,payloadProfileRevisionId,profileId,profileVersion}`. Requires an existing payload identity; cannot change meter/logger device type or remove a billing-import role from an active billing meter. Changes only the assignment, never historical rows.
- `PATCH /v1/sites/:id`: routine friendly gateway name/config edits preserve the standard endpoint derived from stored external aliases. Changing the standard endpoint is rejected.
- `GET /v1/sites/:id/payload-config`: `{siteId,externalSiteId,gatewayId,externalGatewayId,subscriptionTopic,ackTopic,devices,rejections,unmappedMessages}`. Devices are `[{id,name,externalDeviceId,profileRevisionId,profileId,profileVersion,telemetryTopic,fixture}]`. Each fixture is ready to publish and contains one configured field, fresh timestamps, a fresh messageId, and the exact assigned profile reference. Rejections: `[{topic,reason,receivedAt}]`, newest 100. Unmapped messages: `[{deviceId,messageId,unmapped:[{tag,rawValue,rawUnit}],receivedAt}]`, newest 20 with unconfigured fields.
- `GET /v1/sites/:id/live-telemetry`: existing snapshot shape plus `canonicalFields:[{deviceId,deviceName,tag,value,unit,rawValue,rawUnit,polledAt,receivedAt,quality,communication,profileId,profileVersion,pollGroup,ageSeconds,stale}]`. DISTINCT ON selects latest per device/tag by polledAt, receivedAt, id. Old readings remain present but stale after 120 seconds. Late samples do not replace newer fields. Logger-first data remains visible before the billing meter reports. Compatibility metrics merge fresh healthy fields belonging to the billing meter across independent groups; logger values never replace them. Bad/offline or stale values remain visible in canonicalFields but compatibility values are null. Aggregate snapshot quality becomes Bad when a billing field is poor.

Topics use the external aliases:

```text
subscription: solar/v1/sites/{externalSiteId}/gateways/{externalGatewayId}/devices/+/telemetry
publish:      solar/v1/sites/{externalSiteId}/gateways/{externalGatewayId}/devices/{externalDeviceId}/telemetry
ACK:          solar/v1/sites/{externalSiteId}/gateways/{externalGatewayId}/dataAcept
hardware:     solar/v1/sites/{externalSiteId}/gateways/{externalGatewayId}/config
```

Identifiers contain 1–128 letters, digits, underscores or hyphens. Control suffixes/types never ingest; an allowed alias named config or ack inside a standard telemetry topic remains valid.

Successful ACK has exactly these supplied keys (no deviceId/duplicate/legacy status ACK):

```json
{"schemaVersion":"1.1","messageType":"dataAcept","siteId":"external-site","gatewayId":"external-gateway","lotNumber":1,"messageId":"logical-message-id","status":"accepted","acceptedAt":"ISO timestamp"}
```

## Durable storage and behavior

`infra/migrations/024_payload_profiles.sql` is additive and registered in the explicit db-migrate list. It creates:

- `payload_profile_revisions`: uuid id, profile_id, version, config jsonb, created_at; unique profile/version. A BEFORE UPDATE OR DELETE trigger makes revisions immutable. Seed INSERTs contain the exact validated Task1 default config JSON.
- External alias columns on sites/gateways/devices and device `payload_profile_revision_id` FK. Site alias unique globally; gateway alias scoped to site; device alias scoped to gateway. Identifier checks constrain aliases. A gateway constraint and trigger verify generated standard topics against the registered site's alias and gateway alias while retaining legacy energy/name/# subscriptions.
- `payload_messages`: unique gateway/device/message_id; logical digest, original accepted_at, profile_revision_id, lot_number, sequence, polled_at, sent_at, raw_payload and unmapped jsonb. Concurrent ON CONFLICT waits for the committed original; a subsequent SELECT compares digest. Changed sentAt remains a duplicate. Existing message's original profile config supports a durable retry after explicit revision upgrade.
- `payload_samples`: message/site/gateway/device/profile lineage, tag and canonical/raw numeric values and units, poll group, original polled/measured time, received time and distinct quality/communication. Latest field index orders site/device/tag/time. Values are never fabricated for absent fields.
- `payload_rejections`: registered site/gateway context, topic, bounded reason and received_at. Insert cleanup bounds diagnostics to the latest 100 per gateway. Topic-owned context is resolved before validating body aliases; wrong body.siteId never relocates diagnostics to another site. Unknown completely unregistered topics cannot be attached to a user's diagnostic scope.
- `telemetry_raw.payload_profile_revision_id` FK preserves original revision without repurposing mapping_version_id.

Acceptance commits message, samples, raw projection and existing energy_raw_dirty trigger work in one transaction. Rollback produces no ACK; duplicate produces no sample/raw/dirty writes and ACK keeps original acceptedAt. Samples retain bad quality while raw quality is invalid and raw cumulative billing energy is null, preventing billing/dashboard leakage. Healthy historical source age uses partial quality. Only assigned billing-import energy feeds raw total_energy_kwh; export, yield and reactive energy cannot substitute. Active-power compatibility projection additionally checks W.

Worker `refresh-energy-summary.job.ts` uses COALESCE(mapping_version_id,payload_profile_revision_id) for lineage/conflict checks. Crossing a profile revision results in missing/invalid_sample rather than a silently combined billing delta. Existing readings are not rewritten. The worker scope extension was explicitly authorized by the controller.

Existing owned ingress pool, limiter budgets, connection readiness restoration and bounded shutdown/drain semantics are retained. ACK occurs after awaited COMMIT and still respects the existing ACK/drain deadline.

## Files

New: `infra/migrations/024_payload_profiles.sql`; `apps/api/src/modules/telemetry/payload-ingestion.ts`, `payload-ingestion.spec.ts`, `payload-mqtt.spec.ts`; `apps/api/src/modules/settings/payload-presets.controller.ts`, `payload-presets.controller.spec.ts`; `apps/api/src/modules/assets/payload-provisioning.spec.ts`; `apps/worker/test/payload-energy-lineage.test.ts`; this report.

Modified: `apps/api/src/scripts/db-migrate.ts`; `apps/api/src/modules/settings/settings.module.ts`; `apps/api/src/modules/assets/assets.controller.ts`; `apps/api/src/modules/telemetry/mqtt-ingestion.service.ts`; Task1 `payload-profile.ts` and `payload-profile.spec.ts` (authorized active-power validation extension); `apps/worker/src/jobs/refresh-energy-summary.job.ts`.

## Verification

Used test-driven-development and verification-before-completion skills. Ingestion/provisioning/MQTT/role/staleness tests were observed failing for missing behavior before implementation. Initial tsx sandbox invocation failed with uv_os_get_passwd ENOMEM; focused tsx runs were then executed with approved escalation. API tsc runs require no database.

Final command (repository root, PowerShell login:false):

```text
node_modules/.bin/tsx.cmd --tsconfig apps/api/tsconfig.json --test apps/api/src/modules/telemetry/payload-profile.spec.ts apps/api/src/modules/telemetry/payload-ingestion.spec.ts apps/api/src/modules/telemetry/payload-mqtt.spec.ts apps/api/src/modules/settings/payload-presets.controller.spec.ts apps/api/src/modules/assets/payload-provisioning.spec.ts apps/api/src/modules/telemetry/mqtt-ingestion.service.spec.ts apps/api/src/modules/telemetry/mqtt-readiness.spec.ts
```

Result: 39 tests, 39 pass, 0 fail, exit 0. Existing deliberate deadline/restoration failure tests emit expected Nest warnings. Coverage includes aftercommit exact ACK, rollback/no ACK, replay sentAt, conflict rejection, prior revision retry, body/topic isolation, poor quality, independent groups, late persistence, logger-first visibility, stale compatibility values, revision collisions, logger provisioning and mixed-mode rejection.

```text
node_modules/.bin/tsc.cmd --noEmit -p apps/api/tsconfig.json
node_modules/.bin/tsx.cmd --tsconfig apps/worker/tsconfig.test.json --test apps/worker/test/payload-energy-lineage.test.ts
node_modules/.bin/tsc.cmd --noEmit -p apps/worker/tsconfig.test.json
```

Results: API typecheck exit 0; worker focused test 1 pass/0 fail/exit 0; worker typecheck exit 0. Worker test models lineage-aware database aggregation and verifies derived daily energy becomes missing across an upgrade.

## Remaining verification and concerns

Migration DDL and real PostgreSQL concurrent conflict behavior need the controller's reviewed migration application/integration run. Unit tests use DB mocks; they do not certify PostgreSQL triggers, broker delivery or physical Gateway/Modbus behavior.

Canonical profile/message/sample evidence currently persists independently without an automatic aging/archival cleanup policy. Existing raw archive export includes the new raw FK through row_to_json; immutable configs remain in DB and canonical samples/messages are not removed by raw retention. Exporting/restoring full canonical evidence as a standalone archive is a future lifecycle extension, not implemented here.

No production deployment or hardware configuration validation was performed. The existing role policy excludes owner from site/device writes; it is preserved as requested. Existing legacy telemetry and prior dirty work remain available.
