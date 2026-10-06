# คู่มือ Deploy Solar Roof บน Coolify — solar.fowir.com

ปรับปรุง 6 ตุลาคม 2026 จากโค้ดใน workspace และเอกสารผู้ผลิต คู่มือนี้เป็นขั้นตอนดำเนินการ ไม่ใช่หลักฐานว่า deploy, DNS หรือ TLS สำเร็จแล้ว

## เริ่มทำตามทีละหน้า สำหรับ pilot 2 vCPU / RAM 4 GiB

ทำตามลำดับนี้ ใช้ส่วนรายละเอียดเลข1–14ด้านล่างเมื่อกรอกค่าในแต่ละหน้า:

1. **GitHub:** เปิด branch `codex/local-main` ตรวจ commit ของคู่มือ/Compose pilot แล้วนำ commit นี้เข้า `main` ผ่านกระบวนการ review ของทีม การ push branch ยังไม่ทำให้ CI เผยแพร่ image ของ main โดยอัตโนมัติ และไม่รวมงาน local อื่นที่ยังไม่ commit
2. **GitHub → Settings → Secrets and variables → Actions → Variables:** ตั้ง `STAGING_DEPLOY_ENABLED=false` ป้องกัน deploy อัตโนมัติระหว่างเตรียมครั้งแรก
3. **GitHub → Actions → CI and staging:** รัน main ล่าสุด รอ verify ผ่าน แล้วคัดลอก image digestทั้ง6จาก Summary ห้ามข้าม CI ที่แดง
4. **ผู้ดูแลเครื่อง:** ตรวจว่า liveยังเป็น2vCPU/4GiB, proxyทำงาน, พื้นที่ว่างพอ และแอปอื่นไม่กินRAMจนไม่มีพื้นที่ เปิด80/443/8883ที่firewallและNAT
5. **Cloudflare → fowir.com → DNS → Records:** ตั้ง A solar และ A mqtt-solar ชี้publicIPv4ของlive, DNS onlyทั้งคู่ตามตารางขั้น4 อย่าเปลี่ยนnameserverหรือrecordของแอปอื่น
6. **Cloudflare → My Profile → API Tokens:** เตรียมZone DNS Edit tokenเฉพาะfowir.comสำหรับcertbot เก็บไว้ในpasswordmanager
7. **Coolify → Project → Environment staging → New Resource → Git Based:** เลือกrepoและmain, serverlive, Build Pack Docker Compose, Base Directory `/`, Compose Location `/infra/docker/docker-compose.staging.yml` แล้วSave/Load Compose
8. **Coolify → General/service web → Domains:** ใส่ `https://solar.fowir.com:3000` แล้วSave; serviceอื่นเว้นDomainsว่าง
9. **Coolify → Environment Variables:** เปิดไฟล์ `infra/docker/.env.staging.example` ที่commitใหม่ ใช้เป็นรายการกรอก ใส่6digestsจริง, DB/Storage/JWT/MQTT secretsใหม่, Cloudflare token, ACMEemail, bootstrapAdminตามขั้น9 ค่าresourceท้ายไฟล์ใช้ตามpilotได้เลย หรือเว้นไว้ให้Composeใช้default อย่านำไฟล์ `.env` localขึ้นserver
10. **Coolify → Environment Variables:** ยืนยัน `INGEST_CONCURRENCY=2`, `API_READ_POOL_MAX=4`, `INGEST_DB_POOL_MAX=2`, `API_EDGE_ENABLED=false`, `TRUSTED_PROXY_CIDRS`ว่าง และfeatureflagsเริ่มfalse จากนั้นSaveทั้งหมด
11. **Coolify → Deploy:** ตรวจlog/healthตามขั้น10; one-shotต้องExited(0) ส่วนlong-runningต้องhealthy APIมีdependencyMQTT จึงต้องให้certbotออกcertificateได้ก่อน
12. **Browser:** เปิด `https://solar.fowir.com` และloginด้วยbootstrapAdminที่กรอก บัญชีlocalไม่ย้ายตาม และStitchยังเป็นprototype
13. **Admin UI:** สร้างโรงเรียน/site/Gateway/มิเตอร์ตามเครื่องจริง ใช้GatewaynameตรงMQTTusername ตรวจserial/topic/payloadตามconnectiondraft ไม่เอาชื่อสมมติไปแทนserialจริง
14. **Gateway:** ตั้งmqtt-solar.fowir.com:8883,TLS,username/passwordของเครื่องตามขั้น11 ส่งข้อความแล้วดูACKและDashboard ซ้อมdisconnect/replay/duplicate
15. **Coolify → Metrics/Logs หรือserverterminal:** ตรวจlimitsมีผล, RAM/CPU, ไม่มีOOM/restartloop, queueลดลง และfreshnessจริง ซ้อม30–60นาทีก่อนสาธิต
16. **ก่อนสาธิต:** เตรียมOwner/SchoolUserจริงตามworkflowเชิญและschoolscope, backupข้อมูลที่ต้องเก็บ, เปิดหน้าเว็บมือถือ/desktopตรวจการแสดงผล ไม่เปิดauto-deployระหว่างโชว์ลูกค้า

