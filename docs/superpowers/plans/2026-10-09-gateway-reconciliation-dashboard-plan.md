# แผนเกตเวย์ การตรวจเทียบข้อมูล และ Dashboard ตามบทบาท

สถานะ: ลงมือปรับระบบตามคำตอบ Q35–Q58 แล้ว และตรวจสอบบน Docker local วันที่ 9 ตุลาคม 2026

## ข้อสรุปรอบ Q35–Q37 และคำสั่งล่าสุด

- Q35 รองรับพลังงานและกำลังไฟ โดยใช้งานผ่านรายการข้อมูลรูปแบบเดียวกัน แก้ Table/Code และตั้ง Register Addressได้ ไม่สร้างระบบFieldsอีกชุดสำหรับLogger
- Q36 ค่าคลาดเคลื่อนใช้แจ้งเตือนและตรวจสอบ ไม่เปลี่ยนมิเตอร์หลัก/ข้อมูลออกบิลเอง การขาดข้อมูลมิเตอร์หลักยังใช้gateเดิม
- Q37 ยอดค้างที่เลยกำหนดยังเป็นหนี้เกินกำหนดจนอนุมัติเงินจริง มีbadgeรอตรวจและพักทวงตามกติกาเดิม
- คำสั่งล่าสุดแทนข้อกำหนดเมนูเดิม: Ownerจัดการไซต์และข้อมูลลูกค้าในหน้าไซต์; เอาเมนูข้อมูลลูกค้าออก; Adminไม่เห็นหน้าทะเบียนไซต์/ข้อมูลธุรกิจของไซต์ และใช้เมนู“จัดการเกตเวย์”
- หน้าจัดการเกตเวย์เป็นตารางรายการเกตเวย์ที่บันทึกแล้ว ลักษณะเดียวกับตารางไซต์ มีเพิ่มเกตเวย์และเลือกไซต์ที่Ownerสร้างไว้ ห้ามสร้างลูกค้าหรือไซต์ใหม่จากflowAdmin
- การเอาเมนูออกไม่เท่ากับตัดสิทธิ์เลือกไซต์ที่จำเป็นต่อการผูกเกตเวย์ ต้องมีprojectionตัวเลือกไซต์ที่จำกัดข้อมูลและwrite allowlistฝั่งAPI
- ค่าตั้งต้นระบบเปลี่ยนdisplayเป็นแถวหัวข้อซ้าย/ค่าขวาในบรรทัดเดียวกัน เช่น“ความถี่ข้อมูลตั้งต้น | 60 วินาที” ส่วนการเงิน/เลขเอกสารแยกตามสิทธิ์ไม่แสดงแก่Admin
- รายละเอียดลูกค้าหลายไซต์ การบันทึกเกตเวย์ก่อนรับข้อมูล และนโยบายcadence/toleranceยังเป็นfrontier ไม่ถือว่าผู้ใช้ตอบแล้ว

## ข้อกำหนดที่ยืนยันแล้ว

- หนึ่งไซต์งานมีหนึ่งเกตเวย์ เกตเวย์มีอุปกรณ์หลายตัวได้ อุปกรณ์เพิ่มเติมเป็นแหล่งข้อมูลประกอบการตรวจสอบ ไม่สร้างเกตเวย์ซ้ำและไม่รวมค่าจากสองแหล่งเป็นยอดผลิต
- ส่วนการเชื่อมต่อและ Preset ใช้ชื่อ “การตั้งค่าเกตเวย์”
- เมื่อ Admin/Owner เลือกไซต์เดียวบนDashboard การ์ดข้อมูลไซต์ต้องแทนแถวสถิติบนสุด มีชื่อไซต์ เกตเวย์ อุปกรณ์ และการตั้งค่าตามสิทธิ์; Adminไม่มีหน้าทะเบียนไซต์
- Owner เน้นข้อมูลสำหรับบริหารธุรกิจ Admin เน้นการบำรุงรักษา และยังไม่มีสิทธิ์การเงินตามข้อกำหนดที่อนุมัติไว้
- ตารางไซต์แสดงข้อมูลทะเบียนไซต์ ตารางเกตเวย์แสดงข้อมูลการเชื่อมต่อและการทำงานของเกตเวย์
- แต่ละ Locale ใช้ภาษาเดียวสำหรับข้อความระบบ ไม่มีภาษาอังกฤษแปลซ้ำในวงเล็บ ข้อยกเว้นคือศัพท์เทคนิค รหัส รุ่น Topic และหน่วยที่จำเป็น ข้อความลูกค้าหรือหลักฐานต้นฉบับไม่ถูกแปลทับ

## ผลตรวจโค้ดจริง

1. `payload-ingestion.ts` รองรับ `solar/v1/sites/{site}/gateways/{gateway}/devices/+/telemetry` อยู่แล้ว ต้องลงทะเบียนอุปกรณ์และผูก profile ให้ตรงไซต์/เกตเวย์/ตัวตน broker
2. `mqtt-ingestion.service.ts` รับต่อเนื่อง มี reconnect/subscription restoration และตรวจการเปลี่ยน config broker อยู่แล้ว ไม่ต้องสร้างระบบนำเข้าข้อมูลชุดใหม่
3. เก็บ payload และ profile revision แยกอุปกรณ์ มี message deduplication และตอบรับหลัง transaction commit ทดสอบมิเตอร์กับ Logger ร่วมกันแล้ว
4. ยังไม่มีการจับคู่แหล่งข้อมูล ผลตรวจเทียบ หรือ cadence แยกอุปกรณ์/กลุ่ม freshness หลายจุดใช้120วินาทีตายตัว
5. Profile มิเตอร์ปัจจุบันคือ `energy.active.import.total`; Logger มี `solar.total_yield`, `solar.daily_yield`, `solar.active_power` หน่วยเหมือนกันไม่ได้พิสูจน์ว่าจุดวัดเหมือนกัน
6. ระบบออกบิลผูกมิเตอร์หลักอย่างชัดเจน การรับ Logger ไม่ควรเปลี่ยนแหล่งออกบิลโดยเงียบ ๆ
7. ตารางไซต์ผิดจาก backend ส่ง label8รายการ แต่ frontendเลือก key10รายการ และจับ labelตาม index จึงเกิดหัวคอลัมน์เลื่อนและ fallback `lastUpdated/status` ตามภาพ
8. Dashboard เพิ่ม SiteContext แต่ยังแสดงแถวสถิติเดิม เมื่อเลือกไซต์เดียว Ownerยังไม่ได้รับ technical context ที่เหมาะกับการแสดงผล รายการอุปกรณ์และ configยังไม่ครบ
9. ข้อมูลการเก็บเงินปัจจุบันมี total/paid/pending/percent และ pending=total-paid จึงยังไม่แยกเกินกำหนด/รอตรวจหลักฐาน และต้องตรวจฐานยอดรับเงินจริงที่อนุมัติบางส่วน

## ต้นไม้การตัดสินใจ

- Q35 รองรับทั้งสองแล้วยืนยัน → ยังต้องกำหนด semantic/จุดวัดรายคู่และcadence/window/coverage/tolerance
- Q36 แจ้งเตือนอย่างเดียวยืนยัน → การจับคู่และแสดงหลักฐาน/ประวัติข้อผิดปกติ
- Q37 overdueนับจนapprovedยืนยัน → DTOยอดคงเหลือ/badgeงานตรวจและdrill-down
- เอาเมนูลูกค้าออก → Q38ขอบเขตข้อมูลออกเอกสารรายไซต์ → แบบฟอร์มOwnerและmigration
- ตารางเกตเวย์เฉพาะรายการบันทึก → Q39สถานะการเตรียมใช้งาน → ขั้นตอนเพิ่มและคิวmaintenance
- cadence → Q40นโยบายตั้งค่าความถี่ → frontierถัดไปเรื่องหน้าต่างเวลาและเกณฑ์เตือน
- คู่field → Q41กำหนดแหล่งผลิตบนDashboard → provenanceและการเลือกแหล่งเมื่อไม่มีข้อมูล
- เรื่องชื่อเมนู การแยกทะเบียนไซต์ การแยกบทบาท และไม่ใช้ภาษาแปลซ้ำ ยืนยันจากคำสั่งผู้ใช้แล้ว ไม่ถามซ้ำ

## A การตั้งค่าเกตเวย์และการรับข้อมูลต่อเนื่อง

