# Customer Payment, Cash Settlement, PromptPay QR, and Document V9 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver transfer-only customer payments with amount-specific PromptPay QR, staff-only cash settlement, safe reminders, compact payment progress, and immutable v9 financial documents.

**Architecture:** Normalize payment method and transfer channel in the contracts and database, then route transfer approval and staff cash entry through one locked settlement boundary. Keep PromptPay payload generation pure and local, add focused customer/staff UI components, and version the financial renderer so saved v8 artifacts remain unchanged.

**Tech Stack:** TypeScript 7, NestJS 12, PostgreSQL, Next.js 16, React 19, Radix/shadcn, React DayPicker, Node test runner, Playwright, pdfmake.

**Spec:** `docs/superpowers/specs/2026-10-19-customer-payment-cash-qr-document-v9-design.md`

## Global Constraints

- Customer users submit bank transfers with evidence only; cash is staff-only.
- `payment_method` is `bank_transfer | cash`; `transfer_channel` is `bank_account | promptpay | null`.
- Money remains decimal text at API and persistence boundaries; do not use floating-point arithmetic for settlement.
- All dates use `Asia/Bangkok` business semantics.
- PromptPay QR generation is local and must not call an external service.
- V8 document artifacts are immutable; all renderer changes use `sarabun-a4-v9`.
- Preserve unrelated uncommitted work. Do not commit or stage the dirty worktree unless the user explicitly requests it.

---

### Task 1: Normalize payment contracts and persistence

**Files:**
- Create: `infra/migrations/070_payment_method_transfer_channel_cash.sql`
- Modify: `packages/api-contracts/src/payments.ts`
- Modify: `packages/api-contracts/src/operations.ts`
- Modify: `apps/api/src/scripts/db-migrate.spec.ts`
- Test: `packages/api-contracts/src/payments.contract-test.ts`

**Interfaces:**
- Produces: `PaymentMethod = 'bank_transfer' | 'cash'`
- Produces: `TransferChannel = 'bank_account' | 'promptpay'`
- Produces: `CashPaymentSubmission { amount: string | number; receivedAt: string; note?: string }`
- Produces: `CashPaymentResult { success: true; billingCycleStatus: string; outstandingAmount: string; paymentId: string; receipt: { id: string; documentNumber: string } }`

- [x] **Step 1: Write contract tests for valid and invalid method/channel combinations**

```ts
assert.deepEqual(normalizePaymentMetadata({paymentMethod:'bank_transfer',transferChannel:'promptpay'}), {
  paymentMethod:'bank_transfer', transferChannel:'promptpay'
});
assert.throws(() => normalizePaymentMetadata({paymentMethod:'cash',transferChannel:'promptpay'}));
assert.throws(() => normalizePaymentMetadata({paymentMethod:'promptpay'}));
```

- [x] **Step 2: Run the contract test and verify it fails**

Run: `pnpm exec tsx --test packages/api-contracts/src/payments.contract-test.ts`

Expected: FAIL because `transferChannel` and the normalized method model do not exist.

- [x] **Step 3: Implement types, normalization, and migration**

The migration must add `transfer_channel`, backfill legacy `promptpay` rows to `bank_transfer/promptpay`, backfill remaining transfer rows to `bank_transfer/bank_account`, replace the old check constraint, and add the cross-column constraint:

```sql
CHECK (
  (payment_method = 'bank_transfer' AND transfer_channel IN ('bank_account','promptpay')) OR
  (payment_method = 'cash' AND transfer_channel IS NULL) OR
  (payment_method IS NULL AND transfer_channel IS NULL)
)
```

Also add `idempotency_key`, `received_at`, and a unique partial index for staff cash records.

- [x] **Step 4: Run contract and migration discovery tests**

Run: `pnpm exec tsx --test packages/api-contracts/src/payments.contract-test.ts apps/api/src/scripts/db-migrate.spec.ts`

Expected: PASS.

- [x] **Step 5: Review checkpoint**

Run: `git diff --check -- infra/migrations/070_payment_method_transfer_channel_cash.sql packages/api-contracts/src/payments.ts packages/api-contracts/src/operations.ts`

### Task 2: Extract settlement boundary and add staff cash endpoint

