# Staging broker provisioning

The staging Compose uses Mosquitto instead of EMQX to reduce memory use. Only TLS
8883 is public; 1883 is authenticated and reachable only inside Docker. Keep
mqtt-solar.nateekarn.dev DNS-only (no ordinary HTTP CDN proxy), pointing at the host.

On the Linux host, create `/data/solar-staging/mqtt/config` and `certs`. Copy
`mosquitto.conf` and `acl.example` into the config directory as `mosquitto.conf`
and `acl`. Set directory ownership to UID/GID 1883 and mode 0750.

Create backend credentials interactively (password never enters shell history):

```sh
docker run --rm -it --user 1883:1883 -v /data/solar-staging/mqtt/config:/auth eclipse-mosquitto:2.0.21 mosquitto_passwd -c /auth/passwords solar-backend
# For each real gateway, omit -c (which would truncate the password database).
docker run --rm -it --user 1883:1883 -v /data/solar-staging/mqtt/config:/auth eclipse-mosquitto:2.0.21 mosquitto_passwd /auth/passwords GATEWAY_NAME
chmod 0640 /data/solar-staging/mqtt/config/passwords
```

Set Coolify MQTT_PASSWORD to the same backend password. Give each physical gateway
a unique case-sensitive username matching its gateway name and a different random
password. The pilot endpoint registered in the application is exactly
`energy/GATEWAY_NAME/#`. Gateways publish only `energy/GATEWAY_NAME/telemetry` and
subscribe to `energy/GATEWAY_NAME/response` and `energy/GATEWAY_NAME/config`. The supplied ACL derives each
gateway's permissions from its authenticated username; other gateways are denied.
Do not name a gateway `solar-backend`. Backend permissions cover those telemetry
and response/config topics across gateways. Existing different endpoint layouts
require a reviewed ACL update; do not widen device access to `#`.

Obtain a public certificate for mqtt-solar.nateekarn.dev using Certbot and your DNS
provider's DNS-01 plugin, with a narrowly scoped DNS API token stored root-only.
DNS-01 avoids interfering with Coolify's HTTP ingress. Install
`renew-certificate.sh` executable as a Certbot deploy hook, then invoke it for the
initial certificate (before starting the stack):

```sh
RENEWED_DOMAINS=mqtt-solar.nateekarn.dev RENEWED_LINEAGE=/etc/letsencrypt/live/mqtt-solar.nateekarn.dev /etc/letsencrypt/renewal-hooks/deploy/solar-mqtt.sh
systemctl enable --now certbot.timer
certbot renew --dry-run
```

The hook copies actual certificate files (not dangling Certbot symlinks) into the
persistent mounted folder, gives Mosquitto read access, and sends HUP on renewal.
Use the host's Certbot package/plugin instructions for the DNS provider. Verify
timer installation and successful renewal before connecting real devices. No
certificate issuance or host provisioning is performed by this repository.

For credential/ACL rotations, update files then send HUP to the broker. Configure
gateways for TLS with CA verification and hostname mqtt-solar.nateekarn.dev, port 8883.
Test valid publish/receive, denied anonymous connections and denied cross-gateway
publish/subscribe before admitting the pilot device. Back up broker config and
password hashes securely alongside the database and other persistent volumes.

Run `bash infra/docker/mosquitto/smoke.sh` on a Linux Docker host to verify TLS,
authentication, gateway topic isolation and certificate/config reload with
disposable credentials and a self-signed test certificate. CI runs this check.


## Cloudflare DNS-01 on a Debian/Ubuntu host

Use this section only if the nateekarn.dev DNS zone is managed in Cloudflare. Otherwise select the DNS-01 plugin for its actual DNS provider.

These commands assume Debian/Ubuntu with systemd and apt; adapt installation to
other host distributions. Create a Cloudflare API token with **Zone / DNS / Edit**
permission, limited to the **nateekarn.dev** zone. Do not use the global API key.

```sh
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-dns-cloudflare
sudo install -d -m 0700 /root/.secrets/certbot
sudo touch /root/.secrets/certbot/cloudflare.ini
sudo chmod 0600 /root/.secrets/certbot/cloudflare.ini
sudo nano /root/.secrets/certbot/cloudflare.ini
# Enter: dns_cloudflare_api_token = YOUR_ZONE_SCOPED_API_TOKEN
sudo certbot certonly --dns-cloudflare --dns-cloudflare-credentials /root/.secrets/certbot/cloudflare.ini --dns-cloudflare-propagation-seconds 60 -d mqtt-solar.nateekarn.dev
sudo install -m 0755 infra/docker/mosquitto/renew-certificate.sh /etc/letsencrypt/renewal-hooks/deploy/solar-mqtt.sh
sudo env RENEWED_DOMAINS=mqtt-solar.nateekarn.dev RENEWED_LINEAGE=/etc/letsencrypt/live/mqtt-solar.nateekarn.dev /etc/letsencrypt/renewal-hooks/deploy/solar-mqtt.sh
sudo systemctl enable --now certbot.timer
sudo certbot renew --dry-run
sudo systemctl list-timers certbot.timer
```

Answer Certbot's contact-email and terms prompts. Keep MQTT's Cloudflare A/AAAA
record DNS-only, and open host inbound TCP 8883 for gateway devices. DNS-01 needs
no port 80 listener. Keep solar.nateekarn.dev's separate HTTPS web routing in Coolify.
