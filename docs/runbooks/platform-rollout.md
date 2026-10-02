# นำระบบขึ้น Coolify และย้อนกลับอย่างตรวจสอบได้

เอกสารนี้เป็นขั้นตอนเตรียมและตรวจ release ไม่ใช่หลักฐานว่า staging ผ่านแล้ว ใช้ `solar.fowir.com` และ MQTT `mqtt-solar.fowir.com:8883` การรับข้อมูลยังเป็น Gateway ส่ง MQTT เข้าระบบ

ผลทดสอบในเครื่องล่าสุดอยู่ใน [รายงานตรวจระบบ](../performance/platform-validation-2026-10-02.md) สำหรับ pilot ยังเริ่มด้วย flags ของ archive/restore/retention เป็น `false` ได้ การเปิด archive อัตโนมัติภายหลังต้องเปิดทั้ง `TELEMETRY_ARCHIVE_ENABLED` และ `TELEMETRY_ARCHIVE_SCHEDULER_ENABLED` เมื่อทดสอบ storage และขอบเขตข้อมูลแล้ว ส่วนคำขอกู้ข้อมูลย้อนหลังต้องเปิด `HISTORY_RESTORE_ENABLED` ที่ API และ `HISTORY_RESTORE_WORKER_ENABLED` ที่ worker ให้สอดคล้องกัน พร้อมมี archive ที่ตรวจสอบแล้ว คง `RAW_RETENTION_ENABLED=false` จนกว่าจะมีหลักฐานว่าข้อมูลทุกแถวปลอดภัยและได้รับอนุมัตินโยบายการลบ

## ก่อนกด Deploy

1. ตรวจสรุปผล CI ของ commit ที่จะใช้ ต้องมีผล integration, MQTT TLS/ACL, browser และ migration ไม่ใช้เพียงสถานะ build สำเร็จ
2. จด commit SHA และ image digest ของ API, web, worker, MQTT, certbot และ PostgreSQL ที่ทดสอบจริงไว้ในบันทึก release ใช้รูปแบบ `ชื่อ-image@sha256:...` ไม่ใช้ `latest`
3. ให้ผู้ดูแลเลือกปลายทางสำรองนอก server และตั้ง credentials ผ่านช่อง Environment Variables ของ Coolify แยกจากรหัสของแอป เก็บกุญแจถอดรหัสและข้อมูลกู้ระบบไว้ภายนอกเครื่องด้วย ไม่ส่ง secret ลง issue/chat/repository
4. สำรองฐานข้อมูลเดิม เอกสารต้นฉบับ และค่าตั้งที่ใช้กู้ระบบ ตรวจว่าอ่านจากปลายทางได้จริง จด digest รุ่นที่กำลังใช้งานเพื่อย้อนกลับ
5. ตรวจ named volumes ใน Coolify ให้ตรงกับบริการ ห้ามสร้างฐานใหม่ทับชื่อเดิมหรือเลือกคำสั่งลบ volume เมื่อเพียงเปลี่ยน image
6. ตรวจ DNS/ใบรับรองทั้งเว็บและ MQTT รวมพอร์ตที่ Gateway ใช้ ตรวจ proxy chain ด้วยค่าที่เห็นจริงจาก server ไม่เดาจำนวน hop หรือเชื่อ `X-Forwarded-For` จาก client

## ตั้งค่า Resource

1. เปิด Project ของระบบใน Coolify เลือก environment staging และ resource ที่ผูก repository `solar-roof`
2. ตรวจ branch เป็น `main` ตามวิธีทำงานที่ตกลง และ Compose เป็น `infra/docker/docker-compose.staging.yml` commit ที่เลือกต้องมี image ชุดที่ผ่านการทดสอบ อย่ากด deploy จาก branch งานที่ยังไม่รวม
3. ใน Environment Variables ใส่ image digest และค่าตั้งตาม `.env.staging.example` ของ commit นั้น ตั้ง domain เว็บ `https://solar.fowir.com` ส่วน MQTT ใช้ค่าตั้ง broker/TLS ที่เตรียมไว้
4. คงงานการเงิน การลบข้อมูลเก่า และ worker ใหม่ที่ยังไม่มีหลักฐานไว้เป็น `false` การเปิด flag อย่างเดียวไม่ใช่หลักฐานอนุมัติใช้งาน
5. ตรวจที่เก็บ archive/backup และ volume สถานะ backup ต้องต่อถูกปลายทาง ค่าที่ API อ่านเป็นสถานะควร mount แบบ read-only
6. ตรวจ migration service ให้ใช้ API digest เดียวกับที่จะ deploy และรันสำเร็จก่อนตรวจ API readiness ห้ามแก้ checksum หรือย้อน migration ด้วยการลบตาราง

