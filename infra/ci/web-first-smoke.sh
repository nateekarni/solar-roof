#!/usr/bin/env bash
# Exercise the actual web deployment file without broker credentials or published ports.
set -euo pipefail
export MSYS_NO_PATHCONV=1
project="solar-web-first-$(node -e 'console.log(require("node:crypto").randomUUID())')"
export API_IMAGE=solar-api:ci WORKER_IMAGE=solar-worker:ci WEB_IMAGE=solar-web:ci POSTGRES_IMAGE=solar-postgres-backup:ci
export POSTGRES_DB=solar_web_test POSTGRES_USER=solar POSTGRES_PASSWORD=web-test-postgres
export DATABASE_URL=postgresql://solar:web-test-postgres@postgres:5432/solar_web_test
export MINIO_ROOT_USER=solar MINIO_ROOT_PASSWORD=web-test-storage
export JWT_ACCESS_SECRET=web-test-access-secret-at-least-32-characters JWT_REFRESH_SECRET=web-test-refresh-secret-at-least-32-characters
export BOOTSTRAP_ADMIN_EMAIL=web-ci@example.invalid BOOTSTRAP_ADMIN_PASSWORD=Web-test-only-123!
export MQTT_ENABLED=false MQTT_DEFAULT_BROKER_ENABLED=false
unset MQTT_PASSWORD MQTT_URL MQTT_USERNAME MQTT_GATEWAY_CREDENTIALS CLOUDFLARE_API_TOKEN ACME_EMAIL MQTT_IMAGE CERTBOT_IMAGE
compose=(docker compose -p "$project" -f infra/docker/docker-compose.web.yml)
created=false
cleanup() {
  if [[ "$created" == true ]]; then
    mkdir -p test/artifacts
    "${compose[@]}" logs --no-color > "test/artifacts/$project.log" 2>&1 || true
    # Keep volumes for inspection; CI runners are disposable. Never delete data here.
    "${compose[@]}" down --remove-orphans || true
  fi
}
trap cleanup EXIT
"${compose[@]}" config --quiet
if [[ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$project")" || -n "$(docker volume ls -q --filter "label=com.docker.compose.project=$project")" ]]; then
  echo 'Refusing an existing test project or volumes' >&2; exit 1
fi
created=true
"${compose[@]}" up -d --wait --wait-timeout 240
"${compose[@]}" exec -T api node --input-type=module -e '
import assert from "node:assert/strict";
for (const path of ["/health", "/ready", "/ready/mqtt"]) {
 const r = await fetch("http://127.0.0.1:3001" + path);
 assert.equal(r.status, 200, path);
 if (path === "/ready/mqtt") assert.deepEqual(await r.json(), {status:"disabled",configuredBrokers:0,readyBrokers:0});
}
const r=await fetch("http://127.0.0.1:3001/v1/auth/login",{method:"POST",headers:{"content-type":"application/json",Origin:"https://solar.fowir.com"},body:JSON.stringify({email:"web-ci@example.invalid",password:"Web-test-only-123!"})});
assert.equal(r.status,200,"bootstrap admin can log in without MQTT");
'
"${compose[@]}" exec -T web node -e "Promise.all(['/login','/health'].map(async p=>{const r=await fetch('http://127.0.0.1:3000'+p);if(!r.ok)throw Error(p+' unavailable')}))"
if "${compose[@]}" config --services | grep -Eq '^(mqtt|certbot)$'; then echo 'Unexpected MQTT infrastructure' >&2; exit 1; fi
export MQTT_ENABLED=true MQTT_DEFAULT_BROKER_ENABLED=true MQTT_URL=mqtt://127.0.0.1:1 MQTT_USERNAME=test MQTT_PASSWORD=test
"${compose[@]}" up -d --no-deps --force-recreate --wait --wait-timeout 120 api
"${compose[@]}" exec -T api node --input-type=module -e '
import assert from "node:assert/strict";
assert.equal((await fetch("http://127.0.0.1:3001/ready")).status,200);
const mqtt=await fetch("http://127.0.0.1:3001/ready/mqtt");
assert.equal(mqtt.status,503); assert.equal((await mqtt.json()).status,"not_ready");
const r=await fetch("http://127.0.0.1:3001/v1/auth/login",{method:"POST",headers:{"content-type":"application/json",Origin:"https://solar.fowir.com"},body:JSON.stringify({email:"web-ci@example.invalid",password:"Web-test-only-123!"})});
assert.equal(r.status,200,"login works while configured broker is unreachable");
'
"${compose[@]}" exec -T web node -e "fetch('http://127.0.0.1:3000/login').then(r=>{if(!r.ok)throw Error('website unavailable during broker outage')})"
echo 'PASS: web-first Compose starts and authenticates without any MQTT infrastructure or credentials'
