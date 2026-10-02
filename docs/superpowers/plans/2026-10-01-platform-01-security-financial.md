# Platform 01 — Security and Financial Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปิดความเสี่ยงsession/invitation/request-originและหยุดfinancialflowที่ยังสร้างข้อมูลไม่ถูกต้องก่อนเปิดใช้งานจริง

**Architecture:** เพิ่มdurablesessionsและactivationflowในidentityเดิม ใช้serverpolicyเป็นauthority และย้ายfinancialwritesเข้าบริการที่ทดสอบจริง แยกการปิดเส้นทางเก่าที่ไม่ปลอดภัยออกจากการนำfinancialproposalมาใช้งาน

**Tech Stack:** NestJS12, PostgreSQL16, node:crypto, node:test/tsx, Next.js16 และPlaywright

**Spec:** [Assessment](../../system-assessment-2026-10-01.md), [financial decisions](../../financial-decisions-2026-09-30.md); อ่าน[แผนหลัก](2026-10-01-platform-improvement.md)ด้วย

## Global Constraints

- 100 โรงเรียน / 1,000 มิเตอร์ / ข้อความทุก 1 นาที / ผู้ใช้พร้อมกัน 50 คน; หน้าใช้งานทั่วไปภายใน2วินาที
- raw90วัน/เรียกคืนarchive1ชั่วโมง; recovery4ชั่วโมง/จุดกู้ย้อนหลัง15นาทีตามADR0011 ห้ามกระทบหลักฐานเดิม
- ไม่แก้appliedmigration; Node24.20.0/pnpm11.24.0; ไม่ใช้secretจริงในtests
- ใช้B1runnerในแผนหลัก ทุกtestต้องผ่านHTTP/DBจริงสำหรับrace/transaction ไม่ทดสอบเฉพาะhelper
- financialproposalเดิมได้รับอนุญาตเพียงเสนอและทดสอบ; ไม่applyหรือเปิดtaxissuanceจนreviewและexternalgateครบ

## Review Focus

1. refreshสองคำขอใช้tokenเดียวต้องไม่ออกsessionที่validสองชุด — S1
2. logout/disableบัญชีระหว่างrequestต้องหยุดสิทธิ์ตามsessionpolicy — S1
3. invitationส่งอีเมลล้มเหลวห้ามแสดงว่าส่งสำเร็จหรือทิ้งรหัสถาวร — S2
4. siblingoriginในfowir.comห้ามเปลี่ยนข้อมูลด้วยcookieของเหยื่อ — S3
5. approvepaymentพร้อมกันและrestartกลางทางต้องได้receiptเดียวและยอดครบ — F2

## File ownership

S1: identity/sessionและmigration018; S2: invitationและmigration019; S3: originboundary/Nextproxy; F1: legacyfinancialgate/UI; F2: financialapplicationservices+proposalreconciliation เจ้าของtaskต้องรวมmigrationregistryและidentitymoduleอย่างserial

### Task S1: Atomic refresh และยกเลิก session จริง

**Files:** Create `infra/migrations/018_auth_sessions.sql`, `apps/api/src/modules/identity/session.service.ts`, `apps/api/test/platform/session.test.ts`; Modify `apps/api/src/modules/identity/auth.controller.ts`, `auth.service.ts`, `jwt.guard.ts`, `identity.module.ts`, `apps/api/src/scripts/db-migrate.ts`, `apps/web/lib/api-client.ts`.

**Interfaces:** `SessionService.create(userId:string):Promise<{sid:string}>`, `rotate(sid:string,oldHash:string,newHash:string):Promise<boolean>`, `revoke(sid:string):Promise<void>`, `isActive(sid:string,userId:string):Promise<boolean>`; auth_sessionsเก็บsid,user_id,refresh_hash,expires_at,revoked_at และrotationaudit ไม่มีplaintexttoken. Legacyaccessไม่มีsessionrowต้องloginใหม่หลังdeploy; ไม่สร้างsessionจากsidที่clientอ้างเอง.

