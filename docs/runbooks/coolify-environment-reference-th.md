# คู่มือ Environment Variables สำหรับ Coolify

เอกสารนี้อธิบายตัวแปร production ของ Solar Roof แยกตาม resource และหน้าที่ ใช้คู่กับ `infra/docker/.env.web.example`, `infra/docker/.env.mqtt.example` และ Compose ของ release เดียวกัน ห้ามคัดลอก secret จริงลง repository, issue, chat หรือหลักฐาน CI

สถานะในตาราง:

- **ต้องกำหนด**: ต้องมีค่าจริงก่อน deploy
- **Secret**: เก็บเป็น protected/secret variable ใน Coolify
- **ค่าเริ่มต้น**: ใช้ค่าที่ระบุไว้ก่อนได้
- **เปิดภายหลัง**: เริ่ม `false` หรือว่าง แล้วเปิดหลังผ่านขั้นทดสอบของส่วนนั้น
- **CI**: ใช้ค่าจาก GitHub Actions run ของ commit เดียวกัน

## 1. Web application resource

Resource นี้ใช้ `infra/docker/docker-compose.web.yml` และประกอบด้วย PostgreSQL, Redis, object storage, migration, API, worker และ web

### 1.1 Immutable images

| Variable | สถานะ | หน้าที่และค่าที่ต้องใช้ |
| --- | --- | --- |
| `WEB_IMAGE` | CI / ต้องกำหนด | Image ของ Next.js web ในรูป `ghcr.io/.../web@sha256:...` |
| `API_IMAGE` | CI / ต้องกำหนด | Image ของ API และใช้กับงาน one-shot เช่น migration และ storage initialization |
| `WORKER_IMAGE` | CI / ต้องกำหนด | Image ของ background worker |
| `POSTGRES_IMAGE` | CI / ต้องกำหนด | Image PostgreSQL/TimescaleDB ที่มีระบบ backup ของ release |
| `STORAGE_IMAGE` | ค่าเริ่มต้น | Image MinIO; Compose มี pinned digest แล้ว ปกติไม่ต้อง override |

Image ทั้งชุดต้องมาจาก CI run และ commit เดียวกัน ห้ามใช้ `latest` หรือ tag ที่เปลี่ยนค่าได้

### 1.2 PostgreSQL และ object storage

| Variable | สถานะ | หน้าที่และค่าที่ต้องใช้ |
| --- | --- | --- |
| `POSTGRES_DB` | ค่าเริ่มต้น | ชื่อฐานข้อมูล ค่าเริ่มต้น `solar_platform` |
| `POSTGRES_USER` | ค่าเริ่มต้น | ผู้ใช้ฐานข้อมูล ค่าเริ่มต้น `solar` |
| `POSTGRES_PASSWORD` | Secret / ต้องกำหนด | รหัส PostgreSQL สุ่มใหม่สำหรับ installation ใหม่ ต้องตรงกับรหัสใน `DATABASE_URL` |
| `DATABASE_URL` | Secret / ต้องกำหนด | URL ที่ API, worker และ migration ใช้ เช่น `postgresql://solar:PASSWORD@postgres:5432/solar_platform`; percent-encode รหัสผ่านหากมีอักขระ reserved |
| `MINIO_ROOT_USER` | ค่าเริ่มต้น | บัญชี object storage ค่าเริ่มต้น `solar` |
| `MINIO_ROOT_PASSWORD` | Secret / ต้องกำหนด | รหัส MinIO สุ่มและแยกจากรหัส DB |
| `STORAGE_REGION` | ค่าเริ่มต้น | S3 region ค่าเริ่มต้น `us-east-1` |
| `STORAGE_BUCKET` | ค่าเริ่มต้น | Bucket สำหรับเอกสาร โลโก้ ลายเซ็น และหลักฐาน ค่าเริ่มต้น `solar-platform` |

ห้ามเปลี่ยนรหัส DB หรือ MinIO ของ deployment ที่มีข้อมูลเพียงเพื่อให้ตรงกับไฟล์ example ต้องวางแผน rotate credential และเปลี่ยนทั้ง producer/consumer พร้อมกัน

