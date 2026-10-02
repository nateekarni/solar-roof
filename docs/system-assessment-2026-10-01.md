# ประเมินความพร้อมของ Solar Platform — 1 ตุลาคม 2569

## ข้อสรุป

**ยังไม่ผ่านเกณฑ์แพลตฟอร์มใช้งานจริงตามขนาดและความเร็วที่ตกลงกัน** มีพื้นฐานที่ดีสำหรับ pilot: แยกโมดูล, ตรวจสิทธิ์ฝั่ง server, MQTT TLS/ACL, transaction และ ACK หลัง commit, ชุดทดสอบหลาย role และ image ผ่าน CI แต่ยังมีข้อผิดพลาดใน flow การเงิน/เอกสาร ช่องว่างด้าน session และการเชิญผู้ใช้ รวมถึงทางเดินข้อมูลที่ไม่เหมาะกับประวัติหลายร้อยล้านแถว การมี framework หรือ CI สีเขียวไม่ใช่หลักฐานว่าผ่าน security standard หรือ load target

ตรวจ baseline `098c14748fd6cb5ee8a405f58a5bd5ebef5fd798` จากโค้ดจริง รายงานเดิมใช้เป็นเบาะแสและตรวจใหม่ ไม่รวม `docs/financial-proposal/` เป็นโค้ดที่ deploy แล้ว ไม่แก้ application, ฐานข้อมูล หรือระบบบริษัทในการประเมินนี้

## เกณฑ์ที่ผู้ใช้ยืนยัน

| เรื่อง | เป้าหมาย |
|---|---|
| ขนาดสำหรับประเมิน | 100 โรงเรียน / 1,000 มิเตอร์ / ข้อความทุก 1 นาที / ผู้ใช้พร้อมกัน 50 คน |
| เครื่อง | 2 CPU / RAM ประมาณ4GB สำหรับ pilot; ขยายได้เมื่อมีหลักฐานการวัด |
| หน้าใช้งานทั่วไป | ข้อมูลสำคัญแสดงภายใน2วินาทีหลังเปิดหน้า |
| รายงานใหญ่ | ทำเบื้องหลัง มีสถานะและแจ้งเมื่อดาวน์โหลดได้ |
| ข้อมูลดิบ | ค้นรายละเอียดล่าสุด90วันได้เร็ว; เก่ากว่านั้นเก็บแยกและเรียกคืนได้ |
| ข้อมูลย้อนหลัง | กราฟใช้ข้อมูลสรุป; หลักฐานคำนวณบิลต้องตรวจย้อนหลังได้ |
| เรียกคืน archive | ภายใน1ชั่วโมง เป็นเป้าหมายที่ต้องทดสอบ |
| กู้ระบบเมื่อ server เสีย | กลับมาใช้งานภายใน4ชั่วโมง; จุดกู้ฐานย้อนหลังไม่เกิน15นาที; Gateway ส่งข้อมูลที่ขาดซ้ำได้ |

ตัวเลขทั้งหมดเป็นเป้าหมาย ไม่ใช่ผลทดสอบหรือ SLA ที่ระบบทำได้แล้ว อายุเก็บ archive/ข้อมูลสรุป รายละเอียดชุดข้อมูลต่อคำขอกู้คืน และต้นทุนต้องกำหนดในแผน implementation โดยเอกสารเดิมเสนอข้อมูลสรุป7ปี ไม่เปลี่ยนเป็นนโยบายลบข้อมูลอัตโนมัติจากการสัมภาษณ์ครั้งนี้

ก่อน load test ต้องระบุหน้าที่วัด อุปกรณ์/เครือข่าย และสถานะ cache ให้ชัด แนะนำรายงาน p50/p95/p99 และจำนวน timeout โดยไม่ใช้ค่าเฉลี่ยอย่างเดียว; การกำหนด p95 เป็นเกณฑ์ผ่านยังเป็นข้อเสนอ ไม่ใช่การลดเงื่อนไข2วินาทีที่ผู้ใช้ตกลงไว้

