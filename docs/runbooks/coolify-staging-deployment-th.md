# Deploy Solar staging บน Coolify

เป้าหมาย: server `live`, เว็บ `solar.nateekarn.dev`, MQTT `mqtt-solar.nateekarn.dev:8883`, repository `nateekarni/solar-roof`, branch `main`.

ไฟล์ deployment จัดเตรียมแล้วใน repository การตั้ง DNS, TLS, secrets, สิทธิ์ GHCR และ resource จริงยังต้องทำในบัญชีของผู้ดูแล ผลการทดสอบและขอบเขตที่ตรวจจริงดู `docs/deployment/verification.md`

## ไฟล์ที่ใช้จริง

- `infra/docker/docker-compose.staging.yml` — ใช้ไฟล์นี้ใน Coolify ไม่ใช้ production Compose เดิม
- `infra/docker/.env.staging.example` — รายการตัวแปร ต้องเปลี่ยนค่าตัวอย่าง
- `infra/docker/Dockerfile.api`, `Dockerfile.web`, `Dockerfile.worker` — image ที่ CI สร้าง
- `.github/workflows/ci-staging.yml` — PR checks และ main build/test/publish/deploy
- `scripts/ci/integration.sh` และ `infra/ci/compose.yml` — ฐาน/broker ทิ้งได้สำหรับ E2E
- `infra/docker/mosquitto/README.md` — การตั้ง MQTT, Cloudflare certificate และการต่ออายุ
- `scripts/ops/backup-postgres.sh` — สำรองฐานข้อมูลแบบไม่ล้างข้อมูล

## 1. เตรียม GitHub ครั้งแรก

1. รวมงานแอปที่ต้องใช้งานและงาน deployment บน branch แก้ไขเดียวกันให้ครบ รวม migrations ที่ยังไม่ได้ commit; ห้ามส่งเฉพาะ Dockerfile โดยละไฟล์แอปที่ image ต้องใช้
2. เปิด PR เข้า main และรอ checks ผ่าน
3. ครั้งแรกให้ตัวแปร repository `STAGING_DEPLOY_ENABLED` ยังไม่เป็น `true` เพื่อให้ CI ทดสอบและเผยแพร่ image ก่อน โดยยังไม่เรียก resource ที่ไม่ได้ตั้งค่า
4. เมื่อ merge แล้วดู GitHub Actions งาน `CI and staging` ให้ verify/publish สำเร็จ
5. Image ที่ผ่านการทดสอบจะอยู่ที่:
   - `ghcr.io/nateekarni/solar-roof/api:<commit SHA>`
   - `ghcr.io/nateekarni/solar-roof/worker:<commit SHA>`
   - `ghcr.io/nateekarni/solar-roof/web:<commit SHA>`
6. ใช้ digest ของ image แต่ละตัวใน Coolify รูปแบบ `ghcr.io/nateekarni/solar-roof/api@sha256:...` ไม่ใช้คำว่า latest
7. GitHub Settings -> Rules -> Rulesets/Branches: กำหนด main ให้แก้ผ่าน PR และ checks ของ workflow ต้องผ่าน ความสามารถตั้งกฎขึ้นกับ repository/account

CI จะรันบน GitHub-hosted runner ไม่ใช้เครื่อง live เป็น runner และไม่ส่งข้อมูลจริงเข้า E2E

## 2. ตั้ง DNS ของ nateekarn.dev

ตั้ง DNS ทั้งเว็บและ MQTT ใน zone `nateekarn.dev` ที่ผู้ให้บริการ DNS ของโดเมนนี้ หากใช้ Cloudflare ให้เข้า DNS -> Records:

| Zone | Type | Name | Content | Proxy (ถ้าใช้ Cloudflare) |
|---|---|---|---|---|
| nateekarn.dev | A | solar | public IPv4 ของเครื่อง live | เริ่ม DNS only เพื่อทดสอบ HTTPS โดยตรง |
| nateekarn.dev | A | mqtt-solar | public IPv4 ของเครื่อง live | DNS only |

IP ของเครื่อง live ยังไม่ได้ส่งมา อย่าคัดลอก IP สมมติหรือ IP ของ Coolify หากเป็นคนละเครื่อง หากมี AAAA ต้องเป็น IPv6 ที่เข้าถึงเครื่องนี้ได้จริง

