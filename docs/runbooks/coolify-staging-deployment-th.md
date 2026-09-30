# Deploy Solar staging ผ่านหน้าเว็บทีละขั้น

ใช้ Coolify ของบริษัทที่มีอยู่แล้ว ไม่ต้องเพิ่ม server, SSH, SCP หรือติดตั้งอะไรบนเครื่องส่วนตัว งาน build/test ทำบน GitHub ส่วน Coolify ดึง image มารัน

- เว็บ: https://solar.nateekarn.dev
- Gateway ส่ง MQTT ผ่าน TLS: mqtt-solar.nateekarn.dev พอร์ต 8883
- GitHub: nateekarni/solar-roof, branch main
- Coolify project: https://coolify.fowir.com/project/lskcgscsooocwo8o8kwgsgsw
- Server: live

ขั้นตอนนี้เป็นการตั้งครั้งแรก ยังไม่ใช่หลักฐานว่า deploy บนบริษัทแล้ว อ่านผลที่ตรวจจริงใน [verification](../deployment/verification.md)

## 1. รอ image จาก GitHub

1. เปิด repository → **Settings → Secrets and variables → Actions → Variables**
2. สร้าง repository variable `STAGING_DEPLOY_ENABLED` ค่า `false` เพื่อยังไม่ deploy อัตโนมัติ
3. เปิด **Actions → CI and staging** เลือก run ของ main ล่าสุด รอ job `verify` สีเขียว หากแดง ให้แก้ก่อน
4. เปิด Summary ของ run นั้น คัดลอกทั้งห้าบรรทัด `API_IMAGE`, `WEB_IMAGE`, `WORKER_IMAGE`, `MQTT_IMAGE`, `CERTBOT_IMAGE` เก็บไว้ แต่ละค่าเป็น `ghcr.io/nateekarni/solar-roof/...@sha256:...`
5. ใช้ห้าค่าจาก run เดียวกัน ห้ามใช้ `latest` หรือใส่ข้อความตัวอย่าง `REPLACE...`

ครั้งแรกที่ยังไม่มี run ให้ Actions → CI and staging → Run workflow → Branch main → Run workflow

## 2. ให้ Coolify ดาวน์โหลด image ได้โดยไม่ใช้ SSH

Repository เป็น public แต่ GitHub container package ที่สร้างใหม่อาจยัง private วิธีผ่านหน้าเว็บทั้งหมดคือให้เจ้าของ package ตั้ง **public** หลังตรวจว่าเปิดเผยได้ โดย image มีโค้ดของ repository นี้ และไม่มีรหัสจริงจาก Coolify

1. GitHub → โปรไฟล์ **nateekarni** → **Packages**
2. เปิด package ของ Solar แต่ละตัว: api, web, worker, mqtt, certbot (ชื่ออาจแสดงพร้อม prefix solar-roof/)
3. **Package settings → Danger Zone → Change visibility → Public** อ่านและยืนยันตามหน้า GitHub
4. ทำให้ครบทั้งห้าตัว

การเปิด public ทำให้คนทั่วไปดาวน์โหลด image ได้ ถ้านโยบายบริษัทต้อง private ให้ใช้ registry ที่บริษัทเตรียมสิทธิ์ดาวน์โหลดให้ server ไว้แล้ว การเชื่อม GitHub repository อย่างเดียวไม่ได้ให้สิทธิ์ดึง private GHCR และไม่ควรใส่ token ลง Compose หรือ Dockerfile

## 3. ตรวจ DNS และช่องทางเข้า server

Cloudflare → nateekarn.dev → **DNS → Records** ตรวจ:

| Type | Name | Content | Proxy status |
|---|---|---|---|
| A | solar | Public IPv4 ของ server live | DNS only / เมฆเทา |
| A | mqtt-solar | Public IPv4 ของ server live | DNS only / เมฆเทา |

