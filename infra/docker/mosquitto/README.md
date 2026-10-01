# Managed staging MQTT

Follow the [Thai UI-only deployment runbook](../../../docs/runbooks/coolify-staging-deployment-th.md). Staging does not require host files, SSH, SCP, Certbot packages, a host timer or Docker socket access.

`Dockerfile.mqtt` embeds `managed.conf` and `acl.example`. At startup its supervisor validates `MQTT_PASSWORD` and the `MQTT_GATEWAY_CREDENTIALS` JSON object, hashes credentials, and waits for a valid certificate. Gateway usernames must equal registered Gateway names (ASCII letters/digits/underscore/hyphen, 1–64 characters starting alphanumeric, never `solar-backend`). Passwords must be at least16 characters without control characters. Give each Gateway a different random password. Backend port1883 is authenticated and private; only TLS8883 is published.

Gateways publish `energy/NAME/telemetry` and subscribe to `energy/NAME/response` and `energy/NAME/config`. Register endpoint `energy/NAME/#` in the application. ACLs deny other gateways. Update the credential JSON in Coolify and redeploy to add/rotate accounts, preserving other entries.

`Dockerfile.certbot` runs the Cloudflare DNS-01 service. Supply `CLOUDFLARE_API_TOKEN` (Zone/DNS/Edit only for fowir.com), `ACME_EMAIL`, and the fixed MQTT domain from Compose. It persists ACME state in `letsencrypt-data`, validates matching key/hostname/validity and atomically exports a generation via a relative `current` symlink in `mqtt-certs`. Broker mounts exports read-only and reloads its own child process when the certificate changes. No container controls Docker or the shared company proxy.

Checks run every12 hours, retry after1 hour on failure. A failed renewal makes certificate health unhealthy and retains previous material. Broker can continue using the previous valid certificate; it stops if material becomes invalid. Investigate unhealthy certbot in Coolify promptly. Initial issuance requires working outbound DNS/HTTPS and a valid Cloudflare token. Tests use synthetic certificates/mocked ACME; they do not prove live issuance in the company environment.

Keep mqtt-solar.fowir.com DNS-only and allow inbound8883 through company firewall. Web HTTPS is managed independently by Coolify. Preserve named volumes across deployments. Do not expose database, storage console or private broker port.

## Developer checks

Build `solar-mqtt:ci` and `solar-certbot:ci` using matching Dockerfiles, run Python unittest discovery at `/opt/solar-mqtt/tests` and `/opt/solar-certbot/tests`, then `bash infra/docker/mosquitto/managed-smoke.sh`. The script uses isolated disposable named volumes and validates TLS, authentication, ACL isolation, certificate rotation and restart persistence. CI also runs the earlier standalone ACL smoke.

`mosquitto.conf`, `smoke.sh`, and `renew-certificate.sh` are retained for the legacy fixture/manual integration; staging Compose uses `managed.conf` and the managed certificate service. Do not install the legacy host hook for this deployment.
