# Billing Issuance Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every billing statement wait for human issuance approval, snapshot the approving user's identity, support safe partial-success bulk approval, and keep receipts tied to the payment reviewer.

**Architecture:** Split draft preparation from official issuance. Reuse the exact-decimal billing cycle as the mutable draft, allocate numbers and persist immutable artifacts only inside approval transactions, and resolve the signer through `DocumentIdentityService`. A batch application service calls the single-item transaction independently and returns display-safe ordered results.

**Tech Stack:** PostgreSQL, NestJS, TypeScript, pdfmake, Node test runner, existing financial readiness and outbox services.

**Spec:** `docs/superpowers/specs/2026-10-14-approver-signature-and-billing-issuance-design.md`

## Global Constraints

- Depends on `docs/superpowers/plans/2026-10-14-user-document-identity-plan.md`.
- Official number allocation, PDF rendering, immutable artifact creation, audit success, and delivery intent occur only after approval.
- `business.billing.approve` controls both single and bulk issuance approval.
- Missing signature is allowed; missing active user or company position blocks that approver.
- One failing bulk item never rolls back another successful item.
- Concurrent approval creates one current invoice and one number.
- Receipt signer is the payment reviewer, not the invoice approver.
- No user-facing result contains internal IDs.

## File Structure

- Create `infra/migrations/059_billing_issuance_approval.sql`: pending replacement-draft persistence and uniqueness.
- Create `apps/api/src/modules/billing/issuance-approval.ts`: input/result types and human-readable labels.
- Create `apps/api/src/modules/billing/issuance-approval.spec.ts`: pure validation/result tests.
- Modify `apps/api/src/modules/billing/financial-application.service.ts`: prepare/approve separation, signer snapshot, receipt signer.
- Modify `apps/api/src/modules/billing/billing.controller.ts`: single/batch endpoints and permissions.
- Modify `apps/api/src/modules/billing/financial-application.postgres.spec.ts`: transactional behavior.
- Modify `apps/api/src/modules/billing/local-financial-application.spec.ts`: isolated service behavior.
- Modify `apps/api/src/modules/billing/financial-scheduler.ts`: prepare drafts only.
- Modify `apps/api/src/modules/billing/financial-scheduler.spec.ts`: no automatic issuance.
- Modify `apps/api/src/modules/billing/site-billing.service.ts`: replacement drafts.
- Modify `apps/api/src/modules/billing/site-billing.service.spec.ts`: preserve prior issued invoice.
- Modify `apps/api/src/modules/documents/financial-document-pdf.ts`: map approver snapshot.
- Modify `apps/api/src/modules/documents/signature-snapshot.spec.ts`: invoice/receipt actor snapshots.
- Modify `apps/api/src/modules/documents/document-layout.ts`: render saved approver identity with optional signature.
- Modify `apps/api/src/modules/documents/document-layout.spec.ts`: unsigned and signed output.
- Modify `apps/api/src/common/auth/domain-route-policy.ts`: batch/single route authorization.
- Modify `apps/api/src/common/auth/domain-route-policy.spec.ts`: permission coverage.

---

### Task 1: Define the pending-issuance state and display-safe batch contract

**Files:**
- Create: `apps/api/src/modules/billing/issuance-approval.ts`
- Create: `apps/api/src/modules/billing/issuance-approval.spec.ts`
- Modify: `packages/api-contracts/src/operations.ts`
- Modify: `packages/api-contracts/src/index.ts`

**Interfaces:**
- Produces: `IssuanceApprovalResult={label:{period:string;customer:string;site:string};status:'issued'|'already_issued'|'failed';documentNumber?:string;message:string}`.
- Produces: `validateIssuanceBatch(input): string[]` with 1-100 unique UUIDs internally.

- [ ] **Step 1: Write failing contract tests**

```ts
test('batch validation bounds and deduplicates internal ids',()=>{
 assert.deepEqual(validateIssuanceBatch({billingCycleIds:[id,id]}),[id]);
 assert.throws(()=>validateIssuanceBatch({billingCycleIds:[]}),/อย่างน้อย 1 รายการ/);
});

test('result exposes labels and document number but not ids',()=>{
 assert.equal(JSON.stringify(displayResult(row)).includes(row.id),false);
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/billing/issuance-approval.spec.ts`  
Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement the batch validator and result types**

