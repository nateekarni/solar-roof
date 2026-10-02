#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
profile='' history=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) profile="${2:?Missing profile}"; shift 2;;
    --history-days) history="${2:?Missing history days}"; shift 2;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done
[[ "$profile" =~ ^(smoke|target)$ && "$history" == 90 ]] || { echo 'Usage: platform-load.sh --profile smoke|target --history-days 90' >&2; exit 1; }
if [[ "$profile" == target ]]; then
  [[ "${CAPACITY_DEDICATED:-}" == true && -n "${CAPACITY_APPROVED_HOST:-}" && "${GITHUB_EVENT_NAME:-workflow_dispatch}" == workflow_dispatch ]] || { echo 'Target requires approved dedicated manual host' >&2; exit 1; }
  node -e 'const h=require("os").hostname();if(h!==process.env.CAPACITY_APPROVED_HOST||/fowir|staging|pilot|shared/i.test(h))process.exit(1)'
fi
export CAPACITY_PROFILE="$profile" CAPACITY_HISTORY_DAYS="$history" PLATFORM_EDGE_FIXTURE=true
# Read-only daemon identity check before lock/build/up or any workload mutation.
node --import tsx --input-type=module -e 'import {verifyDockerExecution} from "./apps/api/test/performance/docker-identity.ts"; verifyDockerExecution(process.env.CAPACITY_PROFILE)'
source scripts/ci/isolated-stack.sh
compose+=(-f infra/ci/request-edge.yml -f infra/ci/energy-read-model.yml -f infra/ci/report-worker.yml)
revision="$(git rev-parse HEAD)"
if [[ "${CAPACITY_PREBUILT:-}" == true ]]; then
  for app in api worker web; do
    [[ "$(docker image inspect "solar-$app:ci" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" == "$revision" ]] || { echo "Stale image: $app" >&2; exit 1; }
  done
else
  for app in api worker web; do docker build --label "org.opencontainers.image.revision=$revision" -f "infra/docker/Dockerfile.$app" -t "solar-$app:ci" .; done
fi
stack_created=true
"${compose[@]}" up -d --wait --wait-timeout 240
# Run from repo root so artifacts and Docker relative paths remain consistent.
node node_modules/tsx/dist/cli.mjs --tsconfig apps/api/tsconfig.json apps/api/test/performance/mixed-load.ts
