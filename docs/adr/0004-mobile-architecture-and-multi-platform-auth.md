# 4. Mobile Role-Based Architecture, Power Flow Model, and Multi-Platform JWT Authentication

## Status
Accepted

## Context
1. แพลตฟอร์ม Solar Rooftop จำเป็นต้องรองรับผู้ใช้งานหลากหลายกลุ่มเป้าหมาย (Personas) บนอุปกรณ์พกพา (Mobile `< 768px`) ได้แก่:
   - **School User (ผู้บริหารและเจ้าหน้าที่โรงเรียน)**: ต้องการตรวจสอบภาพรวมการผลิตไฟฟ้า, ผังการไหลของพลังงาน (Power Flow), ตรวจสอบบิลเรียกเก็บเงิน, และดำเนินการชำระเงินพร้อมแนบสลิปหลักฐาน
   - **Admin / Field Mechanic (ช่างเทคนิคหน้างาน)**: ต้องการความคล่องตัวในการลงพื้นที่ตรวจสอบไซต์งาน, ทดสอบสัญญาณเกตเวย์, ตรวจดูค่าโทรมาตรสด และเข้าถึงการคอนฟิกมิเตอร์
   - **Owner (เจ้าของโครงการ/ผู้บริหาร)**: ต้องการภาพรวมพอร์ตโฟลิโอ, รายการโรงเรียน, และเอกสารสัญญา
2. การแสดงผลข้อมูลเดิมบนหน้าจอขนาดเล็กผ่านตารางข้อมูล (DataTable) ก่อให้เกิดปัญหาข้อความถูกบีบอัด ไม่สามารถอ่านข้อมูลเชิงลึกได้สะดวก และขาดการจัดวาง Action ที่เป็นธรรมชาติสำหรับอุปกรณ์พกพา
3. ระบบกำลังเตรียมการพัฒนาแอปพลิเคชันมือถือ (Flutter Mobile App) ในเฟสถัดไป ซึ่งจำเป็นต้องใช้ API ชุดเดียวกันและระบบ Authentication เดียวกันอย่างปลอดภัย โดย Flutter ต้องการ Token ใน JSON Body เพื่อจัดเก็บใน Secure Storage และส่ง Bearer Token แทนการพึ่งพา HttpOnly Cookies เพียงอย่างเดียว

## Decision
1. **การแสดงผลเมนูด้านล่างแบบ Role-Based (Mobile Bottom Navigation)**:
   - นำเสนอ Bottom Navigation Bar เฉพาะบนหน้าจอมือถือ (`< 768px`) โดยปรับเปลี่ยนชุดเมนูตามบทบาทของผู้ใช้:
     - `school_user`: หน้าแรก (`/`), ระบบ (`/system`), ใบแจ้งหนี้ (`/billing`), ตั้งค่า (`/settings`)
     - `admin`: ไซต์งาน (`/sites`), แจ้งเตือน (`/alerts`), ภาพรวม (`/`), ตั้งค่า (`/settings`)
     - `owner`: หน้าแรก (`/`), โรงเรียน (`/schools`), เอกสาร (`/billing`), ตั้งค่า (`/settings`)
2. **การแปลงตารางเป็นการ์ดข้อมูลละเอียด (Responsive Card-Based Transformation)**:
   - แปลงตารางทุก Resource (Sites, Billing, Contracts, Receipts, Alerts, Schools) ให้แสดงผลเป็นการ์ดที่สวยงามบน Mobile พร้อม Action Options ในตัว (เช่น ชำระเงิน, ตรวจสลิป, ดูสัญญา, ดูใบเสร็จ)
3. **ผังจำลองการไหลของพลังงานอินเทอร์แอคทีฟ (Power Flow Diagram)**:
   - สร้าง Component `PowerFlowCard` ที่จำลองการไหลของพลังงานระหว่าง โซลาร์ ➡️ โรงเรียน, โซลาร์ ➡️ โครงข่ายไฟฟ้า (Grid Export), และโครงข่ายไฟฟ้า ➡️ โรงเรียน (Grid Import) พร้อมแอนิเมชันลูกศรการไหล และสถิติประจำวัน (ผลิต, ประหยัด, ลด CO2, สุขภาพอุปกรณ์)
4. **วงจรการชำระเงินแนบสลิปและการตรวจสอบ (Slip Verification Lifecycle - Option A)**:
   - สร้าง Endpoint `POST /v1/billing-cycles/:id/pay`: รับข้อมูลการชำระเงินพร้อมสลิป (รูปภาพ/PDF) และปรับสถานะรอบบิลเป็น `pending_verification`
   - สร้าง Endpoint `PATCH /v1/billing-cycles/:id/verify-payment`: สำหรับ Admin ในการกดอนุมัติ (ปรับเป็น `paid` พร้อมสร้างเอกสารใบเสร็จรับเงินอัตโนมัติ) หรือปฏิเสธ (พร้อมระบุเหตุผล)
5. **สถาปัตยกรรม Multi-Platform Authentication (Flutter Readiness)**:
   - ปรับปรุง `POST /v1/auth/login` และ `POST /v1/auth/refresh` ให้คืนค่า `accessToken` และ `refreshToken` ใน JSON Response Body ควบคู่กับการตั้ง HttpOnly Cookies
   - ฝั่งเว็บยังคงทำงานร่วมกับ Cookies ตามเดิม ส่วน Flutter หรือ Mobile Client สามารถนำ Tokens ไปจัดเก็บใน `flutter_secure_storage` และส่งผ่าน `Authorization: Bearer <token>` ได้อย่างปลอดภัย

## Consequences
- ประสบการณ์การใช้งานบนมือถือมีความทันสมัย ลื่นไหล และตรงกับภารกิจของผู้ใช้แต่ละบทบาทอย่างชัดเจน
- โรงเรียนสามารถติดตามพลังงาน ตรวจสอบบิล ชำระเงินผ่าน PromptPay QR และแนบสลิปได้อย่างสะดวกรวดเร็ว
- แอดมินสามารถตรวจสอบความถูกต้องของสลิปและอนุมัติบิลได้จากอุปกรณ์พกพา
- รองรับการเริ่มพัฒนา Flutter Mobile App ได้ทันทีโดยไม่ต้องสร้าง Backend หรือระบบ Auth แยกต่างหาก