### 1.3 Authentication และ encryption

| Variable | สถานะ | หน้าที่และค่าที่ต้องใช้ |
| --- | --- | --- |
| `JWT_ACCESS_SECRET` | Secret / ต้องกำหนด | ลงนาม access token ความยาวอย่างน้อย 32 ตัวอักษร |
| `JWT_REFRESH_SECRET` | Secret / ต้องกำหนด | ลงนาม refresh token ต้องเป็นคนละค่ากับ access secret |
| `TOTP_ENCRYPTION_KEY` | Secret / ต้องกำหนดก่อนใช้ 2FA | 32 random bytes แปลงเป็น hexadecimal **64 ตัวอักษรพอดี** ใช้เข้ารหัส authenticator secret |
| `MQTT_CREDENTIAL_SECRET` | Secret / แนะนำให้กำหนด | ใช้เข้ารหัส username/password ของ registered MQTT brokers ที่ Admin บันทึก หากว่างระบบ fallback ไป `JWT_REFRESH_SECRET` แต่ production ควรแยก secret |

ค่ากลุ่มนี้ต้องคงที่หลังเปิดใช้งาน การเปลี่ยน `JWT_REFRESH_SECRET` ทำให้ refresh token เดิมใช้ไม่ได้ การเปลี่ยน `TOTP_ENCRYPTION_KEY` ทำให้ถอดรหัส authenticator เดิมไม่ได้ และการเปลี่ยน `MQTT_CREDENTIAL_SECRET` ทำให้ credential ของ registered broker เดิมใช้ไม่ได้

### 1.4 Coolify proxy และ API edge

| Variable | ค่าเริ่มต้น | หน้าที่ |
| --- | --- | --- |
| `API_EDGE_ENABLED` | `false` | เปิด Traefik route `/v1` เข้าสู่ API โดยตรง เริ่ม false จนตรวจ network/proxy chain แล้ว |
| `TRUSTED_PROXY_CIDRS` | ว่าง | CIDR ของ ingress proxy ที่เชื่อถือได้ ใช้เฉพาะ CIDR ที่ตรวจแล้ว ห้ามใส่ทั้ง application network แบบกว้าง |
| `COOLIFY_PROXY_NETWORK` | `coolify` | ชื่อ Docker network ของ Coolify proxy |
| `COOLIFY_HTTPS_ENTRYPOINT` | `https` | ชื่อ Traefik HTTPS entrypoint |
| `COOLIFY_CERT_RESOLVER` | `letsencrypt` | ชื่อ certificate resolver ของ Coolify proxy |

สำหรับ web-first deployment ให้เริ่ม `API_EDGE_ENABLED=false` และใช้ same-origin `/v1` ผ่าน web service

### 1.5 SMTP และ Finance

| Variable | สถานะ | หน้าที่และค่าที่ต้องใช้ |
| --- | --- | --- |
| `SMTP_HOST` | ต้องกำหนดก่อนส่งจริง | Host จากผู้ให้บริการ SMTP |
| `SMTP_PORT` | ค่าเริ่มต้น | `587` สำหรับ STARTTLS หรือ `465` สำหรับ implicit TLS |
| `SMTP_SECURE` | ค่าเริ่มต้น | `false` สำหรับ port 587; `true` สำหรับ port 465 |
| `SMTP_USER` | Secret / ตาม provider | Username; ถ้า provider ต้อง auth ให้กรอกพร้อม `SMTP_PASS` |
| `SMTP_PASS` | Secret / ตาม provider | Password/API SMTP credential; ต้องใช้คู่กับ `SMTP_USER` |
| `SMTP_FROM` | ต้องกำหนดก่อนส่งจริง | Sender ที่ provider verify แล้ว เช่น `Solar Roof <billing@example.com>` |
| `FINANCIAL_WRITES_ENABLED` | เปิดภายหลัง | Master switch สำหรับการเขียนข้อมูลการเงิน เริ่ม `false` |
| `FINANCIAL_SCHEDULER_ENABLED` | เปิดภายหลัง | เปิด monthly billing scheduler เริ่ม `false` และเปิดหลัง one-shot apply/replay ผ่าน |
| `TECHNICAL_ALERTS_ENABLED` | `true` | เปิด automation ของ alert ทางเทคนิค แยกจาก Finance scheduler |
| `COMPARISON_WORKER_ENABLED` | `true` | เปิดงานคำนวณข้อมูลเปรียบเทียบของระบบ |