ไฟล์Composeที่commitรอบนี้ใส่resource pilotเป็นdefaultและoverrideผ่านenvironmentได้แล้ว ไม่ต้องพิมพ์resourceทั้งหมดในช่องUIอีกครั้ง ข้อมูล16GiBด้านล่างมีไว้สำหรับอนาคตเท่านั้น

## 1. แบบติดตั้งที่ใช้

ใช้ Git-based Docker Compose Application และ image ที่ GitHub Actions สร้าง/ทดสอบแล้ว โดยตั้ง Compose Location เป็น `/infra/docker/docker-compose.staging.yml` แม้ชื่อไฟล์เป็น staging แต่เป็นชุดที่มี migration, bootstrap, managed MQTT TLS และ persistent storage ครบที่สุดใน repo ปัจจุบัน ชื่อ Environment ใน Coolify ไม่เปลี่ยนพฤติกรรมของไฟล์

ไม่เลือก `docker-compose.prod.yml` เดิมสำหรับ rollout นี้: ใช้ image latest บางส่วน เปิด API/Worker host ports ไม่มี migration/bootstrap/TLS MQTT ชุดเดียวกัน และค่าปลายทางเว็บเดิมอิง localhost

เส้นทาง:
- Browser → https://solar.fowir.com → Coolify Proxy → web:3000
- Web → private API http://api:3001; browser เรียก /v1 บน origin เดียวกัน
- API/Worker → PostgreSQL, Redis, MinIO บน network ภายใน
- Gateway → mqtt-solar.fowir.com:8883 TLS → Mosquitto → API → PostgreSQL
- Certbot จัด MQTT certificate ผ่าน Cloudflare DNS-01; Coolify จัด HTTPS certificate ของเว็บ

API_EDGE_ENABLED=false และ TRUSTED_PROXY_CIDRS ว่างสำหรับเริ่มต้น ใช้ Next /v1 fallback ที่มีอยู่ อย่าเปิด direct API router จนตรวจ proxy socket/CIDR/network/priority จริงตามคู่มือเดิม

## 2. เครื่องและ resource

### ขนาดที่เลือกจริง: pilot บนเครื่องเดิม 2 vCPU / RAM 4 GiB

ผู้ใช้ยืนยันใช้เครื่องเดิมเพื่อสาธิตให้ลูกค้าดูการเชื่อมต่อเครื่องจริงและการรับ/ส่งข้อมูล เริ่มหนึ่ง Gateway, มิเตอร์ที่ต่อในการสาธิต และผู้ดูพร้อมกันประมาณ1–5คน ไม่ใช่โหลด100โรงเรียน/1000มิเตอร์ ใช้ GitHub Actions build image เท่านั้น Coolify ดึง imageมารัน ไม่ build/test/loadtestบนเครื่องlive

ใช้ persistent disk เดิม ตรวจพื้นที่ว่างก่อนdeploy แนะนำให้เหลือ20GBขึ้นไปสำหรับimages/logs/pilotdata เก็บpilotdataและเอกสารเดิมไว้ หากdiskไม่พอให้เพิ่มพื้นที่ ไม่ลบvolumeเพื่อให้deployผ่าน

| Service | cpus | mem_limit | mem_reservation |
|---|---:|---:|---:|
| postgres | 0.75 | 768m | 256m |
| api | 0.75 | 512m | 256m |
| web | 0.50 | 384m | 128m |
| worker | 0.25 | 256m | 64m |
| storage | 0.25 | 256m | 64m |
| mqtt | 0.25 | 128m | 32m |
| redis | 0.25 | 128m | 32m |
| certbot | 0.25 | 128m | 32m |
| migrate (one-shot) | 0.50 | 256m | ไม่ต้อง |
| bootstrap (one-shot) | 0.25 | 128m | ไม่ต้อง |
| storage-init (one-shot) | 0.25 | 128m | ไม่ต้อง |
| release-evidence (one-shot) | 0.25 | 128m | ไม่ต้อง |

Long-running hard ceilings รวม2.5GiB เผื่อ1.5GiBสำหรับOS/Coolify/proxy/cache; one-shotอาจใช้เพิ่มสูงสุด640MiBช่วงเริ่มระบบ ตัวเลขเป็นเพดานตั้งต้นไม่ใช่ผลวัด อาจต้องเพิ่มserviceใดserviceหนึ่งหลังดูpeak ถ้าเครื่องแชร์แอปบริษัทอื่น ต้องตรวจmemoryที่เหลือจริงก่อนใช้ชุดนี้ Soft reservationไม่ใช่การจองRAM CPUlimitsรวมเกิน2ได้แต่แบ่งเวลาเมื่อโหลดพร้อมกัน

