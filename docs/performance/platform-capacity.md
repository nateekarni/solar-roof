# หลักฐาน capacity ของ platform

สถานะ 2026-10-02: เตรียม source harness แล้ว ยังไม่มีผล smoke/target ที่ยืนยันจาก runner นี้ และ **release gate ยังไม่ผ่าน** ห้ามใช้ unit test หรือ fixture ขนาดเล็กอ้างรองรับ 100 โรงเรียน / 1,000 มิเตอร์ / 50 ผู้ใช้ / ทุกหน้าไม่เกิน 2 วินาที

## วิธีรันในเครื่องแยก

ใช้ Node 24.20.0 / pnpm 11.24.0 พร้อม Docker และ Chromium ของ Playwright ที่ติดตั้งแล้ว:

```sh
bash scripts/ci/platform-load.sh --profile smoke --history-days 90
```

runner ใช้ project `solar-ci-UUID`, loopback ports และ lock ร่วมกับ isolated-stack; cleanup เฉพาะ project ที่สร้างเอง ห้ามรันชน suite อื่น `CAPACITY_PREBUILT=true` ใช้ image ที่ตรวจ revision label ตรง HEAD เท่านั้น; artifact บันทึก image ID จริงด้วย label อย่างเดียวไม่ได้พิสูจน์ uncommitted source

target ต้องรันบนเครื่องทดสอบแยกที่ไม่มีข้อมูลบริษัท กำหนด `CAPACITY_DEDICATED=true`, `CAPACITY_APPROVED_HOST` เท่ากับ hostname จริง และ `CAPACITY_APPROVED_DAEMON_ID` เป็น ID ของ Docker daemon ที่ผู้ดูแลอนุมัติ ตรวจ daemon name/ID และ effective endpoint ก่อน build/up และก่อน seed; อนุญาตเฉพาะ `unix:///var/run/docker.sock` ไม่รับ SSH/TCP/forwarded endpoint หรือ Docker Desktop target. เก็บ daemon CPU/memory แยกจาก launcher. ก่อน seed ตรวจ free disk ใน volume PostgreSQL อย่างน้อย 500 GiB เป็น safety floor ไม่ใช่ sizing guarantee ปฏิเสธชื่อ fowir/staging/pilot/shared และ CI event ที่ไม่ใช่ workflow_dispatch

```sh
bash scripts/ci/platform-load.sh --profile target --history-days 90
```

workflow `platform-capacity.yml` ใช้ self-hosted labels `linux,capacity-isolated` และ environment `capacity-isolated`; ผู้ดูแลต้องตั้ง required reviewer และผูก runner กับเครื่องแยกก่อนใช้งาน ไม่ใช้ shared pilot หรือ PR runner

## สิ่งที่วัดและขอบเขต

| ประเด็น | smoke | target |
|---|---:|---:|
| โรงเรียน / มิเตอร์ / admin users | 2 / 8 / 5 | 100 / 1,000 / 50 |
| raw history | 720 rows, sampling รายวัน 90 วัน | 129,600,000 rows, sampling ทุกนาที 90 วัน |
| steady | 24/min เป็นเวลา 60s | 1,000/min เป็นเวลา 60s |
| burst | 8 | 1,000 |
| replay pressure | 240/min เป็นเวลา 10s | 10,000/min เป็นเวลา 600s |
| concurrent export requests | 2 | 2 |

fixture สร้าง billing ย้อนหลัง 24 เดือนต่อไซต์ และ audit 100/100,000 รายการ ไม่สร้างเอกสารการเงินจริง ไม่เปิด F2 และไม่เปลี่ยน applied migrations. seed และ MQTT ใช้ triggers จริง ไม่ปิด replication triggers. การ seed 129.6 ล้าน rows อาจใช้เวลามากและยังไม่ได้วัดระยะเวลา

ส่ง MQTT QoS1 แต่ถือเฉพาะ `status=acknowledged` จากแอปเป็น ACK ตรวจ persistence ด้วย ingestion hash + source_time และตรวจ duplicate rows หลังส่ง payload เดิมซ้ำ. รอ initial app ACK ครบก่อนเริ่มรอบซ้ำ แล้วรอ ACK ที่ `duplicate=true` ครบทุก ID ของรอบซ้ำก่อน query แถว ไม่ใช้ PUBACK เป็น barrier. เก็บ ACK latency แยกจาก broker PUBACK. Replay rate เป็น stress profile ที่กำหนดเพื่อทดสอบ ไม่ใช่ firmware SLA

