# Payment Confirmation and Automatic Receipt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep partial-payment domain support while enforcing full customer submissions and making staff evidence approval a non-editable, idempotent confirmation that issues a receipt atomically.

**Architecture:** Tighten customer submission at the role-aware application boundary, simplify the review API to a decision-only contract, and make transfer approval reuse the existing settlement/receipt transaction with replay by `receipt_document_id`.

**Tech Stack:** NestJS 12, PostgreSQL, Node test runner, React 19, Next.js 16, shadcn/Radix Dialog.

**Spec:** `docs/superpowers/specs/2026-10-28-payment-and-asset-lifecycle-design.md`

## Global Constraints

- Preserve `partially_paid`, multiple payments, installment receipts, and staff cash settlement.
- Customer-originated transfer submission equals the locked full outstanding balance.
- Approval does not accept editable amount/date/payer/bank facts from the client.
- Payment approval, receipt artifact, payment receipt link, cycle status, outbox, and audit commit atomically.
- Same-payment replay returns the same receipt; it never allocates a second number.
- Preserve existing user changes in the dirty working tree.

---

### Task 1: Define the decision-only payment review contract

**Files:**
- Modify: `packages/api-contracts/src/payments.ts`
- Modify: `packages/api-contracts/src/payments.contract-test.ts`
- Modify: `packages/api-contracts/src/index.ts`
- Modify: `apps/api/src/modules/billing/billing.controller.ts`
- Modify: `apps/api/src/modules/billing/payment-evidence-review.spec.ts`
- Modify: `apps/api/src/common/auth/route-policy.spec.ts`

**Interfaces:**
- Produces: `PaymentDecisionRequest` and `PaymentDecisionResult`.
- Consumes: existing `PaymentTransferRow` declared fields and receipt document shape.

- [ ] **Step 1: Write failing controller/contract tests**

Add contract tests that the parser accepts only decision fields and rejects client financial overrides before the service is called:

```ts
assert.deepEqual(parsePaymentDecisionRequest({status:'approved',paymentId:'payment-id'}),{
  status:'approved',paymentId:'payment-id',
});
assert.throws(()=>parsePaymentDecisionRequest({
  status:'approved',paymentId:'payment-id',verifiedAmount:'1.00',
}),/unsupported field: verifiedAmount/);
assert.throws(()=>parsePaymentDecisionRequest({
  status:'rejected',paymentId:'payment-id',
}),/rejectionReason/);
```

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/billing/payment-evidence-review.spec.ts src/common/auth/route-policy.spec.ts
```

Expected: FAIL because the controller currently accepts verified amount/date and metadata fields.

- [ ] **Step 3: Replace `PaymentReview` with explicit request/result types**

```ts
export interface PaymentDecisionRequest {
  status:'approved'|'rejected';
  paymentId:string;
  rejectionReason?:string;
}
export interface PaymentDecisionResult {
  success:true;
  paymentId:string;
  billingCycleStatus:'approved'|'pending_verification'|'partially_paid'|'paid';
  receipt:null|{id:string;documentNumber:string};
  replayed:boolean;
}
export function parsePaymentDecisionRequest(input:unknown):PaymentDecisionRequest;
```

Implement `parsePaymentDecisionRequest` with an exact-key allowlist, non-empty `paymentId`, the two valid statuses, required non-empty rejection reason for rejection, and no rejection reason for approval. Export it from `packages/api-contracts/src/index.ts`. In the controller, catch parser errors as `BadRequestException` and pass only parsed values to the service.

- [ ] **Step 4: Run contract/controller tests**

Run the Step 2 command and `pnpm --filter @solar/api-contracts test`.

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/api-contracts/src/payments.ts packages/api-contracts/src/payments.contract-test.ts packages/api-contracts/src/index.ts apps/api/src/modules/billing/billing.controller.ts apps/api/src/modules/billing/payment-evidence-review.spec.ts apps/api/src/common/auth/route-policy.spec.ts
git commit -m "refactor(payments): accept decision-only evidence reviews"
```

---

### Task 2: Preserve partial settlement while enforcing full customer submission