สอง record นี้ผู้ใช้แจ้งว่าตั้งแล้ว ตรวจอีกครั้งว่า IP ตรงกับ live ถ้ามี AAAA ต้องชี้ IPv6 ที่ใช้งานได้จริง

ผู้ดูแล server ต้องอนุญาต inbound TCP **80, 443, 8883** ผ่าน firewall ของบริษัท/ผู้ให้บริการ โดย 8883 ต้องไม่ถูกแอปอื่นใช้ เมนู Coolify ไม่สามารถเปลี่ยน firewall ภายนอกแทนได้ หากพอร์ตปิดให้ผู้ดูแลเปิดจากระบบที่บริษัทใช้อยู่ ไม่ต้องเพิ่ม server ใหม่

## 4. สร้าง Cloudflare token สำหรับ certificate MQTT

1. Cloudflare → รูปโปรไฟล์ → **My Profile → API Tokens → Create Token**
2. เลือก template **Edit zone DNS** หรือ Custom token
3. Permissions: **Zone → DNS → Edit**
4. Zone Resources: **Include → Specific zone → nateekarn.dev** เท่านั้น
5. Continue to summary → Create Token
6. เก็บ token ใน password manager เพื่อใส่ Coolify ขั้น7 ไม่ส่งในแชตหรือ GitHub

