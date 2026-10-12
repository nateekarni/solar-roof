# แผนปรับหน้าอัตราค่าไฟและความสอดคล้องของ UI

สถานะ: ผู้ใช้อนุมัติให้เริ่มแล้ว ดำเนินการและตรวจสอบตามรายงาน `docs/ui-component-consistency-verification-2026-10-09.md`
วันที่: 2026-10-09

## ข้อกำหนดที่ยืนยันแล้ว

- ลบหัวข้อ “ไซต์งานและเรตที่ใช้งาน” และกรอบ/padding ของ section ที่ครอบรายการ
- ย้าย “ปรับใช้เรต” ไปข้าง “จัดการเรตต้นแบบ” ใน page header
- แสดง Search Box ฝั่งซ้าย; “เลือกแล้ว”, จำนวนที่ถูกซ่อน และ filter อยู่กลุ่มเดียวกันฝั่งขวา รองรับการขึ้นบรรทัดบนจอเล็ก
- ใช้ shadcn filter และ DataTable กลางบน desktop คงกรอบ DataTable หนึ่งชั้น
- มือถือคงรายการ cards โดยไม่มี card ครอบซ้ำ
- คงการเลือกข้ามหน้า คำค้น และ filter; แสดงจำนวนที่ถูกซ่อนโดยคำค้น/filter และมีล้างการเลือก จำนวนนี้แยกจากรายการที่อยู่คนละหน้าของ pagination
- checkbox หัวตารางเลือก/ยกเลิกเฉพาะหน้าปัจจุบัน ไม่กระทบรายการที่เลือกจากหน้าอื่น มีสถานะเลือกบางส่วน
- ครอบคลุมทุกหน้าและหน้าลูกค้า; คำขอล่าสุดขยาย Dashboard ให้ปรับเนื้อหา การ์ด และกราฟได้ตามบทบาทและไซต์ที่เลือก ตามส่วน Dashboard ด้านล่าง แทนข้อจำกัดเดิมที่คงโครงสร้าง Dashboard

## แนวทางที่เสนอ

ใช้ component กลางที่มีอยู่และปรับเป็นกลุ่มเล็ก ๆ ตามหน้าที่ใช้งาน ไม่สร้าง table framework ใหม่ การเปลี่ยนเฉพาะหน้า rates จะทิ้งปัญหาที่ตรวจพบหน้าอื่นไว้ ส่วนการบังคับ DataTable กับทุก table จะเพิ่ม toolbar/pagination ในแบบฟอร์มที่ไม่ต้องการ จึงเสนอใช้ DataTable กับรายการจัดการ และ shadcn Table กับตารางสรุปหรือช่องกรอกหลายแถว

คง page gutter และ spacing ระหว่างส่วน คำขอลบ padding ใช้กับ card ครอบรายการ ไม่ใช่ padding ของทุก cell หรือ dialog ใช้ semantic theme tokens เพื่อรองรับ light/dark

## หลักฐานและลำดับงาน

| ลำดับ | พื้นที่ / source | สิ่งที่พบและแนวทาง |
| --- | --- | --- |
| 1 | `apps/web/features/settings/rate-settings-workspace.tsx:48` | section มีกรอบและหัวข้อซ้ำ ย้ายปุ่มและจัด toolbar ตามข้อกำหนด |
| 1 | ไฟล์เดียวกัน `:49–51` | native filter, checkbox, table และ details menu; เปลี่ยนเป็น Select/ChoiceSelect, Checkbox, DataTable และ DropdownMenu โดยคง mobile cards |
| 1 | ไฟล์เดียวกัน `:55–73` | dialog ต้นแบบ/ปรับใช้/ประวัติยังใช้ controls และตารางแยกเอง; ใช้ controls กลาง ลดกรอบตกแต่งซ้ำ และคงส่วนสรุปผลกระทบ/ยืนยันที่มีความหมาย |
| 2 | `apps/web/components/ui/data-table.tsx:49–63` | มี embedded, toolbar, server-managed และ row ID แล้ว; ใช้ช่องต่อเดิม ปรับส่วน search ให้ใช้ SearchInput กลาง และเพิ่ม API เท่าที่จำเป็นสำหรับ page selection โดยไม่เปลี่ยนค่าเริ่มต้นของผู้ใช้เดิม |
| 2 | `apps/web/features/sites/gateway-index.tsx:20–21` | desktop ใช้ Table แยก; ย้ายรายการเป็น DataTable คงสถานะ/เวลา/เมนู/column wrapping และ mobile cards |
| 2 | `apps/web/features/settings/staff-permissions-workspace.tsx:34` | พนักงานและตำแหน่งใช้ตารางแยก; ย้ายเป็น DataTable คง tabs และสิทธิ์เดิม |
| 2 | `apps/web/app/(app)/settings/company/page.tsx:365–405` | รายการบัญชีธนาคารอยู่ใน card และมี Table ปรับ spacing เอง; ใช้ embedded DataTable ภายใน section บริษัทที่ยังมีความหมาย |
| 3 | `apps/web/features/sites/gateway-workspace.tsx:31–35` | Card ครอบ publish/cadence sections ที่มีกรอบอีกชั้น; คงกรอบ workspace ชั้นเดียว ใช้หัวข้อและ divider ภายใน |
| 3 | `gateway-dashboard-sources.tsx:3`, `gateway-comparisons.tsx:19`, `gateway-installation-history.tsx:9` ใน `features/sites` | ลดกรอบ section/ผลลัพธ์ซ้อน; ประวัติใช้ embedded DataTable คงการยืนยันเปลี่ยนอุปกรณ์และสิทธิ์ |
| 4 | `apps/web/features/alerts/alert-rules-editor.tsx:38–40` | เปลี่ยน native selects เป็น controls กลาง |
| 4 | `apps/web/features/billing/manual-bill-dialog.tsx:19` | ใช้ Select/ChoiceSelect, Textarea และ date control ตามมาตรฐาน repo; ตารางกรอกรายการใช้ shadcn Table ไม่เพิ่ม pagination |
| 4 | `apps/web/features/billing/payment-verification-dialog.tsx:48` | เปลี่ยน native select โดยคง validation/confirmation |
| 5 | `apps/web/features/dashboard/site-context.tsx:8` | selected-site section ซ้อนกรอบ device; ใช้หัวข้อ/divider ลดกรอบซ้ำ |
| 5 | `dashboard.tsx:117`, `financial-insights.tsx:14`, `maintenance-insights.tsx:7` ใน `features/dashboard` | raw summary tables; ใช้ shadcn Table หรือ embedded DataTable เฉพาะที่มีพฤติกรรมรายการ โดยคงข้อมูลและโครงสร้าง |
| 5 | `power-flow-card.tsx:18,29`, `gateway-status-summary.tsx:19,25`, `ranking-chart.tsx:16,39` ใน `features/dashboard` | ตรวจภาพจริงแล้วลดกรอบภายในที่ซ้ำกับ card หลัก คง metric/chart cards |
| 6 | หน้ารายการกลางและหน้าลูกค้า | ตรวจ regression และความสอดคล้องจากการเปลี่ยน shared components ตาม coverage ด้านล่าง |

