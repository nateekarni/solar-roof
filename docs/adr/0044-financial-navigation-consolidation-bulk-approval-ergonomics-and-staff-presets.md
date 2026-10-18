# ADR 0044: Financial Navigation Consolidation, Bulk Approval Ergonomics, and Staff Presets

## Status
Accepted

## Context
Following real-world feedback from users testing the billing approval, receipt issuing, and gateway operations:
1. Navigation separated "ใบวางบิล" and "ใบเสร็จรับเงิน" into a dropdown submenu under contracts/docs, whereas modern financial workflow treats invoices, payments, and receipts as sequential artifacts of a single financial cycle. Furthermore, system administrators (`admin`) do not manage financial operations and should not see financial document navigation.
2. In the bulk issuance approval modal, full stacked cards caused excessive vertical scrolling when approving multiple bills. Users needed a compact, glanceable table with row-level expansion, per-bill selection checkboxes, clean password entry without heavy nested containers, and an informative approver fact card.
3. On pages displaying data tables, pagination defaulted to 10 or 25 rows, requiring manual adjustments by operators.
4. On the gateway page, status filter tabs were located above the search box, breaking user workflow.
5. In staff invitation and user editing, permission preset suggestions were missing for `accountant` and `operator` roles.
6. In site tariff settings, the table selection checkbox column was misaligned with the billing table.

## Decision
1. **Consolidated Financial Documents Navigation**:
   - Merge "ใบวางบิล" and "ใบเสร็จรับเงิน" into a single top-level menu: **"เอกสาร"** (`/billing`).
   - Restrict this menu to roles managing or viewing financial documents (`owner`, `accountant`, `operator`, `customer_user`). System administrators (`admin`) do not see this menu.
   - Redirect any direct visits to `/receipts` to `/billing`.
2. **Timeline Ordering with Review Priority Pinning**:
   - In `FinancialDocumentList`, order documents chronologically:
     1. Invoice (ใบเรียกเก็บเงิน)
     2. Payment slips / transfers (หลักฐานการโอนเงิน)
     3. Receipt (ใบเสร็จรับเงิน)
   - **Exception**: Any payment slip with status `pending_verification` is pinned to the very top of the list so reviewers can immediately review and approve/reject evidence.
3. **Compact Bulk Approval Modal**:
   - Replace stacked card views in `BillingBulkApproval` with a compact table displaying:
     - Checkbox (Select all in header + per row for excluding specific sites)
     - Site name and code
     - Total billed amount (THB)
     - Chevron toggle button to expand/collapse full details (period, kWh, tariff rate, subtotal, tax, due date, recipients)
   - Present approver facts (`ผู้อนุมัติ:`) inside a standard display Card with border and padding.
   - Present password input without outer card border and padding, cleanly placed above actions.
   - Standardize dialog footer with `Cancel` (outline) and `Approve documents (N)` (primary).
   - Shorten header bulk approval button to `อนุมัติเอกสาร (N)` and display it as `disabled` when `count === 0`.
   - Provide `+ สร้างใบวางบิล` button for authorized roles regardless of pending count.
4. **Table Pagination Defaults**:
   - Set default page size to 50 rows across all data tables (`DataTable`, `OperationTable`, `OperationQueryTable`).
   - Offer options `[10, 25, 50, 100]`.
5. **Gateway Tab Repositioning**:
   - Move status tabs (`ทั้งหมด`, `เชื่อมต่อแล้ว`, `ยังไม่เชื่อมต่อ`) below the search box in `GatewayIndex`.
6. **Staff Position Presets**:
   - Include `accountant` and `operator` in `InviteUserDialog` role selection.
   - Provide clickable position presets for `accountant` (e.g. เจ้าหน้าที่บัญชีและการเงิน, ผู้ตรวจสอบบัญชี, ผู้จัดการฝ่ายบัญชี) and `operator` (e.g. วิศวกรควบคุมระบบ, เจ้าหน้าที่เทคนิค, วิศวกรบำรุงรักษา) during invitation and staff editing.
7. **Tariff Table Checkbox Column Width**:
   - Fix tariff table selection column width to 48px (`w-12`, `size: 48, minSize: 48, maxSize: 48`) with centered checkbox wrapper matching `operation-table.tsx`.

## Consequences
- Single, consistent place for financial lifecycle tracking.
- Fast, ergonomic bulk approval workflow with fine-grained site selection.
- Uniform pagination and table column ergonomics across all views.