บริการ certificate ใช้ token นี้สร้าง DNS challenge และขอ/ต่ออายุใบรับรองสาธารณะจาก Let's Encrypt สำหรับ mqtt-solar.nateekarn.dev โดยการ deploy เป็นการใช้บริการและยอมรับ [เงื่อนไข Let's Encrypt](https://letsencrypt.org/repository/) ตามที่ certbot ต้องใช้ ใส่อีเมลติดต่อจริงใน ACME_EMAIL ส่วน certificate HTTPS เว็บ Coolify ดูแลแยกให้

## 5. เพิ่ม Application ใน Coolify

1. เปิด project ตามลิงก์ต้นเอกสาร
2. เลือก/สร้าง Environment ชื่อ **staging** ภายใน project นี้ (ชื่อ production ที่เห็นในภาพเดิมเป็นชื่อ environment ของ Coolify)
3. กด **+ New / New Resource**
4. ในหมวด **Git Based** กด **Public Repository**
5. ใส่ `https://github.com/nateekarni/solar-roof` → **Check Repository**
6. เลือก branch **main** และ server **live** หากมีหน้าถาม Destination ให้เลือก Docker destination ของ live ที่บริษัทใช้อยู่
7. ตั้งชื่อ application เช่น **solar-staging**
8. ใน **Configuration → General** ตั้ง:

| ช่อง | ค่า |
|---|---|
| Build Pack | Docker Compose |
| Base Directory | / |
| Docker Compose Location | /infra/docker/docker-compose.staging.yml |
| Branch | main |

9. กด **Save** และโหลด Compose ตามปุ่มที่แสดง ตรวจว่ามี postgres, redis, certbot, mqtt, storage, storage-init, migrate, bootstrap, api, worker, web
10. ปิด **Auto Deploy** จาก Git push และ **Preview Deployments** เพื่อให้ CI เป็นผู้สั่งหลังตรวจผ่าน

ใช้ Git-based Application ตามนี้ เพราะระบบ CI เรียก API สำหรับ Application และดึง Compose จาก main โดยตรง

## 6. ตั้ง Domain ของเว็บ

1. ในการตั้งค่า service **web** หา **Domains**
2. ใส่ `https://solar.nateekarn.dev:3000` แล้ว Save
3. 3000 คือพอร์ตภายใน container เวลาเข้าเว็บใช้ `https://solar.nateekarn.dev` ตามปกติ
4. service อื่นไม่ต้องใส่ HTTP domain; MQTT ใช้ mapping 8883 ใน Compose อยู่แล้ว
5. Proxy ของ server live ถ้าสถานะ Running ให้ใช้งานต่อได้ ไม่ต้องแก้ Proxy configuration หรือ restart proxy รวมของบริษัท

## 7. ใส่ Environment Variables

เปิด application → **Environment Variables** ใช้รายการด้านล่าง หรือดู [ไฟล์ตัวอย่าง](../../infra/docker/.env.staging.example) ใส่ค่าจริงใน Coolify แล้ว Save ทั้งหมด เปิดให้เป็น runtime variables หากมีตัวเลือก ไม่ใช้ Build Time secrets และไม่ตั้ง PUBLIC/NEXT_PUBLIC ให้รหัสเหล่านี้

สร้างรหัสด้วย password manager แนะนำอักษรอังกฤษและตัวเลขสุ่ม 32 ตัวแต่ละค่า เพื่อคัดลอกง่ายและไม่ติดปัญหา URL/Compose interpolation แต่ละระบบใช้รหัสคนละค่า

| ตัวแปร | ใส่อะไร |
|---|---|
| API_IMAGE | บรรทัด API_IMAGE จาก GitHub Summary |
| WEB_IMAGE | บรรทัด WEB_IMAGE จาก run เดียวกัน |
| WORKER_IMAGE | บรรทัด WORKER_IMAGE จาก run เดียวกัน |
| MQTT_IMAGE | บรรทัด MQTT_IMAGE จาก run เดียวกัน |
| CERTBOT_IMAGE | บรรทัด CERTBOT_IMAGE จาก run เดียวกัน |
| POSTGRES_DB | solar_platform |
| POSTGRES_USER | solar |
| POSTGRES_PASSWORD | รหัสฐานข้อมูลที่สุ่มใหม่ |
| DATABASE_URL | postgresql://solar:รหัสเดียวกับPOSTGRES_PASSWORD@postgres:5432/solar_platform |
| JWT_ACCESS_SECRET | รหัสสุ่มอย่างน้อย32ตัว |
| JWT_REFRESH_SECRET | รหัสสุ่มอย่างน้อย32ตัว อีกค่า |
| MQTT_PASSWORD | รหัสสุ่มบัญชี backend อย่างน้อย16ตัว แนะนำ32ตัว |
| MQTT_GATEWAY_CREDENTIALS | JSON ตามตัวอย่างข้างล่าง ใช้รหัสอีกค่า |
| CLOUDFLARE_API_TOKEN | token จากขั้น4 |
| ACME_EMAIL | อีเมลจริงสำหรับแจ้งเรื่อง certificate |
| BOOTSTRAP_ADMIN_EMAIL | อีเมลสำหรับ login ผู้ดูแลระบบคนแรก |
| BOOTSTRAP_ADMIN_PASSWORD | รหัสผู้ดูแลอย่างน้อย16ตัว แนะนำ32ตัว |
| MINIO_ROOT_USER | solar |
| MINIO_ROOT_PASSWORD | รหัส storage อย่างน้อย16ตัว แนะนำ32ตัว |
| STORAGE_REGION | us-east-1 |
| STORAGE_BUCKET | solar-platform |

ช่อง Value ของ MQTT_GATEWAY_CREDENTIALS ใส่ JSON บรรทัดเดียว ไม่ต้องใส่เครื่องหมาย quote ครอบทั้งหมด:

```json
{"pilot-01":"เปลี่ยนเป็นรหัสสุ่มภาษาอังกฤษและตัวเลข32ตัว"}
```

ชื่อ `pilot-01` เป็นทั้งชื่อบัญชี MQTT และชื่อ Gateway ที่จะสร้างในเว็บ ต้องตรงกันทุกตัว ใช้ได้เฉพาะ A-Z, a-z, 0-9, `_`, `-` และเริ่มด้วยตัวอักษรหรือตัวเลข ห้ามใช้ solar-backend เมื่อเพิ่ม Gateway ภายหลังให้เพิ่มคู่ชื่อ/รหัสใน JSON เดิม อย่าลบรายการของ Gateway ที่ยังใช้งาน

ถ้ารหัสฐานข้อมูลมีเครื่องหมายพิเศษ ต้อง URL-encode เฉพาะส่วนรหัสใน DATABASE_URL; ถ้าใช้ alphanumeric สุ่มตามที่แนะนำ คัดลอกตรงได้

ไม่ต้องสร้างไฟล์ password, certificate หรือโฟลเดอร์บน server ระบบสร้างให้ใน container/named volumes บัญชี admin ที่มีอยู่แล้วจะไม่ถูกเปลี่ยนรหัสเมื่อ deploy ซ้ำ

## 8. Deploy ครั้งแรก

1. ตรวจว่า image ทั้งห้าจาก CI main ล่าสุดตรงกันและไม่มี deployment อื่นกำลังทำงาน
2. กด **Deploy** ใน Coolify
3. เปิด **Deployments → deployment ล่าสุด → Logs**
4. ระบบดึง image, เริ่มฐานข้อมูล/storage และ certbot, migrate ฐาน, สร้าง admin แล้วเปิด API/worker/web
5. การออก certificate ครั้งแรกอาจใช้หลายนาที ดู service **certbot → Logs** ต้องมี `Certificate is ready; next check in 12 hours.`
6. **migrate / storage-init / bootstrap** ทำงานครั้งเดียวแล้วหยุดด้วย exit code0 เป็นปกติ ไม่ต้องกด restart ให้ทำงานตลอด
7. postgres, redis, storage, certbot, mqtt, api, worker, web ต้อง Running/Healthy
8. เปิด https://solar.nateekarn.dev/login แล้ว login ด้วย BOOTSTRAP_ADMIN_EMAIL/PASSWORD

ใช้ named volumes เก็บ DB, Redis, storage, MQTT และ certificate ต่อเนื่อง อย่าลบ resource หรือ volumes เพื่อแก้ปัญหา ไม่ใช้ seed/reset กับ staging ที่รับข้อมูลจริง

## 9. ถ้า Deploy ไม่ผ่าน ดูตรงไหน

| อาการ | ตรวจ/แก้จากหน้าเว็บ |
|---|---|
| pull access denied / unauthorized | ตรวจ package visibility ทั้ง5ตัวและ image digest ใน Coolify |
| required variable / interpolation error | เติมตัวแปรในขั้น7และ Save |
| certbot unhealthy | ตรวจ token zone DNS Edit, zone nateekarn.dev, อีเมลจริง, outbound DNS/HTTPS และ Logs; แก้แล้ว redeploy ระบบเก็บ certificate เดิมไว้ |
| mqtt unhealthy | ดู mqtt Logs, รูปแบบ JSON, รหัสอย่างน้อย16ตัว และ certbot healthy |
| migrate/bootstrap exit nonzero | อ่าน Logs ของ service นั้น ตรวจ DATABASE_URL/password และ admin env; ห้ามล้าง volume |
| เว็บ502/503 | ตรวจ api healthy, one-shot exit0 และ Domains ของ web ระบุ :3000 |
| เว็บใช้ได้แต่ Gateway ต่อไม่ได้ | ตรวจ mqtt-solar DNS only และ firewall8883; ไม่ใส่ https:// ใน MQTT hostname |

หากต้องส่งภาพให้ช่วยตรวจ ให้ปิดบังรหัส/token และค่า Environment ก่อน

## 10. ให้ main Deploy อัตโนมัติหลังตั้งครั้งแรก

1. ใน Coolify จด **Application UUID** ของ solar-staging จากหน้าทรัพยากร/URL ไม่ใช่ Project UUID lskcgscsooocwo8o8kwgsgsw
2. Coolify **Keys & Tokens** → สร้าง API token ที่อ่าน/แก้ application env และ deploy ได้ จำกัด team/resource ตามสิทธิ์ที่ระบบรองรับ
3. GitHub repository → **Settings → Environments → New environment → staging** จำกัด deployment branch เป็น main
4. Environment variables ของ staging: COOLIFY_URL=`https://coolify.fowir.com`, COOLIFY_APPLICATION_UUID=UUID ข้อ1, STAGING_WEB_URL=`https://solar.nateekarn.dev`
5. Environment secret ของ staging: COOLIFY_API_TOKEN=token ข้อ2
6. กลับ **Settings → Secrets and variables → Actions → Variables** เปลี่ยน repository variable STAGING_DEPLOY_ENABLED เป็น `true`
7. Actions → CI and staging → Run workflow → main แล้วรอ verify และ deploy-staging สีเขียว
8. หลังจากนี้แตก branch แก้ → เปิด PR → checks ผ่าน → merge main ระบบจะทดสอบและ deploy ด้วย image ที่ผ่านชุดตรวจเดียวกัน

ตั้ง branch protection/ruleset ให้ main ผ่าน PR และ verify ตามความสามารถบัญชี ไม่กด Deploy เองระหว่าง CI กำลัง deploy ถ้า CI timeout ให้ดู Coolify ก่อนรันซ้ำ เพราะ deployment ฝั่ง Coolify อาจยังทำงาน

## 11. เตรียมส่งให้ผู้จัดการ Gateway

1. Login admin สร้างข้อมูลโรงเรียน/site/Gateway/มิเตอร์จริง ใช้ Gateway name `pilot-01` ตามบัญชี MQTT และ endpoint `energy/pilot-01/#`
2. ลงทะเบียน serial มิเตอร์ให้ถูกต้อง
3. ทดสอบ MQTT จริงหนึ่งข้อความ → ได้ ACK หลังบันทึก → เห็นข้อมูลบนเว็บ รวมการส่งซ้ำและ reconnect ด้วยบัญชีทดสอบเฉพาะ
4. เติม [connection sheet](../gateway-handoff/gateway-connection-draft-th.md) ด้วยข้อมูลที่ตรวจแล้วก่อนระบุว่าพร้อมเชื่อมต่อ
5. ส่งให้ผู้จัดการ: host mqtt-solar.nateekarn.dev, port8883, TLSตรวจCA/hostname, username pilot-01, topics และ payload ส่วนรหัสส่งช่องทางแยก

เว็บ login และ MQTT login เป็นคนละบัญชี ระบบรอรับ MQTT จาก Gateway ตามเดิม ไม่มี HTTP POST telemetry ในรอบนี้ ดู [release checklist](../gateway-handoff/internal-release-checklist.md)

## 12. การเก็บข้อมูลจริงและสำรอง

Persistent volume ช่วยให้ redeploy ไม่ล้างข้อมูล แต่ไม่ใช่ backup ก่อนรับข้อมูลจริงต่อเนื่องให้ผู้ดูแลบริษัทจัด backup PostgreSQL/TimescaleDB และไฟล์ storage ไปนอก server พร้อมทดลอง restore ไปฐานแยก ระบบนี้ใช้ PostgreSQL ใน Compose จึงอย่าสมมติว่ามีเมนู Scheduled Backups แบบ database resource แยกให้โดยอัตโนมัติ

หากบริษัทมีระบบสำรอง VM/volumes ให้ตกลงความถี่ ระยะเก็บ และทดสอบกู้คืนกับผู้ดูแลก่อนรับข้อมูลจริงต่อเนื่อง; คู่มือนี้ไม่ได้ตั้งงาน backup ของบริษัทให้แล้ว การย้อน image ต้องตรวจ migration compatibility และห้ามล้างข้อมูลจริง ส่วน E2E ใช้ฐาน/broker ทิ้งได้บน GitHub เสมอ

## อ้างอิง

- [Coolify Git-based Docker Compose](https://coolify.io/docs/applications/builds/docker-compose)
- [Coolify Domains](https://coolify.io/docs/core/networking/domains)
- [Cloudflare DNS plugin ของ Certbot](https://certbot-dns-cloudflare.readthedocs.io/en/stable/)
- [CI contract](../../.github/CI.md)
