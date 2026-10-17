# รายงานการตรวจสอบโครงสร้างโค้ดและการปรับปรุงระบบ (Codebase Audit & Refactoring Plan)
## เอกสารฉบับที่ 03: คุณภาพโค้ดและความซับซ้อน (Code Quality & Complexity)

**วันที่ตรวจสอบ:** 16 ตุลาคม 2026  
**ขอบเขต:** การวิเคราะห์ขนาดไฟล์ (Oversized Files), จุดที่มีความซับซ้อนสูง (Complexity Hotspots), โค้ดที่รวบรัดเกินไป (Code Density/Golfing), โค้ดที่ไม่ได้ใช้งาน (Dead Code), และความปลอดภัยของไทป์ (Type Safety)

---

### 1. รายการไฟล์ที่มีขนาดใหญ่เกินมาตรฐาน (Top 10 Oversized Files)

การมีไฟล์ขนาดใหญ่เกิน 500-1,000 บรรทัดส่งผลเสียโดยตรงต่อ Cognitive Load ของวิศวกรผู้ดูแล, เพิ่มความเสี่ยงของ Merge Conflicts, และทำให้ React Component เกิด Unnecessary Re-renders:

| อันดับ | ตำแหน่งไฟล์ (File Path) | จำนวนบรรทัด | หน้าที่และความรับผิดชอบหลัก (Responsibilities) | ปัญหาที่ตรวจพบ (Findings) |
| :---: | :--- | :---: | :--- | :--- |
| **1** | `apps/web/features/settings/staff-permissions-workspace.tsx` | **1,251** | จัดการสิทธิ์พนักงาน (Staff Permissions Workspace), กำหนดตำแหน่ง, จัดการ Presets, Step-by-Step Invite Modal, Site Scope Selection | รวม State ของทุกฟอร์มและทุก Modal ไว้ในคอมโพเนนต์เดียว มีโค้ด Confirm Dialog ซ้ำซ้อน |
| **2** | `apps/api/src/modules/assets/assets.controller.ts` | **1,189** | จัดการ Sites, Gateways, Devices, Mqtt Brokers, Ingestion Profile, Credentials | แบกรับ Raw SQL และ Business Logic แทน Service มีบั๊ก SQL Placeholder ที่บรรทัด 783 |
| **3** | `apps/web/features/sites/site-customer-users.tsx` | **1,086** | แสดงตารางผู้ใช้งานลูกค้าของแต่ละไซต์งาน, ฟอร์มเชิญ (Invite), ฟอร์มแก้ไข (Edit), Reset Password Modal | คัดลอกโค้ด `DiscardConfirmDialog`, `DeactivateConfirmDialog`, `CancelInviteConfirmDialog` ซ้ำซ้อน 450 บรรทัด |
| **4** | `apps/api/src/modules/documents/document-layout.ts` | **914** | วาดเอกสารทางกฎหมายและการเงิน (ใบแจ้งหนี้, ใบเสร็จ, สัญญา PPA) ด้วย `pdfkit` | รวม Logic การจัดวางหน้า, การขึ้นหน้าใหม่ (Pagination), การวาดลายเซ็น และการคำนวณพิกัดไว้ในไฟล์เดียว |
| **5** | `apps/web/features/shared/operation-table.tsx` | **719** | ตารางปฏิบัติการกลาง (Operations Table) รองรับ 5 Domain Entities พร้อม Action Buttons และ Modals | เป็น **God Component** ที่รวม Logic ของ Billing, Contract, Invoice, Telemetry ไว้ด้วยกัน |
| **6** | `apps/web/features/sites/site-form-dialog.tsx` | **695** | โมดอลสร้างไซต์งานใหม่ (Create Site Dialog) พร้อมผูก Gateway และ Meter | โค้ดโครงสร้าง Form Fields และ Validation ซ้ำกับ `site-edit-dialog.tsx` มากกว่า 70% |
| **7** | `apps/web/features/billing/billing-detail-sheet.tsx` | **562** | คอมโพเนนต์เก่าสำหรับแสดงรายละเอียดรอบบิล (Side Sheet) | **Dead Code 100%:** ไม่มีไฟล์ใดในระบบนำเข้าไฟล์นี้ไปใช้งาน ถูกแทนที่โดย `billing-detail-modal.tsx` |
| **8** | `apps/web/features/sites/site-edit-dialog.tsx` | **525** | โมดอลแก้ไขข้อมูลไซต์งาน (Edit Site Dialog) | มีการคัดลอก Field และ State มาจาก `site-form-dialog.tsx` |
| **9** | `apps/web/features/billing/billing-detail-modal.tsx` | **465** | แสดงรายละเอียดรอบบิล, ใบแจ้งหนี้, ประวัติการชำระเงิน, และหลักฐานการโอน | รวมการแสดงผลเอกสารและการอนุมัติไว้ในโมดอลเดียว |
| **10** | `apps/api/src/modules/billing/billing.controller.ts` | **421** | HTTP Handlers สำหรับงานคำนวณบิล, อนุมัติเอกสาร, สรุปยอด | มีการ Import `nodemailer` ที่ไม่ได้ใช้งาน |