```ts
export type IssuanceLabel={period:string;customer:string;site:string};
export type IssuanceApprovalResult={label:IssuanceLabel;status:'issued'|'already_issued'|'failed';documentNumber?:string;message:string};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateIssuanceBatch(input:unknown):string[]{
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>key!=='billingCycleIds'))throw new BadRequestException('ข้อมูลอนุมัติไม่ถูกต้อง');
 const raw=(input as {billingCycleIds?:unknown}).billingCycleIds;
 if(!Array.isArray(raw)||raw.length<1||raw.length>100||raw.some(value=>typeof value!=='string'||!UUID.test(value)))throw new BadRequestException('เลือกใบวางบิล 1 ถึง 100 รายการ');
 return [...new Set(raw as string[])];
}
```

- [ ] **Step 4: Run API-contract and focused tests**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/billing/issuance-approval.spec.ts`  
Run: `pnpm --filter @solar/api-contracts lint`  
Expected: PASS.

- [ ] **Step 5: Commit the issuance contract**

```bash
git add packages/api-contracts/src apps/api/src/modules/billing/issuance-approval.ts apps/api/src/modules/billing/issuance-approval.spec.ts
git commit -m "feat: define issuance approval contract"
```

### Task 2: Make draft preparation stop before official issuance

**Files:**
- Create: `infra/migrations/059_billing_issuance_approval.sql`
- Modify: `apps/api/src/modules/billing/financial-application.service.ts`
- Modify: `apps/api/src/modules/billing/local-financial-application.spec.ts`
- Modify: `apps/api/src/modules/billing/financial-application.postgres.spec.ts`

**Interfaces:**
- Produces: `prepareInvoice(id:string,actorId?:string): Promise<{cycle:BillingCycle;created:boolean}>`.
- Preserves: `issueInvoice` only as a compatibility wrapper that delegates to approval when explicitly called by an authorized approval route; scheduler/manual paths stop calling it.

- [ ] **Step 1: Write failing draft-boundary tests**

```ts
test('preparing a bill creates no number, document, artifact, or delivery',async()=>{
 const result=await service.prepareInvoice('cycle','actor');
 assert.equal(result.cycle.status,'pending_issue_approval');
 assert.equal(writes.documents,0);assert.equal(writes.artifacts,0);assert.equal(writes.outbox,0);
});
```

- [ ] **Step 2: Run focused service tests**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/billing/local-financial-application.spec.ts`  
Expected: FAIL because preparation currently issues immediately.

- [ ] **Step 3: Implement the explicit preparation transition**

```ts
async prepareInvoice(id:string,actorId?:string){
 return this.db.transaction(async client=>{
  const cycle=(await client.query('SELECT * FROM billing_cycles WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!cycle)throw new NotFoundException('ไม่พบรอบบิล');
  await this.readiness.assertEnabled('issue',{billingCycleId:id},client);
  if(cycle.quality!=='complete'||!cycle.meter_snapshot)throw new ConflictException('ข้อมูลรอบบิลยังไม่พร้อมตรวจอนุมัติ');
  const updated=(await client.query("UPDATE billing_cycles SET status='pending_issue_approval' WHERE id=$1 AND status IN('pending_review','draft','rejected') RETURNING *",[id])).rows[0]??cycle;
  await this.audit(client,actorId,'finance.invoice_prepared',id,{status:updated.status});
  return {cycle:updated,created:cycle.status!==updated.status};
 });
}
```

Add durable replacement-draft storage used by Task 6:

```sql
CREATE TABLE billing_replacement_drafts (
  id uuid PRIMARY KEY,
  billing_cycle_id uuid NOT NULL REFERENCES billing_cycles(id),
  supersedes_document_id uuid NOT NULL REFERENCES documents(id),
  rate numeric(20,8) NOT NULL,
  amount numeric(24,8) NOT NULL,
  snapshot jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('pending_issue_approval','issued','cancelled')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX billing_replacement_one_pending
  ON billing_replacement_drafts(billing_cycle_id)
  WHERE status='pending_issue_approval';
```