หน้าจอรวมการตั้งค่าโดยแบ่งส่วน: เชื่อมต่อ broker; รหัสไซต์/เกตเวย์และ Topic ที่รับจริง; อุปกรณ์และรุ่น; Preset/รายการข้อมูล Table-Code; ความถี่ส่งที่คาดหวังแยกอุปกรณ์และกลุ่ม; คู่ตรวจสอบ; สถานะนำ config ไปใช้และผลรับข้อมูลล่าสุด

แต่ละอุปกรณ์มีรหัส ชื่อ ประเภท รุ่น profile revision ฟิลด์ หน่วย ทิศทาง/จุดวัด และ cadence ของตนเอง แสดงตัวอย่าง Topic ที่ระบบสร้างจากรหัสจริง การเพิ่มอุปกรณ์ต้องตรวจ identifier ซ้ำ ข้ามไซต์ และความสัมพันธ์กับเกตเวย์ ไม่รับ Topic ที่ไม่ลงทะเบียนเพียงเพราะรูปแบบตรง wildcard

แยกสามสถานะ: การเชื่อมต่อ broker, การติดต่อเกตเวย์, ความสดของข้อมูลรายอุปกรณ์ การมี Logger ส่งข้อมูลไม่ทำให้มิเตอร์ที่เงียบถูกแสดงว่าออนไลน์ด้วย ความถี่ที่ตั้งไว้เป็นความคาดหวังของระบบรับ ไม่อ้างว่าได้สั่ง hardware เปลี่ยนความถี่สำเร็จจนมีผลยืนยันจาก protocol

การรับแต่ละแหล่งไม่รออีกแหล่งก่อนบันทึก คง dedup/commit-before-ACK/profile pinning และ reconnectเดิม งานตรวจเทียบทำหลัง commit อย่างทนทาน ลดภาระเส้นทาง ingestion และไม่ทำให้ brokerหยุดเพราะอีกอุปกรณ์ส่งช้า

ไฟล์หลัก: `features/sites/gateway-workspace.tsx`, `gateway-device-form.tsx`, `site-configuration-details.tsx`; API assets configuration; `payload-ingestion.ts`, `mqtt-ingestion.service.ts`, payload profile contracts และ migration cadence/versioned pair configuration

## B คู่ตรวจสอบและผลเทียบ

คู่ตรวจสอบเสนอให้เก็บไซต์ อุปกรณ์/fieldทั้งสอง จุดวัดและทิศทาง หน่วย canonical cadence/profile revision หน้าต่างเวลา coverageขั้นต่ำ tolerance และวันที่ configมีผล ต้องยืนยันQ35ก่อนกำหนด fieldและสูตรจริง

- พลังงานสะสม: เทียบผลต่างของแต่ละแหล่งในช่วงเวลาเดียวกัน ไม่เทียบเลข counterดิบซึ่งมีจุดเริ่มต่างกัน ไม่บวกมิเตอร์กับ Logger ไม่รวม daily yieldกับ cumulative yieldโดยตรง
- กำลังไฟ: ใช้ข้อมูลที่มีเวลาใกล้กันใน toleranceที่กำหนด หรือสรุปตามช่วงเวลาที่มี coverageพอ ไม่จับค่าล่าสุดสองตัวที่ห่างเวลากันมากแล้วสรุปว่าผิด
- ยึดเวลาที่วัด แยกจากเวลาที่ serverรับ รอ late-arrivalตาม policyและประเมินช่วงที่กระทบใหม่โดยเก็บ revision/evidence ผลเตือนต้องไม่ซ้ำทุกครั้งที่มีข้อความใหม่
- สถานะเสนอ: รอข้อมูลอีกแหล่ง, ข้อมูลไม่พอ, ตรวจเทียบได้, ไม่ตรงเกณฑ์, ข้อมูลเก่า, คุณภาพไม่ผ่าน, พบ counter reset/configเปลี่ยน ไม่มีข้อมูลต้องไม่แทนด้วย0
- ผลเทียบมีค่าทั้งสอง ผลต่าง จำนวน/coverageตัวอย่าง ช่วงเวลา รุ่น config และเหตุผล ไม่แสดงความแม่นยำเกินหลักฐาน ห้ามสรุปเป็นพลังงานสูญเสียจริงหากจุดวัดยังไม่ยืนยัน
- ค่าเริ่มต้นกลางและ overrideรายคู่เสนอไว้ แต่ตัวเลข window/tolerance/รอข้อมูล/จำนวนครั้งก่อนเตือนเป็น frontierถัดไปหลังQ35
- แหล่งออกบิลยัง explicit bindingเดิม ไม่มี fallbackLoggerหรือแก้บิลจาก discrepancyโดยอัตโนมัติ ผลต่อการหยุดออกบิลรอQ36

แยกโมดูล comparison policy/calculator, persistence/window jobs และ query results ไม่ยัดสูตรทั้งหมดใน MQTT service งานมี idempotent window/config identity และตรวจ concurrency/configเปลี่ยน/late replay

## C Dashboard แยกบทบาทและขอบเขตไซต์

เลือกทุกไซต์: คงภาพรวมที่ช่วยตัดสินใจและจัดอันดับไซต์ที่ต้องดูต่อ เลือกไซต์เดียว: แทนแถว KPIบนสุดด้วยการ์ดไซต์จริง โดยใช้ API view DTOตามสิทธิ์ ไม่โหลด secretทั้งหมดแล้วซ่อนใน UI

การ์ดไซต์ร่วม: ชื่อ/รหัส ลูกค้า พิกัดหรือพื้นที่ กำลังติดตั้ง ช่วงข้อมูลที่กำลังดู เกตเวย์ อุปกรณ์แต่ละตัว และความสดของข้อมูล ส่วน configยาวแสดงกลุ่มอ่านง่ายและกดขยาย ไม่เปิดหลายสิบช่องพร้อมกัน

Owner: การตั้งค่าบริการ เรทที่มีผล รอบบิล/วันครบกำหนด เงื่อนไขชำระ การทวง และสรุปแหล่งข้อมูลที่ใช้ คงการแก้เทคนิคในหน้าตั้งค่าโดย Admin แสดง connection summaryที่ไม่รวมรหัสผ่าน/secret

Admin: broker/protocol/Topic รุ่นอุปกรณ์ profile/register revision cadence กลุ่มข้อมูล freshness versionที่ตั้งไว้กับ versionที่นำไปใช้ และ issueที่ต้อง maintenance ไม่แสดงเรท ยอดเงิน เอกสาร ลูกค้าการเงิน หรือค่าใช้จ่ายผ่าน widget/API

Owner insights:

- ยอดใบวางบิลที่ออกจริง ยอดรับที่อนุมัติแล้ว และยอดคงค้างจากส่วนต่าง ห้ามใช้สถานะpaidของบิลเต็มใบแทนยอดรับบางส่วน
- แยกมุมมองเงินรับตามวันโอนที่อนุมัติจริงกับการเก็บเงินของกลุ่มใบวางบิลในรอบที่เลือก ทั้งสองมุมมองมีช่วงเวลาและตัวหารต่างกัน ห้ามนำมาใช้เป็นเปอร์เซ็นต์เดียวกันโดยไม่อธิบาย
- แยกรอชำระ/เกินกำหนด/ชำระแล้ว พร้อม badgeรอตรวจหลักฐานที่เป็นสถานะงานตรวจ แสดงจำนวนเอกสารและยอดคงเหลือควบคู่
- ช่วงอายุหนี้ 1–7,8–30,31–60,มากกว่า60วันเป็นข้อเสนอ; รายการใกล้ครบกำหนดและไซต์ที่ค้างสูงสุด; คลิกเปิดรายการต้นทางพร้อม filterเดิม
- การผลิตและแนวโน้มตามช่วงที่มีข้อมูลจริง ข้อมูลไม่ครบกับจำนวนไซต์ที่ยังออกบิลไม่ได้ ชี้เหตุผลเช่น boundaryหาย/คุณภาพไม่ผ่าน
- แยกยอดเรียกเก็บ ยอดรับ และประมาณการ ไม่เรียกยอดค้างว่ารายได้ที่ได้รับ ไม่คำนวณกำไร/ROI/PRจากต้นทุนหรือสภาพอากาศที่ระบบยังไม่มี
- กราฟเปรียบเทียบใช้ช่วงเท่ากัน แสดง timezone/หน่วย/coverage ไม่เทียบเดือนปัจจุบัน9วันกับเดือนก่อนเต็มเดือนโดยไม่อธิบาย

