# คู่มือ Deploy Solar Roof บน Coolify — ฉบับล่าสุด

ปรับปรุง 6 ตุลาคม 2026: เลือก Preset ช่องเดียว, migration ถึง 028, แยก web/MQTT health check และ **ไม่มี bootstrap user ตอนเริ่มระบบ** ใช้เครื่อง pilot เดิม 2 vCPU / RAM 4 GiB และ image digest จาก CI

## เลือกคู่มือให้ตรงกับงาน

| งาน | คู่มือ | Compose Location | Image จาก CI |
|---|---|---|---|
| เว็บไซต์ solar.fowir.com | [Deploy เว็บ](coolify-web-first-deployment-th.md) | /infra/docker/docker-compose.web.yml | API, WEB, WORKER, POSTGRES |
| Broker ของเรา mqtt-solar.fowir.com | [Deploy MQTT แยก](coolify-mqtt-deployment-th.md) | /infra/docker/docker-compose.mqtt.yml | MQTT, CERTBOT |
| เพิ่มบัญชี Admin / Owner / School User | [คำสั่งเพิ่ม user](coolify-manual-users-th.md) | รันใน Terminal ของ service api | ไม่ต้อง redeploy เพื่อเพิ่ม user |
| Private Git repository / GHCR | [GitHub App และ registry](coolify-private-github-th.md) | ตั้งก่อน Deploy | Git กับ registry ใช้สิทธิ์คนละชุด |
| Preset และตัวอย่าง payload | [Unified Presets](unified-presets-th.md) | จัดการผ่าน Admin หลังสร้างบัญชี | Pilot SPM91 มากับ migration 028 |

**ลำดับแนะนำ:** Deploy เว็บ → สร้าง Admin ด้วยคำสั่ง → เพิ่มโรงเรียน/ไซต์ → เพิ่ม Owner/School User → ทดสอบเว็บ → เชื่อม broker ภายนอกที่ผู้ดูแล Gateway ให้ หรือ deploy MQTT ของเราเมื่อพร้อม

## ผลตรวจโดเมน

วันที่ 6 ตุลาคม 2026 DNS A ของ solar.fowir.com และ mqtt-solar.fowir.com ตอบ 188.166.250.177 ทั้งคู่ ค่านี้เป็นผลตรวจ ณ เวลาจัดเอกสาร ให้ยืนยันว่า IP ตรงกับเครื่องใน Coolify อีกครั้ง การมี DNS ไม่ได้ยืนยันว่า application, port, TLS หรือ MQTT login ใช้ได้แล้ว

Web Compose: API WEB_URL=https://solar.fowir.com, web ส่ง /v1 ผ่าน API_INTERNAL_URL=http://api:3001 บน origin เดียวกัน ไม่มี API domain แยก
MQTT Compose: MQTT_TLS_DOMAIN=mqtt-solar.fowir.com สำหรับ broker และ certbot; Gateway ใช้ mqtt-solar.fowir.com:8883 TLS

## Resource pilot เดิม

| Service | CPU limit | RAM limit | RAM reservation |
|---|---:|---:|---:|
| postgres | 0.75 | 768m | 256m |
| api | 0.75 | 512m | 256m |
| web | 0.50 | 384m | 128m |
| worker | 0.25 | 256m | 64m |
| storage | 0.25 | 256m | 64m |
| redis | 0.25 | 128m | 32m |
| mqtt (resource แยก) | 0.25 | 128m | 32m |
| certbot (resource แยก) | 0.25 | 128m | 32m |
| migrate (one-shot) | 0.50 | 256m | — |
| storage-init / release-evidence (แต่ละ one-shot) | 0.25 | 128m | — |

Compose ใส่ default เหล่านี้ไว้แล้ว ไม่ต้องกำหนดซ้ำใน UI; override ด้วย *_CPU_LIMIT / *_MEMORY_LIMIT ตามไฟล์ example ได้ Long-running web RAM ceilings รวม 2304 MiB; รวม MQTT เป็น 2560 MiB เผื่อ OS/Coolify/proxy และช่วง one-shot เริ่มระบบ ตัวเลขเป็นเพดานตั้งต้น ต้องดู peak จริง ถ้ามีแอปอื่นแชร์เครื่องให้ตรวจพื้นที่ RAM/disk ที่เหลือ หลีกเลี่ยง build บนเครื่อง pilot ใช้ GitHub Actions build

## ของเดิมที่ยังมีอยู่

infra/docker/docker-compose.staging.yml ยังเป็น full-stack แบบ resource เดียวและเอา bootstrap ออกแล้ว เหมาะกับผู้ที่ติดตั้งแบบนี้อยู่และต้องการรักษา resource/volumes เดิม คู่มือ [เดิมแบบรวม](coolify-staging-deployment-th.md) อธิบายทางเลือกนี้

หากยังไม่เคยติดตั้งให้ใช้สอง resource ตามคู่มือใหม่ ไม่สร้างเว็บสองชุด ไม่เปลี่ยนชื่อ Compose project/resource หรือชื่อ volume ของฐานข้อมูลเดิมโดยไม่ย้ายข้อมูล ใช้รหัส DB/Storage เดิมสำหรับ resource เดิม ไม่ใช้ db:seed / db:seed:reset / down -v เพื่อ deploy

## Release และการอัปเดต

1. GitHub Actions → CI and staging → main ล่าสุด ต้อง verify ผ่านก่อนใช้ digest จาก Summary ของ run เดียวกัน
2. ตั้ง STAGING_DEPLOY_ENABLED=false ใน GitHub Variables ระหว่างติดตั้ง/สาธิต; ปิด Auto Deploy ใน Coolify จนเตรียม workflow พร้อม
3. จด release SHA และ digest เดิม สำรอง DB พร้อมไฟล์เอกสารก่อนอัปเดต
4. เปลี่ยน image digest ใน resource เดิม แล้ว Deploy; migrate ทำงานอัตโนมัติและต้อง Exited(0) ถึง 028
5. storage-init และ release-evidence ต้อง Exited(0); service api/web/worker/postgres/redis/storage ต้อง healthy ไม่มี bootstrap service และไม่มีการสร้าง user อัตโนมัติ
6. ตรวจ login, สิทธิ์สาม role, responsive และ Preset; ตรวจ MQTT แยกตามคู่มือเมื่อเปิด ingestion
7. ถ้า image เก่าต้อง rollback ให้ตรวจความเข้ากันได้กับ schema ใหม่ก่อน ไม่ย้อน schema โดยล้างข้อมูล

คู่มือนี้เป็นขั้นตอนและผลตรวจค่าตั้งใน repo ไม่ใช่หลักฐานว่า production deploy สำเร็จแล้ว
