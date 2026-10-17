# รายงานการตรวจสอบโครงสร้างโค้ดและการปรับปรุงระบบ (Codebase Audit & Refactoring Plan)
## เอกสารฉบับที่ 01: บทสรุปสำหรับผู้บริหาร (Executive Summary)

**วันที่ตรวจสอบ:** 16 ตุลาคม 2026  
**ขอบเขตระบบ:** Solar Roof Management Platform (Monorepo: `apps/web`, `apps/api`, `apps/worker`, `packages/*`, `infra/migrations`)  
**บทบาทผู้ตรวจสอบ:** Senior Software Architect, Staff Software Engineer, Code Quality & Performance Specialist  
**สถานะการตรวจสอบ:** เสร็จสมบูรณ์ (Audit & Plan Only — ไม่มีการแก้ไขโค้ดแอปพลิเคชันในขั้นตอนนี้)

---

### 1. ภาพรวมสถาปัตยกรรมระบบ (Architecture Snapshot)

โครงการ Solar Roof พัฒนาขึ้นบนโครงสร้าง Monorepo ที่ใช้ `pnpm` workspace และ `turbo` ในการจัดการ โดยมีองค์ประกอบหลักดังนี้:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Solar Roof Platform                             │
├────────────────────────┬───────────────────────┬───────────────────────┤
│  Frontend (apps/web)   │   Backend (apps/api)  │  Worker (apps/worker) │
│  - Next.js 16 (App)    │   - NestJS 10         │  - Node.js Telemetry  │
│  - React 19            │   - Raw pg.Pool (12)  │  - MQTT Subscriber    │
│  - Tailwind CSS        │   - EMQX MQTT Broker  │  - Timescale Aggreg.  │
│  - Radix UI Primitives │   - PDFKit Engine     │  - Alert Ingestion    │
├────────────────────────┴───────────────────────┴───────────────────────┤
│                     Shared Packages (packages/*)                       │
│  - packages/domain (Pure TS rules, validation, brand types, policies)  │
│  - packages/api-contracts (DTOs, contract interfaces)                  │
│  - packages/connectors (Modbus TCP, MQTT simulator, file import)       │
│  - packages/i18n (TH/EN translation dictionaries)                      │
│  - packages/ui (Design system primitives)                              │
├────────────────────────────────────────────────────────────────────────┤
│                     Database & Infrastructure                          │
│  - PostgreSQL 16 + TimescaleDB (54 Migrations under infra/migrations)  │
│  - EMQX Broker (MQTT v5.0 / v3.1.1)                                    │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 2. ผลการประเมินสุขภาพโค้ดเบส (Codebase Health Scorecard)

| มิติการประเมิน (Dimension) | คะแนน (1-10) | สถานะ (Status) | คำอธิบายสังเขป |
| :--- | :---: | :---: | :--- |
| **ความถูกต้องและความน่าเชื่อถือ (Reliability)** | **7.2 / 10** | ⚠️ พึงระวัง | ชุดทดสอบครอบคลุมดี (Unit & Integration tests ผ่านหมด) แต่พบ **SQL Parameter Indexing Bug ร้ายแรง** ใน `assets.controller.ts:783` ที่ทำให้คำสั่ง SQL พัง และการใช้ Transaction กับ Read-only queries ที่เสี่ยงต่อการเกิด Connection Pool Exhaustion |
| **ความง่ายในการดูแลรักษา (Maintainability)** | **5.5 / 10** | 🔴 ต้องปรับปรุงเร่งด่วน | พบคลาสและคอมโพเนนต์ขนาดมหึมา (Oversized Files > 1,000 บรรทัด), God Component (`operation-table.tsx`), โค้ดที่ไม่ได้ใช้งาน (Dead Code), และการคัดลอกโค้ด Dialog ซ้ำซ้อนข้ามหลายหน้า |
| **ประสิทธิภาพและการใช้ทรัพยากร (Performance)** | **6.5 / 10** | 🟡 ปานกลาง | การจัดการ Connection Pool มี Metrics ที่ดีเยี่ยม แต่ถูกจำกัดที่ 12 connections, พบการดึงข้อมูลแบบ Manual `useEffect` + `useState` ซ้ำซ้อน 79 จุด, และการประมวลผล PDF หนักบน Main Event Loop |
| **ความปลอดภัยของไทป์และการทดสอบ (Type Safety & Testability)** | **7.8 / 10** | 🟢 ดี | `packages/domain` มีความบริสุทธิ์สูง ไร้ Side-effect, มี Strict TypeScript ที่ดี แต่ส่วนของ Controller ใน Backend มีการเขียน Raw SQL เชื่อมกับ Database โดยตรง ทำให้ Mocking ทำได้ยาก |
| **สถาปัตยกรรมและการแบ่งแยกหน้าที่ (Architecture & Separation)** | **6.0 / 10** | 🟡 ปานกลาง | Controller ใน API แบกรับภาระ Database, Transaction, และ Protocol แปลงข้อมูลเอง แทนที่จะส่งต่อให้ Service Layer (พบ `assets.service.ts` เป็น Stub ที่ไม่ได้เชื่อมต่อจริง) |
| **คะแนนประเมินรวม (Composite Score)** | **6.6 / 10** | 🟡 **Grade C+** | ระบบทำงานได้จริง แต่เริ่มมีหนี้ทางเทคนิค (Technical Debt) สะสมในระดับโครงสร้าง ต้องได้รับการ Refactoring ตามลำดับความสำคัญ |

---

### 3. ตารางสรุป 10 ปัญหาสำคัญสูงสุด (Top 10 High-Impact Findings)

| ลำดับ | รายการปัญหา (Issue) | ตำแหน่งไฟล์และบรรทัด (Location) | ระดับความรุนแรง | ผลกระทบทางวิศวกรรม (Engineering Impact) |
| :---: | :--- | :--- | :---: | :--- |
| **1** | **SQL Parameter Placeholder Bug** (ตกเครื่องหมาย `$`) | `apps/api/src/modules/assets/assets.controller.ts#L783` | **CRITICAL (P0)** | คำสั่ง `UPDATE gateways` สร้างสตริง `mqtt_broker_id = 1` แทนที่จะเป็น `$1` ทำให้ PostgreSQL โยน Error ชนิดข้อมูล UUID ไม่ตรงกัน และทำให้ลำดับพารามิเตอร์ตัวถัดไปเลื่อนตำแหน่งทั้งหมด |
| **2** | **Inverted Abstraction & Missing Service Layer** ใน Assets | `apps/api/src/modules/assets/assets.controller.ts` (1,189 บรรทัด)<br>`apps/api/src/modules/assets/assets.service.ts` (170 บรรทัด) | **HIGH (P1)** | `AssetsController` แบกรับ Raw SQL, Transaction, MQTT Client, Lateral Joins ถึง 1,189 บรรทัด ในขณะที่ `AssetsService` กลับเป็นเพียง Memory Map Stub ที่ถูกทิ้งร้างและไม่ได้ถูกเรียกใช้งานเลย |
| **3** | **Transaction Abuse on Read Queries** (ใช้ Transaction กับคำสั่งอ่าน) | `apps/api/src/modules/identity/site-customer-users.service.ts#L31-L50`<br>`apps/api/src/modules/identity/invitation.service.ts#L178`<br>`apps/api/src/modules/identity/team.service.ts` | **HIGH (P1)** | เรียก `this.db.transaction()` ครอบคำสั่ง `SELECT` ธรรมดา ส่งผลให้ต้อง Checkout Connection, ส่ง `BEGIN` และ `COMMIT` โดยไม่จำเป็น ซึ่งสูบ Connection Pool ที่มีจำกัดเพียง 12 connections จนหมดเมื่อมี Traffic เข้ามาพร้อมกัน |
| **4** | **Unused Dependency & Manual State Re-fetching** | `apps/web/package.json` (`@tanstack/react-query`)<br>ทั่วทั้ง `apps/web/features/**/*.tsx` | **HIGH (P1)** | ติดตั้ง React Query ไว้แต่ไม่มีการเรียกใช้แม้แต่จุดเดียว แต่กลับใช้ `useEffect` + `useState` + cancellation flag พร้อมตัวแปรนับ `revision` ทำงานแบบ Manual ถึง 79 จุด ทำให้โค้ดรกรุงรังและไม่มี Server-side Cache |
| **5** | **Fragmented Email Transport & Config Mismatches** | `apps/api/src/modules/identity/identity-email.ts#L14`<br>`apps/api/src/modules/identity/invitation.service.ts#L258`<br>`apps/api/src/modules/notifications/operational-automation.service.ts#L23`<br>`apps/api/src/modules/billing/saved-document-delivery.ts#L59` | **MEDIUM (P1)** | 4 เซอร์วิสสร้าง `nodemailer.createTransport` แยกกันอย่างอิสระ มีการอ่านตัวแปรแวดล้อมขัดแย้งกัน (`SMTP_PASS` vs `SMTP_PASSWORD`) และใน `saved-document-delivery.ts` ขาด Fallback พอร์ต ทำให้เกิด `port: NaN` |
| **6** | **Dead Code: Unreferenced Billing Sheet & Unused Imports** | `apps/web/features/billing/billing-detail-sheet.tsx` (562 บรรทัด)<br>`apps/api/src/modules/billing/billing.controller.ts#L28` | **LOW (P0)** | ไฟล์ `billing-detail-sheet.tsx` ความยาว 562 บรรทัดไม่มีการ import จากที่ใดเลยในโปรเจกต์ (ถูกแทนที่ด้วย `billing-detail-modal.tsx`) และ `nodemailer` ถูก import ใน `billing.controller.ts` โดยไม่ได้ใช้งาน |
| **7** | **Dialog Duplication caused by Shallow Confirm Abstraction** | `apps/web/components/feedback/confirm-action.tsx` (9 บรรทัด)<br>`apps/web/features/sites/site-customer-users.tsx#L59-L91`<br>`apps/web/features/settings/staff-permissions-workspace.tsx` | **MEDIUM (P2)** | `ConfirmAction` ที่มีอยู่เป็นเพียง Shallow Adapter ความยาว 9 บรรทัดที่ไม่รองรับ Controlled State ทำให้โปรแกรมเมอร์ต้องเขียน `DiscardConfirmDialog`, `DeactivateConfirmDialog`, `CancelInviteConfirmDialog` ซ้ำซ้อนรวมกว่า 450 บรรทัด |
| **8** | **Duplicated Form Dialogs for Same Entities** | `apps/web/features/sites/site-form-dialog.tsx` (695 บรรทัด)<br>`apps/web/features/sites/site-edit-dialog.tsx` (525 บรรทัด)<br>`gateway-form-dialog.tsx` vs `gateway-edit-dialog.tsx` | **MEDIUM (P2)** | การแยกฟอร์มสร้าง (Create) และแก้ไข (Edit) ออกเป็น 2 ไฟล์อิสระ ทำให้เกิดการ Duplicate ของ Field อินพุต, Validation, และ State จัดการ มากกว่า 1,220 บรรทัด |
| **9** | **God Component: Conflated Concerns in Operation Table** | `apps/web/features/shared/operation-table.tsx` (719 บรรทัด) | **MEDIUM (P3)** | คอมโพเนนต์เดียวจัดการตั้งแต่ Billing Cycles, Invoices, Receipts, Contracts, ไปจนถึง Telemetry พร้อมผูกเข้ากับ Modal การทำงานมากกว่า 15 ตัว ขัดต่อ Single Responsibility Principle |
| **10** | **Monolithic Workspace Files with Inline State Bloat** | `apps/web/features/settings/staff-permissions-workspace.tsx` (1,251 บรรทัด)<br>`apps/web/features/sites/site-customer-users.tsx` (1,086 บรรทัด) | **MEDIUM (P3)** | ไฟล์มีขนาดยาวเกิน 1,000 บรรทัด รวมทุกขั้นตอน Modal สิทธิ์ พรีเซ็ต ตัวกรอง ไว้ในไฟล์เดียว ส่งผลต่อ Re-render Performance และยากต่อการอ่านทำความเข้าใจ |

---

### 4. การแก้ไขที่เห็นผลทันทีและปลอดภัยสูงสุด (Quick Wins)

การแก้ไขกลุ่มนี้สามารถทำได้ทันทีโดยไม่กระทบต่อสัญญาภายนอก (Zero API Breaking Changes):
1. **แก้บั๊ก SQL Placeholder:** เพิ่ม `$` ที่ `apps/api/src/modules/assets/assets.controller.ts:783` เปลี่ยนเป็น `mqtt_broker_id = $${gIdx++}`
2. **ลบ Dead Code:** ลบไฟล์ `apps/web/features/billing/billing-detail-sheet.tsx` (ประหยัดได้ 562 บรรทัดทันที)
3. **ลบ Unused Imports:** นำ `import nodemailer from "nodemailer"` ออกจาก `apps/api/src/modules/billing/billing.controller.ts:28`
4. **แก้ไข Port NaN Fallback:** เติม `|| 587` ใน `apps/api/src/modules/billing/saved-document-delivery.ts:59` ป้องกันข้อผิดพลาด `port: NaN` เมื่อไม่ได้ตั้งค่าตัวแปร `SMTP_PORT`
5. **ปลดล็อก Read Queries ออกจาก Transaction:** เปลี่ยนคำสั่ง `this.db.transaction` ใน `site-customer-users.service.ts:31` และ `invitation.service.ts:178` ให้ใช้ `this.db.query` โดยตรง

---

### 5. ข้อจำกัดและแนวทางการตรวจสอบ (Scope & Methodology)

- **การตรวจสอบเชิงประจักษ์ (Evidence-Based):** ทุกข้อค้นพบได้รับการตรวจสอบโดยตรงจากโครงสร้างโค้ดที่มีอยู่จริง พร้อมระบุไฟล์และบรรทัดที่ชัดเจน
- **การรักษาความเข้ากันได้ย้อนหลัง (Backward Compatibility):** แผนการปรับปรุงทั้งหมดมุ่งเน้นการจัดระเบียบโครงสร้างภายใน (Internal Refactoring) โดยยังคงรักษา Database Schema, HTTP REST APIs, สิทธิการเข้าถึง (RBAC), และพฤติกรรมการใช้งานของผู้ใช้เดิมไว้อย่างครบถ้วน 100%