Admin insights:

- เกตเวย์ติดต่อไม่ได้ อุปกรณ์ข้อมูลเก่าเทียบcadence รายการรอconfigหรือfailed delivery คุณภาพข้อมูล และคู่ตรวจสอบที่ผิดเกณฑ์
- เวลาlast seenแยกgateway/device/source; จำนวนdata gap/reset/clockผิด/ข้อความที่rejectและเหตุผลจากหลักฐานที่เก็บจริง
- คิวปัญหาตามseverity/อายุ/ไซต์ พร้อม actionเปิด config/ประวัติ/รับทราบ alert การเชื่อมต่อกลับมาไม่เท่ากับข้อมูลครบแล้ว
- สถิติสุขภาพระบบแสดงเท่าที่มี measurementจริง ไม่สร้างค่าlatency/uptime/error rateปลอมเพื่อเติมการ์ด

ไฟล์หลัก: `dashboard.tsx`, `site-context.tsx`, `dashboard-stats-client.tsx`, `business-dashboard.tsx`, collection chart; `dashboard.service.ts`, API dashboard contracts และ role policies

### โครงหน้า Dashboard ที่เสนอ

ใช้พื้นที่contentเต็มความกว้างที่เหลือจากsidebar มีgrid12คอลัมน์และระยะห่างสม่ำเสมอ ไม่ขยายการ์ดข้อมูลสั้นจนเป็นพื้นที่ว่างขนาดใหญ่ ไม่ใส่ทุกconfigในหน้าหลักพร้อมกัน ทุกกราฟ/ตัวเลขมีช่วงข้อมูล หน่วย และactionเปิดรายละเอียด

| แถว | Owner ภาพรวม | Admin ภาพรวม |
| --- | --- | --- |
| หัวหน้า | ชื่อหน้า/ช่วงเวลา/เลือกไซต์/เวลาข้อมูลล่าสุด | ชื่อหน้า/เลือกไซต์หรือเกตเวย์/สถานะการเชื่อมต่อข้อมูล |
| 1 | 4การ์ด: ยอดรับจริง ยอดคงค้าง เกินกำหนด งานรอตรวจ; ไม่บวกยอดoverdueซ้ำกับยอดคงค้าง | 4การ์ด: เกตเวย์ติดต่อได้ อุปกรณ์ข้อมูลเก่า ปัญหาที่ยังไม่แก้ configรอดำเนินการ |
| 2 | 8คอลัมน์กราฟการผลิตตามช่วง +4คอลัมน์งานที่ต้องทำ เช่นตรวจเงิน/ใกล้ครบกำหนด/ออกบิลไม่ได้ | 8คอลัมน์ตารางสุขภาพเกตเวย์/อุปกรณ์ +4คอลัมน์ปัญหาเร่งด่วน |
| 3 | 8คอลัมน์แนวโน้มเงินรับ/คงค้าง +4คอลัมน์อายุหนี้; ใช้ฐานช่วงเวลาที่ระบุแยกกัน | 8คอลัมน์คุณภาพ/การตรวจเทียบ +4คอลัมน์config pending/failed |
| 4 | ตารางไซต์ที่ต้องติดตามเต็ม12คอลัมน์ พร้อมยอดค้าง/coverage/สถานะเอกสารและdrill-down | คิวmaintenanceเต็ม12คอลัมน์ พร้อมอายุปัญหา/อุปกรณ์/สาเหตุ/action |

เลือกไซต์เดียว: แถว1แทนด้วยการ์ดไซต์เต็ม12คอลัมน์ ภายในการ์ดแบ่งข้อมูลไซต์4/เกตเวย์+อุปกรณ์4/configตามบทบาท4 และขยายรายละเอียดได้ จากนั้นแถวถัดไปเป็นinsightของไซต์นั้น ไม่แสดงจำนวนไซต์หรือแผนที่รวมซ้ำ

Ownerไซต์เดียว: กราฟผลิตและข้อมูลเงินของไซต์; timelineใบวางบิล/การโอน/การทวง; งานรอตรวจและข้อจำกัดการออกบิล Adminไซต์เดียว: timelineรับข้อมูลแยกอุปกรณ์; ผลเทียบกำลัง/พลังงาน; configversionและคิวแก้ปัญหา ตารางอุปกรณ์ช่วยเห็นว่าเครื่องไหนเงียบโดยไม่ต้องเปิดหลายdialog

แท็บเล็ตใช้6+6และย้ายคิวงานก่อนกราฟรอง มือถือใช้1คอลัมน์: ชื่อไซต์/ปัญหาหรืองานที่ต้องทำ/ยอดหลัก/กราฟ/รายละเอียด ตารางมีscrollภายในหรือรายการย่อโดยไม่ทำให้ทั้งหน้าล้น ไม่บังคับกราฟมีความสูงเพื่อเติมหน้าจอเมื่อไม่มีข้อมูล

แผนภาพการไหลไฟฟ้าและแผนที่คงไว้ในรายละเอียดหรือมุมมองที่ตอบคำถามจริง ไม่ยึดพื้นที่หน้าบริหารทุกหน้า การไม่มีข้อมูลต้องแสดงเหตุผลและทางไปแก้ไข แทนกราฟหรือการ์ดว่างซ้ำหลายใบ

## D ตารางไซต์และเกตเวย์

ไซต์: ชื่อไซต์ รหัสไซต์ ลูกค้า พื้นที่ กำลังติดตั้ง สถานะเปิดบริการ วันที่เริ่มบริการ และเมนูรายละเอียด/การตั้งค่าตามสิทธิ์ สถานะทะเบียนไซต์ไม่ใช้online/offlineแทน ไม่มี broker/Topic/พลังงานวันนี้ปนในรายการทะเบียน

เกตเวย์: ชื่อ/รหัสเกตเวย์ ไซต์แบบชื่อ+รหัส อุปกรณ์ที่ผูก สถานะติดต่อ ความสดข้อมูลล่าสุด กำลังผลิตปัจจุบันตามแหล่งที่ยืนยัน และรายการปัญหา ใช้หน่วยkWสำหรับกำลังปัจจุบัน แยกMWpของกำลังติดตั้ง อย่าเรียกสองค่านี้ชื่อเดียวกัน

แก้column contractด้วยkey+label/translation key+formatter+sort/filterแทนlabelตามindex มีdefinitionเดียวสำหรับdesktop/mobile/detail/export ห้ามใช้Object.keys fallbackเป็นหัวภาษาอังกฤษ ตารางไม่มีข้อมูล/ไม่มีเกตเวย์ต้องอ่านรู้เรื่องและไม่เลื่อนคอลัมน์

ไฟล์หลัก: API `operations.service.ts`, contracts `operations.ts`, web `operation-columns.ts`, `operation-table.tsx` และตัว export/detailที่ใช้ชุดcolumnร่วมกัน

### สิทธิ์และflowใหม่

Ownerสร้างไซต์พร้อมข้อมูลลูกค้าและเอกสาร → Adminกดเพิ่มเกตเวย์ → เลือกไซต์ที่ยังไม่มีเกตเวย์ → กรอกconnection/registerdevices/Fields → บันทึกและรอข้อมูล → ตรวจข้อมูลที่รับ/กำหนดคู่ → พร้อมดูแลต่อจากรายการเกตเวย์

Adminได้site-optionเฉพาะชื่อ/รหัส/พื้นที่/ความพร้อมผูกเกตเวย์ ไม่มีbillingconfig/ผู้รับเอกสาร/ข้อมูลภาษี/ยอดเงิน ลูกค้าในตัวเลือกเป็นคำแสดงผลไซต์ ไม่อนุญาตให้แก้ข้อมูลลูกค้าจากหน้าเทคนิค Existinggatewayต้องแก้รายการเดิมเพื่อคงข้อจำกัดหนึ่งไซต์หนึ่งเกตเวย์

Auditพบfull `/v1/sites` ส่งinvoice counts/paid counts/amountให้Admin ปัจจุบัน ต้องปิดการเข้าถึงfullbusinessprojectionแล้วเพิ่ม `GET /v1/gateways/site-options` ที่มีเฉพาะsiteId/siteCode/siteName/installationEligible/unavailableReason ตัวเลือกเพิ่มแสดงไซต์เปิดบริการที่ยังไม่มีเกตเวย์ และตรวจซ้ำในtransactionขณะบันทึก

