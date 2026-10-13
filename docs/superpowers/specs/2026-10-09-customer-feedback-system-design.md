# ระบบไซต์งาน การเรียกเก็บเงิน และประสบการณ์ผู้ใช้

สถานะ: ผู้ใช้อนุมัติให้ลงมือแล้ว และนำไปใช้งานในระบบ DEMO local วันที่ 9 ตุลาคม 2569 รายละเอียดธุรกิจยึดคำตอบ Q1–Q34 และคำสั่งล่าสุดที่ตัด OCR ออก ผลตรวจรับและข้อจำกัดอยู่ในแผน implementation

## 1. เป้าหมายและศัพท์

ระบบสร้างไซต์งานและบริหารบริการ ไม่ใช่ระบบทำสัญญา เอา contract workflow ออกจากหน้าจอ/API/การคิดบิล/งานเบื้องหลัง ใช้ Site Billing Configuration แทน ไม่ล้างข้อมูลหรือไฟล์ประวัติโดยปริยาย

ชื่อเมนูใช้ “ข้อมูลลูกค้า”, “ไซต์งาน”, “เกตเวย์”, “ใบวางบิล”, “ใบเสร็จรับเงิน” เอกสารใบเสร็จเป็นใบเสร็จรับเงิน/ใบกำกับภาษีเต็มรูปแบบ เนื้อหาเอกสารไม่ต่อท้ายคำอังกฤษในวงเล็บ

## 2. สิทธิ์และ flow

| บทบาท | งานหลัก | ขอบเขต |
| --- | --- | --- |
| Owner | สร้างไซต์ ตั้งค่าบริการ/ลูกค้าออกเอกสาร/เรท/รอบชำระ ตรวจเงิน ออกบิลเพิ่ม | ทุกไซต์ที่บทบาทปัจจุบันอนุญาต |
| Admin | ข้อมูลลูกค้า เกตเวย์ อุปกรณ์ Register รายการข้อมูล Alert เทคนิค | ไม่มีสิทธิ์เอกสารและข้อมูลการเงินผ่านหน้า/API/download/widgets/notification |
| Accountant | บิลเพิ่มเติม ตรวจหลักฐาน ใบเสร็จ และตั้งค่าบัญชีตามสิทธิ์ | ไม่ได้เพิ่มสิทธิ์เทคนิคโดยปริยาย |
| Operator | เทคนิคและการเชื่อมต่อ | คงสิทธิ์เทคนิค ตรวจ scope ตามระบบ |
| customer_user | การผลิต ใบวางบิล ใบเสร็จ แนบหลักฐาน | หนึ่งบัญชีหนึ่งไซต์; หนึ่งไซต์มีหลายบัญชี |

Owner สร้างข้อมูลธุรกิจก่อน Admin เข้าหน้าเกตเวย์เพื่อผูกและตั้งค่า หนึ่งไซต์มีหนึ่งเกตเวย์และหลายอุปกรณ์ได้ บังคับ uniqueness ใน database/write paths ไม่ใช่เพียง UI

ผู้แทนลูกค้าเปิดไซต์ประจำทันที ไม่มีปุ่มทุกไซต์หรือ multi-site actions ใช้ persisted site assignment ตรวจสิทธิ์ทั้ง list/detail/PDF/ชำระ/แจ้งเตือน/ผู้รับอีเมล ไม่มี assignment ไม่มีข้อมูล ถอนสิทธิ์มีผลกับ session ที่เปิดอยู่ การถอนสิทธิ์ไซต์แยกจากปิดบัญชี

## 3. ข้อมูลและการย้ายโมเดล

แยก customer identity, site service configuration, tariff catalog, site rate history, billing cycle, document revision, transfer evidence/decision และ delivery attempt ข้อมูลลูกค้าสำหรับเอกสารและค่าการคำนวณถูก snapshot เมื่อออก ไม่เปลี่ยนต้นฉบับเพราะแก้ข้อมูลกลาง

ย้าย dependency ของ contract_id ใน rate/cycle/document/recipient/calculation/readiness/scheduler/fixtures ไป site configuration และ version ตรวจการอ้างอิงเดิมก่อน migration เก็บเอกสารและ audit ประวัติที่จำเป็น ยกเลิก defaultUnitPriceThb แฝง ไม่เปิดใช้งานสอง workflow ที่ผู้ใช้ต้องเลือกเอง