ตัวอย่างpilotAPI: cpus "0.75", mem_limit 512m, mem_reservation 256m (แทนตัวอย่าง1536mด้านล่าง) จำกัดresourceในแต่ละserviceของComposeก่อนrelease ไม่ใช่ใส่เพดานเดียวให้ทุกcontainer

สำหรับpilotลดpool/concurrencyในCoolifyเป็น API_READ_POOL_MAX=4, INGEST_DB_POOL_MAX=2, INGEST_CONCURRENCY=2; คงqueue/payload/rate budgetsเดิมก่อนตรวจfirmwareจริง และติดตามACKlatency/queue ไม่แก้protocolเพียงเพราะลดresource

ปิดงานreport/historyrestore/archive/retention/monitoringwebhookและfinancialwritesตามค่าเริ่มต้น สาธิตDashboardและtelemetryจริงก่อน ฟีเจอร์เอกสารสามารถแสดงตามข้อมูล/สิทธิ์ที่มี แต่ไม่ต้องเปิดงานหนักเพื่อสาธิตการรับส่ง

ก่อนวันสาธิตตรวจTLS→MQTT→DB→Dashboard, disconnect/reconnectและduplicate และซ้อมอย่างน้อย30–60นาทีกับเครื่องจริง ดูdockerstats/restarts/queue หลังจบตรวจพื้นที่และbackupข้อมูลที่ต้องเก็บ การซ้อมสาธิตไม่แทนpilot24ชั่วโมงก่อนรับข้อมูลต่อเนื่องหรือcapacitytest

ตาราง16GiBต่อจากนี้เป็นข้อมูลสำหรับอนาคตเท่านั้น ไม่ต้องอัปเกรดเครื่องหรือใช้limitsชุดนั้นสำหรับpilotครั้งนี้

ข้อเสนอตั้งต้นสำหรับบริการบนเครื่องเดียว: Linux 64-bit, 4 vCPU, RAM 16 GiB, SSD/NVMe อย่างน้อย160GB, backup storage นอกเครื่อง และเวลาระบบ sync/NTP หากมีแอปบริษัทอื่นอยู่ด้วย ต้องเพิ่มตามทรัพยากรที่แอปเหล่านั้นใช้ ตัวเลขนี้ไม่ใช่ capacity guarantee

| ระดับ | CPU | RAM | SSD | ใช้สำหรับ |
|---|---:|---:|---:|---|
| เครื่องเดิม | 2 | 4 GiB | ตามที่มี | pilot หนึ่ง Gateway ต้องเฝ้าดู peak; ไม่ build image บนเครื่องนี้ |
| ขนาดประหยัด | 4 | 8 GiB | 100–160GB | pilot ที่มีพื้นที่ให้แอปและ Coolify จริง ต้องปรับ limits ตามผลวัด |
| แนะนำเริ่มใช้งาน | 4 | 16 GiB | 160GB+ | มีเผื่อ migration, backup และ peak ของบริการ |
| ขยาย | 8+ | 32 GiB+ | ตามข้อมูลจริง | รายงานหนัก/มิเตอร์เพิ่ม แยก DB/storage หลังวัดโหลด |

ข้อเสนอ hard limits สำหรับเครื่อง16GiB (CPU เป็นเพดานต่อ service ไม่ใช่การจอง core; รวม CPU limits สูงกว่า4ได้แต่แย่งกันเมื่อโหลดพร้อมกัน):

| Service | cpus | mem_limit | mem_reservation |
|---|---:|---:|---:|
| postgres | 2.0 | 4g | 2g |
| api | 1.5 | 1536m | 768m |
| web | 1.0 | 1g | 512m |
| worker | 1.0 | 1536m | 512m |
| storage | 1.0 | 1g | 512m |
| mqtt | 0.5 | 512m | 128m |
| redis | 0.5 | 512m | 128m |
| certbot | 0.25 | 256m | 64m |
| migrate (one-shot) | 1.0 | 512m | ไม่ต้อง |
| bootstrap (one-shot) | 0.5 | 256m | ไม่ต้อง |
| storage-init (one-shot) | 0.5 | 256m | ไม่ต้อง |
| release-evidence (one-shot) | 0.25 | 128m | ไม่ต้อง |

Long-running service ceilings รวม10.25GiB; one-shot ทั้งหมดประมาณ1.125GiB เผื่อ OS/Coolify/proxy และ page cache อีกประมาณ3–4GiB ห้ามนำตัวเลขชุดนี้ไปใส่เครื่อง4/8GiBทั้งหมด

สำหรับ Compose ให้เพิ่ม keys ใน service จริงของไฟล์ release ก่อน commit/review/CI ตัวอย่าง:
~~~yaml
services:
  api:
    # คง image, environment, volumes, depends_on และ healthcheck เดิม
    cpus: "1.5"
    mem_limit: 1536m
    mem_reservation: 768m