- [ ] **Step 4: Run local and PostgreSQL financial tests**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/billing/local-financial-application.spec.ts src/modules/billing/financial-application.postgres.spec.ts`  
Expected: PASS with updated expectations.

- [ ] **Step 5: Commit the draft boundary**

```bash
git add infra/migrations/059_billing_issuance_approval.sql apps/api/src/modules/billing/financial-application.service.ts apps/api/src/modules/billing/local-financial-application.spec.ts apps/api/src/modules/billing/financial-application.postgres.spec.ts
git commit -m "feat: require approval before invoice issuance"
```

### Task 3: Issue one invoice atomically with the approver snapshot

**Files:**
- Modify: `apps/api/src/modules/billing/financial-application.service.ts`
- Modify: `apps/api/src/modules/billing/financial-application.postgres.spec.ts`
- Modify: `apps/api/src/modules/documents/financial-document-pdf.ts`
- Modify: `apps/api/src/modules/documents/signature-snapshot.spec.ts`
- Modify: `apps/api/src/modules/documents/document-layout.ts`
- Modify: `apps/api/src/modules/documents/document-layout.spec.ts`

**Interfaces:**
- Consumes: `DocumentIdentityService.resolve(client, actorId)`.
- Produces: `approveInvoice(id:string,actorId:string): Promise<{created:boolean;document:Document}>`.
- Snapshot field: `approver:{userId:string;displayName:string;position:string;signatureDataUri?:string;approvedAt:string}`.

- [ ] **Step 1: Write failing signed and unsigned snapshot tests**

```ts
assert.deepEqual(financialDocumentSnapshot(saved).signatories.issuer,{name:'สมชาย ใจดี',title:'กรรมการบริษัท',signatureDataUri:png});
assert.deepEqual(financialDocumentSnapshot(unsigned).signatories.issuer,{name:'สมหญิง ใจดี',title:'ผู้จัดการฝ่ายบัญชี'});
```

- [ ] **Step 2: Run document tests and confirm old company signer behavior fails**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/documents/signature-snapshot.spec.ts src/modules/documents/document-layout.spec.ts`  
Expected: FAIL because adapter still reads `company.signatory_*`.

- [ ] **Step 3: Resolve identity before number allocation and save it in the snapshot**

```ts
const identity=await this.documentIdentity.resolve(client,actorId);
const approver={...identity,approvedAt:(await client.query("SELECT now() AS value")).rows[0].value.toISOString()};
const snapshot={...financialFacts,approver};
```

- [ ] **Step 4: Require `pending_issue_approval`, preserve idempotency, and render from `snapshot.approver`**

```ts
if(existing.length)return {created:false,document:existing[0]};
if(cycle.status!=='pending_issue_approval')throw new ConflictException('ใบวางบิลรายการนี้ยังไม่พร้อมอนุมัติออกเอกสาร');
```

- [ ] **Step 5: Run snapshot, layout, local, and PostgreSQL tests**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/documents/signature-snapshot.spec.ts src/modules/documents/document-layout.spec.ts src/modules/billing/local-financial-application.spec.ts src/modules/billing/financial-application.postgres.spec.ts`  
Expected: PASS, including one document under replay/concurrency.

- [ ] **Step 6: Commit atomic single approval**

```bash
git add apps/api/src/modules/billing/financial-application.service.ts apps/api/src/modules/billing/financial-application.postgres.spec.ts apps/api/src/modules/documents
git commit -m "feat: snapshot invoice approver identity"
```

### Task 4: Add authorized single and partial-success bulk endpoints

**Files:**
- Modify: `apps/api/src/modules/billing/billing.controller.ts`
- Modify: `apps/api/src/modules/billing/issuance-approval.ts`
- Modify: `apps/api/src/modules/billing/issuance-approval.spec.ts`
- Modify: `apps/api/src/common/auth/domain-route-policy.ts`
- Modify: `apps/api/src/common/auth/domain-route-policy.spec.ts`

**Interfaces:**
- Produces: `POST /v1/billing-cycles/:id/approve-issuance`.
- Produces: `POST /v1/billing-cycles/approve-issuance` with `{billingCycleIds:string[]}`.

- [ ] **Step 1: Write failing route-policy and batch-result tests**

```ts
assert.equal(permissionForRoute('POST','/v1/billing-cycles/a/approve-issuance'),'business.billing.approve');
assert.equal(permissionForRoute('POST','/v1/billing-cycles/approve-issuance'),'business.billing.approve');
```

- [ ] **Step 2: Run the focused tests**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/common/auth/domain-route-policy.spec.ts src/modules/billing/issuance-approval.spec.ts`  
Expected: FAIL because routes/batch orchestration are missing.