เลขบรรทัดเป็นตำแหน่งขณะสำรวจ ต้องตรวจใหม่ก่อนแก้ เพราะ working tree มีงานอื่นจำนวนมาก

## ขอบเขตที่ไม่ควรแก้แบบเหมารวม

- `ChoiceSelect` เป็น shadcn wrapper อยู่แล้ว native select ที่ซ่อนภายในใช้เชื่อม form events ไม่ใช่ UI ที่ต้องลบ
- `operation-table.tsx` ใช้ DataTable อยู่แล้ว และ `operation-query-table.tsx` มี server filtering; ห้ามเปลี่ยนเป็น client filtering เฉพาะข้อมูลหน้าปัจจุบัน
- `site-configuration-details.tsx:45–48` ใช้ embedded DataTable ใน section ที่มีความหมายอยู่แล้ว ไม่จัดเป็น nested-card defect โดยอัตโนมัติ
- RuleMatrix, field/register editors และตารางกรอกข้อมูลไม่จำเป็นต้องใช้ DataTable
- คงกรอบที่ช่วยแยกคำเตือน การยืนยัน upload เอกสาร preview บัญชีผู้ใช้ auth และ mobile cards
- คง decimal precision, API payload, preview ก่อน apply, scheduled-rate replacement confirmation และ permission checks เดิม
- ปุ่มปรับใช้เรตยังเปิด dialog ได้เมื่อเลือก 0 เพื่อเลือกขอบเขต matched/all ตาม flow ปัจจุบัน; selected scope ต้องมีรายการก่อน preview
- งานความสอดคล้อง UI ไม่ต้องแก้ schema; ส่วน Dashboard ใช้ schema assignment เดิม และปรับคำศัพท์การเงิน/คุณภาพข้อมูลใน CONTEXT.md ตามข้อยุติ ยังไม่ต้องสร้าง ADR สำหรับการเลือก component ที่ย้อนกลับได้

## การเลือกและสถานะข้อมูล

ใช้ `siteId` เป็นตัวตนของแถว ไม่ใช้ index เพื่อให้การเลือกคงเดิมเมื่อ sort/filter/page เปลี่ยน จำนวนเลือกมาจาก selection ชุดเดียวบน desktop และ mobile รายการที่ถูกลบหรือไม่มีสิทธิ์หลัง reload ต้องถูกตัดออกจาก selection ไม่ส่ง ID ค้างไป apply

ใช้สถานะ loading, load error พร้อม retry, empty dataset และ no search results ที่แยกกัน ตารางและ cards ต้องแสดงรายการ/จำนวนสอดคล้องกัน ห้ามให้ load failure ดูเหมือนยังไม่มีไซต์

## Coverage การสำรวจ

สำรวจ route inventory และ shared renderers ของ `/`, `/production`, `/sites`, `/gateways`, `/customers`, `/billing`, `/receipts`, `/alerts`, `/notifications`, `/reports`, `/records/[resource]/[id]`, `/settings` และ settings account/general/company/rates/users/audit/system/meter-presets รวม auth/activation/session

เส้นทางเก่า `/users`, `/audit`, `/contracts`, `/system`, `/settings/security` เป็น redirect จึงตรวจหน้าปลายทางแทน นี่คือ static source audit ไม่ใช่หลักฐานตรวจภาพจริงครบทุก route

## การทดสอบและเกณฑ์เสร็จ