เปิด inbound 80/443 สำหรับเว็บ และ 8883 สำหรับ MQTT ตาม firewall ของผู้ให้บริการ/host โดยรักษา SSH และงานเดิม อย่าเปิดฐานข้อมูล, Redis, API 3001 หรือ worker 3002 สู่ภายนอก

ตรวจจากเครื่องภายนอก:

```sh
nslookup solar.nateekarn.dev
nslookup mqtt-solar.nateekarn.dev
```

## 3. เตรียม MQTT และ certificate บนเครื่อง live

อ่าน `infra/docker/mosquitto/README.md` ซึ่งมีตัวอย่าง Cloudflare DNS-01 หาก DNS ของ nateekarn.dev อยู่กับผู้ให้บริการอื่น ต้องใช้ Certbot DNS plugin ของผู้ให้บริการนั้น

- ใช้ Mosquitto สำหรับ staging เพื่อลดภาระเครื่อง 4 GB; local stack เดิมอาจยังใช้ EMQX
- สร้าง `/data/solar-staging/mqtt/config` และ `/data/solar-staging/mqtt/certs`
- วาง `mosquitto.conf`, `acl` และไฟล์ password ตามคู่มือ; ตรวจ owner/mode ให้ UID 1883 อ่านได้
- สร้างผู้ใช้ backend ชื่อ `solar-backend` และ password แบบสุ่ม ค่านี้ต้องตรงกับ `MQTT_PASSWORD` ใน Coolify
- แต่ละ Gateway ใช้ username ตรงกับ Gateway name ในระบบ, password แยก และ endpoint `energy/GATEWAY_NAME/#`
- ห้ามใช้ชื่อ `solar-backend` เป็นชื่อ Gateway
- Cloudflare token: Zone / DNS / Edit เฉพาะ nateekarn.dev เก็บใน root-only file บนเครื่อง ไม่ส่งในแชตหรือ commit
- ออก certificate สำหรับ mqtt-solar.nateekarn.dev ผ่าน Certbot DNS-01 และติดตั้ง `renew-certificate.sh` เป็น deploy hook
- ตรวจ `certbot renew --dry-run` และ certbot timer


หากยังไม่มีไฟล์ repository บน server ให้ส่งเฉพาะไฟล์ตั้งค่าเหล่านี้จาก PowerShell ใน `E:\solar-roof` โดยแทน `LIVE_SERVER_IP` ด้วย IP จริง:

```powershell
scp infra/docker/mosquitto/mosquitto.conf root@LIVE_SERVER_IP:/tmp/solar-mosquitto.conf
scp infra/docker/mosquitto/acl.example root@LIVE_SERVER_IP:/tmp/solar-mqtt-acl
scp infra/docker/mosquitto/renew-certificate.sh root@LIVE_SERVER_IP:/tmp/solar-mqtt-renew.sh
scp scripts/ops/backup-postgres.sh root@LIVE_SERVER_IP:/tmp/solar-backup-postgres.sh
```

จาก Terminal ของเครื่อง live เตรียมครั้งแรก:

```sh
install -d -m 0750 -o 1883 -g 1883 /data/solar-staging/mqtt/config /data/solar-staging/mqtt/certs
install -m 0640 -o 1883 -g 1883 /tmp/solar-mosquitto.conf /data/solar-staging/mqtt/config/mosquitto.conf
install -m 0640 -o 1883 -g 1883 /tmp/solar-mqtt-acl /data/solar-staging/mqtt/config/acl
install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
install -m 0755 /tmp/solar-mqtt-renew.sh /etc/letsencrypt/renewal-hooks/deploy/solar-mqtt.sh
install -m 0750 /tmp/solar-backup-postgres.sh /data/solar-staging/backup-postgres.sh
```

จากนั้นทำส่วนสร้าง password และออก certificate ใน README เมื่อติดตั้ง hook ด้วยคำสั่งข้างบนแล้ว ข้ามคำสั่งที่คัดลอกจาก `infra/docker/mosquitto/renew-certificate.sh` บน server ได้ เพราะใช้ไฟล์เดียวกัน ห้ามรัน `mosquitto_passwd -c` ซ้ำเมื่อมีบัญชี Gateway แล้ว เพราะจะเขียนทับรายชื่อผู้ใช้เดิม