- [ ] **Step 3: Implement single and ordered batch endpoints**

```ts
@Post('billing-cycles/approve-issuance')
async approveMany(@Body() body:unknown,@Req() req:{user?:ScopedActor}){
 const ids=validateIssuanceBatch(body),results:IssuanceApprovalResult[]=[];
 for(const id of ids){results.push(await this.financial.approveInvoiceResult(id,req.user!.id));}
 return {results};
}
```

Declare the static batch route before `billing-cycles/:id/approve-issuance` so Nest never interprets `approve-issuance` as an ID.

- [ ] **Step 4: Ensure failures are mapped from authorized records to labels**

```ts
const label=(await this.db.query(`SELECT to_char(b.period_end,'YYYY-MM') AS period,c.name AS customer,s.name AS site
 FROM billing_cycles b JOIN sites s ON s.id=b.site_id JOIN customers c ON c.id=s.customer_id
 WHERE b.id=$1 AND ($2::uuid[] IS NULL OR s.id=ANY($2::uuid[]))`,[id,siteScope(actor,'business')])).rows[0];
if(!label)return {label:{period:'—',customer:'รายการที่ไม่สามารถเข้าถึงได้',site:'—'},status:'failed',message:'ไม่สามารถออกเอกสารได้'};
```

- [ ] **Step 5: Run authorization and billing tests**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/common/auth/domain-route-policy.spec.ts src/modules/billing/issuance-approval.spec.ts src/modules/billing/financial-domain-permissions.spec.ts`  
Expected: PASS.

- [ ] **Step 6: Commit approval endpoints**

```bash
git add apps/api/src/modules/billing/billing.controller.ts apps/api/src/modules/billing/issuance-approval.ts apps/api/src/modules/billing/issuance-approval.spec.ts apps/api/src/common/auth/domain-route-policy.ts apps/api/src/common/auth/domain-route-policy.spec.ts
git commit -m "feat: add bulk invoice issuance approval"
```

### Task 5: Snapshot the payment reviewer on receipts

**Files:**
- Modify: `apps/api/src/modules/billing/financial-application.service.ts`
- Modify: `apps/api/src/modules/billing/financial-application.postgres.spec.ts`
- Modify: `apps/api/src/modules/billing/payment-evidence-review.spec.ts`
- Modify: `apps/api/src/modules/documents/signature-snapshot.spec.ts`

**Interfaces:**
- Consumes the actor already passed to `verifyPayment`.
- Produces receipt snapshots whose `approver` belongs to the settling reviewer.

- [ ] **Step 1: Write a failing invoice-reviewer versus receipt-reviewer test**

```ts
assert.equal(invoice.snapshot.approver.displayName,'ผู้อนุมัติใบวางบิล');
assert.equal(receipt.snapshot.approver.displayName,'ผู้ตรวจหลักฐาน');
assert.notEqual(receipt.snapshot.approver.userId,invoice.snapshot.approver.userId);
```

- [ ] **Step 2: Run the focused PostgreSQL test**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/billing/financial-application.postgres.spec.ts`  
Expected: FAIL because receipt inherits invoice company signer data.

- [ ] **Step 3: Resolve the reviewer when settlement creates a receipt**

```ts
const receipt=settled?await this.issue(client,cycle,'receipt',actorId):null;
const reviewer=settled?await this.documentIdentity.resolve(client,actorId):null;
const receiptSnapshot=receipt?{...receipt.snapshot,approver:{...reviewer,approvedAt:new Date().toISOString()}}:null;
```