`GET /v1/gateways` ใช้existinggatewayเป็นต้นทาง ไม่ใช้รายการไซต์แล้วleftjoinสร้างrowเกตเวย์ปลอม; detail/settings/received-data/profiles ใช้gateway-context DTO API site-scopedtechnicalเดิมต้องมีexplicitallowlistระหว่างย้าย ไม่denyทุกpathแล้วทำให้commissioningเสีย

เปลี่ยน `role-experience.ts`, `nav-config.ts`/i18n, `route-policy.ts`, `platform-access.guard.ts`, assets controller และdashboardprojectionควบคู่ Adminไม่ได้หน้า `/sites`, `/records/sites`, `/customers`, operations-sites/export หรือcustomer-details/mutations แต่ยังตรวจsite scopeในdevice/gatewayrequests

การเชิญและผูกบัญชีลูกค้าประจำไซต์ซึ่งปัจจุบันเป็นAdmin-only เป็นfrontierQ42 ส่วนแอดมินดูแลบัญชีทีมงานในตั้งค่าระบบแยกจากสิทธิ์ลูกค้าของไซต์

Frontendซ่อนเมนูเพียงอย่างเดียวไม่พอ ต้องdenyหน้า/APIสร้างแก้ทะเบียนไซต์ของAdminและแยกendpointเทคนิคที่ยังใช้งานได้ ทดสอบdeep link/export/dashboardDTO/notificationด้วย ไม่ใช้สิทธิ์กว้างของendpointเดิมเพื่อให้ตัวเลือกไซต์ทำงาน

### ค่าตั้งต้นระบบ

คงกลุ่มหัวข้อที่มีความหมาย แต่ภายในใช้รายการlabel/valueในแถวเดียวกัน แก้ไขเป็นรายกลุ่ม มีคำอธิบายใต้ค่าที่ต้องอธิบาย รายการยาวเช่นTopicมีwrapหรือcopyได้ มือถือคงสองคอลัมน์เท่าที่อ่านได้และwrapในแถว ไม่ใช้ช่องว่างกว้างแทนข้อมูล

Admin: ความถี่ตั้งต้น/ความสด/retentionข้อมูลเทคนิค/ช่องทางแจ้งเตือนตามสิทธิ์ OwnerหรือAccountant: ค่าธุรกิจและตัวอย่างเลขเอกสารตามสิทธิ์ ตัวอย่างเลขเอกสารไม่consumeเลขจริงจากsequenceเพียงเปิดหน้า

`system-settings-content.tsx` ปัจจุบันsaveทั้งcardDraftที่อาจเก่า งานใหม่ต้องsaveเฉพาะกลุ่มที่แก้พร้อมrevisionเพื่อไม่ทับค่าอื่น นำhiddendefaultUnitPriceออกจากpayloadด้วย แยกความถี่ที่อุปกรณ์ส่ง/ความถี่อ่านregisterที่สั่งhardwareได้/การsubscribeMQTT ไม่อธิบายserverMQTTว่าไปpollอุปกรณ์ทุก60วินาที

## E Locale ทั้งระบบ

สำรวจnavigation/title/button/table/filter/form/placeholder/status/validation/APIerror/toast/dialog/empty/loading/chart/tooltip/date/PDF/email/notification/downloadชื่อไฟล์/a11y รวมทั้งtheme/mobile ไม่มีlabelภาษาไทยปนในENหรือแปลENซ้ำในTH

ข้อความระบบใหม่ต้องเลือกตามlocaleแทนhardcodedสองภาษาด้วยslashหรือวงเล็บ การใช้rawkeyเช่น`lastUpdated/status`ถือเป็นข้อผิดพลาด แยกtechnicalidentifierจากข้อความที่ควรแปล ไม่ใช้regexลบวงเล็บทุกชนิดเพราะจะทำลายหน่วย/รหัสที่มีความหมาย

แยก localeของผู้รับสำหรับemail/notificationจากภาษาเครื่องผู้ส่ง PDFใหม่ใช้localeที่กำหนดตอนออกและsnapshotเดิม ประวัติoriginalห้ามถูกแปลหรือrenderทับจากconfigล่าสุด

สร้างauditรายการข้อความและtestsกำกับชุดเส้นทางจริง Thai/English × desktop/mobile × light/dark พร้อมassertว่าไม่มีtranslation keyหรือข้อความแปลซ้ำหลุด ไม่ตรวจแค่จำนวนkeyสองไฟล์เท่ากัน

จุดผิดที่ตรวจพบแล้ว: `telemetry-age-label.tsx` เติม `(Offline)` แม้ไม่มีข้อมูล; `th.ts` มีคำแปลอังกฤษซ้ำในแผนภาพ; `alert-rules-editor.tsx` แสดงTH/ENพร้อมกัน; `site-configuration-details.tsx` ไม่เลือกตามlocaleหลายส่วน; `/sites/page.tsx` hardcodeข้อความTH/EN; `operation-table.tsx` แปลจากข้อความหัวตารางและfallbackrawkey งานauditต้องครอบคลุมจุดเหล่านี้พร้อมขยายไปทุกflow

## ลำดับลงมือและตรวจรับหลังยืนยัน

1. แก้keyed column contractและทะเบียนไซต์/เกตเวย์: regressionหัวตารางตรงข้อมูล, search/sort/mobile/export และ role scoping
2. รวมgateway settingsพร้อมcadence: registration/preset/config publication statuses และ ingestทั้งสองtopicโดยไม่drop/device overwrite
3. เพิ่มpair config+comparison+history: ต่างความถี่/เวลาเข้าช้า/ซ้ำ/offset/reset/gap/quality/units/physical purpose mismatch; persistenceหลังrestartและแจ้งเตือนไม่ซ้ำ
4. แยกdashboard DTO+queries+card sets: financial scope, partial cash, overdue as-of/timezone, ไม่มีdouble count, selected-sitecardแทนKPIrowจริง
5. Localeauditและปรับข้อความทุกflow: TH/EN, email/PDFใหม่, validation/status/a11y, ไม่แก้saved originals
6. ทดสอบintegrationบนDocker local: registeredmeter+logger/topicwrongidentity, disconnect/reconnect/replay, due/payment/review cases,ทุกrole, mobile และต้นฉบับเอกสาร

แต่ละชุดมีbehavioral testsก่อนแก้ ใช้worktree/checkoutตามสถานะจริง ไม่อ้างว่ารับhardwareหรือSMTPจริงได้จากUItest ไม่seed production และไม่commit/deployโดยปริยาย

## คำถามที่ตอบแล้ว

- Q35 รองรับทั้งสอง ใช้รายการFieldsเดียวกันและตั้งRegister Addressได้ คู่ยังต้องประกาศจุดวัด/ทิศทางและsemanticให้ตรง
- Q36 ใช้แจ้งเตือน/ให้ตรวจสอบ ยังคงมิเตอร์หลักและbillinggateเดิม
- Q37 ยังคงนับหนี้เกินกำหนดก่อนอนุมัติจริง แยกbadgeรอตรวจและพักทวง

## Frontier รอบ Q38–Q43

คำตอบแล้ว: Q38แยกข้อมูลออกเอกสารรายไซต์; Q39ไม่เพิ่มflowร่าง/การติดตั้งในรอบนี้ เพราะแยกงานเจ้าหน้าที่ลงข้อมูลกับติดตั้งหน้างาน; Q40Adminกำหนดcadence; Q41เลือกsourceรายค่า; Q42Ownerจัดการตัวแทนลูกค้า; Q43เก็บประวัติและรองรับการอัปเดตconfiguration/receive mappingsต่อเนื่อง ห้ามตีความQ39ว่าเพิ่มสถานะworkflowติดตั้งชุดใหม่โดยปริยาย

