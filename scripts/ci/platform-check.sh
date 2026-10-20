#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
suite="${1:?Usage: platform-check.sh <suite> [--prebuilt]}"
[[ "$suite" != finance-readiness ]] || suite=financial-core
[[ $# -le 2 && ( $# -eq 1 || "$2" == --prebuilt ) ]] || { echo 'Invalid arguments' >&2; exit 1; }
if [[ "$suite" == recovery ]]; then exec bash scripts/ci/recovery-drill.sh --profile fixture; fi
known='harness session invitation csrf financial-safety financial-core operations ingestion rollup reports ui-contracts ui-jobs accessibility archive history recovery readiness'
implemented=(harness session invitation csrf financial-safety financial-core operations ingestion rollup reports ui-contracts ui-jobs accessibility archive history readiness)
if [[ "$suite" == all-fast ]]; then
  echo "Implemented: ${implemented[*]}"
  not_ready=()
  for candidate in $known; do
    [[ "$candidate" != recovery ]] || continue
    [[ " ${implemented[*]} " == *" $candidate "* ]] || not_ready+=("$candidate")
  done
  echo "Not ready: ${not_ready[*]}"
  echo 'Separate implemented gate: recovery (isolated physical restore stack)'
  forwarded=()
  [[ $# -eq 1 ]] || forwarded=("$2")
  export PLATFORM_CI_SESSION="${PLATFORM_CI_SESSION:-session-$$}"
  failed=()
  for item in "${implemented[@]}"; do
    if ! bash "$0" "$item" "${forwarded[@]}"; then failed+=("$item"); fi
  done
  stack_lock='/tmp/solar-roof-ci-fixed-ports.lock'
  if [[ -f "$stack_lock/session" && "$(cat "$stack_lock/session" 2>/dev/null)" == "$PLATFORM_CI_SESSION" ]]; then
    if [[ -f "$stack_lock/project" ]]; then
      project="$(cat "$stack_lock/project")"
      docker compose -p "$project" down --volumes --remove-orphans || true
    fi
    rm -rf "$stack_lock"
  fi
  if (( ${#failed[@]} )); then
    echo "Failed platform suites: ${failed[*]}" >&2
    exit 1
  fi
  exit 0
else
  [[ " $known " == *" $suite "* ]] || { echo "Unknown suite: $suite" >&2; exit 1; }
  suites=("$suite")
  failed=()
fi
for item in "${suites[@]}"; do
  case "$item" in ui-jobs|accessibility|history|financial-core) ;; *) [[ -f "apps/api/test/platform/$item.test.ts" ]] || { echo "Suite not implemented: $item (API)" >&2; exit 1; } ;; esac
  case "$item" in invitation|csrf|financial-safety|operations|ui-contracts|ui-jobs|accessibility|history)
    [[ -f "apps/web/test/platform/$item.mjs" ]] || { echo "Suite not implemented: $item (browser)" >&2; exit 1; } ;; esac
  if [[ "$item" == recovery ]]; then [[ -f scripts/ci/recovery-drill.sh ]] || { echo 'Recovery drill not implemented' >&2; exit 1; }; fi
done
source scripts/ci/isolated-stack.sh
if [[ -n "${PLATFORM_CI_SESSION:-}" || " ${suites[*]} " == *' financial-core '* ]]; then compose+=(-f infra/ci/production-finance.yml); fi
if [[ -n "${PLATFORM_CI_SESSION:-}" || " ${suites[*]} " == *' reports '* || " ${suites[*]} " == *' ui-jobs '* || " ${suites[*]} " == *' accessibility '* ]]; then compose+=(-f infra/ci/report-worker.yml); fi
if [[ -n "${PLATFORM_CI_SESSION:-}" || " ${suites[*]} " == *' rollup '* ]]; then
  compose+=(-f infra/ci/energy-read-model.yml)
fi
if [[ -n "${PLATFORM_CI_SESSION:-}" || " ${suites[*]} " == *' csrf '* || " ${suites[*]} " == *' financial-safety '* || " ${suites[*]} " == *' operations '* || " ${suites[*]} " == *' ui-contracts '* || " ${suites[*]} " == *' ui-jobs '* || " ${suites[*]} " == *' accessibility '* || " ${suites[*]} " == *' history '* ]]; then
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
if [[ "${PLATFORM_CI_STACK_REUSED:-false}" != true ]]; then
  stack_created=true
  "${compose[@]}" up -d --wait --wait-timeout 240
fi
for item in "${suites[@]}"; do
  echo "=== Running platform suite: $item ==="
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
  suite_passed=true
  case "$item" in
    financial-core) bash scripts/ci/production-finance-check.sh || suite_passed=false ;;
    ui-jobs|accessibility|history) ;;
    *) pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test "test/platform/$item.test.ts" || suite_passed=false ;;
  esac
  case "$item" in invitation|csrf|financial-safety|operations|ui-contracts|ui-jobs|accessibility|history)
    if [[ "$suite_passed" == true ]]; then
      pnpm --filter @solar/web exec node "test/platform/$item.mjs" || suite_passed=false
    fi
    ;;
  esac
  if [[ "$item" == history ]]; then
    export HISTORY_CI_API_ENABLED=false
    "${history_compose[@]}" up -d --no-deps --force-recreate --wait --wait-timeout 120 api
    if [[ "$suite_passed" == true ]]; then
      D1_HISTORY_EXPECT_AVAILABLE=false pnpm --filter @solar/web exec node test/platform/history.mjs || suite_passed=false
    fi
  fi
  if [[ "$item" == archive || "$item" == history ]]; then
    unset HISTORY_CI_API_ENABLED HISTORY_CI_WORKER_ENABLED PLATFORM_CI_COMPOSE_FILES
    "${compose[@]}" up -d --no-deps --force-recreate --wait --wait-timeout 120 api worker
  fi
  if [[ "$item" == session && "$suite_passed" == true ]]; then pnpm --filter @solar/web exec tsx --test lib/api-client.spec.ts || suite_passed=false; fi
  if [[ "$item" == accessibility && "$suite_passed" == true ]]; then pnpm --filter @solar/web exec tsx --test lib/power-format.spec.ts || suite_passed=false; fi
  # Customer fixtures share only the owned browser transport, never staff
  # screenshot/baseline directories. Both suites run in the browser-enabled phase.
  if [[ "$item" == accessibility && "$suite_passed" == true ]]; then
    pnpm --filter @solar/web test:customer:browser || suite_passed=false
    pnpm --filter @solar/web test:customer:accessibility || suite_passed=false
  fi
  if [[ "$item" == readiness && "$suite_passed" == true ]]; then pnpm --filter @solar/web exec tsx --test features/dashboard/summary-status.spec.tsx || suite_passed=false; fi
  if [[ "$suite_passed" == false ]]; then
    echo "Platform suite FAILED: $item" >&2
    failed+=("$item")
  else
    echo "Platform suite PASSED: $item"
  fi
done
if (( ${#failed[@]} )); then
  echo "Failed platform suites: ${failed[*]}" >&2
  exit 1
fi