## ปริมาณข้อมูลที่ต้องออกแบบรองรับ

โค้ด ingestion ปัจจุบันเก็บหนึ่ง sample ต่อหนึ่งแถว โดยหลายค่ามิเตอร์อยู่ในแถวเดียวและ JSON จึงไม่คูณจำนวนแถวด้วยจำนวน metrics:

- 1,000 × 1,440 = **1,440,000 raw rows/วัน** หากทุกมิเตอร์ส่งทุกนาที
- 90วัน = **129,600,000 raw rows**
- หนึ่งปี365วัน = **525,600,000 raw rows**
- aggregate15นาทีต่อมิเตอร์ =96,000แถว/วัน; ถ้าเก็บ7ปี365วันต่อปีประมาณ245.28ล้านแถว
- aggregateรายวันต่อมิเตอร์7ปี =ประมาณ2.555ล้านแถว แต่ต้องออกแบบความหมาย ค่า boundary และหลักฐานการเงินก่อนใช้แทน

นี่คือจำนวนแถว ไม่ใช่ขนาดดิสก์หรือข้อสรุปว่าฐานข้อมูลจะช้า ต้องวัดขนาด row/index/JSON, compression, IOPS และ workload จริง 16.67ข้อความ/วินาทีเป็นเพียงค่าเฉลี่ย; การส่งพร้อมกันและ reconnect/replay ทำให้ peak สูงกว่ามาก

## ข้อค้นพบตามความสำคัญ

ระดับสูง = ต้องแก้ก่อนเปิดเส้นทางนั้นใช้งานจริงหรือก่อนขยายถึงเป้าหมาย ไม่ใช่การให้คะแนน CVSS โดยไม่มี exploit proof

### 1. สูง — เส้นทางคำนวณบิลจริงยังสร้างค่าทดแทนเมื่อไม่มีข้อมูล

หลักฐาน: [billing.controller.ts](../apps/api/src/modules/billing/billing.controller.ts:38), โดยเฉพาะบรรทัด62–64 ใช้2450.5kWh และ opening10000; เลือก rate ล่าสุดแทน rate ตามช่วงรอบบิล และ query `energy_export_kwh` ขณะที่ ingestion เขียน `total_energy` ที่ [mqtt-ingestion.service.ts](../apps/api/src/modules/telemetry/mqtt-ingestion.service.ts:175)

ผลกระทบ: อ่านมิเตอร์ได้และ dashboard ใช้ได้ ไม่ได้แปลว่ายอดเรียกเก็บถูกต้อง ยังไม่ควรใช้เส้นทางนี้ออกยอดเงินจริง นอกจากนี้ payment update, cycle update และสร้าง receipt ยังแยกคำสั่งโดยไม่มี transaction ครอบใน [billing.controller.ts](../apps/api/src/modules/billing/billing.controller.ts:465)

แนวทาง: นำข้อสรุปการเงินที่ยืนยันไว้มาใช้ผ่าน application service จริง บังคับ missing evidence เป็นสถานะที่ออกเอกสารไม่ได้ ใช้ snapshot และ transaction เดียวกับเลขเอกสาร/audit พร้อมทดสอบ concurrent payment approval ไม่ถือว่า patch ใน docs ถูกนำมาใช้แล้ว

### 2. สูง — Refresh token หมุนเวียนแบบมี race และ logout ยังไม่ยกเลิก access token ที่คัดลอกไว้

หลักฐาน: [auth.controller.ts](../apps/api/src/modules/identity/auth.controller.ts:140) อ่าน hash → ตรวจที่154 → UPDATEด้วยuserIdที่171 โดยไม่ล็อกหรือเปรียบเทียบhashเดิมใน UPDATE; logout228ล้างเฉพาะrefresh ส่วน [jwt.guard.ts](../apps/api/src/modules/identity/jwt.guard.ts:49) ไม่ตรวจsessionId

