#!/usr/bin/env bash
set -euo pipefail

# This listener is for GitHub-hosted Linux fixtures only, never a deployment service.
[[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true ]] || { echo 'Browser server requires GitHub Actions CI' >&2; exit 1; }
for key in GITHUB_RUN_ID GITHUB_RUN_ATTEMPT GITHUB_JOB; do
  value="${!key:-}"
  [[ "$value" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "Invalid CI ownership field: $key" >&2; exit 1; }
done
owner="$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT-$GITHUB_JOB"
name="solar-ci-browser-$owner"
image='mcr.microsoft.com/playwright:v1.63.0-noble@sha256:bc6ab0d6d44ff4826e4cb8c1e6d801e185bfc42bb0753f8e2a30efc70db054c7'
endpoint='ws://127.0.0.1:13999/'

owned() {
  local actual
  actual=$(docker inspect --format '{{index .Config.Labels "solar.ci.browser.owner"}}' "$name") || return 1
  [[ "$actual" == "$owner" ]] || { echo 'Refusing browser container owned by another CI run' >&2; return 2; }
}
logs() {
  mkdir -p test/artifacts
  local status=0
  docker logs "$name" > test/artifacts/browser-server.log 2>&1 || status=$?
  cat test/artifacts/browser-server.log
  return "$status"
}
case "${1:-}" in
  start)
    version=$(pnpm --filter @solar/web exec node -p 'require("@playwright/test/package.json").version')
    [[ "$version" == 1.63.0 ]] || { echo "Playwright version mismatch: installed $version, image 1.63.0" >&2; exit 1; }
    echo 'Preparing pinned browser image (pull/start failures are browser setup failures)'
    docker pull --platform linux/amd64 "$image"
    # Fail before creating the container if another service already occupies the listener.
    pnpm --filter @solar/web exec node -e 'const s=require("node:net").createServer(); s.on("error",()=>process.exit(1)); s.listen(13999,"127.0.0.1",()=>s.close());'
    start_status=0
    docker run -d --platform linux/amd64 --name "$name" --label "solar.ci.browser.owner=$owner" \
      --init --network host --ipc host "$image" \
      npx --yes --package=playwright@1.63.0 playwright run-server --host 127.0.0.1 --port 13999 --path / --unsafe || start_status=$?
    if [[ "$start_status" != 0 ]]; then
      if owned; then logs || true; fi
      exit "$start_status"
    fi
    # --unsafe permits the client localhost resolver argument; the listener stays loopback-only.
    deadline=$((SECONDS + 60))
    while (( SECONDS < deadline )); do
      remaining=$((deadline - SECONDS))
      (( remaining > 0 )) || break
      if [[ "$(timeout "${remaining}s" docker inspect --format '{{.State.Running}}' "$name")" != true ]]; then break; fi
      remaining=$((deadline - SECONDS))
      (( remaining > 0 )) || break
      if timeout "${remaining}s" pnpm --filter @solar/web exec node -e 'require("@playwright/test").chromium.connect("ws://127.0.0.1:13999/", {timeout: 2000}).then(b => b.close()).catch(() => process.exit(1))'; then
        if [[ -n "${GITHUB_ENV:-}" ]]; then printf 'CI_BROWSER_WS_ENDPOINT=%s\n' "$endpoint" >> "$GITHUB_ENV"; fi
        echo "Browser server ready: $endpoint"
        exit 0
      fi
      sleep 1
    done
    echo 'Browser server readiness failed (server exited or 60-second deadline)' >&2
    owned && logs
    exit 1
    ;;
  cleanup)
    # Missing containers are normal after a version/pull failure. Never remove a foreign owner.
    status=0
    owned || status=$?
    if [[ "$status" == 1 ]]; then exit 0; fi
    if [[ "$status" != 0 ]]; then exit "$status"; fi
    log_status=0
    logs || log_status=$?
    docker rm -f "$name"
    exit "$log_status"
    ;;
  *) echo 'Usage: browser-server.sh start|cleanup' >&2; exit 2 ;;
esac