## หลัง Deploy

1. รอ health/readiness ของบริการครบ ดู Logs ว่าฐานข้อมูล, MQTT และ storage เชื่อมต่อได้ ไม่มี restart วน
2. เปิดเว็บ ลอง login/logout และบัญชีทดสอบตาม role ตรวจว่าโรงเรียนหนึ่งไม่เห็นข้อมูลอีกโรงเรียน
3. ทดสอบส่ง MQTT ด้วย Gateway ทดสอบและมิเตอร์ที่กำหนด ยืนยันข้อมูลถูกเก็บและเห็นบนหน้าเว็บ ตรวจ timestamp/หน่วย/ข้อมูลไม่สด และส่งข้อความเดิมซ้ำต้องไม่เกิดแถวซ้ำ
4. ทดสอบหยุดเชื่อมต่อช่วงสั้นตามที่ตกลง แล้วให้ Gateway ส่งข้อมูลย้อนหลัง ยืนยันข้อมูลที่ขาดกลับมาครบก่อนขยาย pilot
5. ตรวจรายงานเบื้องหลัง: queued → running → ready และเปิดไฟล์ได้ด้วยสิทธิ์ปัจจุบัน ถ้า storage ขาดหายต้องแสดงข้อผิดพลาดจริง
6. เริ่ม pilot 1 Gateway และเก็บหลักฐานต่อเนื่อง 24 ชั่วโมง พร้อมความผิดพลาด/ข้อมูลขาด/ทรัพยากร ห้ามนำ load test เต็มขนาดไปรันบน server บริษัทที่มีระบบอื่น
7. ตรวจ backup ล่าสุดและ WAL ที่ยังรอส่งก่อนและหลัง deploy การที่เว็บเปิดได้ไม่ยืนยันว่ากู้ข้อมูลได้

## Readiness และการแจ้งเตือน

- `/ready` ใช้บอกความพร้อมให้บริการของ process ส่วน `/v1/platform/readiness` เป็นผลตรวจหลักฐาน release สำหรับ owner/admin สองสิ่งนี้มีวัตถุประสงค์ต่างกัน
- หลักฐาน release ต้องตรง revision, digests และ fingerprint ของ configuration ปัจจุบัน มีอายุไม่เกิน 24 ชั่วโมง หากเปลี่ยนค่าตั้งหรือ image ให้สร้างและตรวจหลักฐานใหม่
- เป้าหมายกู้คืนต้องมีผลจากเครื่องแยกจริง รวมเอกสาร ค่าตั้ง สิทธิ์ และข้อมูล ไม่ใช้ผล fixture ท้องถิ่นรับรอง 4 ชั่วโมง/15 นาที
- เริ่มแจ้งเตือนเมื่อผู้รับและการเชื่อมต่อได้รับการตรวจแล้วเท่านั้น ค่าเริ่มต้นปิด ส่ง payload เฉพาะรหัสเหตุการณ์และเวลา ไม่มี secret
- เกณฑ์เริ่มต้น: WAL รออย่างน้อย 10 นาที, backup เกิน 26 ชั่วโมง, disk 80%, งานลองใหม่หมด และ ingestion ติดขัดต่อเนื่อง; ดู `/v1/platform/monitoring`
- สถานะ delivery `uncertain` หมายถึงไม่ทราบว่าปลายทางรับหรือไม่ ให้ตรวจ event ID กับผู้รับก่อนส่งใหม่ ปลายทางควรรองรับ `Idempotency-Key` ไม่มีการอ้างส่งสำเร็จจาก timeout