SMTP readiness, Finance flags, Owner confirmation และ site readiness เป็นคนละ gate การตั้ง flag เป็น true ไม่ข้ามข้อมูลบริษัท บัญชี ผู้รับ อัตรา หรือ billing source ที่ยังไม่ครบ

### 1.6 MQTT connection ของ API

| Variable | ค่าเริ่มต้น | หน้าที่ |
| --- | --- | --- |
| `MQTT_ENABLED` | `false` | เปิด ingestion/subscription ของ API |
| `MQTT_DEFAULT_BROKER_ENABLED` | `false` | ให้ API ใช้ default broker จาก ENV; ถ้า false ระบบใช้ registered brokers ที่ Admin บันทึก |
| `MQTT_URL` | ว่าง | URL ของ default broker เช่น `mqtts://mqtt-solar.example.com:8883` |
| `MQTT_USERNAME` | ว่าง | บัญชี backend ของ default broker ไม่ใช่บัญชี Gateway |
| `MQTT_PASSWORD` | Secret / ว่าง | รหัส backend ของ default broker |
| `INTERNAL_MQTT_SECRET` | Secret / ว่าง | secret ที่ EMQX ส่งให้ HTTP auth/ACL callback |
| `EMQX_MANAGEMENT_URL` | ว่าง | HTTPS base URL ของ EMQX Management API สำหรับตัด client session ตอนหมุน credential |
| `EMQX_MANAGEMENT_API_KEY` | Secret / ว่าง | Application/API key ที่มีสิทธิ์จัดการ client session ไม่ใช่ Dashboard username |
| `EMQX_MANAGEMENT_API_SECRET` | Secret / ว่าง | secret คู่กับ Management API key |
| `EMQX_MANAGEMENT_DEFAULT_BROKER_ID` | ว่าง | UUID ของ broker record ที่ default Management URL จัดการจริง; บังคับเพื่อป้องกันตัด session ผิด cluster |
| `EMQX_MANAGEMENT_BROKERS_JSON` | ว่าง | optional JSON map จาก broker UUID ไป `{url,apiKey,apiSecret}` สำหรับหลาย Broker |

รูปแบบใช้งาน:

- ยังไม่เปิด MQTT: `MQTT_ENABLED=false`, `MQTT_DEFAULT_BROKER_ENABLED=false` และปล่อย URL/account ว่าง
- Broker ภายนอกที่บันทึกผ่าน Admin: `MQTT_ENABLED=true`, `MQTT_DEFAULT_BROKER_ENABLED=false` และปล่อย default broker ENV ว่าง
- Broker ที่ระบบจัดการเอง: `MQTT_ENABLED=true`, `MQTT_DEFAULT_BROKER_ENABLED=true` และกรอก URL/backend account ให้ครบ

Deployment ที่เปิดการหมุน Gateway credential ต้องกำหนด Management URL/key/secret/default broker UUID ให้ครบ เพราะระบบจะ fail closed และคง Gateway ไว้ในสถานะ MQTT suspended หาก broker UUID ไม่มี explicit mapping หรือยืนยันการตัด session เดิมไม่ได้ URL ต้องเป็น HTTPS และ secret ห้ามใส่ใน URL

### 1.7 Ingestion, connection pools และ timeout

