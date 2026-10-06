# ทดสอบ Payload มิเตอร์และ SmartLogger

ระบบรองรับข้อความ telemetry เดี่ยว หรือ JSON ที่มี `payloads` เป็น object/array (สูงสุด 32 รายการ) โดยตรวจและบันทึกแต่ละรายการแยกกัน ข้ามตัวอย่าง `dataAcept` และส่งคำยืนยันหลัง commit เท่านั้น ข้อความหนึ่งผิดไม่ทำให้ข้อความอื่นถูกทิ้ง การส่งซ้ำด้วย messageId และข้อมูลเดิมส่งคำยืนยันเดิมโดยไม่เพิ่มข้อมูลซ้ำ

## ตั้งค่า Site 020

1. เปิดแก้ไขไซต์ → การรับข้อมูลและอุปกรณ์
2. ในข้อมูลไซต์และ Gateway เลือก Broker `mqtt://184.82.29.241:1883` และเก็บ Topic รับข้อมูลเป็น `solar/v1/sites/SITE-TEST-001/gateways/GW-TEST-001/devices/+/telemetry`
3. เพิ่มอุปกรณ์ / SmartLogger: ชื่อ Huawei SmartLogger3000A, ซีเรียลจริงของอุปกรณ์, รหัสรับข้อมูล `SMARTLOGGER-001`, โปรไฟล์ `huawei-smartlogger3000a` เวอร์ชัน `1.0.0` หรือเวอร์ชันที่ใช้งานจริง SmartLogger ไม่ใช่มิเตอร์คิดบิล
4. ตั้งรูปแบบ Payload:

| การตั้งค่า | ค่า |
|---|---|
| ตำแหน่งชุดข้อความใน JSON | `payloads` |
| รหัสไซต์ที่มากับ Payload | `SITE-001` |
| รหัสเกตเวย์ที่มากับ Payload | `GW-001` |
| รหัสอุปกรณ์ใน Payload | `METER-001` |
| อุปกรณ์ที่ลงทะเบียน | `METER-TEST-001` |
| รหัสโปรไฟล์ที่มากับ Payload | `schneider-pm2230` |
| เวอร์ชันโปรไฟล์ที่มากับ Payload | `1.0.0` |

โปรไฟล์ปลายทางของมิเตอร์ปัจจุบันคือ `schneider-pm2230 · 1.0.1` ระบบเปลี่ยนการอ้างอิงเฉพาะคู่ที่ตั้งไว้ แต่ยังตรวจหน่วย กลุ่มข้อมูล และชนิดอุปกรณ์ตามโปรไฟล์ปลายทาง หาก SmartLogger เลือกเวอร์ชันอื่น ให้เพิ่มการจับคู่ `SMARTLOGGER-001 → SMARTLOGGER-001` และคู่โปรไฟล์ `huawei-smartlogger3000a · 1.0.0` ไปยังเวอร์ชันที่เลือก

5. วางไฟล์ JSON จากผู้ดูแล Gateway ลงช่องทดสอบและกดตรวจสอบ JSON ต้องได้ผ่าน 4 ไม่ผ่าน 0 ข้ามคำยืนยัน 1 จากนั้นบันทึกการตั้งค่ารับข้อมูล การทดสอบ JSON เองไม่บันทึก telemetry หรือส่ง ACK

## สร้างไซต์และตั้งค่าครั้งเดียว

ในขั้นตั้งค่า Gateway ของหน้าเพิ่มไซต์ เลือก Broker และโปรไฟล์มิเตอร์หลัก ระบุรหัสไซต์/Gateway/อุปกรณ์และซีเรียลจริง จากนั้นเพิ่ม SmartLogger หรือมิเตอร์เพิ่มเติมทุกตัวพร้อมโปรไฟล์ หากรหัสใน JSON ต่างจากรหัสที่ลงทะเบียน ให้ตั้งการจับคู่ในขั้นเดียวกัน ส่วนตำแหน่งฟิลด์ JSON ใช้เฉพาะเมื่อชื่อฟิลด์ไม่ใช่มาตรฐาน

