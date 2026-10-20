# คู่มือเชื่อมต่อ Gateway กับ Solar Platform ผ่าน MQTT เวอร์ชัน 1.1

เอกสารนี้เป็นข้อตกลงสำหรับทีมพัฒนา Gateway ใช้เชื่อมต่อกับ Solar Platform ตั้งแต่ลงทะเบียนเครื่องครั้งแรก รับการตั้งค่าที่ Admin อนุมัติ รายงานสถานะ ส่ง telemetry และรอผลยืนยันการบันทึกข้อมูล เพื่อนำข้อมูลไปใช้ในระบบและออกเอกสาร

ข้อตกลงนี้ใช้ชื่อ `dataAcept` ตาม protocol 1.1 เดิม แม้ตัวสะกดจะไม่ใช่ `dataAccept` และใช้ `configStatus` แทน `configAck`

> ตัวอย่างทั้งหมดใช้รหัสและค่าจำลอง ห้ามนำ password, `configHash`, Register Address หรือข้อมูลอุปกรณ์ในตัวอย่างไปใช้กับเครื่องจริง Gateway ต้องใช้ค่าจาก `config` ที่ระบบส่งให้หลัง Admin อนุมัติ

## 1 ข้อมูลเชื่อมต่อ MQTT

| รายการ | ค่า |
| --- | --- |
| Broker host | `mqtt-solar.fowir.com` |
| Port ภายนอก | `8883` |
| URL | `mqtts://mqtt-solar.fowir.com:8883` |
| Transport | MQTT over TLS |
| TLS | TLS 1.2 หรือ 1.3 และต้องตรวจ certificate chain กับ hostname |
| QoS | `1` ทุก topic ในเอกสารนี้ |
| Payload | UTF-8 JSON |
| Schema version | `1.1` |
| Payload สูงสุด | 128 KiB ต่อ MQTT message |
| JSON nesting | ไม่เกิน 16 ระดับ |

ห้ามปิดการตรวจ certificate หรือเลือก ignore certificate error บนเครื่องจริง Port `1883` ใช้เฉพาะ private network ระหว่าง service และไม่ใช่ port สำหรับ Gateway ภายนอก ส่วน Dashboard ไม่ใช่ MQTT listener

### 1.1 รูปแบบรหัส

- `gatewayId`, `deviceId` และ External Site ID ใช้อักษรอังกฤษ ตัวเลข `_` หรือ `-` ความยาว 1 ถึง 128 ตัวอักษร
- MQTT Client ID ต้องเท่ากับ `gatewayId` เสมอ
- หลัง Admin อนุมัติ MQTT Username ต้องเท่ากับ `gatewayId`
- `messageId` ต้องไม่ซ้ำในขอบเขตข้อความชนิดนั้น ความยาวไม่เกิน 256 ตัวอักษร
- Timestamp ใช้ ISO 8601 พร้อม timezone เช่น `2026-10-20T15:30:00.125+07:00` หรือ UTC ที่ลงท้ายด้วย `Z`

### 1.2 Credential สองระยะ

**ก่อน Admin อนุมัติ**

- Client ID: `gatewayId`
- Username: ว่าง
- Password: ว่าง
- Publish ได้เฉพาะ topic `register` ของ Gateway ตัวเอง
- Subscribe ไม่ได้ทุก topic

**หลัง Admin อนุมัติ**

- Client ID: `gatewayId`
- Username: `gatewayId`
- Password: ค่าที่ระบบออกให้ครั้งเดียวในหน้า Admin
- Gateway ต้องบันทึก password ใน secret storage ก่อนปิดหน้าต่าง เพราะระบบไม่แสดง plaintext ซ้ำ
- ถ้าหมุน credential รหัสเดิมและ session เดิมจะถูกยกเลิก ต้อง reconnect ด้วยรหัสใหม่

## 2 Topic ทั้งหมด

| หน้าที่ | Topic | Publisher | Subscriber | QoS | Retain |
| --- | --- | --- | --- | --- | --- |
| ลงทะเบียนครั้งแรก | `solar/v1/gateways/{gatewayId}/register` | Gateway ที่ยังไม่ลงทะเบียน | Cloud | 1 | ปิด |
| รับค่าตั้งที่ Admin อนุมัติ | `solar/v1/gateways/{gatewayId}/config` | Cloud | Gateway ที่ยืนยันตัวตนแล้ว | 1 | เปิด |
| เสนอค่าตั้งใหม่ | `solar/v1/gateways/{gatewayId}/configUpdate` | Gateway ที่ active | Cloud | 1 | ปิด |
| รายงานผลรับและใช้ค่าตั้ง | `solar/v1/gateways/{gatewayId}/configStatus` | Gateway ที่ยืนยันตัวตนแล้ว | Cloud | 1 | ปิด |
| รายงาน online หรือ offline | `solar/v1/gateways/{gatewayId}/status` | Gateway หรือ Last Will | Cloud | 1 | เปิด |
| ส่งข้อมูลอุปกรณ์ | `solar/v1/sites/{siteId}/gateways/{gatewayId}/devices/{deviceId}/telemetry` | Gateway ที่ active | Cloud | 1 | ปิด |
| รับผลยืนยันบันทึกข้อมูล | `solar/v1/sites/{siteId}/gateways/{gatewayId}/dataAcept` | Cloud | Gateway ที่ active | 1 | ปิด |

