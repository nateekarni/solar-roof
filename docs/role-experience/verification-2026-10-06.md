# ผลการปรับสิทธิ์และหน้าจอ Responsive — 6 ตุลาคม 2569

## สิ่งที่ปรับ

- Admin เป็น Super Admin: เมนูและงานที่อนุญาตตามบทบาทครบทุกส่วน และข้อมูลไม่ถูกจำกัดด้วยโรงเรียนที่ผูกไว้ในบัญชีเดิม
- Owner ใช้หน้าแรกเชิงธุรกิจ สัญญา ใบแจ้งหนี้ ใบเสร็จ ข้อมูลบริษัท/ธนาคาร และการตั้งค่าบัญชีส่วนตัว; ปิดเส้นทางอุปกรณ์ ระบบ ผู้ใช้ และงานเทคนิคทั้งหน้าเว็บและ API
- School User ใช้หน้าแรก การผลิต และเอกสารของโรงเรียนที่ได้รับมอบหมาย พร้อมส่งหลักฐานการชำระเงิน; ขอบเขตโรงเรียนตรวจฝั่งเซิร์ฟเวอร์
- เมนูเดสก์ท็อป เมนูมือถือ และเมนูล่างใช้รายการตามบทบาทชุดเดียวกัน และหน้าที่เปิดด้วย URL โดยตรงตรวจตัวตนจาก session เซิร์ฟเวอร์
- หน้าจอ Owner/School ไม่แสดง Gateway ข้อมูลรีจิสเตอร์ หรือเครื่องมือปฏิบัติการ; ค่าพลังงาน/ยอดเงินที่ไม่มีข้อมูลไม่แสดงเป็นศูนย์
- รายการเอกสารบนมือถือแสดงเป็นการ์ดพร้อมยอดเงิน/สถานะ/การกระทำ; หน้าจอใหญ่ใช้ตาราง ปุ่มหลักและเมนูมือถือรองรับพื้นที่สัมผัส 44 พิกเซล
- ผู้ใช้ที่มี cookie session แต่ไม่มีข้อมูล browser storage ยังเห็นการกระทำเอกสารตามสิทธิ์; ตัวตนเก่าของอีกบัญชีไม่สามารถเลือกสิทธิ์ของบัญชีปัจจุบันได้
- การเลือกช่วงเวลาใน `/production` คงอยู่หน้าการผลิต และแสดงชื่อโรงเรียน/ช่วงเวลาจริง

## หลักฐานการตรวจ

| การตรวจ | ผล |
| --- | --- |
| Domain tests | 22 ผ่าน |
| Web permission/navigation/session/period/contract-option tests | 14 ผ่าน |
| Business dashboard/document/mobile-card rendering tests | 10 ผ่าน |
| API suite | 119 ผ่าน, 2 ข้าม, 0 ล้มเหลว |
| Domain build และ typecheck | ผ่าน |
| Owner/School หน้าแรกที่ 360, 390, 768, 1280 px | ผ่าน, ไม่พบ page-level horizontal overflow |
| เมนูมือถือ → ใบแจ้งหนี้ → ค้นหา | ผ่าน, URL เปลี่ยนตามคำค้น |
| เปิดหน้าต่างแนบหลักฐานชำระเงินที่ 390×844 px | ผ่าน, หน้าต่างอยู่ภายใน viewport |
| เปิด `/settings/users` โดยตรงด้วย Owner/School | แสดงหน้าไม่พบข้อมูล; ไม่มีหน้าจัดการผู้ใช้ |
| School production เลือกเดือนที่แล้ว | ยังคงอยู่ `/production` พร้อมพารามิเตอร์วันที่ |
| Light/dark screenshot inspection | ผ่าน |
| JavaScript page errors และ application console errors | ไม่พบ |

รวมชุดทดสอบอัตโนมัติที่ผ่าน 165 รายการ ไม่รวมการตรวจด้วยเบราว์เซอร์

คำสั่งหลัก:

```powershell
node node_modules/tsx/dist/cli.mjs --test packages/domain/test/*.test.ts apps/web/lib/page-access.spec.ts apps/web/components/navigation/nav-config.spec.ts apps/web/lib/financial-session.spec.ts apps/web/features/dashboard/period-destination.spec.ts apps/web/features/shared/business-operation-options.spec.ts
node node_modules/tsx/dist/cli.mjs --tsconfig apps/web/tsconfig.ui-tests.json --test apps/web/features/shared/responsive-document-rows.spec.tsx apps/web/features/dashboard/business-dashboard.spec.tsx apps/web/features/shared/financial-document-intro.spec.tsx
node node_modules/tsx/dist/cli.mjs --tsconfig apps/api/tsconfig.json --test apps/api/src/**/*.spec.ts
node node_modules/typescript/bin/tsc -p packages/domain/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p packages/domain/tsconfig.test.json
```

## ขอบเขตของหลักฐานและข้อจำกัด

Browser plugin ไม่มีใน session นี้ จึงใช้ Playwright กับ Edge แบบ headless ตรวจแอป Next.js ที่ `http://127.0.0.1:13000` และ mock API แยกที่ `13001` ภาพใช้ข้อมูลตัวอย่างเพื่อยืนยัน layout และ interactions ไม่ใช่หลักฐานค่าพลังงานหรือสถานะการเงินจริง การตรวจสิทธิ์ API ใช้ชุดทดสอบ guard/read model แยกต่างหาก

สอง API tests ที่ข้ามต้องมี PostgreSQL/MQTT สำหรับ integration จริง; environment นี้ไม่มีระบบเหล่านั้นทำงานอยู่

Web typecheck ทั้งโปรเจกต์ยังมี 55 diagnostics จาก declarations/ชนิดข้อมูลเดิม เช่น TanStack table, MapLibre และ implicit-any callbacks ส่วน API มี 97 บรรทัด diagnostics จากชนิด Express/fetch/S3 เดิม จึงยังยืนยัน production build ทั้งโปรเจกต์ไม่ได้ ไม่พบ diagnostics ใน module สิทธิ์/หน้าจอใหม่ที่เพิ่มในงานนี้

กฎ financial readiness และ document lifecycle เดิมยังคงอยู่: สิทธิ์ Admin ไม่ข้ามความพร้อมทางบัญชี การอนุมัติชำระเงิน หรือเงื่อนไขใบเสร็จ Existing read model ยังระบุกรณีเอกสารไม่มี snapshot/file ที่อนุญาตให้ preview/download งานนี้ไม่ได้สร้างไฟล์เอกสารจริงหรือเปิด financial writes ที่ระบบเดิมยังปิดไว้

คงเพดานช่วงเวลาเดิมสูงสุด 3 เดือนต่อคำขอ; การเปิดรายงานทั้งปีไม่ได้รวมในงานสิทธิ์/Responsive นี้ Mobile App ยังไม่ได้สร้าง แต่ใช้ authenticated API และกฎสิทธิ์ฝั่งเซิร์ฟเวอร์ชุดเดียวกันได้

ไม่มี commit/push/reset และรักษาการแก้ไขเดิมใน workspace ไว้

## ภาพตัวอย่าง

- [Owner mobile](owner-mobile.png)
- [Owner desktop](owner-desktop.png)
- [School mobile](school-mobile.png)
- [School billing cards](school-billing.png)
- [School payment dialog](school-payment.png)
- [School dark theme](school-dark.png)
- [Browser check results](render-results.json)
