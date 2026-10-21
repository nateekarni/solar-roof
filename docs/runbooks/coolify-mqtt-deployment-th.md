# Deploy EMQX สำหรับ Solar Platform บน Coolify

คู่มือนี้ใช้ EMQX `5.8.3` จาก `infra/docker/docker-compose.emqx.yml` เป็น Broker ของ control plane และ telemetry รุ่น 1.1 โดยแยก resource ออกจากเว็บ การ deploy นี้เปิดสู่ภายนอกเฉพาะ MQTTS `8883`; TCP `1883` และ Dashboard HTTPS `18083` อยู่ใน private Compose network เท่านั้น

## 1. สิ่งที่ต้องเตรียม

- DNS `mqtt-solar.fowir.com` ชี้มายังเครื่องและเปิด firewall เฉพาะ TCP `8883`
- `/data/mqtt-certs/fullchain.pem` และ `/data/mqtt-certs/privkey.pem` เป็น certificate/key จริงของ `mqtt-solar.fowir.com`
- CA bundle ของระบบ เช่น `/etc/ssl/certs/ca-certificates.crt` สำหรับ EMQX ตรวจ callback HTTPS ของ `solar.fowir.com`
- API ที่ `https://solar.fowir.com/v1/internal/mqtt/auth` และ `/acl` เข้าถึงได้จาก container
- secret แยกกันสำหรับ node cookie, Dashboard, callback และบัญชี `solar-backend`

ห้ามใช้ certificate ตัวอย่าง, self-signed certificate ของ CI หรือรหัสจากไฟล์ `.example` ใน production และห้ามเปิด `1883`/`18083` เป็น host port

## 2. สร้าง EMQX resource

1. Coolify → Project/Environment เดียวกับเว็บ → New Resource → Git repository → branch/revision ที่ผ่าน CI
2. เลือก Docker Compose และตั้ง Compose Location เป็น `/infra/docker/docker-compose.emqx.yml`
3. คัดลอกชื่อค่าจาก `infra/docker/.env.emqx.example` ไป Coolify แล้วแทน placeholder ทุกตัว
4. สร้าง secret เป็น hexadecimal เพื่อไม่ให้ HOCON ตีความ `#`, `:` หรือ `=` เช่น `openssl rand -hex 32`; เก็บผลใน secret manager ไม่ใส่ Git, ticket หรือ log
5. `INTERNAL_MQTT_SECRET` ต้องเป็นค่าเดียวกับ API ส่วน `EMQX_NODE_COOKIE`, Dashboard password และ `MQTT_PASSWORD` ต้องเป็นคนละค่า

Compose ใช้ bind mount แบบ path คงที่ `/data/mqtt-certs` และ `/etc/ssl/certs/ca-certificates.crt` โดยตั้งใจ เพราะ Coolify ปฏิเสธ `${...}` ใน volume source เพื่อป้องกัน command injection ต้องสร้างไฟล์บน host ตามข้อ 1 ก่อน deploy และไม่ต้องเพิ่ม `MQTT_CERTS_DIR` หรือ `MQTT_WEBHOOK_CA_FILE` ใน Environment Variables ของ resource

ค่า deploy ที่บังคับ:

| ตัวแปร | ใช้ทำอะไร |
|---|---|
| `EMQX_NODE_COOKIE` | secret ภายใน node/cluster |
| `EMQX_DASHBOARD_USER`, `EMQX_DASHBOARD_PASSWORD` | บัญชี Dashboard ที่ไม่ใช่ค่า default |
| `INTERNAL_MQTT_SECRET` | header `x-internal-secret` สำหรับ auth และ ACL callback |

ที่ Web/API resource ต้องกำหนด `EMQX_MANAGEMENT_URL`, `EMQX_MANAGEMENT_API_KEY`, `EMQX_MANAGEMENT_API_SECRET` และ `EMQX_MANAGEMENT_DEFAULT_BROKER_ID` เพิ่มด้วย โดย UUID ตัวหลังต้องตรงกับ broker record ที่ URL นี้จัดการจริง หากเป็น remote broker ให้ใส่ target ใน `EMQX_MANAGEMENT_BROKERS_JSON`; ระบบจะไม่ fallback ไป broker เริ่มต้นที่ไม่เกี่ยวข้อง โดยสร้าง Application/API key ใน EMQX ที่มีสิทธิ์อ่าน/ลบ client session สำหรับ `DELETE /api/v5/clients/{clientid}` โดยเฉพาะ ห้ามใช้ Dashboard password และห้ามใส่ key/secret ใน URL ระบบใช้ค่านี้เพื่อตัด session เก่าก่อนยืนยันการหมุน Gateway credential