**Files:**
- Create: `apps/api/src/modules/billing/payment-settlement.ts`
- Create: `apps/api/src/modules/billing/cash-payment.spec.ts`
- Modify: `apps/api/src/modules/billing/financial-application.service.ts`
- Modify: `apps/api/src/modules/billing/billing.controller.ts`
- Modify: `apps/api/src/common/auth/route-policy.ts`
- Modify: `apps/api/src/common/auth/route-policy.spec.ts`
- Modify: `apps/api/src/modules/billing/financial-application.postgres.spec.ts`

**Interfaces:**
- Produces: `settlePayment(client, input): Promise<SettlementResult>`
- Produces: `FinancialApplicationService.recordCashPayment(id, body, actorId, idempotencyKey)`
- HTTP: `POST /v1/billing-cycles/:id/cash-payment`
- Consumes: Task 1 payment types.

- [x] **Step 1: Write failing service tests**

Cover full cash settlement, partial settlement, overpayment, missing capability, idempotent replay, mismatched replay, concurrent balance change, receipt failure rollback, and audit fields. Assert that cash rows contain `payment_method='cash'`, `transfer_channel=null`, no evidence, and status `paid`.

- [x] **Step 2: Run focused tests and verify failure**

Run: `pnpm --filter @solar/api exec tsx --test src/modules/billing/cash-payment.spec.ts`

Expected: FAIL because `recordCashPayment` is absent.

- [x] **Step 3: Extract exact-decimal settlement logic**

Create a focused helper whose input includes the locked cycle, actor identity, amount minor units, effective payment date, method/channel, and receipt context. Move shared balance/status/receipt logic from `verifyPayment` without changing transfer behavior.

- [x] **Step 4: Implement staff-only cash command and route**

The controller reads `Idempotency-Key`, rejects an empty key, and passes the authenticated actor. The service locks the cycle and payments, verifies `business.billing.record_cash_payment`, inserts the cash event, invokes `settlePayment`, cancels ineligible reminder outbox rows, and returns the receipt reference.

- [x] **Step 5: Run service, authorization, and PostgreSQL tests**

Run: `pnpm --filter @solar/api exec tsx --test src/modules/billing/cash-payment.spec.ts src/common/auth/route-policy.spec.ts src/modules/billing/financial-application.postgres.spec.ts`

Expected: PASS.

- [x] **Step 6: Review checkpoint**

Run: `git diff --check -- apps/api/src/modules/billing packages/api-contracts/src/payments.ts apps/api/src/common/auth`

### Task 3: Revalidate reminders and add staff pre-reminders

**Files:**
- Modify: `apps/api/src/modules/notifications/operational-automation.service.ts`
- Modify: `apps/api/src/modules/notifications/operational-automation.service.spec.ts`
- Modify: `apps/api/src/modules/notifications/automation-policy.ts`
- Modify: `apps/api/src/modules/notifications/automation-policy.spec.ts`
- Modify: `apps/api/src/modules/notifications/notification-feed.service.ts`

**Interfaces:**
- Consumes: settled status and outstanding balance from Task 2.
- Produces: delivery eligibility query returning `status`, `outstanding`, and `pendingEvidence`.
- Produces: staff pre-reminder destination `/records/billing/:id?cash=1`.

- [x] **Step 1: Extend failing reminder tests**

Assert cancellation for paid, cancelled, zero-balance, and pending-evidence records; assert remaining amount in partial reminders; assert one-day-prior owner/accountant pre-reminder deduplication.

- [x] **Step 2: Run focused tests and verify failure**

Run: `pnpm --filter @solar/api exec tsx --test src/modules/notifications/automation-policy.spec.ts src/modules/notifications/operational-automation.service.spec.ts`

- [x] **Step 3: Implement final delivery eligibility and pre-reminder queueing**

Calculate outstanding from approved payment rows at both queue and send time. At send time, cancel the claimed job when outstanding is zero or status is paid/cancelled; defer while evidence is pending. Queue staff pre-reminders with a stable key containing cycle, reminder slot, user, and channel.

- [x] **Step 4: Run notification tests**

Run: `pnpm --filter @solar/api exec tsx --test src/modules/notifications/*.spec.ts`

Expected: PASS.

- [x] **Step 5: Review checkpoint**

Run: `git diff --check -- apps/api/src/modules/notifications`

