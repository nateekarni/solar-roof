# กู้ระบบจากโฮสต์ที่เสียหาย

สถานะ: implementation และ isolated fixture ไม่ใช่หลักฐานว่า production กู้ได้ภายใน 4 ชั่วโมง/เสียข้อมูลไม่เกิน 15 นาที ต้องผ่าน target drill บนโฮสต์อิสระพร้อมข้อมูลขนาดที่ตกลงก่อนเปิด recovery readiness ห้ามนับ Gateway replay เป็นการชดเชย RPO ของผู้ใช้/การเงิน

## Image และ repository

ใช้ managed `postgres-backup` image digest ที่ CI ทดสอบ โดยฐาน PostgreSQL16/TimescaleDB2.18.2 pin ที่ digest `83bf45d0384a17644c49fdc68bde3e1f19e190fc259fe4f81fd41459d4e0f8be` และ pgBackRest2.59.2 source SHA256 `dbdc5edb5161c57bd3ae61e416b1cd763205ad6ce41d9356114432a0cc0ce577` ตรวจ checksum ก่อน compile และรัน upstream smoke test

ใน Coolify ตั้ง `BACKUP_ENABLED=true`, `PGBACKREST_REPO1_S3_ENDPOINT`, `PGBACKREST_REPO1_S3_BUCKET`, `PGBACKREST_REPO1_S3_REGION`, `PGBACKREST_REPO1_S3_KEY`, `PGBACKREST_REPO1_S3_KEY_SECRET`, `PGBACKREST_REPO1_CIPHER_PASS` และ prefix `PGBACKREST_REPO1_PATH` เฉพาะระบบนี้ ใช้ HTTPS พร้อม certificate verification ตาม default ไม่ใช้ค่าปิด TLS ของ fixture ใน production คีย์ repository แยกจาก app storage/DB และเก็บ encryption key ใน escrow นอก failed host ที่ผู้รับผิดชอบกู้คืนเข้าถึงได้

repository ต้องเป็นคนละ failure domain/โฮสต์ ใช้ least-privilege bucket policy สำหรับ prefix ของระบบ ไม่ให้ lifecycle ของ bucket ลบ WAL/backup จนมีนโยบายอนุมัติ การใส่ MinIO ในเครื่องเดียวกับ DB ทำได้เฉพาะ fixture และไม่ทำให้ off-host readiness ผ่าน

scheduler ทำ full ครั้งแรกและทุก 7 วัน, differential วันถัดไป (UTC); WAL archiving ต่อเนื่อง `archive_timeout=300s`, synchronous archive, `expire-auto=n` ไม่มี queue overflow discard ไม่มีคำสั่ง expire อัตโนมัติ ต้องติดตาม disk growth เพราะการไม่ลบข้อมูลมีต้นทุนพื้นที่

## เอกสารต้นฉบับและ configuration

DB physical backup ไม่ครอบคลุม object store ใช้ API image เดียวกับ release เป็น Coolify resource แยก รัน `bash /app/scripts/ci/recovery-artifacts-scheduler.sh` โดย default `DR_ARTIFACT_BACKUP_ENABLED=false`; เมื่อมีปลายทางที่อนุมัติจึงเปิด true. Loop รันทีละงานทุก300s ค่าเริ่มต้น (DR_ARTIFACT_BACKUP_INTERVAL_SECONDS ช่วง60–900s), จำกัดแต่ละงาน300s (DR_ARTIFACT_BACKUP_TIMEOUT_SECONDS สูงสุด900s) ไม่มีงานซ้อน และหยุดchildเมื่อresourceถูกหยุด. เก็บ generation ก่อนการเปลี่ยน release/config สำคัญเพิ่มเติม ไม่อ้างว่าตั้งCoolifyresourceภายนอกจริงแล้ว โดยกำหนด:

- `DR_DOCUMENTS_ENDPOINT/REGION/BUCKET/ACCESS_KEY/SECRET_KEY` สำหรับอ่าน original documents
- `DR_REPOSITORY_ENDPOINT/REGION/BUCKET/ACCESS_KEY/SECRET_KEY` สำหรับปลายทางนอกโฮสต์
- `DR_ARTIFACT_CIPHER_PASS` แยกจาก app credential และเก็บ escrow
- `DR_CONFIG_EXPORT_FILE` เป็นไฟล์ export ที่ operator เตรียมจาก Coolify มี image digests, flags, volumes, network/DNS และ credential reference/recovery procedure; รวม secret ที่จำเป็นอย่างเข้ารหัสตามนโยบายองค์กร ไม่มีการเก็บไฟล์นี้ใน git

utility เข้ารหัส AES-256-GCM/scrypt แต่ละ object/config และ manifest แยก generation, ดาวน์โหลดกลับเพื่อตรวจ hash ของ objects ก่อน publish manifest และไม่ลบ/overwrite generation เดิม เก็บ manifest key ที่คืนมาเป็นหลักฐานคู่ backup ID ไม่สร้างเอกสารใหม่แทน original ขนาด object สูงสุดที่รองรับใน utility ปัจจุบัน 64MiB; เกินแล้ว fail ไม่ข้ามไฟล์ ต้องขยาย/วัดก่อนยอมรับ envelope ใหญ่กว่านี้ การเปลี่ยน object ต้นฉบับระหว่าง backup ต้องหลีกเลี่ยงด้วย immutable issued-object policy/maintenance window จนกว่าจะมี versioned object inventory

## ขั้นตอน Coolify restore แบบแยก resource

1. ผู้รับผิดชอบประกาศ outage และบันทึก UTC เริ่มจับ RTO ตั้งแต่เวลานี้ เก็บ evidence ของ failed release/config
2. เลือก independent recovery host และ image digest/extension ตรงกับ backup สร้าง named volume **ใหม่ว่าง** โดยไม่แนบ production volume เดิม
3. สร้าง PostgreSQL resource จาก managed image ตั้ง repository secrets จาก escrow, `RESTORE_BACKUP_ID` ที่เลือกจาก pgBackRest info และ `RESTORE_TARGET_TIME` รูปแบบ UTC ISO เช่น `2026-10-01T00:00:00Z` ไม่มี auto-select backup เก่าหาก target ใช้ไม่ได้
4. Start resource: restore ปฏิเสธ volume ที่มีไฟล์แม้ restore ก่อนหน้าล้มเหลว ห้ามเพิ่ม `--delta`/ลบ volume เพื่อข้าม guard สร้าง volume ใหม่แล้ววิเคราะห์ error ถ้า WAL ขาด/PostgreSQL ไม่ถึง target ต้อง FAIL ไม่ promote ไปจุดเก่าแทน
5. สร้าง object bucket ใหม่ว่าง รัน utility `restore` ด้วย `DR_ARTIFACT_MANIFEST_KEY` และ `DR_CONFIG_RESTORED_FILE` ไฟล์ใหม่ ข้อมูล config ที่ถอดรหัสมี mode0600 ไม่ overwriteไฟล์เดิม ตรวจ checksum ทุก original object และเทียบ inventory key+checksum จากเอกสารที่ restored DB อ้างถึง ณ PITR target ด้วย assertArtifactCoverage พร้อม expected configuration hash; ถ้ามี original เกิดหลัง manifest หรือconfigไม่ตรงต้อง fail whole-system recovery แม้ DB marker/RPO ผ่าน อย่าใช้ timestamp/cadenceแทนcoverage
6. ตรวจ config/image/secret references ให้ครบก่อนเริ่ม API/web/worker ใน isolated network ปิด SMTP ผู้ใช้จริงและ external notification ตรวจ login/ห้าบทบาท/tenant scope/financial evidence/dashboard แล้วทดสอบ MQTT reconnect/replay/dedup โดยไม่เปลี่ยนจุดวัด RPO ก่อน replay
7. บันทึก usable-service UTC เป็นจบ RTO หลังทุก subsystem พร้อม ตรวจ RPO จาก latest restored committed marker เทียบ outage, backup bytes/transfer rate/chain, object/config hashes, image digests และ configuration fingerprint ก่อนเปลี่ยน DNS ตามผู้อนุมัติ

