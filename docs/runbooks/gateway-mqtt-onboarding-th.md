# ทดสอบ Gateway onboarding ด้วย MQTTBox

คู่มือนี้ทดสอบ flow ตั้งแต่ Gateway ไม่เคยลงทะเบียนจนส่ง telemetry ที่บันทึกสำเร็จ ใช้ Gateway ID `GW-TEST-001`, Device ID `METER-TEST-001` และตัวอย่าง logical mapping สำหรับ simulator เท่านั้น **ไม่มี Register Address ของ Schneider PM2230 และไม่ใช่หลักฐานว่า mapping ของเครื่องจริงถูกต้อง** ก่อนใช้เครื่องจริงต้องตรวจ register map, data type, byte/word order, scale และ unit กับเอกสาร hardware ที่ยืนยันแล้ว

## ก่อนเริ่ม

1. ใน API container/private network ตรวจ `GET http://127.0.0.1:3001/ready/mqtt` ได้ HTTP `200`, `status: ready` และ `readyBrokers` เท่ากับ `configuredBrokers`
2. จด baseline Clients และ Subscriptions ใน EMQX Dashboard โดย API ควรมี subscription QoS 1 ห้าเส้น:
   - `solar/v1/gateways/+/register`
   - `solar/v1/gateways/+/configUpdate`
   - `solar/v1/gateways/+/configStatus`
   - `solar/v1/gateways/+/status`
   - `solar/v1/sites/+/gateways/+/devices/+/telemetry`
3. ตั้ง MQTTBox: host `mqtt-solar.fowir.com`, port `8883`, TLS เปิด, ตรวจ CA และ hostname, QoS `1` ห้ามเลือก ignore/skip certificate validation
4. API ต้องมี `EMQX_MANAGEMENT_URL` (HTTPS), `EMQX_MANAGEMENT_API_KEY` และ `EMQX_MANAGEMENT_API_SECRET` ของ Application/API key ที่มีสิทธิ์อ่านและลบ client session; ใช้ Dashboard username/password แทนไม่ได้ หากมีหลาย Broker ให้ใส่ `EMQX_MANAGEMENT_BROKERS_JSON` เป็น object ที่ key คือ broker UUID และ value คือ `{ "url", "apiKey", "apiSecret" }`

Topic control plane ที่อนุมัติแล้วมีเพียง:

```text
solar/v1/gateways/{gatewayId}/register
solar/v1/gateways/{gatewayId}/config
solar/v1/gateways/{gatewayId}/configUpdate
solar/v1/gateways/{gatewayId}/configStatus
solar/v1/gateways/{gatewayId}/status
```

`config` เป็น Cloud → Gateway; อีกสี่เส้นเป็น Gateway → Cloud ไม่มี `configAck` และไม่มี site-scoped alias สำหรับ control plane

## ระยะที่ 1 — ลงทะเบียนแบบ anonymous

สร้าง MQTTBox connection แรก:

- Client ID: `GW-TEST-001`
- Username/Password: เว้นว่างทั้งคู่
- Clean session: เปิดสำหรับการทดสอบ

Publish QoS 1, Retain ปิด ไปที่:

```text
solar/v1/gateways/GW-TEST-001/register
```

ใช้ [register-v1.1.json](../../apps/api/src/modules/gateway-control/fixtures/register-v1.1.json) ทั้งไฟล์ เปลี่ยน `messageId` และ `sentAt` เมื่อส่ง snapshot ใหม่ แต่ Gateway ID ใน Client ID, topic และ payload ต้องตรงกัน

ผลที่ต้องเห็น:

- MQTTBox ได้ PUBACK แต่ anonymous client subscribe topic ใดไม่ได้
- EMQX Clients เพิ่มจาก baseline 1 ราย; Subscriptions ไม่เพิ่ม
- หน้า Admin → จัดการเกตเวย์ → Tab **ยังไม่เชื่อมต่อ** เพิ่ม row `GW-TEST-001` พร้อมรุ่น/เฟิร์มแวร์/อุปกรณ์ที่รายงาน
- `reportedSiteId` เป็นข้อมูลประกอบเท่านั้น Admin เลือกไซต์จริงได้เอง
- ก่อนอนุมัติ snapshot ใหม่ใช้ last-write-wins; retry `messageId` เดิมและ payload เดิมเป็น idempotent

