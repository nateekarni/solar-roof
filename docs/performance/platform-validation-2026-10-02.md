# ผลตรวจระบบก่อน staging — 2 ตุลาคม 2026

ขอบเขตคือโค้ดบน branch `codex/platform-review-2026-10-01` และ container ทดสอบในเครื่อง ไม่ได้ deploy หรือวัดโหลดเต็มขนาดบนเครื่องบริษัท ระบบการเงิน F2 ยังไม่ถูกรวมตามคำสั่งผู้ใช้

## ผลที่ตรวจแล้ว

| การตรวจ | ผลและขอบเขต |
|---|---|
| Build | สร้าง API, worker, web, MQTT, certbot และ PostgreSQL backup image สำเร็จ |
| Lint / unit | `pnpm lint` และ `pnpm test` ผ่านครบ 8 workspace tasks; CI JavaScript tests 12/12 ผ่าน |
| MQTT / certificate | Python tests 11/11 ผ่าน; TLS, authentication, ACL, เปลี่ยนใบรับรองสองครั้ง, persistence และการปฏิเสธค่าผิดผ่าน |
| Regression | `all-fast` ผ่าน 87 tests พร้อม browser flows; มี archive 8 tests และ readiness 8 tests รวมอยู่แล้ว ไม่ได้นับซ้ำ |
| Browser / integration | Login ทุกบทบาท, ข้อมูลข้ามโรงเรียนถูกปฏิเสธ, รายงานสร้างโดย worker จริง, checksum หลัง restart, มือถือ, keyboard และ automated accessibility ผ่าน |
| Gateway fixture | รับข้อมูลจริงผ่าน broker, บันทึกก่อนตอบรับ, ส่งซ้ำหลัง restart โดยไม่เพิ่มข้อมูลซ้ำ และตรวจ readiness เมื่อฐานข้อมูล/broker/storage หยุดชั่วคราวผ่าน |
| กู้คืนในเครื่อง | PITR, ไฟล์ต้นฉบับ/config, สิทธิ์ 5 บทบาท, MQTT replay และกรณี WAL ขาด/ปลายทางไม่ว่าง/repository เข้าไม่ได้ผ่าน |
| Backup ค้าง | หยุด pgBackRest ที่ scheduler เรียกจริง 191.373 วินาที ตรวจ 7 ครั้งว่า status/heartbeat ยังเดินและ health ยังผ่าน ก่อนปล่อยให้ทำงานต่อ |
| โหลดขนาดเล็ก | ผู้ใช้ 5 คน, 2 โรงเรียน, 8 มิเตอร์, ประวัติจำลอง 720 แถว; 80 page samples ผ่านทุกครั้ง ไม่เกิน 2 วินาที สูงสุด 1,283.312 ms; error 0 |
| ความครบถ้วนภายใต้โหลด | MQTT ตอบรับและบันทึกครบ 72 ข้อความ, ข้อมูลซ้ำ 0, ข้อมูลที่ตอบรับแต่ไม่บันทึก 0; รายงาน 2 งานเสร็จ |

ตรวจ regression และ staging Compose ซ้ำด้วย image ชุดสุดท้ายหลังแก้ LF แล้ว ทั้งสองคำสั่งจบด้วย exit 0: `joint-allfast-final.log` มี 87 tests ไม่มี failure พร้อม browser flows และ `joint-managed-final.log` ยืนยัน bootstrap ซ้ำ, TLS broker, API, worker และ web readiness ผ่าน ตรวจหลัง cleanup แล้วไม่มี container ของชุดทดสอบค้างอยู่

## ข้อจำกัดของตัวเลข

Docker ที่ใช้ทดสอบรายงาน 12 CPU และ RAM ประมาณ 4 GB ไม่ใช่เครื่อง pilot 2 CPU การวัดหน้าเว็บใช้ browser context ใหม่และ context เดิม ยังไม่ได้พิสูจน์ PostgreSQL/OS cold cache และยังไม่พิสูจน์ว่ารายงานใหญ่สองงานทำงานซ้อนกันระหว่าง burst/replay จริง ผล `releaseGate` สำหรับขนาดเป้าหมายจึงยังเป็น `fail` ตามที่ออกแบบ แม้ smoke command ผ่าน

การซ้อมกู้ใช้ backup ประมาณ 4.87 MB ได้ RTO 31.7 วินาที / RPO 3.049 วินาที ตัวเลขนี้เป็น fixture เท่านั้น `productionRecoveryVerified=false` ต้องซ้อมกับข้อมูลจริงบนโฮสต์อิสระก่อนรับรองเป้าหมาย 4 ชั่วโมง / 15 นาที

