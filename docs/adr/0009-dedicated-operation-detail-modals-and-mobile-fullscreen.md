# 9. Dedicated Operation Detail Modals and Mobile Full-Screen Layout

## Status
Accepted

## Context
1. **ปัญหาการแสดงผล Modal รายละเอียดไม่ตรงกับข้อมูลจริง**:
   - เมื่อผู้ใช้งานกดปุ่ม "ดูรายละเอียด" (View Details) หรือคลิกแถวรายการในหน้าการดำเนินงาน (`/operations`) ของหมวดหมู่ `audit` (ประวัติการใช้งาน), `alerts` (การแจ้งเตือน), `users` (ผู้ใช้งาน), `schools` (โรงเรียน), `notifications` (ข้อความแจ้งเตือน) และ `reports` (รายงาน) ระบบเดิมมี Fallback ส่งค่าไปเปิด `DocumentPreviewModal` (โมดอลพรีวิวเอกสารสัญญา PPA) เพียงอย่างเดียว ทำให้ข้อมูลที่แสดงไม่ตรงกับสิ่งที่ผู้ใช้เลือก
2. **ข้อจำกัดบนหน้าจอ Mobile (< 768px)**:
   - รายการแบบการ์ด (`OperationCardList`) บนมือถือไม่มีปุ่มสำหรับเปิดดูรายละเอียดของ 6 หมวดหมู่ดังกล่าว
   - กล่อง Dialog แบบเดิมบนมือถือมีขอบ Margin ลอยและมีขนาดกะทัดรัดเกินไปสำหรับข้อมูลที่มีรายละเอียดเชิงลึก เช่น JSON Diff หรือคำอธิบายการแจ้งเตือน
   - ผู้ใช้งานมีความต้องการอย่างชัดเจนให้เปิด Modal แบบเต็มจอเฉพาะบนอุปกรณ์พกพา (Mobile Full-Screen) เพื่อความสะดวกในการอ่านและการโต้ตอบที่เหมือนแอปพลิเคชันมือถือแท้จริง

