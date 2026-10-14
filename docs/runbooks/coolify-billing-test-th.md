# เปิดใช้งานและทดสอบการตัดรอบบิลบน Coolify

รุ่นนี้รองรับ PRODUCTION หลัง Owner ยืนยันข้อมูลบริษัทและบัญชีรับเงินที่บันทึกจริง การยืนยันไม่เปิด SMTP หรือ scheduler ให้เอง แต่ละไซต์ยังต้องมีลูกค้า ผู้รับที่ยืนยันอีเมล ภาษี อัตรา มิเตอร์และข้อมูล boundary ครบ ทั้งสอง flag เริ่ม `false`

## ลำดับเปิดใช้งาน

1. Deploy migration/image รุ่นเดียวกัน โดย `FINANCIAL_WRITES_ENABLED=false` และ `FINANCIAL_SCHEDULER_ENABLED=false` เก็บ volumes และเอกสารเดิม
2. Owner → ตั้งค่าบริษัท: กรอกชื่อ เลขภาษี สาขา ที่อยู่ โทรศัพท์ อีเมล logo PNG/JPEG ผู้ลงนาม/ลายเซ็น และบัญชีรับเงินหลัก แล้วตรวจรายการ readiness ของไซต์ที่ต้องใช้
3. Coolify → resource เดิม → Environment Variables (runtime): ตั้ง `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM` และ `SMTP_USER`/`SMTP_PASS` เป็นคู่ถ้า provider ต้อง authentication พอร์ตต้องเป็น 1–65535; `SMTP_SECURE=true` สำหรับ implicit TLS ตาม provider เก็บ secret ใน Coolify เท่านั้น
4. Save → Redeploy โดยยังปิดทั้งสอง flag; Owner ยืนยัน production readiness ข้อมูลที่เปลี่ยนภายหลังทำให้ต้องยืนยันใหม่ ตรวจ SMTP readiness แยกจากข้อมูลบริษัท
5. ตั้ง `FINANCIAL_WRITES_ENABLED=true` แต่คง `FINANCIAL_SCHEDULER_ENABLED=false` → Redeploy แล้วรัน one-shot ด้านล่างกับไซต์/ช่วงเวลาที่อนุมัติ ตรวจ PDF ภาษี ผู้รับ การส่ง และ replay
6. หลังผลการส่งเป็น `sent`, ผู้รับได้รับเอกสารจริง และ replay ไม่เพิ่มเอกสาร/อีเมล จึงตั้ง `FINANCIAL_SCHEDULER_ENABLED=true` → Redeploy ตรวจ readiness อีกครั้ง

SMTP configuration readiness ยืนยันค่าตั้งที่ครบ; การส่งจริงและผู้รับต้องตรวจใน controlled flow ด้วย การคำนวณ/ออกเอกสารด้วยมือไม่ถูกปิดเพียงเพราะ scheduler ปิด หรือ SMTP ยังไม่ครบ; การส่งและ scheduler ต้องมี SMTP

## ตรวจสถานะโดยไม่แสดง SMTP secrets

ใน Coolify → Terminal → service **api**:

```sh
cd /app/apps/api
node --import tsx --input-type=module <<'NODE'
import 'reflect-metadata';
import {DatabaseService} from './src/database/database.service.ts';
import {FinancialReadinessService} from './src/modules/financial-readiness/financial-readiness.service.ts';
const db=new DatabaseService();
try {
  const status=await new FinancialReadinessService(db).status({role:'owner'});
  console.log(JSON.stringify({scope:status.scope,approval:status.approval?.id??null,
    items:status.items.map(({id,siteId,ready})=>({id,siteId,ready})),actions:status.actions},null,2));
} catch {console.error('Readiness unavailable');process.exitCode=1;}
finally {await db.pool.end();}
NODE
```

ก่อนเปิด writes คาด `environment.financial_writes=false`; ก่อนเปิด scheduler คาด `environment.scheduler=false` ทั้งสองเป็นสถานะ deployment โดยไม่ลบ Owner confirmation และไม่แสดงรหัส SMTP ห้ามใช้ `env`, `printenv` หรือ `docker compose config` ที่มีค่าจริงเพื่อส่งหลักฐาน

## คำสั่งทดสอบ billing cutover แบบ one-shot

คำสั่งนี้อยู่ใน API image, ไม่ bootstrap Nest และไม่ติดตั้ง recurring timer ค่าเริ่มต้นเป็น dry-run; ต้องเพิ่ม `--apply` จึงคำนวณ ออกใบแจ้งหนี้และส่งต้นฉบับจริง ใช้เฉพาะ period ที่ต้องออกจริงและมี telemetry ครบ; ไม่มีการสร้าง sample หรือ TEST label บน production ต้องเป็น Owner ที่ active และ readiness/current approval ครบ

กรอก UUID ไซต์และ Owner, วันเริ่ม/สิ้นสุดที่อนุมัติ และ operation key ที่ไม่ซ้ำกับงานอื่น เก็บ key/inputs เดิมสำหรับ retry/replay (อย่าสร้าง key ใหม่เมื่อ response หาย):

