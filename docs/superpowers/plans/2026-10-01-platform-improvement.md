# Solar Platform Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปรับความถูกต้อง ความปลอดภัย ความเร็ว UX/UI และการกู้คืนให้มีหลักฐานรองรับขนาด100โรงเรียน/1,000มิเตอร์/50ผู้ใช้พร้อมกัน

**Architecture:** คง modular monolith และแยกprocess Web/API/Worker; ใช้read modelsสำหรับงานอ่านและdurable jobsสำหรับงานหนัก ไม่ย้ายเป็นmicroservicesทั้งระบบ จัดทำเป็น4แผนย่อยที่ปล่อยใช้งานได้ทีละชุด และแยกการเปิดใช้ความสามารถจริงออกจากการmergeโค้ด

**Tech Stack:** TypeScript, Next.js16, NestJS12, PostgreSQL16/TimescaleDB2.18.2, Redis7, MQTT/Mosquitto, S3-compatible storage, Playwright, node:test/tsx, GitHub Actions และCoolify

**Spec:** [รายงานตรวจระบบ](../../system-assessment-2026-10-01.md), [ADR0011](../../adr/0011-tiered-telemetry-history-and-recovery.md), [ข้อตกลงการเงิน](../../financial-decisions-2026-09-30.md)

## สถานะการทำงาน — 2 ตุลาคม 2569

ผู้ใช้ยืนยันให้ทำงานอื่นให้เสร็จก่อนและ **ยังไม่รวมระบบการเงิน F2** ข้อเสนอการเงินตรวจครบ 60 paths และ proposal-only tests 26/26 ผ่าน แต่ไม่ใช่ active integration และไม่เปิดการเงินจริง

รอบปัจจุบัน: U3/D1/D2/D3/B2 อยู่ระหว่างปิดงานและ final joint-image verification; D2 recovery fixture ผ่านแล้วแต่ไม่รับรอง production RPO/RTO, D3 source review ผ่านหลังแก้ runtime configuration identity และ source integration 7/7 ผ่าน ยังไม่ถือ source tests แทน image ชุดสุดท้าย

- B1 เสร็จ: `7d52059` และแก้ CI `983bded`; harness 5/5, integration/E2E ผ่าน และ review ผ่าน
- S1 เสร็จ: `6ad44dd`; session 8/8, client 3/3, harness 5/5, integration/E2E และ review ผ่าน
- S2 เสร็จ: `e3a8ba9`; ทดสอบบน image จริงผ่าน harness 5/5, session 8/8, client 3/3, invitation API 13/13 และขั้นตอนเปิดใช้บัญชี/ส่งคำเชิญซ้ำผ่าน browser; ตรวจโค้ดผ่านแล้ว.
- S3 เสร็จ: `cc12116`; ทดสอบบน image จริงผ่าน all-fast, integration/MQTT/ระบบขัดข้อง/เริ่มใหม่/browser และตรวจโค้ดผ่านแล้ว ยังต้องตรวจค่า proxy และทดสอบกับระบบบริษัทจริง.
- F1 เสร็จ: `c351bb3`; ทดสอบความปลอดภัยการเงินเมื่อเปิด flag พร้อม all-fast และ regression บน image จริงผ่านแล้ว งานเขียนข้อมูลการเงินยังปิดไว้จนมีหลักฐาน F2 ครบ.
- Q1 เสร็จ: `05e6668`; pagination/summary/audit และ regression ตาม role บน desktop/mobile ผ่านด้วย image จริง ยืนยันการจำกัดขนาดข้อมูลตอบกลับแล้ว แต่การสแกนข้อมูลจำนวนมากยังต้องวัดและปรับใน B2.
- Q2 เสร็จ: `82c37fd`; all-fast/ingestion 9/9 บน image จริง และ managed MQTT TLS/ACL/ขอบเขตขนาดข้อความผ่าน ตรวจโค้ดแล้ว ยังต้องยืนยันกับ firmware จริงและวัดความจุใน B2 ก่อนขยาย pilot.
- Q3 เสร็จ: `ff5c6d5`; review ผ่านหลังแก้ 4 จุด, image จริงผ่าน rollup 12/12, ingestion 9/9 และ all-fast 55/55 พร้อม browser 4 ชุด; commit ต่างจาก image ที่ตรวจเฉพาะ EOF cleanup. Flags ยังปิด; B2 ยังต้องพิสูจน์โหลดจริง.
- Q4 เสร็จ: `6f7788a`; source review ผ่านหลังแก้ integrity/cleanup, image จริงผ่าน API 63 รายการ + client 3 รายการ + browser 4 ชุด รวม reports 11/11; source ตรง image ทุกไฟล์. งาน UI รายงานยังรอ U2.
- U1 เสร็จ: `5f21572`; review ผ่านหลังแก้ row identity และ locale, image จริงผ่าน API 64 + client 3 tests และ browser 5 ชุด รวมเอกสาร/สิทธิ์/ส่งซ้ำ/เวลาไทย/session timeout.
- U2 เสร็จ: `5ecf0be`; source review approved และ image จริงผ่าน API/client 67 tests พร้อม browser 6 ชุด; Minor terminal offline banner ส่งแก้ใน U3.
- U3/D1/D2/D3/B2 ในขอบเขตที่ทำได้ในเครื่องผ่านการตรวจ source และ runtime แล้ว: final image regression 87 tests พร้อม browser, integration/E2E, managed staging Compose, recovery fixture และ reduced load smoke ผ่าน ปัญหา Docker/พอร์ตเดิมหมดแล้ว ดู [สถานะก่อน deploy](../../runbooks/predeploy-status-2026-10-02.md). ยังไม่ commit/push/deploy; target capacity, off-host recovery SLA และ Gateway จริงยังต้องยืนยันภายนอก.

