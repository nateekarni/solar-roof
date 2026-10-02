#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ $# == 2 && "$1" == --profile ]] || { echo 'Usage: recovery-drill.sh --profile fixture|target' >&2; exit 64; }
case "$2" in
 fixture) ;;
 target) echo 'PENDING: independent-host target drill needs approved off-host repository, escrowed key, immutable image and service verification. No fixture fallback.' >&2; exit 78 ;;
 *) echo 'Unknown recovery profile' >&2; exit 64 ;;
esac
export PLATFORM_CI_STORAGE_PORT="${PLATFORM_CI_STORAGE_PORT:-19001}"
export COMPOSE_PROFILES=restore,negative
source scripts/ci/isolated-stack.sh
compose+=(-f infra/ci/recovery-compose.yml)
export RECOVERY_COMPOSE_PROJECT="$COMPOSE_PROJECT_NAME"
stack_created=true
node scripts/ci/recovery-fixture.mjs
pnpm --filter @solar/api exec tsx --test test/platform/recovery.test.ts