- [x] เขียนsessiontestยิงrefreshพร้อมกัน2คำขอ: `assert.deepEqual(statuses.sort(),[200,401])`; oldrefreshใช้ซ้ำ401; logoutแล้วcopiedaccess401; accountdisabled401; tokenหมดอายุ401.
- [x] รัน`bash scripts/ci/platform-check.sh session` → FAILกับrefreshrace/logoutเดิม แล้วทำUPDATEcompare-and-swapรวมoldHash/expiry/revocationและตรวจsessionฝั่งguard.
- [x] เปลี่ยนlogin/refresh/logoutให้ใช้serviceเดียว; sessionแต่ละdeviceแยกกัน; activeuserroleยังอ่านปัจจุบัน; clientไม่retrymutationอัตโนมัติยกเว้น401ก่อนcontroller และคงsingle-flightrefreshต่อtab. sessiondbล่มให้failclosed.
- [x] รันsession PASS, integrationเดิม PASS; ทดสอบmigrationฐานมีuser/legacyhashแล้วloginใหม่โดยไม่เปลี่ยนpassword; logต้องไม่มีaccess/refresh/hash.
- [x] StageFilesข้างบนและcommit `fix: make session rotation atomic and revoke access on logout`.

### Task S2: Invitation ใช้ครั้งเดียว พร้อมสถานะส่งจริง

**Files:** Create `infra/migrations/019_user_invitations.sql`, `apps/api/src/modules/identity/invitation.service.ts`, `invitation.controller.ts`, `apps/api/test/platform/invitation.test.ts`, `apps/web/app/activate/page.tsx`, `apps/web/features/auth/activate-account.tsx`; Modify `apps/api/src/modules/identity/users.controller.ts`, `identity.module.ts`, `apps/api/src/scripts/db-migrate.ts`, `apps/web/features/users/invite-user-dialog.tsx`.

**Interfaces:** `invite({email,displayName,role,schoolId},actor):Promise<{invitationId:string,status:'pending_delivery'|'sent'|'delivery_failed'}>` และ`activate(token:string,password:string):Promise<void>`; tokenrandom32bytes เก็บSHA256hash อายุ24ชั่วโมง (defaultที่เสนอในแผน), consumeatomic; resendเพิกถอนtokenเดิม. role/schoolต้องผ่านpolicyปัจจุบัน ไม่รับค่าบทบาทจากactivationrequest.

- [x] เขียนinvitationtest: emailไม่มีpassword; beforeactivationlogin401; tokenexpired/reused401; raceactivateสำเร็จครั้งเดียว; SMTPfailureคืน`delivery_failed`; scopedadminเชิญข้ามschool403.
- [x] รัน`bash scripts/ci/platform-check.sh invitation` → FAIL; implementinvitationtableและserviceโดยไม่เขียนทับactiveaccountเดิม.
- [x] ใช้activationURLจากWEB_URLเท่านั้นและไม่logquerytoken; ratelimitinvite/resend5ครั้งต่อชั่วโมงต่อผู้รับ+actorในsharedstorage; activation5ผิดต่อนาทีต่อIPในtestconfig. เปลี่ยนUIsuccesscopyเป็นตามdeliverystatus และอนุญาตresend.
- [x] รันinvitation PASS รวมactivateหลังrecipientroleถูกถอนต้องfail; localSMTPfixtureไม่ส่งคนจริง; applicationtypecheck PASS.
- [x] StageFilesข้างบนและcommit `feat: replace emailed passwords with expiring invitations`.

### Task S3: Request-origin และ proxy trust boundary

**Files:** Create `apps/api/src/common/auth/request-origin.guard.ts`, `apps/api/test/platform/csrf.test.ts`, `apps/web/test/platform/csrf.mjs`; Modify `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/web/app/v1/[...path]/route.ts`, `apps/api/src/modules/identity/auth.controller.ts`, `infra/docker/docker-compose.staging.yml`, `infra/docker/.env.staging.example`.