ถ้า Broker แสดง connection แต่ไม่มี row ให้ตรวจ `/ready/mqtt` ก่อน ถ้า `configuredBrokers: 1, readyBrokers: 0` แปลว่า API ยังไม่ connect/subscribe แม้ MQTTBox connect สำเร็จ

## Admin อนุมัติและรับ credential ครั้งเดียว

กด row ใน Tab ยังไม่เชื่อมต่อ แล้วทำ 4 ขั้นตอน:

1. **ตรวจสอบเกตเวย์** — รุ่น, firmware, reported site และอุปกรณ์
2. **เลือกไซต์งาน** — ค่า Admin เป็น authoritative แม้ไม่ตรง `reportedSiteId`
3. **ตั้งค่าอุปกรณ์** — ใช้ Preset ที่ตรงจริง หรือเลือก Manual/Gateway mapping; ข้อมูลที่ไม่มีให้เติมเองและไม่สร้าง Register Mapping เดา
4. **ยืนยันและซิงก์** — ตรวจสรุปแล้วกดยืนยัน

ระบบจะแสดง Username/Password ถาวรครั้งเดียว บันทึกลง secret store ของ Gateway ก่อนปิด Modal รหัสผ่านเดิมเปิดดูซ้ำไม่ได้ ถ้าสูญหายให้ใช้ **หมุนรหัสเชื่อมต่อ** ซึ่งทำให้รหัสเดิมใช้ไม่ได้ทันที

ระหว่างหมุน credential ระบบจะ suspend auth/ACL ของ Gateway ก่อน, revoke รหัสเดิม, แล้วเรียก EMQX Management API เพื่อตัด session ตาม Client ID ระบบจะคืนรหัสใหม่และปลด suspend เฉพาะเมื่อ EMQX ตอบยืนยันว่าตัด session แล้วหรือ session ไม่มีอยู่ หาก API ตัด session ไม่สำเร็จ endpoint จะตอบล้มเหลวและ Gateway จะยังถูก suspend เพื่อไม่ให้ session เก่า publish/subscribe ต่อ ห้ามนำ credential จาก response ที่ล้มเหลวไปใช้; แก้ Management API แล้วกดหมุนใหม่

หลังยืนยัน row อยู่สถานะ configuring/pending sync และระบบ publish retained config QoS 1 ไปที่ `solar/v1/gateways/GW-TEST-001/config`

ถ้า initial config ส่งไม่สำเร็จหรือ Gateway ตอบ `failed` ก่อนเคย active Admin เปิด **แก้ไขการตั้งค่าเริ่มต้น** จาก Modal หรือหน้า Gateway ได้ ระบบจะ snapshot `expectedBaseConfigVersion`/`expectedBaseConfigHash` และ JSON ทั้งชุดตอนเปิด Modal การ polling ระหว่างแก้ไขจะไม่เลื่อน base ที่กำลัง review หาก API ตอบ 409 ต้องปิดแล้วเปิด Modal ใหม่เพื่อโหลด snapshot ล่าสุด ห้าม submit ซ้ำด้วย base เดิม จากนั้นระบบสร้าง desired revision ใหม่และ publish retained config ใหม่ แต่ lifecycle ยังคง `configuring` จนได้รับ `configStatus: applied` ที่ตรง version/hash ไม่มี legacy bypass และไม่อนุมัติอัตโนมัติ

## Upgrade Gateway เดิมเข้าสู่ control plane แบบ explicit adoption

Migration `068_gateway_control_rollout_and_bindings.sql` ไม่ activate Gateway เดิมและไม่สร้าง mapping ให้เอง Deployment ที่ปลอดภัยต้องทำตามลำดับนี้:

1. รัน migration 068 แล้ว deploy API/Web รุ่นใหม่ก่อน Gateway เดิมที่ยังไม่มี strict `messageType: config` revision ยังส่ง canonical telemetry ด้วย binding เดิมได้ชั่วคราว จึงไม่ hard-cut ระหว่าง rollout
2. ให้ Admin ดึงข้อมูล Gateway/device/mapping ปัจจุบันและตรวจ register address, decoder, scale, unit, site และ external device ID ทั้งชุด ห้ามส่งเฉพาะ diff และห้ามสร้างค่าที่ไม่ทราบ สำหรับ device ที่ผูก billing อยู่ ต้องอ่าน exact `devices.payload_profile_revision_id` และ active `billing_meters.billing_source_binding_id` จากฐานข้อมูล production แบบ read-only แล้วเทียบกับ decoder/register ที่ติดตั้งจริง เก็บสอง UUID นี้เป็น continuity proof; ถ้ามีมากกว่าหนึ่ง active binding, ไม่มี binding หรือ decoder ไม่ตรงให้หยุด adoption และแก้ข้อมูลก่อน
3. เรียก `POST /v1/gateways/{internalGatewayUuid}/adopt` ด้วย Owner token และ optimistic version ปัจจุบัน ตัวอย่าง body:

```json
{
  "expectedDesiredConfigVersion": 0,
  "devices": [
    {
      "deviceId": "METER-01",
      "enabled": true,
      "mappingSource": "manual",
      "deviceType": "energy-meter",
      "model": "รุ่นที่ตรวจแล้ว",
      "serialNumber": "เลขจริง",
      "protocol": "modbus-tcp",
      "connection": {"host": "192.0.2.10", "port": 502, "slaveId": 1},
      "pollGroups": ["energy"],
      "mappings": [{"tag":"energy.active.import.total","displayName":"Import energy","pollGroup":"energy","sourceUnit":"Wh","targetUnit":"kWh","conversion":"wh-to-kwh","role":"billing-import","registerAddress":"3204","registerCount":2,"dataType":"uint32","byteOrder":"big_endian","wordOrder":"big_word_first","scale":0.01,"offset":0}]
    }
  ],
  "billingContinuity": [
    {
      "deviceId": "METER-01",
      "expectedProfileRevisionId": "<exact devices.payload_profile_revision_id>",
      "expectedBillingSourceBindingId": "<exact active billing_meters.billing_source_binding_id>"
    }
  ]
}
```

4. `billingContinuity` ต้องมีครบทุก device ที่ billing-bound และห้ามใส่ให้ device อื่น Endpoint จะ reject หาก UUID ใดเปลี่ยน, decoder เปลี่ยน, Gateway ถูก adopt แล้ว หรือ version เปลี่ยนระหว่าง review Snapshot legacy ที่ไม่มี protocol/connection/serial จึง adopt ได้เฉพาะเมื่อ Admin ยืนยัน exact deployed decoder/billing binding นี้ ระบบไม่เติมค่าที่ขาดและไม่ rebind billing ให้เอง เมื่อสำเร็จจึงสร้าง immutable approved active/desired revision, immutable device/profile bindings และ credential ครั้งเดียวจาก snapshot ที่ Admin ส่งมาเท่านั้น
5. บันทึก credential, ตั้งเครื่อง, subscribe retained `config`, ตรวจ version/hash และทดสอบ telemetry หลัง adoption ตั้งแต่นี้ telemetry ที่มี `configurationVersion` จะ resolve decoder ผ่าน immutable binding ของ revision นั้น ไม่อ่าน `profileRevisionId` จาก payload config และไม่เดาจาก mutable mapping

Migration จะ backfill binding ได้เฉพาะ legacy snapshot ที่มี `profileRevisionId` UUID ชัดเจนตรง device เดียว หรือ strict applied snapshot ที่ decoder ตรงทุก field เท่านั้น กรณีขาด/กำกวมจะปล่อย unbound และ telemetry versioned ถูก reject แทนการเดา ห้ามวนเรียก adoption อัตโนมัติใน migration/deploy และห้ามถือว่าการมี Gateway row เดิมคือการอนุมัติ mapping แล้ว ถ้าต้อง rollback ก่อน adoption ให้ rollback application ได้โดยไม่มี strict revision; หลัง adoption ต้องใช้ config correction/proposal flow ไม่ลบ revision เพื่อย้อนกลับ

## ระยะที่ 2 — reconnect, รับ config และเปิดใช้งาน

ตัด anonymous connection แล้วสร้าง connection ใหม่ แต่ **ยังไม่กด CONNECT**:

- Client ID: `GW-TEST-001`
- Username: Username ที่ระบบออกให้ ซึ่งต้องเท่ากับ `GW-TEST-001`
- Password: one-time plaintext ที่เพิ่งบันทึก

กำหนด identity ของ status ดังนี้:

- สร้าง `sessionId` ครั้งเดียวเมื่อ process/device boot และเก็บค่าเดิมให้คงที่ตลอดหนึ่ง boot รวม reconnect ที่เกิดโดย process เดิม; สร้าง `sessionId` ใหม่เมื่อ process/device reboot เท่านั้น
- สร้าง `messageId` ที่ไม่ซ้ำและ `reportedAt` เวลาปัจจุบันค่าใหม่ทุกครั้ง สำหรับการกำหนด Will แต่ละครั้งและทุก online/offline status publication
- ห้าม reuse หรือใช้ซ้ำทั้ง `messageId` และ `reportedAt` ข้าม status publication หรือ reconnect แม้ `status`, `sessionId` หรือ payload ส่วนอื่นจะเหมือนเดิม

ก่อน CONNECT ให้เปิด Last Will ของ connection นี้และกำหนด:

- Topic: `solar/v1/gateways/GW-TEST-001/status`
- QoS 1
- Retain เปิด (`Retain = true`)
- Payload: ใช้โครงสร้างเดียวกับ [status-v1.1.json](../../apps/api/src/modules/gateway-control/fixtures/status-v1.1.json) แต่ตั้ง `status: "offline"`, ใช้ `sessionId` ของ boot นี้, สร้าง `messageId` ใหม่และ `reportedAt` ใหม่สำหรับ Will นี้ และใส่ applied version/hash จริงหรือ `null` ถ้ายังไม่เคย apply

Last Will ต้องเป็น retained offline และต้องตั้งให้เสร็จก่อน CONNECT เพราะ Broker รับ Will ได้เฉพาะใน CONNECT packet การแก้ Will หลังเชื่อมต่อแล้วไม่มีผลกับ session ปัจจุบัน จากนั้นกด CONNECT รอ CONNACK แล้ว Subscribe QoS 1 ไปที่:

```text
solar/v1/gateways/GW-TEST-001/config
```

รอ SUBACK `config` สำเร็จก่อน จึง Publish retained online status QoS 1 (`Retain = true`) ไปที่ `solar/v1/gateways/GW-TEST-001/status` โดยใช้ status fixture ที่คง `sessionId` ของ boot เดิม แต่สร้าง `messageId`/`reportedAt` ใหม่สำหรับ online publication นี้ และใส่ applied version/hash ให้ตรง session จริง ห้ามส่ง online ถ้า CONNACK หรือ SUBACK ที่จำเป็นถูกปฏิเสธ สำหรับการเชื่อมต่อครั้งแรกในสถานะ configuring subscription ที่จำเป็นคือ `config`; เมื่อ active แล้ว การ reconnect ต้องรอ SUBACK ทั้ง `config` และ `dataAcept` สำเร็จก่อนส่ง online

ต้องได้รับ config ล่าสุดทันทีโดย MQTTBox แสดง Retain = true และ QoS 1 จด `siteId`, `configVersion`, `configHash`, devices และ mappings จากข้อความจริง ห้ามใช้ hash ตัวอย่างแทน

จากนั้น publish [config-status-v1.1.json](../../apps/api/src/modules/gateway-control/fixtures/config-status-v1.1.json) QoS 1, Retain ปิด ไปที่:

```text
solar/v1/gateways/GW-TEST-001/configStatus
```

แก้ `configVersion`/`configHash` ให้ตรง retained config และส่งสองครั้งโดยใช้ `messageId` ใหม่แต่ละครั้ง:

1. `status: "received"` เมื่อเก็บ payload แล้ว
2. `status: "applied"` หลังตั้งค่าอุปกรณ์สำเร็จจริง

ถ้า apply ไม่สำเร็จให้ส่ง `status: "failed"` พร้อม `error.code` และ `error.message` ไม่ส่ง `applied` เพื่อให้ UI ดูสำเร็จ

ผลที่ต้องเห็น:

- หลัง `received`: Modal แสดง **เกตเวย์รับการตั้งค่าแล้ว** และยังรอ apply
- หลัง `applied`: lifecycle เป็น `active`, config state เป็น `applied`, desired/active version เท่ากัน และ row ย้ายไป Tab **เชื่อมต่อแล้ว**
- EMQX Clients ยังเพิ่ม 1 จาก baseline; subscription เพิ่ม 1 สำหรับ `config`