1. Rates: ค้นหาชื่อไซต์/ลูกค้า, filter rate, sort ตัวเลข, pagination, select page/partial, เก็บข้ามหน้า/filter, hidden count, clear selection และสลับ viewport โดยไม่เสีย selection
2. Rates dialogs: preview → back → preview ใหม่, matched/all/selected, validation, replacing future rates, history และ template creation; เปลี่ยน controls โดย payload/ข้อยืนยันไม่เปลี่ยน
3. Shared tables: ตรวจ client/server managed pagination ไม่กรองซ้ำ; search ไม่ซ้ำสองช่อง; row actions/checkbox ไม่เปิด row detail โดยไม่ตั้งใจ
4. Browser: desktop 1440px และ mobile 390px, TH/EN, light/dark, keyboard focus/menu/checkbox และ horizontal overflow ตรวจ owner/accountant/admin/customer ตามสิทธิ์ของแต่ละหน้า
5. เก็บ before/after ของ rates, gateway workspace, staff, company, billing/alert dialogs และ Dashboard/หน้าลูกค้าที่แก้จริง พร้อมผล empty/loading/error
6. รัน lint/type checks และ existing focused tests ตาม scripts ปัจจุบัน เพิ่ม interaction tests เฉพาะ selection และพฤติกรรมที่เสี่ยง ไม่ทดสอบเพียง class names
7. อัปเดตรายงาน coverage ระบุหน้าที่แก้ หน้าที่ตรวจแล้วคงเดิม และข้อจำกัดที่ยังตรวจไม่ได้ ห้ามอ้างว่า browser verified จาก static audit

## ขั้นตอนถัดไป

ดำเนินการกลุ่ม 1–6 และ Dashboard ตามที่ผู้ใช้สั่ง “เริ่มทำเลย” แล้ว เก็บงานไว้ใน working tree เดิม ไม่ commit รวมงานอื่นที่ไม่เกี่ยวข้อง ผลตรวจและข้อจำกัดอยู่ในรายงาน verification

## ขยายขอบเขต: ออกแบบเนื้อหา Dashboard ตามบทบาท

สถานะ: Q1–Q13 ยุติแล้ว ผู้ใช้อนุมัติ implementation แบบรวมด้วยคำสั่ง “เริ่มทำเลย” ข้อกำหนดนี้แทนการพักออกแบบ Dashboard ในเอกสารก่อนหน้าและแทนข้อจำกัดด้านโครงสร้างในกลุ่มงาน 5 ข้างต้น

### ข้อกำหนดจากผู้ใช้

- เน้นกราฟและข้อมูลที่อ่านง่าย มีทั้งภาพรวม รายละเอียดเชิงลึก และ insight
- คงความสามารถเลือกช่วงเวลาและไซต์ที่มีอยู่ เมื่อเลือกไซต์ ทุกข้อมูลที่แสดงต้องอยู่ในขอบเขตไซต์นั้น
- ปรับข้อมูลใน card หรือเปลี่ยนชุด card/กราฟตามบริบทได้ ไม่จำเป็นต้องมีชุดเดียวทุกสถานะ
- ออกแบบสามประสบการณ์: เจ้าของร่วมกับ Accountant, Admin เทคนิค และลูกค้าที่ดูข้อมูลไซต์ของตัวเอง
- เป็นงานออกแบบเพิ่มในแผนปัจจุบัน ยังไม่ลงมือเปลี่ยน Dashboard ระหว่างการสัมภาษณ์

### Design tree และคำถามรอบแรก

1. ยืนยัน: เจ้าของ/Accountant เน้นสมดุลผลผลิตกับการเงิน
2. ยืนยัน: Admin เน้นปัญหาและงานที่ต้องจัดการก่อน
3. ยืนยัน: ลูกค้าเน้นผลผลิตและสถานะบิล
4. ยืนยัน: ปรับชุดกราฟและรายละเอียดเมื่อเลือกไซต์ ไม่จำกัดให้ใช้กราฟชุดเดิม

รอบแรกตอบครบแล้ว ข้อกำหนดรอบถัดไปบันทึกด้านล่าง โดยไม่ถือคำแนะนำเป็นข้อยุติจนผู้ใช้ตอบ

### ข้อยุติรอบสอง (Q5–Q9)

- Q5: แยก “ผลในช่วงที่เลือก” กับ “ต้องจัดการตอนนี้” อย่างชัดเจน ทุกส่วนจำกัดตามไซต์เดียวกัน; current snapshot และ rolling 24h ต้องมีป้ายเวลา ไม่ปลอมเป็นค่าตามช่วงย้อนหลัง
- Q6: คงช่วงสูงสุด 3 เดือน เพราะ record รับเข้าถี่และต้องควบคุมภาระ query ไม่เพิ่มรายปี/หลายปี บังคับข้อจำกัดฝั่ง API ด้วย ไม่ใช่เฉพาะ picker; การเปรียบเทียบต้องมีงบ query ชัดเจน ไม่แอบรวมช่วงย้อนหลังยาวผ่าน query เดียว
- Q7: แยกยอดวางบิล รับชำระแล้ว ค้างชำระ ไม่เพิ่มมูลค่าพลังงานประมาณการ และไม่เรียกรวมว่ารายได้; ปรับ glossary ให้ตรง
- Q8: insight ใช้ข้อเท็จจริงและการเปรียบเทียบจากข้อมูลที่มี แสดงที่มา/ฐานเปรียบเทียบและทางเจาะลึก ไม่เพิ่ม forecast/target model และไม่อ้างสาเหตุที่ข้อมูลพิสูจน์ไม่ได้
- Q9: ลูกค้าหนึ่งบัญชีเข้าถึงหนึ่งไซต์ในปัจจุบัน; schema ออกแบบให้ขยายความสัมพันธ์หลายไซต์ได้ แต่ validation และ authorization ยังคุมหนึ่งไซต์ ไม่มี UI ให้ลูกค้าเลือกหลายไซต์ในรอบนี้ ตรวจ schema เดิมก่อนเพิ่ม migration

### แนวทางภาพข้อมูลตามข้อยุติ (รอยืนยันแบบรวม)