## อ่านภาพรวมก่อนเริ่ม

### ลำดับดำเนินการที่ผู้ใช้ยืนยันเพิ่มเติม

ผู้ใช้ให้ทำทุกส่วนที่ทำได้ก่อน deploy บน branch ปัจจุบัน ใช้รายละเอียดและเกณฑ์ทดสอบในแผนย่อยเดิม ไม่ลดเกณฑ์เพราะยังไม่มี staging

- [x] U3 ในขอบเขต automated checks: Dashboard, หน่วยกำลังไฟฟ้า, keyboard/focus, terminal reconnect และ browser fixture; source และ image จริงผ่าน ยังแยก manual accessibility ไว้
- [x] D1 implementation/fixture: archive/restore ตรวจ checksum และสิทธิ์ผ่าน; คงการลบข้อมูลจริงปิด และยังไม่รับรอง SLA ของขนาดคำขอจริง
- [x] D2 implementation/fixture: backup image/config และซ้อมกู้ในทรัพยากรแยกผ่าน รวม backup ค้าง 191 วินาที; off-host target drill ยังไม่ผ่าน
- [x] D3 implementation/fixture: readiness/alerts/คู่มือ Coolify และ rollback พร้อม; หลักฐานหมดอายุหรือผิด revision ถูกปฏิเสธ ยังต้องยืนยันค่าตั้งจริง
- [x] B2 harness/reduced smoke: workload และ 80 samples ผ่านทุกครั้งไม่เกิน 2 วินาที; full target/cold DB/export overlap ยังไม่ผ่านและไม่อ้างผลขนาดเล็กแทน
- [ ] F2 integration พักตามคำสั่งผู้ใช้: ตารางตรวจข้อเสนอและ proposal-only tests ทำแล้ว แต่ยังไม่รวมระบบการเงิน
- [x] ตรวจ diff รวมและ regression พร้อม independent reviews โดยแยกผู้เขียน/ผู้ตรวจ; บันทึกผลจริง ข้อจำกัด และงานภายนอกแล้ว

การ deploy, push และ merge ไม่รวมในขั้นดำเนินการนี้ เป้าหมายคือเตรียมผลที่ตรวจสอบได้ก่อนนำขึ้น Coolify