Compose ของ EMQX 5.8.3 ต้องคง `EMQX_AUTHORIZATION__CACHE__ENABLE=false` ไว้ เพื่อไม่ให้ connected client ใช้ authorization cache เก่าหลัง gateway ถูก suspend/หมุน credential หลังแก้ค่านี้ต้อง recreate container (restart อย่างเดียวอาจไม่รับ environment ใหม่) และตรวจ effective configuration ก่อนเปิดการหมุน credential ห้าม deploy หาก assertion นี้ไม่ผ่าน

Compose บังคับ callback ทั้งสองเส้นให้ใช้ `verify_peer`, CA bundle และ SNI `solar.fowir.com` ถ้า CA/hostname ไม่ตรงให้แก้ chain หรือ DNS ห้ามเปลี่ยนเป็น `verify_none`

### กรณีมี volume `emqx-data` เดิม

`EMQX_DASHBOARD__DEFAULT_USERNAME` และ `EMQX_DASHBOARD__DEFAULT_PASSWORD` ใช้สร้างบัญชีเริ่มต้นเฉพาะตอนฐานข้อมูล EMQX ใหม่ การเปลี่ยนค่า env แล้ว redeploy **ไม่เปลี่ยนหรือหมุน credential ที่บันทึกอยู่ใน persisted `emqx-data`** และไม่เปลี่ยนชื่อบัญชีเดิม ดังนั้นห้ามสรุปว่ารหัสถูกเปลี่ยนจาก env อย่างเดียว

ก่อนนำ volume เดิมขึ้น production ให้ snapshot/backup volume แล้วเปิด terminal ส่วนตัวใน EMQX container ตรวจชื่อ admin ที่มีอยู่ และหมุนรหัสด้วยคำสั่งของ EMQX 5.8.3:

```sh
emqx ctl admins list
emqx ctl admins passwd <existing-user> <new-password>
```

ผลจาก `emqx ctl admins list` คือ inventory ที่ต้องตรวจครบ ห้ามสมมติว่า `<existing-user>` เป็น admin เพียงรายเดียว สำหรับ other admin users/บัญชี admin อื่นทุกบัญชี ให้ระบุ owner และ purpose, หมุนเป็นรหัสเฉพาะที่ไม่ใช่ default หรือปิด/ลบบัญชีที่ยืนยันว่าไม่ใช้แล้วตาม change approval ห้ามปล่อยบัญชีเก่าที่ไม่ทราบเจ้าของไว้

ก่อนหมุนรหัส ให้อ่าน exact prior credential ของ `<existing-user>` จาก secret store ที่ได้รับอนุญาตโดยไม่คัดลอกลงเอกสาร และตรวจผ่าน private/incognito session ว่า credential ชุดนี้ login ได้จริง ถ้าเข้าไม่ได้ให้หยุดและแก้ inventory/secret provenance ก่อน เพราะจะยังพิสูจน์ไม่ได้ว่าการหมุนทำให้รหัสเดิมใช้ไม่ได้

แทน placeholder ใน terminal ส่วนตัวเท่านั้น เพราะ password เป็น command argument และอาจติด shell history/process inspection ห้ามคัดลอกคำสั่งจริงลง ticket, deployment log หรือ screenshot หลังรันคำสั่งให้ออกจาก Dashboard ทุก session แล้วตรวจด้วย private/incognito session ใหม่:

1. `<existing-user>` กับ exact prior credential จาก secret store ต้อง login fail/ถูกปฏิเสธหลัง rotation
2. `<existing-user>` กับ new secret ต้องใช้งานได้ (new secret works)
3. แยกต่างหากจากข้อ 1 ให้ตรวจ legacy username `admin` กับ password `admin123456` ต้อง login fail/ถูกปฏิเสธ แม้ `<existing-user>` จะเป็นชื่ออื่น

ถ้าต้องเปลี่ยน username ด้วย ให้สร้างบัญชีใหม่ตามคำสั่ง `emqx ctl admins` ของ version ที่ deploy, ยืนยันว่าบัญชีใหม่ login ได้ก่อน แล้วจึงลบบัญชีเก่า ห้ามลบ volume เพื่อหวัง reset credential เพราะทำให้ state อื่นใน Broker สูญหาย

## 3. เชื่อม API กับ EMQX ชุดเดียวกัน

ตั้งใน web/staging resource:

```dotenv
MQTT_ENABLED=true
MQTT_DEFAULT_BROKER_ENABLED=true
MQTT_URL=mqtts://mqtt-solar.fowir.com:8883
MQTT_USERNAME=solar-backend
MQTT_PASSWORD=<รหัส backend ที่ EMQX callback ตรวจค่าเดียวกัน>
INTERNAL_MQTT_SECRET=<ค่าเดียวกับ EMQX resource>
```

ถ้า API และ EMQX ถูกต่อเข้ากับ private network เดียวกันจริง สามารถใช้ `mqtt://mqtt:1883` ได้โดยไม่ publish port นี้ แต่ทุก instance ของ API และเครื่องมือทดสอบต้องชี้ Broker EMQX เดียวกัน ห้ามเปิด default broker ซ้ำกับ registered broker ตัวเดียวกัน

## 4. ตรวจ deployment

ตรวจ render ด้วยค่าทดสอบเท่านั้น เพราะ `docker compose config` แสดงค่าที่ expand แล้ว:

```sh
docker compose --project-directory . --env-file infra/docker/.env.emqx.example -f infra/docker/docker-compose.emqx.yml config
```

ต้องรันจาก repository root และคง `--project-directory .` ไว้เพื่อจำลองวิธีที่ Coolify resolve bind mount ให้ตรงกับ production จากนั้นตรวจว่า source ของ `/opt/emqx/etc/emqx.conf` ชี้ไปที่ `infra/docker/emqx/emqx.conf` และเป็นไฟล์จริง อย่าแนบ output จาก environment จริง เพราะอาจมี callback secret และ Dashboard password

หลัง deploy ตรวจตามลำดับ:

```sh
openssl s_client -connect mqtt-solar.fowir.com:8883 -servername mqtt-solar.fowir.com -verify_return_error </dev/null
# รันบรรทัดนี้ใน API container/private network
curl -fsS http://127.0.0.1:3001/ready/mqtt
```

- TLS ต้องตรวจ chain และ hostname ผ่าน
- `/ready/mqtt` ต้องตอบ HTTP `200` และ JSON `{"status":"ready","configuredBrokers":1,"readyBrokers":1}` เมื่อมี Broker เดียว
- EMQX Dashboard ต้องเข้าผ่าน private network/SSH tunnel เท่านั้น และต้องไม่มี default credential
- API backend ต้องเป็น client อย่างน้อย 1 รายและมี subscription QoS 1 สี่เส้น: `configUpdate`, `configStatus`, `status` และ `$solar/internal/telemetry/+/solar/v1/sites/+/gateways/+/devices/+/telemetry`; EMQX ต้องมี rule `telemetry_ingress` ที่ republish canonical telemetry พร้อม `${clientid}` ไปเส้น private นี้ ส่วน API ไม่ subscribe เส้น `config` และไม่ใช้ `/register`

จำนวน clients/subscriptions ใน Dashboard เป็นค่าปัจจุบันและอาจมี session อื่น ให้เทียบ delta กับ baseline ก่อนเปิด MQTTBox แทนการยึดเลขรวมคงที่

## 5. Troubleshooting

| อาการ | ตรวจจุดใด |
|---|---|
| EMQX มี client แต่ Topics/Subscriptions เป็น 0 | client อาจ connect อย่างเดียว; ตรวจ `/ready/mqtt`, SUBACK ของ API และว่า API ใช้ `MQTT_URL` เดียวกัน |
| `/ready/mqtt` เป็น `not_ready` | ตรวจ DNS/port/credential `solar-backend`, callback secret และ EMQX auth log โดยไม่พิมพ์รหัส |
| auth/ACL callback ถูก deny ทุกครั้ง | ค่า `INTERNAL_MQTT_SECRET` สอง resource ไม่ตรง หรือ header ไม่ถูกส่ง |
| callback ขึ้น TLS error | CA bundle, chain หรือ SNI ผิด; ห้ามปิด peer verification |
| Gateway connect ได้แต่ publish/subscribe ไม่ได้ | Client ID, username, lifecycle หรือ topic ไม่ตรง ACL; ดูขั้นตอนใน `gateway-mqtt-onboarding-th.md` |
| retained config ไม่มาถึง | ตรวจ API readiness, subscription `.../config` QoS 1, desired revision และ publication status; API ไม่ควร subscribe topic นี้เอง |

หลัง Broker พร้อม ให้ทดสอบ flow จริงตาม [คู่มือ Gateway/MQTTBox](gateway-mqtt-onboarding-th.md) การที่ `emqx ping` หรือ MQTT CONNECT สำเร็จยังไม่ยืนยันว่า API รับข้อความหรือบันทึก telemetry แล้ว