Gateway ใช้ MQTT ผ่าน TLS ที่พอร์ต 8883 พร้อมตรวจ CA/hostname ไม่ใช้ HTTPS POST ส่วน backend ต่อ broker ผ่าน authenticated private port 1883 ซึ่งไม่ publish ออก host

## 4. ให้เครื่อง live ดึง private GHCR image ได้

ใน Terminal ของเครื่อง live ใช้บัญชีเดียวกับที่ Coolify รัน Docker (ภาพเดิมระบุ root):

```sh
docker login ghcr.io -u YOUR_GITHUB_USERNAME
```

กรอก token ที่ prompt ใช้สิทธิ์อ่าน package และสิทธิ์ repository ตามเงื่อนไของค์กร อย่าใส่ token ใน command line/history ตรวจ pull digest ของทั้งสาม image ได้ก่อน deploy การเชื่อม GitHub App/deploy key เพื่ออ่านโค้ดเป็นคนละสิทธิ์กับ GHCR

## 5. เพิ่ม resource ใน Coolify

1. เปิด https://coolify.fowir.com/project/lskcgscsooocwo8o8kwgsgsw
2. สร้าง/เลือก environment `staging`
3. กด New Resource -> เลือก GitHub App หรือ Deploy Key ที่อ่าน repository ได้; ถ้า repository public ใช้ Public Repository ได้
4. เลือก `nateekarni/solar-roof`, branch `main`, server `live`
5. Configuration -> General -> Build Pack: Docker Compose
6. Base Directory: `/`
7. Docker Compose Location: `/infra/docker/docker-compose.staging.yml`
8. Save แล้วตรวจ rendered Compose ว่า `api`, `worker`, `web` ใช้ `image:` ไม่มี build บนเครื่อง live
9. ตั้ง Domains เฉพาะ service web เป็น `https://solar.nateekarn.dev:3000` เลข3000 คือพอร์ตภายใน ผู้ใช้ยังเปิด https://solar.nateekarn.dev
10. ปิด Auto Deploy จาก Git push โดยตรงเพื่อให้ GitHub Actions เป็นผู้เรียกหลัง checks ผ่าน
11. จด **Application UUID ของ resource ใหม่นี้** ไม่ใช่ Project UUID ในลิงก์ด้านบน

Compose มี database, Redis, broker, storage, migration และ bucket initialization ครบใน stack เดียว persistent volumes อยู่ใน Compose; อย่าลบ resource/volumes เพื่อแก้ deployment failure

## 6. ใส่ environment ใน Coolify

ใช้ `infra/docker/.env.staging.example` เป็นรายการหลัก:

| ตัวแปร | สิ่งที่ต้องใส่ |
|---|---|
| API_IMAGE / WEB_IMAGE / WORKER_IMAGE | digest ของ image ที่ verify ผ่าน |
| POSTGRES_DB / POSTGRES_USER | solar_platform / solar หรือค่าที่ตั้งเอง |
| POSTGRES_PASSWORD | รหัสสุ่มใหม่ |
| DATABASE_URL | postgresql://solar:PASSWORD_ENCODED@postgres:5432/solar_platform โดย URL-encode รหัสผ่าน |
| JWT_ACCESS_SECRET / JWT_REFRESH_SECRET | สุ่มอย่างน้อย32ตัวอักษร แยกคนละค่า |
| MQTT_PASSWORD | password ของ solar-backend ที่สร้างในขั้น3 |
| MQTT_CONFIG_DIR | /data/solar-staging/mqtt/config |
| MQTT_CERTS_DIR | /data/solar-staging/mqtt/certs |
| MINIO_ROOT_USER / MINIO_ROOT_PASSWORD | บัญชี storage ภายในและรหัสสุ่ม |
| STORAGE_REGION / STORAGE_BUCKET | us-east-1 / solar-platform ตาม default |

Compose ตั้ง WEB_URL, API_INTERNAL_URL, internal URLs และ worker runtime ให้แล้ว เว็บใช้ /v1 ผ่านโดเมนเดียว ไม่ต้องตั้ง API domain ใหม่ และไม่ต้องแจก JWT/database secrets ให้เว็บ