**Files:**
- Modify: `apps/api/src/modules/billing/financial-application.service.ts`
- Modify: `apps/api/src/modules/billing/payment-evidence-review.spec.ts`
- Modify: `apps/api/src/modules/billing/local-financial-application.spec.ts`
- Modify: `apps/api/src/modules/billing/payment-large-evidence.integration.spec.ts`
- Modify: `apps/web/features/customer/payment/customer-payment-model.ts`
- Modify: `apps/web/features/customer/payment/customer-payment-model.spec.ts`
- Modify: `apps/web/features/customer/payment/payment-evidence-step.tsx`
- Modify: `apps/web/features/customer/payment/customer-payment-flow.spec.tsx`

**Interfaces:**
- Produces: role-aware full customer submission and partial-capable approval.
- Consumes: `outstandingBalance` and `settlementBalance`.

- [ ] **Step 1: Add failing service tests for both policies**

```ts
test('customer transfer submission must cover the locked full outstanding balance',async()=>{
  const {service,inserted}=submissionValidationHarness({paid:['25.00']});
  await assert.rejects(()=>service.submitPayment('bill',{amount:'50.00',evidenceKey:'short'},'customer'),/full outstanding/i);
  assert.equal(inserted(),false);
  await service.submitPayment('bill',{amount:'75.00',evidenceKey:'full'},'customer');
  assert.equal(inserted(),true);
});

test('historical partial evidence approval remains supported and issues an installment receipt',async()=>{
  const {service,cycle}=reviewHarness({approved:[],selectedId:'payment',declaredAmount:'40.00',includeOtherPending:false});
  const result=await service.verifyPayment('bill','approved',undefined,'accountant',{paymentId:'payment'});
  assert.equal(result.billingCycleStatus,'partially_paid');
  assert.equal(cycle.status,'partially_paid');
  assert.ok(result.receipt);
});
```

Refactor the existing `reviewHarness` rather than introducing a second fixture. Give it the exact options type `{approved?:string[]; selectedId?:string; declaredAmount?:string; includeOtherPending?:boolean; withIdentity?:boolean}`, return its mutable `cycle`, build paid rows from `approved`, populate the selected row's immutable declared amount/date, apply `UPDATE billing_cycles` to the cycle object, and keep its existing `issue` receipt double. Update its existing callers to the options-object form.

Keep the existing component assertions that no amount tablist or `customer-amount` input is rendered.

- [ ] **Step 2: Run focused tests and confirm the partial-approval failure**

```powershell
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/billing/payment-evidence-review.spec.ts src/modules/billing/local-financial-application.spec.ts src/modules/billing/payment-large-evidence.integration.spec.ts
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/customer/payment/customer-payment-model.spec.ts features/customer/payment/customer-payment-flow.spec.tsx
```

Expected: the historical partial approval test FAILS because current approval requires the full outstanding amount.

- [ ] **Step 3: Keep full validation in customer submission**

Retain the locked calculation in `submitPayment`:

```ts
const approved=payments.filter(p=>p.status==='paid').map(p=>String(p.verified_amount??p.amount));
const remaining=outstandingBalance(String(cycle.amount),approved);
if(amount!==remaining)throw new BadRequestException('Payment evidence must cover the full outstanding amount');
```

Do not move this validation solely to the client. Preserve the read-only amount and no-tab UI/tests already present in the working tree.

- [ ] **Step 4: Restore partial-capable approval arithmetic**

In `verifyPayment`, use submitted facts but allow any valid positive amount not exceeding outstanding:

```ts
const verifiedAmount=requireTestTransferAmount(payment.declared_amount);
const verifiedTransferAt=requireSubmittedTransferDate(payment.declared_transfer_at);
const approved=payments.filter(p=>p.status==='paid').map(p=>String(p.verified_amount??p.amount));
const balance=settlementBalance(String(cycle.amount),approved,verifiedAmount);
const cycleStatus=balance.settled?'paid':pending?'pending_verification':'partially_paid';
```

Remove the equality check between `verifiedAmount` and full outstanding from approval. Do not accept approval overrides from the client.