ไม่มี topic ต่อไปนี้ใน protocol ใหม่:

```text
solar/v1/gateways/{gatewayId}/configAck
solar/v1/sites/{siteId}/gateways/{gatewayId}/status
solar/v1/sites/{siteId}/gateways/{gatewayId}/config
```

Gateway ห้าม Publish ไป topic ที่มี wildcard `+` หรือ `#` และห้าม Subscribe ข้าม Gateway หรือ Site ของตนเอง

Cloud backend ต้องพร้อมและ Subscribe QoS 1 ครบห้า filter ต่อ Broker:

```text
solar/v1/gateways/+/register
solar/v1/gateways/+/configUpdate
solar/v1/gateways/+/configStatus
solar/v1/gateways/+/status
solar/v1/sites/+/gateways/+/devices/+/telemetry
```

การที่ EMQX แสดง Gateway ว่า Connected ไม่ได้แปลว่า Cloud backend Subscribe สำเร็จ ต้องตรวจ backend readiness และ SUBACK ของห้า filter นี้ด้วย

## 3 ลำดับการทำงานทั้งหมด

1. Gateway เชื่อมต่อแบบ anonymous โดยใช้ Client ID เท่ากับ `gatewayId`
2. Gateway Publish full snapshot ไป `register`
3. ระบบแสดง Gateway ในหน้า **จัดการเกตเวย์ > ยังไม่เชื่อมต่อ**
4. Admin เลือก Site ตรวจอุปกรณ์ เลือก Preset หรือกรอก mapping แบบ Manual/Gateway แล้วอนุมัติ
5. ระบบออก Username/Password ครั้งเดียวและสร้าง `config` revision แรก
6. Gateway ตัด anonymous connection แล้ว reconnect ด้วย credential ถาวร
7. ก่อน CONNECT ต้องตั้ง retained offline Last Will ที่ topic `status`
8. Gateway รอ CONNACK แล้ว Subscribe `config` และตรวจว่า SUBACK อนุญาต QoS 1
9. Gateway Publish retained online `status` หลัง subscription ที่จำเป็นพร้อมแล้ว
10. Gateway รับ retained `config` ตรวจ version/hash แล้วบันทึก config
11. Gateway Publish `configStatus: received`
12. Gateway นำ connection, poll groups และ register mappings ไปตั้งค่าการอ่านอุปกรณ์
13. เมื่อใช้ค่าตั้งสำเร็จจริง Gateway Publish `configStatus: applied`
14. ระบบเปลี่ยน Gateway เป็น active และย้ายไป Tab **เชื่อมต่อแล้ว**
15. Gateway Subscribe `dataAcept` ของ Site ที่ระบบอนุมัติและตรวจ SUBACK
16. Gateway Publish retained online `status` อีกครั้งโดยใส่ applied version/hash ล่าสุด
17. Gateway เริ่ม Publish telemetry รายอุปกรณ์และรอ `dataAcept`
18. ถ้า Gateway ต้องการเปลี่ยนค่าตั้ง ให้ส่ง full snapshot ผ่าน `configUpdate`; Admin ต้องอนุมัติก่อนทุกครั้ง

ห้ามเริ่ม telemetry ก่อน `configStatus: applied` ของ version/hash ที่ตรงกับ desired config และก่อน Subscribe `dataAcept` สำเร็จ

## 4 Payload ลงทะเบียนครั้งแรก

Topic:

```text
solar/v1/gateways/GW-001/register
```

ตัวอย่าง full snapshot:

```json
{
  "schemaVersion": "1.1",
  "messageType": "register",
  "messageId": "GW-001-register-0001",
  "sentAt": "2026-10-20T09:00:00+07:00",
  "gateway": {
    "gatewayId": "GW-001",
    "model": "Industrial-Gateway-X1",
    "firmwareVersion": "1.0.0"
  },
  "reportedSiteId": "SITE-001",
  "devices": [
    {
      "deviceId": "METER-001",
      "deviceType": "energy-meter",
      "manufacturer": "Schneider Electric",
      "model": "PowerLogic PM2230",
      "firmwareVersion": "1.0.0",
      "serialNumber": "PM2230-SERIAL-001",
      "profileId": "schneider-pm2230",
      "profileVersion": "1.0.0",
      "protocol": "modbus-tcp",
      "connection": {
        "host": "192.0.2.10",
        "port": 502,
        "slaveId": 1
      },
      "pollGroups": [
        "realtime",
        "energy"
      ],
      "mappings": [
        {
          "tag": "energy.active.import.total",
          "required": true,
          "registerAddress": "1000",
          "displayName": "Active import energy",
          "pollGroup": "energy",
          "sourceUnit": "Wh",
          "targetUnit": "kWh",
          "conversion": "wh-to-kwh",
          "role": "billing-import",
          "registerCount": 2,
          "dataType": "uint32",
          "byteOrder": "big_endian",
          "wordOrder": "big_word_first",
          "scale": 1,
          "offset": 0
        }
      ]
    }
  ]
}
```