ผลกระทบ: refreshพร้อมกันสองคำขออาจผ่านทั้งคู่และออกaccess tokenได้ ก่อนhashสุดท้ายเขียนทับกัน; access tokenที่ถูกคัดลอกยังใช้ได้จนหมดอายุ15นาทีหลังlogout การปิดบัญชีหยุดaccessได้เพราะguardอ่านstatusใหม่

แนวทาง: atomic consume/rotate refresh พร้อมsession family/reuse detection และกำหนด revocation policy ที่บังคับใช้จริง เพิ่มทดสอบ concurrent refresh/logout ไม่อ้างว่ามีการขโมย token เกิดขึ้นแล้ว; findingนี้มาจาก static control-flow

### 3. สูง — การเชิญผู้ใช้ยังส่งรหัสถาวรทางอีเมลและไม่แยกสถานะส่งล้มเหลว

หลักฐาน: [users.controller.ts](../apps/api/src/modules/identity/users.controller.ts:42) ใช้randomBytes4ไบต์หลังprefixคงที่ สร้างactive account แล้วส่งรหัสทางอีเมล ไม่มีexpiry/บังคับเปลี่ยนรหัสครั้งแรกในflowนี้ และ SMTPล้มเหลวไม่ยกเลิกการสร้างaccount

แนวทาง: invitation token สุ่มที่มีentropyเพียงพอ ใช้ครั้งเดียว หมดอายุได้ ให้ผู้ใช้ตั้งรหัสเอง แยกpending invitation/delivery failed/active พร้อมresendและaudit ปริมาณentropyนี้ไม่ใช่หลักฐานว่าโจมตีออนไลน์ได้ง่าย เพราะมีlogin limiter

### 4. สูงก่อนขยาย — รับ MQTT ไม่จำกัดงานพร้อมกันและแย่ง DB pool กับเว็บ

หลักฐาน: [mqtt-ingestion.service.ts](../apps/api/src/modules/telemetry/mqtt-ingestion.service.ts:63) เริ่มasync handlerทุกmessage; JSON/canonicalizationก่อน [pool.connectที่171](../apps/api/src/modules/telemetry/mqtt-ingestion.service.ts:171); [database.service.ts](../apps/api/src/database/database.service.ts:7) pool20connections ไม่มีstatement timeoutที่กำหนดในโค้ดนี้

ผลกระทบ: Gatewayผิดปกติหรือreplayจำนวนมากอาจทำให้queueในmemory/DBรอสะสมและเว็บช้า แม้ส่งเฉพาะtopicที่มีสิทธิ์อยู่แล้ว

แนวทาง: กำหนดpayload/ความลึก/อัตราส่งต่อGateway จำกัดconcurrencyและqueue แยกงบทรัพยากรingestion/read API วัดbacklog/เวลาจนACK/DBpool wait ตกลงreplayกับfirmware และคงACKหลังdurable commitเท่านั้น ไม่ย้ายไปACKทันทีเมื่อแค่รับเข้าหน่วยความจำ

### 5. สูงก่อนขยาย — Dashboard คำนวณข้อมูลย้อนหลังจาก raw ใหม่ทุกคำขอ

หลักฐาน: [dashboard.service.ts](../apps/api/src/modules/dashboard/dashboard.service.ts:9) ใช้lagต่อdeviceและgroupจากtelemetry_raw; เรียกqueriesพร้อมกันที่63 ช่วงเวลามีเพดาน3เดือน แต่ยังอ่านข้อมูลจำนวนมาก

ถ้าทั้ง1,000มิเตอร์เป็นbilling meter ช่วง30วัน+baseline1วันมีได้44.64ล้านsamples คำขอซ้ำจาก50ผู้ใช้จึงไม่ควรเริ่มด้วยการเพิ่มเครื่องอย่างเดียว

