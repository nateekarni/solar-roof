# Deploy เว็บก่อน และเปิด MQTT ภายหลัง — solar.fowir.com

ใช้สำหรับ pilot บนเครื่องเดิม 2 vCPU / RAM 4 GiB ชุดนี้เริ่ม Web, API, Worker, PostgreSQL, Redis และพื้นที่เก็บเอกสาร พร้อม migration/bootstrap โดยไม่เริ่ม Mosquitto, Certbot หรือ MQTT connection

## 1. เลือกรุ่นที่ผ่าน CI

เปิด GitHub Actions ของ `main` เลือกรุ่นที่งาน `verify` ผ่าน แล้วนำ image digest ของ **web, api, worker, postgres-backup** จากหลักฐาน release ของรุ่นเดียวกันมาใช้ รูปแบบ `ghcr.io/nateekarni/solar-roof/api@sha256:…` ไม่ใช้ placeholder ในไฟล์ตัวอย่างหรือ tag ที่เปลี่ยนตามเวลา หาก image เป็น private ให้เพิ่ม GitHub registry credential ที่มี `read:packages` ใน Coolify

## 2. Domain และ HTTPS เว็บไซต์

ใน DNS ของ `fowir.com` เพิ่ม A record ชื่อ `solar` ชี้ public IPv4 ของเซิร์ฟเวอร์ ใช้ DNS only ในช่วงตรวจครั้งแรก หากมี AAAA ต้องชี้ IPv6 ที่เข้าถึงเครื่องนี้จริง เปิด inbound TCP 80 และ 443 ให้ reverse proxy ของ Coolify ไม่ต้องเปิด 1883/8883 หรือสร้าง `mqtt-solar` ในระยะนี้

Certificate ของเว็บไซต์ให้ Coolify ออกและต่ออายุผ่าน domain `https://solar.fowir.com` ไม่ต้องใช้ Cloudflare DNS token หรือ ACME_EMAIL ของ MQTT ตรวจ DNS ให้ชี้ถูกก่อน Deploy และให้ port 80 เข้าถึงได้สำหรับ HTTP challenge

## 3. สร้าง Resource ใน Coolify

1. เลือก Project → Environment → Add Resource → Git repository / Docker Compose
2. Repository: `nateekarni/solar-roof`, Branch: `main`, Base Directory: `/`
3. Docker Compose Location: `/infra/docker/docker-compose.web.yml`
4. เลือก service **web** แล้วกำหนด Domain: `https://solar.fowir.com` และ port ภายใน **3000** หาก UI ต้องการ URL พร้อม port ให้ใส่ `https://solar.fowir.com:3000` โดย port นี้เป็นปลายทาง container ของ proxy
5. API, PostgreSQL, Redis และ Storage ไม่ต้องมี public Domain หรือ host port ใช้ network ภายในตาม Compose
6. ปิด automatic deployment ระหว่างตั้งค่าครั้งแรก แล้วเปิดภายหลังได้

## 4. Environment Variables

เปิด `infra/docker/.env.web.example` ใช้เป็นรายการตั้งค่าใน Environment Variables ของ Resource ไม่ต้อง commit ไฟล์ secret

