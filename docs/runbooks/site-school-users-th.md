# จัดการ School User ตามไซต์

หน้า Admin → ไซต์งาน → รายละเอียดไซต์ มีแท็บ **จัดการข้อมูล** และ **จัดการผู้ใช้งาน** ใช้ได้ทั้ง desktop/mobile เฉพาะ Admin มีสิทธิ์จัดการบัญชี

ข้อมูลสิทธิ์ปัจจุบันผูก `users.school_id` จึงเป็นบัญชีของโรงเรียนที่ไซต์สังกัด ไม่ใช่สิทธิ์แยกหนึ่งไซต์ต่อหนึ่งบัญชี หากโรงเรียนมีหลายไซต์ ผู้ใช้เห็นทุกไซต์ของโรงเรียนนั้น

## ใช้หน้าเว็บ

- เพิ่มผู้ใช้: กรอกชื่อและ Email ระบบสร้าง School User และส่งคำเชิญผ่าน SMTP เมื่อเปิดใช้งาน ยังไม่เข้าสู่ระบบได้จนเปิดลิงก์ตั้งรหัสผ่าน
- แก้ไข: แก้ชื่อและ Email ของบัญชีที่เปิดใช้งานแล้ว การเปลี่ยน Email เพิกถอน session เดิม บัญชีรอคำเชิญแก้ชื่อได้ แต่ Email ต้องใช้เดิมเพราะลิงก์ผูกกับ Email นั้น
- ส่งคำเชิญใหม่: ใช้กับบัญชีสถานะ invited หากส่งไม่สำเร็จให้ตรวจ SMTP
- ลบผู้ใช้: ปิดบัญชี (`disabled`) และเพิกถอน session/คำเชิญทันที เก็บบัญชีไว้เพื่อไม่ทำลายประวัติและความสัมพันธ์ของเอกสาร

## Seed Email ที่ไม่มีจริงบน Coolify

ใช้ Terminal ของ container **api** หลัง deploy image ที่มีคำสั่งนี้ ไม่ต้องเปิด SMTP ไม่ต้องใช้ demo seed และไม่ล้างข้อมูล

```sh
export SITE_USER_SEED_ENABLED=true
export SITE_USER_SEED_SITE_ID='UUID-ของไซต์ที่ต้องการ'
export SITE_USER_SEED_EMAIL='school-pilot@example.invalid'
export SITE_USER_SEED_NAME='ผู้รับผิดชอบโรงเรียนทดสอบ'
printf 'Password (at least 16 characters): '
stty -echo
IFS= read -r SITE_USER_SEED_PASSWORD
stty echo
echo
export SITE_USER_SEED_PASSWORD
pnpm --filter @solar/api db:seed:school-user
unset SITE_USER_SEED_ENABLED SITE_USER_SEED_SITE_ID SITE_USER_SEED_EMAIL SITE_USER_SEED_NAME SITE_USER_SEED_PASSWORD
```

คำสั่ง `read -s -p` สำหรับ bash ใน API image ปัจจุบัน หาก Terminal เปิด sh ให้พิมพ์ `bash` ก่อน รหัสผ่านจะไม่แสดงบนหน้าจอหรือถูกเขียนใน shell history

Site ID ดูจาก URL `/records/sites/<UUID>` คำสั่งหาโรงเรียนจาก Site ID ให้เองและตรวจว่าโรงเรียน active/ไซต์ยังไม่ archived รันซ้ำรักษารหัสผ่านเดิม หาก Email เดิมเป็น role อื่น ผูกโรงเรียนอื่น หรือบัญชี disabled จะหยุดและ rollback ไม่ย้ายสิทธิ์หรือเปิดบัญชีให้อัตโนมัติ

หลัง seed ให้ล็อกอิน Email ที่ตั้งและรหัสผ่านที่กรอก ใช้ reserved domain `example.invalid` สำหรับบัญชีที่ไม่ต้องรับอีเมลได้ คำสั่งนี้ไม่ส่งคำเชิญและไม่สร้าง telemetry จำลอง

## Localhost

Web: http://localhost:3000/login; API: http://localhost:3001/ready
คำสั่งรันจาก root:

```powershell
$env:MQTT_ENABLED='false'
$env:MQTT_DEFAULT_BROKER_ENABLED='false'
$env:WEB_URL='http://localhost:3000'
pnpm --filter @solar/api dev
```

อีก Terminal รัน `pnpm --filter @solar/web dev` ใช้ database/storage local ชุดเดิม ไม่รัน `db:seed` เดิมเพราะล้างข้อมูล demo