## 7. เชื่อม GitHub ให้ deploy อัตโนมัติ

GitHub repository -> Settings -> Environments -> สร้าง `staging` ไม่ตั้ง required reviewer ถ้าต้องการ deploy อัตโนมัติตามที่ตกลง

ตั้ง environment variables:

| ชื่อ | ค่า |
|---|---|
| COOLIFY_URL | https://coolify.fowir.com |
| COOLIFY_APPLICATION_UUID | UUID ของ application จากขั้น5 |
| STAGING_WEB_URL | https://solar.nateekarn.dev |

ตั้ง environment secret `COOLIFY_API_TOKEN` จาก Coolify Keys & Tokens ให้สิทธิ์อ่าน/แก้ environment ของ application และเริ่ม deployment เท่าที่จำเป็น อย่าใช้ Project UUID แทน Application UUID

เมื่อทุกอย่างพร้อม ตั้ง **repository variable** `STAGING_DEPLOY_ENABLED=true` แล้ว Actions -> CI and staging -> Run workflow -> main สำหรับรอบแรก

หลังจากนั้นทุกครั้งที่ merge เข้า main จะทดสอบ/build/publish แล้ว deploy อัตโนมัติด้วย digest ของ revision ที่ผ่าน พร้อมตรวจว่าคือ main ล่าสุดและ target ถูกต้อง การ deploy ถูกจัดคิวไม่ขัดจังหวะ migration

## 8. หลัง deploy ครั้งแรก: สร้างผู้ดูแลแบบไม่ล้างข้อมูล

รอ migration และ storage-init สำเร็จ จากนั้น API /ready ต้อง healthy และเว็บเปิดได้ ก่อนสร้างบัญชีให้เข้า Terminal ของ **service api** (ไม่ใช่ shell host เปล่า) แล้วใช้ shell ที่รองรับ read -s เช่น bash ใน image:

```bash
read -r -p 'Admin email: ' BOOTSTRAP_ADMIN_EMAIL
read -r -s -p 'Admin password (16+ characters): ' BOOTSTRAP_ADMIN_PASSWORD
printf '\n'
export BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_PASSWORD
pnpm --filter @solar/api db:bootstrap
unset BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_PASSWORD
```

Script สร้าง admin และ bucket ที่จำเป็น โดยไม่ seed โรงเรียนหรือ telemetry ปลอม รันซ้ำด้วย email เดิมจะไม่เปลี่ยน password เดิม หากพบ account ที่ role/scope ไม่ตรงจะหยุดให้ตรวจเอง ไม่มีคำสั่งล้างข้อมูล

จากนั้น login ที่ solar.nateekarn.dev สร้าง Pilot school/site/gateway/device ด้วย admin และใช้ serial จริง; แยกบัญชีทดสอบแต่ละ role ตามสิทธิ์ อย่าใช้ db:seed:reset กับ staging

## 9. ตรวจรับก่อนส่ง connection sheet ให้ Gateway

1. HTTPS เว็บและ login สำเร็จ
2. API /ready ตรวจ DB, MQTT subscription และ storage จริง; /health เป็น liveness
3. ส่ง payload สดของมิเตอร์ที่ลงทะเบียนผ่าน TLS8883
4. subscribe response ก่อนส่ง ตรวจ acknowledged ตรง ingestionId/sourceTime/device
5. ตรวจข้อมูลในเว็บและฐานตรงค่าที่ส่ง; ส่งซ้ำต้องไม่เพิ่ม raw/aggregate ซ้ำ
6. ลองบัญชีผิดและ topic ของอีก Gateway ต้องถูกปฏิเสธ
7. ตรวจ restart/reconnect และ RAM/CPU โดยไม่รบกวนแอปเดิม
8. เติม connection sheet ให้ครบ ส่ง credentials แยกช่องทาง แล้วนัด Pilot จริง ไม่ต้องรอ soak24ชั่วโมง

## 10. สำรองข้อมูลและการย้อนเวอร์ชัน

บนเครื่อง live ดู container ID ของ postgres ของ Solar เท่านั้น แล้ว:

```bash
bash /data/solar-staging/backup-postgres.sh POSTGRES_CONTAINER_ID /data/solar-staging/backups
```