Topic รับข้อมูลแบบ `devices/+/telemetry` ครอบคลุมทุกอุปกรณ์ใน Gateway ส่วน Topic ส่งต้องใช้รหัสอุปกรณ์จริง ตรวจ JSON ก่อนสร้างได้โดยไม่บันทึกข้อมูล เมื่อกดบันทึกครั้งสุดท้าย ไซต์ อุปกรณ์ และการตั้งค่ารับข้อมูลจะถูกบันทึกพร้อมกัน ถ้ารายการใดผิดจะยกเลิกทั้งรายการ

หน้ารายละเอียดแสดง Broker/Topic อุปกรณ์ โปรไฟล์ ฟิลด์/หน่วย/การแปลง การจับคู่ JSON และประวัติข้อมูลที่ได้รับ ค้นหาได้ด้วยอุปกรณ์ ฟิลด์ หรือ Message ID กรองวันที่ตามเวลารับใน Asia/Bangkok และแบ่งหน้า 50 รายการ

## ส่งจาก MQTTBox

- Host `184.82.29.241`, MQTT/TCP พอร์ต `1883`; บัญชีตาม Broker ที่ตั้งไว้ พอร์ต `18083` เป็น Dashboard
- Subscribe ก่อน Publish:
  - `solar/v1/sites/SITE-TEST-001/gateways/GW-TEST-001/devices/+/telemetry`
  - `solar/v1/sites/SITE-TEST-001/gateways/GW-TEST-001/dataAcept`
- Publish ไป `solar/v1/sites/SITE-TEST-001/gateways/GW-TEST-001/devices/METER-TEST-001/telemetry` ไม่มี `+` หรือ `#`
- QoS 1, Retain ปิด วางเฉพาะ JSON ไม่รวมบรรทัด `topic:..., qos:..., retain:...` ใน log
- สามารถส่งไฟล์ที่มี `description/topics/payloads/notes` ได้ทั้งชุดเมื่อการจับคู่ถูกต้อง ระบบประมวลผลเฉพาะ telemetry ใน `payloads`

ไฟล์เดิมมีเวลา 5 ตุลาคม 2026 ระบบรับเป็นประวัติและตอบ ACK แต่จะไม่เปลี่ยนสถานะเป็นออนไลน์ การทดสอบออนไลน์ต้องเปลี่ยน `timestamps.polledAt` และ `sentAt` ทั้ง 4 ข้อความเป็นเวลาปัจจุบันที่มี timezone และใช้ messageId/sequence/lotNumber ใหม่สำหรับข้อมูลใหม่ อย่าเปลี่ยนเวลาหรือค่าของ messageId ที่เคยบันทึกแล้ว; retry ใช้ข้อมูลเดิมและ IDs เดิม

อีกทางคือรีเฟรชหน้าเว็บและคัดลอก JSON แบบชุดที่ระบบสร้างให้ ครบทุกฟิลด์และกลุ่มของอุปกรณ์ที่ลงทะเบียน ใช้รหัสและเวอร์ชันปลายทางตรงแล้ว จึงไม่ต้องแก้ IDs แต่ค่าจำลอง `1` เป็นข้อมูลทดสอบ ไม่ใช่ค่ามิเตอร์จริง

## ผลที่ควรเห็น

- telemetry subscriber เห็น JSON: ยืนยันเพียงว่า Broker แจกจ่ายข้อความ
- dataAcept subscriber ได้ 4 ข้อความ `status: accepted` ตรง messageId และ lotNumber ของ Telemetry ทั้ง 4 รายการ: ยืนยันระบบบันทึกแล้ว
- มิเตอร์เก็บ realtime 14 ฟิลด์ + energy 4 ฟิลด์; SmartLogger เก็บ plant 4 + environment 4 รวม 26 ฟิลด์สำหรับไฟล์นี้
- `152430275 Wh` แสดงเป็น `152430.275 kWh` ตามโปรไฟล์มิเตอร์
- เว็บอัปเดตสถานะเมื่อได้รับข้อมูลที่เวลาต้นทางสด หากไม่ครบดูข้อความที่ปฏิเสธ; อุปกรณ์ที่ไม่ลงทะเบียนหรือโปรไฟล์ไม่ตรงจะไม่ได้ ACK accepted