**Interfaces:** `isAllowedMutation({method,origin,hasCookie,hasBearer},webOrigin:string):boolean`; สำหรับunsafeHTTPจากbrowseroriginต้องตรงWEB_URL, cookieauthที่ไม่มีOriginปฏิเสธ รวมlogin/refresh/logout. Bearer-onlynonbrowser(noCookie,noOrigin)ใช้ได้หลังJWTcheck; GETไม่มีsideeffect. Publicinvitationactivationต้องมีoriginและไม่ถูกยกเว้นเพียงเพราะPublicdecorator.

- [x] เขียนbrowsercaseจากsiblingoriginส่งformPOSTต้อง403และDBไม่เปลี่ยน; validorigin200; nonbrowserbearerผ่านscope; forgedXForwardedForไม่ทำให้bypasslimiter; `assert.equal(after,before)` สำหรับCSRFmutation.
- [x] รัน`bash scripts/ci/platform-check.sh csrf` → FAILกับขอบเขตเดิม; เพิ่มoriginboundaryก่อนcontrollersและคงCORSสำหรับresponsepolicy.
- [x] NextproxyforwardOriginจริงและrewriteIPheadersจากtrusted ingressเท่านั้น; ค่าtrustedproxyCIDRsต้องตรงCoolifychainที่ตรวจ ไม่ใช้จำนวนhop1โดยไม่มีหลักฐาน. Localtestsสร้างproxychainจำลอง; productionเปิดไม่ได้จนระบุtrustedaddresses.
- [ ] Local csrf API/browser PASS; external gate pending: ทดสอบloginผ่านsolar.fowir.com, server-sideGET, MQTTไม่กระทบ, cross-siteและsame-siteทั้งสองแบบ; documentedhostheader/forwardedheaderpolicyในrunbook.
- [x] StageFilesข้างบนและcommit `fix: enforce browser origin and trusted proxy boundaries`.


External deployment evidence remains pending: actual company CIDRs/proxy chain, live solar.fowir.com login and production routing. Local equivalent passed; no deployment readiness claim.

### Task F1: ปิด financial writes ที่ยังไม่พร้อมแบบตรงไปตรงมา

**Files:** Create `apps/api/src/modules/billing/financial-readiness.service.ts`, `apps/api/test/platform/financial-safety.test.ts`, `packages/api-contracts/src/capabilities.ts`; Modify `apps/api/src/modules/identity/auth.controller.ts`, `apps/api/src/modules/identity/identity.module.ts`, `apps/api/src/modules/billing/billing.controller.ts`, `billing.module.ts`, `apps/api/src/modules/documents/documents.controller.ts`, `apps/api/src/common/auth/route-policy.ts`, `apps/web/features/shared/operation-table.tsx`, `operation-card-list.tsx`, `packages/api-contracts/src/index.ts`, `infra/docker/.env.staging.example`.

**Interfaces:** `FinancialReadinessService.assertEnabled(action:'calculate'|'issue'|'approve_payment'|'adjust'|'send'):Promise<void>`; `GET /v1/auth/capabilities` ใน`apps/api/src/modules/identity/auth.controller.ts` คืน`{actions:string[],unavailable:Record<string,string>}`. `FINANCIAL_WRITES_ENABLED=false`defaultและเปิดได้เมื่อF2readinessrecordผ่าน; flagtrueลำพังไม่ข้ามaccountinggate. รายการread-onlyยังดูได้.

- [x] เขียนfinancial-safetytest: ทุกlegacywriteข้างต้นเมื่อdisabled→503พร้อมcode`FINANCIAL_NOT_READY`, `assert.equal(createdRows,0)`; existingdocumentsยังอ่านตามscope; UIไม่เสนอactionที่serverปิด.
- [x] รัน`bash scripts/ci/platform-check.sh financial-safety` → FAIL แล้วเพิ่มgateให้ครบpublicroutesไม่ใช่แค่ปุ่ม; removefabricatedfallbackจากเส้นทางที่ยังเข้าถึงได้.
- [x] ส่งcapabilitiesจากserverตามrole+readiness; owner/admin/operator/accountant/school_userมีexpectedmatrixตามacceptedfinancialrules ไม่เปลี่ยนสิทธิ์เพื่อให้testผ่าน; ปุ่มที่ไม่มีสิทธิ์ไม่แสดง ปุ่มที่featureยังไม่พร้อมมีเหตุผลชัด.
- [x] รันfinancial-safety PASS; existingHTTP/browsertestsต้องปรับexpecteddisabledตามintent ไม่ลบauthorizationassertion. รันทดสอบนับroutesfinancialไม่ตกหล่น.
- [x] StageFilesข้างบนรวมauth.controller.tsและcommit `fix: fail closed for unready financial workflows`.

