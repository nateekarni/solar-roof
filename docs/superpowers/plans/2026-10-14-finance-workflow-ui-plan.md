# Finance Workflow UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify finance readiness, show company branding without company signer controls, and make pending billing statements easy to find and approve singly or in batches without exposing internal IDs.

**Architecture:** Keep the generic operations table but add billing-specific status tabs and selection orchestration through focused components instead of embedding more state in the already-large table file. Server queries expose a single display-status filter and scoped tab counts. Readiness is transformed into grouped missing steps before rendering.

**Tech Stack:** React 19, Next.js 16, TanStack Table, cmdk/Radix UI, Tailwind CSS, NestJS operation queries, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-14-approver-signature-and-billing-issuance-design.md`

## Global Constraints

- Depends on both earlier implementation plans.
- Company card shows company facts and logo only, with a document-use badge.
- Finance readiness shows progress plus missing grouped steps only.
- Billing status dropdowns are removed and replaced by URL-backed tabs below search/date controls.
- Checkbox selection is page-scoped, eligible-row-only, and resets when query/page changes.
- Bulk results use period, customer, site, amount, and document number; never UUIDs.
- Mobile cards retain complete facts and accessible selection.
- Thai/English copy is explicit; raw status keys never render as fallback text.

## File Structure

- Modify `apps/api/src/modules/financial-readiness/financial-readiness.service.ts`: remove company signer/signature requirements.
- Modify `apps/api/src/modules/financial-readiness/financial-configuration.ts`: exclude deprecated signer fields from approval hash.
- Modify readiness API specs.
- Create `apps/web/features/settings/readiness-steps.ts`: group and order missing items.
- Create `apps/web/features/settings/readiness-steps.spec.ts`: transformation coverage.
- Modify `apps/web/features/settings/finance-readiness-card.tsx`: step-card UI.
- Modify `apps/web/features/settings/finance-readiness-card.spec.tsx`: compact rendering.
- Modify `apps/web/app/(app)/settings/company/page.tsx`: logo display, badge, signer removal.
- Modify `apps/web/features/settings/company-logo-field.spec.tsx`: display/edit coverage.
- Modify `packages/api-contracts/src/operation-filters.ts`: remove billing status dropdown definition.
- Modify `packages/api-contracts/src/operations.ts`: add `billingStatusView` query and optional billing facets on `OperationPage`.
- Modify `apps/api/src/modules/dashboard/operation-query.ts`: map user-facing status tabs.
- Modify `apps/api/src/modules/dashboard/operations.service.ts`: tab counts and pending status.
- Modify related operation-query/operations specs.
- Create `apps/web/features/billing/billing-status-tabs.tsx`: accessible URL-backed tabs.
- Create `apps/web/features/billing/billing-status-tabs.spec.tsx`: labels/counts/a11y.
- Create `apps/web/features/billing/billing-selection.ts`: selection reducer.
- Create `apps/web/features/billing/billing-selection.spec.ts`: reset/eligibility coverage.
- Create `apps/web/features/billing/billing-bulk-approval.tsx`: confirm/result UI.
- Create `apps/web/features/billing/billing-bulk-approval.spec.tsx`: readable output coverage.
- Create `apps/web/features/billing/billing-issuance-review.tsx`: single-row review and approval UI.
- Create `apps/web/features/billing/billing-issuance-review.spec.tsx`: readable facts and approver preview.
- Modify `apps/web/features/billing/billing-detail-modal.tsx`: embed the pending-issuance review.
- Modify `apps/web/features/shared/operation-query-table.tsx`: billing toolbar layout and tab query.
- Modify `apps/web/features/shared/operation-table.tsx`: inject billing checkbox/bulk UI.
- Modify `apps/web/features/shared/operation-card-list.tsx`: mobile selection.
- Modify shared operation tests and status badge mapping.

---

### Task 1: Remove company signer configuration and show the company logo

**Files:**
- Modify: `apps/api/src/modules/settings/settings.service.ts`
- Modify: `apps/api/src/modules/settings/company-signatory.spec.ts`
- Modify: `apps/web/app/(app)/settings/company/page.tsx`
- Modify: `apps/web/features/settings/company-logo-field.spec.tsx`

**Interfaces:**
- Company settings response/write fields contain company identity and `logoUrl`, but not editable signer/signature fields.

- [ ] **Step 1: Write failing API and UI tests**

```ts
assert.equal('signatoryName' in response,false);
assert.equal('signatoryTitle' in response,false);
assert.equal('signatureDataUri' in response,false);
```

```tsx
assert.match(html,/ใช้ในเอกสารที่ออกจากระบบ/);
assert.match(html,/alt="โลโก้บริษัท"/);
assert.doesNotMatch(html,/ชื่อผู้ลงนาม|ตำแหน่งผู้ลงนาม|ลายเซ็นบริษัท/);
```

- [ ] **Step 2: Run focused tests and confirm old fields fail**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/settings/company-signatory.spec.ts`  
Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/settings/company-logo-field.spec.tsx`  
Expected: FAIL because the old company signer UI/API remains.

- [ ] **Step 3: Remove signer fields from new reads/writes and render the logo in view mode**

```tsx
<Badge variant="secondary">{th?'ใช้ในเอกสารที่ออกจากระบบ เช่น ใบวางบิล':'Used on system-generated documents, such as billing statements'}</Badge>
{company.logoUrl?<img src={company.logoUrl} alt={th?'โลโก้บริษัท':'Company logo'} className="max-h-24 max-w-48 object-contain"/>:<p>{th?'ยังไม่ได้อัปโหลดโลโก้':'No logo uploaded'}</p>}
```

- [ ] **Step 4: Run settings tests and lint**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/settings/*.spec.ts`  
Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/settings/*.spec.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit company-card cleanup**

```bash
git add apps/api/src/modules/settings apps/web/app/(app)/settings/company/page.tsx apps/web/features/settings/company-logo-field.spec.tsx
git commit -m "feat: simplify company document identity"
```

### Task 2: Convert finance readiness into missing-step cards

**Files:**
- Modify: `apps/api/src/modules/financial-readiness/financial-readiness.service.ts`
- Modify: `apps/api/src/modules/financial-readiness/financial-configuration.ts`
- Modify: `apps/api/src/modules/financial-readiness/financial-readiness.service.spec.ts`
- Modify: `apps/api/src/modules/financial-readiness/financial-configuration.spec.ts`
- Create: `apps/web/features/settings/readiness-steps.ts`
- Create: `apps/web/features/settings/readiness-steps.spec.ts`
- Modify: `apps/web/features/settings/finance-readiness-card.tsx`
- Modify: `apps/web/features/settings/finance-readiness-card.spec.tsx`

**Interfaces:**
- Produces: `groupMissingReadiness(status,locale): ReadinessStep[]` where each step has `title`, `description`, `destination`, and `items`.
- Produces capability `approve_invoice` only when the actor has `business.billing.approve` and the financial action is available.

- [ ] **Step 1: Write failing readiness-domain tests**

```ts
assert.equal(items.some(item=>item.id==='company.signatory'),false);
assert.equal(items.some(item=>item.id==='company.signature'),false);
assert.deepEqual(groupMissingReadiness(status,'th').map(step=>step.key),['company','owner-confirmation','environment']);
```

- [ ] **Step 2: Run focused API and web tests**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/financial-readiness/financial-configuration.spec.ts src/modules/financial-readiness/financial-readiness.service.spec.ts`  
Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/settings/readiness-steps.spec.ts features/settings/finance-readiness-card.spec.tsx`  
Expected: FAIL against the raw checklist.

- [ ] **Step 3: Remove deprecated signer inputs from readiness and approval hashing**

```ts
export function canonicalGlobalFinancialConfiguration(company:CompanyProfile,banks:CompanyBankAccount[]){
 return {company:{companyName:company.companyName,taxId:company.taxId,branch:company.branch,address:company.address,phone:company.phone,email:company.email,logoUrl:company.logoUrl},banks:canonicalBanks(banks)};
}
```

- [ ] **Step 4: Implement grouped missing-step transformation and compact rendering**

```tsx
const steps=groupMissingReadiness(status,locale);
const percent=status.total?Math.round(status.completed/status.total*100):100;
return <section><div role="progressbar" aria-valuemin={0} aria-valuemax={status.total} aria-valuenow={status.completed} className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{width:`${percent}%`}}/></div>{steps.map((step,index)=><ReadinessStepCard key={step.key} step={step} current={index===0}/>)}</section>;
```

- [ ] **Step 5: Run readiness tests and lint**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/financial-readiness/*.spec.ts`  
Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/settings/readiness-steps.spec.ts features/settings/finance-readiness-card.spec.tsx`  
Expected: PASS and completed item labels absent.

- [ ] **Step 6: Commit readiness step cards**

```bash
git add apps/api/src/modules/financial-readiness apps/web/features/settings/readiness-steps.ts apps/web/features/settings/readiness-steps.spec.ts apps/web/features/settings/finance-readiness-card.tsx apps/web/features/settings/finance-readiness-card.spec.tsx
git commit -m "feat: simplify finance readiness steps"
```

### Task 3: Add a single server-side billing status view and scoped counts

**Files:**
- Modify: `packages/api-contracts/src/operation-filters.ts`
- Modify: `packages/api-contracts/src/operations.ts`
- Modify: `apps/api/src/modules/dashboard/operation-query.ts`
- Modify: `apps/api/src/modules/dashboard/operations.service.ts`
- Modify: `apps/api/src/modules/dashboard/operation-query.spec.ts`
- Modify: `apps/api/src/modules/dashboard/operations.service.spec.ts`

**Interfaces:**
- Produces query `billingStatusView=all|pending_issue_approval|awaiting_payment|pending_verification|overdue|paid|unsuccessful`.
- Produces `OperationPage.facets.billingStatusCounts: Record<BillingStatusView,number>` under current search/date/site scope while preserving the existing summary-array response.

- [ ] **Step 1: Write failing query mapping tests**

```ts
assert.match(operationPredicate('billing',{billingStatusView:'pending_issue_approval'},params).join(' '),/pending_issue_approval/);
assert.throws(()=>parseOperationQuery('billing',{billingStatusView:'raw_database_value'}),/Invalid/);
```

- [ ] **Step 2: Run dashboard operation tests**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/dashboard/operation-query.spec.ts src/modules/dashboard/operations.service.spec.ts`  
Expected: FAIL because the query/count contract is missing.

- [ ] **Step 3: Remove billing status dropdown metadata and implement one derived status expression**

```ts
export type BillingStatusView='all'|'pending_issue_approval'|'awaiting_payment'|'pending_verification'|'overdue'|'paid'|'unsuccessful';
export interface OperationFacets{billingStatusCounts?:Partial<Record<BillingStatusView,number>>}
const billingViewStatus=`CASE
 WHEN b.status='pending_issue_approval' THEN 'pending_issue_approval'
 WHEN ${collectionStatus}='pending_review' THEN 'pending_verification'
 WHEN ${collectionStatus}='overdue' THEN 'overdue'
 WHEN ${collectionStatus}='paid' THEN 'paid'
 WHEN ${collectionStatus}='awaiting_payment' THEN 'awaiting_payment'
 ELSE 'unsuccessful' END`;
```

- [ ] **Step 4: Compute scoped counts from the same filtered source without the selected status predicate**

```ts
const facetQuery={...query,billingStatusView:undefined};
const facetPredicates=operationPredicate(resource,facetQuery,facetParams).join(' AND ')||'TRUE';
const counts=(await this.db.query(`SELECT "billingViewStatus" AS status,count(*)::int AS count FROM (${facetSource}) q WHERE ${facetPredicates} GROUP BY "billingViewStatus"`,facetParams)).rows;
const billingStatusCounts=Object.fromEntries(counts.map(row=>[row.status,row.count]));
return {...page,facets:{billingStatusCounts}};
```

- [ ] **Step 5: Run operation tests and contracts lint**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/dashboard/*.spec.ts`  
Run: `pnpm --filter @solar/api-contracts lint`  
Expected: PASS.

- [ ] **Step 6: Commit the status-view API**

```bash
git add packages/api-contracts/src apps/api/src/modules/dashboard
git commit -m "feat: add billing status tab query"
```

### Task 4: Render URL-backed billing status tabs below search controls

**Files:**
- Create: `apps/web/features/billing/billing-status-tabs.tsx`
- Create: `apps/web/features/billing/billing-status-tabs.spec.tsx`
- Modify: `apps/web/features/shared/operation-query-table.tsx`
- Modify: `apps/web/features/shared/operation-request-query.ts`
- Modify: `apps/web/features/shared/operation-request-query.spec.ts`
- Modify: `apps/web/lib/status-badge.tsx`

**Interfaces:**
- Consumes `billingStatusView` and `data.facets?.billingStatusCounts`.
- Produces `onValueChange(value)` updates that reset cursor.

- [ ] **Step 1: Write failing tab and URL tests**

```tsx
assert.match(html,/role="tablist"/);
assert.match(html,/รออนุมัติออกเอกสาร/);
assert.match(html,/รอตรวจหลักฐาน/);
assert.doesNotMatch(html,/pending_issue_approval/);
```

- [ ] **Step 2: Run focused tests**

Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/billing/billing-status-tabs.spec.tsx features/shared/operation-request-query.spec.ts`  
Expected: FAIL because tabs/query key are missing.

- [ ] **Step 3: Implement accessible, horizontally scrollable tabs**

```tsx
<Tabs value={value} onValueChange={onValueChange}>
 <TabsList aria-label={th?'สถานะใบวางบิล':'Billing statement status'} className="h-auto w-full justify-start overflow-x-auto">
  {tabs.map(tab=><TabsTrigger key={tab.value} value={tab.value}>{tab.label}<Badge>{counts[tab.value]??0}</Badge></TabsTrigger>)}
 </TabsList>
</Tabs>
```

- [ ] **Step 4: Split the billing toolbar into search/date row and status-tab row**

```tsx
const toolbar=<div className="space-y-3"><div className="flex flex-wrap gap-3">{search}{period}</div>{resource==='billing'&&<BillingStatusTabs .../>}</div>;
```

- [ ] **Step 5: Run toolbar, query, status, and lint checks**

Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/billing/billing-status-tabs.spec.tsx features/shared/operation-request-query.spec.ts features/shared/financial-display.spec.tsx`  
Run: `pnpm --filter @solar/web lint`  
Expected: PASS and no billing status `<select>` rendered.

- [ ] **Step 6: Commit billing tabs**

```bash
git add apps/web/features/billing/billing-status-tabs.tsx apps/web/features/billing/billing-status-tabs.spec.tsx apps/web/features/shared/operation-query-table.tsx apps/web/features/shared/operation-request-query.ts apps/web/features/shared/operation-request-query.spec.ts apps/web/lib/status-badge.tsx
git commit -m "feat: replace billing status filters with tabs"
```

### Task 5: Add page-scoped billing selection

**Files:**
- Create: `apps/web/features/billing/billing-selection.ts`
- Create: `apps/web/features/billing/billing-selection.spec.ts`
- Modify: `apps/web/features/shared/operation-table.tsx`
- Modify: `apps/web/features/shared/operation-card-list.tsx`
- Modify: `apps/web/features/shared/responsive-document-rows.spec.tsx`

**Interfaces:**
- Produces: `eligibleBillingRows(rows)` and a reducer with `toggle`, `togglePage`, and `reset`.
- Selection keys are internal only and never rendered.

- [ ] **Step 1: Write failing reducer tests**

```ts
assert.deepEqual(eligibleBillingRows(rows).map(row=>row.id),['pending-a']);
assert.deepEqual(reduceSelection(new Set(),{type:'togglePage',ids:['a','b']}),new Set(['a','b']));
assert.equal(reduceSelection(new Set(['a']),{type:'reset'}).size,0);
```

- [ ] **Step 2: Run selection tests**

Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/billing/billing-selection.spec.ts features/shared/responsive-document-rows.spec.tsx`  
Expected: FAIL because selection does not exist.

- [ ] **Step 3: Implement eligibility and page-reset state**

```ts
export const eligibleBillingRows=<T extends {id:string;status:unknown}>(rows:T[])=>rows.filter(row=>row.status==='pending_issue_approval');
```

- [ ] **Step 4: Add first-column desktop checkboxes and mobile-card checkboxes**

```tsx
<Checkbox aria-label={th?`เลือก ${row.period} ${row.customerName} ${row.siteName}`:`Select ${row.period} ${row.customerName} ${row.siteName}`} checked={selected.has(row.id)} onCheckedChange={()=>toggle(row.id)}/>
```

- [ ] **Step 5: Reset selection on query, sort, date, tab, and page changes**

```ts
React.useEffect(()=>dispatch({type:'reset'}),[query,cursor]);
```

- [ ] **Step 6: Run responsive and operation-table tests**

Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/billing/billing-selection.spec.ts features/shared/responsive-document-rows.spec.tsx features/shared/operation-columns.spec.ts`  
Expected: PASS.

- [ ] **Step 7: Commit selection UI**

```bash
git add apps/web/features/billing/billing-selection.ts apps/web/features/billing/billing-selection.spec.ts apps/web/features/shared/operation-table.tsx apps/web/features/shared/operation-card-list.tsx apps/web/features/shared/responsive-document-rows.spec.tsx
git commit -m "feat: select pending billing statements"
```

### Task 6: Add readable bulk approval confirmation and results

**Files:**
- Create: `apps/web/features/billing/billing-bulk-approval.tsx`
- Create: `apps/web/features/billing/billing-bulk-approval.spec.tsx`
- Create: `apps/web/features/billing/billing-issuance-review.tsx`
- Create: `apps/web/features/billing/billing-issuance-review.spec.tsx`
- Modify: `apps/web/features/billing/billing-detail-modal.tsx`
- Modify: `apps/web/features/shared/operation-table.tsx`
- Modify: `apps/web/features/shared/operation-query-table.tsx`

**Interfaces:**
- Consumes selected visible rows and `POST /v1/billing-cycles/approve-issuance`.
- Produces `onCompleted()` to reload rows/summary and clear selection.

- [ ] **Step 1: Write failing confirmation/result tests**

```tsx
assert.match(confirmHtml,/2026-09.*บริษัท ตัวอย่าง.*สำนักงานใหญ่/s);
assert.match(confirmHtml,/สมชาย ใจดี.*กรรมการบริษัท/s);
assert.doesNotMatch(confirmHtml,/[0-9a-f]{8}-[0-9a-f]{4}/i);
assert.match(resultHtml,/ออกเอกสารสำเร็จ 2 รายการ/);
assert.match(resultHtml,/ยังรออนุมัติ 1 รายการ/);
```

- [ ] **Step 2: Run focused component tests**

Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/billing/billing-bulk-approval.spec.tsx features/billing/billing-issuance-review.spec.tsx`  
Expected: FAIL because the component is missing.

- [ ] **Step 3: Implement the selected-count action bar and confirmation dialog**

```tsx
<div role="status" className="sticky bottom-4 flex items-center justify-between rounded-xl border bg-card p-3 shadow-lg">
 <span>{th?`เลือกแล้ว ${rows.length} รายการ`:`${rows.length} selected`}</span>
 <Button onClick={()=>setOpen(true)}>{th?'อนุมัติและออกเอกสาร':'Approve and issue'}</Button>
</div>
```

- [ ] **Step 4: Add single-row review to the billing detail modal**

```tsx
{data.status==='pending_issue_approval'&&capabilities.operationsActions?.includes('approve_invoice')&&<BillingIssuanceReview bill={{period:data.period,customerName:data.customerName,siteName:data.siteName,amount:data.amount,tax:data.simulatedTax,dueDate:data.dueDate}} approver={{displayName:user.displayName,position:user.companyPosition,hasSignature:user.hasSignature}} onApprove={()=>apiClient.post(`/v1/billing-cycles/${data.id}/approve-issuance`,{})}/>}
```

- [ ] **Step 5: Submit bounded IDs and render only server-derived labels/results**

```ts
const response=await apiClient.post<{results:IssuanceApprovalResult[]}>('/v1/billing-cycles/approve-issuance',{billingCycleIds:rows.map(row=>row.id)});
setResults(response.results);
```

- [ ] **Step 6: Reload data after partial success without hiding failures**

```ts
onCompleted({clearSelection:true,refresh:true});
setOpen(false);
setResultsOpen(true);
```

- [ ] **Step 7: Run billing/shared tests and lint**

Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/billing/*.spec.ts features/billing/*.spec.tsx features/shared/operation-*.spec.ts features/shared/operation-*.spec.tsx`  
Run: `pnpm --filter @solar/web lint`  
Expected: PASS.

- [ ] **Step 8: Commit single and bulk approval UI**

```bash
git add apps/web/features/billing/billing-bulk-approval.tsx apps/web/features/billing/billing-bulk-approval.spec.tsx apps/web/features/billing/billing-issuance-review.tsx apps/web/features/billing/billing-issuance-review.spec.tsx apps/web/features/billing/billing-detail-modal.tsx apps/web/features/shared/operation-table.tsx apps/web/features/shared/operation-query-table.tsx
git commit -m "feat: approve billing statements in batches"
```

### Task 7: End-to-end regression and human-language audit

**Files:**
- Modify only files above when a verified regression is found.

**Interfaces:**
- Produces the completed user workflow.

- [ ] **Step 1: Run API tests**

Run: `pnpm --filter @solar/api test`  
Expected: PASS.

- [ ] **Step 2: Run web tests**

Run: `pnpm --filter @solar/web test`  
Expected: PASS.

- [ ] **Step 3: Run workspace lint and build**

Run: `pnpm lint`  
Run: `pnpm build`  
Expected: PASS.

- [ ] **Step 4: Exercise the local flow on alternate ports**

Run the existing local stack on web `3100`, API `3101`, worker `3102`, and Mailpit `18049`. Log in as an authorized internal user, verify company logo display, upload/remove a personal signature, select and create staff positions, open each billing status tab, approve one bill, approve a mixed batch, and approve a payment that creates a receipt.

Expected: official numbers appear only after approval; invoice and receipt show the correct approving person; mixed batch reports both success and corrective failures; no page displays UUIDs.

- [ ] **Step 5: Search rendered copy sources for raw status/ID fallbacks**

Run: `rg -n "pending_issue_approval|billingCycleId|positionId|userId" apps/web --glob '*.tsx'`  
Expected: occurrences are state/transport code only; visible copy maps them to Thai/English labels and no JSX interpolates internal IDs.

- [ ] **Step 6: Run database-backed financial and PDF acceptance tests**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/billing/financial-application.postgres.spec.ts src/modules/documents/document-layout-regression.spec.ts src/modules/documents/document-reference.spec.ts`  
Expected: PASS.

- [ ] **Step 7: Commit final verification fixes, if any**

```bash
git add apps packages infra CONTEXT.md docs/superpowers/specs/2026-10-14-approver-signature-and-billing-issuance-design.md
git commit -m "test: verify approved finance workflow"
```
