# Deploy เฉพาะเว็บไซต์ solar.fowir.com บน Coolify

ปรับปรุง 6 ตุลาคม 2026 — pilot 2 vCPU / RAM 4 GiB, migration ถึง 028, **ไม่มี bootstrap และไม่มี user ถูกเพิ่มอัตโนมัติ**

## 1. เตรียม release และ private repository

1. Push main → GitHub Actions → CI and staging รอ verify สำเร็จ คัดลอก API_IMAGE, WEB_IMAGE, WORKER_IMAGE, POSTGRES_IMAGE จาก Summary ของ commit เดียวกัน เป็น ghcr.io/...@sha256:... จริง ไม่ใช้ placeholder/latest
2. ตั้ง STAGING_DEPLOY_ENABLED=false ใน GitHub Variables ระหว่างติดตั้งครั้งแรก และปิด Auto Deploy ใน Coolify
3. ถ้า repo private ติดตั้ง GitHub App ให้เข้าถึงเฉพาะ repo นี้ตาม [คู่มือ](coolify-private-github-th.md) หาก GHCR packages private ต้อง docker login แยกด้วย read:packages บน server user ที่ Coolify ใช้
4. ตรวจ public IP เครื่อง, RAM/disk ที่ว่าง และ Coolify Proxy ทำงาน ใช้ resource limits ตาม [ตาราง pilot](coolify-solar-fowir-deployment-detailed-th.md)

## 2. DNS และ HTTPS สำหรับเว็บ

1. Cloudflare → fowir.com → DNS → Records → Add record: Type A, Name solar, IPv4 address เป็นเครื่อง Coolify (ผลตรวจล่าสุด 188.166.250.177; ต้องตรวจให้ตรงเครื่องจริง), Proxy status DNS only, TTL Auto
2. ถ้ามี AAAA ให้ชี้ IPv6 ที่เข้าถึงเครื่องนี้จริง หากไม่มี IPv6 ให้เอาเฉพาะ record AAAA ที่ผิดของโดเมนนี้ออก
3. เปิด TCP 80/443 ผ่าน firewall/NAT ไป Coolify Proxy; ไม่ต้องเปิด 1883/8883 สำหรับเว็บ
4. เว็บใช้ HTTPS certificate ของ Coolify ผ่าน domain https://solar.fowir.com ไม่ต้องมี Cloudflare API token หรือ ACME_EMAIL ของ broker ไม่ต้องสร้าง wildcard domain/zone ใหม่สำหรับ solar; fowir.com เป็น zone ที่มีอยู่แล้ว

## 3. สร้าง Application

1. Coolify → Project → Environment → New Resource → Git repository (private with GitHub App หาก private)
2. เลือก server/destination เดิม → Repository nateekarni/solar-roof → Branch main → Build Pack Docker Compose
3. Base Directory /; Docker Compose Location **/infra/docker/docker-compose.web.yml** → Save / Load Compose
4. Domains for web: **https://solar.fowir.com:3000** พอร์ต 3000 คือปลายทาง container ของ proxy เวลาเปิดจริงใช้ https://solar.fowir.com
5. Domains ของ api, worker, postgres, redis, storage และ one-shot เว้นว่าง ไม่ expose database/API/MinIO console บน host
6. ถ้ามี resource เว็บเดิมให้อัปเดต resource เดิมเพื่อรักษา volumes อย่าสร้างใหม่ทับโดเมนเดียวกัน

## 4. Environment Variables

เปิด [infra/docker/.env.web.example](../../infra/docker/.env.web.example) จาก release ใหม่แล้วนำค่าไปกรอก Coolify Environment Variables (available at runtime) ไม่ upload .env จาก localhost

