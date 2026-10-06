# เลือก MQTT Broker ต่อ Gateway

หน้าเพิ่มไซต์ (ขั้นตั้งค่า Gateway) และหน้าแก้ไขไซต์มีตัวเลือก MQTT Broker ใช้รายการที่บันทึกไว้ร่วมกันได้ แต่แต่ละ Gateway เลือกได้แยกกัน หากเลือก Broker เริ่มต้น จะใช้ MQTT_URL และบัญชีจาก environment เดิม

1. กดเพิ่ม Broker ใส่ชื่อ, IP/Host (ไม่ใส่ protocol หรือ port ในช่อง Host), Protocol และ Port
2. สำหรับ MQTTBox ที่ใช้ mqtt/tcp กับ 184.82.29.241 ให้ใช้ Host 184.82.29.241, Protocol mqtt และพอร์ตตาม listener ของ server (ปกติ 1883)
3. Local EMQX ใช้ localhost:1883 สำหรับ TCP หรือ ws://localhost:8083/mqtt สำหรับ WebSocket พอร์ต 18083 เป็นหน้า Dashboard
4. localhost หมายถึงเครื่องที่รัน backend หาก backend อยู่ใน container ให้ใช้ hostname ที่ container เข้าถึงได้ เช่น host.docker.internal เมื่อ broker อยู่บน Windows host
5. เลือก Broker แล้วทดสอบสัญญาณ ปุ่มนี้ตรวจการเชื่อมต่อ broker เท่านั้น จากนั้นบันทึกไซต์ ระบบจะปรับ subscription ภายในประมาณ 5 วินาที
6. ใน MQTTBox เชื่อมต่อ Broker เดียวกัน Subscribe ACK topic ที่การ์ด Payload แสดงไว้ และ Publish JSON ข้อความเดียวที่คัดลอกจากการ์ดไปยัง Publish topic ที่ตรงกับ Device
7. แต่ละข้อความใหม่ต้องใช้ messageId, lotNumber และ timestamp ใหม่ ตรวจ ACK, ข้อมูลสด และรายการข้อความที่ปฏิเสธ การเห็น Connected ใน MQTTBox เพียงอย่างเดียวยังไม่ยืนยันว่า backend รับข้อมูลแล้ว

ระบบแยก subscription และการผูก Gateway ตาม Broker ส่ง ACK หลังบันทึกข้อมูลสำเร็จกลับทาง Broker ที่รับข้อความมา รองรับ broker ที่ใช้งานพร้อมกันสูงสุด 32 รายการ รหัสผ่านถูกเข้ารหัสก่อนเก็บและไม่ส่งกลับผ่านรายการ Broker ตั้ง MQTT_CREDENTIAL_SECRET ให้คงที่ใน deployment (หากไม่มีจะใช้ JWT_REFRESH_SECRET)

Migration: infra/migrations/025_mqtt_brokers.sql ต้องรันก่อนเริ่ม backend เวอร์ชันนี้
