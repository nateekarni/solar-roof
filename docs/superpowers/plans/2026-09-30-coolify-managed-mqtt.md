# Coolify-managed MQTT implementation — 2026-09-30

Approved intent: deploy using Coolify UI, no SSH/SCP, no host bind paths or Docker socket. Web solar.nateekarn.dev; MQTT mqtt-solar.nateekarn.dev; Cloudflare DNS confirmed. Preserve existing data and application behavior.

## Interfaces

- Five tested image refs: API_IMAGE, WEB_IMAGE, WORKER_IMAGE, MQTT_IMAGE, CERTBOT_IMAGE. Images built/published in CI, no builds on shared company server.
- Broker env MQTT_PASSWORD (solar-backend), MQTT_GATEWAY_CREDENTIALS (JSON object username:password), MQTT_TLS_DOMAIN. Validate user names, reject reserved backend and newline/injection. Embedded static config/ACL. Generate password hashes at startup; never log secrets. No broker DNS token.
- certbot env CLOUDFLARE_API_TOKEN, ACME_EMAIL, MQTT_TLS_DOMAIN. Cloudflare token scoped zone nateekarn.dev. Persistent letsencrypt state; shared mqtt-certs volume mounted at /export in certbot, /mosquitto/certs read-only in broker. Atomic generation directories + current symlink; cert/key modes allow Mosquitto UID1883. Broker config reads /mosquitto/certs/current/{fullchain,privkey}.pem.
- Certbot stays running, attempts issuance/renewal periodically, retries safely, reports health; no self-signed fallback for deployment. Broker waits for valid material with bounded startup deadline and fails closed. Detect current certificate change and HUP its own broker child; no Docker socket or host permissions. MQTT reconnect must keep same accounts/data.
- Bootstrap administrator becomes one-shot compose service from API image with explicit env credentials and existing idempotent command; remove need for operator shell.
- Repo is PUBLIC. UI-only image pulls require packages publicly readable or preexisting company registry access. Do not change package visibility without explicit approval; document GitHub UI setting and contents implications. Never promise private registry login in Coolify UI if unsupported.

## Tasks / ledger

| Task | Owner | Files | Status |
|---|---|---|---|
| MQTT image/supervisor/real TLS smoke | mqtt agent | Dockerfile.mqtt, mosquitto runtime and tests | complete; verified locally |
| Certificate image/renewal/publish/tests | cert agent | Dockerfile.certbot, infra/docker/certbot | complete; verified locally |
| CI five images/deploy guards/tests | CI agent | workflow, scripts/ci helper, CI.md | complete; verified locally |
| Compose/bootstrap/docs/integration/review | root | staging compose, env example, Thai runbook, final evidence | complete; verified locally |

Ruling: use the existing clean checkout on a dedicated feature branch, following the user's branch-per-change workflow; retain installed local dependencies. No other work is active here.
Ruling: previous user requested commit/push and merge as part of this deployment preparation. Prepare and verify concrete changes before publishing them; no actual company-server provisioning or real certificate request without credentials/configuration.

Preflight: MQTT and cert tasks share only the /export/current contract, with separate owned files. CI consumes five image names while root Compose consumes same refs. Runtime credential bootstrap vs broker password setup independent. Tests use synthetic credentials/certs only. No production data is touched.