- [ ] **Step 5: Run focused tests**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/billing/financial-application.service.ts apps/api/src/modules/billing/payment-evidence-review.spec.ts apps/api/src/modules/billing/local-financial-application.spec.ts apps/api/src/modules/billing/payment-large-evidence.integration.spec.ts apps/web/features/customer/payment/customer-payment-model.ts apps/web/features/customer/payment/customer-payment-model.spec.ts apps/web/features/customer/payment/payment-evidence-step.tsx apps/web/features/customer/payment/customer-payment-flow.spec.tsx
git commit -m "fix(payments): keep partial domain behind full customer flow"
```

---

### Task 3: Make transfer approval and receipt replay atomic and idempotent

**Files:**
- Modify: `apps/api/src/modules/billing/financial-application.service.ts`
- Modify: `apps/api/src/modules/billing/payment-evidence-review.spec.ts`
- Modify: `apps/api/src/modules/billing/local-financial-application.spec.ts`
- Modify: `apps/api/src/modules/billing/payment-large-evidence.integration.spec.ts`
- Modify: `packages/api-contracts/src/payments.ts`

**Interfaces:**
- Produces: `PaymentDecisionResult` with `replayed` and normalized receipt keys.
- Consumes: existing `issueSettlementReceipt` transaction behavior and `payments.receipt_document_id`.

- [ ] **Step 1: Write replay and rollback tests**

Extract the database double from the existing `full approval freezes one submitted transfer and rejects a second settlement review` test in `local-financial-application.spec.ts` into a local `approvalHarness(options)` that returns `{service,payment,cycle,receipts,documentInserts}`. Its transaction wrapper must snapshot and restore all mutable arrays/objects when the callback throws, and `options.renderError` must be injected through the service's existing PDF renderer constructor argument.

```ts
test('same approved payment replay returns its linked receipt without allocating a number',async()=>{
  const f=approvalHarness({paymentStatus:'paid',receiptDocumentId:'receipt-id',cycleStatus:'paid'});
  const result=await f.service.verifyPayment('cycle','approved',undefined,'accountant',{paymentId:'payment'});
  assert.equal(result.replayed,true);
  assert.deepEqual(result.receipt,{id:'receipt-id',documentNumber:'RCT-001'});
  assert.equal(f.documentInserts,0);
});

test('receipt artifact failure rolls back payment and cycle changes',async()=>{
  const f=approvalHarness({renderError:new Error('render failed')});
  await assert.rejects(()=>f.service.verifyPayment('cycle','approved',undefined,'accountant',{paymentId:'payment'}),/render failed/);
  assert.equal(f.payment.status,'pending_verification');
  assert.equal(f.cycle.status,'pending_verification');
  assert.equal(f.receipts.length,0);
});
```

- [ ] **Step 2: Run tests and confirm replay failure**

Run:

```powershell
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/billing/payment-evidence-review.spec.ts src/modules/billing/local-financial-application.spec.ts src/modules/billing/payment-large-evidence.integration.spec.ts
```

Expected: replay FAILS because the current service rejects a paid cycle before resolving the selected payment.

- [ ] **Step 3: Resolve replay after locking rows but before paid-cycle rejection**

Order the transaction as follows:

```ts
const cycle=await lockCycle(client,id);
const payments=await lockPayments(client,id);
const payment=payments.find(row=>row.id===paymentId);
if(!payment)throw new NotFoundException('Transfer not found');
if(status==='approved'&&payment.status==='paid'&&payment.receipt_document_id){
  const receipt=await linkedReceipt(client,payment.receipt_document_id);
  return {success:true,paymentId:payment.id,billingCycleStatus:cycle.status,
    receipt:{id:receipt.id,documentNumber:receipt.document_number},replayed:true};
}
if(cycle.status==='paid')throw new ConflictException('Billing statement is already settled');
if(payment.status!=='pending_verification')throw new ConflictException('Transfer has already been reviewed');
```

Keep payment update, document allocation/render/artifact insert, receipt link, cycle update, outbox, and audit within the same `db.transaction` callback. Return `replayed:false` on a new decision.

In `BillingController`, call `send` only when `billingCycleStatus==='paid' && !replayed`; a replay must not enqueue or send the receipt twice.

- [ ] **Step 4: Normalize result shape**

Map database `document_number` to API `documentNumber` for both new and replay results. Return `receipt:null` for rejection.

- [ ] **Step 5: Run tests**

Run the Step 2 command and `pnpm --filter @solar/api test`.

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/billing/financial-application.service.ts apps/api/src/modules/billing/payment-evidence-review.spec.ts apps/api/src/modules/billing/local-financial-application.spec.ts apps/api/src/modules/billing/payment-large-evidence.integration.spec.ts packages/api-contracts/src/payments.ts
git commit -m "fix(payments): make approval receipt issuance idempotent"
```

---

### Task 4: Finalize the non-editable confirmation dialog