| Variable | ค่า pilot | หน้าที่ |
| --- | ---: | --- |
| `MQTT_MAX_PAYLOAD_BYTES` | `131072` | ขนาด MQTT payload สูงสุด 128 KiB |
| `MQTT_MAX_JSON_DEPTH` | `16` | ความลึก JSON สูงสุด |
| `INGEST_CONCURRENCY` | `2` | จำนวน ingestion jobs ที่ทำพร้อมกัน |
| `INGEST_QUEUE_LIMIT` | `1024` | จำนวนรายการสูงสุดใน queue |
| `INGEST_QUEUE_BYTES` | `16777216` | ขนาดรวม queue สูงสุด 16 MiB |
| `INGEST_PER_GATEWAY_RATE` | `50` | sustained messages/second ต่อ Gateway |
| `INGEST_PER_GATEWAY_BURST` | `100` | burst allowance ต่อ Gateway |
| `INGEST_SHUTDOWN_TIMEOUT_MS` | `10000` | เวลารอ drain queue ตอน shutdown |
| `API_READ_POOL_MAX` | `4` | จำนวน DB connections สูงสุดของ API read pool |
| `INGEST_DB_POOL_MAX` | `2` | จำนวน DB connections สูงสุดของ ingestion pool |
| `API_READ_STATEMENT_TIMEOUT_MS` | `2500` | statement timeout ของ API read query |
| `INGEST_DB_STATEMENT_TIMEOUT_MS` | `5000` | statement timeout ของ ingestion query |

ค่าชุดนี้เป็น baseline สำหรับ pilot 2 vCPU / RAM 4 GiB เปลี่ยนเมื่อมีผล capacity test รองรับ

### 1.8 Energy, report, history และ archive flags

| Variable | ค่าเริ่มต้น | หน้าที่และเงื่อนไขเปิด |
| --- | --- | --- |
| `ENERGY_READ_MODEL_ENABLED` | `false` | เปิดการอ่านจาก energy read model หลัง backfill/coverage พร้อม |
| `ENERGY_SUMMARY_WORKER_ENABLED` | `false` | เปิด worker สร้าง summary ต้องเปิดสอดคล้องกับ read model rollout |
| `REPORT_WORKER_ENABLED` | `false` | เปิด background report generation หลังตรวจ storage/capacity |
| `HISTORY_RESTORE_ENABLED` | `false` | เปิด API สำหรับขอ restore history |
| `HISTORY_RESTORE_WORKER_ENABLED` | `false` | เปิด worker ทำ restore ต้องเปิดคู่กับ API หลังตรวจ coverage |
| `TELEMETRY_ARCHIVE_ENABLED` | `false` | เปิดการ archive telemetry |
| `TELEMETRY_ARCHIVE_SCHEDULER_ENABLED` | `false` | เปิดเวลาอัตโนมัติของ archive |
| `RAW_RETENTION_ENABLED` | `false` | เปิด retention/delete policy ของ raw data หลังมีหลักฐาน recovery เท่านั้น |

ข้อจำกัดของ history restore:

| Variable | ค่าเริ่มต้น | หน้าที่ |
| --- | ---: | --- |
| `HISTORY_RESTORE_MAX_DAYS` | `31` | ช่วงวันสูงสุดต่อคำขอ |
| `HISTORY_RESTORE_MAX_ROWS` | `1000000` | จำนวนแถวสูงสุด |
| `HISTORY_RESTORE_MAX_MANIFESTS` | `1000` | จำนวน manifest สูงสุด |
| `HISTORY_RESTORE_MAX_COMPRESSED_BYTES` | `536870912` | compressed input สูงสุด 512 MiB |
| `HISTORY_RESTORE_MAX_UNCOMPRESSED_BYTES` | `2147483648` | ข้อมูลหลังแตกสูงสุด 2 GiB |
| `HISTORY_RESTORE_TIMEOUT_MS` | `600000` | timeout 10 นาที |

### 1.9 PostgreSQL backup

| Variable | สถานะ | หน้าที่ |
| --- | --- | --- |
| `BACKUP_ENABLED` | เปิดภายหลัง | เปิด pgBackRest backup หลังทดสอบ repository จริง |
| `PGBACKREST_REPO1_S3_ENDPOINT` | ตาม provider | S3-compatible backup endpoint ใช้ HTTPS ใน production |
| `PGBACKREST_REPO1_S3_BUCKET` | ตาม provider | Bucket ของ DB backup แยกจาก app object storage |
| `PGBACKREST_REPO1_S3_REGION` | ตาม provider | Region ของ backup bucket |
| `PGBACKREST_REPO1_S3_KEY` | Secret | Access key ของ backup repository |
| `PGBACKREST_REPO1_S3_KEY_SECRET` | Secret | Secret key ของ backup repository |
| `PGBACKREST_REPO1_CIPHER_PASS` | Secret | Encryption password ของ backup ต้องเก็บ escrow นอกเครื่องที่ backup |
| `PGBACKREST_REPO1_PATH` | `/solar` | Prefix/path ของระบบนี้ใน repository |