ยังไม่รับรองการกู้ข้อมูลดิบเกิน 90 วันภายใน 1 ชั่วโมงจนกว่าจะกำหนดและทดสอบขนาดคำขอสูงสุด ยังไม่รับรอง full WCAG จาก automated checks อย่างเดียว

## สิ่งที่แก้จากการทดสอบรอบรวม

- ปรับ cleanup ของ fixture ให้ล้างเฉพาะ dirty/checkpoint ของ test site หลังลบ raw fixture โดยไม่ลดข้อบังคับที่ป้องกันข้อมูลจริง
- แก้การส่ง argument `-f` ให้ Node ใน runner และแยก assignment ออกจาก `export` เพื่อให้ข้อผิดพลาดหยุด runner จริง
- ปรับ integration เดิมจากรายงานตอบกลับทันทีเป็น HTTP 202 → worker ready → ดาวน์โหลดไฟล์จริง พร้อม checksum และ scope
- ตรวจ structured metric ของข้อความ MQTT ที่ถูกปฏิเสธ พร้อมตรวจว่าไม่มี ACK และไม่มี payload ลับใน log
- แก้ CRLF ที่ท้ายสคริปต์ backup และเพิ่ม `bash -n` ใน Linux image/CI เพราะ Git Bash บน Windows ไม่พบข้อผิดพลาดนี้
- ใช้ UID เดียวกับ pgBackRest ใน fault fixture เพื่ออ่าน process identity และส่ง signal โดยไม่เพิ่มสิทธิ์ container
- ใช้ URL จริง `/settings/audit` ใน workload และคง assertion เรื่อง URL, error และเวลา 2 วินาที

## การตัดสินใจและต้นทุนที่ยอมรับ

- เก็บข้อมูลดิบต่อและปิดการลบไว้: catalog ครอบคลุมเวลาไม่ได้พิสูจน์ว่าข้อมูลมาช้าหรือแก้ย้อนหลังเก็บครบ ต้นทุนคือใช้พื้นที่เพิ่มจนมีหลักฐานและนโยบายครบ
- แยกตัวสุ่มตรวจสถานะออกจากงาน backup: heartbeat ไม่หยุดตามงานยาว ต้นทุนคือมี process และการอ่านสถานะเพิ่มเติม โดยจำกัดเวลาแต่ละรอบ
- ผูก readiness กับ revision, image และ hash ของ config ที่อ่านจากบริการจริง: หลักฐานเก่าหรือไม่ตรงชุดระบบใช้ไม่ได้ ต้นทุนคือรอ status สดและ dependency identity; JSON หลักฐานไม่ใช่ใบรับรองแทนผลทดสอบ
- ใช้ fixture แยกฐานข้อมูล/broker และไม่ทดสอบเต็มขนาดบนเครื่องบริษัทร่วมกับระบบอื่น: ต้องมีรอบวัด target เพิ่ม ไม่ใช้ผลขนาดเล็กรับรอง 1,000 มิเตอร์/50 ผู้ใช้
- คง branch ปัจจุบันและเก็บข้อเสนอการเงินแยก ไม่ push/merge/deploy ในงานนี้

## หลักฐานและการทำซ้ำ

หลักฐานใน workspace อยู่ใต้ `test/artifacts/` ซึ่งถูก ignore เพื่อไม่ส่งข้อมูลทดสอบขึ้น Git: `joint-allfast-final.log`, `joint-integration-3.log`, `joint-managed-final.log`, `joint-recovery-3.log`, `recovery-result.json`, `joint-capacity-2.log` และ `platform-capacity.json` ผลล้มเหลวรอบก่อนยังเก็บแยก ไม่เปลี่ยนให้เป็นผลผ่าน

การทดสอบ all-fast ในเครื่องใช้ runner ภายในที่เรียกขั้นตอนจาก `scripts/ci/platform-check.sh` และระบุ immutable image ID โดยตรง ไม่ปลอม environment เป็น CI ส่วนคำสั่งมาตรฐานสร้าง image เองได้ด้วย `bash scripts/ci/platform-check.sh all-fast`; CI ใช้ `--prebuilt` เฉพาะ revision ที่ตรงกัน

Image ที่ทดสอบในรอบนี้อยู่ใน Docker ของเครื่องพัฒนา ยังไม่ได้เผยแพร่ขึ้น registry ก่อนตั้ง Coolify ต้องนำโค้ดเข้ากระบวนการ commit/merge และให้ CI สร้าง ทดสอบ และเผยแพร่ image แล้วใช้ registry digest ที่ CI รายงาน ห้ามนำ local image ID มาใช้แทน registry reference

ดูขั้นตอนบนเครื่องจริงใน [สถานะก่อน deploy](../runbooks/predeploy-status-2026-10-02.md), [คู่มือ Coolify](../runbooks/coolify-staging-deployment-th.md) และ [กู้คืนระบบ](../runbooks/disaster-recovery.md)
