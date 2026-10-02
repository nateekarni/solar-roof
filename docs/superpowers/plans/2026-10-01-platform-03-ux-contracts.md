# Platform 03 — UX/UI and Contract Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ผู้ใช้เห็นข้อมูลและactionที่ถูกต้อง ทำงานต่อได้เมื่อช้า/ผิดพลาด และใช้desktop/mobileโดยบริบทไม่หาย

**Architecture:** แยกresourceactionsและquerystateออกจากview ใช้typedAPIcontractsและservercapabilitiesร่วมกัน ปรับหน้าหลักตามลำดับงานของผู้ใช้โดยคงdesignsystemเดิม

**Tech Stack:** Next.js16, React19, TanStackTable, existingUIcomponents, Playwright/node:test; เพิ่ม@axe-core/playwrightแบบdevdependencyที่pinเวอร์ชันเมื่อทำU3

**Spec:** [Assessment](../../system-assessment-2026-10-01.md) findings10–12, [แผนหลัก](2026-10-01-platform-improvement.md)

## Global Constraints

- 100 โรงเรียน / 1,000 มิเตอร์ / ผู้ใช้พร้อมกัน50คน; ข้อมูลสำคัญหน้าใช้งานทั่วไปภายใน2วินาที
- รายงานใหญ่ทำเบื้องหลัง; ไม่แสดงสำเร็จก่อนserverยืนยัน; ไม่สร้างข้อมูล/เอกสารสมมติ
- serverเป็นauthorityของrole/scope; raw90วัน/archive1ชั่วโมงตามADR0011 ไม่ให้UIสื่อว่ารายละเอียดเก่าดูทันที
- อ่าน`apps/web/AGENTS.md`และinstalledNextdocsก่อนแก้; ใช้Node24.20.0/pnpm11.24.0
- ภาพE2Eเก่าเป็นbaselineไม่ใช่หลักฐานcurrentWCAGpass; testsใช้B1และทุกrole

## Review Focus

1. เอกสารมีเลขแต่ไม่มีartifactต้องบอกเหตุผล ไม่เปิดpreviewปลอม — U1
2. เปลี่ยนroleขณะหน้าเปิดอยู่ต้องรับ403อย่างเข้าใจได้ ไม่คงปุ่มที่ใช้ไม่ได้ — U1
3. mobile→desktopต้องคงsearch/filter/pageในURL — U1
4. reloadระหว่างสร้างreportต้องยังเห็นjobเดิมและไม่ส่งซ้ำ — U2
5. กำลังผลิตน้อยกว่า0.005MWต้องไม่แสดงเป็นศูนย์โดยการปัดเลข — U3

## File ownership

U1operationcontracts/actions/state; U2report/archivejobUX; U3dashboardhierarchy/unitformat/accessibility ไม่ปรับbrandingใหม่ทั้งเว็บหรือเพิ่มframeworkdesignอีกชุด

### Task U1: Typed rows, capabilities และ shared state

**Files:** Modify `packages/api-contracts/src/operations.ts`, `capabilities.ts`, `apps/api/src/modules/dashboard/operations.service.ts`, `apps/web/features/shared/operation-page.tsx`, `operation-table.tsx`, `operation-card-list.tsx`, `document-preview-modal.tsx`, `apps/web/components/ui/data-table.tsx`; Create `apps/web/features/shared/operation-actions.ts`, `use-operation-query.ts`, `apps/api/test/platform/ui-contracts.test.ts`, `apps/web/test/platform/ui-contracts.mjs`.

**Interfaces:** `BillingRow`เพิ่ม`invoiceId:string|null,receiptId:string|null,invoiceNumber:string|null,receiptNumber:string|null`; `getOperationActions(resource:string,row:OperationRow,capabilities:Capabilities):OperationAction[]` โดย`OperationAction={id:string,label:string,enabled:boolean,reason?:string}`. `useOperationQuery()`คืน`{query:OperationQuery,setQuery(patch:Partial<OperationQuery>):void}`; APItypeทั้ง3นิยาม/exportsในoperations.tsและcapabilities.ts ไม่มีundefinedsharedtype.

- [x] เขียนcontracttestissuedinvoiceมีIDตรงDBและtenantถูกต้อง; browserเปิดinvoiceจากbillingทั้งmobile/desktopแล้วโหลดIDจริง; missingartifactแสดงเหตุผลและprintdisabled; `assert.equal(visibleForbiddenActions,0)`ครบ5roles.
- [x] รัน`bash scripts/ci/platform-check.sh ui-contracts` → FAIL; เพิ่มIDsในqueryและtypedDTOให้testตรวจruntime shape ไม่แก้ด้วย`as any`; ต่อservercapabilitiesจากF1และQ1query.
- [x] ย้ายsearch/filter/sort/pageเข้าURLและsharedhook; viewhiddenไม่mountheavymodalsซ้ำ แต่SSR/initialhydrationต้องdeterministic. ใช้actioncomponentเดียวสำหรับpayment/documentsทั้งสองview; stalepermission403แสดงข้อความและrefreshcapabilities.
- [x] รันui-contracts PASSรวมresizeหลังsearchอยู่page2, back/forward, doubleclickและmutationidempotency; APItestยืนยันไม่สามารถเรียกactionต้องห้ามตรงๆแม้ซ่อนUIแล้ว.
- [x] StageFilesข้างบนและcommit `fix: align operation actions and document contracts across layouts`.