แนวทาง: สร้างread model/rollupพลังงานรายชั่วโมงหรือรายวันแบบincrementที่จัดการlate arrivals, reset, missingและcorrectionได้ ใช้rawเจาะรายละเอียดช่วงสั้น cacheต้องแยกscopeผู้ใช้/site/range ห้ามsumค่าcumulative snapshot15นาทีตรงๆ

### 6. สูงก่อนขยาย — Pagination ปัจจุบันไม่จำกัดการอ่านฐานและส่งข้อมูล

หลักฐาน: [operation-page.tsx](../apps/web/features/shared/operation-page.tsx:51) ขอrowsและsummary; [operations.service.ts](../apps/api/src/modules/dashboard/operations.service.ts:94) summaryเรียกlistทั้งหมดอีกครั้ง; billing/documentsไม่กำหนดpage ส่วน [operation-card-list.tsx](../apps/web/features/shared/operation-card-list.tsx:130) sliceในbrowser

แนวทาง: API pagination/filter/sortที่มีเพดานและstable ordering; cursorสำหรับประวัติที่เพิ่มตลอด; summaryใช้SQLaggregateแยกโดยscopeเดียวกัน; exportแยกจากหน้ารายการ ไม่ถือว่าแสดง10แถวเท่ากับquery10แถว

### 7. สูงก่อนขยาย — รายงานใหญ่ทำ synchronous และเก็บCSVทั้งไฟล์ในPostgreSQL

หลักฐาน: [reports.controller.ts](../apps/api/src/modules/reports/reports.controller.ts:26) LIMIT100001 แล้วปฏิเสธเกิน100000ที่35; สร้างCSV+BufferและINSERTcontentที่37–38

ที่เป้าหมาย1,000มิเตอร์ รายงานrawครบวันมีได้1.44ล้านแถวจึงถูกปฏิเสธ ระบบยังไม่ตรงกับข้อกำหนดasyncที่ตกลงวันนี้

แนวทาง: durable report job → workerอ่านเป็นbatch/stream → object storage → downloadที่ตรวจสิทธิ์ มีqueued/running/ready/failed/cancelledและลิงก์หมดอายุ ใช้idempotency/retry แยกraw exportกับรายงานสรุปให้ชัด

### 8. สูงก่อนเก็บระยะยาว — ยังไม่มีการทำงานจริงสำหรับ archive/retention และหลักฐานกู้ระบบตามเป้าหมาย

settingsมีค่าretention แต่ไม่พบpolicy/jobที่บังคับใช้งานในmigrations/worker [worker app.module.ts](../apps/worker/src/app.module.ts:4) มีhealthและCloseBillingCycleJob; [job](../apps/worker/src/jobs/close-billing-cycle.job.ts:11) เก็บcompletedในMapและไม่มีschedulerเรียกในwiringปัจจุบัน

แนวทาง: ออกแบบarchive manifest/checksum/catalog, replay-safe restoreและread-onlyextract, ตรวจว่าข้อมูลสรุปและหลักฐานบิลครบก่อนนำrawออกจากhot store; backup/WALหรือวิธีเทียบเท่านอกhostเพื่อจุดกู้15นาที พร้อมrestore drillจับเวลาทั้งระบบ4ชั่วโมง แยกbackupออกจากarchiveตามADR0011 ยังไม่มีการเปิดลบข้อมูลใดๆ

### 9. กลาง — Database indexes และ observability ยังไม่พอจะรับรอง2วินาที

migrationsมีhypertableและuniqueness แต่ไม่พบexplicitrawindexตามsite/device+timeที่ตรงกับqueryหลัก [001_core.sql](../infra/migrations/001_core.sql:4); Timescaleอาจสร้างtimeindexให้ จึงไม่ใช่ข้อกล่าวหาว่าไม่มีindexเลย [latest site query](../apps/api/src/modules/telemetry/mqtt-ingestion.service.ts:224) และdevice lateral queryในreportsต้องวัดกับข้อมูลเก่า/ออฟไลน์ด้วย

