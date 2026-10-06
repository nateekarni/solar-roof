#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/ci/isolated-stack.sh
compose+=(-f infra/ci/report-worker.yml)
stack_created=true
"${compose[@]}" up -d --wait --wait-timeout 240
# Same migrations and bootstrap image run twice; test confirms password is not reset.
"${compose[@]}" run --rm migrate
"${compose[@]}" run --rm -e BOOTSTRAP_ADMIN_PASSWORD=Ci-bootstrap-replacement-123! bootstrap
node scripts/ci/coolify-deploy.mjs wait http://127.0.0.1:13001/ready
node scripts/ci/coolify-deploy.mjs wait http://127.0.0.1:13000/login
export READINESS_DATABASE_URL='postgresql://solar:ci-only-password@127.0.0.1:15432/solar_readiness'
export READINESS_API_URL='http://127.0.0.1:13001'
export READINESS_WEB_URL='http://localhost:13000'
export READINESS_ACCOUNTS_FILE="$(node -p "require('node:path').resolve('test/artifacts/accounts.json')")"
node scripts/ci/coolify-deploy.mjs wait http://127.0.0.1:13001/ready/mqtt
pnpm --filter @solar/api exec tsx test/readiness.integration.ts
DASHBOARD_TEST_DATABASE_URL="$READINESS_DATABASE_URL" pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/dashboard/dashboard.postgres.spec.ts
# Dependency outages must change readiness to 503 without killing API liveness.
for dependency in postgres storage; do
  "${compose[@]}" stop "$dependency"
  node scripts/ci/coolify-deploy.mjs wait http://127.0.0.1:13001/ready 503
  node scripts/ci/coolify-deploy.mjs wait http://127.0.0.1:13001/health
  "${compose[@]}" start "$dependency"
  node scripts/ci/coolify-deploy.mjs wait http://127.0.0.1:13001/ready
done
# Broker outages must not block the website or core API readiness.
"${compose[@]}" stop mqtt
node scripts/ci/coolify-deploy.mjs wait http://127.0.0.1:13001/ready/mqtt 503
node scripts/ci/coolify-deploy.mjs wait http://127.0.0.1:13001/ready
node scripts/ci/coolify-deploy.mjs wait http://127.0.0.1:13001/health
node scripts/ci/coolify-deploy.mjs wait http://127.0.0.1:13000/login
"${compose[@]}" start mqtt
node scripts/ci/coolify-deploy.mjs wait http://127.0.0.1:13001/ready/mqtt
"${compose[@]}" restart api
node scripts/ci/coolify-deploy.mjs wait http://127.0.0.1:13001/ready
node scripts/ci/coolify-deploy.mjs wait http://127.0.0.1:13001/ready/mqtt
pnpm --filter @solar/api exec tsx test/readiness-restart.integration.ts
pnpm --filter @solar/web exec node test/readiness.e2e.mjs
# Account fixture is CI-only but need not appear in uploaded artifacts.
rm -f test/artifacts/accounts.json
