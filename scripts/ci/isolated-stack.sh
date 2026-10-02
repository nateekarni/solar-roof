#!/usr/bin/env bash
# Shared by every runner using the fixed CI ports. Never reclaim an unknown lock.
case "$(uname -s)" in MINGW*|MSYS*) export MSYS_NO_PATHCONV=1 ;; esac
# Fixed, loopback-only alternatives allow this fixture to coexist with other projects.
export PLATFORM_CI_STORAGE_PORT="${PLATFORM_CI_STORAGE_PORT:-19000}"
case "$PLATFORM_CI_STORAGE_PORT" in 19000|19001) ;; *) echo 'Invalid fixture storage port (19000 or 19001 only)' >&2; exit 1 ;; esac
export PLATFORM_CI_DIRECT_WEB_PORT="${PLATFORM_CI_DIRECT_WEB_PORT:-13002}"
case "$PLATFORM_CI_DIRECT_WEB_PORT" in 13002|13003) ;; *) echo 'Invalid fixture direct web port (13002 or 13003 only)' >&2; exit 1 ;; esac
for endpoint in READINESS_DATABASE_URL READINESS_API_URL READINESS_WEB_URL; do
  case "$endpoint" in
    READINESS_DATABASE_URL) expected='postgresql://solar:ci-only-password@127.0.0.1:15432/solar_readiness' ;;
    READINESS_API_URL) expected='http://127.0.0.1:13001' ;;
    READINESS_WEB_URL) expected='http://localhost:13000' ;;
  esac
  if [[ -n "${!endpoint:-}" && "${!endpoint}" != "$expected" ]]; then
    echo "Refusing caller-supplied $endpoint outside the fixture stack" >&2; exit 1
  fi
done
stack_lock='/tmp/solar-roof-ci-fixed-ports.lock'
stack_owner="$(node -e 'console.log(require("node:crypto").randomUUID())')"
if ! mkdir "$stack_lock" 2>/dev/null; then
  echo "CI ports are locked by another run: $stack_lock (remove only after confirming its owner has exited)" >&2
  exit 1
fi
printf '%s\n' "$stack_owner" > "$stack_lock/owner"
printf '%s\n' "$$" > "$stack_lock/pid"
export COMPOSE_PROJECT_NAME="solar-ci-$stack_owner"
compose=(docker compose -f infra/ci/compose.yml)
stack_created=false
mkdir -p test/artifacts
cleanup() {
  if [[ "$(cat "$stack_lock/owner" 2>/dev/null)" != "$stack_owner" ]]; then return; fi
  if [[ "$stack_created" == true ]]; then
    "${compose[@]}" logs --no-color > "test/artifacts/$COMPOSE_PROJECT_NAME.log" 2>&1 || true
    "${compose[@]}" down --volumes --remove-orphans || true
  fi
  rm -f "$stack_lock/owner"
  rm -f "$stack_lock/pid"
  rmdir "$stack_lock"
}
trap cleanup EXIT
if [[ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME")" ]]; then
  echo 'Refusing existing Compose project' >&2; exit 1
fi
# Refuse occupied ports before creating any resources, including non-Docker users.
node --input-type=module -e '
import net from "node:net";
for (const port of [15432,13001,13000,Number(process.env.PLATFORM_CI_DIRECT_WEB_PORT),18883,18025,Number(process.env.PLATFORM_CI_STORAGE_PORT)]) {
 const server=net.createServer();
 await new Promise((resolve,reject)=>server.once("error",reject).listen(port,"127.0.0.1",resolve));
 await new Promise(resolve=>server.close(resolve));
}'
export READINESS_DATABASE_URL='postgresql://solar:ci-only-password@127.0.0.1:15432/solar_readiness'
export READINESS_API_URL='http://127.0.0.1:13001'
export READINESS_WEB_URL='http://localhost:13000'
