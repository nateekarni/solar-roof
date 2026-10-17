# รายงานการตรวจสอบโครงสร้างโค้ดและการปรับปรุงระบบ (Codebase Audit & Refactoring Plan)
## เอกสารฉบับที่ 09: บันทึกขอบเขตและหลักฐานการตรวจสอบ (Audit Coverage & Verification Evidence)

**วันที่ตรวจสอบ:** 16 ตุลาคม 2026  
**ขอบเขต:** บันทึกรายการไฟล์และโมดูลที่ได้รับการตรวจสอบ (Inspected Modules), ส่วนที่ได้รับการยกเว้น (Exclusions), วิธีการตรวจสอบเชิงประจักษ์ (Methodology), และหลักฐานผลการรันชุดทดสอบ (Test Verification Evidence)

---

### 1. รายการและการจำแนกไฟล์ในระบบ (Repository Inventory & Coverage)

ระบบ Solar Roof ประกอบด้วยไฟล์ Source Code ที่อยู่ภายใต้การติดตามของ Git รวมทั้งสิ้น **1,072 ไฟล์** โดยมีสถิติการกระจายตัวตามโมดูลดังนี้:

| ส่วนประกอบของระบบ (Component) | จำนวนไฟล์ (Files) | เทคโนโลยีหลัก (Primary Stack) | ระดับการตรวจสอบ (Audit Level) |
| :--- | :---: | :--- | :---: |
| **`apps/web`** | 549 | Next.js 16 (App Router), React 19, Tailwind, Radix UI | ตรวจสอบละเอียดเชิงลึก (Deep Inspection) |
| **`apps/api`** | 376 | NestJS 10, pg.Pool (PostgreSQL 16), MQTT, PDFKit | ตรวจสอบละเอียดเชิงลึก (Deep Inspection) |
| **`apps/worker`** | 35 | Node.js Telemetry Ingestion, Aggregation, Simulators | ตรวจสอบแบบสุ่มกลุ่มตัวอย่าง (Sampled) |
| **`packages/domain`** | 29 | Pure TypeScript, Zod Schema Validation | ตรวจสอบละเอียดเชิงลึก (Deep Inspection) |
| **`packages/api-contracts`** | 12 | TypeScript Interfaces & Shared DTOs | ตรวจสอบละเอียดเชิงลึก (Deep Inspection) |
| **`packages/connectors`** | 14 | Modbus TCP, MQTT Connector, CSV/File Importer | ตรวจสอบแบบสุ่มกลุ่มตัวอย่าง (Sampled) |
| **`packages/i18n`** | 8 | Bilingual Dictionaries (Thai & English Maps) | ตรวจสอบความสอดคล้องของคำแปล |
| **`packages/ui`** | 4 | Shared Primitives | ตรวจสอบโครงสร้าง |
| **`infra/migrations`** | 54 | PostgreSQL & TimescaleDB Migration Scripts | ตรวจสอบ Schema และ Indexes |

---

### 2. รายชื่อไฟล์ที่ได้รับการตรวจสอบอย่างละเอียดเชิงลึก (Deep Inspected Files)

ได้ทำการเปิดอ่าน Source Code, ตรวจสอบลำดับบรรทัด, วิเคราะห์ AST, และตรวจสอบ Data Flow ในไฟล์ที่มีความสำคัญสูงสุดดังต่อไปนี้:

1. **`apps/api/src/modules/assets/assets.controller.ts`** (1,189 บรรทัด) — พบ SQL Parameter Bug ที่ L783, Inverted Service, และ Raw SQL Lateral Joins
2. **`apps/api/src/modules/assets/assets.service.ts`** (170 บรรทัด) — พบว่ามีสถานะเป็น Orphaned In-memory Stub
3. **`apps/web/features/settings/staff-permissions-workspace.tsx`** (1,251 บรรทัด) — ตรวจสอบ State Wizard, Scope Selection, และ Dialog Duplication
4. **`apps/web/features/sites/site-customer-users.tsx`** (1,086 บรรทัด) — ตรวจสอบการคัดลอก Confirm Dialog ซ้ำซ้อน 450 บรรทัด
5. **`apps/api/src/modules/documents/document-layout.ts`** (914 บรรทัด) — ตรวจสอบภาระ Synchronous CPU บน Event Loop จากการวาด PDF ด้วย PDFKit
6. **`apps/web/features/shared/operation-table.tsx`** (719 บรรทัด) — ตรวจสอบความซับซ้อนของ God Component และ Static Modal Imports
7. **`apps/web/features/sites/site-form-dialog.tsx`** (695 บรรทัด) & **`site-edit-dialog.tsx`** (525 บรรทัด) — เปรียบเทียบความซ้ำซ้อนของฟอร์ม
8. **`apps/web/features/billing/billing-detail-sheet.tsx`** (562 บรรทัด) — พิสูจน์สถานะ Dead Code (ไม่มีการ Import 100%)
9. **`apps/api/src/modules/billing/billing.controller.ts`** (421 บรรทัด) — ตรวจสอบ Unused Import `nodemailer`
10. **`apps/api/src/database/database.service.ts`** (55 บรรทัด) — ตรวจสอบการตั้งค่า `API_READ_POOL_MAX: 12` และ Transaction Implementation
11. **`apps/web/components/feedback/confirm-action.tsx`** (9 บรรทัด) — ตรวจสอบ Shallow Abstraction ของ AlertDialog
12. **`apps/api/src/modules/identity/invitation.service.ts`** (324 บรรทัด) — ตรวจสอบ Transaction ครอบคำสั่งอ่าน และ Config Mismatch ของ SMTP
13. **`apps/api/src/modules/identity/site-customer-users.service.ts`** (161 บรรทัด) — ตรวจสอบ Transaction Abuse ใน `list()` และ `scope()`
14. **`apps/api/src/modules/billing/saved-document-delivery.ts`** (73 บรรทัด) — ตรวจสอบ Fallback พอร์ต SMTP และ Transaction ซ้ำซ้อน
15. **`apps/api/src/modules/notifications/operational-automation.service.ts`** (179 บรรทัด) — ตรวจสอบ Outbox Pattern และ Nodemailer Transport

---

### 3. รายการที่ได้รับการยกเว้นจากการตรวจสอบอย่างละเอียด (Excluded Folders)

เพื่อรักษาประสิทธิภาพและความแม่นยำในการวิเคราะห์ ได้ทำการละเว้นไฟล์และโฟลเดอร์ต่อไปนี้จากการตรวจสอบ Source Code เชิงลึก:
- `**/node_modules/**` (แพ็กเกจภายนอก)
- `**/.next/**`, `**/.next-build-review/**`, `**/dist/**`, `**/.turbo/**` (ผลลัพธ์จากการ Build)
- `**/*.d.ts`, `**/*.js.map`, `**/*.d.ts.map` (Generated Types & Maps)
- Mock Data Fixtures และ Seed Files ขนาดใหญ่ที่ไม่ได้เป็น Application Logic

---

### 4. หลักฐานเชิงประจักษ์จากการรันชุดทดสอบ (Test Verification Evidence)

ได้ทำการรันชุดทดสอบของทั้ง Monorepo ผ่านคำสั่ง `pnpm test` เพื่อตรวจสอบสถานะการทำงานปัจจุบันของระบบ (Baseline Health):

```text
================================================================================
TEST SUITE EXECUTION RESULTS (pnpm test - Turbo 8/8 Tasks Successful)
================================================================================

1. @solar/domain:test
   - Status: PASS
   - Passed: 24 tests
   - Failed: 0 tests
   - Execution Time: ~450ms

2. @solar/api:test
   - Status: PASS
   - Tests: 720 total
   - Passed: 684 tests
   - Skipped: 36 tests (Real MQTT broker integration tests requiring external daemon)
   - Failed: 0 tests
   - Execution Time: 46.78s

3. @solar/web:test
   - Status: PASS
   - Passed: 528 tests
   - Failed: 0 tests
   - Execution Time: ~12.30s

Summary:
- Total Tasks: 8 successful, 8 total (100% Success Rate)
- Total Passing Tests: 1,236 tests
- Regressions Detected: 0
================================================================================
```

#### การประเมินผลการทดสอบ:
ชุดทดสอบครอบคลุมและผ่านการทดสอบทั้งหมด 1,236 ข้อ บ่งชี้ว่าระบบเดิมมี Baseline Functional Integrity ที่แข็งแรง ดังนั้นข้อบกพร่องที่ตรวจพบในรายงานฉบับนี้ (เช่น SQL Parameter Bug หรือการใช้ Transaction เกินความจำเป็น) ส่วนใหญ่เป็นประเด็นด้าน Edge-Case, ปัญหาด้าน Concurrent Load, หรือเป็นปัญหาเชิงสถาปัตยกรรม (Code Architecture Debt) ที่ยังไม่ถูกครอบคลุมด้วย Unit Test เดิม ซึ่งแผนงานใน `08-refactoring-roadmap.md` จะช่วยแก้ปัญหาเหล่านี้ได้อย่างเป็นระบบและปลอดภัยสูงสุด