- Q38 บริษัทเดียวหลายไซต์ ข้อมูลออกเอกสารแก้แยกรายไซต์หรือใช้ร่วมกัน? แนะนำแก้จากไซต์และมีค่าของไซต์แยก เพื่อไม่เปลี่ยนเอกสารอนาคตของไซต์อื่นโดยไม่ตั้งใจ เอาเมนูลูกค้าออกแต่ยังเก็บตัวตนองค์กร/ประวัติภายในตามความจำเป็น
- Q39 เกตเวย์ที่บันทึกแต่ยังไม่รับข้อมูลแสดงในตารางหรือไม่? แนะนำแสดงพร้อมสถานะกำลังตั้งค่า/รอข้อมูล/พร้อมใช้งาน/ข้อมูลเก่า/หยุดใช้งาน เพื่อแก้การติดตั้งจากรายการได้
- Q40 ความถี่คาดหวังตั้งรายอุปกรณ์/กลุ่มโดยAdminหรือปรับตามข้อมูลอัตโนมัติ? แนะนำAdminตั้ง มีPresetช่วยกรอกและสถิติความถี่ที่พบประกอบ ไม่ปรับเกณฑ์เองเมื่อเครื่องส่งช้าหรือเสีย
- Q41 แหล่งพลังงาน/กำลังผลิตบนDashboardเลือกอย่างไร? แนะนำเลือกsourceรายค่าชัดเจน ค่าเริ่มต้นLoggerสำหรับการผลิตและมิเตอร์หลักสำหรับออกบิล คู่รองใช้ตรวจเทียบ ไม่แทนค่าข้ามจุดวัดเมื่อแหล่งหลักหาย
- Q42 การเชิญ/ผูกบัญชีลูกค้าประจำไซต์ให้Ownerทำด้วยหรือไม่? แนะนำOwnerดูแลตัวแทนลูกค้าของไซต์ และAdminดูแลบัญชีทีมงาน/เทคนิคแยกตามสิทธิ์
- Q43 เปลี่ยนเครื่องหรือย้ายเกตเวย์ที่มีข้อมูลแล้วจัดการอย่างไร? แนะนำเก็บประวัติเดิมและสร้างการติดตั้งใหม่มีวันมีผล หนึ่งไซต์มีเกตเวย์ใช้งานเพียงหนึ่งตัว ไม่เขียนทับsite/device associationของreadingเก่า

ยังไม่เลือกcomparisonthreshold/sourcepriority/รายละเอียดการจัดกลุ่มขั้นสุดท้ายก่อนตอบคำถามที่เป็นprerequisite

## Topic และการปรับแผนหลัง Q38–Q43

ที่มา `energy`: legacy register-preset flowใน `site-form-dialog.tsx`, `site-edit-dialog.tsx` สร้าง `energy/{gatewayName}/#`; backend `assets.controller.ts` ฟังก์ชันตรวจendpointยืนยันรูปแบบนี้ และปฏิเสธ `solar/v1/` เมื่อยังเลือกRegister preset mode จึงเป็นข้อจำกัดจากการแบ่งmodeของระบบปัจจุบัน ไม่ได้มาจากมาตรฐานMQTTหรืออุปกรณ์ทุกรุ่น

ที่มา `solar/v1/`: `payload-ingestion.ts` สร้าง Topicมาตรฐานจากรหัสไซต์/เกตเวย์/อุปกรณ์ และใช้Data profile mode มีimmutableprofileและการตรวจidentity ปัจจุบันสองflowใช้รูปแบบTopicต่างกันทั้งที่ผู้ใช้ต้องการFields+Register Addressร่วมกัน จึงต้องแยกprotocol/topic contractออกจากวิธีตั้งField/Register ไม่ให้การเลือกRegisterบังคับprefixenergyอีกต่อไป

ออกแบบTopic generationจากรหัสที่ลงทะเบียน อัปเดตเมื่อแก้รหัสที่ยังไม่บันทึก แสดงตัวอย่างSubscribefilterของเกตเวย์และPublishtopicของแต่ละอุปกรณ์แยกกัน; `+/#`ใช้สำหรับfilterไม่ใช่Publishtopic อุปกรณ์ที่บันทึกหรือมีข้อมูลแล้วไม่เปลี่ยนidentityตามการแก้ชื่อแสดงผล

ช่องTopicมีตัวเลือก/คำแนะนำตามsite/gateway/device contextและรูปแบบprotocolที่เลือก ป้องกันsuggestionข้ามไซต์ หากผู้ใช้แก้ค่าที่สร้างไว้ต้องแสดงโหมดกำหนดเองและตรวจparser/identity/aliasก่อนsave ไม่เติมทับข้อความกำหนดเองเงียบ ๆ ประวัติTopicและreceive configเก็บversion/effective timeตามQ43

## Configuration update ที่ต้องออกแบบเพิ่ม

แยกการตั้งค่าที่ระบบต้องการ การเผยแพร่ไปGateway การตอบรับ และversionที่Gatewayนำไปใช้ ห้ามตีความpublishสำเร็จเท่ากับapplied การเปลี่ยนreceive mappingต้องรองรับข้อมูลค้างที่ส่งด้วยversionเดิม เก็บprofile revisionตามmessageจริงและไม่ถอดรหัสย้อนหลังด้วยversionใหม่

การรายงานconfigจากGatewayต้องพิสูจน์ตัวตนและมีversion/message identity แยกobservedconfigurationจากdesiredconfiguration รายงานversionเก่าหรือข้อความซ้ำไม่ย้อนdesired config การเปลี่ยนidentity/site/billingfieldต้องมีขั้นตอนยืนยันต่างจากการรายงานสถานะทั่วไป นโยบายเปิดใช้อัตโนมัติและช่วงยอมรับversionเก่าเป็นfrontierQ46

## เมนูมือถือ

ข้อกำหนดยืนยัน: mobile bottom navigation เมื่อactiveใช้สีเหลืองของแบรนด์ที่iconและlabel ไม่มีพื้นหลังกล่องสีเหลือง คง `aria-current`, keyboard focus, touch target และความต่างactive/inactiveในlight/dark ไม่เปลี่ยนปุ่มหรือsidebar desktopโดยปริยาย ไฟล์หลัก `components/navigation/mobile-bottom-nav.tsx` ซึ่งปัจจุบันใช้ `bg-primary text-primary-foreground`

## Frontier ถัดไป

คำตอบ Q44–Q47: Q44เพิ่มemployeeRBACโดยตำแหน่งเป็นpermissionpresetและปรับรายคน; Q45ยังไม่เลือกTopicpolicy ต้องอธิบายที่มาและจุดตั้งค่าก่อน; Q46ยืนยันautoสถานะ/ACKแต่เปลี่ยนmapping/identity/billingbindingต้องยืนยัน; Q47ค่ากลางพร้อมoverrideรายคู่ ทั้งตัวเลขdefaultsและpolicyRBACยังต้องยืนยัน

- Q44 การแบ่งเจ้าหน้าที่ลงข้อมูลกับติดตั้งเป็นการแบ่งงานภายนอก หรือจำกัดสิทธิ์Admin/Operatorในระบบด้วย? ไม่เพิ่มinstallationworkflowตามQ39
- Q45 รูปแบบTopicใหม่ใช้solar/v1เป็นdefaultและenergyรองรับเก่า หรือเปิดเลือกทั้งสองสำหรับการติดตั้งใหม่? แนะนำsolardefault; legacyexplicitcompatibility; Fields/Registerไม่กำหนดprefix
- Q46 Gatewayส่งconfigupdateให้applyทันทีหรือรอAdminยืนยัน? แนะนำข้อมูลสถานะ/ACKอัปเดตเอง แต่การเปลี่ยนmapping/identity/billingbindingต้องpreviewและยืนยัน เก็บversionเก่าเพื่อรับqueuedmessages
- Q47 กำหนดเกณฑ์ตรวจเทียบค่าต่างกันและช่วงเวลาแบบกลาง+overrideรายคู่หรือรายคู่เท่านั้น? แนะนำกลาง+override มีข้อเสนอเริ่มต้นและtestจากข้อมูลจริงก่อนเปิดแจ้งเตือน ไม่ใช้การตั้งcadenceแทนtolerance

## RBAC พนักงานตาม Q44

ข้อกำหนด: ตำแหน่งเป็นชุดสิทธิ์ตั้งต้น ไม่ให้ชื่อRoleเพียงอย่างเดียวตัดสินทุกหน้า สามารถตั้งสิทธิ์รายพนักงานและข้อมูลที่เข้าถึงได้ คงบัญชีลูกค้าและขอบเขตหนึ่งบัญชีหนึ่งไซต์แยกจากemployeeRBAC

โมเดลเสนอ: permission catalogตามresource/action, position presets, user overrides และdata scope พิจารณาสิทธิ์ที่serverทุกครั้งก่อนqueryหรือmutation nav/dashboard/actionsได้capability projectionจากpolicyเดียวกัน การซ่อนเมนูไม่ใช่authorization

หน้าพนักงานเสนอให้เลือกตำแหน่ง ขอบเขตไซต์ และตารางสิทธิ์แยกเมนู/ดู/สร้าง/แก้ไข/ลบ/อนุมัติ/ส่งออกตามactionที่resourceรองรับ พร้อมpreviewสิทธิ์ที่มีผล ไม่แสดงcheckboxที่ไม่มีimplementation ผู้ดูแลสิทธิ์และขอบเขตoverrideเป็นfrontierQ48–Q51