## Decision
1. **พัฒนา Dedicated Detail Modals ครบทั้ง 6 หมวดหมู่**:
   สร้างคอมโพเนนต์โมดอลแยกเฉพาะในโฟลเดอร์ `apps/web/features/shared/detail-modals/`:
   - [`audit-detail-modal.tsx`](file:///e:/solar-roof/apps/web/features/shared/detail-modals/audit-detail-modal.tsx): แสดงผลข้อมูลเหตุการณ์, ผู้กระทำ, Correlation ID พร้อมปุ่มคัดลอก และ Before/After JSON Diff Viewer ในรูปแบบ Key-Value Badge
   - [`alert-detail-modal.tsx`](file:///e:/solar-roof/apps/web/features/shared/detail-modals/alert-detail-modal.tsx): แสดงระดับความรุนแรง (Critical, Warning, Info), วันเวลาที่เกิด, ข้อความวินิจฉัย และปุ่ม "รับทราบการแจ้งเตือน" (Acknowledge)
   - [`user-detail-modal.tsx`](file:///e:/solar-roof/apps/web/features/shared/detail-modals/user-detail-modal.tsx): แสดงข้อมูลผู้ใช้งาน, บัญชีอีเมล, สังกัดโรงเรียน, วันเวลาเข้าใช้ล่าสุด พร้อมคำอธิบายระดับสิทธิ์ตามบทบาท (Owner, Admin, School Staff)
   - [`school-detail-modal.tsx`](file:///e:/solar-roof/apps/web/features/shared/detail-modals/school-detail-modal.tsx): สรุปกำลังติดตั้งรวม (MWp), จำนวนไซต์งาน, จำนวน Gateway, รหัสสถานศึกษา และสถานะความพร้อมของอุปกรณ์ พร้อมปุ่มลัดไปยังหน้ารายการไซต์
   - [`notification-detail-modal.tsx`](file:///e:/solar-roof/apps/web/features/shared/detail-modals/notification-detail-modal.tsx): แสดงช่องทางการสื่อสาร (In-App, Email), กลุ่มผู้รับ, เวลาที่ส่งออก, สถานะการนำส่ง และกล่องข้อความเต็ม
   - [`report-detail-modal.tsx`](file:///e:/solar-roof/apps/web/features/shared/detail-modals/report-detail-modal.tsx): สรุปหมวดหมู่, ขอบเขตข้อมูล, รูปแบบไฟล์ส่งออก (CSV, PDF, XLSX), ขนาดไฟล์โดยประมาณ และปุ่มดาวน์โหลดรายงาน
   - [`index.ts`](file:///e:/solar-roof/apps/web/features/shared/detail-modals/index.ts): Barrel export ให้เรียกใช้งานได้อย่างเป็นระเบียบ

2. **ปรับแบบแผน CSS Mobile Full-Screen**:
   กำหนด Class ให้แก่ `DialogContent` ในทุกโมดอลรายละเอียด:
   ```tsx
   className="max-sm:fixed max-sm:inset-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:rounded-none max-sm:p-4 max-sm:flex max-sm:flex-col sm:max-w-xl sm:rounded-2xl sm:p-6 sm:max-h-[85vh] overflow-hidden"
   ```
   - บนหน้าจอมือถือ (`< 640px / < 768px`): หน้าต่างจะยึดเต็มหน้าจอ (`h-dvh w-full rounded-none inset-0`) โดย Header และ Footer จะถูกตรึง (Shrink-0) ขณะที่เนื้อหาตรงกลางสามารถ Scroll ได้อย่างอิสระ
   - บนหน้าจอเดสก์ท็อป (`>= 640px / >= 768px`): คงรูปแบบหน้าต่างโมดอลลอยตัวกึ่งกลางหน้าจอที่มีมนโค้งสวยงาม (`sm:rounded-2xl sm:max-w-xl sm:max-h-[85vh]`)

3. **ปรับปรุง Backend Payload ใน `operations.service.ts`**:
   - เพิ่มฟิลด์ `correlationId`, `reason`, `beforeJson`, `afterJson` ในการสืบค้นข้อมูลตาราง `audit_events`
   - เพิ่มฟิลด์ `code` ในการสืบค้นข้อมูล `schools`
   - เพิ่มฟิลด์ `detail`, `severity` ในการสืบค้นข้อมูล `notifications`
   - เพิ่มฟิลด์ `description`, `fileSize`, `generatedAt` ในการจำลองข้อมูล `reports`

4. **เชื่อมต่อการทำงานใน `OperationTable` และ `OperationCardList`**:
   - เชื่อมต่อ Dropdown Actions เมนูของตารางบนเดสก์ท็อปให้เรียกโมดอลเฉพาะตามประเภททรัพยากร (`audit`, `alerts`, `users`, `schools`, `notifications`, `reports`)
   - เชื่อมต่อ `onRowClick` ของ Desktop DataTable ให้เปิดโมดอลรายละเอียดทันที
   - เพิ่ม Prop `onOpenDetail` ใน [`operation-card-list.tsx`](file:///e:/solar-roof/apps/web/features/shared/operation-card-list.tsx) และเพิ่มปุ่ม "ดูรายละเอียด" บนการ์ดของมือถือทุกใบ พร้อมรองรับการแตะที่ตัวการ์ดเพื่อเปิดโมดอลเต็มจอได้โดยตรง

## Consequences
- การกดดูรายละเอียดในทุกจุดทั่วทั้งระบบจะแสดงข้อมูลที่ถูกต้อง ครบถ้วน และตรงตามบริบทของทรัพยากรนั้นๆ 100%
- ไม่มีปัญหาการหลงเปิดดูสัญญา PPA ในข้อมูลที่ไม่เกี่ยวข้องอีกต่อไป
- ประสบการณ์การใช้งานบนมือถือมีความลื่นไหล เป็นธรรมชาติ และใช้งานพื้นที่หน้าจอขนาดเล็กได้อย่างเต็มประสิทธิภาพ
- โค้ดถูกจัดระเบียบเป็นโมดูลย่อย ง่ายต่อการขยายผลและบำรุงรักษาในอนาคต
