# ชุดทดสอบระบบ local

เว็บ: http://localhost:3000/login — API: http://localhost:3001/docs — Mailpit: http://localhost:18049

ชุดนี้ใช้ฐานข้อมูล Docker `solar_financial_flow_review` พอร์ต 15449 ซึ่งระบบอนุญาตออกเอกสาร TEST และส่งอีเมลเข้า Mailpit เท่านั้น เปิดแอปด้วย environment ของชุดนี้; `pnpm dev` โดยตรงยังอ่าน `.env` เดิมและอาจเชื่อมฐานข้อมูลคนละชุด

## บัญชี

ทุกบัญชี active ใช้รหัส `SolarLocal2026!` ข้อมูลทั้งหมดเป็นข้อมูลสมมติและใช้อีเมลโดเมน `.test` ซึ่งส่งอีเมลจริงไม่ได้:

| Role | ชื่อ | อีเมล |
| --- | --- | --- |
| owner | ธนกฤต วัฒนาภิรมย์ | owner@demo.solar.test |
| owner | พิมพ์ชนก ศรีวัฒน์ | owner.backup@demo.solar.test |
| admin | กิตติศักดิ์ จันทร์ประเสริฐ | admin@demo.solar.test |
| admin | อรทัย สุขเกษม | admin.backup@demo.solar.test |
| operator | ภาคภูมิ อินทร์แก้ว | operator@demo.solar.test |
| operator | ณัฐชา พงศ์ไพบูลย์ | operator.backup@demo.solar.test |
| accountant | ชนาภา รัตนวาณิช | accountant@demo.solar.test |
| accountant | วรพล ตั้งสุวรรณ | accountant.backup@demo.solar.test |
| customer_user | ผู้ติดต่อฝ่ายการเงินของแต่ละลูกค้า | `billing.<รหัสไซต์>@customer.solar.test` |

ดูบัญชี UUID ชื่อบริษัท รหัสไซต์ และชื่อไซต์แบบครบใน `output/local-system/accounts.json` และ `output/local-system/ACCOUNTS.md` ลูกค้าแต่ละบัญชีเห็นเพียงไซต์ที่ผูกไว้ Owner ดูส่วนธุรกิจ ส่วน admin ดูระบบเทคนิค Operator และ accountant ได้สิทธิ์ทดสอบใน domain ของตน ตัวอย่างบัญชีลูกค้าของไซต์ลาดกระบังคือ `billing.bkk-lkb-001@customer.solar.test`

บัญชีเดิม 5 รายใน solar_platform ถูกลบแล้ว ฐานข้อมูลทดสอบสร้างบัญชีใช้งานใหม่ครบ 18 ราย มี principal ประวัติบางรายคงอยู่เป็น inactive ไม่มี password/session เพราะข้อมูลมิเตอร์ที่ immutable ยังอ้างอิงผู้สร้างเดิม ห้ามใช้บัญชี retired สำหรับล็อกอิน

## ข้อมูลและสถานการณ์

- 10 ลูกค้า/ไซต์, 10 เกตเวย์, 20 อุปกรณ์ (มิเตอร์และ logger แยกกัน)
- ประวัติพลังงานทุก 5 นาทีและข้อมูลสด: meter ทุก 5 วินาที, logger ทุก 15 วินาที
- 9 เกตเวย์ส่งข้อมูลต่อเนื่อง; SKA-HDY-010 หาดใหญ่จงใจ offline เพื่อทดสอบ alert
- เลือกเดือนกันยายน 2026 บน Dashboard เพื่อดูประวัติครบเดือน; เดือนปัจจุบันแสดงความไม่ครบของข้อมูลตามจริงสำหรับไซต์ offline
- รอบบิลกรกฎาคม สิงหาคม และกันยายนรวม 30 รอบ; invoice 30 ฉบับ และ receipt อย่างน้อย 1 ฉบับหลังทดสอบการชำระเงิน
- ลูกค้าไซต์ `AYA-BPI-004` มีบิลกรกฎาคมชำระแล้ว ส่วนบิลสิงหาคมและกันยายนใช้ทดสอบยอดค้าง/ประวัติเอกสารได้
- กฎ offline พร้อมเหตุการณ์ alarm/recovery, notification ในแอป และอีเมลที่ Mailpit
- `check-automation.mjs` ทดสอบข้อมูลมิเตอร์ขาดที่ boundary ภายใน transaction แล้ว rollback จึงไม่ทำให้ประวัติทดสอบเสีย

## เริ่มระบบใหม่

Docker รวมอยู่ใน Compose กลุ่มเดียว `solar-financial-flow-review` มี PostgreSQL, Redis, MQTT, storage และ Mailpit โดยใช้ `scripts/local-financial-review/compose.yml` ส่วน Web, API และ Worker รัน local ผ่าน launcher ด้านล่าง

ถ้าระบบยังเปิดอยู่ ไม่ต้องรันซ้ำ เมื่อหยุดแล้วเริ่มด้วย:

```powershell
pwsh -NoProfile -File scripts/local-system/start.ps1
```

ตัว launcher ใช้ Docker และ seed เดิมที่เตรียมไว้ จากนั้นปรับชื่อและอีเมลของบัญชี fixture ให้ตรงกับ catalog ล่าสุดแบบ idempotent โดยคง UUID เดิมไว้ และเติมสำเนาเอกสาร TEST ที่หายไปจาก Mailpit ด้วย PDF ต้นฉบับที่ผ่านการตรวจ hash การเติม Mailpit ไม่แก้สถานะ delivery หรือข้อมูลการเงิน ไม่ใช่ installer สำหรับฐานข้อมูลว่าง Log อยู่ที่ `.tmp/local-system-app.log`, `.tmp/local-system-app-errors.log` และ `.tmp/local-system-publisher.log`

## จำลองการตัดรอบบิล

รันที่โฟลเดอร์ repo:

```powershell
. ./scripts/local-system/environment.ps1
pnpm exec tsx --tsconfig apps/api/tsconfig.json scripts/local-system/run-cutoff.mjs --month=2026-08
```

สคริปต์ส่งเวลาเข้า monthly service ตัวจริง: วันที่ 1 ของเดือนถัดไป เวลา 00:00 กรุงเทพฯ ต้องยังไม่ออกบิล และเวลา 01:00 จึงประมวลผล ไม่เปลี่ยนเวลาของเครื่อง ตรวจ kWh, ราคา, ภาษี 7%, ยอดรวม, invoice/PDF และอีเมลไม่ซ้ำเมื่อรันซ้ำ ผลอยู่ `output/local-system/cutoff-2026-08.json` หากเดือนนั้นเคยออกบิลแล้ว รายงานจะระบุ `existing-period-replay` ไม่อ้างว่าเป็นการสร้างใหม่

เปลี่ยน `--month` เพื่อทดสอบเดือนอื่นได้เมื่อเดือนนั้นสิ้นสุดแล้วและมีข้อมูลมิเตอร์ครบทั้งต้น/ท้ายรอบ กรณีข้อมูลไม่ครบจะรายงาน blocked และออกด้วย exit code ไม่เป็นศูนย์

## ตรวจซ้ำ

```powershell
. ./scripts/local-system/environment.ps1
node --test scripts/local-system/fixture.test.mjs
node scripts/local-system/check.mjs
pnpm exec tsx --tsconfig apps/api/tsconfig.json scripts/local-system/check-automation.mjs
node scripts/local-system/check-payment.mjs
node scripts/local-system/browser-smoke.mjs
```

`check.mjs` ตรวจครบ 18 บัญชีและเว้นช่วงตาม login rate limit ใช้เวลาประมาณ 2–3 นาที ใช้ `--roles-only` เพื่อตรวจตัวแทน 5 role เร็วขึ้น

`check-payment.mjs` ใช้ภาพที่เขียนชัดว่า SYNTHETIC TEST ONLY ตรวจปฏิเสธ/ส่งใหม่, กันหลักฐานซ้ำ, รับชำระบางส่วนและเต็มจำนวน, PDF ใบเสร็จและอีเมล ครั้งถัดไปถ้าบิลชำระแล้วจะตรวจเอกสารเดิม ไม่สร้างการชำระใหม่

`check-automation.mjs` สร้าง/ปิดกฎผ่าน API จริง แล้วประเมิน offline/recovery และจำลอง reminder วันที่ 1 ธันวาคม 2026 อีเมลทั้งหมดเข้ากล่อง Mailpit ในเครื่อง การรันซ้ำจะเพิ่มเหตุการณ์ทดสอบ alarm/recovery ชุดใหม่

เติมช่องว่างข้อมูลจำลองไม่เกิน 7 วันย้อนหลัง:

```powershell
node scripts/local-system/refresh-history.mjs --from=2026-10-10
```

ดัชนีค้นหาประวัติสำหรับ dataset ใหญ่อยู่ใน `prepare-history.mjs` และสร้างในฐานข้อมูล local เท่านั้น ไม่ได้เพิ่ม migration ของ production

## หลักฐานและสำรอง

ผลตรวจ JSON, PDF และ screenshot อยู่ `output/local-system/` สำรองก่อนแก้ผู้ใช้อยู่ `.tmp/local-system-backups/solar-platform-before-users.dump` และ `.tmp/local-system-backups/financial-before-users.dump`

`replace-users.mjs --apply` และ `normalize-staff.mjs` เป็นสคริปต์เตรียมข้อมูลครั้งแรกที่ได้รันแล้ว ไม่ต้องรันระหว่างการทดสอบทั่วไป สคริปต์ลบผู้ใช้ปฏิเสธการรันซ้ำเมื่อพบ audit marker

ขอบเขตการตรวจ: ตรวจ flow ที่ระบุด้วย API/service จริงและ browser smoke test ไม่ใช่การรับรองทุกกรณีของทั้งระบบ หรือความพร้อม production