`reportedSiteId` เป็นข้อมูลเสนอจาก Gateway เท่านั้น Site ที่ Admin เลือกเป็นค่าจริง หาก Gateway ไม่ทราบ profile หรือ mapping ให้ส่งข้อมูลที่ทราบ เช่น รุ่น firmware serial protocol และ connection แล้วละ `profileId`, `profileVersion`, `pollGroups` หรือ `mappings` ได้ ห้ามเดา Register Address

ก่อนอนุมัติ การส่ง snapshot ใหม่ใช้ค่าล่าสุดเป็นหลัก การ retry payload เดิมให้ใช้ `messageId` เดิม เมื่อข้อมูลเปลี่ยนต้องสร้าง `messageId` และ `sentAt` ใหม่ หลัง Admin อนุมัติแล้ว anonymous `register` จะไม่รับอีก

## 5 Payload config จาก Cloud

Gateway ต้อง Subscribe topic นี้หลัง reconnect ด้วย credential ถาวร:

```text
solar/v1/gateways/GW-001/config
```

Cloud ส่ง QoS 1 และ Retain เปิด ตัวอย่าง:

```json
{
  "schemaVersion": "1.1",
  "messageType": "config",
  "messageId": "4a18394c-f85d-4ee5-a163-f579d97cecc9",
  "gatewayId": "GW-001",
  "siteId": "SITE-001",
  "configVersion": 1,
  "configHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "issuedAt": "2026-10-20T09:10:00.000Z",
  "approvedBy": "11111111-1111-4111-8111-111111111111",
  "devices": [
    {
      "deviceId": "METER-001",
      "deviceType": "energy-meter",
      "manufacturer": "Schneider Electric",
      "model": "PowerLogic PM2230",
      "firmwareVersion": "1.0.0",
      "serialNumber": "PM2230-SERIAL-001",
      "profileId": "schneider-pm2230",
      "profileVersion": "1.0.0",
      "protocol": "modbus-tcp",
      "connection": {
        "host": "192.0.2.10",
        "port": 502,
        "slaveId": 1
      },
      "mappingSource": "manual",
      "enabled": true,
      "pollGroups": [
        "energy"
      ],
      "mappings": [
        {
          "tag": "energy.active.import.total",
          "required": true,
          "registerAddress": "1000",
          "displayName": "Active import energy",
          "pollGroup": "energy",
          "sourceUnit": "Wh",
          "targetUnit": "kWh",
          "conversion": "wh-to-kwh",
          "role": "billing-import",
          "registerCount": 2,
          "dataType": "uint32",
          "byteOrder": "big_endian",
          "wordOrder": "big_word_first",
          "scale": 1,
          "offset": 0
        }
      ]
    }
  ]
}
```

`configHash` ในตัวอย่างเป็น placeholder Gateway ต้องเก็บและตอบกลับค่าจริงจาก Cloud แบบตรงตัว ห้ามแทนด้วย hash ตัวอย่าง

### 5.1 ความหมายของ mappingSource

| ค่า | ความหมาย |
| --- | --- |
| `preset` | Admin เลือก Preset ที่ระบบมีอยู่ |
| `manual` | Admin กรอกหรือแก้ mapping เอง |
| `gateway` | ใช้ข้อมูลที่ Gateway รายงานและ Admin ตรวจอนุมัติแล้ว |

ไม่ว่าแหล่งข้อมูลเป็นแบบใด Gateway ต้องใช้ snapshot ใน `config` เป็น desired configuration ปัจจุบัน ไม่ต้องค้น Preset เอง

### 5.2 รูปแบบ connection ที่รองรับ

Modbus TCP:

```json
{
  "protocol": "modbus-tcp",
  "connection": {
    "host": "192.0.2.10",
    "port": 502,
    "slaveId": 1
  }
}
```

Modbus RTU:

```json
{
  "protocol": "modbus-rtu",
  "connection": {
    "serialPort": "/dev/ttyUSB0",
    "baudRate": 9600,
    "dataBits": 8,
    "parity": "none",
    "stopBits": 1,
    "slaveId": 1
  }
}
```

### 5.3 ข้อกำหนด Register Mapping

| Field | เงื่อนไข |
| --- | --- |
| `tag` | Canonical tag ไม่ซ้ำในอุปกรณ์เดียวกัน |
| `sourceTag` | ชื่อ field ต้นทาง ถ้าต่างจาก canonical tag |
| `required` | ถ้าเป็น `true` telemetry ของ poll group ต้องมี field นี้ |
| `registerAddress` | จำเป็นสำหรับ Modbus mapping และห้ามซ้ำในอุปกรณ์เดียวกัน |
| `displayName` | ชื่อแสดงผล |
| `pollGroup` | ต้องอยู่ใน `pollGroups` ของอุปกรณ์ |
| `sourceUnit` | หน่วยที่ Gateway ส่งเข้า telemetry |
| `targetUnit` | หน่วยที่ระบบเก็บหลังแปลง |
| `conversion` | `identity`, `wh-to-kwh`, `varh-to-kvarh` หรือ `auto-v1` |
| `role` | `billing-import`, `active-power` หรือ `none` |
| `registerCount` | จำนวน register word ตั้งแต่ 1 ขึ้นไป |
| `dataType` | `uint16`, `int16`, `uint32`, `int32` หรือ `float32` |
| `byteOrder` | `big_endian` หรือ `little_endian` |
| `wordOrder` | `little_word_first`, `big_word_first`, `cdab` หรือ `abcd` |
| `scale` | ตัวคูณที่เป็น finite number |
| `offset` | ค่าชดเชยหลัง scale ถ้ามี |

