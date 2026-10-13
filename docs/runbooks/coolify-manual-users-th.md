# เพิ่ม User ตาม Role ผ่าน Coolify Terminal

ปรับปรุง 6 ตุลาคม 2026 — deployment ไม่สร้าง user อัตโนมัติแล้ว ไม่มี db:bootstrap ใช้ **db:create:user** เพื่อเพิ่มทีละบัญชี และยังใช้ db:seed:customer-user สำหรับระบุไซต์ หรือ db:seed:users เพื่อเพิ่มสาม role พร้อมกันได้

## ก่อนรัน

Deploy API image รุ่นใหม่และให้ migrate Exited(0) ก่อน Coolify → Application เว็บไซต์ → Terminal → เลือก service **api** DATABASE_URL มาจาก container อยู่แล้ว ไม่ต้องคัดลอกรหัส DB มาวาง ใช้คำสั่งใน API container ไม่ใช่ container web/postgres/worker

Role ที่รองรับ: admin (Super Admin), owner (บริษัท), customer_user (ผู้รับผิดชอบลูกค้า) Admin/Owner ไม่กำหนด customer ID; Customer User ต้องผูกลูกค้าที่ active ขอบเขต Customer User อยู่ระดับลูกค้า จึงเห็นทุกไซต์ในลูกค้านั้น ไม่ใช่สิทธิ์เฉพาะไซต์หนึ่งแห่ง

## 1. สร้าง Admin คนแรก

ใน API Terminal เปิด shell ที่มี TTY แล้วรันทีละบรรทัด (รหัสผ่านไม่พิมพ์ลง history และไม่แสดงขณะกรอก):

~~~sh
printf 'Admin email: '; IFS= read -r USER_EMAIL
printf 'Display name: '; IFS= read -r USER_NAME
printf 'Password (16+ characters): '
stty -echo
trap 'stty echo' INT TERM EXIT
IFS= read -r USER_PASSWORD
stty echo
printf '\n'
USER_CREATE_ENABLED=true USER_ROLE=admin USER_CUSTOMER_ID= USER_EMAIL="$USER_EMAIL" USER_NAME="$USER_NAME" USER_PASSWORD="$USER_PASSWORD" pnpm --filter @solar/api db:create:user
unset USER_EMAIL USER_NAME USER_PASSWORD
trap - INT TERM EXIT
~~~

ถ้า terminal ไม่มี TTY ใช้ interactive terminal ใน Coolify ก่อนกรอกรหัส อย่าใส่รหัสลง command literal, repo หรือ screenshot หลังรันต้องเห็น admin: email — created แล้วเปิด https://solar.fowir.com/login ด้วย email/รหัสที่กรอก

คำสั่งนี้ทำงานได้บนฐานข้อมูลใหม่ที่ยังไม่มีลูกค้า ไม่ต้องมี SMTP และไม่ได้สร้างข้อมูลลูกค้า/ไซต์/telemetry/demo

## 2. สร้าง Owner

ใช้ขั้นตอนเดิมเปลี่ยน USER_ROLE=admin เป็น **USER_ROLE=owner** ใช้ email อีกบัญชี และ USER_CUSTOMER_ID= ว่าง Owner ใช้ข้อมูลบริษัทและเอกสารตามสิทธิ์ที่ระบบมี

## 3. เตรียมลูกค้า/ไซต์

Login Admin → จัดการลูกค้า/ไซต์ → สร้างข้อมูลจริง → จด Customer UUID หรือ Site UUID ของระบบ ค่า SITE-001 ใน MQTT เป็น external site ID **ไม่ใช่ UUID สำหรับคำสั่งเพิ่ม user**

ถ้าต้องดูรายการ UUID โดยไม่แก้ข้อมูล รันใน API Terminal:

~~~sh
node --input-type=module -e 'import {Pool} from "pg";const db=new Pool({connectionString:process.env.DATABASE_URL});try{console.table((await db.query("SELECT s.id AS site_uuid,s.name AS site_name,s.customer_id AS customer_uuid,sc.name AS customer_name FROM sites s JOIN customers sc ON sc.id=s.customer_id WHERE s.status<>$1 AND sc.status=$2 ORDER BY sc.name,s.name",["archived","active"])).rows);}finally{await db.end();}'
~~~

## 4. เพิ่ม Customer User ด้วย Customer UUID