ไซต์แยกความพร้อมเทคนิคกับความพร้อมเรียกเก็บ ไม่มีเรท/ข้อมูลผู้ออก/ผู้รับ/ภาษีที่ยืนยัน/ข้อมูลมิเตอร์ที่ต้องใช้ ให้แสดงงานที่ขาดและไม่ออกเอกสารผิด

## 4. เรทกลาง รายไซต์ และการแก้ใบวางบิล

ตั้งค่าระบบมี catalog และตารางไซต์ทั้งหมดพร้อมเรท Search/filter และ 3-dot แก้รายไซต์ รองรับเลือกไซต์เอง, จับคู่เรท ณ วันมีผล เช่น 3.5 → 3.7, หรือทุกไซต์ แสดงผลกระทบและวันที่มีผลก่อนบันทึก จับคู่ด้วย decimal แบบแน่นอน ไม่ใช้ floating-point equality

ประวัติเรทไม่มีช่วงซ้อน สิ้นสุดเรทเก่าก่อนวันเริ่มใหม่และเพิ่มเรทใหม่ไม่มีวันสิ้นสุด ก่อนแทนที่เรทอนาคตต้องเตือนพร้อมรายการ affected sites/rates/เอกสาร เก็บ audit ผู้แก้ เหตุผล และค่าก่อน/หลัง

แก้จากใบวางบิล: กระทบเฉพาะไซต์และบิลที่เลือก เริ่มตั้งแต่วันเริ่มรอบบิลนั้น เช่น บิลตุลาคมเริ่ม 1 ตุลาคม ไม่ใช่วันกดแก้ คำนวณใหม่และออก/ส่งฉบับแก้ไขทันทีโดย Owner ไม่ต้องผู้อนุมัติคนที่สอง ใช้เรทใหม่ต่อในอนาคตแต่ไม่แก้บิลอื่นที่ออกแล้วตามอัตโนมัติ คงวันครบกำหนดและการทวงเดิม

พักแก้เมื่อมีหลักฐานรอตรวจ ล็อกเมื่อมี transfer อนุมัติแล้วแม้บางส่วน ห้ามแก้บิลชำระแล้ว ตรวจเงื่อนไขซ้ำใต้ transaction/lock เพื่อไม่ให้ approve กับ rate edit เกิดแข่งกัน เก็บเอกสารเดิมเป็น superseded และใช้ revision ใหม่เป็น current; PDF แต่ละฉบับคงเดิม ใช้กลไกเลขเอกสารที่กำหนดชัดก่อน implementation

## 5. ออกบิลปกติและเพิ่มเติม

ปิดรอบเดือนและออก/ส่งเวลา 01:00 วันที่ 1 Asia/Bangkok โดยไม่รอยืนยัน ใช้วันออกจริงและเงื่อนไขชำระของไซต์ ไซต์เริ่มกลางเดือนคิดตั้งแต่วันที่เริ่มบริการถึงสิ้นเดือน ใช้ข้อมูลจริง ณ ขอบช่วงตาม policy มิเตอร์เดิม ไม่สร้างค่าประมาณ ข้อมูลขาดแจ้งเจ้าหน้าที่และ recheck

manual bill: Owner/Accountant เลือกลูกค้าและไซต์ เพิ่ม/แก้/ลบรายการรายละเอียด จำนวน ราคาต่อหน่วย หมายเหตุ คำนวณรวมและภาษีอัตโนมัติตาม config ที่บัญชียืนยัน รองรับราคาแบบรวม/ไม่รวมภาษี Preview ก่อนออก เติม due date จากไซต์และแก้ได้ กดออกแล้วส่งอีเมล ใช้หลักฐาน/ใบเสร็จ/ทวงชุดเดียวกัน ไม่เปลี่ยนเรทพลังงาน

ไม่กำหนด VAT หรือ withholding จาก PDF reference ค่าเหล่านี้ต้องตั้งและยืนยันโดยผู้รับผิดชอบบัญชีก่อนใช้จริง DEMO ใช้ข้อมูลทดสอบที่ระบุชัด ไม่อ้างว่าเป็นกติกาบัญชีจริง

## 6. แนบหลักฐานอย่างง่ายและการตรวจเงิน

ข้อกำหนดล่าสุดแทน Q21/Q28/Q29: ตัด OCR ทั้งหมด ลูกค้าเลือกใบวางบิล → แนบภาพ/PDF → ดู preview → ส่งหลักฐาน ไม่บังคับกรอกข้อมูลซ้ำจากสลิป มี “หมายเหตุเพิ่มเติม” ช่องเดียวที่ไม่บังคับ เช่น แจ้งว่าแบ่งโอนหรือคนอื่นโอนให้