Script ใช้ pg_dump และตรวจว่า archive อ่านได้ พร้อม checksum แต่ยังต้องสำเนาไปพื้นที่ปลอดภัยนอกเครื่องและทดสอบ restore จริงไปฐานแยก ไม่ใช่ทับ staging เก็บ bucket objects, broker config/password hashes และ certificate configuration ด้วยวิธีสำรองแยกตามหน้าที่

เก็บ digest เวอร์ชันที่ใช้งานได้ไว้ การย้อน image ต้องตรวจ schema compatibility ก่อน ไม่ย้อนหรือล้างฐานข้อมูลอัตโนมัติ เพราะมีข้อมูล Gateway เข้ามาต่อเนื่อง

## วิธีทดสอบในเครื่องพัฒนา/CI

ใช้ Linux/Bash + Docker หรือ Git Bash ที่ตั้ง path สำหรับเครื่องมือถูกต้อง:

```bash
pnpm install --frozen-lockfile
pnpm --filter './packages/**' --recursive build
pnpm lint
pnpm test
node --test scripts/ci/*.test.mjs
for app in api worker web; do docker build -f infra/docker/Dockerfile.$app -t solar-$app:ci .; done
pnpm --filter @solar/web exec playwright install --with-deps chromium
bash infra/docker/mosquitto/smoke.sh
bash scripts/ci/integration.sh
```

E2E จำกัดไว้ที่ฐาน solar_readiness และ localhost โดยใช้ credentials จำลอง ห้ามเปลี่ยนให้ชี้ไปข้อมูล staging จริง

## อ้างอิง

- Coolify Compose: https://coolify.io/docs/applications/builds/docker-compose
- GitHub Actions integration: https://coolify.io/docs/applications/sources/github/actions
- Coolify deploy API: https://coolify.io/docs/core/automation/deploy-webhooks
- Cloudflare Certbot plugin: https://certbot-dns-cloudflare.readthedocs.io/en/stable/

รายการที่เตรียมไว้ใน repo ไม่ได้หมายความว่า DNS, certificate จริง, remote secrets, GitHub workflow run หรือ Coolify deployment ถูกตั้งแล้ว ต้องตรวจผลบนระบบเป้าหมายตามข้อ9

## Restore drill ที่ทดสอบแล้ว

ทดสอบกับ TimescaleDB 2.18.2/PostgreSQL 16 ในชุดทดสอบแยกเท่านั้น ตัวอย่างนี้สร้างฐานใหม่ ไม่ทับฐานที่รับข้อมูล Gateway:

```bash
set -euo pipefail
# แทน TEST_POSTGRES_CONTAINER_ID ด้วย container ของฐานทดสอบเท่านั้น
# คัดลอก dump ที่สำรองไว้เข้า /tmp/restore.dump ของ container ก่อน
# หากชื่อ solar_restore_check มีอยู่แล้ว ให้หยุดตรวจเอง ไม่ drop ฐานเดิม

docker cp /path/to/backup.dump TEST_POSTGRES_CONTAINER_ID:/tmp/restore.dump
docker exec TEST_POSTGRES_CONTAINER_ID createdb -U solar solar_restore_check
docker exec TEST_POSTGRES_CONTAINER_ID psql -U solar -d solar_restore_check -v ON_ERROR_STOP=1 -c 'CREATE EXTENSION IF NOT EXISTS timescaledb; SELECT timescaledb_pre_restore();'
docker exec TEST_POSTGRES_CONTAINER_ID pg_restore -U solar -d solar_restore_check --no-owner --no-acl --exit-on-error /tmp/restore.dump
docker exec TEST_POSTGRES_CONTAINER_ID psql -U solar -d solar_restore_check -v ON_ERROR_STOP=1 -c 'SELECT timescaledb_post_restore(); SELECT count(*) FROM schema_migrations;'
```

ตรวจจำนวนและค่าข้อมูลสำคัญเทียบกับต้นทาง รวมถึงเปิดแอปทดสอบอ่านข้อมูลที่กู้คืนก่อนถือว่า backup ใช้งานได้จริง รอบทดสอบในเครื่องนี้กู้คืน schema/migrations และ hypertable สำเร็จ; ยังไม่ได้ทดสอบกู้ข้อมูล Gateway จริงซึ่งยังไม่มีเข้ามา