แผนนี้แบ่งเป็น 17 งานใน 4 ด้าน เป้าหมายคือให้ระบบปลอดภัย ค้นข้อมูลเร็ว และกู้กลับมาใช้งานได้โดยมีผลทดสอบรองรับ ไม่ถือว่าการเขียนแผนทำให้ระบบผ่านเกณฑ์แล้ว

1. **ลดความเสี่ยงก่อน:** แก้การเข้าสู่ระบบและคำเชิญ ปิดงานการเงินที่ยังไม่พร้อม และจำกัดภาระการรับข้อมูล Gateway
2. **ทำให้ข้อมูลเยอะแล้วยังใช้งานเร็ว:** แบ่งรายการเป็นหน้า ใช้ข้อมูลสรุปสำหรับกราฟ และย้ายรายงานใหญ่ไปทำเบื้องหลัง
3. **ทำให้ใช้งานเข้าใจง่าย:** ปุ่มตรงกับสิทธิ์ เปิดเอกสารได้ถูกฉบับ เห็นสถานะงาน และใช้มือถือได้โดยตัวกรองไม่หาย
4. **รักษาข้อมูลระยะยาว:** เก็บประวัตินอกฐานหลัก สำรองนอกเครื่อง และซ้อมกู้ระบบจริงก่อนเปิดการลบข้อมูลเก่า

เริ่มด้วย B1 เพื่อมีชุดทดสอบและค่าตั้งต้นสำหรับเปรียบเทียบ แล้วทำ S1–S3/F1/Q2 ก่อน ส่วน F2 ต้องผ่านการตรวจข้อเสนอการเงินเดิมและเงื่อนไขของฝ่ายบัญชี การทดสอบโหลดเต็มขนาดจะทำบนเครื่องแยกจาก staging บริษัท

## Global Constraints

- ขนาดสำหรับประเมิน: 100 โรงเรียน / 1,000 มิเตอร์ / ข้อความทุก 1 นาที / ผู้ใช้พร้อมกัน 50 คน
- หน้าใช้งานทั่วไป: ข้อมูลสำคัญแสดงภายใน2วินาทีหลังเปิดหน้า; รายงานใหญ่ทำเบื้องหลัง
- rawล่าสุด90วันค้นเร็ว; rawเก่าเก็บแยกและเรียกคืนภายใน1ชั่วโมง; ไม่เปิดลบข้อมูลจนarchiveและหลักฐานการเงินตรวจครบ
- กู้ระบบภายใน4ชั่วโมง; จุดกู้ฐานย้อนหลังไม่เกิน15นาที; Gatewayต้องส่งข้อมูลที่ขาดซ้ำได้
- ใช้เครื่องเดิม2CPU/RAMประมาณ4GBสำหรับpilotและขยายได้; ห้ามรันfull-loadบนเครื่องบริษัทที่มีข้อมูลจริง
- เว็บsolar.fowir.com, MQTTmqtt-solar.fowir.com; จัดdeploymentผ่านCoolify/GitHub/CloudflareUI ไม่เพิ่มขั้นตอนSSHให้ผู้ใช้
- Node24.20.0 / pnpm11.24.0 ตามCI; ไม่แก้migrationที่มีchecksumใช้งานแล้ว ไม่seed/resetฐานจริง
- รายงานนี้ยังไม่ใช่ASVS/WCAG certification; performance/restoretargetsต้องมีผลวัด ไม่อนุมานจากunit tests
- baselineตรวจคือ098c147; รายงาน/ADR/CONTEXTในworking treeเป็นเอกสารที่ต้องเก็บไว้ก่อนเริ่มimplementation

## Review Focus

1. ทดสอบพร้อมกันอ่านเว็บ/export/replay ไม่วัดแต่idleAPI — B2
2. ข้อมูลขาด/มิเตอร์reset/latecorrectionห้ามเปลี่ยนบิลที่ออกแล้วเงียบๆ — F2/Q3
3. roleถูกเปลี่ยนระหว่างงานasyncหรือก่อนdownloadต้องไม่หลุดscope — Q4/U1
4. restartหลังส่งไฟล์ก่อนcommitสถานะต้องไม่เกิดarchive/reportซ้ำ — D1/Q4
5. migrationใหม่กับฐานเดิมที่มีข้อมูลและfinancialproposalยังไม่appliedต้องไม่ล้าง/ทำให้upgradeพัง — B1/F1