| ตัวแปร | ค่า/วิธีตั้ง |
| --- | --- |
| WEB_IMAGE, API_IMAGE, WORKER_IMAGE, POSTGRES_IMAGE | digest จาก CI รุ่นเดียวกัน |
| POSTGRES_DB / POSTGRES_USER | `solar_platform` / `solar` |
| POSTGRES_PASSWORD | secret สุ่มของฐานข้อมูล |
| DATABASE_URL | `postgresql://solar:รหัสผ่านที่percent-encodeแล้ว@postgres:5432/solar_platform` |
| JWT_ACCESS_SECRET / JWT_REFRESH_SECRET | secret สุ่มคนละค่า อย่างน้อย 32 ตัวอักษร |
| BOOTSTRAP_ADMIN_EMAIL | Email ผู้ดูแลเริ่มต้น |
| BOOTSTRAP_ADMIN_PASSWORD | รหัสผ่านเริ่มต้นอย่างน้อย 16 ตัวอักษร |
| MINIO_ROOT_USER / MINIO_ROOT_PASSWORD | `solar` / secret สุ่มสำหรับพื้นที่เอกสาร |
| STORAGE_REGION / STORAGE_BUCKET | `us-east-1` / `solar-platform` |
| MQTT_ENABLED | **false** |
| MQTT_DEFAULT_BROKER_ENABLED | **false** |
| MQTT_URL / MQTT_USERNAME / MQTT_PASSWORD | เว้นว่าง |
| API_EDGE_ENABLED | **false** ใช้ API ผ่านเว็บ proxy ที่มีอยู่ |
| TRUSTED_PROXY_CIDRS | เว้นว่าง |

หากต้องส่งอีเมลเชิญผู้ใช้ ให้ตั้ง SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM จากผู้ให้บริการอีเมล: โดยทั่วไป 587 + false หรือ 465 + true ตามข้อกำหนดผู้ให้บริการ ค่าเหล่านี้ส่งเข้า API เท่านั้น หากไม่ตั้ง SMTP การส่งคำเชิญจะไม่สำเร็จ

คง feature flags สำหรับ financial writes, read model, archive, report worker, monitoring และ backup ตามค่า false ในตัวอย่าง จนมีหลักฐานทดสอบตาม runbook เดิม การ deploy เว็บสำเร็จไม่ได้หมายความว่า feature gates เหล่านี้ผ่านแล้ว

## 5. Resource บนเครื่องเดิม

Compose กำหนดเพดานไว้แล้ว ไม่ต้องเพิ่ม limit ของทั้ง Resource ให้ต่ำกว่าผลรวม container

| Container | CPU limit | RAM limit |
| --- | --- | --- |
| PostgreSQL | 0.75 | 768 MiB |
| Redis | 0.25 | 128 MiB |
| Storage | 0.25 | 256 MiB |
| API | 0.75 | 512 MiB |
| Worker | 0.25 | 256 MiB |
| Web | 0.50 | 384 MiB |

RAM ของ service ที่รันต่อเนื่องรวมประมาณ 2.25 GiB เหลือสำหรับ OS/Coolify/proxy และงานเริ่มต้น CPU เป็นเพดานต่อ container และแชร์เครื่อง 2 vCPU ไม่ใช่การจอง CPU แยกกัน Migration มี RAM 256 MiB; bootstrap/storage-init/release-evidence อย่างละ 128 MiB ตรวจการใช้งานจริงใน Metrics หลังเริ่มระบบ

## 6. Deploy และตรวจสอบ

1. Save variables แล้วกด Deploy
2. ตรวจว่า postgres/redis/storage healthy และ storage-init/migrate/bootstrap/release-evidence จบด้วย exit 0
3. ตรวจ api, worker, web healthy แล้วเปิด `https://solar.fowir.com/login` และเข้าสู่ระบบด้วย bootstrap admin
4. สร้างบริษัท โรงเรียน และบัญชีที่ต้องการผ่าน Admin ตรวจการเข้าใช้ตาม role และการเก็บเอกสาร
5. ใน Terminal ของ service **api** รัน:

```sh
node -e "Promise.all(['/health','/ready','/ready/mqtt'].map(async p=>{const r=await fetch('http://127.0.0.1:3001'+p);console.log(p,r.status,await r.text())}))"
```

คาดหวัง `/health` 200, `/ready` 200, `/ready/mqtt` 200 พร้อม `status: disabled` ค่านี้บอกว่าปิดการรับ MQTT โดยตั้งใจ ไม่ใช่ Broker เชื่อมต่อแล้ว ไม่ต้องเปิด endpoint ของ API ต่อ internet เพื่อทดสอบ