| บทบาท | ภาพรวม | เมื่อเลือกไซต์ / รายละเอียด |
| --- | --- | --- |
| เจ้าของ/Accountant | KPI ผลผลิต/ยอดวางบิล/รับชำระ; กราฟแนวโน้มผลผลิต; แท่งเปรียบเทียบไซต์; aging และงานติดตามปัจจุบัน | แนวโน้มไซต์เดียว รายละเอียดบิล/การรับชำระ และ insight เฉพาะไซต์ ตัด ranking ระหว่างไซต์ออก |
| Admin | สรุปปัญหาตามความสำคัญ; ภาพความสดข้อมูลแยกไซต์/อุปกรณ์; แนวโน้มผลิตและไซต์ที่เปลี่ยนมาก | อุปกรณ์ที่ต้องตรวจ เวลารับข้อมูลล่าสุด กราฟผลิต และลิงก์ไปการวิเคราะห์/ตั้งค่าตามสิทธิ์ |
| ลูกค้า | ชื่อไซต์ของตน ผลผลิตตามช่วง กราฟรายวัน บิลและสถานะชำระที่อ่านง่าย | เจาะวันหรือเอกสารของตนเอง ไม่มีอันดับไซต์อื่นหรือข้อมูลเทคนิคภายใน |

ทุกกราฟมีหน่วย ช่วงเวลา และสถานะคุณภาพข้อมูล ไม่สื่อความหมายด้วยสีอย่างเดียว ข้อยุติเรื่องเปรียบเทียบ คุณภาพข้อมูล และการเจาะลึกอยู่ใน Q10–Q13 ด้านล่าง

### ผลตรวจ schema และภาระ query หลัง Q9

- `infra/migrations/040_site_account_assignments.sql` มี junction table และประวัติ assignment/revocation พร้อม partial unique ต่อ user ที่ยัง active อยู่แล้ว คงโครงสร้างและ constraint นี้ ไม่เพิ่ม scalar `user.siteId`
- Auth contracts ใช้ `assignedSiteIds` array แล้ว; authorization ใน `authorization.ts`, `route-policy.ts`, domain access policy และ SQL functions ใน migrations 047/049 บังคับหนึ่งไซต์ ต้องทบทวนพร้อมกันหากเปิดหลายไซต์ในอนาคต ไม่ปลดข้อจำกัดในรอบนี้
- บัญชีเชิญที่ยังไม่มีไซต์ต้องไม่มีสิทธิ์เข้าข้อมูล; เมื่อเปิดใช้งานการเข้าถึงของลูกค้าต้องมีหนึ่งไซต์ที่ตรงกับลูกค้านั้น
- จำกัด 3 **เดือนปฏิทิน** ตาม `dashboard-range.ts` ทั้ง UI และ API ไม่ขยายเป็น 90 วันโดยเงียบ ๆ
- `generation-energy.ts` อ่าน raw `payload_samples` แล้วรวม daily ใน JS; `energy_daily` ปัจจุบันเป็นเส้นทาง billing meter แยกกัน ห้ามถือว่ากราฟ production ใช้ aggregate อยู่แล้ว
- ก่อนเพิ่มกราฟ/เปรียบเทียบ วัด query time และ payload ของช่วง 3 เดือนบนข้อมูลหนาแน่นที่เป็นตัวแทน ตรวจการใช้ query ร่วมกันและการอ่านเฉพาะไซต์/แหล่งข้อมูลที่ต้องใช้; พิจารณา SQL reduction หรือ production daily read model เมื่อหลักฐานแสดงว่าจำเป็น โดยเก็บ quality/reset semantics เดิม
- การเทียบช่วงก่อนหน้าเปิดเมื่อผู้ใช้ร้องขอตาม Q10 ต้องคิดภาระของสองช่วงแยกกัน ไม่ถือว่าจำกัดช่วงละ 3 เดือนแล้วต้นทุนรวมปลอดภัยอัตโนมัติ

### ข้อยุติรอบสาม (Q10–Q13)

- Q10: เปิด “เทียบช่วงก่อนหน้า” เมื่อต้องการเท่านั้น ไม่ query เปรียบเทียบอัตโนมัติทุก card; เทียบระยะเวลาเท่ากัน ถ้าช่วงปัจจุบันยังไม่จบใช้เวลาที่ผ่านไปเท่ากัน แต่ละช่วงไม่เกิน 3 เดือน ข้อมูลไม่เทียบเคียงกันต้องงด delta
- Q11: สลับ kWh รวม และ kWh/kWp ได้ เฉพาะไซต์ที่มีกำลังติดตั้งเชื่อถือได้; ไม่เรียกค่านี้ว่าประสิทธิภาพและไม่สรุปอุปกรณ์เสียจากอันดับ
- Q12: แสดง “ยอดจากข้อมูลที่มี” พร้อมจำนวนไซต์ครบ/ไม่ครบ กราฟมีช่องว่าง ไม่แทน missing ด้วยศูนย์ และงดเปอร์เซ็นต์เปรียบเทียบเมื่อฐานไม่เทียบเคียงกัน
- Q13: คลิกไซต์เพื่อเปลี่ยน Dashboard เป็นไซต์นั้น คลิกวันในกราฟเพื่อเปิด drawer รายวัน คลิกงาน/บิลไปหน้ารายละเอียดเดิม รักษาไซต์และช่วงเวลาเมื่อกลับมา

### ข้อเท็จจริงเบื้องต้นจากโค้ด