อย่าเปิด `BACKUP_ENABLED` จนกว่าจะทดสอบ backup, readback และ restore จากปลายทางจริง

### 1.10 Monitoring และ release evidence

| Variable | ค่าเริ่มต้น | หน้าที่ |
| --- | --- | --- |
| `PLATFORM_MONITORING_ENABLED` | `false` | เปิดการประเมิน/ส่ง platform alerts |
| `PLATFORM_MONITORING_RECEIVER_VERIFIED` | `false` | ระบุว่าปลายทาง webhook ผ่านการทดสอบรับจริงแล้ว |
| `PLATFORM_MONITORING_WEBHOOK_URL` | ว่าง | HTTPS webhook URL สำหรับ monitoring |
| `PLATFORM_MONITORING_WEBHOOK_TOKEN` | Secret / ว่าง | Token ที่ส่งกับ webhook |
| `PLATFORM_WAL_LAG_SECONDS` | `600` | เกณฑ์แจ้งเตือน WAL lag/backlog |
| `PLATFORM_BACKUP_AGE_SECONDS` | `93600` | อายุ backup สูงสุดก่อนแจ้งเตือน ประมาณ 26 ชั่วโมง |
| `PLATFORM_DISK_PERCENT` | `80` | เปอร์เซ็นต์ disk used ที่เริ่มแจ้งเตือน |
| `PLATFORM_RELEASE_REVISION` | ว่าง | Full commit SHA ของ release ที่ตรวจแล้ว |
| `PLATFORM_IMAGE_DIGESTS_JSON` | ว่าง | JSON ของ digest ที่กำลังรันจริงสำหรับ api/web/worker/postgres และ service ที่เกี่ยวข้อง |
| `PLATFORM_RELEASE_EVIDENCE_JSON` | ว่าง | Release evidence จากกระบวนการตรวจ rollout; ห้ามสร้างผลผ่านขึ้นเอง |

ให้คง monitoring ปิดจน receiver ผ่านการทดสอบ และใช้ release evidence จาก CI/rollout ของ commit เดียวกัน

### 1.11 Resource limits สำหรับ pilot 2 vCPU / RAM 4 GiB

| Variable | ค่า pilot | หน้าที่ |
| --- | ---: | --- |
| `POSTGRES_CPU_LIMIT` | `0.75` | CPU ceiling ของ PostgreSQL |
| `POSTGRES_MEMORY_LIMIT` | `768m` | Memory ceiling ของ PostgreSQL |
| `POSTGRES_MEMORY_RESERVATION` | `256m` | Memory reservation ของ PostgreSQL |
| `REDIS_CPU_LIMIT` | `0.25` | CPU ceiling ของ Redis |
| `REDIS_MEMORY_LIMIT` | `128m` | Memory ceiling ของ Redis |
| `REDIS_MEMORY_RESERVATION` | `32m` | Memory reservation ของ Redis |
| `STORAGE_CPU_LIMIT` | `0.25` | CPU ceiling ของ MinIO |
| `STORAGE_MEMORY_LIMIT` | `256m` | Memory ceiling ของ MinIO |
| `STORAGE_MEMORY_RESERVATION` | `64m` | Memory reservation ของ MinIO |
| `STORAGE_INIT_CPU_LIMIT` | `0.25` | CPU ceiling ของ one-shot สร้าง bucket |
| `STORAGE_INIT_MEMORY_LIMIT` | `128m` | Memory ceiling ของ one-shot สร้าง bucket |
| `MIGRATE_CPU_LIMIT` | `0.50` | CPU ceiling ของ migration job |
| `MIGRATE_MEMORY_LIMIT` | `256m` | Memory ceiling ของ migration job |
| `RELEASE_EVIDENCE_CPU_LIMIT` | `0.25` | CPU ceiling ของ release-evidence job |
| `RELEASE_EVIDENCE_MEMORY_LIMIT` | `128m` | Memory ceiling ของ release-evidence job |
| `API_CPU_LIMIT` | `0.75` | CPU ceiling ของ API |
| `API_MEMORY_LIMIT` | `512m` | Memory ceiling ของ API |
| `API_MEMORY_RESERVATION` | `256m` | Memory reservation ของ API |
| `WORKER_CPU_LIMIT` | `0.25` | CPU ceiling ของ worker |
| `WORKER_MEMORY_LIMIT` | `256m` | Memory ceiling ของ worker |
| `WORKER_MEMORY_RESERVATION` | `64m` | Memory reservation ของ worker |
| `WEB_CPU_LIMIT` | `0.50` | CPU ceiling ของ Next.js web |
| `WEB_MEMORY_LIMIT` | `384m` | Memory ceiling ของ Next.js web |
| `WEB_MEMORY_RESERVATION` | `128m` | Memory reservation ของ Next.js web |