~~~
ตัวอย่างนี้เป็น fragmentสำหรับขยายresourceในอนาคต ห้ามแทนComposeทั้งไฟล์ Composeรอบนี้มีdefaultpilotตามตาราง4GiBแล้ว หากขยายให้overrideตัวแปรserviceเช่น API_CPU_LIMIT, API_MEMORY_LIMIT, API_MEMORY_RESERVATION UI Configuration → Resource Limits อาจไม่ได้ให้ per-service control เหมือนกันทุกเวอร์ชัน จึงตรวจ effective Docker limits หลัง redeploy อย่าถือว่าบันทึก UI แล้วจำกัดสำเร็จ

ตรวจจาก server terminal ที่บริษัทอนุญาต โดยใช้ container ID จริงจาก docker ps:
~~~bash
docker stats --no-stream
docker inspect --format '{{.HostConfig.Memory}} {{.HostConfig.MemoryReservation}} {{.HostConfig.NanoCpus}}' CONTAINER_ID
~~~
api ตามตัวอย่างต้องได้ memory1610612736bytes และ NanoCpus1500000000

limits ไม่เท่ากับ tuning PostgreSQL/Redis อย่าตั้ง Redis eviction หรือ PostgreSQL max_connections โดยเดา ระบบ Redis อาจมีงาน/คิวอยู่ วัด query, pool, queue และ memory ก่อนปรับ

## 3. เตรียม release ก่อนเปิด Coolify

1. เก็บชุดแก้ไขล่าสุดเข้า Git ตามกระบวนการทีมและ review ก่อน merge main งาน local ไม่ได้ไปอยู่ใน image โดยอัตโนมัติ
2. ตรวจ `.github/workflows/ci-staging.yml` ชื่อ workflow **CI and staging** ใช้ Node24.20.0 และ pnpm11.24.0
3. ตั้ง repository variable STAGING_DEPLOY_ENABLED=false สำหรับ deploy ครั้งแรกด้วยมือ
4. รัน workflow บน main ให้ verify/build/test ผ่าน รวมการสร้าง image ทั้ง6ตัว
5. คัดลอก API_IMAGE, WEB_IMAGE, WORKER_IMAGE, MQTT_IMAGE, CERTBOT_IMAGE, POSTGRES_IMAGE จาก Summary ของ run เดียวกัน เป็น ghcr.io/...@sha256:... จริง
6. ให้ server ดึง GHCR ได้ ใช้ package public เฉพาะเมื่อบริษัทอนุญาต หรือ registry authentication แบบ read-only ที่บริษัทจัดให้ ไม่เปิด package public โดยอัตโนมัติ
7. ไม่ใช้ latest และไม่ใช้ digest ต่าง revision ปะปนกัน
8. ผลตรวจรวมงาน6ตุลาคม2026: full workspace lint/test และproductionbuildผ่าน เมื่อรันนอกsandboxที่อ่านdependencyไม่ครบ ปัญหาtypeก่อนหน้านี้เป็นenvironmentของsandbox ไม่ใช่การรับรองimageบนserver ต้องให้CIของreleaseจริงผ่านและใช้digestที่CIทดสอบก่อนdeploy
9. ภาพ School User ที่ออกแบบผ่าน Stitch เป็น prototype ยังไม่ใช่ UI ที่เชื่อมระบบจริงใน release

## 4. จัดการ DNS ของ fowir.com

ทำที่ผู้ให้บริการ authoritative DNS จริงของ fowir.com คู่มือเดิมระบุ Cloudflare หาก zone อยู่ Cloudflare แล้วไม่ต้องเปลี่ยน nameserver หรือเพิ่ม zone ใหม่ และไม่แก้ MX/TXT/root records ของบริการอื่น

Cloudflare → fowir.com → DNS → Records → Add record:

| Type | Name | Content | Proxy | TTL |
|---|---|---|---|---|
| A | solar | Public IPv4 ของ server live | DNS only เริ่มต้น | Auto หรือ300วินาที |
| A | mqtt-solar | Public IPv4 ของ server live | DNS only | Auto หรือ300วินาที |

SERVER_PUBLIC_IP ต้องเป็น public IPv4 ที่ route มาถึงเครื่อง deploy ไม่ใช้ IP Docker/private หากมี NAT ต้อง forward80/443/8883มายังเครื่องนี้ ตรวจ/แก้ A/CNAME เดิมชื่อเดียวกัน; AAAA ใส่เฉพาะเมื่อ IPv6 ใช้งานจริงได้ ถ้า IPv6เก่าผิดให้แก้ recordนั้น

ตรวจจาก PowerShell:
~~~powershell
Resolve-DnsName solar.fowir.com -Type A -Server 1.1.1.1
Resolve-DnsName mqtt-solar.fowir.com -Type A -Server 1.1.1.1
Test-NetConnection solar.fowir.com -Port 443
Test-NetConnection mqtt-solar.fowir.com -Port 8883
~~~
DNSตรวจได้ก่อน deploy แต่ TCP/TLSจะผ่านหลังบริการเริ่มแล้ว เปลี่ยน DNS ไม่เท่ากับเปิดเว็บไซต์สำเร็จ TTL/cache อาจยังมีค่าเก่า

