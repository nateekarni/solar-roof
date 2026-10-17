# ADR 0040: Streamlined Customer Financial Views, Cardless Summary, Receipts Status Tabs, and Cancelled Status Renaming

## Status
Accepted

## Context
1. **Unwanted Action Buttons on Customer Financial Pages**:
   - In `/billing` and `/receipts`, `OperationPageActions` previously rendered the "นำออกข้อมูล" (Export Data CSV) button and the "อนุมัติและออกเอกสารทั้งหมด" (Bulk Approval) button regardless of user role.
   - For `customer_user`, these buttons are inappropriate: customers do not perform batch issuance approval of billing statements (which is an internal staff/accounting authority), nor do they require a bulk CSV data export button on top of viewing and downloading individual official PDF invoices and receipts.
2. **Redundant Summary Metric Cards for Customer Users**:
   - In the customer view of `/billing` and `/receipts`, the top four metric stat cards ("ใบวางบิล 0 ฉบับ", "บิลที่ชำระแล้ว 0 ฉบับ", "ยอดเรียกเก็บรวม 0 บาท", "ชำระแล้ว 0 บาท") created visual clutter and cognitive overhead.
   - Customers need a focused, streamlined interface containing only title and description, search input, period/status filters, and the direct document table to view or download receipts and invoices.
3. **Ambiguity and Complexity of "ไม่สำเร็จ" (Unsuccessful) Status**:
   - The status "ไม่สำเร็จ" (`unsuccessful`) was historically mapped in the database query from billing cycles that were `cancelled`, `superseded`, or in `draft` without an issued invoice.
   - In internal financial workflows, this represents cancelled or replaced bills. Naming it "ถูกยกเลิก" (`Cancelled`) reflects domain reality much more accurately and eliminates user confusion.
   - In the customer view, cancelled or superseded internal cycles should not be exposed in status tabs or filter dropdowns, as customers only care about actionable lifecycle states.
4. **Billing Status Tabs for Customer Users**:
   - Internal staff view 7 billing tabs: "ทั้งหมด", "รออนุมัติออกเอกสาร", "รอชำระเงิน", "รอตรวจหลักฐาน", "เกินกำหนดชำระ", "ชำระแล้ว", "ถูกยกเลิก".
   - Customer users should only see the 5 actionable customer lifecycle tabs: "ทั้งหมด" (`all`), "รอชำระเงิน" (`awaiting_payment`), "รอตรวจหลักฐาน" (`pending_verification`), "เกินกำหนด" (`overdue`), and "ชำระแล้ว" (`paid`).
5. **Receipts Status Tabs Consistency**:
   - Previously, `/receipts` only provided a small dropdown for payment status while `/billing` used tabs.
   - For design consistency across financial operations, `/receipts` should use dedicated status tabs ("ทั้งหมด" and "ชำระแล้ว") styled identically to `/billing`.
6. **Realistic Test Fixtures for Lat Krabang Customer**:
   - The customer organization account for "ศูนย์กระจายสินค้า ลาดกระบัง" (`BKK-LKB-001`, `billing.bkk-lkb-001@customer.solar.test`) previously had no seeded billing cycles or receipts, showing empty states across all tabs.

## Decision
1. **Omit Export and Approval Actions for Customer Users**:
   - In `apps/web/features/shared/operation-page-actions.tsx`, check `user.role === 'customer_user'`.
   - Suppress the "นำออกข้อมูล" (Export) button and the `<BillingHeaderBulkAction />` component when `user.role === 'customer_user'`.
2. **Suppress Summary Metric Cards in Customer Financial Views**:
   - In `apps/web/features/shared/operation-page.tsx`, pass `summary={user.role === 'customer_user' && ['billing', 'receipts'].includes(resource) ? [] : summary}` to `OperationQueryTable`.
   - In `apps/web/features/shared/operation-table.tsx`, conditionally hide the top summary cards grid when `isCustomer && ['billing', 'receipts'].includes(resource)`.
   - In `apps/web/features/shared/operation-query-table.tsx`, bypass fetching the `/summary` API endpoint when rendering financial operations for customer users.
3. **Rename Status "ไม่สำเร็จ" to "ถูกยกเลิก" (Cancelled) and Filter for Customers**:
   - In `apps/web/lib/status-badge.tsx`, map `unsuccessful` to `{ th: 'ถูกยกเลิก', en: 'Cancelled', variant: 'destructive' }`.
   - In `apps/web/features/shared/operation-query-table.tsx`, exclude `unsuccessful`, `cancelled`, and `draft` from filter options when `isCustomer` is true.
4. **Scoped Billing Status Tabs**:
   - In `apps/web/features/billing/billing-status-tabs.tsx`, export `CUSTOMER_VIEWS = ['all', 'awaiting_payment', 'pending_verification', 'overdue', 'paid']` and `DEFAULT_STAFF_VIEWS`.
   - Render `CUSTOMER_VIEWS` on `/billing` when `isCustomer` is true.
5. **Receipt Status Tabs**:
   - Implement `ReceiptStatusTabs` in `apps/web/features/billing/billing-status-tabs.tsx` supporting tabs "ทั้งหมด" (`all`) and "ชำระแล้ว" (`paid`) with badge counts.
   - Render `ReceiptStatusTabs` on `/receipts` in `OperationQueryTable`, removing the legacy status dropdown.
6. **Seed Realistic Billing & Receipt Fixtures for Lat Krabang (`BKK-LKB-001`)**:
   - In `scripts/seed-platform-realistic.ts`, add Section 7 to seed 4 cycles representing all active customer lifecycle states:
     - 2026-10: "รอชำระเงิน" (`awaiting_payment`) with issued invoice.
     - 2026-09: "รอตรวจหลักฐาน" (`pending_verification`) with uploaded payment slip.
     - 2026-08: "เกินกำหนดชำระ" (`overdue`) with past due date.
     - 2026-07: "ชำระแล้ว" (`paid`) with payment record and issued receipt `RCT-202608-001`.

## Consequences
- Customer users experience a clean, distraction-free document portal containing only Search, Period Filter, Status Tabs, and Document Table.
- Zero risk of customer confusion regarding internal bulk approvals or raw export capabilities.
- Status naming aligns with plain Thai terminology: "ถูกยกเลิก" instead of ambiguous "ไม่สำเร็จ".
- Customer users for Lat Krabang immediately see rich, realistic billing statements and receipts across all tabs upon login.
