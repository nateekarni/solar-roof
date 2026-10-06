# Deploy เฉพาะ MQTT — mqtt-solar.fowir.com บน Coolify

ปรับปรุง 6 ตุลาคม 2026 — ใช้ **resource แยกจากเว็บไซต์** มี certbot และ mqtt เท่านั้น ไม่สร้าง DB/MinIO/Redis/users เว็บ deploy แยกตาม [คู่มือ solar.fowir.com](coolify-web-first-deployment-th.md)

หากใช้ Broker ภายนอกที่ผู้ดูแล Gateway ให้ **ไม่ต้องทำคู่มือนี้** ตั้ง registered broker ใน Admin และเปิด MQTT_ENABLED=true / MQTT_DEFAULT_BROKER_ENABLED=false ใน web resource แทน

## 1. เตรียม release

1. GitHub Actions CI and staging → main รุ่นใหม่ → verify ผ่าน → คัดลอก MQTT_IMAGE และ CERTBOT_IMAGE digest จาก Summary ของ run เดียวกัน
2. ใช้เซิร์ฟเวอร์เดิมได้ pilot 2 vCPU / RAM 4 GiB; ค่า default mqtt/certbot อย่างละ CPU0.25, RAM128m, reservation32m
3. ถ้า GHCR private ให้ authenticate server ตาม [คู่มือ private repo](coolify-private-github-th.md)
4. ตรวจไม่มี broker อื่นจับ host port8883 ถ้ามี full-stack resource เดิมอย่า deploy broker อีกชุดชนกัน

## 2. DNS / Firewall

1. Cloudflare → zone fowir.com → DNS → A record ชื่อ mqtt-solar → public IPv4 ของ server (ผลตรวจล่าสุด 188.166.250.177) → **DNS only**
2. AAAA ใช้เฉพาะ IPv6 ที่เข้าถึงจริง DNS record solar ของเว็บไซต์ไม่ต้องเปลี่ยน
3. เปิด inbound TCP8883 ไป server; **ไม่เปิด1883ออกอินเทอร์เน็ต** MQTT บน8883เป็น TLS/TCP ไม่ใช่เว็บ HTTP ไม่กรอก https:// หน้า MQTT hostname
4. DNS-01 ใช้ Cloudflare API ไม่ต้องเปิดเว็บ HTTP ของ mqtt-solar เพื่อออก certificate

## 3. Cloudflare token สำหรับ certificate