ระบบระบุลูกค้า/ไซต์/ใบวางบิล/ผู้ส่ง/เวลาส่งเองจากข้อมูลที่มีสิทธิ์ ไม่ให้ลูกค้าเลือกซ้ำ แสดงยอดบิลหรือยอดคงเหลือเป็นข้อมูลอ้างอิงเท่านั้น ไม่ถือว่าเป็นยอดโอนจริง และไม่ใส่เวลาปัจจุบันแทนเวลาโอน

เจ้าหน้าที่อ่านหลักฐานและกรอก “ยอดโอนที่ตรวจพบ” และ “วันเวลาโอน” ก่อนอนุมัติแต่ละรายการ; เลขอ้างอิงบันทึกได้ถ้ามีเพื่อช่วยตรวจซ้ำ ธนาคาร/ชื่อผู้โอนบันทึกเพิ่มเติมได้ตามจำเป็น ไม่บังคับลูกค้ากรอก ไม่เปลี่ยนผู้รับเอกสารเป็นชื่อผู้โอนโดยอัตโนมัติ

ปรับ submission API ให้สร้าง evidence pending ได้โดยยังไม่มี transfer amount/time ที่ยืนยัน แยก submittedAt, verifiedTransferAt, verifiedAmount และผู้ตรวจ; ไม่ใช้ยอดบิลหรือเวลาส่งเป็นค่าธุรกรรมจริง ข้อมูลเก่าที่ลูกค้าเคยกรอกเก็บเป็น declared values เพื่อประวัติ ไม่ถือว่า verified โดยอัตโนมัติ หากหลักฐานไม่ชัดให้ปฏิเสธพร้อมเหตุผลและส่งใหม่ได้

หน้าตรวจ desktop แสดงภาพ/PDF ซูมได้คู่ยอดบิล รายการโอน ผู้ส่งและประวัติ เปิดใบวางบิลในหน้าได้ mobile เรียงแนวตั้ง ตรวจแต่ละ transfer แยกกัน ไม่รวมผลตัดสินทั้ง batch

approved transfer สะสมยอดจาก verifiedAmount เท่านั้น แต่บิลเป็น paid และออกใบเสร็จเมื่อครบยอด ขาด/เกินแสดงส่วนต่าง ไม่ปิดบิลอัตโนมัติ รายการยังไม่ตรวจแสดง “รอตรวจยอด” ไม่แสดงเป็นยอดศูนย์หรือยอดตามบิล การอนุมัติที่ทำให้เกินยอดต้องไม่สำเร็จเงียบ ๆ เก็บไว้ให้เจ้าหน้าที่จัดการ ปฏิเสธระบุเหตุผล แจ้งลูกค้าในระบบ/อีเมล ส่งใหม่ได้โดยคงประวัติ ตรวจไฟล์ซ้ำ/เลขอ้างอิงซ้ำเมื่อมีและอนุมัติพร้อมกัน

## 7. เอกสารและลายเซ็น

ใช้ reference QT2610001-PJ26012.pdf เฉพาะรูปแบบ: logo ซ้ายบน title/number/date/due date ขวาบน บริษัท/ลูกค้าสองคอลัมน์ ตารางรายการ สรุปยอด/payment/notes และลายเซ็นท้าย ไม่ใช้ชื่อบริษัท รายการหรือภาษีของ reference เป็น config จริง

ใบวางบิล: ผู้วางบิล/ผู้รับวางบิล ใบเสร็จ: ผู้รับเงิน ตั้งชื่อ/ตำแหน่งและอัปโหลดลายเซ็นผู้วางบิลให้แนบอัตโนมัติได้ ไม่มีภาพเว้นช่องเซ็น ใช้ logo/signature ที่ตั้งค่าจริงและ snapshot bytes/identity ต่อฉบับ

ฝั่งลูกค้าแยกหน้าใบวางบิลและใบเสร็จ ตารางแสดงวันที่ รอบ/รายการ สถานะ ยอด เรทตามประเภท และดาวน์โหลดตามเอกสารที่มี หน้ารายละเอียดมี inline original PDF และลิงก์เอกสารที่เกี่ยวข้อง ใบวางบิลแสดงรายการโอน/ใบเสร็จ ใบเสร็จย้อนกลับใบวางบิล ใช้ scope เดียวกัน ไม่มีไฟล์แสดง unavailable ไม่สร้างไฟล์ประวัติจาก config ล่าสุด