CPU limit เป็นเพดาน ไม่ใช่การจอง core เปลี่ยนค่าหลังดู peak CPU/RAM และผล capacity test

### 1.12 One-time pilot users

| Variable | ค่าเริ่มต้น | หน้าที่ |
| --- | --- | --- |
| `PILOT_USERS_ENABLED` | `false` | เปิดการสร้างบัญชี pilot แบบ explicit one-time; production ปกติให้คง false |
| `PILOT_CUSTOMER_ID` | ว่าง | Customer UUID ที่บัญชี customer จะผูก |
| `PILOT_ADMIN_EMAIL` | ว่าง | อีเมล Admin |
| `PILOT_ADMIN_PASSWORD` | Secret / ว่าง | รหัส Admin |
| `PILOT_OWNER_EMAIL` | ว่าง | อีเมล Owner |
| `PILOT_OWNER_PASSWORD` | Secret / ว่าง | รหัส Owner |
| `PILOT_CUSTOMER_EMAIL` | ว่าง | อีเมล Customer User |
| `PILOT_CUSTOMER_PASSWORD` | Secret / ว่าง | รหัส Customer User |

แนะนำให้คง `PILOT_USERS_ENABLED=false` และใช้คำสั่งสร้าง user แบบ audited ใน API terminal จาก `coolify-manual-users-th.md` หลังสร้างเสร็จให้ลบ password variables ออกจาก Coolify

## 2. Standalone managed MQTT resource

Resource นี้ใช้ `infra/docker/docker-compose.mqtt.yml` แยกจาก web application

| Variable | สถานะ | หน้าที่ |
| --- | --- | --- |
| `MQTT_IMAGE` | CI / ต้องกำหนด | Immutable image ของ broker จาก CI run เดียวกับ release |
| `CERTBOT_IMAGE` | CI / ต้องกำหนด | Immutable image ของ certificate service |
| `MQTT_PASSWORD` | Secret / ต้องกำหนด | รหัสบัญชี backend `solar-backend` อย่างน้อย 16 ตัวอักษร ต้องตรงกับ Web resource |
| `MQTT_GATEWAY_CREDENTIALS` | Secret / ต้องกำหนด | JSON map จาก Gateway ID ไปยังรหัสเฉพาะ เช่น `{"GW-001":"..."}` ห้ามใช้ backend password กับ Gateway |
| `CLOUDFLARE_API_TOKEN` | Secret / ต้องกำหนด | Token ที่มี DNS Edit เฉพาะ zone ที่ใช้ทำ DNS-01 certificate |
| `ACME_EMAIL` | ต้องกำหนด | อีเมลผู้รับผิดชอบ certificate |
| `MQTT_CPU_LIMIT` | `0.25` | CPU ceiling ของ broker |
| `MQTT_MEMORY_LIMIT` | `128m` | Memory ceiling ของ broker |
| `MQTT_MEMORY_RESERVATION` | `32m` | Memory reservation ของ broker |
| `CERTBOT_CPU_LIMIT` | `0.25` | CPU ceiling ของ certificate service |
| `CERTBOT_MEMORY_LIMIT` | `128m` | Memory ceiling ของ certificate service |
| `CERTBOT_MEMORY_RESERVATION` | `32m` | Memory reservation ของ certificate service |