Coolify เช็ก A record เทียบ server IPv4 แต่ต้องตรวจ AAAA/firewall/proxy ด้วย ตาม [DNS docs](https://coolify.io/docs/core/networking/dns)

## 5. Firewall และ network

อนุญาต inbound TCP80/443สำหรับ Coolify web proxy และ TCP8883สำหรับ Gateway MQTT TLS ตรวจ cloud firewall, firewallบริษัท และ NAT ไม่ใช่แค่ Linux firewall
SSH22จำกัดตามผู้ดูแล/Coolify management host ตามการตั้งบริษัท; dashboard Coolify เดิมใช้โดเมนบริษัทและสิทธิ์เดิม
ไม่ publish PostgreSQL5432, Redis6379, MQTT1883, API3001, Worker3002, MinIO9000/9001ออกอินเทอร์เน็ต Compose ชุดนี้เผยแพร่เฉพาะ MQTT8883; web expose3000เพื่อให้ proxyเชื่อมใน Docker
ไม่ต้องสร้าง api.solar.fowir.com/storage domain ใน rollout นี้ ไม่ต้องเปิด9001เพื่อใช้งานเอกสาร

## 6. เตรียม MQTT certificate

1. Cloudflare → My Profile → API Tokens → Create Token
2. สร้าง token จำกัด **Zone → DNS → Edit** เฉพาะ zone fowir.com ใช้ความสามารถ read เพิ่มเฉพาะที่ plugin/token setupจริงต้องการ
3. เก็บ token ใน password manager/Coolify environment ไม่ลง Git
4. ACME_EMAIL ใช้อีเมลติดต่อจริง; MQTT_TLS_DOMAIN ใน Compose เป็น mqtt-solar.fowir.comแล้ว
5. certbot ต้องออกอินเทอร์เน็ต HTTPS/DNSได้ เริ่มบริการแล้วดู logs/healthจนใบรับรองพร้อม
6. MQTTอ่าน certจาก mqtt-certs volume และต่ออายุโดยบริการ certbot
7. MQTT record คง DNS only; orange-cloud HTTP proxyทั่วไปไม่ใช้แทน MQTT TCP8883

## 7. สร้าง Application ใน Coolify

อิงข้อมูลเป้าหมายเดิมใน repo: Coolify https://coolify.fowir.com, server live, project https://coolify.fowir.com/project/lskcgscsooocwo8o8kwgsgsw ต้องตรวจใน accountจริงว่ายังตรง

1. เปิด project → Environment staging สำหรับ pilot ก่อน
2. + New Resource → Git Based → Public Repository หรือเชื่อม GitHub Appสำหรับ private repo
3. Repository https://github.com/nateekarni/solar-roof → Check Repository
4. Branch main, Server live, Docker Destinationของlive
5. Application name solar-staging (หรือชื่อ rollout ที่ทีมเลือก)
6. General: Build Pack Docker Compose; Base Directory /; Compose Location /infra/docker/docker-compose.staging.yml
7. Save/Load Compose ตรวจ servicesครบ: postgres redis certbot mqtt storage storage-init migrate bootstrap release-evidence api worker web
8. ปิด Auto Deploy/Preview Deployments สำหรับครั้งแรก
9. ตรวจ persistent volumes ไม่ลบ/เปลี่ยนresource UUIDเมื่อมีข้อมูลจริง เพราะ resource/project nameมีผลต่อvolumeที่ใช้
10. ตั้ง resource keys ตามขั้น2ใน releaseที่reviewแล้ว

ชื่อเมนูอาจต่างเล็กน้อยตาม Coolify version ใช้ Git-based Application ไม่ใช่สร้าง serviceจาก Composeแปะข้อความอย่างเดียว หากจะใช้ workflow deploy-staging ที่ repoมี

## 8. ตั้ง Domain ใน Coolify

Configuration → service web → Domains:
~~~text
https://solar.fowir.com:3000
~~~
Save พอร์ต3000หมายถึงพอร์ต containerที่ proxyส่งไป ผู้ใช้เปิด https://solar.fowir.com โดยไม่ใส่3000 Coolifyรองรับ domain per-serviceและจัดTLSให้เมื่อใช้https ตาม [Domains docs](https://coolify.io/docs/core/networking/domains)

serviceอื่นปล่อย Domainsว่าง ไม่กำหนดโดเมน HTTPให้mqtt อย่าใช้ http://localhost:3001เป็นปลายทางbrowser

ค่าที่ Composeกำหนดแล้ว: WEB_URL=https://solar.fowir.com และ API_INTERNAL_URL=http://api:3001 Nextส่ง /v1ผ่านoriginเดียวกัน จึงไม่ต้องตั้ง NEXT_PUBLIC_API_URLไป public APIแยกสำหรับชุดนี้

เริ่มsolar record DNS onlyเพื่อให้ตรวจorigin certificateโดยตรง หลังHTTPSผ่าน จะใช้ Cloudflare Proxiedได้โดยตั้ง SSL/TLS **Full (strict)** และตรวจproxy trust/rate limitใหม่ หลีกเลี่ยงFlexible เก็บ mqtt-solar DNS onlyเสมอ ไม่ตั้งCache Everythingกับหน้าlogin,/v1หรือเอกสารส่วนตัว ตาม [Cloudflare proxy](https://developers.cloudflare.com/dns/proxy-status/) และ [Full strict](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)

## 9. Environment Variables

ใช้ `infra/docker/.env.staging.example` เป็นรายการเต็ม ใส่ใน Coolify runtime variables รหัสจริงเก็บpasswordmanagerและช่องsecret ถ้ามี ไม่ลงbuildargs/NEXT_PUBLIC/Git

| Variable | ค่า |
|---|---|
| API_IMAGE / WEB_IMAGE / WORKER_IMAGE / MQTT_IMAGE / CERTBOT_IMAGE / POSTGRES_IMAGE | immutable digestทั้ง6จาก CI runเดียว |
| POSTGRES_DB | solar_platform |
| POSTGRES_USER | solar |
| POSTGRES_PASSWORD | สุ่มใหม่32ตัวแยกจากรหัสอื่น |
| DATABASE_URL | postgresql://solar:DB_PASSWORD@postgres:5432/solar_platform |
| JWT_ACCESS_SECRET | สุ่ม32ตัวขึ้นไป |
| JWT_REFRESH_SECRET | อีกค่าที่สุ่ม32ตัวขึ้นไป |
| MINIO_ROOT_USER | solar |
| MINIO_ROOT_PASSWORD | สุ่มใหม่32ตัว |
| STORAGE_REGION | us-east-1 |
| STORAGE_BUCKET | solar-platform |
| MQTT_PASSWORD | รหัส backendอย่างน้อย16ตัวแนะนำ32 |
| MQTT_GATEWAY_CREDENTIALS | JSONชื่อGateway→รหัสของGatewayแต่ละเครื่อง |
| CLOUDFLARE_API_TOKEN | tokenจากขั้น6 |
| ACME_EMAIL | อีเมลจริง |
| BOOTSTRAP_ADMIN_EMAIL | อีเมลผู้ดูแลจริงที่ต้องการสร้าง |
| BOOTSTRAP_ADMIN_PASSWORD | สุ่มอย่างน้อย16ตัว |
| API_EDGE_ENABLED | false |
| TRUSTED_PROXY_CIDRS | ว่าง |
| PLATFORM_RELEASE_EVIDENCE_JSON | เริ่ม {} ได้สำหรับpilotที่ยังไม่มีหลักฐานรับรอง; ใช้JSONจริงก่อนเปิดfeatureที่มีgate |

รหัสDBที่มีอักขระreservedต้องpercent-encodeเฉพาะpasswordในDATABASE_URL รหัสalphanumericสุ่มช่วยลดข้อผิดพลาดในURL/Compose ห้ามใช้replace placeholderจริง
MQTT_GATEWAY_CREDENTIALS ตัวอย่างโครงสร้าง (แทนค่ารหัสก่อนใช้):
~~~json
{"pilot-01":"REPLACE_WITH_RANDOM_32_CHAR_SECRET"}
~~~
pilot-01ต้องตรง Gateway nameและusername ห้ามใช้solar-backendเป็นGateway และไม่ใช้รหัสเดียวกับ backend

เริ่มปิดfeature flagsตามenv.example: ENERGY_READ_MODEL_ENABLED, ENERGY_SUMMARY_WORKER_ENABLED, REPORT_WORKER_ENABLED, HISTORY_RESTORE_ENABLED, HISTORY_RESTORE_WORKER_ENABLED, TELEMETRY_ARCHIVE_ENABLED, TELEMETRY_ARCHIVE_SCHEDULER_ENABLED, RAW_RETENTION_ENABLED, PLATFORM_MONITORING_ENABLED

FINANCIAL_WRITES_ENABLEDไม่ใช่การเปิดได้ด้วยการใส่envอย่างเดียว ต้องมีหลักฐาน/ค่าตั้งfinancial readinessครบ และตรวจว่าตัวแปรถูกส่งถึงAPIจริง Composeปัจจุบันไม่ได้forwardชื่อนี้ในenvironment อย่าอ้างว่าตั้งในCoolifyแล้วเปิดอนุมัติ/ออกเอกสารสำเร็จ

BACKUP_ENABLEDเริ่มfalseเฉพาะตอนตั้งบริการ/ทดลอง; ต้องตั้งbackupนอกเครื่องและซ้อมrestoreก่อนรับข้อมูลจริงต่อเนื่องตามขั้น12

## 10. Deploy ครั้งแรก

1. Saveค่าทุกหน้าแล้ว Deploy
2. ดู logs postgres/redis/storage; ต้องhealthy
3. ดู certbot; certificateต้องพร้อม mqttจึงเริ่มhealthy
4. storage-initต้องexit0; migrateต้องexit0; bootstrapต้องexit0
5. release-evidenceต้องexit0 (JSONobjectไม่เกิน64KiB)
6. api healthcheckเรียก /ready ต้องhealthy; worker /health; web / ต้องhealthy
7. one-shot Exited(0)ถือว่าปกติ ไม่ต้องเปลี่ยนrestartเป็นalways
8. เปิด https://solar.fowir.com ตรวจcertificate hostname/วันหมดอายุ และ HTTPredirect
9. Loginด้วยBOOTSTRAP_ADMIN_EMAIL/PASSWORDที่ตั้งเอง
10. บัญชีtest@solar.localจากเครื่องlocalไม่ได้ถูกย้ายไปserverและไม่ควรใช้ในproduction
11. สร้างOwnerและSchool Userผ่านระบบเชิญของAdmin ผูกSchool Userกับโรงเรียนจริง ตรวจช่องทางactivationตามworkflowของระบบ
12. ห้ามรัน db:seed/db:seed:resetบนserverข้อมูลจริง seedเดิมมีTRUNCATEหลายตาราง; bootstrapที่ใช้เก็บAdminเดิมและไม่เปลี่ยนรหัสให้เมื่อบัญชีเข้ากันได้

HTTPSตรวจจากเครื่องผู้ดูแล:
~~~bash
curl -I https://solar.fowir.com
curl -I http://solar.fowir.com
~~~
/health,/readyของAPIเป็นprivate อย่าใช้public404ของ /readyสรุปว่าAPIล่ม ตรวจในcontainerหรือhealthstatus

## 11. ตรวจระบบหลัง Deploy

- Login/refresh/logoutครบ; cookieบนHTTPSไม่วนlogin
- Adminเข้าถึงทุกเมนู Ownerไม่เห็นGatewayและงานtechnical School Userเห็นเฉพาะโรงเรียนตนเอง
- ทดสอบ URL/APIโดยตรงด้วยOwner/Schoolและโรงเรียนอื่นว่าปฏิเสธ
- Dashboardเมื่อยังไม่มีGatewayต้องแสดงไม่มีข้อมูล ไม่ใช้ตัวเลขจากStitch
- ไฟล์สัญญา/ใบแจ้งหนี้/ใบเสร็จและแนบสลิปทดสอบตามfeatureที่เปิดจริง
- unsafeOriginต่างโดเมนต้อง403 การrefreshผ่านGETต้องไม่เปลี่ยนsession
- เก็บactualproxy/network configurationก่อนเปิดAPI_EDGE_ENABLED
- เปิดmobile390pxและdesktop1280pxตรวจnavigationและหน้าเอกสาร

Gatewayตั้ง host mqtt-solar.fowir.com,port8883,TLSตรวจCA/hostname,usernamepilot-01,passwordของGateway topics/payloadใช้ `docs/gateway-handoff/gateway-connection-draft-th.md` และ protocolจริงของrepo
ตรวจTLSจากเครื่องที่มีOpenSSL:
~~~bash
openssl s_client -connect mqtt-solar.fowir.com:8883 -servername mqtt-solar.fowir.com -verify_return_error
~~~
ตรวจmessageจริง→บันทึก→ACK→Dashboard, duplicate,reconnect/offline replay และpilot24ชั่วโมง ไม่ปิดTLS verificationเพื่อให้ต่อผ่าน

## 12. Backup พื้นที่และการเฝ้าดู

Volumeที่ต้องรักษา: postgres-data,minio-data,redis-data,mqtt-data,mqtt-certs,letsencrypt-data,solar-backup-status,solar-release-evidence

ฐานข้อมูลอยู่เครื่องเดียวกับMinIOไม่ถือว่าoffsitebackup ต้องมีdestinationอีกเครื่อง/บริการ เตรียมPGBACKREST_REPO1_S3_ENDPOINT,BUCKET,REGION,KEY,KEY_SECRET,CIPHER_PASS,PATHตามenv.example ทดสอบปลายทางแล้วจึงBACKUP_ENABLED=true ซ้อมrestoreบนenvironmentแยกและตรวจเอกสารจริงที่DBอ้างถึงด้วย

ใช้ `docs/runbooks/disaster-recovery.md`, `platform-rollout.md` และ `docs/performance/platform-capacity.md` เป็นเกณฑ์เพิ่มเติม เป้าหมายRPO15นาที/RTO4ชั่วโมงยังต้องพิสูจน์กับโฮสต์จริง

ติดตามทุกวันช่วงpilot: CPU/RAM/restarts/queue/payloadrejections/latesttelemetry/disk/backupage/WALlag/certificaterenewal
แนะนำเตือนdisk70%และเตรียมขยายก่อน80%; ไม่เปิดrawretentionลบข้อมูลเองโดยไม่มีหลักฐานarchive
ประเมินDBคร่าวๆ: rows/day=จำนวนมิเตอร์×86400/ช่วงส่งวินาที เช่น100มิเตอร์ทุก60วินาที=144000rows/day; ขนาดต่อrowรวมindexต้องวัดจริง ไม่รับรองว่า160GBพอสำหรับทุกระยะเก็บ
CPUต่อเนื่องเกิน70%,RAMเกิน80%,queueไม่ลด,หรือหน้าใช้งานเกิน2วินาทีให้หาคอขวดและปรับก่อนเพิ่มGateway ไม่รันloadtestหนักในDBจริง

## 13. Deploy อัตโนมัติและ rollback

หลังmanualpilotผ่าน:
1. จด Application UUIDจริง ไม่ใช้Project UUID
2. Coolify Keys & Tokensสร้างtokenที่CIจำเป็นต้องใช้
3. GitHub Environment staging: variables COOLIFY_URL=https://coolify.fowir.com, COOLIFY_APPLICATION_UUID=จริง, STAGING_WEB_URL=https://solar.fowir.com; secret COOLIFY_API_TOKEN
4. repositoryvariable STAGING_DEPLOY_ENABLED=true เมื่อพร้อม; จำกัดmain/approvalตามทีม
5. ให้CIเป็นผู้deploy ไม่ให้Git webhookกับCIสั่งซ้อนกัน

ก่อนupgrade backupและจดoldimage digests/revision/config/schema การเปลี่ยนappimageย้อนใช้ได้เมื่อschemaยังcompatibleเท่านั้น Composeมีmigrationอยู่ด้วย ต้องreviewmigrationก่อนredeployรุ่นเก่า ห้ามdowngradePostgreSQLหรือทำdownmigrationโดยเดา ไม่ลบvolumes
เครื่องมีข้อมูลGatewayต่อเนื่องต้องตรวจbuffer/replayและACKdurabilityระหว่างrestart

## 14. Troubleshooting

| อาการ | ตรวจ |
|---|---|
| NXDOMAIN | zone/record/name/authoritativeDNS |
| DNS mismatch | Aชี้IPlive,AAAAเก่าผิด,cache |
| TLSยังไม่ออก | DNS80/443,proxylogs,ACME/CAAและrate limits |
| Cloudflare525/526 | origincert/hostname/หมดอายุ/Fullstrict |
| redirectloop | Flexible/SSLredirect/proxychain |
| 502/503 | web3000,api /ready,one-shot,network |
| GHCRunauthorized | registrypermissions/จริงdigest/visibility |
| certbotunhealthy | tokenเฉพาะzone,ACMEemail,outboundDNSHTTPS |
| MQTTต่อไม่ได้ | DNSonly8883,certificate,credentialsJSON |
| migrate/bootstraperror | DBURL/password/schema/logs ห้ามล้างvolume |
| OOM/exit137 | effectivehardlimit/peakusage,logs |
| login403 | WEB_URL/actualOrigin/sameorigin /v1 |
| financial actiondisabled | readinessgate/configforwarding ไม่ใช่roleอย่างเดียว |

## การตรวจไฟล์ก่อน commit รอบ pilot

- Docker Compose config --quiet ผ่านกับไฟล์exampleที่ไม่มีsecretจริง
- ตรวจresolvedconfigแล้วCPU/memory/reservationครบ12servicesตรงตารางpilot
- deployment helper, release evidence และ recovery artifacts tests: 12ผ่าน0ล้มเหลว
- git diff --check ผ่านสำหรับไฟล์deploymentที่แก้
- ไม่ได้bootstackใหม่/ทดสอบlimitsภายใต้โหลดจริงบนเครื่องlive และไม่ได้เปลี่ยนDNSหรือdeployจริง
- Commitรอบนี้รวมเฉพาะCompose, envexample และคู่มือdeploy งานappอื่นในworkspaceไม่ได้รวม ต้องตรวจreleaseจริงก่อนCIเผยแพร่image

## แหล่งอ้างอิง

- [Coolify Git-based Docker Compose](https://coolify.io/docs/applications/builds/docker-compose)
- [Coolify Domains](https://coolify.io/docs/core/networking/domains)
- [Coolify DNS](https://coolify.io/docs/core/networking/dns)
- [Coolify Resource Limits](https://coolify.io/docs/applications/configuration/resource-limits)
- [Coolify self-hosted requirements](https://coolify.io/docs/start-with-self-hosted)
- [Docker Compose services/resource keys](https://docs.docker.com/reference/compose-file/services/)
- [Cloudflare proxy status](https://developers.cloudflare.com/dns/proxy-status/)
- [Cloudflare Full strict](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)
