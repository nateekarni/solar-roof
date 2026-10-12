# UI consistency และ Dashboard — ผล implementation

วันที่ 2026-10-09; แผน: [ui-component-consistency-plan-2026-10-09.md](ui-component-consistency-plan-2026-10-09.md)

## สิ่งที่เปลี่ยน

- Rates: เอา card ครอบและหัวข้อซ้ำออก ย้าย Apply ไป header, toolbar มี search/selection/filter, DataTable desktop และ mobile cards ใช้ pagination ชุดเดียว, เลือกเฉพาะหน้า/สถานะบางส่วน, คงการเลือกข้ามหน้าและ filter, hidden count/clear/prune, loading/error/retry และ shadcn controls รวม date picker
- Gateway, พนักงาน/ตำแหน่ง, บัญชีธนาคาร และประวัติเกตเวย์ใช้ DataTable กลาง; gateway columns ยัง wrap ได้; semantic settings sections ใช้ embedded table
- ลดกรอบซ้อนใน gateway settings และ SiteContext; เปลี่ยน selects ใน alert rules/manual bill/payment verification, manual line items ใช้ Table และ date/textarea กลาง
- Dashboard แยกบทบาทเจ้าของ/Accountant, Admin เทคนิค และลูกค้า โดยอ่าน capability จริง; เมื่อเลือกไซต์ ทุก data panel อยู่ภายใต้ scope guard
- มี daily energy chart, grouped billed/cash chart, site ranking สลับ kWh/kWh ต่อ kWp, quality/observed subtotal, insight จากข้อมูลจริง, current maintenance/alerts และ aging/work queue
- Compare เป็น opt-in ใช้วันที่จบแล้วเท่ากัน ตรวจ source fingerprint และคุณภาพก่อนให้เปอร์เซ็นต์; drawer รายวันโหลดเฉพาะเมื่อเปิดและส่ง hourly points ที่จำกัดจำนวน
- บิลตามช่วงของไซต์รวมรายการที่ชำระแล้ว preview ไม่เกิน 20 พร้อม total/hasMore; ยอดการเงินรวมจาก server ไม่ใช่ preview; กลับจากบิลมาที่ Dashboard พร้อมไซต์/ช่วงเดิม
- API คง 3 เดือนปฏิทิน, customer หนึ่งไซต์ และ schema assignment เดิม; ปรับ contract สำหรับ observed quality, cash series, source identity และ period invoices

## Automated verification

| ตรวจ | ผล |
| --- | --- |
| `pnpm --filter @solar/web test` | 338 ผ่าน, 0 fail; รวม typecheck |
| `pnpm --filter @solar/api test` หลัง review fixes | 459 ผ่าน, 0 fail, 12 skip จากทั้งหมด 471 |
| `pnpm --filter @solar/api lint` | ผ่าน |
| หลังเปลี่ยน date control ใน rates: web lint และ focused rates tests | lint ผ่าน; 5 ผ่าน |
| navigation กลับ Dashboard | 8 ผ่านรวม record navigation เดิม; red→green ของ helper ใหม่ |

API tests ที่ skip เป็น optional integration suites ซึ่งไม่มี test DB configuration ตามที่ suite ต้องการ; แยกจากการเรียก summary/day และ query read-only บน local financial fixture ที่ตรวจเจ้าของฐานแล้วสำเร็จ ไม่อ้างว่า integration suites ที่ skip ผ่าน

Review แยก 2 กลุ่ม (rates/shared/non-dashboard UI และ Dashboard/data) เทียบ baseline ก่อนแก้ใน `tmp/ui-consistency-baseline` ไม่ปะปนงานเดิมใน git diff พบและแก้ gateway wrapping, cash-only date omission, source comparability และ period invoice coverage แล้ว re-review ไม่มี actionable finding ค้างในขอบเขตที่ตรวจ

## Browser verification

ใช้ headless Edge ที่ `http://localhost:13049` กับ API loopback `13059` และบัญชี synthetic fixture เดิม ไม่มีการ deploy หรือเปลี่ยน financial records

- Rates: page-only select 10 → ข้ามหน้าเลือกครบ 14, filter/search ซ่อน 13/14 โดยยังคงการเลือก, no-match state, clear, mobile cards และ shared calendar ใน apply dialog; ไม่มี page errors
- Error/retry: จำลอง rates HTTP 503 ที่ browser แล้ว unroute/retry โหลดข้อมูลได้
- เปิด staff/company และตรวจภาพ; Gateway list/settings และ alert settings ใช้ controls ใหม่ เปิดได้ไม่มี page errors
- Owner, Accountant, Admin, Customer: daily endpoint 200 ทุก role, ไม่มี day/compare request ก่อนเปิด, เปิด comparison ตามคำขอ, เปลี่ยนไซต์สำหรับ role ที่อนุญาต
- Customer ไม่มี site chooser และ request day ของไซต์อื่นตอบ 403; summary เกิน 3 เดือนตอบ 400 ทั้ง 4 role
- เปิดบิลจากไซต์ของ Owner/Accountant และใช้ปุ่มกลับ Dashboard คืน site/date query เดิมได้
- ตรวจ desktop 1440×1000, mobile 390×844, light/dark และ English Dashboard; document width ไม่ล้น viewport และไม่มี page errors ทั้ง 4 role
- Rates English ตรวจด้วย preference ของบัญชีทดสอบแล้วคืน Thai; screenshots dark ใช้การเปลี่ยน class เฉพาะ browser จึงเป็นการตรวจ appearance ไม่ใช่การทดสอบ persistence ของ theme preference

หลักฐาน: `tmp/ui-consistency-proof/` มี screenshots และ `dashboard-results.json`, `other-results.json`; scripts: `tmp/ui-consistency-browser.mjs`, `tmp/dashboard-browser.mjs`, `tmp/ui-other-browser.mjs`

ภาพที่ตรวจด้วยตา: rates desktop/mobile, owner desktop, admin desktop, customer mobile และผล spacing หลังแก้ Card padding ส่วนอื่นใช้ browser assertions และ screenshots เก็บไว้ ไม่อ้างตรวจภาพครบทุก route/ทุก state

## Performance และข้อจำกัด

- Local fixture 14 ไซต์ ช่วง ก.ค.–ก.ย.: 6,626 raw rows ประมาณ 1.50 MB; query ประมาณ 49 ms, EXPLAIN execution 39.4 ms, summary 42.8 KB (ค่ารันเดียวบน fixture เบาบาง)
- Synthetic CPU benchmark 2 ไซต์ 92 วัน ระยะห่าง 1 นาที 264,962 rows: daily bucketing ประมาณ 8,593 → 240 ms โดยยอดเท่าเดิม
- ยังอ่าน raw samples จาก SQL; benchmark CPU ไม่รวม DB/transport และ fixture ไม่แทน production density จึงยังไม่มี production-capacity/SLO claim ต้องวัดข้อมูลหนาแน่นจริงก่อนเพิ่มจำนวนไซต์หรือช่วงเวลา
- ไม่มี schema migration ใหม่ ไม่มี target/forecast/savings model; กราฟแสดงช่องว่างเมื่อข้อมูลไม่ครบ ไม่เติมค่าขึ้นเอง
- ไม่ได้ build production bundle หรือ deploy; verification ใช้ typechecks, suites และ dev browser

## สถานะส่งมอบ

เก็บ implementation และเอกสารใน working tree บน `codex/ui-account-consistency` ไม่ commit/push/merge งานเดิมร่วมไปด้วย Local API ถูก restart เพื่อโหลด endpoint/contract ใหม่และ browser ยืนยันผลหลัง restart แล้ว