### Task U2: Async report และ archive request UX

**Files:** Modify `apps/web/features/reports/generate-report-dialog.tsx`, `apps/web/features/shared/detail-modals/report-detail-modal.tsx`, `apps/web/features/shared/operation-page.tsx`; Create `apps/web/features/reports/job-status.tsx`, `use-job-status.ts`, `apps/web/test/platform/ui-jobs.mjs`; Modify `packages/i18n/src/th.ts`, `packages/i18n/src/en.ts` เพื่อเพิ่ม copy ทั้ง th/en.

**Interfaces:** ใช้Q4`JobRecord/JobStatus`และPOST202`jobId`เท่านั้น; `useJobStatus(jobId:string):{job:JobRecord|null,error:string|null,retry:()=>void}` pollทุก3sเฉพาะtabvisible, stopเมื่อterminal. U2 ส่งมอบ reports ก่อน; D1 ต่อ archive kind restore ใช้ component เดียวและข้อความรอไม่เกิน1ชั่วโมงเป็นtargetไม่ใช่ETAที่คำนวณแล้ว.

- [x] เขียนbrowsertestcreate→queued→running→ready→download; reloadกลางjobยังเห็นเดิมจากserver; failedมีretry/cancelตามserverpolicy; schoolBไม่เห็นjob; `assert.equal(successBeforeReady,false)`.
- [x] รัน`bash scripts/ci/platform-check.sh ui-jobs` → FAIL; ต่อPOST202และjoblist/statusแทนรอCSVในdialog; disabledupbuttonระหว่างcreateพร้อมidempotencykeyที่APIเก็บในQ4.
- [x] แสดงช่วงข้อมูล ชนิดraw/summary แถว/เวลาที่snapshotเมื่อพร้อม; ข้อความqueued/running/failedต่างกัน แสดงprogressเฉพาะเมื่อมีค่าจริง ไม่มีpercentageสมมติ; notificationlinkกลับjobเดิม; downloadหมดอายุต้องขอใหม่หลังตรวจสิทธิ์.
- [x] รันui-jobs PASSบนnetworkช้า/offline/กลับonline; focusไม่กระโดดทุกpollและscreenreaderประกาศเฉพาะstatuschange; errorไม่ทำให้formค่าที่กรอกหาย.
- [x] StageFilesข้างบนและcommit `feat: show durable report progress and recovery states`.

### Task U3: Action-first dashboard และ accessibility

**Files:** Modify `apps/web/features/dashboard/dashboard.tsx`, `dashboard-stats-client.tsx`, `power-flow-card.tsx`, `apps/web/components/ui/data-table.tsx`; Create `apps/web/features/dashboard/gateway-status-summary.tsx`, `apps/web/lib/power-format.ts`, `power-format.spec.ts`, `apps/web/test/platform/accessibility.mjs`; Modify `apps/web/package.json`, `pnpm-lock.yaml`.

**Interfaces:** `formatPower(watts:number|null,locale:'th'|'en'):{value:string,unit:'W'|'kW'|'MW'|'',state:'measured'|'missing'}`: |value|<1000ใช้W, <1000000ใช้kW, อื่นMW, maximum3fractiondigits; ค่าไม่เป็นศูนย์ที่เล็กกว่า0.001W แสดง <0.001W พร้อมรักษาเครื่องหมายทิศทาง ไม่ปัดเป็น0. `GatewayStatusSummary`แสดงcounts+สูงสุด5ไซต์ที่ต้องจัดการก่อน พร้อมfilteredlinkไปsites; ไม่render100cardsก่อนKPI.

- [ ] เขียนtest`assert.deepEqual(formatPower(1200,'en'),{value:'1.2',unit:'kW',state:'measured'})`; null≠0; negativeexportdirectionไม่หาย; browser100sitesยังเห็นKPIและcriticalalertsก่อนfullcollectionที่viewport390×844.
- [ ] รัน`bash scripts/ci/platform-check.sh accessibility` → FAILกับbaselinebudget/labels/unitcases แล้วจัดheader/filter→KPI→actionablealerts/status→trend/map→detailsตามrole ไม่เปลี่ยนbusinesspermissions.
- [ ] เพิ่มvisiblelabels/selectnames, keyboardactionsที่เทียบpointer, focusreturnเมื่อปิดmodal, non-colorstatus, clearloading/error/empty/staleพร้อมเวลา; ใช้sharedformatterทุกจุดกำลังผลิต. ไม่มีข้อมูลต้องไม่เป็น0และไม่มีการขยับlayoutรุนแรงเมื่อpoll.
- [ ] รันaccessibility PASS: axeไม่มีserious/criticalในcoveredjourneys; manualkeyboardทุกaction, zoom200%, desktop/mobile, screenreaderannouncements/contrastตามWCAG2.2AAที่ใช้จริง บันทึกmanualcoverageไม่อ้างว่าaxeอย่างเดียวรับรองAA. Existinghydrationpageerrorsต้อง0.
- [ ] StageFilesข้างบนและcommit `feat: prioritize dashboard tasks and improve accessible responsive flows`.