เมื่อมี `registerAddress` ต้องมี `registerCount`, `dataType`, `byteOrder`, `wordOrder` และ `scale` ครบ ห้ามใส่ค่าบางส่วนแล้วเดาที่ Gateway

## 6 Payload configStatus

Topic:

```text
solar/v1/gateways/GW-001/configStatus
```

### 6.1 รับ config แล้ว

ส่งหลัง Gateway ตรวจ schema/hash และบันทึก config ลง persistent storage แล้ว แต่ยังไม่ถือว่าเริ่มใช้งานสำเร็จ:

```json
{
  "schemaVersion": "1.1",
  "messageType": "configStatus",
  "messageId": "GW-001-config-status-0001",
  "gatewayId": "GW-001",
  "configVersion": 1,
  "configHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "status": "received",
  "reportedAt": "2026-10-20T09:11:00+07:00"
}
```

### 6.2 ใช้ config สำเร็จ

ส่งเมื่อ Gateway ตั้ง connection, poll groups และ mappings สำเร็จจริง:

```json
{
  "schemaVersion": "1.1",
  "messageType": "configStatus",
  "messageId": "GW-001-config-status-0002",
  "gatewayId": "GW-001",
  "configVersion": 1,
  "configHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "status": "applied",
  "reportedAt": "2026-10-20T09:12:00+07:00"
}
```

### 6.3 ใช้ config ไม่สำเร็จ

`failed` ต้องมี `error.code` เสมอ:

```json
{
  "schemaVersion": "1.1",
  "messageType": "configStatus",
  "messageId": "GW-001-config-status-0003",
  "gatewayId": "GW-001",
  "configVersion": 1,
  "configHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "status": "failed",
  "reportedAt": "2026-10-20T09:12:30+07:00",
  "error": {
    "code": "MODBUS_TIMEOUT",
    "message": "Device did not respond within the configured timeout",
    "deviceId": "METER-001",
    "tag": "energy.active.import.total"
  }
}
```

Gateway ต้องใช้ `configVersion` และ `configHash` จาก `config` ฉบับเดียวกัน ถ้าค่าไม่ตรง ระบบจะถือว่า configuration drift และไม่ activate revision นั้น

## 7 Payload status และ Last Will

Topic:

```text
solar/v1/gateways/GW-001/status
```

สร้าง `sessionId` ใหม่เมื่อ process หรืออุปกรณ์ boot ใหม่ และใช้ค่าเดิมตลอด boot เดียวกันรวม reconnect ทุก status publication ต้องมี `messageId` และ `reportedAt` ใหม่

### 7.1 Offline Last Will ก่อน CONNECT

ตั้งค่า Will ก่อน CONNECT ทุกครั้ง ใช้ QoS 1 และ Retain เปิด:

```json
{
  "schemaVersion": "1.1",
  "messageType": "status",
  "messageId": "GW-001-status-will-0001",
  "gatewayId": "GW-001",
  "sessionId": "GW-001-boot-0001",
  "firmwareVersion": "1.0.0",
  "status": "offline",
  "appliedConfigVersion": null,
  "appliedConfigHash": null,
  "reportedAt": "2026-10-20T09:10:30+07:00"
}
```

ถ้าเคย apply config แล้ว ให้ใส่ version/hash ล่าสุดแทน `null`

### 7.2 Online หลัง CONNACK และ SUBACK สำเร็จ

Publish QoS 1 และ Retain เปิด:

```json
{
  "schemaVersion": "1.1",
  "messageType": "status",
  "messageId": "GW-001-status-0002",
  "gatewayId": "GW-001",
  "sessionId": "GW-001-boot-0001",
  "firmwareVersion": "1.0.0",
  "status": "online",
  "appliedConfigVersion": 1,
  "appliedConfigHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "reportedAt": "2026-10-20T09:13:00+07:00"
}
```

### 7.3 Graceful offline

ก่อน DISCONNECT ปกติ Gateway ต้อง Publish retained offline และรอ PUBACK ก่อน:

```json
{
  "schemaVersion": "1.1",
  "messageType": "status",
  "messageId": "GW-001-status-0003",
  "gatewayId": "GW-001",
  "sessionId": "GW-001-boot-0001",
  "firmwareVersion": "1.0.0",
  "status": "offline",
  "appliedConfigVersion": 1,
  "appliedConfigHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "reportedAt": "2026-10-20T18:00:00+07:00"
}
```

กรณี network ขาดหรือ process ถูก kill Broker จะ Publish offline Last Will แทน

## 8 Payload telemetry

Topic ต้องใช้ Site, Gateway และ Device จาก config ที่ active:

```text
solar/v1/sites/SITE-001/gateways/GW-001/devices/METER-001/telemetry
```

ทุกข้อความ production ควรมี `configurationVersion` ที่ตรงกับ active config เพื่อให้ระบบเลือก immutable mapping revision ได้แน่นอน

### 8.1 Common fields

| Field | Required | เงื่อนไข |
| --- | --- | --- |
| `schemaVersion` | Yes | `1.1` |
| `messageType` | Yes | `telemetry` |
| `messageId` | Yes | Stable ID สำหรับ deduplication |
| `sequence` | Yes | Integer ตั้งแต่ 0 สำหรับตรวจลำดับหรือ gap |
| `lotNumber` | Yes | uint32 ช่วง 1 ถึง 4,294,967,295 |
| `configurationVersion` | Production | ต้องตรง active config ของ Gateway |
| `siteId` | Yes | ต้องตรง topic และ config |
| `gatewayId` | Yes | ต้องตรง authenticated Gateway และ topic |
| `device.deviceId` | Yes | ต้องตรง topic และอุปกรณ์ที่ active |
| `device.deviceType` | Yes | ต้องตรง profile |
| `pollGroup` | Yes | ต้องตรง field mappings |
| `timestamps.polledAt` | Yes | เวลาที่ Gateway อ่าน poll group สำเร็จ |
| `timestamps.sentAt` | Yes | เวลาที่ Publish ครั้งนี้ |
| `timestamps.measuredAt` | No | เวลาจากอุปกรณ์ต้นทาง ถ้ามีและเชื่อถือได้ |
| `data.values` | Yes | ตัวเลข finite keyed ด้วย source/canonical tag |
| `data.units` | Yes | หน่วยของทุก field ที่ส่ง |
| `quality.status` | Yes | เช่น `good` |
| `quality.communication` | Yes | เช่น `online` |

### 8.2 Schneider PM2230 realtime

```json
{
  "schemaVersion": "1.1",
  "messageType": "telemetry",
  "messageId": "GW-001-000001258",
  "sequence": 1258,
  "lotNumber": 1258,
  "configurationVersion": 1,
  "siteId": "SITE-001",
  "gatewayId": "GW-001",
  "device": {
    "deviceId": "METER-001",
    "deviceType": "energy-meter",
    "manufacturer": "Schneider Electric",
    "model": "PM2230",
    "profileId": "schneider-pm2230",
    "profileVersion": "1.0.0",
    "protocol": "modbus-tcp"
  },
  "pollGroup": "realtime",
  "timestamps": {
    "polledAt": "2026-10-20T10:00:00.125+07:00",
    "sentAt": "2026-10-20T10:00:00.280+07:00"
  },
  "data": {
    "values": {
      "electrical.voltage.l1_n": 230.41,
      "electrical.voltage.l2_n": 229.88,
      "electrical.voltage.l3_n": 230.12,
      "electrical.voltage.l1_l2": 398.72,
      "electrical.voltage.l2_l3": 399.05,
      "electrical.voltage.l3_l1": 398.91,
      "electrical.current.l1": 42.31,
      "electrical.current.l2": 40.87,
      "electrical.current.l3": 41.66,
      "electrical.frequency": 50.02,
      "power.active.total": 28240,
      "power.reactive.total": 4350,
      "power.apparent.total": 28580,
      "power.factor.total": 0.988
    },
    "units": {
      "electrical.voltage.l1_n": "V",
      "electrical.voltage.l2_n": "V",
      "electrical.voltage.l3_n": "V",
      "electrical.voltage.l1_l2": "V",
      "electrical.voltage.l2_l3": "V",
      "electrical.voltage.l3_l1": "V",
      "electrical.current.l1": "A",
      "electrical.current.l2": "A",
      "electrical.current.l3": "A",
      "electrical.frequency": "Hz",
      "power.active.total": "W",
      "power.reactive.total": "var",
      "power.apparent.total": "VA",
      "power.factor.total": "1"
    }
  },
  "quality": {
    "status": "good",
    "communication": "online",
    "pollDurationMs": 52,
    "queueDelayMs": 155
  }
}
```

### 8.3 Schneider PM2230 energy

```json
{
  "schemaVersion": "1.1",
  "messageType": "telemetry",
  "messageId": "GW-001-000001259",
  "sequence": 1259,
  "lotNumber": 1259,
  "configurationVersion": 1,
  "siteId": "SITE-001",
  "gatewayId": "GW-001",
  "device": {
    "deviceId": "METER-001",
    "deviceType": "energy-meter",
    "manufacturer": "Schneider Electric",
    "model": "PM2230",
    "profileId": "schneider-pm2230",
    "profileVersion": "1.0.0"
  },
  "pollGroup": "energy",
  "timestamps": {
    "polledAt": "2026-10-20T10:00:05.125+07:00",
    "sentAt": "2026-10-20T10:00:05.240+07:00"
  },
  "data": {
    "values": {
      "energy.active.import.total": 152430275,
      "energy.active.export.total": 12500,
      "energy.reactive.import.total": 24580210,
      "energy.reactive.export.total": 315700
    },
    "units": {
      "energy.active.import.total": "Wh",
      "energy.active.export.total": "Wh",
      "energy.reactive.import.total": "varh",
      "energy.reactive.export.total": "varh"
    }
  },
  "quality": {
    "status": "good",
    "communication": "online",
    "pollDurationMs": 45,
    "queueDelayMs": 115
  }
}
```