กราฟพลังงานต้องแสดงข้อมูลที่มีจริงและสถานะความสดตามระบบ หากยังไม่มี telemetry ไม่ใช้ตัวเลขจำลองเป็นค่าการผลิตจริง

## 6.1 Seed บัญชีสำหรับทดสอบ 3 role

`db:seed` เดิมเป็น demo seed ที่ล้างตาราง และปฏิเสธ production ให้ใช้ **`db:seed:users`** สำหรับ pilot ซึ่งเพิ่มเฉพาะบัญชี ไม่สร้าง telemetry/เอกสารจำลอง ไม่เปลี่ยน role หรือรหัสผ่านของบัญชีที่มีอยู่

1. หลัง Deploy ให้ล็อกอินด้วย bootstrap admin แล้วสร้างโรงเรียนผ่านหน้า Admin ก่อน
2. นำ UUID ของโรงเรียนจากรายละเอียด/URL หรือเปิด Terminal ของ service **api** แล้วใช้คำสั่งนี้เพื่อดูรายการ:

```sh
node --input-type=module -e 'import {Pool} from "pg";const db=new Pool({connectionString:process.env.DATABASE_URL});try{console.table((await db.query("SELECT id,name,code,status FROM schools ORDER BY name")).rows)}finally{await db.end()}'
```

3. เพิ่ม variables ต่อไปนี้ใน Coolify Resource แล้ว Save/Redeploy เพื่อส่งค่าเข้า container API:

```dotenv
PILOT_USERS_ENABLED=true
PILOT_SCHOOL_ID=UUID_ของโรงเรียนที่มีสถานะ_active
PILOT_ADMIN_EMAIL=Email_เดียวกับ_BOOTSTRAP_ADMIN_EMAIL
PILOT_ADMIN_PASSWORD=รหัสผ่านเดิมของ_bootstrap_admin
PILOT_OWNER_EMAIL=owner-pilot@fowir.com
PILOT_OWNER_PASSWORD=รหัสผ่านสุ่มสำหรับ_Owner_อย่างน้อย_16_ตัวอักษร
PILOT_SCHOOL_EMAIL=school-pilot@fowir.com
PILOT_SCHOOL_PASSWORD=รหัสผ่านสุ่มสำหรับ_School_User_อย่างน้อย_16_ตัวอักษร
```

Email ทั้งสามต้องแตกต่างกัน ใช้ Email ที่คุณต้องการจริง ตัวอย่างด้านบนไม่ใช่บัญชีที่ถูกสร้างไว้แล้ว และไม่ต้องตั้ง SMTP เพื่อ seed ด้วยคำสั่งนี้ หากต้องการ Admin ทดสอบแยกจาก bootstrap ให้ใช้ Email ใหม่และรหัสผ่านใหม่ได้

4. เปิด Terminal ของ service **api** แล้วรัน:

```sh
pnpm --filter @solar/api db:seed:users
```

5. ตรวจผล `admin`, `owner`, `school_user` โดย `created` หมายถึงสร้างใหม่ ส่วน `preserved; password unchanged` หมายถึงรักษาบัญชีและรหัสผ่านเดิม การรันซ้ำไม่ใช่คำสั่ง reset password
6. เปิด `https://solar.fowir.com/login` ทดสอบทั้งสามบัญชี Owner ดูมุมมองบริษัท ส่วน School User ดูเฉพาะโรงเรียนที่ระบุ หากโรงเรียนยังไม่มีไซต์/ข้อมูลการผลิต ให้เพิ่มผ่าน Admin ตอนตั้งค่าเครื่องจริง
7. หลังสำเร็จให้ตั้ง `PILOT_USERS_ENABLED=false` ล้าง `PILOT_ADMIN_PASSWORD`, `PILOT_OWNER_PASSWORD`, `PILOT_SCHOOL_PASSWORD` จาก Coolify แล้ว Redeploy บัญชีในฐานข้อมูลยังอยู่และล็อกอินด้วยรหัสผ่านเดิมได้

