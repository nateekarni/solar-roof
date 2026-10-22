# ทดสอบ Gateway onboarding ผ่าน MQTT telemetry

คู่มือนี้เป็นแหล่งอ้างอิงหลักสำหรับการค้นหา จับคู่ และทดสอบ Gateway ผ่าน MQTT ระบบ **ไม่ใช้ `/register`** อีกแล้ว ข้อความแรกของ Gateway คือ telemetry ปกติบน Topic เดียวกับที่ใช้หลังเชื่อมต่อ รองรับทั้ง schema `1.1` ที่ไม่มี Serial และ schema `1.2` ที่มี Serial

> โหมดสาธิตปัจจุบันใช้ `GATEWAY_AUTH_MODE=demo-anonymous`: Gateway ใช้ Client ID เดิมและเว้น Username/Password ว่างทั้งก่อนและหลังจับคู่ เมื่อ Admin เลือก Site และยืนยัน ระบบจะเปิดรับเฉพาะ route ของ Gateway/Device ที่อนุมัติทันที ไม่ต้องคัดลอก credential หรือรอ Gateway apply config โหมดนี้เหมาะกับเครือข่ายสาธิตที่ควบคุมได้เท่านั้น เพราะ Client ID ไม่ใช่ความลับและปลอมแปลงได้ ก่อน production ให้เปลี่ยนกลับเป็น `credential`

ตัวอย่างในเอกสารใช้:

- Site ID ที่อ้างจากเครื่อง: `SITE-001`
- Gateway ID ที่อ้างจากเครื่อง: `GW-001`
- Gateway Serial: `GW-SN-A1B2C3D4`
- Device ID ที่อ้างจากเครื่อง: `SMARTLOGGER-001`
- Device Serial: `2102312FAP10XXXXXXXX`

`siteId`, `gatewayId` และ `deviceId` เป็นรหัสที่ Gateway อ้าง (claimed IDs) ส่วน `gatewaySerial` และ `deviceSerial` เป็นตัวตนของอุปกรณ์จริงเมื่อส่งมา ระบบจะไม่ถือว่ารหัสที่อ้างคือการผูกกับข้อมูลในระบบจนกว่า Admin จะยืนยัน

## ไฟล์ตัวอย่าง

- [MQTT_Payload_Examples_v1.2.json](./MQTT_Payload_Examples_v1.2.json) — PM2230 และ SmartLogger3000A พร้อม Serial
- ไฟล์ schema `1.1` เดิมใช้ได้ทั้ง Gateway/Device ที่ผูกไว้แล้วและการค้นหาอุปกรณ์ใหม่แบบไม่มี Serial

ถ้าส่ง Serial ต้องส่ง `gatewaySerial` และ `deviceSerial` ให้ครบคู่ ระบบจะแยก candidate ด้วย Serial ถ้าไม่ส่งทั้งคู่ ระบบจะใช้ `gatewayId` และ `deviceId` เป็นตัวตนชั่วคราว Candidate แบบไม่มี Serial จะไม่ถูกรวมกับ Candidate แบบมี Serial แม้ `gatewayId` จะเหมือนกัน

ค่าตัวอย่างเป็น logical telemetry เท่านั้น ไม่ใช่ register map ที่ยืนยันสำหรับฮาร์ดแวร์จริง ก่อนใช้งานจริงต้องตรวจ register address, data type, byte/word order, scale และ unit จากเอกสารผู้ผลิต

## Topic และลำดับสถานะ

Gateway publish telemetry ที่:

```text
solar/v1/sites/{siteId}/gateways/{gatewayId}/devices/{deviceId}/telemetry
```

ตัวอย่าง:

```text
solar/v1/sites/SITE-001/gateways/GW-001/devices/SMARTLOGGER-001/telemetry
```

ในโหมดสาธิต สถานะหลักในหน้า Admin เดินตามวงจร:

```text
ยังไม่เชื่อมต่อ → ออนไลน์ → ออฟไลน์
```

- **ยังไม่เชื่อมต่อ** — พบ Serial จาก telemetry แล้ว แต่ Admin ยังไม่ได้ผูก Site/Gateway/Device
- **กำลังเชื่อมต่อ** — ใช้เฉพาะโหมด `credential` ขณะรอ Gateway รับ credential/config
- **ออนไลน์** — Gateway apply config และส่งข้อมูลล่าสุดภายในช่วงเวลาที่กำหนด
- **ออฟไลน์** — เคยเชื่อมต่อแล้ว แต่ไม่มีข้อมูลล่าสุดหรือส่ง offline status