Energy ต้องส่งเป็นค่าพลังงานสะสมตาม source unit ใน config ระบบจะแปลง `Wh` เป็น `kWh` หรือ `varh` เป็น `kvarh` ตาม conversion ที่ Admin อนุมัติ ห้ามส่งค่าที่แปลงเป็น kWh แล้วแต่ยังระบุหน่วยเป็น Wh

### 8.4 Huawei SmartLogger3000A plant

Topic ตัวอย่าง:

```text
solar/v1/sites/SITE-001/gateways/GW-001/devices/SMARTLOGGER-001/telemetry
```

```json
{
  "schemaVersion": "1.1",
  "messageType": "telemetry",
  "messageId": "GW-001-000001260",
  "sequence": 1260,
  "lotNumber": 1260,
  "configurationVersion": 1,
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
    "polledAt": "2026-10-20T10:00:10.125+07:00",
    "sentAt": "2026-10-20T10:00:10.320+07:00"
  },
  "data": {
    "values": {
      "solar.active_power": 820400,
      "solar.reactive_power": 15200,
      "solar.daily_yield": 4250600,
      "solar.total_yield": 12560000500
    },
    "units": {
      "solar.active_power": "W",
      "solar.reactive_power": "var",
      "solar.daily_yield": "Wh",
      "solar.total_yield": "Wh"
    }
  },
  "quality": {
    "status": "good",
    "communication": "online",
    "pollDurationMs": 78,
    "queueDelayMs": 195
  }
}
```

### 8.5 Huawei SmartLogger3000A environment

```json
{
  "schemaVersion": "1.1",
  "messageType": "telemetry",
  "messageId": "GW-001-000001261",
  "sequence": 1261,
  "lotNumber": 1261,
  "configurationVersion": 1,
  "siteId": "SITE-001",
  "gatewayId": "GW-001",
  "device": {
    "deviceId": "SMARTLOGGER-001",
    "deviceType": "solar-logger",
    "manufacturer": "Huawei",
    "model": "SmartLogger3000A",
    "profileId": "huawei-smartlogger3000a",
    "profileVersion": "1.0.0"
  },
  "pollGroup": "environment",
  "timestamps": {
    "polledAt": "2026-10-20T10:00:15.125+07:00",
    "sentAt": "2026-10-20T10:00:15.250+07:00"
  },
  "data": {
    "values": {
      "environment.irradiance": 825.4,
      "environment.ambient_temperature": 34.8,
      "environment.module_temperature": 52.6,
      "environment.wind_speed": 2.7
    },
    "units": {
      "environment.irradiance": "W/m2",
      "environment.ambient_temperature": "degC",
      "environment.module_temperature": "degC",
      "environment.wind_speed": "m/s"
    }
  },
  "quality": {
    "status": "good",
    "communication": "online"
  }
}
```

Field ที่ Gateway ส่งจริงต้องตรงกับ mappings ใน `config` ไม่จำเป็นต้องส่งครบทุกตัวอย่างข้างต้นถ้า config ของ Site ไม่มี field นั้น แต่ field ที่มี `required: true` ต้องครบใน poll group นั้น

รอบอ่านที่ใช้เป็นค่าเริ่มต้นสำหรับประสานงานคือ PM2230 realtime ทุก 1 วินาที, PM2230 energy ทุก 5 วินาที, SmartLogger plant ทุก 5 วินาที และ SmartLogger environment ทุก 10 วินาที หาก Admin หรือ firmware กำหนดค่าอื่นให้ยึดค่าที่ตกลงและทดสอบกับ Site นั้น

## 9 Payload dataAcept จาก Cloud

Gateway ที่ active ต้อง Subscribe:

```text
solar/v1/sites/SITE-001/gateways/GW-001/dataAcept
```

Cloud จะส่งหลัง validate และ database commit สำเร็จเท่านั้น:

```json
{
  "schemaVersion": "1.1",
  "messageType": "dataAcept",
  "siteId": "SITE-001",
  "gatewayId": "GW-001",
  "lotNumber": 1258,
  "messageId": "GW-001-000001258",
  "status": "accepted",
  "acceptedAt": "2026-10-20T10:00:00.520+07:00"
}
```

MQTT PUBACK ยืนยันเพียงว่า Broker รับ Publish แล้ว ไม่ได้ยืนยันว่า Cloud บันทึกข้อมูลสำเร็จ Gateway ต้องถือว่า message สำเร็จเมื่อได้รับ `dataAcept` ที่ `messageId` และ `lotNumber` ตรงกันเท่านั้น

## 10 Payload configUpdate จาก Gateway

ใช้หลัง Gateway active แล้วเท่านั้น Topic:

```text
solar/v1/gateways/GW-001/configUpdate
```