ใช้ชุดคำสั่งกรอก email/name/password ในข้อ 1 เปลี่ยนเป็น:

~~~sh
printf 'Customer UUID: '; IFS= read -r USER_CUSTOMER_ID
USER_CREATE_ENABLED=true USER_ROLE=customer_user USER_CUSTOMER_ID="$USER_CUSTOMER_ID" USER_EMAIL="$USER_EMAIL" USER_NAME="$USER_NAME" USER_PASSWORD="$USER_PASSWORD" pnpm --filter @solar/api db:create:user
unset USER_EMAIL USER_NAME USER_PASSWORD USER_CUSTOMER_ID
~~~

ให้รันแทนบรรทัดคำสั่ง Admin ขณะตัวแปร email/name/password ยังอยู่ ไม่ต้องสร้าง Admin ซ้ำ

## 5. หรือเพิ่ม Customer User โดยระบุ Site UUID

[รายละเอียดการจัดการผู้ใช้ของไซต์](site-customer-users-th.md) ยังใช้ได้ รันหลังกรอก email/name/password แบบซ่อนรหัสเหมือนข้อ 1:

~~~sh
printf 'Site UUID: '; IFS= read -r SITE_USER_SEED_SITE_ID
SITE_USER_SEED_ENABLED=true SITE_USER_SEED_SITE_ID="$SITE_USER_SEED_SITE_ID" SITE_USER_SEED_EMAIL="$USER_EMAIL" SITE_USER_SEED_NAME="$USER_NAME" SITE_USER_SEED_PASSWORD="$USER_PASSWORD" pnpm --filter @solar/api db:seed:customer-user
unset SITE_USER_SEED_SITE_ID USER_EMAIL USER_NAME USER_PASSWORD
~~~

คำสั่งหา customer จาก site ให้อัตโนมัติ อีเมลทดสอบที่ไม่มี mailbox ใช้ได้ หาก format email ถูก เพราะสร้างบัญชี active โดยตรงไม่ส่ง invitation

## 6. เพิ่มสาม role พร้อมกันด้วยคำสั่งเดิม (ทางเลือก)

ต้องมีลูกค้า active แล้ว ใช้ PILOT_USERS_ENABLED=true, PILOT_CUSTOMER_ID=Customer UUID, PILOT_ADMIN_EMAIL/PASSWORD, PILOT_OWNER_EMAIL/PASSWORD, PILOT_CUSTOMER_EMAIL/PASSWORD แล้วรัน pnpm --filter @solar/api db:seed:users คำสั่งนี้เพิ่มเฉพาะบัญชี ไม่สร้างหรือรีเซ็ตลูกค้า/ไซต์/ข้อมูลตัวอย่าง

แนะนำ db:create:user ทีละบัญชีเพื่อไม่ต้องเก็บรหัสไว้ใน Environment Variables ถ้าเลือก seed แบบ PILOT ให้ตั้ง true เฉพาะตอนใช้ ลบ passwords และเปลี่ยน PILOT_USERS_ENABLED=false หลังรัน การตั้ง env อย่างเดียวไม่รัน seed อัตโนมัติ

## พฤติกรรมเมื่อรันซ้ำและความปลอดภัย

- ใช้ email case-insensitive, ตรวจ role/status/customer scope ให้ตรงก่อนสร้าง
- บัญชีที่มีแล้วและเข้ากันได้: preserved; password unchanged ไม่เปลี่ยนชื่อ/role/รหัสเดิมจากคำสั่งเพิ่ม
- บัญชี email ซ้ำแต่ role/ลูกค้าไม่ตรง หรือ inactive: ปฏิเสธและ rollback ไม่มีการย้ายสิทธิ์เงียบ ๆ
- รหัสใหม่ใช้ตัว hash เดียวกับ login และมี audit สำหรับการสร้าง ไม่บันทึก plaintext password ใน audit/log
- คำสั่ง manual ไม่ใช่ช่อง reset password; ใช้ workflow จัดการผู้ใช้ของระบบ
- รหัสอย่างน้อย 16 ตัวอักษร ตัวแปรอยู่เฉพาะ shell/command ไม่เพิ่มใน Compose API environment ถาวร
- ไม่ใช้ db:seed / db:seed:reset ซึ่งเป็น demo seed กับ production