หลัง restore เปิดระบบใหม่ต้องวาง backup prefix/stanza ใหม่และทดสอบ archive ก่อนเปิด write traffic ไม่เปิด scheduler เขียนทับ recovery repository ระหว่าง drill การ start restore resource ซ้ำต้องจัดการ lifecycle โดย operator เพราะ guard ตั้งใจปฏิเสธ volume ที่ไม่ว่าง

## การตรวจใน CI และข้อจำกัด

`bash scripts/ci/recovery-drill.sh --profile fixture` ใช้ owned disposable compose project/port lock, loopback storage19001 และ volumesเฉพาะ project ตรวจก่อน/หลัง PITR marker, original byte hash/config, login/scope/dashboard, nonempty destination, inaccessible repository และ missing WAL พร้อม JSON `test/artifacts/recovery-result.json` ค่า `productionRecoveryVerified=false` เสมอสำหรับ fixture

`--profile target` ขณะนี้ fail closed ด้วย exit78 และข้อความ prerequisite จนมี approved external destination/independent host/credential escrow และ operator drill ไม่มี fallback ไป fixture ผล fixture ตรวจ MQTT reconnect/replay/dedup ผ่านแล้ว แต่ยังไม่ยืนยัน full production service RTO การวัด capacity และ restore envelope จริงยังเป็น release prerequisite

status sampler เป็น supervisor child แยกจาก blocking backup เรียกตรวจไม่เกิน50sแล้วพัก15s จึงอัปเดตต่อระหว่างbackupยาว; ถ้าอ่านไม่ได้คงnull/errorและไม่ปลอมhealthy. status สำหรับ monitoring อยู่ `/var/lib/solar-backup/status.json` atomic ไม่มี secret: backup ID/time, WAL archive time/failures/pending oldest, WAL bytes, disk used %, heartbeat, configurationFingerprintVersion=1 และ SHA256 ของ environment BACKUP_*/PGBACKREST_* รวม POSTGRES_DB/POSTGRES_USER/PGDATA (ไม่เปิดเผยค่า) และ observation error mount volumeนี้ให้ API read-only; ค่า null หมายถึงอ่านไม่ได้ ไม่ใช่ zero/healthy ตรวจ backlog age แทน lastArchivedAt อย่างเดียวเพื่อไม่เตือนผิดตอน DB idle

## แหล่งอ้างอิง

ตรวจวันที่ 2026-10-01: [pgBackRest release2.59.2](https://pgbackrest.org/release.html), [official source asset](https://github.com/pgbackrest/pgbackrest/releases/tag/release/2.59.2), [configuration](https://pgbackrest.org/configuration.html), [PostgreSQL16 PITR](https://www.postgresql.org/docs/16/continuous-archiving.html) แหล่งเหล่านี้ยืนยันกลไก ไม่ยืนยันผล recovery ของระบบนี้

CLI restore บังคับ DR_REQUIRED_INVENTORY_FILE เป็น JSON {objects:[{key,sha256}],configHash} ที่ตรวจจาก restored DB/PITRtarget และ configuration checkpoint; ถ้าไม่ครบหรือchecksumไม่ตรงไม่เขียน restored config/ไม่ประกาศผ่าน แม้ objectบางส่วนถูกcopyแล้ว ให้เก็บไว้ตรวจ failure และใช้bucketใหม่สำหรับretry. Targetprofileยังexit78จนมีเครื่อง/ปลายทางจริงและการตรวจinventoryที่เชื่อถือได้
