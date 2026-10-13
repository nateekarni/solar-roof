# ตรวจการตัดรอบบิลบน Coolify

โค้ดรุ่นนี้ยังไม่เปิดการตัดรอบและออกเอกสารทางการเงินบน production: `FinancialReadinessService` ยอมรับหลักฐาน TEST ที่ผูกกับฐานข้อมูล local และ Mailpit เท่านั้น การตั้ง `FINANCIAL_WRITES_ENABLED=true` อย่างเดียวไม่ทำให้พร้อมใช้งาน

ใน Coolify เปิด Terminal ของ **API container** แล้วตรวจ gate แบบอ่านอย่างเดียว:

```sh
cd /app/apps/api
node --import tsx --input-type=module <<'NODE'
import 'reflect-metadata';
import { DatabaseService } from './src/database/database.service.ts';
import { FinancialReadinessService } from './src/modules/billing/financial-readiness.service.ts';
const db = new DatabaseService();
try {
  await new FinancialReadinessService(db).assertEnabled('calculate');
  console.log('Financial calculation gate enabled');
} catch (error) {
  console.error(error.getResponse?.() ?? error.message);
  process.exitCode = 1;
} finally {
  await db.pool.end();
}
NODE
```

ผลที่คาดบน production คือ `FINANCIAL_NOT_READY` และ exit code 1 คำสั่งนี้ไม่สร้างบิล ไม่ออกเอกสาร และไม่ส่งอีเมล ห้ามเปลี่ยน environment หรือแก้ guard เพื่อหลอกให้ production เป็น local fixture

## ทดสอบตัดรอบจริงในชุด local ที่เตรียมไว้

จาก repository บนเครื่อง Windows เริ่มระบบ แล้วทดสอบเดือนสิงหาคม 2026:

```powershell
pwsh -NoProfile -File scripts/local-system/start.ps1
. ./scripts/local-system/environment.ps1
pnpm exec tsx --tsconfig apps/api/tsconfig.json scripts/local-system/run-cutoff.mjs --month=2026-08
```

สคริปต์ตรวจเวลา 00:00/01:00 กรุงเทพฯ, ยอดมิเตอร์/ภาษี, PDF, อีเมลเข้า Mailpit และการรันซ้ำไม่สร้างเอกสารหรือส่งอีเมลซ้ำ ต้องใช้ฐานข้อมูล fixture เดิมที่มีข้อมูลครบ 10 ไซต์; ไม่ใช่คำสั่งติดตั้งฐานข้อมูลว่าง ผลอยู่ `output/local-system/cutoff-2026-08.json` หากมีบิลแล้วจะรายงาน `existing-period-replay`

ยังไม่มีคำสั่งทดสอบ end-to-end ตัดรอบบน Coolify ที่รองรับในรุ่นนี้ ต้องพัฒนาการรับรอง readiness สำหรับ staging และ fixture แยกก่อน จึงจะทดสอบที่นั่นได้โดยไม่ข้าม guard ของระบบ
