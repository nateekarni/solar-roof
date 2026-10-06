# ทดสอบ Gateway ด้วย MQTTBOX บน local

**สถานะหลังปรับฟอร์มและล้างข้อมูล 2026-10-05:** ไซต์/Gateway/Telemetry ที่ใช้ทดสอบด้านล่างถูกล้างแล้ว ผู้ใช้และ Preset ยังอยู่ครบ ให้เพิ่มไซต์ใหม่ผ่านเว็บ แล้วใช้ Topic จากหน้าการเชื่อมต่อของไซต์นั้น เปลี่ยน `siteId`, `gatewayId`, `device.deviceId` และ `profileVersion` ในตัวอย่างให้ตรงกับไซต์ใหม่ พร้อม messageId และเวลาชุดใหม่ `connection.json` และหลักฐานด้านล่างเป็นข้อมูลการทดสอบก่อนล้าง ไม่ใช่ไซต์ที่ยังใช้งานอยู่

## Client

| ตั้งค่า | MQTT TCP | MQTT WebSocket |
|---|---|---|
| Protocol | mqtt / tcp | ws |
| Host | localhost | localhost |
| Port | 1883 | 8083 |
| WebSocket path | — | /mqtt |
| MQTT version | 3.1.1 | 3.1.1 |
| Client ID | mqttbox-solar-local-01 (ไม่ซ้ำกับ Client อื่น) | mqttbox-solar-ws-01 |
| Username / Password | เว้นว่าง สำหรับ broker Docker local ชุดนี้ | เว้นว่าง |
| QoS | 1 | 1 |
| Retain | ปิด | ปิด |

`18083` คือ EMQX dashboard สำหรับจัดการ broker ส่วน `8083` คือ MQTT WebSocket ตามที่ Gateway ระบุ ถ้า Gateway ใช้ MQTT TCP ให้ใช้ `1883` การเลือก port ต้องตรงกับ protocol ที่ Gateway ใช้

## ส่งและ Monitor

ไซต์ที่เตรียมผ่านเว็บคือ **MQTTBOX UI Test** (`SITE-MQTTBOX-UI`, Gateway `GW-MQTTBOX-UI`) มิเตอร์ตรึง `schneider-pm2230` **1.0.1** และ Logger ตรึง `huawei-smartlogger3000a` **1.0.0** ตัวอย่าง JSON ด้านล่างตรงกับการตั้งค่านี้

- Monitor ทุกอุปกรณ์: `solar/v1/sites/SITE-MQTTBOX-UI/gateways/GW-MQTTBOX-UI/devices/+/telemetry`
- ACK: `solar/v1/sites/SITE-MQTTBOX-UI/gateways/GW-MQTTBOX-UI/dataAcept`
- Publish PM2230: `solar/v1/sites/SITE-MQTTBOX-UI/gateways/GW-MQTTBOX-UI/devices/METER-MQTTBOX-UI/telemetry`
- Publish Logger: `solar/v1/sites/SITE-MQTTBOX-UI/gateways/GW-MQTTBOX-UI/devices/LOGGER-MQTTBOX-UI/telemetry`

1. ดูไซต์ อุปกรณ์ และ Topic ที่สร้างจริงใน [connection.json](connection.json)
2. เพิ่ม Subscriber สำหรับ `ackTopic` ก่อน Publish เพื่อรับ `dataAcept` และเพิ่ม Subscriber สำหรับ `telemetryTopic` ของอุปกรณ์ที่ต้องการ Monitor
3. Publish JSON ไปยัง `telemetryTopic` ของอุปกรณ์นั้น:
   - [PM2230 realtime](pm2230Realtime.json)
   - [PM2230 energy](pm2230Energy.json)
   - [SmartLogger plant](smartLoggerPlant.json)
   - [SmartLogger environment](smartLoggerEnvironment.json)
