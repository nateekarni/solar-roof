# การเลือกและจัดการ Preset

## สร้างไซต์
1. เปิด Admin → ไซต์งาน → เพิ่มไซต์
2. เลือก **Preset มิเตอร์หลัก** จุดเดียว ไม่ต้องเลือกรูปแบบ Profile/Register อีก ระบบใช้วิธีรับข้อมูลของ Preset ให้เอง
3. สำหรับ Gateway ใน pilot เลือก **Pilot SPM91** (JSON) แล้วกำหนด Site ID `SITE-001`, Gateway ID `GW-001`, Device ID `SPM91-01`
4. เลือก Broker ที่ผู้ดูแล Gateway ให้ พร้อมกำหนด Subscribe Topic `solar/v1/sites/SITE-001/gateways/GW-001/devices/SPM91-01/telemetry` (หรือ `devices/+/telemetry` เมื่อรับหลายอุปกรณ์)
5. กรอกชื่อไซต์ โรงเรียน กำลังติดตั้ง และซีเรียลจริงให้ครบ ตรวจรายการ Field ก่อนบันทึก

Register Preset เดิมยังเลือกได้จากช่องเดียวกัน ระบบจะแปล Register ดิบและใช้ Topic legacy ให้เอง อย่าเลือก Register ดิบสำหรับข้อความ JSON `solar/v1/...` ที่แปลค่าแล้ว

## เพิ่มเองเมื่อไม่มี Preset ตรงรุ่น
1. เปิดรายการ Preset → **เพิ่ม Preset ด้วยตัวเอง**
2. กรอกชื่อ Preset, ID ไม่ซ้ำ, Mapping version (`1.0.0`), device type (`energy-meter` หรือ `solar-logger`), Source profile ID/version ที่ Gateway ส่ง และ poll groups
3. เพิ่ม Field เองทั้งหมดได้: tag มาตรฐาน ชื่อแสดงผล กลุ่มข้อมูล หน่วยต้นทาง/จัดเก็บ ระบบคำนวณการแปลงจากหน่วยให้
4. เปิด **จับคู่ Field ต้นทางและบทบาท** เพื่อระบุชื่อ key จริงใน `data.values`, จำเป็น/ไม่จำเป็น และบทบาท ข้อมูลทั่วไป/กำลังไฟ W/พลังงานสะสมสำหรับบิล
5. ทางลัด: เปิด **เติมรายการจาก JSON / ทดสอบ Mapping** วาง telemetry หรือเอกสารรวม payloads แล้วอ่านและเติมรายการ ระบบอ่านเฉพาะอุปกรณ์แรกและรวม poll groups ที่พบ ไม่สร้าง Field ที่ตัวอย่างไม่มี อุปกรณ์อื่นสร้าง Preset แยก
6. กด Preview Mapping เพื่อดูค่าที่แปลง รายการ unmapped และข้อความที่ถูกปฏิเสธ Preview ไม่เขียน telemetry และไม่ส่ง ACK
7. กด **บันทึกและเลือก Preset** จะบันทึกในฐานข้อมูล ใช้ซ้ำกับไซต์อื่นได้ ไม่ใช่แม่แบบที่เก็บเฉพาะ browser

ตัวอย่าง Pilot: `energy.active.import.total=1700 Wh` → `1.7 kWh`; เป็นค่าพลังงานสะสม ไม่ใช่พลังงานรายรอบ ต้องยืนยันทิศทางและตำแหน่งมิเตอร์ก่อนใช้คิดบิล

ชื่อ key ที่มีจุด เช่น `energy.active.import.total` เป็น literal key ไม่ใช่ JSON path ซ้อน Register ไม่ถูก decode ซ้ำสำหรับ JSON นี้

## Edit / Delete
- แต่ละ option มีเมนู `…` → **Edit / Delete** สำหรับ Admin
- Edit JSON Preset สร้าง Mapping version ใหม่และตรึง Source profile/version เดิม เว้นแต่ผู้ใช้แก้ Source โดยตั้งใจ อุปกรณ์อื่นและข้อมูลย้อนหลังไม่เปลี่ยน
- **บันทึกเป็น Preset ใหม่อีกชุด** ให้กำหนด Preset ID ใหม่ Source profile สามารถใช้ของ Gateway เดิมได้
- การเพิ่ม/ลบ Field มีผลต่อข้อความใหม่เมื่ออุปกรณ์เลือก revision ใหม่ ไม่เปลี่ยน Field ที่ Gateway ส่ง
- ลบ Field แล้วค่าที่ Gateway ยังส่งจะอยู่ใน unmapped/raw evidence ไม่กลายเป็นศูนย์
- Required Field ตรวจเฉพาะ pollGroup ของข้อความนั้น หากขาดจะ reject ข้อความนั้น Field optional ที่ไม่ส่งไม่ถูกสร้างค่าแทน
- มิเตอร์หลักต้องมี `energy.active.import.total` หน่วยจัดเก็บ kWh และบทบาท billing-import จึงเลือกใช้ได้
- Delete JSON Preset นำทุก revision ของชุดนั้นออกจาก catalogue และห้ามผูกใหม่ แต่ไม่ลบ immutable revisions/history; อุปกรณ์ที่ใช้อยู่ยังรับข้อมูลและเปลี่ยนไปเลือก Preset อื่นได้
- Register Preset เดิมคัดลอก mapping ไปยังอุปกรณ์ตอนลงทะเบียน การแก้ catalogue ไม่เปลี่ยน mapping ของอุปกรณ์เดิม; การลบไม่ลบ mapping ที่คัดลอกแล้ว

หน้าตั้งค่า → ค่ามิเตอร์ → โปรไฟล์ข้อมูล ใช้ตัวจัดการเดียวกัน และหน้ารายละเอียดไซต์ → แก้ไข → การตั้งค่ารับข้อมูล สามารถ Edit/เลือก revision ใหม่แล้ว **ยืนยันอัปเกรด** ให้เฉพาะอุปกรณ์ได้

## Coolify
หลัง deploy image รุ่นนี้ ให้เปิด Terminal ของ API และรันก่อนทดสอบหน้ารับข้อมูล:

```sh
pnpm --filter @solar/api db:migrate
```

Migration `028_preset_catalog.sql` เพิ่ม archive catalogue และ Pilot SPM91 ไม่ต้อง demo seed และไม่ล้างข้อมูลเดิม การดึง catalogue ใหม่ต้องมี migration นี้ก่อน

Migration runner รองรับ checksum ที่ต่างเฉพาะ LF/CRLF ของ checkout เดิม แต่ยังปฏิเสธ SQL ที่เปลี่ยนเนื้อหา และไม่แก้ checksum history เก่า

## ขอบเขตการทดสอบ
ทดสอบ localhost ผ่าน typecheck/unit tests และ browser จริง 390/1440px: manual/inferred fields, JSON preview, local/source version separation, archive/history retention และ auto-select mode ใน modal ไซต์ ไม่มีการ publish MQTT, hardware configuration หรือรับข้อมูลจาก Broker ภายนอกในการทดสอบนี้

QoS 0/retain false ตามตัวอย่าง Gateway ต้องตกลง retry/buffer/dataAcept กับผู้ดูแล separately หากต้องการหลักฐานรับข้อมูลครบสำหรับบิล
