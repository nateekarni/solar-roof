# 6. Settings Navigation Decoupling and Mobile Notification Sheet Architecture

## Status
Accepted

## Context
ในการออกแบบสถาปัตยกรรมของระบบ Solar Platform ก่อนหน้านี้:
1. หน้าการตั้งค่าเริ่มต้นระบบ ([`/settings/system`](file:///e:/solar-roof/apps/web/app/%28app%29/settings/system/page.tsx)) มีการใส่แถบ Tab เลือกเมนู (Quick Config Tabs) ซ้ำซ้อนกับเมนูย่อยของแถบข้าง (Sidebar) บน Desktop ทำให้หน้าจอรกและสร้างความสับสนแก่ผู้ใช้
2. ปุ่มย้อนกลับ `⬅️ การตั้งค่า` ด้านบนของหน้า Subpages ปรากฏบน Desktop ทั้งที่ Desktop มี Sidebar สำหรับนำทางอยู่แล้ว ซึ่งปุ่มย้อนกลับควรแสดงผลเฉพาะบนหน้าจอมือถือเท่านั้น
3. บนหน้าจอมือถือ การกดปุ่มกระดิ่งแจ้งเตือนเคยนำทางข้ามไปยังหน้า `/alerts` เต็มหน้าจอ ทำให้ผู้ใช้หลุดออกจากบริบทการทำงานปัจจุบัน แทนที่จะเปิดดูแจ้งเตือนได้อย่างสะดวกรวดเร็วผ่าน Popover

## Decision
1. **กำจัด Tab Bar ภายในหน้าการตั้งค่า**: นำแถบเลือกเมนู (Quick Config Navigation Tabs) ออกจากหน้า [`system-settings-content.tsx`](file:///e:/solar-roof/apps/web/features/settings/system-settings-content.tsx) และหน้าอื่น ๆ ทั้งหมด โดยให้การนำทางบน Desktop ใช้ Sidebar เพียงจุดเดียว
2. **แยกการแสดงผลปุ่มย้อนกลับเป็น Mobile-Only (`block md:hidden`)**: ปุ่มย้อนกลับ `⬅️ การตั้งค่า` ในทุกหน้า Subpages ([`/settings/system`](file:///e:/solar-roof/apps/web/app/%28app%29/settings/system/page.tsx), [`/settings/general`](file:///e:/solar-roof/apps/web/app/%28app%29/settings/general/page.tsx), [`/settings/account`](file:///e:/solar-roof/apps/web/app/%28app%29/settings/account/page.tsx), [`/settings/security`](file:///e:/solar-roof/apps/web/app/%28app%29/settings/security/page.tsx), และ [`/settings/meter-presets`](file:///e:/solar-roof/apps/web/app/%28app%29/settings/meter-presets/page.tsx)) จะแสดงเฉพาะบนหน้าจอ Mobile เพื่อให้กดย้อนกลับไปยัง Settings Menu Hub (`/settings`) และซ่อนบน Desktop ทั้งหมด
3. **ผสาน Notification Popover ข้ามอุปกรณ์ (Responsive Popover Sheet)**:
   - นำ `<Link href="/alerts">` ออกจาก Top Bar บน Mobile
   - ใช้ `ResponsivePopover` ครอบคลุมทั้ง Mobile และ Desktop
   - บน Desktop: แสดงเป็น Popover Dropdown กว้าง 320px ชิดมุมขวา
   - บน Mobile: เปิดเป็น Bottom Sheet Drawer ขนาดเต็มความสูงหน้าจอ (`h-[90vh] max-h-[90vh] rounded-t-2xl`) พร้อมรายการแจ้งเตือนที่เลื่อนดูได้ (`flex-1 overflow-y-auto`) และปุ่ม "อ่านทั้งหมด" สามารถตรวจสอบแจ้งเตือนได้ทันทีโดยไม่ต้องเปลี่ยนหน้า

## Consequences
- หน้าจอ Desktop สะอาด เรียบหรู ไร้ Tab ซ้ำซ้อนและไร้ปุ่มย้อนกลับที่ไม่จำเป็น
- หน้าจอมือถือสามารถนำทางไป-กลับระหว่าง Settings Menu Hub และ Subpages ได้อย่างลื่นไหล
- ผู้ใช้บนมือถือสามารถตรวจสอบและจัดการการแจ้งเตือนได้ทันใจผ่าน Mobile Sheet Popover โดยไม่สูญเสียบริบทของหน้างานปัจจุบัน
