#!/bin/sh
# Run as root on the deployment host after Certbot renews this certificate.
# Install as /etc/letsencrypt/renewal-hooks/deploy/solar-mqtt.sh.
set -eu
case "${RENEWED_DOMAINS:-}" in
  *mqtt-solar.fowir.com*) ;;
  *) exit 0 ;;
esac
cert_dir=/data/solar-staging/mqtt/certs
install -d -m 0750 -o 1883 -g 1883 "$cert_dir"
install -m 0644 -o 1883 -g 1883 "$RENEWED_LINEAGE/fullchain.pem" "$cert_dir/fullchain.pem"
install -m 0640 -o 1883 -g 1883 "$RENEWED_LINEAGE/privkey.pem" "$cert_dir/privkey.pem"
# Find the one staging broker from its explicit certificate bind mount.
for container in $(docker ps --filter label=com.docker.compose.service=mqtt -q); do
  if docker inspect --format '{{range .Mounts}}{{println .Source}}{{end}}' "$container" | grep -Fxq "$cert_dir"; then
    docker kill --signal=HUP "$container" >/dev/null
  fi
done