## ปรับรูปแบบภายหลัง

เปลี่ยนตำแหน่งชุดข้อความ หรือเปิดขั้นสูงเพื่อจับคู่ JSON path เช่น `{"messageId":"id","device.deviceId":"meter.id","data.values":"measurements.values"}` Path อ้างจากแต่ละข้อความ ยังคงต้องมีค่าที่จำเป็นและหน่วยครบ การเปลี่ยนการตั้งค่าบันทึกเป็นเวอร์ชันใหม่ ประวัติข้อความเก็บเวอร์ชันการตั้งค่ารับข้อมูลและข้อมูลต้นทางไว้ แก้ฟิลด์/หน่วยผ่านโปรไฟล์เวอร์ชันใหม่ แล้วอัปเกรดอุปกรณ์โดยชัดเจน

## ตรวจสอบสำหรับนักพัฒนา

Migration: `pnpm db:migrate`

Tests: `node_modules/.bin/tsx.cmd --tsconfig apps/api/tsconfig.json --test apps/api/src/modules/telemetry/payload-receive.spec.ts apps/api/src/modules/telemetry/payload-bundle-mqtt.spec.ts apps/api/src/modules/telemetry/payload-reception-settings.spec.ts`

Integration (local PostgreSQL and local MQTT 1883): `$env:PAYLOAD_RECEIVE_INTEGRATION='true'; node_modules/.bin/tsx.cmd --tsconfig apps/api/tsconfig.json --test apps/api/src/modules/telemetry/payload-receive.integration.spec.ts`

Integration creates and removes a uniquely named isolated database schema. It verifies 4 ACKs, 26 stored samples, unit conversion, gateway freshness, partial rejection and replay after receive settings changes without changing saved sites or publishing to the external broker.

## ตั้งค่าจาก Payload ตัวอย่าง

หน้าเพิ่มไซต์: กรอกข้อมูลไซต์และเลือก Broker → วาง Topic Publish และ JSON → อ่านค่าจากตัวอย่าง → ตรวจอุปกรณ์ที่ค้นพบ เติมซีเรียลและเลือกมิเตอร์คิดบิล → ตรวจสอบข้อมูลที่ตรวจพบ → ยืนยันใช้ค่า → Tab ทดสอบการใช้งาน → บันทึกไซต์

ข้อความหลายกลุ่มของอุปกรณ์เดียวกันรวมเป็นอุปกรณ์เดียว ระบบเลือกเฉพาะโปรไฟล์เวอร์ชันตรงกัน หากไม่พบต้องเลือกเองและตรวจ JSON ก่อนใช้ค่า รหัสต่างกันระหว่าง Topic และ JSON จะเสนอการจับคู่ ข้อมูลตัวอย่างไม่ถูกบันทึกเป็น Telemetry

หน้าแก้ไข: Tab การรับข้อมูลและอุปกรณ์ ใช้การนำเข้าแบบเดียวกัน โดยคงรหัสและโปรไฟล์ของอุปกรณ์เดิม รวมทั้งมิเตอร์คิดบิล การเพิ่มอุปกรณ์และบันทึกการจับคู่ทำใน transaction เดียว

แม่แบบเก็บเฉพาะค่าตั้งค่าในเบราว์เซอร์ปัจจุบัน ไม่เก็บซีเรียลหรือค่ามิเตอร์ ก่อนใช้กับไซต์อื่นต้องตรวจรหัส เติมซีเรียลและทดสอบ JSON ของไซต์นั้นอีกครั้ง