## ติดตั้งหลักฐาน release ผ่าน Coolify

1. ตั้ง `PLATFORM_RELEASE_REVISION` เป็น commit ที่ทดสอบ และ `PLATFORM_IMAGE_DIGESTS_JSON` เป็น JSON ของ `api`, `web`, `worker`, `postgres`, `mqtt`, `certbot` โดยแต่ละค่าเป็น `sha256:...` ของ image ที่รันจริง ตรวจคู่กับ digest จาก CI
2. หลังเปลี่ยนค่าตั้ง ให้รอ PostgreSQL เขียน status รอบใหม่และตรวจ `observedAt` ว่าใหม่กว่าเวลาที่เปลี่ยนค่า จากนั้นเปิด Terminal ของ service `api` ในหน้า Coolify แล้วรัน `cd /app && pnpm exec tsx scripts/ci/platform-release-check.ts --identity` คำสั่งนี้อ่าน fingerprint ของ API, worker ที่กำลังรัน และสถานะ PostgreSQL ล่าสุด คืนเฉพาะ hashes ไม่คืน secret หาก backup/worker identity ยังไม่พร้อมให้แก้สาเหตุ ไม่เติม hash เอง
3. เตรียม JSON ตาม [รูปแบบหลักฐาน](../performance/platform-release-evidence.md) โดยใช้ identity ที่ได้และผลทดสอบจริง ใส่ `false` สำหรับข้อที่ยังไม่มีหลักฐาน เก็บ logs และผู้ตรวจไว้ด้วย
4. ใน Environment Variables ของ resource ใส่ JSON ลง `PLATFORM_RELEASE_EVIDENCE_JSON` แล้ว Save และ Redeploy ตามช่วงหยุดที่ตกลง Service `release-evidence` จะติดตั้งไฟล์แบบ atomic ก่อน API เริ่ม และ API อ่าน volume นี้แบบ read-only ค่าว่างหมายถึงยังไม่มีหลักฐาน ไม่ใช่ผ่าน
5. ตรวจ Logs ของ `release-evidence` ว่าจบด้วย exit 0 และตรวจ `/v1/platform/readiness` ด้วยบัญชี owner/admin หากเปลี่ยนค่าตั้ง backup/worker หรือหลักฐานหมดอายุ ผลจะกลับเป็นไม่ยืนยัน ต้องทดสอบและออกหลักฐานใหม่

วิธีนี้ใช้ named volume ที่ประกาศใน Compose และช่อง Environment Variables ไม่ต้อง SSH หรือแก้ไฟล์บน host เอง Coolify ให้ Compose เป็นแหล่งกำหนด storage: [เอกสาร Docker Compose storage](https://coolify.io/docs/applications/builds/docker-compose)

## ขั้นตอนย้อนกลับ

1. ระบุผู้รับผิดชอบเหตุขัดข้อง ผู้กู้ระบบ ผู้ตรวจความถูกต้อง และผู้ดูแล DNS ในบันทึก release ก่อนเริ่มใช้งานจริง
2. หยุดเปิดใช้ feature ใหม่และตรวจให้ Gateway เก็บข้อมูลรอส่งตามที่พิสูจน์แล้ว
3. เลือก image digest รุ่นก่อนที่ผ่านการทดสอบว่าอ่าน schema ใหม่ได้ แล้ว Redeploy ผ่าน Coolify
4. คง named volumes และ schema ที่เพิ่มไว้ ไม่กดลบ volume และไม่รัน down migration ที่ลบข้อมูล
5. ตรวจ login/สิทธิ์/ข้อมูลล่าสุด/เอกสาร/MQTT replay อีกครั้ง หากฐานเสียหายให้ใช้ขั้นตอนกู้ไป volume ใหม่ ไม่ restore ทับฐานปัจจุบัน
6. จดเวลาตั้งแต่ประกาศเหตุจนผู้ใช้กลับมาใช้ได้ และวัดข้อมูลสูญหายก่อน Gateway replay เพื่อไม่ให้ replay กลบปัญหา backup