แต่ละoverrideใช้สามค่า: ตามตำแหน่ง, อนุญาต, ไม่อนุญาต (ข้อเสนอรอQ51) กรณีไม่มีสิทธิ์หรือscopeว่างต้องปฏิเสธ ไม่ตีความว่าall sites โดยเฉพาะexport/search/download/PDF/notification recipients/background jobs

ต้องรักษาinvariantsแยกจากสิทธิ์: ห้ามแก้รายการที่อนุมัติชำระแล้ว, เก็บissuedoriginal, หนึ่งเกตเวย์ใช้งานต่อไซต์, customerหนึ่งไซต์, การเปลี่ยนbinding/configมีversionและaudit สิทธิ์จัดการไม่ได้ข้ามfinanciallocksหรือallowข้ามsite

การเปลี่ยนสิทธิ์ต้องมีauditและมีผลต่อsessionที่ใช้อยู่ ไม่ปล่อยJWTเก่าถือgrantต่อจนหมดอายุ ใช้policy version/live lookupหรือcacheที่invalidateได้ revokeแล้วยืนยันAPI/เมนู/export/notificationsพร้อมกัน ป้องกันแก้สิทธิ์ตนเองจนได้manage-permissionsและป้องกันปิดผู้ดูแลสูงสุดคนสุดท้าย

จุดปัจจุบันที่ต้องเปลี่ยน: `packages/domain/src/access/access-policy.ts` ให้owner/adminผ่านแบบกว้าง; `route-policy.ts`ใช้role+path hardcoded; RoleGuard/PageAccess/nav/financialcapabilities/notification scopeยังต้องย้ายไปeffectivepermissionsร่วมกัน ไม่เพิ่มRBACtableโดยปล่อยguardเดิมให้overrideไม่มีผล

เพิ่มworkpackageRBACก่อนเปลี่ยนmenu/sites/gatewayaccess: migrationcatalog/preset/override/scope+authorizer+livecapabilities, แล้วwirefrontendและแต่ละendpoint เขียนmatrix regressionเพื่อพิสูจน์ตำแหน่งเดียวกันสิทธิ์รายคนต่างกันได้และscopeไม่รั่ว

## คำอธิบาย Q45 ที่ต้องส่งให้ผู้ใช้

- `energy/{gatewayName}/#` เป็นdefaultเขียนไว้ในฟังก์ชัน `gatewayTopic()` ของ `assets.controller.ts` และฟอร์มเก่า; ไม่ใช่ค่าที่อ่านจากMQTTbrokerหรือRegister Address และยังไม่มีช่องตั้งprefixกลางในค่าตั้งต้นระบบ
- Topicที่saveอยู่ใน `gateways.endpoint` เป็นfilterที่serversubscribe ชื่อdisplaygatewayเก่าใช้สร้างlegacyfilter ส่วนsolarใช้registeredcodes
- ฟอร์มแก้site/gatewayแบบเก่ามีช่องEndpoint/MQTTTopic (`edit-gw-endpoint`) และส่งendpointไปbackend แต่โหมดRegisterpresetมีvalidationบังคับlegacyprefixจึงพิมพ์solarอย่างเดียวแล้วsaveไม่สำเร็จ
- โหมดData profileสร้างsolarจากexternalSiteId/externalGatewayId/externalDeviceId ส่วนหน้าgatewayworkspaceสร้างgatewayใหม่ใช้solarอยู่แล้ว การเห็นenergyจึงขึ้นกับรายการเก่าและformที่เปิด ไม่ใช่ค่าที่prefixอุปกรณ์ต้องตามเสมอ
- ค่าTopicฝั่งsenderในGatewayและfilterฝั่งserverต้องเข้ากัน ตั้งRegister Addressเพียงอย่างเดียวไม่เปลี่ยนTopicที่Gatewayส่ง
- แผนเสนอรวมFields/RegisterโดยแยกTopiccontract ให้เห็นTopicที่บันทึก รูปแบบที่ใช้ ตัวอย่างPublishและSubscribefilter พร้อมautogeneration/contextsuggestions ต้องรับคำตอบTopicpolicyหลังคำอธิบายนี้ ไม่ถือQ45เป็นเลือกsolarแล้ว

## Frontier RBAC

Q48–Q52ตอบแล้ว: แยกการบริหารสิทธิ์โดยOwnerฝั่งไซต์/ลูกค้า/เอกสารและAdminฝั่งเกตเวย์/ตั้งค่าเทคนิคตามQ48; Q49all/selectedsites; Q50ไม่เปิดOwnergrantข้ามฝั่ง แต่ยึดการแยกQ48; Q51inheritpresetพร้อมoverrideและimpactpreview; Q52actionmatrix ไม่ใช่เปิดเมนูแล้วทำทุกอย่าง ข้อแนะนำเดิม“Ownerเท่านั้น”และ“Ownerเพิ่มAdminfinanceได้เอง”ถูกแทนด้วยคำตอบนี้

- Q48 ใครจัดการสิทธิ์พนักงานและpreset? แนะนำOwnerเท่านั้นเริ่มต้น และไม่มีself-escalation
- Q49 ขอบเขตemployeepermissionเป็นall sites/selectedsitesรวมทั้งresourceactionหรือแค่เมนู? แนะนำactionsที่รองรับ+all/selectedsitesโดยใช้presetช่วยกรอก
- Q50 Adminpresetปกติไม่มีไซต์/การเงิน แต่Ownerเพิ่มสิทธิ์รายคนได้หรือเป็นข้อห้ามถาวร? แนะนำpresetเป็นdefaultที่Owneroverrideได้ คงinvariantที่ข้ามไม่ได้แยกกัน
- Q51 เปลี่ยนpresetแล้วพนักงานเดิมตามpresetใหม่หรือคงsnapshotเดิม? แนะนำinheritpreset+explicitoverridesสามค่า มีimpactpreviewและไม่ล้างoverride

ผลauditRBACเพิ่มเติม: JWTguardอ่านuserปัจจุบันทุกrequestแล้ว จึงต่อpermissionrevision/live scopeได้; RoleGuardทั้งสองตัวมีAdmin bypassต้องนำออก; customerassignment040อนุญาตactive1ไซต์/user ห้ามนำมาใช้กับemployeeหลายไซต์ ให้แยกemployee scopes; `/me`และsession/capabilitiesต้องให้ข้อมูลชุดเดียวกัน; notificationเลือกผู้รับและตรวจซ้ำก่อนส่งตามpermissionปัจจุบัน; list/aggregate/exportใช้scopeก่อนpaginate/รวมยอด ไม่filterภายหลัง

- Q52 สิทธิ์รายเมนูต้องแยกดู/แก้/อนุมัติ/ดาวน์โหลดหรือเปิดเมนูแล้วทำได้ทั้งหมด? แนะนำactionmatrixตามงาน เช่นดูบิลได้แต่อนุมัติเงินไม่ได้ แสดงเมนูจากสิทธิ์ดูและควบคุมปุ่ม/APIจากactionจริง

## แบ่งเขตบริหารสิทธิ์และจัดกลุ่มตั้งค่าตาม Q48

ตำแหน่งมีpresetที่แบ่งruleสองเขตธุรกิจ/เทคนิค การแก้presetหรือoverrideต้องauthorizeเขตและactionแต่ละrule Ownerไม่แก้ruleเกตเวย์ Adminไม่แก้ruleไซต์/เอกสารหรือruleธุรกิจในpresetเดียวกัน backendตรวจทั้งชุดก่อนmutation ไม่ให้เขียนpermissionblobทั้งuserหรือpresetแล้วทับข้ามเขต

Ownerบริหาร: sites/customerbillingidentity/sitecustomeraccounts, billing/receipt/documentactions, tariffs/businessdefaults/companybanking, businessaudits และpermissionrulesฝั่งธุรกิจ Adminบริหาร: gateways/devices/fields/profiles/registers/reception/brokers/technicalalerts/cadence/rawtelemetryretention, technicalaudits และpermissionrulesฝั่งเทคนิค ทุกคนบัญชีของตนเอง/การแสดงผล/ความปลอดภัยของตนเอง