**Files:**
- Create: `apps/web/features/billing/payment-approval-confirm-dialog.tsx`
- Create: `apps/web/features/billing/payment-approval-confirm-dialog.spec.tsx`
- Modify: `apps/web/features/billing/payment-verification-dialog.tsx`
- Modify: `apps/web/features/billing/payment-verification-inline.spec.tsx`
- Modify: `apps/web/features/billing/financial-detail-workspace.spec.tsx`
- Modify: `packages/i18n/src/th.ts`
- Modify: `packages/i18n/src/en.ts`

**Interfaces:**
- Consumes: `PaymentDecisionRequest` and selected `PaymentTransferRow`.
- Produces: confirm/reject UI with no financial input controls.

- [ ] **Step 1: Write the focused dialog test**

```tsx
test('approval confirmation shows submitted facts and no editable financial controls',()=>{
  const html=renderToStaticMarkup(<PaymentApprovalConfirmDialog open locale="th" invoiceNumber="INV-001"
    payment={{id:'p',declaredAmount:'100.00',declaredTransferAt:'2026-10-28T03:00:00Z',status:'pending_verification'}}
    busy={false} onOpenChange={()=>{}} onConfirm={()=>{}}/>);
  assert.match(html,/INV-001/);
  assert.match(html,/100\.00/);
  assert.match(html,/ยืนยันว่าหลักฐานถูกต้อง/);
  assert.doesNotMatch(html,/<input|<select|<textarea/);
  assert.match(html,/ออกใบเสร็จ.*อัตโนมัติ/);
});
```

- [ ] **Step 2: Run and confirm failure**

```powershell
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/billing/payment-approval-confirm-dialog.spec.tsx features/billing/payment-verification-inline.spec.tsx
```

Expected: FAIL because the extracted dialog does not exist.

- [ ] **Step 3: Extract and wire the confirmation dialog**

Move the existing inline confirmation markup into the focused component. Show `payment.declaredAmount` and `payment.declaredTransferAt`, not recomputed/edited client values. The approve call sends exactly:

```ts
apiClient.patch(`/v1/billing-cycles/${billingCycle.id}/verify-payment`,{
  status:'approved',paymentId:selectedPayment.id,
} satisfies PaymentDecisionRequest)
```

On error, keep the confirmation dialog open and show the recoverable error inside it. On success, refresh the detail and expose the returned receipt link/number.

- [ ] **Step 4: Run web tests**

```powershell
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/billing/payment-approval-confirm-dialog.spec.tsx features/billing/payment-verification-inline.spec.tsx features/billing/financial-detail-workspace.spec.tsx
pnpm --filter @solar/web test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/features/billing/payment-approval-confirm-dialog.tsx apps/web/features/billing/payment-approval-confirm-dialog.spec.tsx apps/web/features/billing/payment-verification-dialog.tsx apps/web/features/billing/payment-verification-inline.spec.tsx apps/web/features/billing/financial-detail-workspace.spec.tsx packages/i18n/src/th.ts packages/i18n/src/en.ts
git commit -m "feat(web): confirm evidence without editing payment facts"
```

---

### Task 5: Verify the complete financial workflow

**Files:**
- Modify: `apps/api/test/local-financial-workflow.integration.ts`
- Modify: `apps/api/test/finance-workflow-ui.acceptance.ts`
- Modify: `apps/web/test/customer-payment.browser.test.mjs`
- Modify: `docs/financial-ui-flow-verification-2026-10-09.md`

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: executable customer-submit -> staff-confirm -> receipt proof.

- [ ] **Step 1: Extend integration/acceptance scenarios**

Cover:

```text
customer full outstanding submission -> pending_verification
staff confirm with paymentId only -> paid + receipt
same confirm replay -> same receipt ID/number
historical partial pending evidence -> partially_paid + installment receipt
receipt renderer failure -> pending payment and no document
```

- [ ] **Step 2: Run the financial suites**

```powershell
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.finance-acceptance.json --test test/local-financial-workflow.integration.ts test/finance-workflow-ui.acceptance.ts
pnpm --filter @solar/web test:customer:browser
pnpm --filter @solar/api test
pnpm --filter @solar/web test
```

Expected: all commands exit 0.

- [ ] **Step 3: Record evidence and commit**

Update the verification document with commands, pass counts, and the receipt replay assertion.

```powershell
git add apps/api/test/local-financial-workflow.integration.ts apps/api/test/finance-workflow-ui.acceptance.ts apps/web/test/customer-payment.browser.test.mjs docs/financial-ui-flow-verification-2026-10-09.md
git commit -m "test: verify confirm-to-receipt workflow"
```