แนวทาง: inventoryindexจริงและEXPLAIN(ANALYZE,BUFFERS)บนฐานทดสอบขนาดใกล้จริงก่อนเลือกcomposite/coveringindex ทดสอบทั้งread/writeไม่เพิ่มindexทุกคอลัมน์ เพิ่มrequest/query tracing, p95/p99, memory/event-loop, DBwait/locks, ingressACKlag, diskgrowthและjobfailure ไม่พบbenchmark assetsหรือinstrumentationพร้อมใช้เพียงพอจะยืนยันtarget

### 10. กลาง — ปุ่มเอกสารจากรายการบิลขาดIDที่previewต้องใช้

[operations.service.ts](../apps/api/src/modules/dashboard/operations.service.ts:38) ส่งinvoiceNumber/receiptNumberแต่ไม่ส่งinvoiceId/receiptId; [desktop](../apps/web/features/shared/operation-table.tsx:195)/[mobile](../apps/web/features/shared/operation-card-list.tsx:352) ส่งIDที่ไม่มีเข้า [preview](../apps/web/features/shared/document-preview-modal.tsx:46) ซึ่งแสดงว่าไม่มีเอกสาร

แนวทาง: typed response contractเดียวและflow testกรณีมีissued documentจริง พร้อมตรวจทั้งdesktop/mobile; คงข้อห้ามสร้างเอกสารสมมติเมื่อไม่มีimmutable snapshot

### 11. กลาง — UI แสดงงานที่ role ทำไม่ได้ และประวัติauditแสดงไม่ครบโดยไม่แจ้ง

[desktop](../apps/web/features/shared/operation-table.tsx:461)/[mobile](../apps/web/features/shared/operation-card-list.tsx:329) ให้ทุกnon-school roleเข้าตรวจชำระ แต่ [API](../apps/api/src/modules/billing/billing.controller.ts:426) อนุญาตadmin/ownerเท่านั้น เป็นUX mismatch ไม่ใช่สิทธิ์หลุด

[audit query](../apps/api/src/modules/dashboard/operations.service.ts:85) จำกัด500 แต่responseไม่มีhasMore/cursor/total ผู้ใช้ค้นเหตุการณ์เก่าจากข้อมูลที่โหลดมาไม่ได้ แนวทาง: UIcapabilitiesตรงกับserver policyที่ตกลงจริง และserver-sideauditsearch/pagination แจ้งscope/ช่วงเวลาให้ชัด ไม่เพิ่มสิทธิ์APIเพื่อให้ปุ่มใช้งานได้โดยไม่ตรวจข้อกำหนดบทบาท

### 12. กลาง — หน้าแรกและ responsive state ยังไม่เหมาะกับหลายสิบถึงร้อยไซต์

ตรวจภาพE2Eที่สร้าง30ก.ย.2569และโค้ดปัจจุบัน ไม่ใช่livebrowseraudit: [dashboard.tsx](../apps/web/features/dashboard/dashboard.tsx:119) วางGatewayทั้งหมดก่อนKPI; [power-flow-card.tsx](../apps/web/features/dashboard/power-flow-card.tsx:25) mapทุกsite ทำให้มือถือเพียง2ไซต์กินเกือบเต็มจอ และ100ไซต์ดันส่วนสรุปลงไปมาก

ภาพยังแสดง1.2kWในGatewayแต่KPIเป็น0MW เพราะ [dashboard-stats-client.tsx](../apps/web/features/dashboard/dashboard-stats-client.tsx:122) ใช้หน่วยMWทศนิยม2ตำแหน่ง ควรเลือกkW/MWตามขนาดหรือคงprecisionที่ไม่ทำให้ค่าบวกดูเป็นศูนย์

[operation-table.tsx](../apps/web/features/shared/operation-table.tsx:649) mountทั้งmobile/desktopแล้วซ่อนCSS แต่มีsearch/pageคนละstate ทำให้เปลี่ยนขนาดหน้าจอแล้วบริบทเปลี่ยน