ตัวเลือกไซต์สำหรับผูกเกตเวย์เป็นtechnicalprojectionที่จำเป็น ไม่ให้สิทธิ์ทะเบียนไซต์ แยกdata scopeธุรกิจและเทคนิคเสนอไว้ในQ53 ห้ามแปลallไซต์ฝั่งใดฝั่งหนึ่งเป็นสิทธิ์ทุกข้อมูลทุกaction

ผู้จัดการสิทธิ์ให้ได้เฉพาะเขตและauthorityที่จัดการอยู่ ไม่grantselfจนข้ามเขต ไม่ถอนmanagerคนสุดท้ายของแต่ละเขตโดยไม่มีผู้รับผิดชอบแทน การเปลี่ยนposition assignmentหรือpresetทั้งชุดต้องไม่ใช้เป็นช่องทางgrantข้ามเขต รายละเอียดบัญชีกลาง/ผู้สร้างปิดบัญชีรอQ54

### โครงเมนูเสนอ

| กลุ่ม | Owner/พนักงานสิทธิ์ธุรกิจ | Admin/พนักงานสิทธิ์เทคนิค |
| --- | --- | --- |
| งานหลัก | Dashboard, ไซต์งาน, ใบวางบิล, ใบเสร็จรับเงิน | Dashboard, จัดการเกตเวย์, การแจ้งเตือนระบบ |
| ตั้งค่าธุรกิจ | บริษัทและบัญชีรับเงิน, อัตราค่าไฟ, ค่าตั้งต้นบริการและเอกสาร | ไม่แสดง |
| ตั้งค่าเกตเวย์ | ไม่แก้เทคนิคผ่านเมนูนี้ | การเชื่อมต่อส่วนกลาง, แม่แบบอุปกรณ์และรายการข้อมูล, ค่าตั้งต้นการรับข้อมูล/ตรวจเทียบ/ข้อมูลเก็บรักษาเทคนิค |
| ทีมงานและสิทธิ์ | พนักงาน/ตำแหน่ง/สิทธิ์ที่จัดการได้ในเขตธุรกิจ | พนักงาน/ตำแหน่ง/สิทธิ์ที่จัดการได้ในเขตเทคนิค |
| ประวัติการทำงาน | เฉพาะธุรกิจและการเปลี่ยนสิทธิ์ฝั่งธุรกิจ | เฉพาะเทคนิคและการเปลี่ยนสิทธิ์ฝั่งเทคนิค |
| บัญชีของฉัน | ข้อมูลส่วนตัว การแสดงผล ความปลอดภัยของตนเอง | เช่นเดียวกัน |

หน้าจัดการเกตเวย์คือจุดเข้าconfigurationรายติดตั้งทั้งหมด ไม่เอาตั้งค่าconnection/devicefieldsของไซต์เดียวไปวางซ้ำในตั้งค่าระบบ ตั้งค่าส่วนกลางเก็บเฉพาะแม่แบบ/ค่าตั้งต้น/connectionที่ใช้ซ้ำได้ แก้จากcontextdialogใช้editor/serviceเดียวกันกับหน้ากลาง ไม่สร้างข้อมูลกลางคนละชุด

ตำแหน่ง/สิทธิ์อยู่ที่เดียวกับพนักงานเป็นtabsหรือส่วนในpage ไม่เพิ่มเมนูRBACกระจัดกระจาย บุคคลคนเดียวมีrowบัญชีเดียว แต่แสดงสิทธิ์ต่างกันตามผู้จัดการเขต หน้าsettingshub/sidebar/mobileใช้descriptorและeffectivepermissionชุดเดียวกัน

Retentionแยกraw/technicaldataโดยAdminและเอกสาร/การเงินโดยOwner ไม่อนุญาตAdminลดอายุเก็บหรืออ่านเอกสารผ่านsettingรวม การแจ้งเตือนกลางแยกช่องทางเทคนิคกับกติกาnotificationธุรกิจ การส่งออกauditต้องscopeและredactbefore/afterตามเขตด้วย

บันทึกsettingเฉพาะsection/fieldที่มีสิทธิ์พร้อมrevision ตั้งค่าธุรกิจและเทคนิคไม่saveblobรวม การย้ายเมนูเก่ามีredirectตามสิทธิ์ แต่ไม่คงendpointกว้างเพื่อรองรับlinkเก่าโดยเพิ่มสิทธิ์

Auditยืนยัน `settings.service.ts` รับkeyเกือบทุกตัวและupsertทีละkeyไม่มีtransaction/revision ส่วนRoleGuardให้Adminผ่านOwnerdecoratorได้ งานนี้ต้องเปลี่ยนเป็นsection-specificvalidatedPATCH+explicitkeyallowlist+atomictransaction+audit ไม่พึ่งTypeScriptPartialเป็นruntimevalidation และแยกaggregateRetentionYearsซึ่งรวมtelemetryกับเอกสารในfieldเดียวอยู่

## Frontier Q53–Q55

คำตอบยืนยันแล้ว: Q53พนักงานหนึ่งบัญชีรับสิทธิ์สองเขตได้ โดยdata scopeแยกเขต; Q54Owner/Adminเชิญได้และถอนเฉพาะสิทธิ์ฝั่งตนเอง ปิดบัญชีรวมโดยOwnerพร้อมimpactpreview; Q55ผู้จัดการสิทธิ์จำกัดOwner/Adminเริ่มต้น ไม่delegateพนักงานโดยปริยาย การเลือกpositionpresetต้องไม่autoactivategrantอีกเขตโดยผู้จัดการเขตเดียว

- Q53 พนักงานคนเดียวมีสิทธิ์ทั้งสองเขตได้และกำหนดไซต์แยกกันหรือไม่? แนะนำได้ เช่นดูเอกสารไซต์A,Bและซ่อมเกตเวย์ไซต์C โดยOwner/Adminจัดการscopeของเขตตนเอง
- Q54 ใครเพิ่มและปิดบัญชีพนักงานร่วม? แนะนำทั้งสองเชิญได้ในเขตตนเอง ใช้บัญชีเดียวเมื่อมีอยู่แล้ว ถอนสิทธิ์เฉพาะเขตได้เอง แต่ปิดทั้งบัญชีให้Ownerจัดการพร้อมpreviewผลกระทบ ไม่ใช้การปิดบัญชีแทนถอนสิทธิ์เทคนิค
- Q55 สิทธิ์บริหารgrantให้ผู้ช่วยจัดการต่อได้หรือจำกัดOwner/Adminเท่านั้น? แนะนำเริ่มจำกัดสองผู้จัดการเขต ผู้ช่วยได้รับactionทำงานแต่ไม่ได้managepermissionsโดยปริยาย

## Frontier เพื่อปิดแผน Q56–Q58

คำตอบยืนยันแล้ว: Q56solar/v1เป็นdefaultใหม่พร้อมlegacyexplicitcompatibility/autogeneration ไม่เปลี่ยนรายการเก่าเอง; Q57ยืนยันค่ากลาง5%/absolutefloor0.1kWhและ0.1kW/window15นาทีขยายตามcadence/เตือน3validwindowsและcommissioningก่อนเปิดAlert; Q58รับregisteredoldversionด้วยdecoderเดิม ไม่ทับliveด้วยmeasurementเก่า และกักข้อความที่ambiguouslyunversionedไว้ตรวจ

- Q56 Topicใหม่: เสนอsolar/v1เป็นdefault โดยเลือกหรือimportlegacyenergyได้อย่างชัดเจนตามTopicที่hardwareส่งจริง ไม่rewriteรายการเดิมเอง ไม่มีRegisterpresetบังคับprefixอีกต่อไป Topicที่สร้างจากregisteredcodesแสดงPublishรายอุปกรณ์และSubscribefilterแยกกัน การกำหนดเองต้องผ่านidentity/parser validationไม่เปิดรับทุกTopic
- Q57 comparisondefaults: เสนอความต่าง5%พร้อมabsolutefloor0.1kWhสำหรับพลังงานและ0.1kWสำหรับกำลัง; compareenergywindowเริ่ม15นาทีและไม่น้อยกว่า2เท่าความถี่คาดหวังของแหล่งที่ช้ากว่า; powerเทียบmeasurementtimeใกล้กันโดยไม่เอาค่าล่าสุดคนละเวลามาเทียบ เตือนหลัง3หน้าต่างที่มีข้อมูลพอและผิดต่อเนื่อง ไม่มีข้อมูลไม่เป็นmismatch ก่อนเปิดAlertต้องมีcommissioningpreview/testและปรับรายคู่ได้ ตัวเลขเป็นข้อเสนอรอยืนยัน ไม่ใช่ค่าจริงจากhardware
- Q58 ข้อมูลค้างหลังเปลี่ยนconfig: เสนอรับversionเก่าที่ลงทะเบียนด้วยdecoder/profileเดิม เก็บsource-time/received-time/revision ไม่เอาไปเขียนทับliveviewถ้าmeasurementเก่ากว่า บันทึกconfigdesired/published/acknowledged/appliedแยกกัน ถ้าระบุversionไม่ได้และตีความได้มากกว่าหนึ่งแบบกักรายการไว้ตรวจไม่เดา แหล่งออกบิลที่เปลี่ยนต้องยืนยันและมีeffective-time/provenance ไม่แก้issuedoriginal/approvedpayment การหมดอายุversionและย้อนหลังwindowไม่ใช้ตัวเลขcutoffที่ทำให้ข้อมูลจริงหายโดยปริยาย

