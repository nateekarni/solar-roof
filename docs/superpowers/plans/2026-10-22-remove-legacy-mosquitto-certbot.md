# Remove Legacy Mosquitto and Certbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the unused managed Mosquitto/Certbot deployment, images, tests, and release inputs while retaining the current standalone EMQX architecture.

**Architecture:** Production Web/API continues to connect to the separately deployed EMQX resource described by the EMQX runbook. CI publishes only API, Worker, Web, and PostgreSQL backup images; manual staging deployment mutates only the three application image variables. Local MQTT fixtures use EMQX so no Mosquitto runtime or configuration remains.

**Tech Stack:** GitHub Actions, Docker Compose, Node.js 24, EMQX 5.8.x, Coolify

**Spec:** `docs/runbooks/coolify-mqtt-deployment-th.md`

## Global Constraints

- Keep `infra/docker/docker-compose.emqx.yml` and its host-mounted MQTTS certificate contract unchanged.
- Do not remove generic MQTT ingestion tests; only remove the obsolete managed Mosquitto/Certbot implementation and migrate active local fixtures to EMQX.
- Do not change production database, Redis, storage, API, Worker, or Web volume contracts.
- Image references remain immutable GHCR digest references.

---

### Task 1: Remove legacy release and deployment contracts

**Files:**
- Modify: `.github/workflows/ci-staging.yml`
- Modify: `.github/workflows/deploy-staging.yml`
- Modify: `scripts/ci/coolify-deploy.mjs`
- Modify: `scripts/ci/coolify-deploy.test.mjs`
- Modify: `scripts/ci/classify-release.mjs`
- Modify: `scripts/ci/classify-release.test.mjs`

**Interfaces:**
- Consumes: current Fast Release and EMQX deployment architecture
- Produces: Deep Verification with four image outputs and staging deployment with three application image inputs

- [x] **Step 1: Update deployment contract tests to expect only API, Worker, and Web mutations**

```js
assert.deepEqual(keys, ['API_IMAGE', 'WORKER_IMAGE', 'WEB_IMAGE']);
```

- [x] **Step 2: Run the focused tests and confirm the old implementation fails them**

Run: `node --test scripts/ci/coolify-deploy.test.mjs scripts/ci/classify-release.test.mjs`
Expected: FAIL while MQTT/Certbot remain required or classified explicitly.

- [x] **Step 3: Remove MQTT/Certbot builds, outputs, inputs, validation, and environment mutation**

```yaml
for app in api worker web; do
  # build and publish application images
done
```

- [x] **Step 4: Run focused tests**

Run: `node --test scripts/ci/coolify-deploy.test.mjs scripts/ci/classify-release.test.mjs`
Expected: PASS.

### Task 2: Delete the obsolete managed broker implementation

**Files:**
- Delete: `infra/docker/Dockerfile.mqtt`
- Delete: `infra/docker/Dockerfile.certbot`
- Delete: `infra/docker/docker-compose.mqtt.yml`
- Delete: `infra/docker/docker-compose.mqtt-hostcert.yml`
- Delete: `infra/docker/.env.mqtt.example`
- Delete: `infra/docker/.env.mqtt-hostcert.example`
- Delete: `infra/docker/mosquitto/**`
- Delete: `infra/docker/certbot/**`
- Delete: `infra/ci/managed-staging-smoke.sh`
- Delete: `scripts/ci/managed-staging-smoke.test.mjs`
- Modify: `.gitignore`
- Modify: `.dockerignore`
- Modify: `infra/ci/web-first-smoke.sh`

**Interfaces:**
- Consumes: standalone EMQX resource
- Produces: repository with no managed Mosquitto or Certbot runtime

- [x] **Step 1: Delete legacy runtime and smoke-test files**

Use `apply_patch` to remove every tracked path listed above.

- [x] **Step 2: Remove stale ignore and smoke-script references**

Run: `rg -n -i "mosquitto|CERTBOT_IMAGE|MQTT_IMAGE" .gitignore .dockerignore infra/ci scripts/ci`
Expected: no obsolete managed-image references.

### Task 3: Migrate the active local financial fixture to EMQX

**Files:**
- Modify: `scripts/local-financial-review/compose.yml`
- Delete: `scripts/local-financial-review/mosquitto.conf`

**Interfaces:**
- Consumes: MQTT at loopback port `18849`
- Produces: the same loopback endpoint backed by EMQX 5.8.5

- [x] **Step 1: Replace the Mosquitto service image and config mount with EMQX**

```yaml
mqtt:
  image: emqx/emqx:5.8.5
  ports: ['127.0.0.1:18849:1883']
  healthcheck:
    test: ['CMD-SHELL', 'emqx ctl status >/dev/null']
```

- [x] **Step 2: Validate Compose**

Run: `docker compose -f scripts/local-financial-review/compose.yml config --quiet`
Expected: exit code 0.

### Task 4: Align current documentation with EMQX-only deployment

**Files:**
- Modify: `.github/CI.md`
- Modify: `docs/runbooks/coolify-environment-reference-th.md`
- Modify: `docs/runbooks/coolify-solar-fowir-deployment-detailed-th.md`
- Modify: `docs/runbooks/coolify-web-first-deployment-th.md`
- Modify: `docs/deployment/verification.md`
- Modify: `docs/gateway-handoff/gateway-connection-draft-th.md`

**Interfaces:**
- Consumes: current EMQX deployment and host certificate runbook
- Produces: operator documentation without obsolete Mosquitto/Certbot instructions

- [x] **Step 1: Remove legacy image and broker instructions**

Document Deep Verification as publishing four images and manual app deployment as using three image inputs.

- [x] **Step 2: Point certificate operations to the EMQX host-mounted certificate contract**

Link operators to `docs/runbooks/coolify-mqtt-deployment-th.md`.

### Task 5: Verify the cleanup

**Files:**
- Verify all changed files

**Interfaces:**
- Consumes: Tasks 1-4
- Produces: verified EMQX-only repository state

- [x] **Step 1: Scan for obsolete runtime references**

Run: `rg -n -i "mosquitto|CERTBOT_IMAGE|MQTT_IMAGE|solar-certbot|solar-mqtt:ci" --hidden --glob '!node_modules' --glob '!.git' .`
Expected: only historical plan references, if intentionally retained.

- [x] **Step 2: Run CI helper tests**

Run: `node --test scripts/ci/*.test.mjs`
Expected: all tests pass.

- [x] **Step 3: Validate active Compose files and repository formatting**

Run: `docker compose -f infra/docker/docker-compose.emqx.yml config --quiet` with required synthetic environment values, `docker compose -f scripts/local-financial-review/compose.yml config --quiet`, and `git diff --check`.
Expected: every command exits 0.

