#!/usr/bin/env bash
# Named-volume acceptance checks. No cloud calls, host mounts or Docker socket.
set -euo pipefail
export MSYS_NO_PATHCONV=1
image=${MQTT_TEST_IMAGE:-solar-mqtt:ci}
name="solar-managed-mqtt-$$"
certs="$name-certs"
data="$name-data"
tmp=$(mktemp -d)
cleanup() {
  docker rm -f "$name" "$name-empty" "$name-bad" >/dev/null 2>&1 || true
  docker volume rm "$certs" "$data" >/dev/null 2>&1 || true
  rm -f "$tmp/received" "$tmp/boundary" "$tmp/oversized" "$tmp/oversized-publish" "$tmp/denied" "$tmp/forbidden" "$tmp/retained"
  rmdir "$tmp"
}
trap cleanup EXIT
docker volume create "$certs" >/dev/null
docker volume create "$data" >/dev/null
rotate() {
  docker run --rm --entrypoint sh -v "$certs:/export" "$image" -ec '
    mkdir -p /export/g'"$1"'
    openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost -addext subjectAltName=DNS:localhost -keyout /export/g'"$1"'/privkey.pem -out /export/g'"$1"'/fullchain.pem >/dev/null 2>&1
    chown -R 1883:1883 /export/g'"$1"'
    chmod 750 /export/g'"$1"'
    chmod 640 /export/g'"$1"'/*.pem
    ln -s g'"$1"' /export/next
    mv -Tf /export/next /export/current
  '
}
rotate 1
docker run -d --name "$name" -v "$certs:/mosquitto/certs:ro" -v "$data:/mosquitto/data" -e MQTT_TLS_DOMAIN=localhost -e MQTT_PASSWORD=test-backend-password -e 'MQTT_GATEWAY_CREDENTIALS={"pilot-one":"test-gateway-password"}' "$image" >/dev/null
common=(-h localhost -p 8883 --cafile /mosquitto/certs/current/fullchain.pem -V mqttv5)
ready() {
  for attempt in $(seq 1 30); do
    if docker exec "$name" mosquitto_pub "${common[@]}" -u pilot-one -P test-gateway-password -t energy/pilot-one/telemetry -m ready -q 1 >/dev/null 2>&1; then return; fi
    sleep 1
  done
  docker logs "$name"; return 1
}
ready
# Authentication and both ACL directions.
docker exec "$name" mosquitto_sub "${common[@]}" -u solar-backend -P test-backend-password -t energy/pilot-one/telemetry -C 1 -W 8 >"$tmp/received" &
subscriber=$!
sleep 1
docker exec "$name" mosquitto_pub "${common[@]}" -u pilot-one -P test-gateway-password -t energy/pilot-one/telemetry -m telemetry-ok -q 1
wait "$subscriber"
grep -Fxq telemetry-ok "$tmp/received"
# Exercise the managed broker's exact payload boundary over authenticated TLS.
docker exec "$name" mosquitto_sub "${common[@]}" -u solar-backend -P test-backend-password -t energy/pilot-one/telemetry -N -C 1 -W 8 >"$tmp/boundary" &
subscriber=$!
sleep 1
docker exec "$name" sh -ec 'python3 -c "import sys; sys.stdout.write(\"x\" * 131072)" | mosquitto_pub -h localhost -p 8883 --cafile /mosquitto/certs/current/fullchain.pem -V mqttv5 -u pilot-one -P test-gateway-password -t energy/pilot-one/telemetry -q 1 -s'
wait "$subscriber"
test "$(wc -c < "$tmp/boundary")" -eq 131072
docker exec "$name" mosquitto_sub "${common[@]}" -u solar-backend -P test-backend-password -t energy/pilot-one/telemetry -N -C 1 -W 3 >"$tmp/oversized" 2>/dev/null &
subscriber=$!
sleep 1
docker exec "$name" sh -ec 'python3 -c "import sys; sys.stdout.write(\"x\" * 131073)" | mosquitto_pub -h localhost -p 8883 --cafile /mosquitto/certs/current/fullchain.pem -V mqttv5 -u pilot-one -P test-gateway-password -t energy/pilot-one/telemetry -q 1 -s' >"$tmp/oversized-publish" 2>&1 || true
if wait "$subscriber"; then exit 1; fi
test ! -s "$tmp/oversized"
if docker exec "$name" mosquitto_pub "${common[@]}" -u pilot-one -P wrong-password -t energy/pilot-one/telemetry -m bad -q 1; then exit 1; fi
if docker exec "$name" mosquitto_pub "${common[@]}" -t energy/pilot-one/telemetry -m bad -q 1; then exit 1; fi
docker exec "$name" mosquitto_pub "${common[@]}" -u pilot-one -P test-gateway-password -t energy/pilot-two/telemetry -m bad -q 1 >"$tmp/denied" 2>&1 || true
grep -Fq 'Not authorized' "$tmp/denied"
docker exec "$name" mosquitto_sub "${common[@]}" -u pilot-one -P test-gateway-password -t energy/pilot-two/response -C 1 -W 3 >"$tmp/forbidden" 2>/dev/null &
subscriber=$!
sleep 1
docker exec "$name" mosquitto_pub "${common[@]}" -u solar-backend -P test-backend-password -t energy/pilot-two/response -m forbidden -q 1
if wait "$subscriber"; then exit 1; fi
test ! -s "$tmp/forbidden"
# Retained config persists across graceful restart on the original data volume.
docker exec "$name" mosquitto_pub "${common[@]}" -u solar-backend -P test-backend-password -t energy/pilot-one/config -m retained-config -q 1 -r
docker restart "$name" >/dev/null
ready
docker exec "$name" mosquitto_sub "${common[@]}" -u pilot-one -P test-gateway-password -t energy/pilot-one/config -C 1 -W 5 >"$tmp/retained"
grep -Fxq retained-config "$tmp/retained"
# Each new self-signed certificate is a distinct trust anchor; ready proves HUP
# actually switched the listener certificate, rather than merely logging reload.
for generation in 2 3; do rotate "$generation"; ready; done
docker exec "$name" python3 /usr/local/bin/mqtt-runtime.py --healthcheck
# Missing certs must never start a plaintext listener and must exit boundedly.
docker run -d --name "$name-empty" -e MQTT_TLS_DOMAIN=localhost -e MQTT_PASSWORD=test-backend-password -e MQTT_CERT_WAIT_SECONDS=2 "$image" >/dev/null
sleep 1
if docker exec "$name-empty" mosquitto_pub -h localhost -p 1883 -u solar-backend -P test-backend-password -t energy/one/config -m bad; then exit 1; fi
test "$(docker wait "$name-empty")" != 0
# Rejected inputs must not appear in logs.
docker run -d --name "$name-bad" -e MQTT_TLS_DOMAIN=localhost -e MQTT_PASSWORD=test-backend-password -e 'MQTT_GATEWAY_CREDENTIALS={"solar-backend":"DO-NOT-LOG-THIS-SECRET"}' "$image" >/dev/null
test "$(docker wait "$name-bad")" != 0
if docker logs "$name-bad" 2>&1 | grep -Fq DO-NOT-LOG-THIS-SECRET; then exit 1; fi
echo 'Managed MQTT TLS, two rotations, auth, ACL, persistence and fail-closed smoke passed.'