- [ ] **Step 4: Run payment, snapshot, and PostgreSQL tests**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/billing/payment-evidence-review.spec.ts src/modules/documents/signature-snapshot.spec.ts src/modules/billing/financial-application.postgres.spec.ts`  
Expected: PASS.

- [ ] **Step 5: Commit receipt reviewer snapshots**

```bash
git add apps/api/src/modules/billing/financial-application.service.ts apps/api/src/modules/billing/financial-application.postgres.spec.ts apps/api/src/modules/billing/payment-evidence-review.spec.ts apps/api/src/modules/documents/signature-snapshot.spec.ts
git commit -m "feat: snapshot receipt reviewer identity"
```

### Task 6: Stop scheduler/manual/correction paths at approval

**Files:**
- Modify: `apps/api/src/modules/billing/financial-scheduler.ts`
- Modify: `apps/api/src/modules/billing/financial-scheduler.spec.ts`
- Modify: `apps/api/src/modules/billing/financial-application.service.ts`
- Modify: `apps/api/src/modules/billing/site-billing.service.ts`
- Modify: `apps/api/src/modules/billing/site-billing.service.spec.ts`

**Interfaces:**
- Scheduler/manual create or reuse `pending_issue_approval` drafts.
- Correction creates a pending replacement while current issued invoice remains current.

- [ ] **Step 1: Write failing scheduler/manual/correction tests**

```ts
assert.equal(jobResult.status,'pending_issue_approval');
assert.equal(deliveryCalls,0);
assert.equal(manual.document,undefined);
assert.equal(currentInvoice.is_current,true);
assert.equal(replacement.status,'pending_issue_approval');
```

- [ ] **Step 2: Run focused tests and confirm automatic issuance failures**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/billing/financial-scheduler.spec.ts src/modules/billing/site-billing.service.spec.ts`  
Expected: FAIL because current flows issue/send immediately.

- [ ] **Step 3: Replace scheduler and manual issue/send calls with preparation**

```ts
for(const cycle of cycles){
 await this.application.prepareInvoice(cycle.id);
 await this.notifyAwaitingApproval(cycle);
}
```

- [ ] **Step 4: Make correction approval supersede only inside the approval transaction**

```ts
const replacement=(await client.query(`INSERT INTO billing_replacement_drafts(id,billing_cycle_id,supersedes_document_id,rate,amount,snapshot,status,created_by)
 VALUES($1,$2,$3,$4,$5,$6::jsonb,'pending_issue_approval',$7) RETURNING *`,[randomUUID(),cycle.id,current.id,rate,totals.total,JSON.stringify(snapshot),actorId])).rows[0];

const prior=(await client.query("SELECT * FROM documents WHERE id=$1 AND is_current FOR UPDATE",[replacement.supersedes_document_id])).rows[0];
const issued=await this.persistApprovedInvoice(client,replacement,actorId);
await client.query("UPDATE documents SET status='superseded',is_current=false WHERE id=$1",[prior.id]);
return issued;
```

- [ ] **Step 5: Run scheduler, correction, and financial tests**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/billing/financial-scheduler.spec.ts src/modules/billing/site-billing.service.spec.ts src/modules/billing/local-financial-application.spec.ts`  
Expected: PASS.

- [ ] **Step 6: Commit human-gated automation**

```bash
git add apps/api/src/modules/billing/financial-scheduler.ts apps/api/src/modules/billing/financial-scheduler.spec.ts apps/api/src/modules/billing/financial-application.service.ts apps/api/src/modules/billing/site-billing.service.ts apps/api/src/modules/billing/site-billing.service.spec.ts
git commit -m "feat: queue bills for issuance approval"
```

### Task 7: Verify finance persistence and PDF regressions

**Files:**
- Modify only files owned above when a regression is confirmed.

**Interfaces:**
- Produces the stable API consumed by the billing UI plan.

- [ ] **Step 1: Run the complete billing test directory**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/billing/*.spec.ts`  
Expected: PASS.

- [ ] **Step 2: Run the complete document test directory**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/documents/*.spec.ts`  
Expected: PASS.

- [ ] **Step 3: Run API lint**

Run: `pnpm --filter @solar/api lint`  
Expected: PASS.

- [ ] **Step 4: Inspect user-visible response fixtures for internal IDs**

Run: `rg -n "billingCycleId|userId|positionId|[0-9a-f]{8}-[0-9a-f]{4}" apps/api/src/modules/billing/*spec.ts`  
Expected: internal assertions may use IDs, but serialized batch messages/labels do not contain them.

- [ ] **Step 5: Commit verification fixes, if any**

```bash
git add apps/api/src/modules/billing apps/api/src/modules/documents apps/api/src/common/auth packages/api-contracts/src
git commit -m "test: verify billing issuance approval"
```