แนวทาง: หน้าแรกเริ่มKPI+ปัญหาที่ต้องจัดการ+ความสดข้อมูล; Gatewayเป็นรายการย่อพร้อมค้นหา/กรอง/ดูทั้งหมด แบ่งรายละเอียดเป็นprogressive disclosure แชร์query/filter/page stateกับURL แยก0/ไม่มีข้อมูล/ข้อมูลล่าช้าให้ชัด ตรวจkeyboard,focus,contrast,screenreaderและnetworkช้าจริงก่อนกล่าวว่าผ่านaccessibility

## ข้อควรตรวจเพิ่มเติมด้านความปลอดภัย

Cookieใช้HttpOnly/Secure/SameSite=Lax แต่ไม่พบexplicitOrigin/Fetch-Metadata/CSRF boundaryที่ [main.ts](../apps/api/src/main.ts:43) และ [Next proxy](../apps/web/app/v1/[...path]/route.ts:16) CORSไม่ได้ห้ามrequestทำงานทั้งหมด กรณีผู้โจมตีคุมsubdomainในsiteเดียวกันอาจส่งsimple-formmutationพร้อมcookieได้ ต้องยืนยันด้วยbrowsertestและdomain topologyจริง ไม่จัดเป็นช่องโหว่ที่พิสูจน์ exploit แล้วจากทุกเว็บไซต์

ควรใช้OWASP ASVSเป็นcontrol checklist รวมsession,authentication,authorization,file/inputvalidation,loggingและsecurityconfiguration และประเมินMFAสำหรับผู้มีสิทธิ์สูง ข้อเสนอนี้ยังไม่ใช่ผลASVS assessmentครบทุกข้อหรือการรับรองมาตรฐาน

## Coding Structure ที่ควรปรับ

คง modular monolith + Web/API/Worker ได้ ยังไม่มีหลักฐานว่าต้องเปลี่ยนเป็นmicroservicesเพื่อรองรับ1,000มิเตอร์ จุดสำคัญคือขอบเขตงานและการใช้ทรัพยากร:

1. **Controller → application service → persistence**: BillingControllerยังถือSQL,สูตรราคา,เปลี่ยนสถานะ,เลขเอกสารและSMTP ขณะที่มีdomain/serviceอีกชุดหนึ่ง การทดสอบserviceที่controllerไม่เรียกไม่รับรองflowจริง ใช้application serviceร่วมและtransaction boundaryเดียว
2. **Read models เฉพาะงาน**: แยกdashboard/operationqueriesที่หนักจากmodelเขียนข้อมูล กำหนดDTOที่ตรวจจริง ลดRecord/anyที่ทำให้documentIdตกหล่น
3. **Durable workers**: export/archive/notification/recalculationมีjobstateถาวร, retry/idempotency/observability ไม่ใช่แค่มีprocessชื่อworkerหรือRedisในCompose
4. **Policies และcapabilities**: serverยังเป็นauthority; UIใช้capabilityที่สะท้อนpolicyเดียวกันและมีcontracttests ไม่คัดลอกroleifหลายcomponent
5. **Shared responsive state**: แยกresource actions/data stateจากตัวrenderdesktop/mobile แก้เพื่อป้องกันพฤติกรรมต่างกัน ไม่ใช่ลดบรรทัดอย่างเดียว
6. **Runtime schemas**: ใช้validationที่boundaryทั้งAPI/MQTT/env/DTO ตรงกับTypeScriptและdomain invariants; ห้ามถือว่าinterfaceอย่างเดียวvalidateข้อมูลภายนอกแล้ว

## ลำดับงานที่เสนอ

