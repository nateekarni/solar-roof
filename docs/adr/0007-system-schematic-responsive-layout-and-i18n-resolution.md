# 7. System Schematic Responsive Layout and Monorepo i18n Resolution Architecture

## Status
Accepted

## Context
ในการแสดงผลหน้าระบบ (`/system`) ก่อนหน้านี้:
1. เลย์เอาต์ถูกจำกัดด้วยคลาส `max-w-xl` (576px) กึ่งกลางหน้าจอ ทำให้เมื่อเปิดดูบนหน้าจอ Desktop มีพื้นที่ว่างสีขาวขนาดใหญ่ด้านซ้ายและขวา ไม่ใช้ประโยชน์จากความกว้างของหน้าจอเดสก์ท็อปอย่างเต็มที่
2. มีปัญหาคีย์ภาษาหลุดแสดงผลเป็นข้อความดิบ (เช่น `system.title`, `system.solarPower`, `system.todaySummary`) เนื่องจากแพ็กเกจ `@solar/i18n` ใน Monorepo ตั้งค่า export ชี้ไปยัง `./dist/index.js` ซึ่งไม่ได้ถูก recompile อัตโนมัติในระหว่างการพัฒนาเว็บแอป (`apps/web`) และข้อความในแท็บผังระบบเชิงเทคนิค (Schematic) ยังไม่ได้ถูกลงทะเบียนในพจนานุกรมภาษา
3. Breadcrumb บนแถบ Header ด้านบนสุดเมื่อเข้าหน้า `/system` แสดงผลตกไปหา Default Application Title แทนที่จะแสดงคำว่า "ผังระบบ" ให้ตรงกับแถบนำทางหลัก (Sidebar)

## Decision
1. **จัดวางเลย์เอาต์ Responsive 2 คอลัมน์บน Desktop (`/system`)**:
   - ยกเลิกข้อจำกัด `max-w-xl` ใน [`system/page.tsx`](file:///e:/solar-roof/apps/web/app/%28app%29/system/page.tsx) และ [`power-flow-card.tsx`](file:///e:/solar-roof/apps/web/features/dashboard/power-flow-card.tsx) ขยายเป็น `w-full max-w-7xl mx-auto`
   - บน Desktop (`lg:grid lg:grid-cols-12 lg:gap-6`):
     - **คอลัมน์ซ้าย (`lg:col-span-7 xl:col-span-7`)**: การ์ดไดอะแกรมหลัก (Power Flow Vector SVG Diagram / Technical Single-Line Diagram) ขยายขนาดและสัดส่วนให้ชัดเจน สวยงาม พร้อมปุ่มเลือกแท็บ และเวลาอัปเดตข้อมูล
     - **คอลัมน์ขวา (`lg:col-span-5 xl:col-span-5`)**: "ข้อมูลสรุปวันนี้" (Today's Summary) 4 การ์ดพลังงาน ควบคู่กับการ์ดสรุปมูลค่าทางเศรษฐกิจและสิ่งแวดล้อม (รายได้สะสม THB, ลดการปล่อย CO₂ kg) และสถานะความสมบูรณ์ของระบบ/เกตเวย์
   - บน Mobile/Tablet (`< lg`): แสดงผลเป็น Single Column แนวตั้งตามเดิมอย่างสมบูรณ์แบบ
2. **การตั้งค่า Monorepo i18n Direct-Source Resolution & Complete Dictionary**:
   - ปรับแต่ง `packages/i18n/package.json` ให้ส่งออก `import: ./src/index.ts` และ `module: ./src/index.ts` เพื่อให้ Next.js (ซึ่งเปิด `transpilePackages: ["@solar/i18n"]`) โหลด Source Code ภาษา TypeScript สดโดยตรง ทำให้การเปลี่ยนแปลงข้อความแสดงผลทันที (Instant HMR) ปราศจากความล่าช้าของการ Build
   - พร้อมคอมไพล์ `dist/` ให้สอดคล้องกัน 100%
   - เพิ่มพจนานุกรมคำแปลใน `packages/i18n/src/th.ts` และ `packages/i18n/src/en.ts` ให้ครอบคลุมทุกคีย์ในระบบ ทั้งแท็บ Power Flow, แท็บ Schematic, Header, และ Format เวลาแบบ Locale-aware
3. **การประสาน Breadcrumb นำทาง**:
   - เพิ่มการจับคู่ `case "/system": return t("navigation.system");` ใน [`app-header.tsx`](file:///e:/solar-roof/apps/web/components/navigation/app-header.tsx) เพื่อให้ Breadcrumb ด้านบนแสดงผลเป็น `Solar Platform > ผังระบบ` สอดคล้องกับแถบเมนูด้านข้าง

## Consequences
- หน้าระบบบน Desktop แสดงผลเต็มพื้นที่อย่างหรูหรา ผู้ใช้สามารถดูทั้งผังไดอะแกรมและข้อมูลสรุปตัวเลขได้พร้อมกันในหน้าเดียวโดยไม่ต้องเลื่อนหน้าจอ
- การแสดงผลภาษารองรับทั้งไทยและอังกฤษสมบูรณ์ 100% ไร้ปัญหาคีย์ภาษาหลุด หรือ build-lag ในระหว่างการพัฒนา
- ประสบการณ์การใช้งานบน Mobile ยังคงกระชับ รวดเร็ว สอดคล้องกับมาตรฐานความสูง 40px ของระบบ