เปิดหน้า `/`, `/sites`, `/billing`, `/settings/audit` พร้อมกันตามจำนวน users ผ่าน session จาก login จริง เวลาจบเมื่อข้อมูลสำคัญ/แถวข้อมูลแสดง ไม่ใช้ networkidle เก็บทุก sample, p50/p95/p99/max; sample ใดเกิน 2,000 ms ให้ smoke ล้มเหลวด้วย ห้ามลด budget เพื่อให้เขียว ใช้ admin ทุกคนเพื่อวัด global scope; ไม่อ้างเป็น role distribution ของผู้ใช้จริง

รายงาน `test/artifacts/platform-capacity.json` เก็บ revision, image IDs, hardware/disk, rows, scenario, page samples, ACK/persistence, query plans ของ source query billing/audit, lock observations และ container memory observations. หน่วยความจำยังเป็น sampled observations จึงไม่ใช่ peak ระดับทุก allocation

เก็บ `pg_stat_wal.wal_bytes`, stats_reset และ WAL LSN ก่อน/หลัง steady, burst, replay, duplicate พร้อม delta ของแต่ละช่วง เป็นทั้งฐานที่มี worker/report ทำงานร่วม ไม่ตีความเป็น overhead ต่อข้อความล้วน ๆ; stats อาจรายงานช้าและเก็บ reset identity เพื่อไม่ลบข้ามการ reset

## Gate และข้อจำกัดที่ต้องปิด

เวลาแต่ละ page sample (`ms`) วัดจาก navigation start จนถึง frame แรกที่ข้อมูลสำคัญแสดงใน browser: KPI ของ Dashboard หรือจำนวนรายการพร้อมแถวข้อมูลที่โหลดเสร็จของหน้ารายการ เก็บ `driverElapsedMs` แยกเป็นเวลารวมของ Playwright รวมการตรวจ HTTP, URL และข้อความ error หลังข้อมูลแสดงแล้ว; ค่านี้ไม่ใช้แทนเวลาที่ข้อมูลพร้อมแสดง เกณฑ์ทุก sample ไม่เกิน 2 วินาทีคงเดิม

1. smoke ผ่านได้เฉพาะ functional/latency assertions แต่ `releaseGate=fail` เสมอ เพราะลดขนาด
2. target ต้องครบข้อมูล ผู้ใช้ workload ไม่มี missing ACK/duplicate/error และอย่างน้อย 400 page samples ทุก sample <=2s
3. browser-cold/browser-warm เป็น context/page load state เท่านั้น ไม่ใช่ PostgreSQL/OS cold cache. ปัจจุบัน runner ตั้ง `coldAndWarm=false` จึง **target ยัง fail closed แม้ตัวเลขอื่นผ่าน** ต้องเพิ่ม cold DB evidence ที่ตรวจได้ก่อนประกาศ target pass
4. page waves เริ่มพร้อม steady และ burst/replay; ยังไม่ใช่การเปิดหน้าตลอด replay 10 นาที ต้องเพิ่ม wave ต่อเนื่องก่อน full capacity claim
5. EXPLAIN หลัง workload ไม่ใช่ plan/lock trace ทุก query ภายใต้ peak; sampling lock ทุก 5 วินาทีอาจพลาด transient contention
6. ยังไม่วัดบนเครื่อง 2 CPU / RAM ~4 GB; hardware inventory ของเครื่อง generator/containers ไม่ใช้แทน resource-isolated pilot proof และยังเสนอ sizing จากผลจริงไม่ได้
7. token login setup นอก measured interval ใช้ real rate limit; target ใช้เวลาตั้ง session หลายนาที ต้องตรวจ session expiry ระหว่าง long export ในผลจริง
8. เก็บ actual elapsed/rate ของ steady/replay และ burst; gate ไม่ยอมให้นับครบแต่ค่อย ๆ ส่งช้าไปเรื่อย ๆ (steady/replay drift ไม่เกิน 5%, burst ภายในหนึ่งนาที) ค่านี้เป็น tolerance ของ generator ไม่เปลี่ยนเกณฑ์หน้าเว็บ 2 วินาที
9. target ต้องมี sampled observation ว่า export ทั้งสองมีสถานะ running ระหว่าง burst/replay ไม่ใช้เพียง accepted พร้อมกัน ถ้า export จบก่อนช่วงดังกล่าว gate จะ fail. การ sample ทุก5วินาทีไม่พิสูจน์ว่าทั้งสองทำงานตลอดช่วง

CI smoke snippet สำหรับผู้ดูแล shared workflow (ไม่เพิ่ม target เข้า PR):

```yaml
- run: CAPACITY_PREBUILT=true bash scripts/ci/platform-load.sh --profile smoke --history-days 90
```

รันแบบ serial หลัง all-fast และ upload artifacts แม้ failure. ก่อน deploy ต้องแนบผลจริงและทบทวน gate ที่ยังไม่ผ่าน; ห้ามสรุป capacity จากการตรวจ syntax/unit เท่านั้น