- `features/dashboard/dashboard.tsx` ส่งช่วงเวลาและ `site_id` ไป summary API แล้ว และแยก customer experience จากหน้าบทบาทอื่น
- หน้า non-customer เลือก financial/maintenance insights จาก capabilities; ไม่ควรอาศัยชื่อ role อย่างเดียวในการอนุญาตข้อมูล
- ลูกค้ามีค่า today/month เพิ่มจากช่วงที่เลือก และดึงบิลแยก; ต้องออกแบบให้ผู้ใช้อ่านออกว่าค่าใดตามช่วงที่เลือก ค่าใดเป็นสถานะปัจจุบัน และตรวจความครบของข้อมูลบิลก่อนรวมยอด
- `dashboard-range.ts` และ PeriodPicker จำกัดช่วงสูงสุด 3 เดือน; ยืนยันคงข้อจำกัดนี้และแก้ข้อความรายปีใน CONTEXT.md แล้ว
- `dashboard.service.ts:135–175` จำกัดข้อมูล summary ด้วยไซต์ที่มีสิทธิ์และไซต์ที่เลือก; metadata สำหรับ navigation อาจยังรวมไซต์อื่นที่มีสิทธิ์ แต่ค่าผลผลิต/การเงินต้องอยู่ใน scope
- `site-selection-provider.tsx` ป้องกันข้อมูลเก่าระหว่างเปลี่ยนไซต์เฉพาะส่วนที่ห่อ DashboardScope; ต้องเพิ่มเกณฑ์ทุกส่วนไม่แสดงค่าไซต์เดิมคู่กับชื่อไซต์ใหม่
- Financial insights แยกเงินรับชำระตามวันที่รับชำระในช่วง, บิลตามวันเริ่มรอบในช่วง, และยอดค้าง/aging ปัจจุบัน; financial compare ยังมีเงื่อนไขรวมบิลไม่ตรง main summary ต้องทำ metric definitions ให้ตรงก่อนใช้ insight
- Maintenance เป็น snapshot ปัจจุบันและ rejected messages ย้อนหลัง 24 ชั่วโมง ไม่ใช่ประวัติตามช่วงที่เลือก
- ลูกค้าปัจจุบัน SiteFilter แสดงชื่อไซต์แรกแทน chooser; บิลดึง 100 รายการก่อนกรองไซต์ฝั่ง client จึงเสี่ยงตกหล่น ต้อง query/filter/aggregate ฝั่ง server ตามสิทธิ์
- มีข้อมูล daily energy พร้อม quality, ผลผลิต/กำลังติดตั้งรายไซต์, solar power ปัจจุบัน, บิล/การรับชำระ/aging และความสดอุปกรณ์; ยังไม่มีฐาน tariff การประหยัด, irradiance/weather, target, forecast หรือ PR model
- ข้อมูลพลังงานที่ไม่ครบอาจเป็น null ไม่ใช่ศูนย์; counter reset/ขอบเขตวันขาด/แหล่งข้อมูลไม่ชัดเจนมีผลต่อการรวมยอดและการเปรียบเทียบ
- แก้ CONTEXT.md ตาม Q7 แล้ว ใช้ยอดวางบิล/รับชำระแล้ว/ค้างชำระ แทนการเรียกรวมว่ารายได้

### แบบสรุป Dashboard สำหรับยืนยัน

**โครงร่วม:** ส่วนหัว → ไซต์/ช่วงเวลา/เปิดเปรียบเทียบ → ส่วนหลักตามบทบาท → insight และรายละเอียด รองรับ desktop/mobile โดย mobile เรียงตามความสำคัญ ไม่ย่อตารางกว้างให้ตัวหนังสือเล็ก กราฟมี tooltip และทางเปิดรายละเอียดด้วย keyboard พร้อมข้อมูลแบบข้อความที่อ่านได้

**เจ้าของ/Accountant:** เริ่ม “ผลในช่วงที่เลือก” ด้วย KPI พลังงาน, ยอดวางบิล, รับชำระ ตามด้วยกราฟพลังงานรายวันและกราฟเงินที่แยกชุดยอดวางบิลกับเงินรับอย่างชัดเจน ไม่ใช้กราฟ stacked ให้เข้าใจว่าบวกกันเป็นยอดเดียว ภาพรวมทุกไซต์มี horizontal bar ranking สลับ kWh/kWh ต่อ kWp ได้ เมื่อเลือกไซต์เปลี่ยนพื้นที่นี้เป็นรายละเอียดแนวโน้มและรายการบิลไซต์นั้น ส่วน “ต้องจัดการตอนนี้” แสดงยอดค้าง/เกินกำหนด, aging bars และงานรอตรวจหลักฐาน/ติดตาม พร้อมลิงก์ไปงานเดิม

**Admin เทคนิค:** เริ่ม “ต้องจัดการตอนนี้” ด้วยจำนวนไซต์/อุปกรณ์ที่ข้อมูลไม่สด เหตุที่ต้องตรวจ และรายการงานเรียงตามความรุนแรงที่ระบบมี ตามด้วยแถบสัดส่วนสถานะและรายการไซต์ที่กดเจาะได้ ไม่สร้างประวัติ uptime จาก snapshot ปัจจุบัน ส่วนย้อนหลังมีกราฟผลิตรายวัน คุณภาพข้อมูล และการเปลี่ยนแปลงเมื่อเปิด compare; เมื่อเลือกไซต์เปลี่ยนเป็นอุปกรณ์/เกตเวย์ของไซต์นั้นและรายละเอียดความสด/ปัญหาที่พบ ไม่มีการเงินหากไม่มี capability