ก่อน active การ subscribe `dataAcept` อาจถูก ACL ปฏิเสธโดยตั้งใจ หลัง `applied` ให้ subscribe QoS 1 ใหม่ที่:

```text
solar/v1/sites/SITE-TEST-001/gateways/GW-TEST-001/dataAcept
```

เมื่อ SUBACK `dataAcept` สำเร็จ Subscriptions จะเพิ่มอีก 1 รวม MQTTBox สองเส้นเหนือ baseline จากนั้นจึง Publish online status รอบใหม่แบบ QoS 1, Retain เปิด ไปที่ `solar/v1/gateways/GW-TEST-001/status` โดยคง `sessionId`, สร้าง `messageId`/`reportedAt` ใหม่ และใช้ version/hash ที่ apply แล้ว เพื่อให้ retained state สะท้อน active config ล่าสุด ห้ามเริ่มส่ง telemetry ก่อน SUBACK นี้สำเร็จ

## ตรวจสถานะ disconnect และ reconnect

- **Graceful disconnect:** ก่อนกด DISCONNECT ให้ Publish retained offline status QoS 1 ไปที่ topic `status` เดิม โดยคง `sessionId` แต่สร้าง `messageId`/`reportedAt` ใหม่สำหรับ offline publication นี้ รอ PUBACK สำเร็จ แล้วจึงส่ง DISCONNECT/ปิด connection วิธีนี้ไม่พึ่ง Last Will เพราะ Broker จะลบ Will เมื่อรับ DISCONNECT ปกติ
- **Abnormal disconnect:** ทดสอบโดยตัด network หรือ kill client โดยไม่ส่ง DISCONNECT Broker ต้อง Publish retained offline Last Will แทน Gateway และหน้า Admin เปลี่ยนเป็น offline โดยไม่เปลี่ยน lifecycle/config state
- **Reconnect:** ใช้ Client ID เดิม; ถ้า process ยังไม่ reboot ให้คง `sessionId` ของ boot เดิม แต่ถ้า reboot แล้วให้สร้าง `sessionId` ใหม่ ตั้ง retained offline Last Will ใหม่ก่อน CONNECT ทุกครั้งด้วย `messageId`/`reportedAt` ใหม่ แล้วรอ CONNACK และ required SUBACK สำเร็จทั้งหมด (`config` และเมื่อ active แล้วคือ `dataAcept`) ก่อน Publish retained online status QoS 1 ด้วย `messageId`/`reportedAt` ใหม่อีกชุดเพื่อเขียนทับ retained offline

ผู้ subscribe ใหม่ต้องเห็น retained state ล่าสุดเพียงค่าเดียว: offline หลัง graceful/abnormal disconnect และ online หลัง reconnect ที่ subscriptions พร้อมแล้ว `reportedAt` ใน Will อาจเป็นเวลาที่เตรียม payload ไว้ก่อนหน้า ระบบจึงยึดเวลา receive ของ Broker/API แยกต่างหาก

## ส่ง canonical telemetry และตรวจ dataAcept

ใช้ `siteId`, device, profile และ mapping จาก retained config จริง ตัวอย่าง simulator ต่อไปนี้สอดคล้องกับ logical mapping ใน fixture แต่ไม่ใช่ PM2230 register proof:

```json
{
  "schemaVersion": "1.1",
  "messageType": "telemetry",
  "messageId": "GW-TEST-001-telemetry-0001",
  "sequence": 1,
  "lotNumber": 1,
  "configurationVersion": 1,
  "siteId": "SITE-TEST-001",
  "gatewayId": "GW-TEST-001",
  "device": {
    "deviceId": "METER-TEST-001",
    "deviceType": "energy-meter"
  },
  "pollGroup": "energy",
  "timestamps": {
    "polledAt": "2026-10-19T10:15:00+07:00",
    "sentAt": "2026-10-19T10:15:01+07:00"
  },
  "data": {
    "values": {"energy.active.import.total": 123456},
    "units": {"energy.active.import.total": "Wh"}
  },
  "quality": {"status": "good", "communication": "online"}
}
```

ปรับเวลา/ID/version ให้เป็นค่าจริง แล้ว Publish QoS 1, Retain ปิด ไปที่:

```text
solar/v1/sites/SITE-TEST-001/gateways/GW-TEST-001/devices/METER-TEST-001/telemetry
```

ต้องได้รับหลัง transaction commit เท่านั้น:

```json
{
  "schemaVersion": "1.1",
  "messageType": "dataAcept",
  "siteId": "SITE-TEST-001",
  "gatewayId": "GW-TEST-001",
  "lotNumber": 1,
  "messageId": "GW-TEST-001-telemetry-0001",
  "status": "accepted",
  "acceptedAt": "<server timestamp>"
}
```

PUBACK จาก Broker อย่างเดียวยังไม่แปลว่าบันทึกแล้ว ต้องเห็น `dataAcept` ที่ messageId/lotNumber ตรงกันและหน้า Gateway แสดง received time/telemetry ล่าสุด Retry ต้องใช้ messageId, lotNumber และค่าชุดเดิม (เปลี่ยนได้เฉพาะ `timestamps.sentAt`); ใช้ messageId เดิมกับค่าคนละชุดจะถูก reject และไม่มี ACK สำเร็จ

## เสนอ configUpdate หลังใช้งาน

Publish [config-update-v1.1.json](../../apps/api/src/modules/gateway-control/fixtures/config-update-v1.1.json) QoS 1, Retain ปิด ไปที่:

```text
solar/v1/gateways/GW-TEST-001/configUpdate
```

แก้ `siteId`, `baseConfigVersion` และ snapshot ให้ตรง active config ปัจจุบัน ใช้ `proposalId`/`messageId` ใหม่ การเปลี่ยนนี้ไม่ใช้ last-write-wins และไม่ activate อัตโนมัติ

ผลที่ต้องเห็น:

- หน้า Gateway → **ข้อเสนอการตั้งค่าจากเกตเวย์** แสดงสถานะ pending และ diff ก่อน/หลัง
- Admin อนุมัติหรือปฏิเสธพร้อมเหตุผล; การอนุมัติสร้าง desired version ถัดไป
- เมื่ออนุมัติ Gateway ได้ retained `config` ใหม่ แล้วต้องส่ง `configStatus: received` และ `applied` สำหรับ version/hash ใหม่อีกครั้ง

## วินิจฉัยตามอาการ

| อาการ | สาเหตุ/การตรวจที่ตรงจุด |
|---|---|
| CONNECT anonymous ถูกปฏิเสธ | Client ID ไม่ตรงรูปแบบ, ID เคยลงทะเบียน/ถูก reserve แล้ว หรือใส่ username/password |
| PUBACK แต่ไม่ขึ้น Tab ยังไม่เชื่อมต่อ | API ไม่ ready, คนละ Broker, topic/payload identity ไม่ตรง หรือ schema 1.1 ไม่ผ่าน |
| SUBACK `config` ถูกปฏิเสธ | ยังใช้ anonymous session, username/client ID ไม่ตรง Gateway ID หรือ credential ถูกหมุนแล้ว |
| subscribe แล้วไม่ได้ retained config | ยังไม่มี desired revision, API publisher ไม่ ready หรือ subscribe topic ผิด; ห้ามตั้ง Retain เองแทนระบบ |
| `configStatus` ไม่เปลี่ยนสถานะ | version/hash ไม่ตรง desired config, topic Gateway ID ไม่ตรง หรือใช้ชื่อ `configAck` ที่เลิกใช้แล้ว |
| `dataAcept` subscribe ถูกปฏิเสธ | Gateway ยังไม่ active/applied หรือ site/device binding ไม่ตรง; apply ก่อนแล้ว subscribe ใหม่ |
| Telemetry ได้ PUBACK แต่ไม่มี `dataAcept` | admission/config version/topic identity/profile/unit/required field ไม่ผ่าน หรือ DB rollback; ตรวจ API rejection metric/log ที่ redact แล้ว |
| configUpdate ไม่ขึ้น proposal | base version/site/gateway ไม่ตรง, payload ไม่ครบ หรือ proposal/message ID ซ้ำแบบขัดแย้ง |

ห้ามใส่ password, `INTERNAL_MQTT_SECRET`, retained config ที่มีข้อมูลอ่อนไหว หรือ payload production เต็มชุดลง screenshot/log ที่ส่งต่อ ใช้ Gateway ID/message ID สำหรับ correlation แทน