---

### 2. จุดที่มีความซับซ้อนสูงและคอมโพเนนต์พระเจ้า (Complexity Hotspots & God Components)

#### 2.1 `operation-table.tsx`: The God Component of Frontend
`apps/web/features/shared/operation-table.tsx` เป็นตัวอย่างคลาสสิกของการละเมิด **Single Responsibility Principle**:
- **สิ่งที่รับผิดชอบพร้อมกัน:**
  1. การจัดเรียงและคัดกรองข้อมูล 5 ประเภท (Billing Cycles, Invoices, Receipts, Contracts, Telemetry)
  2. การจัดการ Selection Box สำหรับ Bulk Approval
  3. การแสดง Cell เฉพาะทาง (เช่น `BillOverdueCell`, `TelemetryAgeLabel`)
  4. การผูกเข้ากับ Modal ขนาดใหญ่มากกว่า 8 ชนิด:
     - `BillingBulkApproval`
     - `DocumentPreviewModal`
     - `BillingDetailModal`
     - `RecordSignModal`
     - `CustomerPaymentModal`
     - `InvoiceDetailModal`
     - `ReceiptDetailModal`
     - `ContractDetailModal`
- **ปัญหาทางวิศวกรรม:** ทุกครั้งที่มีการคลิกปุ่ม Action เพียงปุ่มเดียวในแถวใดแถวหนึ่ง คอมโพเนนต์ทั้ง 719 บรรทัดรวมถึง Dialog ลูกทั้งหมดจะต้องผ่านรอบการ Re-evaluate ของ React Virtual DOM

#### 2.2 `assets.controller.ts`: The Monolithic Controller of Backend
- ภายในฟังก์ชัน `listGateways` (บรรทัด 44–60):
  ```typescript
  // ตัวอย่างความซับซ้อนของคำสั่ง Raw SQL ภายใน Controller
  return (await this.db.query(`SELECT g.id, g.site_id AS "siteId", s.name AS "siteName", ...
    FROM gateways g JOIN sites s ON s.id=g.site_id
    LEFT JOIN LATERAL (
      SELECT max(sample.measured) AS measured, max(sample.received) AS received FROM devices d
      LEFT JOIN LATERAL (SELECT coalesce(ps.measured_at, ps.polled_at) AS measured, ps.received_at AS received
        FROM payload_samples ps WHERE ps.device_id=d.id ORDER BY ... LIMIT 1) sample ON true
      WHERE d.gateway_id=g.id
    ) latest ON true
    LEFT JOIN LATERAL (
      SELECT CASE WHEN count(*)=1 AND bool_and(ps.quality='good' AND ...) THEN ... END AS kw
      FROM devices d JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id ...
    ) pv ON true ...`, [siteScope(req?.user, 'technical')])).rows;
  ```
- มีการรวม Subquery และ Lateral Join ซ้อนกัน 3 ชั้นภายใน Controller โดยไม่มีการแยกคำสั่ง SQL ออกเป็น Query Function หรือ View ในฐานข้อมูล ทำให้การอ่านและดีบักแทบเป็นไปไม่ได้หากเกิดข้อผิดพลาด

---

### 3. โค้ดที่รวบรัดเกินไป (Code Density & "Code Golfing")

พบการเขียนโค้ดสไตล์บีบอัดบรรทัด (Golfed Code) ในบางส่วนของระบบ ซึ่งทำให้ยากต่อการตั้ง Breakpoint และการทำ Code Review:

1. **`apps/web/components/feedback/confirm-action.tsx` (ความยาวทั้งไฟล์ 9 บรรทัด):**
   ```typescript
   export function ConfirmAction({ trigger, title, description, confirmLabel = "ยืนยัน", onConfirm }: { trigger: React.ReactNode; title: string; description: string; confirmLabel?: string; onConfirm: () => void }) {
     return <AlertDialog><AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>ยกเลิก</AlertDialogCancel><AlertDialogAction asChild><Button onClick={onConfirm}>{confirmLabel}</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
   }
   ```
   โค้ดถูกบีบอัดเป็นบรรทัดเดียว ไม่มีการเว้นวรรคหรือขึ้นบรรทัดใหม่ และไม่สามารถปรับแต่งได้
2. **`apps/api/src/modules/identity/identity-email.ts`:**
   ```typescript
   export const tokenDigest=(value:string)=>createHash('sha256').update(value).digest('hex');
   export const maskEmail=(email:string)=>email.replace(/^(.).*(@.*)$/,'$1***$2');
   ```
   แม้จะไม่ผิดทางไวยากรณ์ แต่ขาดการเว้นวรรคตามมาตรฐาน Prettier สากล

---

### 4. โค้ดที่ไม่ได้ใช้งานและแพ็กเกจส่วนเกิน (Dead Code & Unused Dependencies)

| รายการ (Item) | ตำแหน่ง (Location) | หลักฐานเชิงประจักษ์ (Evidence) | ผลกระทบและข้อเสนอแนะ |
| :--- | :--- | :--- | :--- |
| **`billing-detail-sheet.tsx`** | `apps/web/features/billing/` (562 บรรทัด) | ค้นหา `billing-detail-sheet` ทั่วทั้ง `apps/web` พบผลลัพธ์ **0 รายการ** | เป็นโค้ดร้างที่ถูกทอดทิ้งหลังจากเปลี่ยนมาใช้ Modal แนะนำให้ **ลบทิ้งทันที** เพื่อลดภาระการ Build และ Bundle |
| **Unused `nodemailer` Import** | `apps/api/src/modules/billing/billing.controller.ts:28` | มี `import nodemailer from "nodemailer";` แต่ไม่มีการอ้างอิงถึง `nodemailer` ในไฟล์เลย | ลบ import ออกเพื่อความสะอาดของโค้ด |
| **`@tanstack/react-query` Dependency** | `apps/web/package.json:21` (`^5.102.8`) | ค้นหาการใช้งาน `useQuery`, `useMutation`, `QueryClient` ทั่วทั้ง `apps/web` พบผลลัพธ์ **0 รายการ** | ติดตั้งไลบรารีขนาดใหญ่ไว้โดยไม่ได้เปิดใช้งาน แต่กลับใช้ `useEffect` แบบดั้งเดิม ควรเลือกนำมาปรับใช้จริงหรือถอนการติดตั้งออก |
| **Orphaned `AssetsService` Stub** | `apps/api/src/modules/assets/assets.service.ts` (170 บรรทัด) | คลาสใช้ `new Map()` ใน Memory ไม่เคยถูก Inject ลงใน Controller หรือ Module ใดๆ | ควรเขียน Implementation ให้ต่อ Database จริง หรือควบรวมเข้ากับ Repository Layer |

---

### 5. การจัดการข้อผิดพลาดและความปลอดภัยของไทป์ (Error Handling & Type Safety)

1. **Empty Catch Blocks ที่กลืน Error (Swallowed Exceptions):**
   - ใน `apps/api/src/modules/identity/invitation.service.ts:261`:
     ```typescript
     try {
       // ส่ง SMTP ...
     } catch {
       /* Delivery failure is persisted; SMTP errors can contain token-bearing message data. */
     }
     ```
     แม้ว่าจะมีคอมเมนต์อธิบายถึงเหตุผลด้านความปลอดภัย แต่การไม่บันทึก Error Code หรือ Log เพื่อการ Debug ของผู้ดูแลระบบ (Ops) ทำให้ไม่ทราบสาเหตุที่แท้จริงหากเซิร์ฟเวอร์ SMTP มีปัญหา
2. **การ Cast Type แบบหลวม (`as any`):**
   - พบการใช้ `actor: any` ใน `invitation.service.ts:52` และ `job: any` ใน `saved-document-delivery.ts:13, 22, 27` ซึ่งลดทอนประโยชน์ของ TypeScript Strict Mode ในการป้องกัน Runtime Crash