| ค่า | ตั้งเป็น |
|---|---|
| API_IMAGE / WEB_IMAGE / WORKER_IMAGE / POSTGRES_IMAGE | digest จริงจาก CI run เดียวกัน |
| POSTGRES_DB / POSTGRES_USER | solar_platform / solar สำหรับติดตั้งใหม่ |
| POSTGRES_PASSWORD | secret สุ่มใหม่สำหรับ DB ใหม่เท่านั้น |
| DATABASE_URL | postgresql://solar:รหัสที่_percent_encodeแล้ว@postgres:5432/solar_platform |
| JWT_ACCESS_SECRET / JWT_REFRESH_SECRET | secret สุ่มต่างกันอย่างน้อย 32 ตัวอักษร |
| MINIO_ROOT_USER / MINIO_ROOT_PASSWORD | solar / secret สุ่มสำหรับ storage ใหม่ |
| STORAGE_REGION / STORAGE_BUCKET | us-east-1 / solar-platform |
| MQTT_ENABLED / MQTT_DEFAULT_BROKER_ENABLED | false / false |
| MQTT_URL / MQTT_USERNAME / MQTT_PASSWORD | ว่าง |
| API_EDGE_ENABLED / TRUSTED_PROXY_CIDRS | false / ว่าง |
| INGEST_CONCURRENCY / API_READ_POOL_MAX / INGEST_DB_POOL_MAX | 2 / 4 / 2 |
| PILOT_USERS_ENABLED | false; ใช้คำสั่งใน Terminal แทนการเปิด seed ค้างไว้ |
| SMTP_* | ใส่จริงเมื่อจะใช้งานเชิญอีเมล; เพิ่ม user ด้วยคำสั่งไม่ต้องมี SMTP |
| feature flags report/archive/retention/restore/monitoring/backup | เริ่ม false ตาม example จนตรวจระบบนั้นพร้อม |

ไม่ต้องมี BOOTSTRAP_ADMIN_EMAIL/PASSWORD หรือ bootstrap resource แล้ว ถ้าอัปเดตของเดิมลบ variables เหล่านี้ออกจาก Coolify ได้ ไม่เปลี่ยนรหัส DB/MinIO ที่มีข้อมูลอยู่เพียงเพื่อให้เหมือน example

WEB_URL=https://solar.fowir.com ถูกกำหนดใน API Compose; API_INTERNAL_URL=http://api:3001 ถูกกำหนดใน web Compose ไม่ใส่ localhost หรือ mqtt-solar เป็น API URL

เก็บค่าพวก PLATFORM_RELEASE_REVISION / PLATFORM_IMAGE_DIGESTS_JSON / PLATFORM_RELEASE_EVIDENCE_JSON ตาม release ที่ผ่านการตรวจ หากยังไม่มี evidence สำหรับ feature เพิ่มเติมให้คง feature flags false ไม่สร้างผลตรวจสมมติ

## 5. Deploy และตรวจ service

1. Save variables → Deploy ตรวจว่า checkout commit ถูกและ pull digests ถูก
2. Logs postgres/redis/storage ต้อง healthy
3. migrate ต้อง Exited(0) รวม migration 028_preset_catalog.sql; storage-init สร้าง bucket และ Exited(0); release-evidence Exited(0)
4. api, worker, web ต้อง healthy ไม่มี service bootstrap; เว็บพร้อมได้แม้ตาราง users ว่าง
5. https://solar.fowir.com/login ต้องเปิดได้ แต่ยังไม่มีบัญชี login จนรันขั้น 6
6. ใน Coolify → Terminal → service api ตรวจ (ไม่ต้องเปิด API port บนอินเทอร์เน็ต):

~~~sh
node --input-type=module -e 'for(const p of ["/health","/ready","/ready/mqtt"]){const r=await fetch("http://127.0.0.1:3001"+p);console.log(p,r.status,await r.text());if(!r.ok)process.exitCode=1;}'
~~~

/ready ตรวจฐานข้อมูล/Redis/storage สำหรับเว็บ; /ready/mqtt ต้องตอบ 200 status disabled ตอน MQTT_ENABLED=false ทั้งสองเส้นตรวจแยกกัน ส่วนเว็บ /health เป็น web health ไม่ใช่ broker probe

## 6. เพิ่ม user ใน Coolify เอง