## แผนย่อยและลำดับ

| แผน | ขอบเขต | เริ่มได้เมื่อ | เกณฑ์ส่งมอบ |
|---|---|---|---|
| [01 Security & Financial Safety](2026-10-01-platform-01-security-financial.md) | S1–S3,F1–F2 | B1 | session/invitationปลอดภัย และfinancialwritesไม่สร้างข้อมูลสมมติ |
| [02 Query & Data Processing](2026-10-01-platform-02-query-processing.md) | Q1–Q4 | B1; Q3คำนึงF2 | pagination, boundedMQTT, energyrollup, asyncreports |
| [03 UX/UI & Contracts](2026-10-01-platform-03-ux-contracts.md) | U1–U3 | U1ใช้F1/Q1; U2ใช้Q4 | flowตรงสิทธิ์/ข้อมูล, มือถือและaccessibilityที่ทดสอบแล้ว |
| [04 Lifecycle & Recovery](2026-10-01-platform-04-lifecycle-recovery.md) | D1–D3 | D1ใช้Q3/Q4; D2ทำได้หลังB1 | archive/restore/backupและrolloutมีหลักฐาน |

B1ก่อนทั้งหมด → S1/S2/S3/F1 → Q1/Q2/Q3/Q4 → U1/U2/U3และD1/D2 → F2เมื่อexternalgateครบ → D3/B2 ไม่จำเป็นต้องรอF2เพื่อเปิดเฉพาะmonitoringpilot แต่ห้ามอ้างว่าfinancialproductionพร้อมหากF2ยังไม่ผ่าน

## ขอบเขตไฟล์และ interfaces ร่วม

- `scripts/ci/platform-check.sh`: สร้าง/ล้างเฉพาะdisposabletestproject, buildimagesตามrevisionและรันsuiteที่ระบุ
- `apps/api/test/platform/`: HTTP/DB/security/query/jobacceptancetests ไม่ใช้productioncredentials
- `apps/web/test/platform/`: browserjourneysและaccessibilitytests
- `apps/api/src/common/observability/`: วัดrequest/query/ingestionlatencyและredaction
- `packages/api-contracts/src/operations.ts`, `jobs.ts`, `capabilities.ts`: publicDTOร่วม ห้ามนำNest/DBdependencyเข้าpackageนี้
- `packages/domain/src/energy-increments.ts`: ความหมายenergydeltaที่dashboardและbillingตรวจย้อนกลับได้
- migrationเลข018ขึ้นไปสำหรับแผนนี้; กัน011/013/015/016/017ให้financialproposalเดิม แต่ต้องตรวจเลขจริงก่อนเริ่มแต่ละPR หากชนให้renumberพร้อมทุกreferenceในPRเดียว
- ทุกmigrationใหม่ต้องเพิ่มใน`apps/api/src/scripts/db-migrate.ts`; แก้รายการแบบserialเมื่อรวมงาน ไม่ให้หลายbranchเปลี่ยนregistryพร้อมกันโดยไม่review

## Task B1: Test harness และ baseline ที่บอกได้ว่าปรับแล้วดีขึ้น

**Files:** Create `scripts/ci/platform-check.sh`, `apps/api/test/platform/harness.test.ts`, `apps/api/test/platform/fixtures.ts`, `apps/api/src/common/observability/metrics.ts`, `apps/api/src/common/observability/request-timing.interceptor.ts`; Modify `apps/api/src/main.ts`, `apps/api/src/database/database.service.ts`, `.github/workflows/ci-staging.yml`; Create `docs/performance/platform-baseline.md`.