### Task 4: Add pure PromptPay payload and QR image generation

**Files:**
- Create: `packages/api-contracts/src/promptpay.ts`
- Create: `packages/api-contracts/src/promptpay.contract-test.ts`
- Modify: `packages/api-contracts/src/index.ts`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/web/features/customer/payment/customer-payment-qr.ts`
- Modify: `apps/web/features/customer/payment/customer-payment-qr.spec.ts`

**Interfaces:**
- Produces: `buildPromptPayPayload(id: string, amount?: string): string`
- Produces: `normalizePromptPayId(id: string): { kind: 'mobile' | 'national_id'; value: string }`
- Produces: `renderPromptPayQrDataUrl(payload: string): Promise<string>`

- [x] **Step 1: Write known-fixture payload tests**

Tests must assert normalized Thai mobile and 13-digit identifiers, tag `29`, optional amount tag `54`, currency `764`, country `TH`, and CRC tag `63`. Add invalid identifier and invalid amount cases.

- [x] **Step 2: Run tests and verify failure**

Run: `pnpm exec tsx --test packages/api-contracts/src/promptpay.contract-test.ts`

- [x] **Step 3: Implement EMVCo TLV and CRC16-CCITT**

Build the payload from small pure helpers (`tlv`, `crc16Ccitt`, identifier normalization). Do not fetch a remote URL and do not log the identifier.

- [x] **Step 4: Add QR renderer dependency and client adapter**

Add `qrcode` and its TypeScript declaration dependency to `@solar/web`, then implement a local `toDataURL` adapter with error propagation. Keep the configured uploaded `qrCodeUrl` as a labelled non-amount-specific fallback.

- [x] **Step 5: Run payload and QR tests**

Run: `pnpm exec tsx --test packages/api-contracts/src/promptpay.contract-test.ts && pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/customer/payment/customer-payment-qr.spec.ts`

Expected: PASS.

- [x] **Step 6: Review checkpoint**

Run: `git diff --check -- packages/api-contracts apps/web/features/customer/payment apps/web/package.json pnpm-lock.yaml`

### Task 5: Refine the customer record and transfer UI

**Files:**
- Modify: `apps/web/features/customer/records/customer-record-status-header.tsx`
- Modify: `apps/web/features/customer/records/customer-payment-progress.tsx`
- Modify: `apps/web/features/customer/records/customer-financial-record-page.tsx`
- Modify: `apps/web/features/customer/records/customer-financial-record-page.spec.tsx`
- Modify: `apps/web/features/customer/payment/customer-payment-flow.tsx`
- Modify: `apps/web/features/customer/payment/customer-payment-model.ts`
- Modify: `apps/web/features/customer/payment/customer-payment-model.spec.ts`
- Modify: `apps/web/features/customer/payment/payment-instructions-step.tsx`
- Modify: `apps/web/features/customer/payment/payment-evidence-step.tsx`
- Modify: `apps/web/features/customer/payment/customer-payment-pickers.tsx`
- Modify: `apps/web/features/customer/payment/customer-evidence-picker.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `packages/i18n/src/th.ts`
- Modify: `packages/i18n/src/en.ts`
- Test: `apps/web/test/customer-payment.browser.test.mjs`
- Test: `apps/web/test/customer-payment-qr.browser.test.mjs`

**Interfaces:**
- Consumes: PromptPay functions from Task 4.
- Submits: `{ paymentMethod:'bank_transfer', transferChannel, amount, paidAt, evidenceKey, slipUrl, note }`.

- [x] **Step 1: Write failing component and browser assertions**

Assert one integrated progress block, no customer cash option, no bank-vs-PromptPay method picker, QR regeneration after amount change, destructive preview-delete icon, desktop paired date/note layout, mobile sheets, selected-today gold style, and future-date muted disabled style.

