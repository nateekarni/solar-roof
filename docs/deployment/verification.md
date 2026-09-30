# Deployment verification — 2026-09-30

Current target: Coolify staging, `solar.nateekarn.dev`, MQTT TLS `mqtt-solar.nateekarn.dev:8883`. Local verification below used localhost; see the domain update note below.

This records local evidence. No remote deployment, DNS change, public certificate issuance, GitHub publication, or production credential provisioning has been performed.

## Implemented

- Three pinned Node/pnpm application Dockerfiles, nonroot runtime, secret/build-artifact exclusions.
- Staging Compose with persistent PostgreSQL/TimescaleDB, Redis, authenticated Mosquitto, S3 storage, migrations, bucket initialization and dependency readiness. Only MQTT TLS is host-published; web is routed by Coolify.
- Managed Cloudflare DNS-01 certificate image with atomic named-volume export and renewal; embedded broker configuration and environment-derived per-Gateway credentials.
- Non-destructive administrator bootstrap and database backup script.
- PR checks and main build/test/publish pipeline; deployment consumes the same tested image IDs by digest. Initial deploy-enable gate, target validation, main-SHA validation and deployment serialization.
- Isolated integration/browser tests, all five roles, school isolation, MQTT persistence/replay and restart durability.

## Evidence

| Check | Result |
|---|---|
| Workspace lint | PASS, all 8 package tasks |
| Workspace tests | PASS, all 8 package tasks; API 44 pass, 1 DB-dependent skip in unit invocation |
| Deploy-helper tests | PASS, 10 tests including bad target, active deploy, mutable refs, exact outage status and redacted API errors |
| Initial three Docker image builds | PASS |
| Staging Compose startup | PASS: migrations and storage-init exit 0; API ready, worker health and web login 200 |
| Broker TLS/authentication/ACL/HUP | PASS with disposable self-signed test certificate; anonymous, wrong-password and cross-Gateway access denied |
| Real API/MQTT integration | PASS; role logins/denials, scoped reads, durable sample and duplicate acknowledgment |
| API restart/replay | PASS; raw row remains 1 and aggregate sample_count remains 1 |
| Chromium browser | PASS all five role logins, permissions, school isolation and telemetry, desktop/mobile layout, zero page errors; fixed non-admin site controls |
| Backup/restore drill | PASS: 60,522-byte pg_dump custom archive restored into a new disposable database; 11 migrations, 23 public tables and 1 hypertable match source |
| Latest API/web rebuild | PASS; final API includes idle pool error recovery, web health and role controls fixed |
| Real PostgreSQL outage on final staging API image | PASS: ready200 → ready503 + health200 → ready200, RestartCount stays 0 |
| Full integration runner | PASS exit 0 on final images; bootstrap password preserved, API/MQTT, PostgreSQL dashboard 1 pass/0 skip, all three dependency outages/recovery, API restart/replay and Chromium |
| Independent final review | No additional correctness blockers in CI/deploy/bootstrap/staging Compose |

The restore drill validates schema restoration from an empty staging fixture; it does not claim recovery of real Gateway telemetry, which has not been received. Idle staging stack used approximately 0.5–0.75 GiB locally; this is not a peak-load capacity guarantee for the shared 4 GiB server.

Docker Desktop became unresponsive during parallel rebuilds. Recovery preserved images/volumes and retained stale Windows runtime socket directories under LocalAppData. Subsequent builds are sequential. No factory reset or volume deletion was used.

## Required on the actual server

1. Merge the complete app and deployment change into main and obtain a successful GitHub Actions run and published digests.
2. Set Cloudflare DNS, issue/verify MQTT certificate, create broker credentials and open intended ports.
3. Configure the Coolify application, public GHCR package visibility (or company-provisioned registry access), environment values and CI API token.
4. Deploy (bootstrap service creates the administrator), register the pilot site/Gateway/meter, then verify TLS → MQTT → database → authenticated browser with the real serial and source timestamp.
5. Verify real Gateway offline buffering/replay and backups before accumulating continuous real data. A 24-hour soak remains deferred by the user.

See [Thai deployment runbook](../runbooks/coolify-staging-deployment-th.md) and [Gateway handoff draft](../gateway-handoff/gateway-connection-draft-th.md). Browser checks cover deployment-critical journeys across all roles; they are not exhaustive business acceptance tests for every billing/financial workflow.



Local tested image IDs (not GHCR publication digests):
- API: sha256:3e1f5f90b33f6e31947fa0f2629690485b671bcd58c15aebdda8cba16a5cd230
- Web: sha256:689617eec837a467e57300e6ae3f75484f5f2e571643ce6475d1293220c1731f
- Worker: sha256:84cbc83c0aef2336318185388007a97490bbc85e7c991fad82c18f13cbdbbb34


Local detailed evidence: [runner output](../../test/artifacts/full-run.log), [service logs](../../test/artifacts/compose.log), [desktop screenshot](../../apps/web/test/artifacts/dashboard-desktop.png), [mobile screenshot](../../apps/web/test/artifacts/dashboard-mobile.png). These generated files are ignored by Git; CI uploads its own logs/screenshots.



Domain update after the local verification above: web staging now targets `solar.nateekarn.dev` and MQTT `mqtt-solar.nateekarn.dev`. The recorded tests used localhost and did not validate either public hostname. Public DNS/TLS and Coolify routing remain unverified.

## Coolify UI-only update (30 September 2026)

- Five-image CI includes managed MQTT and Cloudflare certificate service. Staging has no host-file bind mounts, Docker socket or host Certbot dependency.
- One-shot bootstrap runs automatically after migrations/storage initialization; repeated deployment preserves the existing administrator.
- Unit verification: MQTT 5 tests including real leaf/intermediate chain and stale served certificate rejection; certificate service 6 tests with synthetic certificates/mocked ACME; deploy helper10 tests.
- Managed staging Compose smoke passed using disposable named volumes and a synthetic certificate producer: initial boot, repeat bootstrap, verified TLS hostname, API readiness, worker and web readiness. No real ACME request was made.
- Local lint/test passed all8 workspace tasks. Web includes5 regression tests, including deterministic initial telemetry age markup across clock/freshness boundaries. This fixes an intermittent React hydration418 found in the previous GitHub run.
- Actual Cloudflare token, public certificate issuance, Coolify routing, company firewall and end-to-end hardware telemetry are still unverified. DNS provider Cloudflare confirmed by user.

Deployment instructions now use GitHub/Cloudflare/Coolify UI. A company backup policy and off-server restore drill remain a prerequisite for continuous real-data collection; named volumes alone are not backups.

Final local full runner after rebuilding the hydration fix: PASS exit0 (`test/artifacts/managed-final-e2e.log`), all five roles, zero browser page errors, real PostgreSQL test without skip, dependency outage recovery and replay durability. Tested web image: `sha256:ff0caa4b91a474b1f07cc510c5fbe0be1e9a877b31a361bd56759cd9f9a2d161`. Independent whole-change review found no remaining P1/P2 blockers. The GitHub run must still succeed before using published image digests.