**Interfaces:** `bash scripts/ci/platform-check.sh <suite> [--prebuilt]` รองรับ`harness,session,invitation,csrf,financial-safety,financial-core,operations,ingestion,rollup,reports,ui-contracts,ui-jobs,accessibility,archive,recovery,readiness,all-fast`; รันapiผ่าน`pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test test/platform/<suite>.test.ts`, UIผ่าน`pnpm --filter @solar/web exec node test/platform/<suite>.mjs`; ระบุ suite manifest: csrf/ui-contracts รันทั้ง API+browser; ui-jobs/accessibility รัน browser เท่านั้น (accessibility รวม power-format.spec.ts); recovery รัน API assertions และ scripts/ci/recovery-drill.sh --profile fixture; ที่เหลือรัน API เท่านั้น. suite ยังไม่สร้างต้อง fail ไม่ใช่ skip; all-fast เรียกเฉพาะรายการ implemented ที่ประกาศไว้และต้องรายงานรายการที่ยังไม่พร้อม. `observeDuration(name:string, milliseconds:number, labels:Record<string,string>):void` อนุญาตเฉพาะroute-template/method/status, ไม่labeluser/token/rawpayload.

- [x] เขียน`harness.test.ts`: databaseชื่อ`solar_readiness`และloopbackเท่านั้น; rejectproductionURLก่อนconnection; cleanupลบได้เฉพาะprojectที่สร้างในrun; `assert.equal(redacted.includes('test-secret'),false)`; ทดสอบ migration บนฐาน revision098c147 ที่มี fixture แล้ว user/readings/documents เดิมต้องคงอยู่ และฐานใหม่ต้องสร้างได้โดยไม่ต้อง apply financial proposal ก่อน.
- [x] รัน`bash scripts/ci/platform-check.sh harness` ให้FAILจากharness/metricsที่ยังไม่มี แล้วทำfixture100โรงเรียน/1,000มิเตอร์แบบsmall-historyและสองtenantที่สิทธิ์ต่างกัน ใช้infra/ci/compose.ymlเป็นฐานและserializeการใช้fixedlocalhostports.
- [x] เพิ่มrequest/queryduration, DBpoolwaitingcount, ingressaccepted/duplicate/rejected/ACKlatency; structuredlogsแยกrequestIdโดยไม่logtoken/PII/rawSQLparams. `--prebuilt` ใช้ได้ในCIเมื่อjobเพิ่งbuildrevisionเดียวกัน; localdefaultbuildsequentialก่อนtest.
- [x] รันharness PASS และ`bash scripts/ci/integration.sh` PASS; บันทึกbaselineรายการquery/จำนวนแถว/ขนาดresponse/เวลาบนfixture พร้อมcommit/hardware/cachestate ไม่เรียกผลfixtureเล็กว่าloadtargetผ่าน เพิ่มall-fastหลังsuiteที่implementedครบโดยmanifestexplicit.
- [x] StageเฉพาะFilesของtaskและcommit `test: establish isolated platform regression and latency baseline`.

## Task B2: พิสูจน์ capacity แบบ mixed workload ก่อนขยาย

**Files:** Create `apps/api/test/performance/seed-history.ts`, `apps/api/test/performance/mixed-load.ts`, `apps/web/test/platform/page-latency.mjs`, `scripts/ci/platform-load.sh`, `docs/performance/platform-capacity.md`; Modify `.github/workflows/ci-staging.yml` สำหรับsmokeเล็กเท่านั้น; Create `.github/workflows/platform-capacity.yml` แบบmanual.

**Interfaces:** `bash scripts/ci/platform-load.sh --profile smoke|target --history-days 90`; targetต้องระบุisolatedhostที่อนุญาตและavailablediskก่อนseed, rejectบริษัทstaginghostname; ผล`test/artifacts/platform-capacity.json` มีrevision,hardware,rows,scenario,p50,p95,p99,max,errors,acked,persisted,duplicates,peakMemory.