ต้องส่ง snapshot ทั้งชุด ไม่ใช่เฉพาะ field ที่เปลี่ยน และ `baseConfigVersion` ต้องตรง active config ปัจจุบัน:

```json
{
  "schemaVersion": "1.1",
  "messageType": "configUpdate",
  "messageId": "GW-001-config-update-0001",
  "gatewayId": "GW-001",
  "siteId": "SITE-001",
  "proposalId": "GW-001-proposal-0001",
  "baseConfigVersion": 1,
  "sentAt": "2026-10-20T11:00:00+07:00",
  "devices": [
    {
      "deviceId": "METER-001",
      "deviceType": "energy-meter",
      "manufacturer": "Schneider Electric",
      "model": "PowerLogic PM2230",
      "firmwareVersion": "1.0.1",
      "serialNumber": "PM2230-SERIAL-001",
      "profileId": "schneider-pm2230",
      "profileVersion": "1.0.0",
      "protocol": "modbus-tcp",
      "connection": {
        "host": "192.0.2.10",
        "port": 502,
        "slaveId": 1
      },
      "mappingSource": "gateway",
      "enabled": true,
      "pollGroups": [
        "energy"
      ],
      "mappings": [
        {
          "tag": "energy.active.import.total",
          "required": true,
          "registerAddress": "1000",
          "displayName": "Active import energy",
          "pollGroup": "energy",
          "sourceUnit": "Wh",
          "targetUnit": "kWh",
          "conversion": "wh-to-kwh",
          "role": "billing-import",
          "registerCount": 2,
          "dataType": "uint32",
          "byteOrder": "big_endian",
          "wordOrder": "big_word_first",
          "scale": 1,
          "offset": 0
        }
      ]
    }
  ]
}
```

ระบบสร้าง proposal สถานะ pending ให้ Admin ตรวจและอนุมัติหรือปฏิเสธ ไม่มี auto-approve เมื่อ Admin อนุมัติ Cloud จะส่ง retained `config` version ใหม่ แล้ว Gateway ต้องทำลำดับ `received` และ `applied` ใหม่

## 11 Retry และ idempotency

### 11.1 Telemetry

- `lotNumber` เป็น uint32 ช่วง 1 ถึง 4,294,967,295 แนะนำสงวน `0` สำหรับ uninitialized
- เก็บตัวนับใน persistent storage และ rollover จาก 4,294,967,295 กลับเป็น 1
- Retry message เดิมต้องใช้ `messageId`, `sequence`, `lotNumber`, `polledAt`, values, units และ identity เดิม
- Retry เปลี่ยนได้เฉพาะ `timestamps.sentAt` เพื่อบอกเวลาส่งรอบใหม่
- ใช้ `messageId` เดิมกับ logical payload คนละชุดจะถูก reject
- ถ้าไม่ได้ `dataAcept` ภายใน timeout ให้ retry ด้วย exponential backoff และ jitter
- การได้รับ `dataAcept` ซ้ำให้ถือว่า message เดิมสำเร็จ ห้ามบันทึกซ้ำใน Gateway queue

### 11.2 Config และ status

- `config` เป็น retained desired state Gateway อาจได้รับซ้ำหลัง reconnect ต้อง apply แบบ idempotentตาม version/hash
- `configStatus` ซ้ำด้วยข้อมูลเดิมไม่ทำให้เกิด revision ใหม่
- `configUpdate` ต้องใช้ `proposalId` และ `messageId` ใหม่เมื่อเป็นข้อเสนอใหม่
- Status แต่ละครั้งต้องใช้ `messageId`/`reportedAt` ใหม่ แต่ `sessionId` คงเดิมตลอด boot เดียวกัน

## 12 การปิดและ reconnect

**Graceful disconnect**

1. Publish retained `status: offline`
2. รอ PUBACK
3. ส่ง MQTT DISCONNECT
4. ปิด connection

**Abnormal disconnect**

Broker ส่ง retained offline Last Will ให้โดยอัตโนมัติ Gateway ไม่ต้องสร้างข้อความซ้ำหลัง connection ขาด

**Reconnect**

1. ตั้ง offline Last Will ใหม่ก่อน CONNECT
2. ใช้ Client ID และ Username เดิม
3. ถ้า process ไม่ reboot ให้ใช้ `sessionId` เดิม; ถ้า reboot ให้สร้างใหม่
4. รอ CONNACK
5. Subscribe `config`; ถ้า active แล้วให้ Subscribe `dataAcept` ด้วย
6. ตรวจ SUBACK ของทุก topic
7. Publish retained online status พร้อม applied version/hash ล่าสุด

## 13 ACL ที่ Gateway ต้องคาดหวัง

| สถานะ | Publish ได้ | Subscribe ได้ |
| --- | --- | --- |
| Anonymous | `register` ของ Gateway ตัวเอง | ไม่มี |
| Configuring | `configStatus` และ `status` ของตัวเอง | `config` ของตัวเอง |
| Active | `configUpdate`, `configStatus`, `status` ของตัวเองและ telemetry ของอุปกรณ์ที่ active | `config` ของตัวเองและ `dataAcept` ของ Site/Gateway ตัวเอง |