4. สำหรับข้อมูลใหม่ ให้เปลี่ยน `messageId` ให้ไม่ซ้ำ, เพิ่ม `sequence` และ `lotNumber` (1–4294967295), ปรับ `timestamps.polledAt`/`sentAt` ให้เป็นเวลาที่เก็บ/ส่งจริงพร้อม timezone เช่น `2026-10-05T21:00:00+07:00` ชื่อไซต์/Gateway/อุปกรณ์ต้องตรงกับ Topic และการลงทะเบียน
5. ถ้าส่งซ้ำเพื่อ retry ให้คง `messageId`, lot และข้อมูลเดิมไว้ เปลี่ยนเฉพาะ `sentAt` ได้ ระบบตอบ ACK แต่ไม่บันทึกค่าซ้ำ ถ้าเปลี่ยนค่าภายใต้ messageId เดิม ระบบจะ reject
6. เปิดหน้าข้อมูล MQTT ของไซต์เพื่อดูค่าราย field, เวลาต้นทาง, คุณภาพ, Preset revision และเหตุผลที่ reject

MQTTBOX แสดงว่าส่งสำเร็จ/QoS PUBACK หมายถึง broker รับข้อความแล้ว ต้องเห็น `dataAcept` ที่ตรงกับ `messageId` จึงยืนยันว่าระบบบันทึกข้อความสำเร็จ

ตัวอย่าง ACK หลัง commit:

```json
{"schemaVersion":"1.1","messageType":"dataAcept","siteId":"<externalSiteId>","gatewayId":"<externalGatewayId>","lotNumber":1258,"messageId":"<messageId ที่ส่ง>","status":"accepted","acceptedAt":"<server time>"}
```

`152430275 Wh` ต้องเป็น `152430.275 kWh` ในระบบ พลังงานนำเข้า PM2230 เป็นค่าที่ใช้กับ billing; export, reactive energy และ yield จาก SmartLogger ไม่ใช้แทนค่าบิล ข้อมูล realtime และ energy มาแยกกันได้โดยไม่ล้างค่ากลุ่มก่อนหน้า

รอบอ่านตามเอกสาร: PM2230 realtime 1 วินาที, energy 5 วินาที, SmartLogger plant 5 วินาที, environment 10 วินาที การกำหนด register address และรอบอ่านแต่ละกลุ่มใน firmware ต้องตรวจจาก register map ของผู้ผลิตจริง Preset นี้รับค่าที่ Gateway แปลงเป็น canonical tag แล้ว

ผลตรวจอัตโนมัติอยู่ใน [evidence.json](evidence.json) และ [durability-evidence.json](durability-evidence.json) ใช้ MQTT client ส่งผ่าน Docker broker จริง รวมถึงส่งพร้อมกัน 16 ครั้งผ่าน TCP และ WebSocket จึงยืนยันเส้นทาง broker → ระบบ → ฐานข้อมูล → ACK ได้ การตรวจนี้ยังไม่ใช่การเชื่อม Gateway/PM2230 ผ่าน Modbus ทางกายภาพ และไม่รับรอง Cloud TLS

## รันทดสอบซ้ำ

ตั้ง `PAYLOAD_TEST_PASSWORD` เป็นรหัสผู้ดูแล local ที่มีอยู่ แล้วรัน `apps/api/src/scripts/verify-payload-gateway.ts` ผ่าน tsx หากต้องการใช้ไซต์ทดสอบเดิมให้ตั้ง `PAYLOAD_TEST_SITE_ID` จาก connection.json ชุดทดสอบจะเก็บไซต์ไว้ และไม่ reset ฐานข้อมูลหรือสร้างเอกสารการเงิน

Canonical profiles/messages/samples เก็บแยกจาก raw telemetry เพื่อรักษาเวอร์ชันและค่าต้นฉบับ ปัจจุบันยังไม่มี auto archive/purge สำหรับตารางใหม่เหล่านี้ ส่วน envelope คนละมาตรฐานหรือการแปลงหน่วยนอกตัวเลือกที่รองรับยังต้องเพิ่ม adapter/conversion ในระบบ

รายละเอียดการตรวจผ่านเว็บ การเพิ่มฟิลด์ใน revision ใหม่ และข้อจำกัดอยู่ใน [verification-report.md](verification-report.md) และ [revision-evidence.json](revision-evidence.json)