คำสั่งใช้ transaction: หากโรงเรียนไม่ active, Email มี role/โรงเรียนผิด, บัญชีถูกปิด หรือไม่มี password hash จะหยุดและ rollback ทั้งชุด ไม่เปลี่ยนสิทธิ์บัญชีเดิมแบบเงียบ ๆ ระบบจะบันทึก audit ของบัญชีที่สร้างใหม่

## 7. เปิดใช้งาน External Broker ภายหลัง

1. ขอ URL, port, TLS/CA requirements, username/password, topic และ ACL จากผู้ดูแล gateway ไม่ต้องติดตั้ง Broker บนเครื่องเรา
2. เพิ่ม Broker ผ่านหน้า Admin และผูกกับ gateway พร้อม MQTT endpoint/topic ของ gateway ให้ตรงกับสิทธิ์ที่ได้รับ หลีกเลี่ยง topic ที่กว้างเกินจำเป็น
3. ใน **Resource เดิม** ตั้ง `MQTT_ENABLED=true` และคง `MQTT_DEFAULT_BROKER_ENABLED=false` แล้ว Redeploy โดยใช้ `docker-compose.web.yml` เดิม
4. ไม่ต้องกรอก MQTT_GATEWAY_CREDENTIALS, CLOUDFLARE_API_TOKEN หรือ certificate ของ Broker ภายนอก หาก Broker ใช้ CA ส่วนตัวต้องจัดการ trust ตามข้อกำหนดก่อนเชื่อมต่อ ไม่ปิดการตรวจ TLS
5. ตรวจ `/ready/mqtt`: 200 `ready` เมื่อ Broker ทุกตัวที่ผูกกับ gateway เชื่อมต่อและ subscribe สำเร็จ; 503 `not_configured` เมื่อยังไม่ได้ผูก; 503 `not_ready`/`degraded` เมื่อยังไม่พร้อม
6. ส่งข้อมูลจากเครื่องจริง ตรวจเวลารับข้อมูล, ค่าที่ถอดรหัส, ACK และสถานะข้อมูล stale หาก Broker หลุด เว็บไซต์และ `/ready` ยังทำงาน ส่วน `/ready/mqtt` เปลี่ยนเป็น 503 และระบบพยายามเชื่อมต่อใหม่

## 8. หากภายหลังจะใช้ Broker ของเราเอง

ใช้ [runbook full stack](coolify-solar-fowir-deployment-detailed-th.md) สำหรับ MQTT TLS/Cloudflare เพิ่ม variables ของ MQTT/Certbot ตั้ง `MQTT_ENABLED=true` และ `MQTT_DEFAULT_BROKER_ENABLED=true` แล้วเปลี่ยน Compose path ของ **Resource เดิม** เป็น `/infra/docker/docker-compose.staging.yml` ตรวจว่าไม่เหลือค่า false จากระยะ web-first

ทั้งสองไฟล์ใช้ชื่อ volumes ของข้อมูลเว็บเหมือนกัน: postgres-data, redis-data, minio-data และ volumes หลักฐาน ต้องรักษา Compose project/Resource identity เดิมและสำรองข้อมูลก่อนเปลี่ยน ห้ามลบ volumes หรือสร้าง Resource ใหม่แล้วคาดว่าข้อมูลจะตามไปเอง ตรวจการเชื่อม volumes ใน Coolify ก่อน Deploy

## 9. อัปเดตและย้อนรุ่น

บันทึก image digests เดิมก่อนอัปเดต เปลี่ยนเป็น digest ของรุ่นใหม่ที่ verify ผ่านแล้ว Redeploy resource เดิม หากต้อง rollback ให้คืน digest ของแอปเดิม โดยตรวจความเข้ากันได้ของ schema/migration ก่อน ไม่ลบฐานข้อมูลหรือรัน seed reset ในระบบที่มีข้อมูลลูกค้า