ทำตาม [คู่มือคำสั่งเพิ่ม user](coolify-manual-users-th.md): สร้าง Admin → login → เพิ่มโรงเรียน/ไซต์ → สร้าง Owner และ School User ที่ผูกโรงเรียน/ไซต์จริง รหัสอย่างน้อย 16 ตัวอักษร คำสั่งใช้ transaction/audit และไม่ reset รหัสเดิมเมื่อรันซ้ำ

ไม่ใช้ db:seed หรือ db:seed:reset บน deployment เพราะเป็น demo seed ไม่ใช่คำสั่งเพิ่มบัญชี

## 7. ทดสอบและอัปเดต

- ทดสอบ Admin เข้าถึงทุกเมนู, Owner เห็นเฉพาะงานบริษัท/เอกสาร และ School User เห็นเฉพาะโรงเรียนที่ผูกไว้
- เพิ่มไซต์ เลือก Pilot SPM91 หรือเพิ่ม Preset ของตัวเอง ตรวจ Preview หน่วย Wh → kWh; การเลือก Preset ไม่ได้ตั้ง firmware Gateway
- ยังไม่มี telemetry ให้หน้าเว็บแสดงข้อมูลตามที่มีจริง ไม่สร้าง production samples จำลอง
- เมื่ออัปเดตให้เปลี่ยน 4 image digests ใน resource เดิม → Deploy → ตรวจ migration/health/login คำสั่ง migrate รันอัตโนมัติอยู่แล้ว หากต้องตรวจซ้ำรัน pnpm --filter @solar/api db:migrate ใน API terminal ได้
- ไม่เปลี่ยน resource/project/volume names และไม่ down -v; backup DB + storage ก่อน migration

## 8. ใช้ Broker ภายนอกที่ผู้ดูแล Gateway ให้

ไม่ต้อง deploy mqtt-solar.fowir.com ของเราในกรณีนี้:

1. Admin เพิ่ม Broker จริงในระบบ (URL mqtts://โฮสต์จริง:พอร์ต, TLS, username/password จากผู้ดูแล), เพิ่มไซต์/Gateway/Device และเลือก Preset
2. ใช้ SITE-001 / GW-001 / SPM91-01 ให้ตรง **external IDs ใน payload** และ topic solar/v1/sites/SITE-001/gateways/GW-001/devices/SPM91-01/telemetry; UUID ในฐานข้อมูลเป็นคนละค่า
3. ใน Coolify web resource เปลี่ยน MQTT_ENABLED=true, MQTT_DEFAULT_BROKER_ENABLED=false; MQTT_URL/USERNAME/PASSWORD เริ่มต้นยังว่าง → Save → Redeploy
4. /ready ของเว็บต้องยัง 200; /ready/mqtt ตรวจ registered brokers จริงต้อง ready; ทดสอบรับค่าจริงแล้วตรวจ samples/หน่วย/เวลาล่าสุด
5. ขอ permission subscribe และ publish ACK dataAcept ของ Gateway จากผู้ดูแล broker ตาม protocol ระบบ; ข้อมูล QoS0 อาจสูญหายได้ไม่ใช่ exactly-once transport

ถ้าเปลี่ยนมาใช้ broker ของเราให้ทำ [คู่มือ MQTT แยก](coolify-mqtt-deployment-th.md)

## แก้ปัญหา

| อาการ | ตรวจ |
|---|---|
| private repo clone ไม่ได้ | GitHub App installation/repository permission |
| private image pull ไม่ได้ | GHCR login ของ user บน server, digest และ package access |
| migrate failed | Logs; ใช้ DATABASE_URL ที่ password percent-encoded; ห้ามล้าง volume |
| 502 | domain web port 3000, proxy network, api/web readiness และ storage-init |
| login ไม่มีบัญชี | รัน db:create:user ก่อน ไม่ต้องตั้ง bootstrap |
| MQTT offline แต่เว็บ healthy | ถูกต้องตาม health checks แยก; ตรวจ broker ตั้งค่าต่างหาก |

อ้างอิงขั้นตอน UI/port จาก [Coolify Domains](https://coolify.io/docs/core/networking/domains), [Deployment methods](https://coolify.io/docs/applications/choose-deployment-method) และ [Sources](https://coolify.io/docs/applications/sources/overview)