- [x] **Step 2: Run focused tests and verify failure**

Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/customer/records/customer-financial-record-page.spec.tsx features/customer/payment/customer-payment-model.spec.ts features/customer/payment/customer-payment-flow.spec.tsx`

- [x] **Step 3: Integrate compact progress into the status header**

Render `ชำระแล้ว <paid> / <total>` and a capped accessible progress bar in the hero. Delete the separate progress-card composition while retaining the focused component as a compact child.

- [x] **Step 4: Make the customer form transfer-only and amount-aware**

Remove method selection from the draft. Derive transfer channel from the available instructions, generate a QR from the selected valid amount, preserve form values across upload failures, and keep bank details visible if QR generation fails.

- [x] **Step 5: Fix date-picker state precedence and responsive layout**

Add an explicit selected-today selector after the today rule, for example:

```css
.customer-payment-calendar td.rdp-today.rdp-selected .rdp-day_button {
  background: var(--customer-action-primary);
  color: var(--customer-action-primary-foreground);
}
```

Ensure future disabled buttons use muted foreground and cannot receive selection.

- [x] **Step 6: Run customer unit and browser tests**

Run: `pnpm --filter @solar/web test && pnpm --filter @solar/web test:customer:browser`

Expected: PASS.

- [x] **Step 7: Review checkpoint**

Run: `git diff --check -- apps/web/features/customer apps/web/app/globals.css packages/i18n`

### Task 6: Add owner/accountant cash-entry UI

**Files:**
- Create: `apps/web/features/billing/cash-payment-dialog.tsx`
- Create: `apps/web/features/billing/cash-payment-dialog.spec.tsx`
- Modify: `apps/web/features/billing/billing-record-actions.tsx`
- Modify: `apps/web/features/billing/billing-record-panel.tsx`
- Modify: `apps/web/features/billing/billing-record-panel.spec.tsx`
- Create: `apps/web/features/billing/cash-payment-history.tsx`
- Create: `apps/web/features/billing/cash-payment-history.spec.tsx`
- Modify: `apps/web/features/shared/operation-actions.ts`
- Modify: `packages/api-contracts/src/operations.ts`
- Modify: `apps/web/lib/financial-capabilities.ts`
- Modify: `apps/api/src/modules/dashboard/operations.service.ts`
- Modify: `apps/api/src/modules/dashboard/operations.service.spec.ts`

**Interfaces:**
- Consumes: cash endpoint and result from Task 2.
- Produces: `CashPaymentDialog` with `billingCycle`, `open`, `onOpenChange`, and `onSuccess` props.

- [x] **Step 1: Write failing action and dialog tests**

Assert that only owner/accountant capability holders see `รับชำระเงินสด`, only for positive outstanding awaiting/overdue/partial records. Assert default full balance, partial validation, Bangkok date, generated idempotency key, stale-balance recovery, receipt success output, and a daily cash list containing customer, cycle, amount, receipt, recorder, received date, and recorded timestamp.

- [x] **Step 2: Run tests and verify failure**

Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/billing/cash-payment-dialog.spec.tsx features/billing/cash-payment-history.spec.tsx features/billing/billing-record-panel.spec.tsx`

- [x] **Step 3: Implement action and compact dialog**

Use existing shadcn inputs, date picker, dialog/sheet responsive pattern, and `apiClient.post`. Keep the idempotency key stable while retrying the same form payload and regenerate it after success or material form edits. Extend the billing operations projection with the day's cash entries and render them in a focused `CashPaymentHistory` list rather than mixing them into pending transfer review.