1. My Profile → API Tokens → Create Token → template Edit zone DNS
2. Permissions: Zone / DNS / Edit และ Zone / Zone / Read
3. Zone Resources: Include / Specific zone / **fowir.com**; ไม่ให้ทุก zone
4. Create Token → เก็บ secret → ใส่ CLOUDFLARE_API_TOKEN ใน Coolify เฉพาะ resource broker
5. ACME_EMAIL เป็นอีเมลติดต่อจริง certificate service ขอและต่ออายุ Let's Encrypt ผ่าน DNS-01 อัตโนมัติ; การ deploy นี้ใช้บริการและยอมรับ [เงื่อนไข Let's Encrypt](https://letsencrypt.org/repository/)

certificate ของ mqtt-solar อยู่ใน named volumes letsencrypt-data/mqtt-certs ของ resource นี้ แยกจาก certificate เว็บไซต์ที่ Coolify Proxy ดูแล ไม่ต้องสร้าง Zone ใหม่ถ้ามี fowir.com อยู่แล้ว และ token ไม่ใช่ certificate ที่นำไปแจก Gateway

## 4. สร้าง MQTT Application แยก

1. Coolify → Project/Environment เดียวกับเว็บ → New Resource → Git repository → main
2. Build Pack Docker Compose, Base Directory /, Compose Location **/infra/docker/docker-compose.mqtt.yml** → Save / Load
3. ตั้งชื่อ resource เช่น solar-mqtt ไม่เปลี่ยนชื่อของ resource เว็บที่มีข้อมูลอยู่
4. Domains ของ mqtt/certbot **เว้นว่าง** broker publish8883:8883 ผ่าน Compose ไม่ส่ง MQTT เข้า HTTPS router ของ Coolify
5. Environment Variables ใช้ [infra/docker/.env.mqtt.example](../../infra/docker/.env.mqtt.example):

| ค่า | ความหมาย |
|---|---|
| MQTT_IMAGE / CERTBOT_IMAGE | digest ที่ผ่าน CI |
| MQTT_PASSWORD | รหัสบัญชี backend solar-backend อย่างน้อย16ตัว |
| MQTT_GATEWAY_CREDENTIALS | JSON username→password ของแต่ละ Gateway ใช้คนละรหัสกับ backend |
| CLOUDFLARE_API_TOKEN | tokenเฉพาะfowir.com |
| ACME_EMAIL | contactจริง |

ตัวอย่าง format (แทนรหัสตัวอย่างด้วยของจริง): MQTT_GATEWAY_CREDENTIALS={"GW-001":"รหัสของ_GW-001_อย่างน้อย16ตัว"} เป็นค่าที่เรากำหนดเมื่อใช้ broker ของเรา ไม่ใช่ค่าจาก database และไม่ต้องกรอกเมื่อใช้ broker ภายนอก

MQTT_TLS_DOMAIN=mqtt-solar.fowir.com กำหนดใน Compose ทั้งสอง services แล้ว ไม่ใช้ localhost

## 5. Deploy และตรวจ certificate/broker

1. Save variables → Deploy → certbot ต้องออก certificate domain mqtt-solar.fowir.com สำเร็จและ healthy; broker รอ certbot healthy ก่อนเริ่ม
2. mqtt healthy และ serverรับ8883; ถ้า certificate failure ดู certbot logs/token/zone/DNS/time อย่าปิดตรวจ TLS เพื่อให้ผ่าน
3. จากเครื่องผู้ดูแลตรวจ:

~~~sh
openssl s_client -connect mqtt-solar.fowir.com:8883 -servername mqtt-solar.fowir.com -verify_return_error </dev/null
~~~

ต้อง verify chain/hostname ถูก ไม่ใช้ self-signed certificate ของ CI บน production

4. Coolify Terminal ของ mqtt ตรวจ health:

~~~sh
python3 /usr/local/bin/mqtt-runtime.py --healthcheck
~~~

exit0 ตรวจ certificate และ TLS listener ที่กำลังเสิร์ฟ ไม่ใช่การยืนยันว่า telemetry ลง DB แล้ว

## 6. เชื่อม API ของเว็บเข้ากับ Broker แยก

เนื่องจากเป็นสอง Compose resources hostname mqtt ภายในเว็บใช้ไม่ได้ ให้ต่อผ่าน endpoint TLS จริง (serverต้อง resolve และเข้าถึง endpointตัวเองได้; ถ้า NATไม่รองรับ hairpin ต้องแก้เครือข่ายให้ hostname/TLS ถูก)

ใน **resource เว็บไซต์** Coolify Environment Variables:

~~~dotenv
MQTT_ENABLED=true
MQTT_DEFAULT_BROKER_ENABLED=true
MQTT_URL=mqtts://mqtt-solar.fowir.com:8883
MQTT_USERNAME=solar-backend
MQTT_PASSWORD=รหัส_backend_เดียวกับ_resource_MQTT
~~~

Save → Redeploy เว็บ; ไม่ต้องสร้าง DB ใหม่ ไม่ต้องรัน seed user ใหม่ อีกทางเลือกคือเก็บ broker นี้ผ่าน Admin ใน registered brokers และใช้ MQTT_DEFAULT_BROKER_ENABLED=false เลือกใช้วิธีเดียวเพื่อไม่ subscribe ซ้ำ

/ready ของเว็บยังตรวจเว็บแยก /ready/mqtt ใน API containerต้องตอบ ready ตรวจทั้ง health broker และการรับ payload จริง เว็บยังใช้งานได้เมื่อ broker offline

## 7. Gateway และ Topic

Gateway: host mqtt-solar.fowir.com, port8883, TLSเปิดและตรวจ CA/hostname, username **GW-001** สำหรับ Gateway ID GW-001, password จาก MQTT_GATEWAY_CREDENTIALS ไม่แจก backend credential ให้ Gateway

Standard JSON topic ของ pilot:

~~~text
solar/v1/sites/SITE-001/gateways/GW-001/devices/SPM91-01/telemetry
solar/v1/sites/SITE-001/gateways/GW-001/dataAcept
~~~

บรรทัดแรก publish telemetry บรรทัดสอง subscribe ACK (สะกด dataAcept ตาม protocol ปัจจุบัน) ตั้ง site/Gateway/device external IDs ใน Admin ให้ตรง payload และเลือก Pilot SPM91 Preset; ตัวเลข1700Whจะ normalizeเป็น1.7kWh

ACL ผูก Gatewayด้วย authenticated username ตรง Gateway ID แยกจาก UUID ใน DB ส่วน legacy energy/<username>/telemetry และ response/config ยังคงรองรับ ACL ไม่อนุญาต Gateway publishข้อมูล/อ่าน ACK ของ Gatewayอื่น Usernameต้องไม่ซ้ำข้าม sites จัด unique Gateway IDs เมื่อใช้ broker นี้

ติดตั้งแล้วทดสอบ subscribe/publishด้วย credentialเฉพาะเครื่อง, หน่วย/quality/timestamps, ACK/duplicate และ freshness หน้าเว็บ ไม่ส่ง payloadทดสอบเข้าเครื่องจริงโดยไม่ประสานผู้ดูแล

## 8. อัปเดต/บำรุงรักษา

- เปลี่ยน MQTT_IMAGE/CERTBOT_IMAGE digest ใน resourceเดิมแล้ว Deploy เก็บ volumesเดิม brokerจะ reloadcertificateหลังต่ออายุ
- เพิ่ม/หมุนGatewaypassword: ปรับJSON credentialsโดยคงรายการอื่น → Redeploybroker → เปลี่ยนGatewayให้ตรง
- หมุนbackendpasswordต้องเปลี่ยนทั้งbrokerresourceและwebresource
- สำรอง credentials/config แบบเข้ารหัสพร้อม certificate volumesที่ต้องเก็บ ไม่ใส่ token/password ใน Git
- ไม่ใช้ down -v หรือสร้าง broker resourceใหม่เพื่อแก้ certrenewfailure
- การทดสอบ TLS/loginจริงที่serverเป็นขั้นตอนหลังDeploy ผล CI syntheticfixtureไม่ยืนยันproduction

อ้างอิง [Coolify Networking](https://coolify.io/docs/core/networking-in-coolify), [Cloudflare DNS token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) และ [Certbot Cloudflare plugin](https://certbot-dns-cloudflare.readthedocs.io/en/stable/)
