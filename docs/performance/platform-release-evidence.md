# หลักฐานความพร้อมก่อนเปิดใช้งาน

ยังไม่มีหลักฐานว่ารองรับขนาดเป้าหมาย 100 โรงเรียน / 1,000 มิเตอร์ / 50 ผู้ใช้พร้อมกัน หรือกู้ระบบจริงภายใน 4 ชั่วโมงและสูญข้อมูลไม่เกิน 15 นาที การทดสอบ fixture ไม่แทนหลักฐานเหล่านี้

| เงื่อนไข | หลักฐานที่ต้องมี | สถานะก่อน deploy |
|---|---|---|
| Pilot MQTT | TLS/ACL, deduplication, สิทธิ์, proxy จริง และ Gateway replay | ผล local บางส่วนมีแล้ว; ฝั่งบริษัท/firmware ยังต้องตรวจ |
| ขนาดเป้าหมาย | โหลดผสมและข้อมูล 90 วันบนเครื่องแยก, ทุก critical sample ≤2 วินาที | ยังไม่ยืนยัน |
| Archive/restore | checksum, scope, late generations, ขนาดคำขอที่ตกลง และเวลา ≤1 ชั่วโมง | อยู่ระหว่างทำ D1 |
| Backup/recovery | ปลายทางนอกเครื่อง, restore บนเครื่องแยก, raw/เอกสาร/ค่าตั้ง/สิทธิ์ครบ | อยู่ระหว่างทำ D2; ปลายทางจริงยังไม่ระบุ |
| การเงิน | semantic proposal review, อนุมัติเชื่อมโค้ด และแบบยืนยันฝ่ายบัญชี | ปิดไว้; ไม่มีการอนุมัติจาก flag |
| Accessibility | axe ตามหน้าที่ทดสอบ + keyboard/screen reader/zoom จริง | automated บางส่วนผ่าน; manual ยังไม่ครบ |

## รูปแบบหลักฐาน

ไฟล์ JSON ใช้ `version:1`, `revision` แบบ commit SHA เต็ม, `images` มี api/web/worker/postgres/mqtt/certbot เป็น digest, `configurationFingerprint` SHA-256 จาก configuration ของ release, `profile` เป็น fixture หรือ target, `verifiedAt` และ `expiresAt` พร้อม timezone

สร้าง identity ด้วย `bash scripts/ci/platform-release-check.sh --identity` ใน API runtime ที่ต่อ worker/backup status จริง fingerprint รวมค่าที่ API ใช้กับ hashes จาก actual worker environment และ PostgreSQL backup environment ไม่ใช้ hash ที่ผู้เรียกป้อนแทน dependency อ่านสถานะ PostgreSQL ที่อายุไม่เกิน 180 วินาที; missing/stale identity ทำให้ไม่ยืนยันทุก gate

`checks` ระบุผลจริงของ security, ingestion, proxy, gatewayReplay, recovery, documents, configuration, roles, rawIntegrity, archive, archiveCoverage, summaryCoverage, financialEvidence, retentionApproval และ capacity แต่ละค่าเป็น boolean ห้ามเปลี่ยนเป็น true เพื่อให้ผ่านโดยไม่มี artifact รองรับ

`measurements` เก็บ rtoSeconds/rpoSeconds/restoreSeconds ที่วัดได้ ส่วน `restoreEnvelope` ต้องระบุ maxSites/maxDays/maxRows และ verifiedRows ไม่อ้างเวลา 1 ชั่วโมงกับคำขอที่ใหญ่กว่าที่ทดสอบ

ตรวจใน CI ด้วย `bash scripts/ci/platform-release-check.sh --evidence <file> --gate monitoring` สำหรับ pilot หรือเลือก recovery/retention ตามขอบเขต หากไม่ระบุ gate จะตรวจทั้งหมดและ fail ขณะการเงินยังไม่พร้อม

ผลของ validator เป็นการตรวจความสอดคล้องและความครบของหลักฐาน ไม่ใช่ผู้สร้างหลักฐานหรือใบรับรองมาตรฐาน ต้องเก็บ logs, hashes, hardware, ขนาดข้อมูล และผู้ตรวจไว้ประกอบ release เดียวกัน

ขณะนี้ `retentionReady` เป็น `false` เสมอ เพราะการตรวจ checksum และช่วงเวลาใน archive ยังไม่พิสูจน์ว่าครอบคลุมข้อมูลทุกแถวที่ส่งมาช้าหรือถูกแก้ไข ห้ามเปิดลบ raw จากผลตรวจ object เพียงอย่างเดียว และ `financialReady` ยังคง `false` จนผ่านงาน F2 โดยเฉพาะ
