#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
suite="${1:?Usage: platform-check.sh <suite> [--prebuilt]}"
[[ $# -le 2 && ( $# -eq 1 || "$2" == --prebuilt ) ]] || { echo 'Invalid arguments' >&2; exit 1; }
known='harness session invitation csrf financial-safety financial-core operations ingestion rollup reports ui-contracts ui-jobs accessibility archive recovery readiness'
implemented=(harness session)
if [[ "$suite" == all-fast ]]; then
  suites=("${implemented[@]}")
  echo "Implemented: ${implemented[*]}"
  not_ready=()
  for candidate in $known; do
    [[ " ${implemented[*]} " == *" $candidate "* ]] || not_ready+=("$candidate")
  done
  echo "Not ready: ${not_ready[*]}"
else
  [[ " $known " == *" $suite "* ]] || { echo "Unknown suite: $suite" >&2; exit 1; }
  suites=("$suite")
fi
for item in "${suites[@]}"; do
  case "$item" in ui-jobs|accessibility) ;; *) [[ -f "apps/api/test/platform/$item.test.ts" ]] || { echo "Suite not implemented: $item (API)" >&2; exit 1; } ;; esac
  case "$item" in csrf|ui-contracts|ui-jobs|accessibility)
    [[ -f "apps/web/test/platform/$item.mjs" ]] || { echo "Suite not implemented: $item (browser)" >&2; exit 1; } ;; esac
  if [[ "$item" == recovery ]]; then [[ -f scripts/ci/recovery-drill.sh ]] || { echo 'Recovery drill not implemented' >&2; exit 1; }; fi
done
source scripts/ci/isolated-stack.sh
revision="$(git rev-parse HEAD)"
if [[ "${2:-}" == --prebuilt ]]; then
  [[ "${CI:-}" == true && "${GITHUB_SHA:-}" == "$revision" ]] || { echo '--prebuilt requires CI and matching GITHUB_SHA' >&2; exit 1; }
  for app in api worker web; do
    [[ "$(docker image inspect "solar-$app:ci" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" == "$revision" ]] || { echo "Stale image: $app" >&2; exit 1; }
  done
else
  for app in api worker web; do
    docker build --label "org.opencontainers.image.revision=$revision" -f "infra/docker/Dockerfile.$app" -t "solar-$app:ci" .
  done
fi
stack_created=true
"${compose[@]}" up -d --wait --wait-timeout 240
for item in "${suites[@]}"; do
  case "$item" in ui-jobs|accessibility) ;; *) pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test "test/platform/$item.test.ts" ;; esac
  case "$item" in csrf|ui-contracts|ui-jobs|accessibility) pnpm --filter @solar/web exec node "test/platform/$item.mjs" ;; esac
  if [[ "$item" == session ]]; then pnpm --filter @solar/web exec tsx --test lib/api-client.spec.ts; fi
  if [[ "$item" == accessibility ]]; then pnpm --filter @solar/web exec tsx --test lib/power-format.spec.ts; fi
  if [[ "$item" == recovery ]]; then bash scripts/ci/recovery-drill.sh --profile fixture; fi
done
