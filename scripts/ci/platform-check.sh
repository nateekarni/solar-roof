#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
suite="${1:?Usage: platform-check.sh <suite> [--prebuilt]}"
[[ $# -le 2 && ( $# -eq 1 || "$2" == --prebuilt ) ]] || { echo 'Invalid arguments' >&2; exit 1; }
if [[ "$suite" == recovery ]]; then exec bash scripts/ci/recovery-drill.sh --profile fixture; fi
known='harness session invitation csrf financial-safety financial-core operations ingestion rollup reports ui-contracts ui-jobs accessibility archive history recovery readiness'
implemented=(harness session invitation csrf financial-safety operations ingestion rollup reports ui-contracts ui-jobs accessibility archive history readiness)
if [[ "$suite" == all-fast ]]; then
  suites=("${implemented[@]}")
  echo "Implemented: ${implemented[*]}"
  not_ready=()
  for candidate in $known; do
    [[ "$candidate" != recovery ]] || continue
    [[ " ${implemented[*]} " == *" $candidate "* ]] || not_ready+=("$candidate")
  done
  echo "Not ready: ${not_ready[*]}"
  echo 'Separate implemented gate: recovery (isolated physical restore stack)'
else
  [[ " $known " == *" $suite "* ]] || { echo "Unknown suite: $suite" >&2; exit 1; }
  suites=("$suite")
fi
for item in "${suites[@]}"; do
  case "$item" in ui-jobs|accessibility|history) ;; *) [[ -f "apps/api/test/platform/$item.test.ts" ]] || { echo "Suite not implemented: $item (API)" >&2; exit 1; } ;; esac
  case "$item" in invitation|csrf|financial-safety|operations|ui-contracts|ui-jobs|accessibility|history)
    [[ -f "apps/web/test/platform/$item.mjs" ]] || { echo "Suite not implemented: $item (browser)" >&2; exit 1; } ;; esac
  if [[ "$item" == recovery ]]; then [[ -f scripts/ci/recovery-drill.sh ]] || { echo 'Recovery drill not implemented' >&2; exit 1; }; fi
done
source scripts/ci/isolated-stack.sh
if [[ " ${suites[*]} " == *' reports '* || " ${suites[*]} " == *' ui-jobs '* || " ${suites[*]} " == *' accessibility '* ]]; then compose+=(-f infra/ci/report-worker.yml); fi
if [[ " ${suites[*]} " == *' rollup '* ]]; then
  compose+=(-f infra/ci/energy-read-model.yml)
fi
if [[ " ${suites[*]} " == *' csrf '* || " ${suites[*]} " == *' financial-safety '* || " ${suites[*]} " == *' operations '* || " ${suites[*]} " == *' ui-contracts '* || " ${suites[*]} " == *' ui-jobs '* || " ${suites[*]} " == *' accessibility '* || " ${suites[*]} " == *' history '* ]]; then
  compose+=(-f infra/ci/request-edge.yml)
  export PLATFORM_EDGE_FIXTURE=true
fi
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
  if [[ "$item" == archive || "$item" == history ]]; then
    # Override only this phase; restore the base configuration before the next suite.
    export HISTORY_CI_API_ENABLED=true HISTORY_CI_WORKER_ENABLED=false
    if [[ "$item" == history ]]; then export HISTORY_CI_WORKER_ENABLED=true; fi
    history_compose=("${compose[@]}" -f infra/ci/history-worker.yml)
    "${history_compose[@]}" up -d --no-deps --force-recreate --wait --wait-timeout 120 api worker
    PLATFORM_CI_COMPOSE_FILES="$(node -e 'console.log(JSON.stringify(process.argv.slice(1).filter(value=>value.endsWith(".yml"))))' -- "${compose[@]:2}")"
    export PLATFORM_CI_COMPOSE_FILES
  fi
  # Each suite owns its fixtures and process-local authentication budget.
  # Keep all requests within the suite together, including rate-limit tests.
  "${compose[@]}" restart api
  node scripts/ci/coolify-deploy.mjs wait "$READINESS_API_URL/ready"
  node scripts/ci/coolify-deploy.mjs wait "$READINESS_API_URL/ready/mqtt"
  case "$item" in ui-jobs|accessibility|history) ;; *) pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test "test/platform/$item.test.ts" ;; esac
  case "$item" in invitation|csrf|financial-safety|operations|ui-contracts|ui-jobs|accessibility|history) pnpm --filter @solar/web exec node "test/platform/$item.mjs" ;; esac
  if [[ "$item" == history ]]; then
    export HISTORY_CI_API_ENABLED=false
    "${history_compose[@]}" up -d --no-deps --force-recreate --wait --wait-timeout 120 api
    D1_HISTORY_EXPECT_AVAILABLE=false pnpm --filter @solar/web exec node test/platform/history.mjs
  fi
  if [[ "$item" == archive || "$item" == history ]]; then
    unset HISTORY_CI_API_ENABLED HISTORY_CI_WORKER_ENABLED PLATFORM_CI_COMPOSE_FILES
    "${compose[@]}" up -d --no-deps --force-recreate --wait --wait-timeout 120 api worker
  fi
  if [[ "$item" == session ]]; then pnpm --filter @solar/web exec tsx --test lib/api-client.spec.ts; fi
  if [[ "$item" == accessibility ]]; then pnpm --filter @solar/web exec tsx --test lib/power-format.spec.ts; fi
  if [[ "$item" == readiness ]]; then pnpm --filter @solar/web exec tsx --test features/dashboard/summary-status.spec.tsx; fi
done