- [x] **Step 4: Run billing UI tests and typecheck**

Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/billing/*.spec.tsx && pnpm --filter @solar/web lint`

Expected: PASS.

- [x] **Step 5: Review checkpoint**

Run: `git diff --check -- apps/web/features/billing apps/web/features/shared/operation-actions.ts packages/api-contracts/src/operations.ts`

### Task 7: Version and refine financial documents

**Files:**
- Modify: `apps/api/src/modules/documents/financial-document-pdf.ts`
- Modify: `apps/api/src/modules/documents/document-layout.ts`
- Modify: `apps/api/src/modules/documents/document-financial-reference.spec.ts`
- Modify: `apps/api/src/modules/documents/document-reference.spec.ts`
- Modify: `apps/api/src/modules/documents/local-test-pdf.spec.ts`
- Modify: `apps/api/src/modules/documents/document-ordinary-issued.test-fixtures.json`

**Interfaces:**
- Produces: `FINANCIAL_TEMPLATE_VERSION = 'sarabun-a4-v9'`.
- Produces: one signature role: invoice `ผู้ออกใบวางบิล`; receipt/tax invoice `ผู้รับเงิน`.

- [x] **Step 1: Add failing v9 layout assertions**

Assert the new template identifier, neutral table borders, one gold top rule, expanded item region, no visible synthetic banner, and exactly one signature block with the document-specific label.

- [x] **Step 2: Run focused document tests and verify failure**

Run: `pnpm --filter @solar/api exec tsx --test src/modules/documents/document-financial-reference.spec.ts src/modules/documents/document-reference.spec.ts src/modules/documents/local-test-pdf.spec.ts`

- [x] **Step 3: Implement v9 renderer**

Bump the version, remove the visible synthetic banner while preserving snapshot scope metadata, keep neutral borders and the gold top rule, expand the A4 item region, and reduce signatures to the single approved role.

- [x] **Step 4: Add template-version guard fixture**

Store the expected renderer fixture hash with the v9 identifier and fail the test when the fixture changes without a version change.

- [x] **Step 5: Run all document tests**

Run: `pnpm --filter @solar/api exec tsx --test src/modules/documents/*.spec.ts`

Expected: PASS.

- [x] **Step 6: Review checkpoint**

Run: `git diff --check -- apps/api/src/modules/documents`

### Task 8: Integrate, migrate local review data, and verify end to end

**Files:**
- Modify: `scripts/local-financial-review/run-september.mjs`
- Modify: `scripts/local-financial-review/september-fixture.mjs`
- Modify: `scripts/local-financial-review/september-fixture.test.mjs`
- Modify: `docs/superpowers/specs/2026-10-19-customer-payment-cash-qr-document-v9-design.md` only if implementation reveals a factual correction.

**Interfaces:**
- Consumes all prior tasks.
- Produces a linked invoice revision 2 using v9 while retaining the superseded v8 artifact. The replacement receives the next legal document number because `documents.document_number` is globally unique; the supersession link, revision, and artifact hashes preserve the audit trail.

- [x] **Step 1: Extend the local-review fixture test**

Assert one current v9 revision 2, one superseded/downloadable v8 revision 1, a valid PromptPay instruction, and staff cash capability without creating a fake cash payment.

- [x] **Step 2: Run fixture tests and verify failure**

Run: `pnpm exec tsx --test scripts/local-financial-review/september-fixture.test.mjs`

- [x] **Step 3: Apply migration and regenerate the approved local document revision**

Use the normal replacement/approval service path in the local review environment. Do not update document artifact bytes or `is_current` directly with SQL.

- [x] **Step 4: Run full repository verification**

Run: `pnpm --filter @solar/api test`

Run: `pnpm --filter @solar/web test`

Run: `pnpm --filter @solar/api build`

Run: `pnpm --filter @solar/web build`

Expected: all commands PASS, except any pre-existing blocker must be reproduced and documented with the exact command and unaffected baseline evidence.

- [x] **Step 5: Run browser smoke checks**

Verify customer desktop and 394×852 mobile payment flows, owner/accountant cash entry, notification suppression after settlement, v8 artifact download, and v9 revision 2 preview.

- [x] **Step 6: Final diff and safety review**

Run: `git diff --check`

Run: `git status --short`

Confirm no unrelated user changes were overwritten and no generated secrets, evidence files, or local database credentials were added.

### Task 9: Publish the neutral paired invoice signatures as v10

- [x] Add a failing PDF regression proving invoices require `ผู้วางบิล` and `ผู้รับใบวางบิล`, two blank dates, and no rendered profile identity.
- [x] Implement the paired invoice footer without changing receipt or contract signatures.
- [x] Advance the immutable financial renderer identifier to `sarabun-a4-v10` and update its fixture fingerprint.
- [x] Create and approve the linked local v10 revision through the normal service path while verifying v8 and v9 artifacts remain downloadable by hash.

### Task 10: Use conventional billing-receiver terminology in v11

- [x] Add a failing PDF regression requiring `ผู้รับวางบิล` and rejecting `ผู้รับใบวางบิล`.
- [x] Change the invoice customer signature role without changing receipt or contract roles.
- [x] Advance the immutable financial renderer identifier to `sarabun-a4-v11` and update its fixture fingerprint.
- [x] Create and visually verify the linked local v11 invoice while preserving v8-v10 artifacts.
- [x] Render and inspect the one-page A4 output for alignment, clipping, labels, and dates.
