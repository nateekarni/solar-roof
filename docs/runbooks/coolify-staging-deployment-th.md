# ทางเลือก Deploy Full Stack ใน Resource เดียว

ปรับปรุง 6 ตุลาคม 2026 คู่มือหลักล่าสุดอยู่ที่ [Deployment index](coolify-solar-fowir-deployment-detailed-th.md) แนะนำเว็บและ MQTT resource แยกสำหรับติดตั้งใหม่

สำหรับ resource เดิมที่ใช้ /infra/docker/docker-compose.staging.yml ให้รักษา resource/project/volumes เดิม ใช้ API, WEB, WORKER, POSTGRES, MQTT, CERTBOT image digests จาก CI runเดียวกัน

## ค่าที่ต่างจากแบบแยก

- Composeรวมทุกservice:เว็บsolar.fowir.comและbrokerTLSmqtt-solar.fowir.com8883, DB/Redis/storageชุดเดียว
- Domainเฉพาะweb=https://solar.fowir.com:3000 บริการอื่นเว้นว่าง
- ใช้ infra/docker/.env.staging.example ใหม่ ไม่มี BOOTSTRAP_ADMIN_EMAIL/PASSWORD หรือ bootstrapserviceอีกแล้ว
- API ใช้ mqtt://mqtt:1883 บนprivateCompose network; Gatewayใช้mqtt-solar.fowir.com:8883 TLSภายนอก อย่าใส่URLของresourceแยกทับค่าภายในแบบรวม
- API MQTT_ENABLED/defaultbrokerเริ่มtrue จึงต้องตั้งbackendpassword/Gatewaycredentials/Cloudflaretoken/ACMEemailสำหรับcertbot/mqttตั้งแต่เริ่ม
- เว็บไซต์ /ready ไม่บังคับMQTT connection แต่ Composeขึ้นapiหลังmqtthealthy ดังนั้นถ้าต้องdeployเว็บก่อนให้ใช้ web Compose; fullstackนี้ยังรอcertificate/brokerตอนสร้างstack
- สร้าง user เองหลังmigrationตาม [คำสั่ง manual user](coolify-manual-users-th.md) ไม่ทำdemo seed

ขั้นตอนDNS/certificate/Gatewayดู [MQTT guide](coolify-mqtt-deployment-th.md) ขั้นตอนweb/DB/limits/ตรวจroleดู [web guide](coolify-web-first-deployment-th.md) แต่ **ไม่สร้างสองresourceเพิ่ม** เมื่อใช้fullstackนี้

สำรองDBและstorageก่อนอัปเดต เปลี่ยนdigestsในresourceเดิม Deployแล้วตรวจmigrationถึง028/one-shotexit0/serviceshealthy ตรวจเว็บloginและMQTTจริงแยกกัน ห้ามเปลี่ยนรหัสDB/storageเดิมสุ่มใหม่หรือใช้ down -v
