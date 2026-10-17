# ADR 0038: Customer 1-to-1 Dashboard Scope, Unified Financial Operations, and Organization & Account Redesign

## Status
Accepted

## Context
1. **Customer Dashboard Site Selector Redundancy**:
   - Customer organization users (`customer_user`) are strictly bound 1-to-1 with their assigned customer organization and site.
   - Despite this 1-to-1 relationship, the Customer Dashboard header still rendered the `[ไซต์: ทุกไซต์]` (`SiteFilter`) dropdown next to the period picker. This was redundant and confusing, as the site name and installed capacity (MWp) were already prominently displayed in the top context card (`SiteContext`).
2. **Disparate Customer Invoices and Receipts View**:
   - `/billing` (ใบวางบิล) and `/receipts` (ใบเสร็จรับเงิน) rendered a legacy, simplified `<OrganizationDocuments>` component for `customer_user`, while owners and operators used `<OperationPage>` with standard TanStack data tables, server-side sorting, period filtering, search, and row-click navigation to record details.
   - This caused inconsistent ergonomics, broken search/filtering expectations, and prevented customer users from inspecting detailed electricity consumption calculations (opening/closing kWh readings, tariff rates, billed amounts) and historical payment slips.
3. **Customer Settings Page Nomenclature and Visual Clutter**:
   - The customer navigation menu labeled the page "การตั้งค่า" (Settings / System Settings), which implied platform administration rather than corporate legal entity profile and user account management.
   - The customer settings view rendered 3 stacked cards with stray, redundant links ("บัญชีของฉัน" text link under account details, and "เปิดเอกสาร" link under tax info) and lacked a cohesive, modern visual structure.

## Decision
1. **Eliminate Site Selector from Customer Dashboard**:
   - In `apps/web/features/dashboard/dashboard.tsx`, omit passing `siteControl` when `user.role === 'customer_user'`.
   - `CustomerDashboard` now renders only the `PeriodPicker` on the right side of the page header. Site identity and installed capacity remain cleanly presented in the top `SiteContext` card.
2. **Unify Customer Financial Pages with `OperationPage`**:
   - Removed the `if (user.role === 'customer_user') return <OrganizationDocuments .../>;` branch from `/billing/page.tsx` and `/receipts/page.tsx`.
   - Both pages now render `OperationPage` for all roles.
   - For `customer_user`:
     - Omit top action buttons (`action=""`), preventing customer creation of supplemental invoices.
     - Omit the checkbox selection column and Bulk Approval bar in `/billing`, as bulk issuance approvals are internal staff operations.
     - Row action menus (3 dots) provide `ดูรายละเอียด` (`/records/billing/[id]`) and `ดูเอกสาร (PDF)` (`DocumentPreviewModal`), while suppressing internal audit/approval actions.
     - Record detail views (`/records/billing/[id]` and `/records/receipts/[id]`) provide full read-only access to electricity usage metrics, contract rates, PDF documents, and transfer payment history (`canReview = false`).
3. **Rename Customer Settings to "ข้อมูลองค์กรและบัญชี" (Organization & Account)**:
   - In `nav-config.ts` and `settings-sections.ts`, the navigation label for `customer_user` is updated to **"ข้อมูลองค์กรและบัญชี"** (`Organization & Account`).
4. **Redesign Customer Settings View (`CustomerSettingsView`)**:
   - Restructured into 3 distinct, modern card sections in a unified page:
     1. **ข้อมูลนิติบุคคลตามสัญญา (Legal Organization & Tax Info)**: Displays company name, assigned site, tax identification number, branch, and registered legal address in a clean `<dl>` grid. Displays an informational notice stating that contractual document information is read-only and changes must be requested through system administrators. Stray "เปิดเอกสาร" link is eliminated.
     2. **บัญชีผู้ใช้งาน (User Account Profile)**: Displays logged-in user name, email address, and role badge ("ผู้ใช้งานองค์กรลูกค้า" / "Customer Organization User"). Stray text links are removed.
     3. **การรับเอกสารและการแจ้งเตือน (Notifications & Document Delivery)**: Clean checkboxes for critical email and in-app alerts, plus an email input field for invoice delivery and system notifications, accompanied by a save button.
     4. **ออกจากระบบ (Sign Out)**: Placed cleanly at the bottom of the page.

## Consequences
- Customer organization users experience a focused 1-to-1 dashboard without redundant site selectors.
- Billing and receipts pages share the identical high-performance query table, sorting, date filters, and detail navigation as the owner view, with staff action affordances appropriately hidden.
- Customer account and corporate tax profile information is clearly labeled and organized under "ข้อมูลองค์กรและบัญชี".