**ลูกค้า:** แสดงชื่อไซต์ที่ได้รับสิทธิ์หนึ่งไซต์อย่างชัดเจน พร้อมช่วงเวลา เริ่ม KPI ผลผลิตตามช่วงและกราฟรายวัน จากนั้นยอดวางบิลตามช่วง ส่วนสถานะปัจจุบันแสดงบิลค้าง วันครบกำหนด และสถานะหลักฐานด้วยภาษาที่อ่านง่าย มีทางไปเอกสาร/การชำระเดิม; กำลังผลิตปัจจุบันและเวลาข้อมูลล่าสุดแยกป้าย “ขณะนี้” ไม่ปนกับผลย้อนหลัง ไม่แสดงข้อมูลไซต์อื่นหรือรายละเอียดปัญหาเทคนิคภายใน

**Insight:** ใช้ข้อความสั้นคู่กับภาพ เช่น ไซต์ที่ผลผลิตเปลี่ยนมาก, ยอดเกินกำหนดที่ต้องติดตาม, หรืออุปกรณ์ที่ไม่มีข้อมูล ระบุช่วง/เวลาที่วัดและลิงก์ไปหลักฐาน จำกัดเนื้อหาเริ่มต้นให้กระชับและมีดูเพิ่มเติม ค่าเพิ่ม/ลดไม่ตีความว่าดี/เสียเสมอไป ไม่ใส่ insight ที่สรุปเชิงเหตุผลเกินข้อมูล

**Drawer รายวัน:** ชื่อไซต์/วัน, พลังงานที่วัดได้, completeness และเวลาข้อมูลล่าสุด; กราฟภายในวันอ่านข้อมูลเฉพาะวันเมื่อเปิดเท่านั้น ใช้ aggregation/downsampling ที่คงคุณภาพข้อมูลและจำกัดจำนวนจุด แสดงรายละเอียดตาม capability; หากเปิดจากทุกไซต์แสดงผลรายไซต์ของวันนั้นและเลือกไซต์ต่อได้ ไม่โหลด raw records ทุกไซต์ล่วงหน้า

### นิยามข้อมูลและเงื่อนไขที่ต้องรักษา

- ขอบเขตหนึ่งชุดประกอบด้วยไซต์ที่มีสิทธิ์ ช่วงวัน เขตเวลา Asia/Bangkok และ capability ทุก panel/insight/drill-down ใช้ชุดเดียวกัน ระหว่างเปลี่ยน scope แสดง loading ที่เหมาะสมและไม่ให้ผล response เก่าทับ scope ใหม่
- ยอดวางบิลตามรอบที่เริ่มในช่วงและออกเอกสารแล้ว; เงินรับตามวันที่ชำระที่ผ่านการยืนยันในช่วง ไม่คำนวณค้างชำระด้วยการลบสองยอดนี้เพราะเป็นคนละฐานเวลา ค้าง/aging ใช้ยอดคงเหลือปัจจุบันและมี as-of
- Daily normalized yield = kWh / installed kWp; แปลง MWp เป็น kWp ก่อนหาร ตัดค่ากำลังติดตั้งว่าง/ศูนย์/ไม่เชื่อถือได้ออกจาก ranking แบบ normalized พร้อมแจ้งเหตุผล ไม่แทนด้วยศูนย์
- ยอดบางส่วนใช้ข้อมูลที่วัดได้จริง แยก complete/partial/unavailable หาก API ปัจจุบันส่งเพียง null ต้องเพิ่ม contract ให้ส่ง observed subtotal กับ quality แยกกัน ไม่เปลี่ยน null เป็นเลขโดยไม่มีหลักฐาน
- การเปรียบเทียบใช้แหล่งข้อมูล นิยาม และขอบเขตไซต์ที่เทียบเคียงกัน ฐานเดิมเป็นศูนย์ไม่แสดง infinity; แสดงค่าจริงและข้อความว่าไม่มีฐานคำนวณเปอร์เซ็นต์
- เปรียบเทียบช่วงเดือนเต็มกับเดือนเต็มก่อนหน้าที่จำนวนวันต่างกันต้องเปิดเผยช่วงจริงและใช้ฐานระยะเวลาที่เท่ากันตาม Q10; ทดสอบรอยต่อเดือน/ปี หากช่วงเท่ากันแตะเกิน 3 เดือนปฏิทินให้ปฏิเสธพร้อมเหตุผล ไม่คลาย API cap โดยเงียบ ๆ
- ลิงก์/URL ช่วยคืน scope แต่ server ตรวจสิทธิ์ใหม่เสมอ; customer แก้ site_id เองต้องไม่เห็นไซต์อื่น

### ลำดับ implementation Dashboard และเกณฑ์ตรวจ

1. รวม metric definitions และ scope ของ summary/compare/customer bills ให้ตรงกัน; เพิ่ม observed subtotal/quality เท่าที่ต้องใช้ วัด baseline query ของ production ก่อนเพิ่มภาระ
2. ทำ scope/loading และ controls ร่วม โดยคง 3 เดือน และ compare เป็น opt-in; query ของกราฟหลายตัวใช้ผลรวมร่วมกัน หยุด request ที่ไม่จำเป็นเมื่อเปลี่ยน scope
3. ทำ layout เจ้าของ/Accountant, Admin, ลูกค้า และสลับ all-site/site detail ตามแบบรวม
4. ทำ insight ที่มีหลักฐานและ drill-down ตามสิทธิ์ พร้อม mobile/keyboard/TH-EN/light-dark
5. ทดสอบข้ามไซต์ระหว่าง request, URL ไม่มีสิทธิ์, ลูกค้าไม่มี assignment/หนึ่งไซต์/ข้อมูลผิดปกติมากกว่าหนึ่งไซต์, future date/month boundary, no data เทียบกับ zero, counter reset, ข้อมูลบางส่วน, capacity zero และบิลมากกว่า 100 รายการ
6. ยืนยัน compare ไม่ยิง request ก่อนเปิด, แต่ละช่วงผ่าน API cap, drawer อ่านเฉพาะวันที่เปิด และวัด latency/payload ของข้อมูลหนาแน่น; หาก baseline ไม่เหมาะสมแก้ query/aggregate ก่อนเปิดเพิ่มกราฟ ไม่อ้าง performance จากเพียงจำนวนวัน
7. ตรวจภาพจริงตามบทบาททั้งภาพรวมและเลือกไซต์ พร้อมสถานะ empty/loading/error ก่อนถือว่าเสร็จ