### Task F2: รวม financial proposal แบบตรวจผลต่างก่อน และต่อ flow จริง

**Files:** Inspect `docs/financial-proposal/manifest.json`, `active-source-baseline.json`, `review-v2.md`, `files/`; Create `docs/financial-proposal/reconciliation-2026-10-01.md`, `apps/api/test/platform/financial-core.test.ts`, `apps/api/src/modules/billing/financial-application.service.ts`; Create/Modify activefilesตามmanifestที่reviewทีละไฟล์ โดยเฉพาะ`apps/api/src/modules/billing/billing.controller.ts`, `financial-automation.service.ts`, `financial-persistence.ts`, `billing.module.ts`, `apps/api/src/modules/documents/document.service.ts`, `original-document-storage.ts`, `apps/worker/src/jobs/generate-monthly-invoices.job.ts`, `apps/worker/src/app.module.ts`, `apps/api/src/scripts/db-migrate.ts`; migrations011/013/015/016/017จากproposalเป็นcandidateไม่ใช่applyทันที.

**Interfaces:** คงfinancialproposalv2exportedinterfacesที่reconciliationตรวจแล้ว; publiccontract `calculateCycle(siteId:string,period:{start:string,end:string}):Promise<{id:string,status:'blocked'|'issued',reason?:string}>`, `approvePayment(cycleId:string,paymentIds:string[],actorId:string):Promise<{receiptId:string}>` อยู่ใน `FinancialApplicationService` ของ `apps/api/src/modules/billing/financial-application.service.ts` ซึ่ง billing.module.ts จัด wiring ให้ controller/worker เรียกจริง. เก็บissuedartifactเดียวสำหรับpreview/download/emailและimmutableinputs.

- [ ] จัดreconciliationtableทุกmanifestpathว่าreuse/adapt/reject พร้อมเหตุผลและhashปัจจุบัน; ห้าม`git apply`ทับauth/session/routepolicyที่S1–F1แก้แล้ว. ทดสอบupgrademigrationจากcurrentdataและemptyDB; existing009checksumต้องไม่ถูกแก้ย้อนหลังเพื่อเอาsampleออก.
- [ ] เขียนfinancial-coretest: opening100/closing125/rate4→100บาท; ไม่มีbaseline→blockedไม่สร้างinvoice; toleranceเกิน5นาที→blocked; rateendinclusive; payment6000+4000settles10000แต่6000อย่างเดียวไม่settle; raceapproveได้receiptเดียว; คนขอcorrectionอนุมัติเอง403.
- [ ] รัน`bash scripts/ci/platform-check.sh financial-core` → FAIL หลัง explicit proposal review อนุญาตให้นำมาใช้แล้ว จึงต่อ activecontrollers/workers ไป serviceที่ใช้transaction/rowlocks/uniqueness/auditและsnapshot. Monthly01:00Asia/Bangkokวัน1, hourlymissingretry, dailyoutstandingnoticeและverifiedschoolrecipientsตามข้อสรุปเดิม; noautoaccountcreation.
- [ ] รันfinancial-core PASSรวมDBrestartหลังjobclaimและส่งอีเมลล้มเหลวสถานะissued+delivery_failed. ก่อนenableต้องมีaccountingformที่ยืนยันtax/adjustmentrulesและexplicitproposalreview; หากยังไม่มีให้คงF1gateและรายงานpending ไม่สร้างสูตรภาษีแทน. ทดสอบlegacyattachmentmissingแสดงunavailableไม่reconstruct.
- [ ] Stageเฉพาะreconciledfiles+testsและcommit `feat: integrate verified financial services behind readiness gates` เมื่อcodeผ่าน; เปิดfeatureในreleaseแยกหลังexternalgateครบ.
