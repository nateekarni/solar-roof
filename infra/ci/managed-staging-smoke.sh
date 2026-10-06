#!/usr/bin/env bash
# Exercises staging Compose with isolated volumes and a synthetic certificate fixture.
# Never contacts ACME/Cloudflare. Run after building the six CI images.
set -euo pipefail
export MSYS_NO_PATHCONV=1
project="solar-managed-staging-$$"
tmp=$(mktemp -d)
export API_IMAGE=solar-api:ci WORKER_IMAGE=solar-worker:ci WEB_IMAGE=solar-web:ci MQTT_IMAGE=solar-mqtt:ci CERTBOT_IMAGE=solar-certbot:ci
export POSTGRES_IMAGE=solar-postgres-backup:ci
export POSTGRES_DB=solar_readiness POSTGRES_USER=solar POSTGRES_PASSWORD=local-test-postgres
export DATABASE_URL=postgresql://solar:local-test-postgres@postgres:5432/solar_readiness
export MQTT_PASSWORD=local-test-backend MQTT_GATEWAY_CREDENTIALS='{"pilot-one":"local-test-gateway"}'
export CLOUDFLARE_API_TOKEN=unused-synthetic-fixture ACME_EMAIL=ci@example.invalid
export MINIO_ROOT_USER=solar MINIO_ROOT_PASSWORD=local-test-storage
export JWT_ACCESS_SECRET=local-test-access-secret-at-least-32-characters JWT_REFRESH_SECRET=local-test-refresh-secret-at-least-32-characters
cat > "$tmp/override.yml" <<'YAML'
services:
  certbot:
    image: solar-mqtt:ci
    entrypoint: [sh, -ec]
    command:
      - |
        mkdir -p /export/fixture
        openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=mqtt-solar.fowir.com -addext subjectAltName=DNS:mqtt-solar.fowir.com -keyout /export/fixture/privkey.pem -out /export/fixture/fullchain.pem >/dev/null 2>&1
        chown -R 1883:1883 /export/fixture
        chmod 750 /export/fixture
        chmod 640 /export/fixture/*.pem
        ln -sfn fixture /export/current
        exec sleep infinity
    healthcheck:
      test: [CMD, test, -s, /export/current/fullchain.pem]
      interval: 1s
      start_period: 1s
  mqtt:
    ports: !reset []
    networks:
      default:
        aliases: [mqtt-solar.fowir.com]
YAML
override="$tmp/override.yml"
if command -v cygpath >/dev/null 2>&1; then override=$(cygpath -m "$override"); fi
compose=(docker compose -p "$project" -f infra/docker/docker-compose.staging.yml -f "$override")
cleanup() {
  mkdir -p test/artifacts
  "${compose[@]}" logs --no-color > test/artifacts/managed-staging.log 2>&1 || true
  "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -f "$tmp/override.yml"
  rmdir "$tmp"
}
trap cleanup EXIT
"${compose[@]}" config --quiet
"${compose[@]}" up -d --wait --wait-timeout 240
"${compose[@]}" exec -T -e USER_CREATE_ENABLED=true -e USER_ROLE=admin -e USER_NAME="Managed CI Admin" -e USER_EMAIL=managed-ci@example.invalid -e USER_PASSWORD=Local-test-only-123! api pnpm --filter @solar/api db:create:user
"${compose[@]}" exec -T mqtt mosquitto_pub -h mqtt-solar.fowir.com -p 8883 --cafile /mosquitto/certs/current/fullchain.pem -u pilot-one -P local-test-gateway -t energy/pilot-one/telemetry -m smoke -q 1
"${compose[@]}" exec -T api node -e "fetch('http://127.0.0.1:3001/ready').then(r=>{if(!r.ok)throw Error('API not ready')})"
"${compose[@]}" exec -T web node -e "Promise.all(['/login','/health'].map(p=>fetch('http://127.0.0.1:3000'+p).then(r=>{if(!r.ok)throw Error(p+' not ready')})))"
echo 'PASS: staging Compose named-volume migration, manual user creation, managed TLS broker, API, worker and web readiness'
