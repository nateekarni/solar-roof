# Internal release checklist — Gateway pilot

Status: preparing a handoff draft is authorized. This checklist is not a deployment report.

## Before issuing a ready-to-connect sheet

- [ ] Resolve current image runtime, environment, migrations and readiness blockers in the staging plan.
- [ ] Configure existing Coolify project and agreed main -> CI -> tested images -> auto-deploy workflow.
- [ ] Confirm available server headroom with the full stack; preserve other applications.
- [ ] Configure and verify solar.fowir.com and mqtt-solar.fowir.com, DNS, listener port, TLS trust and firewall.
- [ ] Configure per-Gateway authentication, publish/subscribe ACL and durable broker/database storage.
- [ ] Provision actual school/site/gateway/device; record exact topic prefix and serial-to-device UUID mapping. Never run destructive demo seed on real staging data.
- [ ] Agree timestamp, energy semantics, retry timeout/backoff, offline persistence and replay rate with firmware owner.
- [ ] With isolated test identity, publish a uniquely correlated fresh sample -> receive post-commit application ACK -> verify durable DB row -> verify authenticated API and browser value.
- [ ] Check invalid credentials/cross-Gateway topics are rejected, and identical replay does not duplicate the durable sample.
- [ ] Establish recoverable backups before accumulating real telemetry; rehearse restore separately.
- [ ] Replace pending connection-sheet fields with verified values; deliver credentials separately.

## After first connection

- [ ] Coordinate first hardware sample and compare meter/source time, payload, ACK and UI.
- [ ] Observe live pilot, disconnect/reconnect, buffered replay and restart recovery; investigate mismatches with exact ingestionId/sourceTime.
- [ ] Continue broader all-role E2E with separate database/broker and test personas.

Continuous 24-hour soak is deferred by user choice. This does not remove the short connection/persistence/display check before declaring the endpoint ready. No credentials, connection attempts or external messages are implied by creating these files.

Source of contract: apps/api/src/modules/telemetry/mqtt-ingestion.service.ts (working-tree snapshot read 2026-09-30). Historical ADR0005 contains HTTPS fallback and topic descriptions that differ from current code; the external draft follows the current implementation. Raw decoding needs model-specific mapping fixtures. No live broker/database validation was performed while preparing the draft.