## 1. ตรวจความพร้อมของระบบ

1. ตรวจ `GET http://127.0.0.1:3001/ready/mqtt` ต้องได้ HTTP `200`, `status: ready` และ `readyBrokers` เท่ากับ `configuredBrokers`
2. API ต้อง subscribe QoS 1 จำนวน 4 เส้น:

   ```text
   solar/v1/gateways/+/configUpdate
   solar/v1/gateways/+/configStatus
   solar/v1/gateways/+/status
   $solar/internal/telemetry/+/solar/v1/sites/+/gateways/+/devices/+/telemetry
   ```

   เส้นสุดท้ายเป็นเส้น private ที่ EMQX republish ให้ API Gateway ยังคง publish ที่ canonical telemetry Topic ตามข้อ 2 และห้าม publish `$solar/internal/...` เอง

3. ตั้ง MQTT client ไปยัง broker ที่ระบบกำหนด เช่น host `mqtt-solar.fowir.com`, port `8883`, เปิด TLS และตรวจ CA/hostname ห้ามปิด certificate validation
4. ใช้ QoS `1`, Retain `false` สำหรับ telemetry

## 2. First contact เพื่อค้นหา Gateway

ตั้งค่า MQTT client:

```text
Client ID: GW-001 หรือ GW-SN-A1B2C3D4
Username:  เว้นว่าง
Password:  เว้นว่าง
Clean session: เปิดสำหรับการทดสอบ
```

แนะนำให้ Client ID เท่ากับ `gatewaySerial` เมื่อส่ง Serial และเท่ากับ `gatewayId` เมื่อไม่ส่ง Serial โดยต้องประกอบด้วย `A-Z`, `a-z`, `0-9`, `_` หรือ `-` ไม่เกิน 128 ตัวอักษร ระบบค้นหาอุปกรณ์จาก payload/Topic และไม่บังคับให้ Client ID ตรงกับ Serial

ระบบจำกัด discovery ไม่เกิน 128 Device Serial ต่อ Gateway Serial, ไม่เกิน 12 การเปลี่ยนแปลงหลักฐานต่อนาทีต่อ Gateway/ต้นทาง และเก็บ snapshot ล่าสุด 100 รายการ เพื่อไม่ให้ first-contact traffic ขยายข้อมูลได้ไม่จำกัด

Publish ไปที่:

```text
solar/v1/sites/SITE-001/gateways/GW-001/devices/SMARTLOGGER-001/telemetry
```

ตัวอย่าง payload แบบมี Serial ที่ระบบค้นหาได้:

```json
{
  "schemaVersion": "1.2",
  "messageType": "telemetry",
  "messageId": "GW-SN-A1B2C3D4-000001",
  "sequence": 1,
  "lotNumber": 1,
  "siteId": "SITE-001",
  "gatewayId": "GW-001",
  "gatewaySerial": "GW-SN-A1B2C3D4",
  "device": {
    "deviceId": "SMARTLOGGER-001",
    "deviceSerial": "2102312FAP10XXXXXXXX",
    "deviceType": "solar-logger",
    "manufacturer": "Huawei",
    "model": "SmartLogger3000A",
    "profileId": "huawei-smartlogger3000a",
    "profileVersion": "1.0.0",
    "protocol": "modbus-tcp"
  },
  "pollGroup": "plant",
  "timestamps": {
    "polledAt": "2026-10-21T10:00:00.125+07:00",
    "sentAt": "2026-10-21T10:00:00.320+07:00"
  },
  "data": {
    "values": { "solar.active_power": 820400 },
    "units": { "solar.active_power": "W" }
  },
  "quality": {
    "status": "good",
    "communication": "online"
  }
}
```

ถ้า Gateway ยังไม่ส่ง Serial ให้ใช้ payload เดิมเป็น schema `1.1` แล้วละสองฟิลด์นี้ออก โดย Topic ไม่เปลี่ยน:

```json
{
  "schemaVersion": "1.1",
  "messageType": "telemetry",
  "messageId": "GW-001-000001",
  "sequence": 1,
  "lotNumber": 1,
  "siteId": "SITE-001",
  "gatewayId": "GW-001",
  "device": {
    "deviceId": "SMARTLOGGER-001",
    "deviceType": "solar-logger",
    "manufacturer": "Huawei",
    "model": "SmartLogger3000A",
    "profileId": "huawei-smartlogger3000a",
    "profileVersion": "1.0.0",
    "protocol": "modbus-tcp"
  },
  "pollGroup": "plant",
  "timestamps": {
    "polledAt": "2026-10-21T10:00:00.125+07:00",
    "sentAt": "2026-10-21T10:00:00.320+07:00"
  },
  "data": {
    "values": { "solar.active_power": 820400 },
    "units": { "solar.active_power": "W" }
  },
  "quality": { "status": "good", "communication": "online" }
}
```