การ Subscribe `dataAcept` ก่อน active อาจถูกปฏิเสธโดยตั้งใจ ต้องรอ `configStatus: applied` แล้ว Subscribe ใหม่

## 14 Checklist ทดสอบด้วย MQTTBox

1. ตั้ง Broker เป็น `mqtt-solar.fowir.com:8883` และเปิด TLS certificate verification
2. เชื่อมต่อแบบ anonymous ด้วย Client ID `GW-001`
3. Publish `register` QoS 1 Retain ปิด
4. ตรวจว่า Gateway ปรากฏใน Tab ยังไม่เชื่อมต่อ
5. ให้ Admin เลือก Site ตรวจ mapping และยืนยัน
6. บันทึก Username/Password ที่ระบบแสดงครั้งเดียว
7. ปิด anonymous connection
8. ตั้ง offline Last Will QoS 1 Retain เปิด
9. Reconnect ด้วย Client ID และ Username เท่ากับ `GW-001`
10. Subscribe `solar/v1/gateways/GW-001/config` QoS 1 และตรวจ SUBACK
11. ตรวจว่าได้รับ retained config และจด version/hash จริง
12. Publish `configStatus: received`
13. Apply config จริง แล้ว Publish `configStatus: applied`
14. Subscribe `solar/v1/sites/SITE-001/gateways/GW-001/dataAcept`
15. Publish online status พร้อม applied version/hash
16. Publish telemetry QoS 1 Retain ปิด
17. ตรวจ `dataAcept` ว่า messageId และ lotNumber ตรงกัน
18. ตรวจหน้า Gateway ว่ามีเวลารับล่าสุดและข้อมูล telemetry
19. ทดสอบ graceful offline, abnormal Last Will และ reconnect
20. ทดสอบ `configUpdate` แล้วให้ Admin อนุมัติ ก่อน apply revision ใหม่

## 15 วินิจฉัยปัญหา

| อาการ | จุดตรวจ |
| --- | --- |
| CONNECT anonymous ถูกปฏิเสธ | Client ID ผิดรูปแบบ, ใส่ username/password หรือ Gateway ID นี้ถูกลงทะเบียนแล้ว |
| EMQX แสดง client แต่หน้า Admin ไม่มี Gateway | Topic/payload identity ไม่ตรง, schema ไม่ผ่าน, API ไม่ได้ subscribe Broker เดียวกัน หรือ `/ready/mqtt` ไม่พร้อม |
| SUBACK config ถูกปฏิเสธ | ยังใช้ anonymous session, Username/Client ID ไม่ตรง หรือ credential ถูกหมุนแล้ว |
| Subscribe แล้วไม่ได้ retained config | Admin ยังไม่ยืนยัน, desired revision ยังไม่ถูก publish หรือ topic ผิด |
| configStatus ไม่เปลี่ยนสถานะ | version/hash ไม่ตรง, Gateway ID ไม่ตรง หรือส่ง `configAck` แทน `configStatus` |
| dataAcept ถูกปฏิเสธ | Gateway ยังไม่ active หรือ Site/Gateway binding ไม่ตรง |
| Telemetry ได้ PUBACK แต่ไม่มี dataAcept | config version, topic identity, profile, unit, required field หรือ database transaction ไม่ผ่าน |
| configUpdate ไม่ขึ้นในหน้า Admin | base version/site/gateway ผิด, snapshot ไม่ครบ หรือ proposal/message ID ชนกับข้อมูลเดิม |

## 16 ข้อกำหนดด้านความปลอดภัย

- ห้ามบันทึก MQTT password, `INTERNAL_MQTT_SECRET`, Admin token หรือ private key ลง Git, screenshot หรือ log
- ห้ามใช้ Dashboard username/password เป็น Gateway credential
- ห้ามปิด TLS verification
- ห้ามใช้ credential ร่วมกันหลาย Gateway
- ห้าม Publish หรือ Subscribe topic ของ Site/Gateway อื่น
- ห้ามตั้ง Retain ให้ `register`, `configUpdate`, `configStatus`, telemetry หรือ `dataAcept`
- ห้ามเริ่มเก็บข้อมูลสำหรับออกเอกสารจน `configStatus: applied` และได้รับ `dataAcept` ของ telemetry จริง

## 17 เกณฑ์ยอมรับก่อนใช้งานจริง

- Gateway ปรากฏใน Tab ยังไม่เชื่อมต่อจาก `register` จริง
- Admin สามารถเลือก Site ตรวจ Preset/Manual/Gateway mapping และยืนยันได้
- Gateway reconnect ด้วย credential ถาวรและได้รับ retained `config`
- ระบบแสดง `received` และ `applied` ตาม configStatus จริง
- Online/offline และ Last Will ทำงานโดยไม่เปลี่ยน config state ผิดพลาด
- Telemetry ทุก poll group ที่เปิดใช้ผ่าน validation และได้รับ `dataAcept`
- Retry message เดิมไม่สร้างข้อมูลซ้ำ
- Cross-gateway และ cross-site access ถูกปฏิเสธ
- Register Address, data type, byte/word order, scale และ unit ผ่านการเทียบกับเอกสารรุ่น/firmware และ hardware จริง

