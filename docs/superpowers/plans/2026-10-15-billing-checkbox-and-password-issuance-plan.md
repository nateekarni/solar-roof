# Billing Checkbox Selection, Action Bar, and Password-Protected Issuance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable row-level checkboxes across all tabs in the Billing table, dynamic Action Bar showing contextual approval action counts, mandatory password re-authentication for single and bulk document issuance, and distinct status badge coloring between pending approval and awaiting payment.

**Architecture:**
1. Update `STATUS_MAP` in `status-badge.tsx` so `pending_issue_approval` uses Info/Sky blue (`bg-info/15 text-info border-info/30`), separating it from `awaiting_payment` (Warning/Amber).
2. Extend `IssuanceApprovalRequest` and single-approval contract to include an mandatory `password` field, built and published in `@solar/api-contracts`.
3. In `BillingController` and `issuance-approval.ts`, require password verification against the user's password hash using `AuthService.verifyPassword` before issuing documents. Unmatched passwords throw `UnauthorizedException('รหัสผ่านไม่ถูกต้อง กรุณาระบุรหัสผ่านใหม่อีกครั้ง')`.
4. Render checkboxes across all rows and tabs in `operation-table.tsx` and mobile cards. Display the sticky bottom Action Bar whenever rows are selected, showing `เลือกแล้ว ${selected.size} รายการ` and dynamic button `อนุมัติและออกเอกสาร (${pendingCount} รายการ)` when pending items exist.
5. In `BillingBulkApproval`, `BillingApprovalConfirmation`, and `BillingIssuanceReview`, embed a password input field with legal disclaimer. If the API returns 401, display the inline error message without closing the modal or clearing preview state.

**Tech Stack:** React 19, Next.js 16, NestJS, PostgreSQL (scrypt), TypeScript, Node test runner.

**Spec / ADR:**
- `docs/adr/0016-password-reauthentication-for-financial-issuance.md`
- `CONTEXT.md` (การยืนยันรหัสผ่านเพื่ออนุมัติออกเอกสาร)

## Global Constraints

- Never touch external processes on ports 3100–3102.
- Local review stack operates on 3200 (Web), 3201 (API), 3202 (Worker).
- Password validation must be atomic with the approval transaction; no pre-flight bypass or persistent credential caching.
- On password mismatch, retain preview tokens and modal state; display inline red Thai/English error.
- All non-pending rows can be selected, but approval action only targets `pending_issue_approval` rows.
- No internal UUIDs exposed to user-facing results or UI labels.

---

### Task 1: Status Badge Color Distinction

**Files:**
- Modify: `apps/web/lib/status-badge.tsx`
- Create/Test: `apps/web/lib/status-badge.spec.tsx`

**Interfaces:**
- Produces: `STATUS_MAP['pending_issue_approval'].className` with `bg-info/15 text-info border-info/30`
- Preserves: `STATUS_MAP['awaiting_payment'].className` with `bg-warning/15 text-warning-emphasis border-warning/30`

- [ ] **Step 1: Write failing unit test for status badge classes**
- [ ] **Step 2: Run test and confirm failure**
- [ ] **Step 3: Update `STATUS_MAP` in `apps/web/lib/status-badge.tsx`**
- [ ] **Step 4: Run test and verify pass**

---

### Task 2: Update API Contracts with Issuance Password

**Files:**
- Modify: `packages/api-contracts/src/operations.ts`
- Modify: `packages/api-contracts/src/index.ts` (if needed)

**Interfaces:**
- Produces: `IssuanceApprovalRequest` with `password?: string`
- Produces: `ApproveIssuanceRequest` / single approval payload type with `password?: string; reviewToken?: string`

- [ ] **Step 1: Update `packages/api-contracts/src/operations.ts`**
- [ ] **Step 2: Build `@solar/api-contracts`**

---

### Task 3: Backend Password Re-Authentication on Issuance Approval

**Files:**
- Modify: `apps/api/src/modules/billing/issuance-approval.ts`
- Modify: `apps/api/src/modules/billing/billing.controller.ts`
- Modify: `apps/api/src/modules/billing/billing.module.ts`
- Test: `apps/api/src/modules/billing/issuance-approval.controller.spec.ts`

**Interfaces:**
- Consumes: `body.password`
- Produces: HTTP 401 `UnauthorizedException('รหัสผ่านไม่ถูกต้อง กรุณาระบุรหัสผ่านใหม่อีกครั้ง')` on wrong/missing password
- Produces: Success transaction when password verified against `users.password_hash` via `AuthService.verifyPassword`

- [ ] **Step 1: Write failing controller test for password requirement & mismatch**
- [ ] **Step 2: Run test and confirm failure**
- [ ] **Step 3: Implement password verification in `billing.controller.ts` and `issuance-approval.ts`**
- [ ] **Step 4: Run controller test and verify pass**

---

### Task 4: Billing Table Selection Across All Rows & Tabs

**Files:**
- Modify: `apps/web/features/billing/billing-selection.ts`
- Modify: `apps/web/features/billing/billing-selection.spec.ts`
- Modify: `apps/web/features/shared/operation-table.tsx`
- Modify: `apps/web/features/shared/operation-card-list.tsx`

**Interfaces:**
- Produces: Checkbox visible on every row in `/billing` table across all tabs
- Produces: Checkbox on every mobile card in `/billing`
- Produces: `selected` set containing all selected row IDs

- [ ] **Step 1: Write failing unit test in `billing-selection.spec.ts`**
- [ ] **Step 2: Run test and confirm failure**
- [ ] **Step 3: Update `operation-table.tsx` and `operation-card-list.tsx` to render checkboxes on all rows**
- [ ] **Step 4: Run tests and verify pass**

---

### Task 5: Dynamic Action Bar and Password-Protected Approval Modal

**Files:**
- Modify: `apps/web/features/billing/billing-bulk-approval.tsx`
- Modify: `apps/web/features/billing/billing-bulk-approval.spec.tsx`
- Modify: `apps/web/features/billing/billing-issuance-review.tsx`
- Modify: `apps/web/features/billing/billing-issuance-review.spec.tsx`

**Interfaces:**
- Consumes: `rows` (all selected rows), `onClearSelection`
- Produces: Sticky Action Bar showing `เลือกแล้ว ${selected.size} รายการ`
- Produces: Dynamic button `อนุมัติและออกเอกสาร (${pendingCount} รายการ)` when `pendingCount > 0`
- Produces: Modal with password field `รหัสผ่านเพื่อยืนยันการลงนามและออกเอกสาร` and legal disclaimer
- Produces: Inline error rendering without modal dismissal on 401 error

- [ ] **Step 1: Write failing component tests for password field and error handling**
- [ ] **Step 2: Run tests and confirm failure**
- [ ] **Step 3: Implement password input, legal copy, and error handling in `BillingBulkApproval` and `BillingIssuanceReview`**
- [ ] **Step 4: Update `operation-table.tsx` to pass all selected rows and `resetSelection` to `BillingBulkApproval`**
- [ ] **Step 5: Run tests and verify pass**

---

### Task 6: Verification, Typecheck, and Local QA Stack Verification

- [ ] **Step 1: Run TypeScript typecheck across `@solar/api` and `@solar/web`**
- [ ] **Step 2: Run all billing-related unit and integration tests**
- [ ] **Step 3: Rebuild web assets and restart QA stack on port 3200-3202**
- [ ] **Step 4: Verify in local browser/curl on port 3200**