`MQTT_TLS_DOMAIN` ถูกกำหนดใน Compose เป็น `mqtt-solar.fowir.com` หากจะเปลี่ยนโดเมนต้องแก้ Compose/runbook และตรวจ certificate/ACL ทั้งชุด ไม่เพิ่มเป็น variable เฉพาะกิจ

## 3. Disaster-recovery artifact resource

ค่ากลุ่มนี้ใช้กับ resource สำรอง/กู้เอกสารและ configuration แยกต่างหาก ห้ามส่ง storage credentials ชุดนี้เข้า API หรือ web resource

| Variable | ค่าเริ่มต้น | หน้าที่ |
| --- | --- | --- |
| `DR_ARTIFACT_BACKUP_ENABLED` | `false` | เปิด scheduler สำรองเอกสาร/config หลังทดสอบปลายทาง |
| `DR_ARTIFACT_BACKUP_INTERVAL_SECONDS` | `300` | รอบสำรอง 60–900 วินาที |
| `DR_ARTIFACT_BACKUP_TIMEOUT_SECONDS` | `300` | timeout ต่อรอบ สูงสุด 900 วินาที |
| `DR_DOCUMENTS_ENDPOINT` | ว่าง | Endpoint bucket ต้นทางของเอกสาร |
| `DR_DOCUMENTS_REGION` | ว่าง | Region ของ bucket ต้นทาง |
| `DR_DOCUMENTS_BUCKET` | ว่าง | Bucket ต้นทาง |
| `DR_DOCUMENTS_ACCESS_KEY` | Secret | Access key ต้นทาง |
| `DR_DOCUMENTS_SECRET_KEY` | Secret | Secret key ต้นทาง |
| `DR_REPOSITORY_ENDPOINT` | ว่าง | Endpoint ของ backup repository |
| `DR_REPOSITORY_REGION` | ว่าง | Region ของ repository |
| `DR_REPOSITORY_BUCKET` | ว่าง | Bucket ปลายทาง |
| `DR_REPOSITORY_ACCESS_KEY` | Secret | Access key ปลายทาง |
| `DR_REPOSITORY_SECRET_KEY` | Secret | Secret key ปลายทาง |
| `DR_ARTIFACT_CIPHER_PASS` | Secret | Encryption password แยกจาก app/DB และเก็บ escrow |
| `DR_CONFIG_EXPORT_FILE` | ว่าง | Path ไฟล์ configuration export ที่จะสำรอง |
| `DR_ARTIFACT_MANIFEST_KEY` | ใช้ตอน restore | Manifest key ของ generation ที่จะกู้ |
| `DR_CONFIG_RESTORED_FILE` | ใช้ตอน restore | Path ใหม่สำหรับ config ที่กู้แล้ว |
| `DR_REQUIRED_INVENTORY_FILE` | ใช้ตอน restore | Inventory ที่ต้องตรวจ coverage/checksum |

## 4. ตัวแปรที่ Compose กำหนดให้แล้ว

ตัวแปรเหล่านี้ไม่ต้องเพิ่มเองใน Coolify web resource:

| Variable | ค่าที่ Compose กำหนด | เหตุผล |
| --- | --- | --- |
| `NODE_ENV` | `production` | Runtime mode |
| `API_PORT` | `3001` | พอร์ตภายใน API |
| `WORKER_PORT` | `3002` | พอร์ตภายใน worker |
| `PORT` ของ web | `3000` | พอร์ตภายใน Next.js |
| `WEB_URL` | `https://solar.fowir.com` | Allowed browser origin และลิงก์ invitation/reset |
| `API_INTERNAL_URL` | `http://api:3001` | Web-to-API ภายใน Compose |
| `REDIS_URL` | `redis://redis:6379` | Redis ภายใน Compose |
| `STORAGE_ENDPOINT` | `http://storage:9000` | MinIO ภายใน Compose |
| `STORAGE_ACCESS_KEY` | จาก `MINIO_ROOT_USER` | ส่งให้ API/worker โดย Compose |
| `STORAGE_SECRET_KEY` | จาก `MINIO_ROOT_PASSWORD` | ส่งให้ API/worker โดย Compose |
| `PLATFORM_BACKUP_STATUS_FILE` | `/var/lib/solar-backup/status.json` | Read-only status volume |
| `PLATFORM_RELEASE_EVIDENCE_FILE` | `/var/lib/solar-release/evidence.json` | Read-only release evidence volume |