```sh
cd /app/apps/api
printf 'Site UUID: '; read -r CUTOVER_SITE_ID
printf 'Active Owner UUID: '; read -r CUTOVER_OWNER_ID
printf 'Period start YYYY-MM-DD: '; read -r CUTOVER_PERIOD_START
printf 'Period end YYYY-MM-DD: '; read -r CUTOVER_PERIOD_END
printf 'Stable operation key (record for replay): '; read -r CUTOVER_OPERATION_KEY

# scheduler=true เฉพาะ process one-shot นี้; API ที่กำลังรันยังปิด scheduler อยู่
FINANCIAL_SCHEDULER_ENABLED=true pnpm exec tsx --tsconfig tsconfig.json src/scripts/billing-cutover.ts \
  --site="$CUTOVER_SITE_ID" --owner="$CUTOVER_OWNER_ID" \
  --period-start="$CUTOVER_PERIOD_START" --period-end="$CUTOVER_PERIOD_END" \
  --operation-key="$CUTOVER_OPERATION_KEY"

# หลังตรวจ dry-run แล้ว: ส่งจริงหนึ่งครั้ง
FINANCIAL_SCHEDULER_ENABLED=true pnpm exec tsx --tsconfig tsconfig.json src/scripts/billing-cutover.ts \
  --site="$CUTOVER_SITE_ID" --owner="$CUTOVER_OWNER_ID" \
  --period-start="$CUTOVER_PERIOD_START" --period-end="$CUTOVER_PERIOD_END" \
  --operation-key="$CUTOVER_OPERATION_KEY" --apply

# รันคำสั่ง --apply เดิมอีกครั้งเพื่อ replay; ID/เลขเอกสาร/hash ต้องเหมือนเดิม
FINANCIAL_SCHEDULER_ENABLED=true pnpm exec tsx --tsconfig tsconfig.json src/scripts/billing-cutover.ts \
  --site="$CUTOVER_SITE_ID" --owner="$CUTOVER_OWNER_ID" \
  --period-start="$CUTOVER_PERIOD_START" --period-end="$CUTOVER_PERIOD_END" \
  --operation-key="$CUTOVER_OPERATION_KEY" --apply
export CUTOVER_SITE_ID CUTOVER_PERIOD_START CUTOVER_PERIOD_END
```

ผล dry-run: `mode="dry-run"` ไม่เขียนข้อมูล ผล apply/replay: `mode="applied"`, `delivery="sent"`, `cycleId`, `documentId`, `documentNumber`, `sha256` เดิม ข้อมูล operation ถูก audit และ key เดิมที่เปลี่ยนไซต์/period/Owner จะถูกปฏิเสธ คำสั่งใช้ secrets จาก environment ของ API โดยไม่อ่านออกมาให้ผู้ใช้หรือพิมพ์; ไม่มี access token/password ใน arguments หรือ shell history

ตรวจจำนวนและสถานะหลัง apply แล้วตรวจซ้ำหลัง replay:

```sh
node --import tsx --input-type=module <<'NODE'
import {DatabaseService} from './src/database/database.service.ts';
const db=new DatabaseService();
try {
  const result=await db.query(`SELECT bc.id AS cycle_id,d.id AS document_id,d.document_number,
    d.content_hash,a.sha256,o.state AS delivery_state,
    (SELECT count(*) FROM documents WHERE billing_cycle_id=bc.id) AS document_count,
    (SELECT count(*) FROM document_artifacts WHERE document_id=d.id) AS artifact_count,
    (SELECT count(*) FROM financial_delivery_outbox WHERE document_id=d.id) AS outbox_count
    FROM billing_cycles bc JOIN documents d ON d.billing_cycle_id=bc.id
    JOIN document_artifacts a ON a.document_id=d.id JOIN financial_delivery_outbox o ON o.document_id=d.id
    WHERE bc.site_id=$1 AND bc.period_start=$2::date AND bc.period_end=$3::date ORDER BY d.id`,
    [process.env.CUTOVER_SITE_ID,process.env.CUTOVER_PERIOD_START,process.env.CUTOVER_PERIOD_END]);
  console.log(JSON.stringify(result.rows,null,2));
} catch {console.error('Cutover verification unavailable');process.exitCode=1;}
finally {await db.pool.end();}
NODE
```

เอกสารใหม่หนึ่งฉบับคาด document/artifact/outbox อย่างละ 1, hash ตรงกัน, delivery `sent`; หากมี historical revisions ให้ตรวจจำนวนเดิมคงที่ อย่าสรุปว่าจำนวนแถวพิสูจน์ external mail ได้เอง ตรวจ recipient/provider delivery log เพิ่มและยืนยัน replay ไม่ส่งซ้ำ หาก SMTP acceptance ไม่แน่ชัดหรือ outbox `sending` ค้าง ให้เจ้าหน้าที่ reconcile ก่อน retry; ห้ามลบ outbox หรือสร้าง operation ใหม่เพื่อส่งซ้ำ

## Scheduler, retry และหยุดการเขียน