ปรับ PDF pagination ให้หัวตารางซ้ำ ตารางไม่ล้น ไม่ตัดยอด/ลายเซ็นกลางกลุ่ม ใช้พื้นที่ตามเนื้อหา ไม่เติมแถวว่างจำนวนมากเพียงเพื่อเลียนแบบตัวอย่าง ตรวจ A4 export และ preview ให้เป็นฉบับเดียวกัน

## 8. การแจ้งเตือนและการทวง

Alert: offline, stale telemetry, value threshold กำหนดไซต์/ค่าข้อมูล/operator/threshold/duration/cooldown/ผู้รับ/ช่องทาง และ optional recovery ผู้รับมีสิทธิ์ข้อมูลนั้น เก็บ rule/event/attempt/read state แยกกัน ไม่ตีความเปิดอ่านเป็น acknowledge alarm

ทวง: due date, reminder start, interval รายไซต์เติมจากกลางได้ เปิดใช้เมื่อกำหนดครบ พักระหว่างตรวจหลักฐาน หยุดเมื่อ paid/cancelled กลับตามกำหนดหลัง reject เก็บ attempt และ bounded retry อีเมลล้มเหลวไม่แสดงสำเร็จ การแก้ใบวางบิลไม่เลื่อน due date หรือ reset schedule

## 9. รายการข้อมูล Register และ Dashboard

หัวข้อ “รายการข้อมูล” มี Table/Code icon tabs draft เดียว แก้ทั้งสองมุมมอง sync เมื่อ JSON valid ถ้า invalid เก็บข้อความและข้อมูล valid ล่าสุด ห้าม save และไม่สูญค่าจากการสลับ

Register template ผูกผู้ผลิต/รุ่น/version/address/count/function/data type/endian/scale/unit มี override รายอุปกรณ์ ปรับอุปกรณ์หนึ่งไม่เปลี่ยนรุ่นกลางหรือเครื่องอื่น แยก JSON path จาก Modbus address การนำ config ไป hardware ต้องทดสอบตาม protocol และเห็นผล applied/failed จริง

ทุกหน้ามี title ลูกค้า+ไซต์ Dashboard แยก kW/kWh ยอดเรียกเก็บ/ยอดรับชำระและสถานะเอกสาร ข้อมูลขาดไม่แสดงเป็นศูนย์ Owner เห็นข้อมูลธุรกิจ Admin เห็น gateway/config ลูกค้าเห็นไซต์ตนเองเท่านั้น ใช้ config display fields เดิมต่อยอดตามสิทธิ์

## 10. ลำดับแผนย่อยและการตรวจรับ

1. Site model/access: migration, site-account assignments, role matrix, ไม่มี contract prerequisite, one gateway constraint
2. Customer/site/gateway UX: เมนูและ flow แยก, readiness, Table/Code, register templates, scope ทุกรายละเอียด
3. Billing/tariff core: catalog/site history/bulk preview, automatic/manual bills, revisions, payment locks, decimal/tax snapshots
4. Payment evidence: attachment-only submission, optional note, reviewer verified amount/time, per-transfer review และ exact settlement
5. Document UX/PDF: แยกตาราง, related links, inline original, logo/signature และ reference layout
6. Automation/alerts/dashboard: issuance/reminder/outbox/recipient checks, operational rules และ role-specific production/finance views

แต่ละแผนมี files/interfaces/migration และ test cases ของตัวเอง ใช้ baseline ของ workspace จริง ไม่หยิบ proposal มานับว่าใช้งานแล้ว ไม่ deploy/commit/change data จนมีขอบเขตที่ยืนยัน

ตรวจรับหลัก: cross-site role denial และ revoked-session; JSON round trip; tariff boundaries/ย้อนช่วงเฉพาะบิลที่เลือก/อนาคตถูกแทน; bulk matched sets; concurrent rate edit/partial approval; duplicate jobs/receipt/email; under/overpayment; tax rounding/config readiness; immutable PDF/revision links; attachment-only submission/unknown amount/reviewer confirmation/upload vs transfer timestamp; reminder pause/resume; desktop/mobile ภาษาไทย/อังกฤษ light/dark และ A4 multipage

## 11. ขอบเขต DEMO และทรัพยากร

เครื่องเดิมใช้ DEMO ส่วน production กำหนดขนาดตามปริมาณลูกค้าและ scale ภายหลัง ตัด OCR service/model/queue/dependency และ benchmark ออกจาก implementation scope รายงาน OCR ที่ศึกษาก่อนหน้าคงไว้เป็นประวัติ ไม่ใช่ข้อกำหนดใช้งาน
