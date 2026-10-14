#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ "${COMPOSE_PROJECT_NAME:-}" =~ ^solar-ci-[0-9a-f-]{36}$ && "${READINESS_DATABASE_URL:-}" == 'postgresql://solar:ci-only-password@127.0.0.1:15432/solar_readiness' ]] || { echo 'Production acceptance requires the owned disposable CI stack' >&2; exit 1; }
export PRODUCTION_FINANCE_DATABASE_URL="$READINESS_DATABASE_URL"
export NODE_ENV=production FINANCIAL_WRITES_ENABLED=true FINANCIAL_SCHEDULER_ENABLED=true
export SMTP_HOST=127.0.0.1 SMTP_PORT=11025 SMTP_SECURE=false SMTP_FROM=billing@acceptance.example.test
unset LOCAL_FINANCIAL_FIXTURE_MARKER SMTP_USER SMTP_PASSWORD SMTP_PASS
export STORAGE_ENDPOINT="http://127.0.0.1:${PLATFORM_CI_STORAGE_PORT:-19000}" STORAGE_REGION=us-east-1 STORAGE_BUCKET=solar-readiness
export STORAGE_ACCESS_KEY=solar-ci STORAGE_SECRET_KEY=ci-storage-only-password REDIS_URL=redis://127.0.0.1:16432
export PRODUCTION_FINANCE_BROWSER=true
trap 'rm -f test/artifacts/production-browser-fixture.json test/artifacts/production-finance-runtime.json' EXIT
pnpm --filter @solar/api exec tsc --noEmit -p tsconfig.finance-acceptance.json
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json test/production-financial-workflow.integration.ts
# Credentials/auth state are local only and must never be uploaded as evidence.
rm -f test/artifacts/production-browser-fixture.json test/artifacts/production-finance-runtime.json