รายการนี้จะอยู่ใน **ยังไม่เชื่อมต่อ** และเปิด Pairing ได้ ผู้ดูแลสามารถกรอก Serial จริงและข้อมูล connection/mapping ในขั้นตั้งค่าได้โดยไม่ต้องแก้ payload เพื่อเริ่มต้น

กฎสำคัญ:

- `siteId`, `gatewayId` และ `device.deviceId` ใน Topic ต้องตรงกับ payload
- schema `1.2` ต้องมี `gatewaySerial` และ `device.deviceSerial` ครบคู่
- schema `1.1` สามารถละ Serial ทั้งคู่ได้; ห้ามส่งมาเพียงค่าเดียว
- Retry ข้อความเดิมต้องใช้ `messageId`, `sequence` และ `lotNumber` เดิม
- ข้อความใหม่ต้องใช้ `messageId` ใหม่และเพิ่ม `sequence`/`lotNumber`
- Anonymous client publish ได้เฉพาะ telemetry Topic แบบเต็ม ห้าม wildcard, subscribe, control หรือ `/register`
- First contact เป็นหลักฐานรออนุมัติ ระบบยังไม่บันทึกเป็น production sample, ไม่คำนวณ billing และไม่ส่ง `dataAcept`

ผลที่ต้องเห็นในหน้า Admin → จัดการเกตเวย์:

- Tab **ยังไม่เชื่อมต่อ** มี Gateway ตาม `gatewaySerial` หรือ `gatewayId` เมื่อไม่มี Serial
- Device ที่ Serial เดิมแต่ส่งหลาย poll group จะรวมเป็น Device เดียว
- Device Serial ใหม่ภายใต้ Gateway Serial เดิมจะเพิ่มใน candidate เดิม
- การกดแถวเปิดขั้นตอนตั้งค่าได้โดยตรง

### Gateway เดียวที่มี Logger และ Meter

อุปกรณ์หลายตัวจะรวมเป็น Gateway candidate เดียวเมื่อทุกข้อความมี `gatewaySerial` เดียวกัน หรือใช้ `gatewayId` เดียวกันในโหมดไม่มี Serial ตัวอย่างต่อไปนี้จึงนับเป็น Gateway เดียวที่มีสอง Device:

```text
solar/v1/sites/SITE-001/gateways/GW-001/devices/SMARTLOGGER-001/telemetry
solar/v1/sites/SITE-001/gateways/GW-001/devices/SPM91-01/telemetry
```

- แบบมี Serial: ทั้งสอง payload ใช้ `gatewaySerial: "GW-SN-A1B2C3D4"`
- SmartLogger ใช้ `deviceSerial` ของ Logger
- SPM91-01 ใช้ `deviceSerial` ของ Meter ซึ่งต้องต่างจาก Logger
- แบบไม่มี Serial: ทั้งสอง payload ละ Serial และใช้ `gatewayId: "GW-001"`; ระบบแยก Device ด้วย `deviceId`
- หน้า Admin จะแสดงหนึ่ง Gateway candidate พร้อม Device สองตัวให้ตรวจและตั้งค่า
- หลัง Admin ผูก Site/Gateway และเปิดใช้งาน Device ทั้งสอง telemetry บน route ที่อนุมัติจะเข้าสู่ production ingestion และ flow ตรวจสอบความถูกต้องเดิมตาม profile/mapping ของแต่ละ Device ทันที

หากส่งเพียงอุปกรณ์ใดอุปกรณ์หนึ่ง ระบบจะรู้จักเฉพาะอุปกรณ์ที่มีหลักฐาน telemetry แล้วเท่านั้น อุปกรณ์ตัวที่สองจะถูกเพิ่มใน candidate เดิมเมื่อส่ง telemetry ด้วย identity mode เดียวกัน

## 3. กรณีรหัสใน Topic ซ้ำ

ระบบตรวจ binding ที่ Admin อนุมัติก่อน ถ้า route ตรงกับ Gateway/Device ที่ผูกแล้วจะรับเป็น production telemetry ถ้ายังไม่ผูกจะสร้างรายการ **ยังไม่เชื่อมต่อ**:

- Gateway ID หรือ Device ID ซ้ำ แต่ Serial ยังไม่เคยผูก → ยังคงอยู่ **ยังไม่เชื่อมต่อ**
- ไม่มี Serial และ route ยังไม่เคยผูก → อยู่ **ยังไม่เชื่อมต่อ** และเปิดตั้งค่าได้
- ไม่มี Serial แต่ route ตรงกับ binding เดิมทุกค่า → ใช้ binding เดิม เพราะไม่มีข้อมูลพอจะแยกฮาร์ดแวร์อีกเครื่อง
- Serial เดิมส่งรหัสที่อ้างเปลี่ยน → อัปเดต candidate เดิมและเพิ่ม discovery revision
- Gateway ID ที่อ้างชนกับ Gateway ที่ผูกแล้วแต่ Serial คนละตัว → แสดง identity conflict และไม่ผูกอัตโนมัติ
- ก่อนยืนยัน ให้ผู้ดูแล Gateway แก้ claimed Gateway ID/Device ID ให้ไม่ชน แล้ว publish schema `1.2` ใหม่ด้วย Serial เดิม ระบบจะอัปเดต candidate เดิม

ห้ามแก้ collision ด้วยการเปลี่ยน Serial เพราะ Serial ต้องเป็นค่าถาวรจากเครื่องจริง

## 4. Admin จับคู่ Site และ Device

กดแถวใน Tab **ยังไม่เชื่อมต่อ** แล้วทำ 3 ขั้นตอน:

1. ตรวจข้อมูล Gateway และเลือก Site จริง ค่า Admin เป็น authoritative
2. ตรวจ Device Serial, รุ่น, ประเภท และ mapping; ห้ามเดา register mapping ที่ไม่มีข้อมูล
3. ยืนยันและเริ่มรับข้อมูล

เมื่อยืนยันสำเร็จ ระบบจะ:

- บันทึก `gatewaySerial` และ `deviceSerial` เมื่อ payload ส่งมา; ถ้าไม่มีจะใช้ claimed IDs เป็น identity
- ไม่สร้างหรือแสดง Username/Password
- เปิด Gateway และ config revision ที่ตรวจแล้วเป็น active ทันที
- อนุญาตเฉพาะ Topic ของ Site/Gateway/Device ที่ Admin ยืนยัน
- publish retained config QoS 1 ไปที่ `solar/v1/gateways/GW-001/config` ได้ตามเดิม เพื่อให้ Gateway รุ่นที่รองรับนำไปใช้ แต่ไม่ใช้เป็นเงื่อนไขเริ่มรับ telemetry ในโหมดสาธิต

Gateway ต้อง publish ต่อด้วยรหัส `siteId`, `gatewayId` และ `deviceId` ที่ตรงกับ route ที่ Admin อนุมัติ หาก Admin เลือก Site คนละรหัสกับที่เครื่องกำลังส่ง Gateway ยังต้องรับ config หรือเปลี่ยน route ให้ตรงก่อนจึงจะรับเป็น production telemetry ได้

## 5. ส่งข้อมูลต่อโดยไม่ต้อง provision Gateway

ไม่ต้อง disconnect หรือแก้บัญชี MQTT หลังจับคู่ ให้ใช้ค่าต่อไปนี้ต่อเนื่อง:

```text
Client ID: GW-SN-A1B2C3D4 หรือ GW-001 ตาม identity ที่ใช้ตอนยืนยัน
Username:  เว้นว่าง
Password:  เว้นว่าง
```

ตั้ง Last Will retained QoS 1 ก่อน CONNECT ที่:

```text
solar/v1/gateways/GW-001/status
```

ตั้งค่า status ทุกครั้งด้วย QoS 1 และ Retain เปิด (`retain = true`) โดยใช้ `sessionId` คงที่ตลอดหนึ่ง boot แต่สร้าง `messageId` และ `reportedAt` เป็นค่าใหม่ทุกครั้ง ห้าม reuse `messageId` หรือ `reportedAt` ข้าม publication หรือ reconnect:

- graceful disconnect: publish `offline`, รอ PUBACK แล้วจึงส่ง DISCONNECT
- abnormal disconnect: ให้ Last Will ส่ง `offline`
- reconnect: subscribe config และรอ SUBACK สำเร็จก่อน publish `online`

Gateway สามารถทำรายการต่อไปนี้ได้ แต่ข้อ 1–3 ไม่ใช่เงื่อนไขเปิดรับ telemetry ในโหมดสาธิต:

1. Subscribe QoS 1 ที่ `solar/v1/gateways/GW-001/config`
2. รับ retained config และตรวจ `configVersion`/`configHash`
3. Publish `configStatus: received`/`applied` ไปที่ `solar/v1/gateways/GW-001/configStatus` ถ้ารองรับ
4. Subscribe `solar/v1/sites/SITE-001/gateways/GW-001/dataAcept`
5. Publish telemetry schema `1.2` ต่อบน Topic เดิม

หลังผูกแล้วระบบรับทั้ง schema `1.1` และ `1.2` ต่อเนื่อง ถ้าเริ่มแบบไม่มี Serial แล้วต้องการเปลี่ยนเป็น Serial ภายหลัง ให้สร้าง/ตรวจ candidate แบบ Serial แยกและให้ Admin ยืนยันอย่างตั้งใจ ระบบจะไม่รวมสอง identity mode อัตโนมัติ

## 6. Checklist ทดสอบครบ Flow

- [ ] Anonymous Client ID เป็นรหัสที่ถูกต้อง; แนะนำ Serial เมื่อมี และ Gateway ID เมื่อไม่มี
- [ ] ไม่มีการ publish หรือ subscribe `/register`
- [ ] Topic กับ `siteId`/`gatewayId`/`deviceId` ใน payload ตรงกัน
- [ ] Serial มีครบคู่หรือไม่มีทั้งคู่
- [ ] Gateway ปรากฏใน **ยังไม่เชื่อมต่อ** และกดแถวแล้วเปิดตั้งค่าได้
- [ ] Duplicate claimed ID ไม่ถูกผูกอัตโนมัติ
- [ ] Local API ตั้ง `GATEWAY_AUTH_MODE=demo-anonymous`
- [ ] หลังยืนยัน UI ไม่แสดง credential/ปุ่มหมุน credential และ Gateway เป็น active ทันที
- [ ] Gateway ยังใช้ Client ID เดิม พร้อม Username/Password ว่าง
- [ ] Config รับผ่าน exact Gateway control Topic ได้ถ้า Gateway รองรับ (ไม่บังคับใน demo)
- [ ] Telemetry หลังผูกแล้วได้รับ `dataAcept`
- [ ] หยุดส่งเกิน freshness window แล้วสถานะเดียวเปลี่ยนเป็น **ออฟไลน์**

## 7. Troubleshooting

**Connect ได้แต่ไม่พบแถว**

- ตรวจ `/ready/mqtt`
- ตรวจ Topic แบบเต็มและค่ารหัสตรง payload
- ตรวจ schema `1.1`/`1.2`, Topic และ claimed IDs ให้ตรงกัน
- ถ้าใช้ schema `1.2` ตรวจว่ามี Serial ครบทั้งสองค่า

**พบแถวแต่กดตั้งค่าไม่ได้**

- publish telemetry ใหม่อีกครั้งและตรวจว่า Topic ตรงกับ payload
- หากมี identity conflict ให้แก้ claimed ID บน Gateway แล้ว publish ใหม่ด้วย Serial เดิม

**มี PUBACK แต่ไม่มี `dataAcept`**

- First contact จะไม่ ACK โดยตั้งใจ
- หลังยืนยันไม่ต้อง reconnect; ตรวจว่า Topic ใช้ Site/Gateway/Device ตรงกับ route ที่ Admin อนุมัติ และ subscribe exact `dataAcept` Topic

**Gateway เคยเชื่อมต่อแล้วแต่ anonymous connect ไม่ได้**

- ตรวจว่า API รันด้วย `GATEWAY_AUTH_MODE=demo-anonymous` และรีสตาร์ต process หลังเปลี่ยน env
- ตรวจว่า Client ID เท่ากับ Serial (เมื่อมี) หรือ Gateway ID ที่ใช้ยืนยัน
- ถ้าใช้ `GATEWAY_AUTH_MODE=credential` จะต้องใช้ credential ล่าสุดตาม production flow เดิม

## 8. กลับไปใช้โหมดปลอดภัยสำหรับ production

ตั้ง `GATEWAY_AUTH_MODE=credential` แล้วรีสตาร์ต API โหมดนี้จะกลับไปสร้าง Username/Password แยกตาม Gateway, รอ `configStatus: applied` ก่อน active และรองรับการหมุน credential ตามเดิม ห้ามใช้ `demo-anonymous` บน broker สาธารณะหรือ production เพราะผู้ที่ทราบ Client ID อาจปลอมเป็น Gateway ได้