แบบรวมได้รับอนุมัติภายหลังด้วยคำสั่ง “เริ่มทำเลย” และดำเนินการแล้ว

### Implementation rulings

- ใช้ checkout บน `codex/ui-account-consistency` เดิม เพราะ baseline ที่แผนอ้างอิงมีงาน uncommitted จำนวนมาก; สำรองไฟล์ก่อนแก้ใน `tmp/ui-consistency-baseline` และ review เทียบ baseline นี้ ไม่ถือ git diff ทั้งหมดเป็นงานรอบนี้
- การเทียบย้อนหลังใช้จำนวน **วันที่จบแล้ว** เท่ากัน ไม่เทียบวันปัจจุบันที่ยังไม่จบกับวันเต็ม เพราะ summary API มีความละเอียดระดับวัน ปุ่มอธิบายข้อจำกัดนี้ และยังคุมแต่ละช่วงไม่เกิน 3 เดือนปฏิทิน
- ใช้ actual device/profile/site/metric fingerprint แบบ opaque เพื่อยืนยันแหล่งข้อมูลตรงกันก่อนแสดงเปอร์เซ็นต์ หากไม่ทราบหรือเปลี่ยนแหล่งให้งด delta
- ใช้ single-pass daily bucketing ลด CPU โดยรักษา semantics เดิม; ยังไม่ลด raw SQL transfer แบบเสี่ยงสูญเสีย reset/quality พิสูจน์ performance เฉพาะ local fixture และ synthetic CPU benchmark ไม่อ้าง production capacity
- บิลตามช่วงแสดง preview สูงสุด 20 พร้อม total/hasMore และทางไปเอกสารทั้งหมด ยอดรวมทางการเงินคำนวณฝั่ง server ไม่รวมจากรายการ preview
- เมื่อตามลิงก์บิลจาก Dashboard ให้กลับไปไซต์/ช่วงเดิมได้โดยตรง ไม่ดึงลำดับเอกสารทุกไซต์เพื่อสร้างปุ่มก่อนหน้า/ถัดไปโดยไม่จำเป็น

## Dashboard visual revision — ยุติและคืนหน้าเดิมตามคำขอผู้ใช้

**สถานะล่าสุด:** ผู้ใช้ขอคืนหน้า Dashboard ของ commit ล่าสุด (`dad59b3`) เมื่อ 2026-10-09 เพื่ออธิบายการแก้ทีละจุด ยุติ implementation revision ด้านล่างและคืน composition/Map/Compare/Diagram เดิม โดยรักษาความเข้ากันได้กับชื่อ role `customer_user` ของ workspace ปัจจุบัน สำรองก่อนย้อนใน `tmp/dashboard-before-restore-dad59b3` ข้อเสนอด้านล่างเป็นประวัติ ไม่ใช่งานที่ต้องดำเนินต่ออัตโนมัติ

คำขอล่าสุดแทนที่ layout บางส่วนที่ทำไปแล้ว ไม่ใช่สถานะ implemented ของ revision นี้ ผู้ใช้ขอให้ส่งคำถามเป็นชุดในคำตอบแชทแต่ละรอบก่อนลงมือ

### ข้อกำหนดที่ยืนยันจากคำขอ

- คืน Map แสดงไซต์ที่มีสิทธิ์ เลือกไซต์ผ่าน marker หรือ chooser ด้านขวาบนและ sync กัน
- เน้นกราฟ สถิติ และจำนวนแยกสถานะ ลดรายการ/ตารางและ disclosure รูปสามเหลี่ยม ใช้ https://shadcnuikit.com/admin-dashboard เป็นแนวทางการจัดหน้าด้วย component เดิม
- เมื่อเลือกไซต์ เปลี่ยนแถวสถิติบนสุดเป็นแถบข้อมูลไซต์เต็มความกว้าง แสดง config ที่เหมาะกับสิทธิ์และ responsive
- เพิ่ม Compare modal ข้างตัวเลือกไซต์/ช่วงเวลา เลือกหัวข้อ เพิ่มไซต์ และเลือกช่วงเวลา ผลเปรียบเทียบต้องอ่านผ่านกราฟ
- เอาหัวข้อช่วงเวลารวมออก แสดงช่วงเวลาชิดขวาของหัวการ์ดแต่ละใบ โดย snapshot ปัจจุบันต้องระบุเวลาปัจจุบันจริง
- ปรับคอลัมน์ checkbox ใน DataTable ให้กระชับตาม checkbox และ padding ไม่ขยายกินพื้นที่ว่าง
- คงช่วงสูงสุด 3 เดือน สิทธิ์ตาม capability ลูกค้าหนึ่งไซต์ และ missing ไม่เท่ากับ zero ตามข้อตกลงเดิม

### หลักฐานจาก repository