| ระยะ | งาน | หลักฐานก่อนถือว่าจบ |
|---|---|---|
| 1: ความถูกต้องและสิทธิ์ | แก้financialfallback/transaction, sessionrotation, invitation, role/documentcontract; ยืนยันCSRF | concurrent/session/role×school tests, บิลไม่มีข้อมูลต้องไม่สร้างยอด, UIflowจริงทุกrole |
| 2: ประสิทธิภาพหลัก | bounded ingestion, serverpagination, summaryquery, rollups/indexesที่วัดแล้ว, asyncreports | representativequeryplansและmixedloadที่ยังรับ/ACKข้อมูลถูกต้องระหว่างอ่านเว็บ/export |
| 3: วงจรข้อมูลและความทนทาน | hot90วัน, archive+restore, backupนอกhost, monitoring/alerts | restorearchive<=1ชม., กู้ระบบ<=4ชม., จุดกู้<=15นาที พร้อมหลักฐานการวัด |
| 4: UX polishและaccessibility | action-firsthome, consistentunits/state, keyboard/mobile/error/loading/empty | task-basedusabilitytests และWCAG2.2AA checklistที่ผ่านรายการจริง |

เริ่มเก็บmetricsและทำload baselineก่อนปรับperformance เพื่อเทียบผลหลังแก้ ระยะเหล่านี้เป็นข้อเสนอ ยังไม่เริ่มimplementationจากการreviewครั้งนี้

## วิธีพิสูจน์ว่ารองรับจริง

- ใช้DB/brokerแยกจากข้อมูลจริง สร้างข้อมูลที่มีdistributionตรงกับเป้าหมาย100โรงเรียน/1,000มิเตอร์ รวมmissing/late/out-of-order/reset
- ทดสอบhot90วันหรือpartition/cardinalityที่เทียบได้ พร้อมดิสก์/indexและqueryplan ไม่ใช้100แถวแล้วคูณเวลาเป็นproduction
- ให้50ผู้ใช้เปิดหน้าหลัก/รายการ/ค้นหา/รายงาน พร้อมingestionทุกนาทีและburstหลังoffline; วัดความเร็วหน้าจอและACK/persistenceไปพร้อมกัน
- ทดสอบcold/warmcache, concurrentreports, dependencyoutage, sessionrefreshพร้อมกัน, tenantisolation
- ยืนยันไม่มีข้อมูลหาย/ซ้ำหรือยอดaggregateเพิ่มผิด และไม่มีcredential/ข้อมูลข้ามscopeในcache/export
- ต้องมีerrorbudgetและalertingที่ทีมดูแลได้; benchmarkครั้งเดียวบนเครื่องส่วนตัวไม่ใช่capacityguaranteeของsharedserver

## แหล่งมาตรฐานและข้อจำกัด

- [OWASP ASVS5](https://owasp.org/projects/asvs?tab=main): ฐานตรวจtechnicalsecuritycontrols; เสนอL2เป็นเป้าประเมินตามrisk ไม่ใช่สถานะที่ผ่านแล้ว
- [WCAG2.2](https://www.w3.org/TR/WCAG22/): เสนอAAเป็นเกณฑ์ตรวจaccessibility ต้องทดสอบmanualและเครื่องมือร่วมกัน
- [PostgreSQL16 multicolumnindexes](https://www.postgresql.org/docs/16/indexes-multicolumn.html): เลือกindexให้สอดคล้องqueryและลำดับเงื่อนไข ไม่เพิ่มโดยไม่มีแผนquery
- [Timescale continuousaggregates](https://www.tigerdata.com/learn/continuous-aggregates-timescaledb): แนวทางลดการคำนวณซ้ำ ต้องตรวจAPIที่รองรับTimescale2.18.2ของระบบก่อนimplementation

ไม่ได้ทำpenetrationtest, dependencyvulnerabilityscanครบชุด, currentbrowseraccessibilityaudit, productionloadtest, DNS/TLS/firewallinspectionหรือrestoreจริงกับข้อมูลบริษัทในรอบนี้ ข้อค้นพบsecurityที่ต้องใช้race/browserproofระบุเงื่อนไขไว้แล้ว ผลunit/E2Eเดิมรับรองเฉพาะเส้นทางและfixturesที่รันทดสอบ ไม่รับรองทุกbusinessjourney