Scheduler tick ทุกนาที; วันที่ 1 ก่อน 01:00 Asia/Bangkok ยังไม่สร้างงานเดือนก่อน ตั้งแต่ 01:00 สร้างงานเดือนก่อนแบบ unique ต่อไซต์/period พร้อม retry งาน `pending`/`blocked` ที่ถึงเวลา งาน blocked retry หลังหนึ่งชั่วโมง มี notice เก็บเฉพาะ missing IDs/code ที่ปลอดภัย และไม่ขวางไซต์ที่พร้อม ทุก tick ตรวจ flag/current confirmation/SMTP ใหม่

หาก startup ยังไม่พร้อมจะไม่ติดตั้ง timer; หลังแก้ prerequisites ให้ Redeploy ถ้าต้องหยุดทันทีใน Coolify ตั้ง **ทั้งสอง flag false** → Save → Redeploy (เพื่อให้ process รับค่าใหม่) แล้วรันคำสั่งตรวจ readiness ด้านบน ค่าจะเป็น false ไม่ลบ cycles, jobs, approvals, documents หรือ outbox; การส่งที่เริ่มไปแล้วต้อง reconcile ตามสถานะเดิม ไม่ใช้ `down -v` หรือย้อนฐานข้อมูลเพื่อหยุด/rollback

## Regression บนเครื่องพัฒนาเท่านั้น

ตรวจ scheduler/cutover กับชุด review เดิมที่มี fixture ครบบน loopback Postgres `15449` และ Mailpit `11049/18049`:

```powershell
docker compose -f scripts/local-financial-review/compose.yml up -d postgres mail
$env:FINANCIAL_READINESS_TEST_DATABASE_URL='postgresql://review:local-financial-only@127.0.0.1:15449/solar_financial_flow_review'
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/billing/financial-scheduler.spec.ts src/scripts/billing-cutover.spec.ts
node --test scripts/ci/*.test.mjs
```

ใช้ random disposable schema แล้วลบใน `finally`; ไม่ชี้ URL นี้ไป production หากต้องตรวจ synthetic local flow เดิม:

```powershell
pwsh -NoProfile -File scripts/local-system/start.ps1
. ./scripts/local-system/environment.ps1
pnpm exec tsx --tsconfig apps/api/tsconfig.json scripts/local-system/run-cutoff.mjs --month=2026-08
```

local flow ยังผูก fixture/Mailpit และแสดง TEST ตามเดิม ไม่ใช้คำสั่งหรือ marker นี้เปิด production
## ตรวจ acceptance ด้วย production code บน local เท่านั้น

Task 9 ตรวจ Owner ตั้งค่าผ่าน browser จริง แล้วคำนวณ/ออก invoice/ส่ง Mailpit/รับชำระเต็มยอด/ออก receipt และ replay scheduler/cutover โดยใช้ schema แยกใน Docker-local review เท่านั้น ไม่สร้าง approval ใน seed หรือ migration และไม่ชี้ไป Coolify production

```powershell
pnpm build
docker compose -f scripts/local-financial-review/compose.yml -p solar-financial-flow-review up -d --wait
. ./scripts/local-financial-review/environment.ps1
$env:PRODUCTION_FINANCE_DATABASE_URL=$env:DATABASE_URL
$env:NODE_ENV='production'
Remove-Item Env:LOCAL_FINANCIAL_FIXTURE_MARKER -ErrorAction SilentlyContinue
$env:SMTP_FROM='billing@acceptance.example.test'
$env:FINANCIAL_SCHEDULER_ENABLED='true'
$env:PRODUCTION_FINANCE_BROWSER='true'
# ถ้าไม่มี Chromium ของ Playwright ให้ชี้ browser ที่ติดตั้งอยู่ เช่น Edge บน Windows
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json test/production-financial-workflow.integration.ts --retain
```

`--retain` อนุญาตเฉพาะ `127.0.0.1:15449/solar_financial_flow_review`; เปิดเว็บ `http://localhost:13049`, API `http://127.0.0.1:13059` และ Mailpit `http://localhost:18049` หลังตรวจสำเร็จ ระบบคงข้อมูลและ process ไว้ให้ลองเอง โดย API ที่คงไว้ตั้ง scheduler=false เพื่อให้เรียก cutover ด้วยคำสั่งอย่างควบคุม รายละเอียด schema, IDs, counts และ hashes อยู่ `test/artifacts/production-finance.json`; ข้อมูลบัญชีเฉพาะชุดนี้อยู่ `test/artifacts/production-finance-runtime.json` ในเครื่องเท่านั้น ห้ามนำไฟล์ runtime ไป commit หรืออัปโหลด

เมื่อไม่ใช้ `--retain` สคริปต์หยุดเฉพาะ app process ที่สร้างเองก่อนลบ schema และ object ของรอบนั้น ไม่ลบ public fixture หรือ Mailpit ทั้งกล่อง ห้าม reset/down volumes เพื่อทำความสะอาด acceptance นี้ เก็บหลักฐาน local ไม่ใช่การยืนยัน SMTP provider ของ production; การเปิด Coolify ยังต้องผ่าน controlled apply และยืนยันปลายทางตามขั้นตอนด้านล่าง