- commit `7eadf2a` มี SiteMap และ CompareModal ใน dashboard; component ทั้งสองยังอยู่แต่ composition ปัจจุบันไม่ได้ mount
- SiteMap ใช้ availableMapSites และ shared site-selection provider จึงใช้คืนได้โดยไม่เขียน map ใหม่
- Compare เดิมรับสูงสุด 10 ไซต์และช่วงเดียว มี energy/billed/live power/capacity; ยังไม่มี cash-received หรือ outstanding comparison
- Site context มีข้อมูล config อยู่แล้ว แต่ต้องจัดทั้ง API และ UI ให้ส่ง/แสดงเฉพาะสิทธิ์ โดยเฉพาะ technical fields
- Power diagram ปัจจุบันทราบ solar generation เท่านั้น; building load, solar-to-building, grid import/export เป็น null ห้ามอนุมานเป็นไฟไหลจริง
- DataTable ใช้ width เฉพาะ actions และยังไม่ใช้ columnDef.size กับเซลล์ จึงต้องแก้ rendering ของ shared component ด้วย

### Decision frontier รอบ 1

1. ตำแหน่งและพฤติกรรม Map ใน overview/selected-site/mobile
2. ความหนาแน่นและการเปิดรายละเอียด config ในแถบไซต์เต็มความกว้าง
3. รูปแบบเทียบข้ามไซต์กับข้ามช่วงเวลา และจำนวนชุดข้อมูลต่อกราฟ
4. แสดงผล compare ภายใน modal หรือใช้ modal ตั้งค่ากราฟหน้า dashboard
5. หัวข้อการเงินสำหรับ compare และการแยก snapshot ปัจจุบันจากย้อนหลัง
6. ขอบเขต diagram ที่มีข้อมูลจริงเทียบกับการเพิ่มแหล่งวัด/config ใหม่
7. สรุปสถานะและรายการงานที่คงไว้โดยไม่ใช้ disclosure ยาว
8. ขอบเขตการปรับหน้าตาอื่นตาม reference ใน revision นี้

ผู้ใช้อนุมัติคำแนะนำ Q1–Q8 ทั้งหมดด้วย “ตามที่แนะนำทั้งหมด” เมื่อ 2026-10-09

### ข้อสรุปที่อนุมัติและลำดับลงมือ

1. คืน Map ทุกไซต์ที่มีสิทธิ์ sync chooser/URL เลือกแล้วเน้น marker แต่ยังสลับไซต์อื่นได้; มือถืออยู่หลังข้อมูลสรุป ไซต์ไม่มีพิกัดยังเลือกใน chooser
2. แถบไซต์เต็มบรรทัดแทน KPI row แสดงข้อมูลสำคัญตามสิทธิ์ มีปุ่มรายละเอียดเปิด Sheet; KPI ย้ายอยู่ในกราฟที่เกี่ยวข้อง
3. Compare modal ใหญ่/mobile fullscreen มีสองโหมด: สูงสุด 5 ไซต์ช่วงเดียวกัน หรือไซต์เดียว 2 ช่วง แต่ละช่วงไม่เกิน 3 เดือน กดแสดงผลจึงโหลด ไม่เปลี่ยน scope ด้านหลัง
4. กราฟเทียบพลังงาน kWh/kWh ต่อ kWp และการเงินยอดวางบิล/รับชำระ; ยอดค้าง/เกินกำหนดเป็น snapshot ปัจจุบันข้ามไซต์เท่านั้น แยกหน่วยคนละกราฟ
5. Diagram เคลื่อนไหวเฉพาะกำลังผลิตจริงที่สด; ไม่อนุมาน load/grid flow หรือกระแส A จาก kW; เคารพ reduced motion
6. สถิติแยกสถานะและกราฟเป็นหลัก เก็บงานเร่งด่วนไม่เกิน 3 รายการ เปิดทั้งหมดผ่านปุ่ม; ไม่มี disclosure รูปสามเหลี่ยมบนการ์ดหลัก
7. ช่วงเวลาอยู่ขวาหัวการ์ดและขึ้นบรรทัดใหม่บนมือถือ snapshot ใช้ as-of จริง; ลบหัวข้อช่วงเวลารวม
8. แก้ checkbox shared table ทั่วระบบ งานเปลี่ยนโครงเนื้อหาหน้าอื่นอยู่ใน backlog รายหน้า ไม่ขยายการออกแบบใหม่ใน revision นี้

### Implementation tasks และ verification

- [ ] Task 1 — Compare modal และ model: `compare-modal.tsx`, helper/tests ใหม่; ใช้ summary API เดิมแบบ bounded scoped requests เก็บ quality/null และไม่โหลดจนกดแสดงผล ทดสอบ validation ช่วงเวลา/จำนวนไซต์/permission/abort และกราฟสองโหมด
- [ ] Task 2 — Dashboard composition: `dashboard.tsx`, `site-map.tsx`, `site-context.tsx`, `dashboard-trends.tsx`, insight cards, solar diagram; คืน map, role header/sheet, card dates, chart-first presentation และ API context technical authorization ทดสอบ role isolation และ scope switching
- [ ] Task 3 — Shared table: constrain selection column ทั้ง header/body ไม่ขยาย blank space; ตรวจตารางไซต์/เรตและ mobile cards
- [ ] Task 4 — ตรวจ web/API suites, rendered desktop/mobile/TH-EN/dark, no lazy compare request, selections sync, diagram no fabricated flows; review task patch เทียบ baseline และบันทึกผล

Ruling: ใช้ checkout/branch เดิมต่อเพราะ revision พึ่งงาน uncommitted รอบก่อน สำรองไฟล์ก่อนแก้ใน `tmp/dashboard-visual-revision-baseline`; ไม่ commit งานอื่นหรือย้าย checkout โดยทำให้ baseline หาย