ไม่ต้องตั้ง `NEXT_PUBLIC_API_URL` ใน web-first deployment หน้าเว็บใช้ same-origin `/v1` แล้ว proxy ไป `API_INTERNAL_URL` ห้ามใส่ `localhost` ใน production container

## 5. ข้อมูลที่ไม่ใช่ ENV

Owner ต้องกรอกและแก้ไขในหน้า Settings เพื่อให้มี audit และทำให้ readiness invalidation ทำงานถูกต้อง:

- ชื่อนิติบุคคล เลขประจำตัวผู้เสียภาษี สาขา ที่อยู่ โทรศัพท์และอีเมล
- โลโก้บริษัท PNG/JPEG สำหรับหน้าเว็บและเอกสาร
- ชื่อผู้ลงนาม ตำแหน่ง และลายเซ็น
- บัญชีธนาคารหลัก ชื่อบัญชี เลขบัญชี และข้อมูลรับชำระ
- ข้อมูลลูกค้า/ไซต์ ผู้รับเอกสารและอีเมลที่ยืนยันแล้ว
- อัตราค่าไฟ ช่วงวันที่มีผล ภาษี เงื่อนไขชำระเงิน
- Meter, billing source และข้อมูล telemetry ครบตาม boundary ของรอบบิล

ข้อมูลเหล่านี้ห้ามย้ายไป ENV เพราะเป็นข้อมูลธุรกิจที่ Owner ต้องแก้ไขได้ มี audit trail และการเปลี่ยนต้องยกเลิก approval เดิม

## 6. ลำดับการตั้งค่า

1. เตรียม domain, PostgreSQL/MinIO secrets, JWT/TOTP/MQTT encryption secrets และ image digests
2. Deploy web resource โดย MQTT และ Finance flags ยัง false
3. สร้าง user แบบ audited แล้วให้ Owner กรอกข้อมูลบริษัทและไซต์
4. ตั้ง SMTP จริงและ Redeploy
5. Owner ตรวจ notification/readiness และกดยืนยัน
6. เปิด `FINANCIAL_WRITES_ENABLED=true`, Redeploy และรัน one-shot dry-run/apply/replay
7. ตรวจ PDF, hash, outbox และอีเมลปลายทางจริง
8. เปิด `FINANCIAL_SCHEDULER_ENABLED=true` แล้ว Redeploy
9. เปิด MQTT, report, archive, backup, monitoring หรือ DR ทีละระบบหลัง acceptance ของส่วนนั้นผ่าน

## 7. รายการข้อมูลที่ต้องเตรียมจากภายนอก

- CI image digests ของ commit ที่จะ deploy
- Domain และ Coolify proxy/certificate configuration
- Secret สุ่มแยกสำหรับ DB, MinIO, JWT access, JWT refresh, TOTP และ MQTT credential encryption
- SMTP host/port/security/user/password และ verified sender พร้อม SPF/DKIM/DMARC
- หากใช้ managed MQTT: Cloudflare DNS token, ACME email, backend password และรหัสแยกต่อ Gateway
- หากเปิด backup: S3 endpoint/bucket/region/access keys และ encryption passphrase ที่มี escrow
- หากเปิด monitoring: webhook URL/token และผู้รับที่ทดสอบแล้ว
- หากเปิด DR: source/destination object-storage credentials, cipher passphrase และ recovery inventory policy

ค่าจริงทุก secret ต้องเก็บใน Coolify/secret manager เท่านั้น ไฟล์ example และเอกสารนี้เก็บเฉพาะชื่อ ตัวอย่างรูปแบบ และค่า default ที่ไม่ลับ