## สรุปแผนพร้อมลงมือ

คำตอบที่บันทึกว่า“ยืนยันแล้ว”มีลำดับเหนือข้อเสนอเดิมในเอกสารนี้ โดยเฉพาะสิทธิ์Owner/AdminแยกเขตตามQ48แทนOwner-onlygrant และQ39ไม่เพิ่มinstallationworkflow ตัวเลขตรวจเทียบตามQ57เป็นdefaultsที่overrideได้ ไม่อ้างว่าเป็นค่าคลาดเคลื่อนจริงของhardware

1. RBACและsettingsboundaries: employee presets/overrides/actions/scopesแยกธุรกิจและเทคนิค, customer scopeเดิม, delegated invitation/revokeตามเขต, globaldeactivationโดยOwner, live revocationและaudit; เอาAdminbypassและgenericsettingswriteข้ามเขตออก
2. เมนู/ทะเบียน/ตั้งค่า: Ownerไซต์+ลูกค้าและเอกสาร; Adminจัดการเกตเวย์; keyedtablecolumnsร่วมdesktop/mobile/export; settingsกลุ่มธุรกิจ/เทคนิค/ทีมงาน/ประวัติ/บัญชีของฉัน, label/valueแถวเดียว, contextsettingsไม่ซ้ำglobaltemplates; mobileactiveใช้icon/labelสีเหลืองไม่มีกล่อง
3. GatewayconfigurationและTopic: solarnewdefault/legacyexplicit, autocompleteจากregisteredcodes, Fields/Registereditorร่วม, cadenceแยกอุปกรณ์, safe siteoptions, configurationversion/update/ACK/appliedและประวัติการติดตั้ง
4. Continuousingestionและcomparison: independentstreams, oldversiondecoder, eventtime/liveordering, explicitmeasurementpairs, energyincrements/powertimematching, defaults/override/coverage, durablejobs/recompute/alertdedup, noLoggerbillingfallback
5. Dashboardตามบทบาท: selected-sitecontextแทนKPIrow, Ownercash/outstanding/overdue/review/aging/productioncoverage; Admindevices/config/ingestionquality/comparison/maintenancequeue; fullwidthresponsivegrid/drill-down และsafeDTO
6. Localeและintegrationreview: TH/ENทุกflowรวมemail/PDFใหม่/a11y; invariantsและimmutableoriginals; testdifferentcadence/reset/gap/replay/configupdate/rolescope/partialcash/overdue/revision/export/mobile/light-darkบนDockerlocal

ทุกขั้นเริ่มด้วยbehavioralregressionที่เกี่ยวข้องและตรวจผลจริง การลงมือใช้workspace baselineที่ตรวจแล้ว ไม่deploy/seedproductionหรือcommitโดยปริยาย สามารถแก้ข้อผิดพลาดของระบบเดิมภายในขอบเขตนี้โดยไม่ต้องรักษาflowเดิมที่ขัดกับข้อสรุปผู้ใช้

## บันทึกการลงมือและการตรวจสอบ

- แยก Owner ฝั่งธุรกิจและ Admin ฝั่งเทคนิค พร้อมตำแหน่งสิทธิ์ตั้งต้น สิทธิ์รายบุคคล และขอบเขตไซต์แยกสองฝั่ง ตรวจสิทธิ์สดใน API เมนู เอกสาร และการแจ้งเตือน
- ทะเบียนไซต์งานเป็นข้อมูลธุรกิจ รวมตัวตนลูกค้าสำหรับออกเอกสาร ไม่มีเมนูข้อมูลลูกค้าแยก ส่วนจัดการเกตเวย์เป็นรายการที่บันทึกจริง มีรายละเอียดอุปกรณ์ ความสด กำลังผลิต และสถานะการตั้งค่า
- Topic ใหม่ใช้ solar/v1 แยกตัวกรองรับจาก Topic ส่งรายอุปกรณ์ เกตเวย์เดิมเลือก legacy-energy อย่างชัดเจน ไม่มีการเปลี่ยนรายการเก่าเอง
- เพิ่ม cadence แยกอุปกรณ์/กลุ่ม คู่ตรวจเทียบพลังงาน/กำลัง ค่ากลางและ override รายคู่ ตัวอย่างก่อนเปิดเตือน ประวัติอุปกรณ์ และ desired/published/acknowledged/applied revisions
- เพิ่มแหล่งพลังงานผลิตและกำลังผลิตที่เลือกได้รายเกตเวย์ แยกมิเตอร์ออกบิล ข้อมูลที่ขาดหรือมี Logger หลายตัวโดยไม่เลือกแหล่งจะไม่ถูกรวม/แทนค่าเอง
- Dashboard แยกยอดรับตามวันที่โอนกับยอดใบวางบิลตามรอบ หักเงินจริงที่อนุมัติบางส่วน อายุหนี้และคิวตรวจหลักฐาน ฝั่ง Admin แสดงข้อมูลดูแลระบบ เลือกไซต์แล้วแสดงบริบทแทนสถิติเดิม
- เมนูมือถือ active ใช้สีเหลืองที่ไอคอน/ข้อความ ปรับ Locale ของหน้าการตั้งค่าและข้อความผิดพลาด และแก้การเปิดเกตเวย์เดิมที่มี unmapped JSON แบบ object
- Review พบทางรายงาน/jobs/history เดิมไม่ตรวจ domain/site grant: ปิด HTTP/download/worker ที่ผู้ใช้สั่งจนกว่าจะย้ายเข้าสิทธิ์ใหม่ ส่วน archive ภายในระบบที่ตรวจขอบเขตยังทำงานได้ ไม่มีการลบเอกสารเดิม
- Review พบหน้าต่างพลังงานที่รอ timestamp ตรงขอบเสมอ: ใช้ endpoint ที่วัดจริงภายใน cadence พร้อมตรวจความครอบคลุมและความตรงกัน ไม่ interpolate ค่าหรือแทนแหล่งออกบิล
- Migration 047–052 ใช้เฉพาะฐาน Docker local ที่กำหนดไว้ ไม่มี production seed/commit/push/deploy
- Ruling: migration 048 ที่ยังไม่ปล่อยใช้งานถูกแก้ระหว่างสร้างใน QA เดียวกัน จึงตรึงไฟล์และต่อด้วย 050 โดยบันทึก hash เดิม/catalog/เหตุผลใน .superpowers/gateway-048-local-metadata-reconciliation.json และปรับ metadata เฉพาะฐาน solar_financial_flow_review บน 127.0.0.1:15449 ไม่มีการแก้ข้อมูลการเงินหรือฐาน production
- Verification: API 424 tests — 413 ผ่าน, 11 integration opt-in ข้าม; เว็บ 282 tests ผ่านทั้งหมด; API/web/worker TypeScript และ Next production build ผ่าน
- เพิ่มการรัน GATEWAY_LOCAL_INTEGRATION=true จริงแบบ rollback: การเลือกแหล่งผลิตสะท้อนใน Dashboard และตารางเกตเวย์ตรงกัน ไม่รวมสอง Logger, ตรวจเทียบ/แจ้งเตือน, config ACK, ข้อมูลเก่าไม่ทับ live, cadence และประวัติเปลี่ยนเกตเวย์ผ่าน
- Browser QA: 5 บทบาท 17 เส้นทาง ไม่มี runtime errors; ตรวจเลือกไซต์/มือถือ/ทีมงาน และเปิดเกตเวย์เดิมของ Admin กับพนักงานดูอย่างเดียวเพิ่มเติม
