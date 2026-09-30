#!/usr/bin/env bash
# Isolated broker acceptance check. Requires Docker, OpenSSL, Bash.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
# Git Bash: native Docker/OpenSSL require Windows host paths, untouched container paths.
if command -v cygpath >/dev/null 2>&1; then
  tmp=$(cygpath -m "$tmp")
  export MSYS_NO_PATHCONV=1
fi
name="solar-mqtt-smoke-$$"
image=eclipse-mosquitto:2.0.21
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT
mkdir -p "$tmp/config" "$tmp/certs"
cp "$here/acl.example" "$tmp/config/acl"
cp "$here/mosquitto.conf" "$tmp/config/mosquitto.conf"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost -addext subjectAltName=DNS:localhost -keyout "$tmp/certs/privkey.pem" -out "$tmp/certs/fullchain.pem" >/dev/null 2>&1
# Synthetic, disposable test credentials; never production secrets.
chmod 755 "$tmp"
chmod 777 "$tmp/config"
docker run --rm --user 1883:1883 -v "$tmp/config:/auth" "$image" mosquitto_passwd -b -c /auth/passwords solar-backend test-backend-password
docker run --rm --user 1883:1883 -v "$tmp/config:/auth" "$image" mosquitto_passwd -b /auth/passwords pilot-one test-gateway-password
# CI tempdir may otherwise be unreadable by container UID 1883.
chmod 755 "$tmp" "$tmp/config" "$tmp/certs"
chmod 644 "$tmp/config/"* "$tmp/certs/"*
docker run -d --name "$name" -v "$tmp/config:/mosquitto/config:ro" -v "$tmp/config:/mosquitto/auth:ro" -v "$tmp/certs:/mosquitto/certs:ro" "$image" >/dev/null
common=(-h localhost -p 8883 --cafile /mosquitto/certs/fullchain.pem -V mqttv5)
ready=false
for attempt in $(seq 1 30); do
  if docker exec "$name" mosquitto_pub "${common[@]}" -u pilot-one -P test-gateway-password -t energy/pilot-one/telemetry -m ready -q 1 >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then docker logs "$name"; exit 1; fi
# Backend may receive telemetry from every provisioned gateway.
docker exec "$name" mosquitto_sub "${common[@]}" -u solar-backend -P test-backend-password -t 'energy/pilot-one/#' -C 1 -W 8 >"$tmp/telemetry" &
subscriber=$!
sleep 1
docker exec "$name" mosquitto_pub "${common[@]}" -u pilot-one -P test-gateway-password -t energy/pilot-one/telemetry -m telemetry-ok -q 1
wait "$subscriber"
grep -Fxq telemetry-ok "$tmp/telemetry"
# Only the addressed gateway can receive backend responses.
docker exec "$name" mosquitto_sub "${common[@]}" -u pilot-one -P test-gateway-password -t energy/pilot-one/response -C 1 -W 8 >"$tmp/response" &
subscriber=$!
sleep 1
docker exec "$name" mosquitto_pub "${common[@]}" -u solar-backend -P test-backend-password -t energy/pilot-one/response -m response-ok -q 1
wait "$subscriber"
grep -Fxq response-ok "$tmp/response"
if docker exec "$name" mosquitto_pub "${common[@]}" -u pilot-one -P wrong-password -t energy/pilot-one/telemetry -m bad -q 1; then echo 'Wrong password accepted' >&2; exit 1; fi
if docker exec "$name" mosquitto_pub "${common[@]}" -t energy/pilot-one/telemetry -m bad -q 1; then echo 'Anonymous client accepted' >&2; exit 1; fi
docker exec "$name" mosquitto_pub "${common[@]}" -u pilot-one -P test-gateway-password -t energy/pilot-two/telemetry -m bad -q 1 >"$tmp/denied-publish" 2>&1 || true
grep -Fq 'Not authorized' "$tmp/denied-publish"
# Subscriptions can be accepted but messages must still be withheld by ACL.
docker exec "$name" mosquitto_sub "${common[@]}" -u pilot-one -P test-gateway-password -t energy/pilot-two/response -C 1 -W 3 >"$tmp/forbidden" 2>/dev/null &
subscriber=$!
sleep 1
docker exec "$name" mosquitto_pub "${common[@]}" -u solar-backend -P test-backend-password -t energy/pilot-two/response -m forbidden -q 1
if wait "$subscriber"; then echo 'Cross-gateway response received' >&2; exit 1; fi
test ! -s "$tmp/forbidden"
# Mosquitto accepts config/auth/TLS reload via the renewal hook's HUP mechanism.
docker kill --signal=HUP "$name" >/dev/null
sleep 1
docker exec "$name" mosquitto_pub "${common[@]}" -u pilot-one -P test-gateway-password -t energy/pilot-one/telemetry -m after-reload -q 1
echo 'Mosquitto TLS, authentication, gateway ACL and reload checks passed.'
