# Site / gateway / telemetry implementation report

Implemented in the existing checkout, preserving prior site-creation/configuration work. No deployment, seed, migration execution or commits performed.

## Behavior

- MQTT only; subscriptions come from provisioned gateway topics. Generated topic is `energy/{gatewayName}/#` or `/{gatewayName}/#`. Response/config/ACK traffic is rejected before ingestion.
- Exact device UUID/serial and matching gateway topic required; unknown/ambiguous identities have no fallback, writes, volatile readings or ACK.
- Source timestamp required; server receipt timestamp recorded separately. Stable replay identity, raw insert and aggregate update commit together. ACK follows COMMIT, including a safe durable-duplicate ACK. Persistence errors propagate without ACK.
- Metrics remain NULL when absent; W/kW precedence corrected and finite values enforced. Raw register words validated; byte order and word order honored; mapping versions selected using source time and IDs recorded with each raw sample.
- Latest readings queried from durable storage in source-time order, including after restart. Realtime includes 120 seconds; older measurements are stale/offline. No synthetic live metrics, raw registers, default model or online state.
- Mapping edits retire previous versions and INSERT new immutable IDs, including required byte_order. Deletes retire versions rather than erase historical mappings.
- Site creation is offline until telemetry arrives. One school/site/gateway constraints have non-destructive migration preflight errors listing legacy conflicts. Concurrent school-name creation is serialized. Many meters supported through site device list/add API; edit targets an individual meter rather than all devices.
- School is entered as text; gateway topic is generated/read-only; MQTT is the only protocol. Preset register lists are visible. Meter serial labels are explicit. Settings expose hardware push interval, alert thresholds and severity. Config is published to the named gateway with QoS1/retain; saved interval/rules are republished after reconnect. Responses distinguish published/pending; they do not claim physical hardware application.
- Owner UI is view-only (admin configuration forms); root's global guard enforces server authorization. School/site collection reads use the principal's school assignment; unassigned school users receive empty collections.

## Edited files owned by this slice

- apps/api/src/modules/assets/assets.controller.ts
- apps/api/src/modules/telemetry/mqtt-ingestion.service.ts
- apps/api/src/modules/telemetry/mqtt-ingestion.service.spec.ts (new)
- apps/api/src/modules/telemetry/telemetry.controller.ts
- apps/api/src/modules/telemetry/telemetry.controller.spec.ts (new)
- apps/web/features/sites/site-form-dialog.tsx
- apps/web/features/sites/site-edit-dialog.tsx
- apps/web/features/sites/site-telemetry-dialog.tsx
- infra/migrations/010_telemetry_integrity.sql (new; root registers via migration ledger)
- docs/gateway-implementation-report.md

## Verification

- `pnpm --filter @solar/api exec tsx --test src/modules/telemetry/mqtt-ingestion.service.spec.ts src/modules/telemetry/telemetry.controller.spec.ts`: 11 passed.
- `pnpm --filter @solar/api lint`: passed.
- `pnpm --filter @solar/web lint`: passed.
- Regression coverage: own response/config rejection, unknown devices, unit precedence/absent values, failed write without ACK, identical replay, late sample ordering, 120s boundary, different gateway topic rejection, missing timestamp/nonfinite value rejection, actual byte-order fixture, immutable mapping insert and byte_order, no-data response.
- Initial regression run was blocked by incomplete rxjs installation, then missing domain build. After root repaired dependencies and domain was built, tests executed. Byte-order fixture was observed failing (105.86 versus 230.81), then passed after correction. Other initial tests were written before implementation but could not execute against old implementation due dependency failure.
- Installed Next use-client guide and apps/web/AGENTS.md read before web edits.

## Remaining validation / limitations

- No live PostgreSQL/Timescale or MQTT broker was available for transaction, duplicate concurrency, QoS reconnect, migration rehearsal or hardware application tests. Database-dependent tests substitute only the database boundary and do not prove PostgreSQL SQL execution.
- Migration 010 intentionally aborts with actionable IDs when legacy school/site/gateway/mapping conflicts exist. Reconcile those records and rehearse migration on a disposable copy before production application; no rows are deleted automatically.
- Broker publication confirms QoS delivery to broker, not hardware application. Hardware-side config acknowledgement is not fabricated. Threshold/severity rules are saved and delivered to the gateway; actual firmware alarm behavior requires hardware acceptance testing.
- The live dialog shows the latest site sample and its device, while gateway settings enumerate all devices. Cross-device graphs are handled by the dashboard slice.
- Additional devices use selected presets; none becomes a billing meter automatically. Existing billing-meter selection is preserved.
- Native browser acceptance and hardware fixture coverage for each supported meter model remain integration checks.