- [ ] เขียนassertions: `assert.equal(ackedButMissing,0)`, `assert.equal(unexpectedDuplicateRows,0)`; เก็บbrowserimportant-data-readyแทนnetworkidle และนับcriticaljourneysเกิน2000msทุกครั้ง.
- [ ] รันsmokeกับbaselineให้ได้ผลจริงแม้ไม่ผ่านbudget ห้ามเปลี่ยนassertionเพียงเพื่อให้เขียว; targetprofileไม่รันบนPRrunnerหรือsharedpilot.
- [ ] สร้างhistory90วัน129.6ล้านrawrowsในtargetหรือdocumentความแตกต่างและห้ามประกาศfullpassหากใช้ข้อมูลลดขนาด; test50users, ingest1000samples/minพร้อมburst1000samplesที่นาทีเดียวกัน, replay10เท่าของsteadyrate10นาที, exportพร้อมกัน2งาน. Replayตัวเลขนี้เป็นstressprofileเริ่มต้น ไม่ใช่firmwareSLAที่ตกลงแล้ว.
- [ ] วัดcold/warmcache, queryplans/locks/diskและingestionACKร่วมกับหน้าแรก/ไซต์/bิล/audit. เกณฑ์2วินาทีใช้criticalactionsในdefinedtestทุกsample; p95/p99รายงานเพิ่มเติม ไม่ใช้p95แทนข้อกำหนดเดิมโดยพลการ. บันทึกข้อจำกัดเครือข่าย/อุปกรณ์และเสนอsizingจากผลจริง.
- [ ] แนบผลพร้อมreleasegatepass/fail ลงcapacitydoc แล้วcommit `test: verify mixed platform workload and publish capacity evidence`.

## Release gates และ rollback

- GateA: monitoringpilot — S1–S3,F1,Q2ผ่าน; ไม่ต้องรอtaxpolicy; financialwritesที่ยังไม่ปลอดภัยต้องปิดฝั่งserverและUIตรงกัน
- GateB: ขนาดเป้าหมาย — Q1–Q4,U1–U3,B2ผ่าน; ไม่เปิดcacheที่ใช้scopeรวมข้ามผู้ใช้
- GateC: เก็บข้อมูลจริงต่อเนื่อง — D1–D3ผ่าน โดยยังไม่deletehotdataจนarchivechecksum/restore/financialevidenceguardผ่าน
- GateFinance: F2และฝ่ายบัญชียืนยันครบ; existingfinancialproposalไม่ถือว่าได้รับอนุญาตapplyจากแผนนี้
- Expand/contract migrations: เพิ่มschemaก่อน, backfillเป็นbatch, เปลี่ยนread/writeผ่านflag, ค่อยเลิกfieldเก่า; rollbackimageต้องcompatibleกับschemaใหม่ ห้ามdownmigrationที่ลบข้อมูลจริง
- ผ่านCIและtestenvironmentก่อนเปลี่ยนCoolifyUI; snapshotdigestก่อนdeploy; ตั้งfeatureflagใหม่ปิดdefault; ไม่ลบvolumes

## Coverage/self-review

Assessment1→F1/F2;2→S1;3→S2;4→Q2;5→Q3;6→Q1;7→Q4;8→D1/D2/D3;9→B1/B2/Q3;10→U1;11→U1/Q1;12→U3; conditionalCSRF→S3. ReviewFocusทั้ง5มีtestอยู่ในtaskที่ระบุแล้ว ชื่อDTO/jobstates/runnerใช้ตรงกันทุกแผน

**External inputsที่ยังไม่ขวางการเขียนโค้ดส่วนอื่น:** explicit proposal review ก่อน F2 apply และฝ่ายบัญชียืนยัน tax/correctionrules ก่อน F2 enable; ผู้ดูแลระบุoff-hostbackupdestinationและcredentialก่อนD2remote; กำหนดอายุarchive/summaryและขนาดคำขอrestoreก่อนD1deleteenable ไม่เลือกอายุลบทิ้งแทนผู้ใช้ ตั้งdefaultretainและdisabledจนเงื่อนไขครบ

**Execution:** ผู้ใช้อนุญาตให้เริ่มทำและทำใน branch ปัจจุบันแล้ว ใช้ subagent-driven ตาม executing-plans skill โดยตรวจแต่ละงานแยกกัน สถานะล่าสุดอยู่ด้านบนและ ledger ใน .superpowers/sdd/2026-10-01-platform-improvement/progress.md; ยังไม่มีการ deploy ระบบบริษัทจากงานชุดนี้
