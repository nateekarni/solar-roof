# Customer Mobile-first Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `customer_user` presentation with a polished, bill-first, mobile-app-style portal while preserving current routes, staff screens, authorization, payment evidence workflow, Thai/English support, and light/dark themes.

**Architecture:** Add a customer-only API projection and a dedicated `apps/web/features/customer/` presentation boundary. The API composes existing dashboard, operations, settings, document, and payment behavior without changing staff endpoint semantics. The web app switches shells and page compositions by authenticated role while continuing to share neutral primitives, locale/theme infrastructure, and the existing server-enforced site scope.

**Tech Stack:** pnpm/Turbo monorepo, Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, shadcn/Radix, TanStack Query, Recharts, next-themes, NestJS 12, PostgreSQL, Node test runner, Playwright, axe-core.

**Spec:** `docs/superpowers/specs/2026-10-18-customer-mobile-first-portal-design.md`; ADR `docs/adr/0047-dedicated-customer-presentation-boundary.md`.

## Global Constraints

- Keep public customer routes `/`, `/billing`, `/records/billing/:id`, and `/settings` unchanged.
- Do not restyle, restructure, or change response semantics for owner, admin, accountant, or operator workflows.
- Keep Solar Gold as the primary action color. Dark customer surfaces use the legacy neutral charcoal/black palette with no purple tint; staff tokens remain unchanged.
- Every customer label, status, validation error, empty state, and confirmation must have Thai and English keys.
- Support light and dark themes in every slice; respect `prefers-reduced-motion`.
- Keep server scope authoritative. A `customer_user` with no active single-site assignment receives no cross-customer data.
- Reuse the existing payment submission endpoint and financial transaction logic. Do not add card, direct debit, or automatic payment confirmation.
- Never recalculate authoritative money in the browser. Use persisted `subtotal`, `simulated_tax`, `amount`, approved payments, and a server-projected outstanding amount.
- Preserve the current evidence rules: JPG/PNG/PDF, at most 10 MB, positive amount, duplicate hash detection, and a pending-verification result after submission.
- Each task starts with a failing test, implements the smallest passing change, runs focused tests, then runs the stated regression check before commit.

---

## Task 1: Define the customer portal contracts and shared billing lifecycle projection

**Files:**
- Create: `packages/api-contracts/src/customer-portal.ts`
- Modify: `packages/api-contracts/src/index.ts`
- Modify: `packages/api-contracts/src/operations.ts`
- Create: `apps/api/src/modules/dashboard/billing-read-model.ts`
- Create: `apps/api/src/modules/dashboard/billing-read-model.spec.ts`
- Modify: `apps/api/src/modules/dashboard/operations.service.ts`
- Test: `apps/api/src/modules/dashboard/operations.service.spec.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Add table-driven tests proving that the shared SQL fragments retain the current public status ordering and never treat draft/cancelled/superseded cycles as payable. Include rows for `awaiting_payment`, `overdue`, `partially_paid`, `pending_verification`, `paid`, and `unsuccessful`.

```ts
test('billing lifecycle keeps pending evidence ahead of partial and overdue labels', async () => {
  const rows = await readProjectedFixtures();
  assert.equal(rows.pending.billingStatusView, 'pending_verification');
  assert.equal(rows.partial.billingStatusView, 'partially_paid');
  assert.equal(rows.overdue.billingStatusView, 'overdue');
  assert.equal(rows.paid.billingStatusView, 'paid');
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/dashboard/billing-read-model.spec.ts`

Expected: FAIL because `billing-read-model.ts` and its exported fragments do not exist.

- [ ] **Step 3: Add the typed public contracts**

Define canonical string money fields and customer-safe actions:

```ts
export type CustomerPortalRange = '7d' | '30d';
export type CustomerBillingStatus = Exclude<BillingStatusView, 'all' | 'pending_issue_approval'>;
export interface CustomerPortalBill {
  id: string;
  siteId: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  status: CustomerBillingStatus;
  consumedKwh: string | null;
  rate: string | null;
  subtotal: string;
  tax: string;
  billedAmount: string;
  approvedAmount: string;
  outstandingAmount: string;
  pendingEvidenceCount: number;
  rejectedEvidenceCount: number;
  canPay: boolean;
}
export interface CustomerPortalHomeResponse {
  range: CustomerPortalRange;
  site: { id: string; name: string; customerName: string } | null;
  focusedBill: CustomerPortalBill | null;
  additionalOpenBillCount: number;
  energySeries: Array<{ date: string; value: number | null; quality?: string }>;
  recentFinancialRecords: CustomerPortalBill[];
  capabilities: { canPay: boolean; canViewDocuments: boolean };
}
export interface CustomerPaymentInstructions {
  available: boolean;
  bankName?: string;
  bankCode?: string;
  accountName?: string;
  accountNumber?: string;
  branchName?: string;
  promptpayId?: string;
  qrCodeUrl?: string | null;
}
```

Export these types from `packages/api-contracts/src/index.ts`.

- [ ] **Step 4: Extract the current SQL lifecycle fragments without semantic changes**

Move `approvedAmount`, `daysOverdue`, `collectionStatus`, and `billingStatusView` from `operations.service.ts` to `billing-read-model.ts`. Keep the exact current SQL expressions and import them back into `OperationsService`. Add `subtotal`, `approvedAmount`, `outstandingAmount`, `pendingEvidenceCount`, and `rejectedEvidenceCount` to the existing billing SQL and as optional `BillingRow` fields. These are additive, server-calculated display values; do not change existing columns, filters, sorting, status, or staff actions.

- [ ] **Step 5: Run focused and contract checks**

Run:

```powershell
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/dashboard/billing-read-model.spec.ts src/modules/dashboard/operations.service.spec.ts
pnpm --filter @solar/api-contracts test
```

Expected: PASS; existing staff billing fixtures retain the same status values and pagination behavior.

- [ ] **Step 6: Commit**

```powershell
git add packages/api-contracts/src/customer-portal.ts packages/api-contracts/src/index.ts packages/api-contracts/src/operations.ts apps/api/src/modules/dashboard/billing-read-model.ts apps/api/src/modules/dashboard/billing-read-model.spec.ts apps/api/src/modules/dashboard/operations.service.ts apps/api/src/modules/dashboard/operations.service.spec.ts
git commit -m "feat(api): define customer portal billing contracts"
```

---

## Task 2: Add the scoped customer home projection

**Files:**
- Create: `apps/api/src/modules/customer-portal/customer-portal.module.ts`
- Create: `apps/api/src/modules/customer-portal/customer-portal.controller.ts`
- Create: `apps/api/src/modules/customer-portal/customer-portal.service.ts`
- Create: `apps/api/src/modules/customer-portal/focused-bill.ts`
- Create: `apps/api/src/modules/customer-portal/focused-bill.spec.ts`
- Create: `apps/api/src/modules/customer-portal/customer-portal.service.spec.ts`
- Modify: `apps/api/src/modules/dashboard/dashboard.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/common/auth/route-policy.ts`
- Modify: `apps/api/src/common/auth/route-policy.spec.ts`

- [ ] **Step 1: Write failing focused-bill and authorization tests**

Cover the approved priority exactly: oldest overdue, partially paid with balance, nearest due, pending verification, then no focused bill. Also prove the new endpoint is GET/HEAD-only and customer-only.

```ts
test('focuses the oldest overdue bill before every other open state', () => {
  assert.equal(selectFocusedBill([
    bill('partial', 'partially_paid', '2026-10-20'),
    bill('overdue-new', 'overdue', '2026-10-10'),
    bill('overdue-old', 'overdue', '2026-10-01'),
  ])?.id, 'overdue-old');
});

test('customer portal projection is customer read-only', () => {
  assert.equal(routeAllowed('customer_user', 'GET', '/v1/customer/portal/home?range=7d'), true);
  assert.equal(routeAllowed('customer_user', 'POST', '/v1/customer/portal/home'), false);
  assert.equal(routeAllowed('owner', 'GET', '/v1/customer/portal/home'), false);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/customer-portal/focused-bill.spec.ts src/common/auth/route-policy.spec.ts`

Expected: FAIL because the selector and route rule do not exist.

- [ ] **Step 3: Implement the endpoint and site-safe service composition**

Export `DashboardService` from `DashboardModule`; import `DashboardModule` into `CustomerPortalModule`. Add:

```ts
@Controller('v1/customer/portal')
@Roles('customer_user')
export class CustomerPortalController {
  @Get('home')
  home(@Req() req: { user: DashboardPrincipal }, @Query('range') range = '7d') {
    return this.portal.home(req.user, parseCustomerPortalRange(range));
  }
}
```

`CustomerPortalService.home` must:

1. reject missing or non-customer principals;
2. derive the single assigned site through the existing server-owned scope helpers;
3. call `DashboardService.getSummary` for the selected 7- or 30-day Bangkok date range;
4. run one scoped billing query using the shared lifecycle fragments, returning only payable candidates plus the three latest records;
5. select the focused bill with the pure selector;
6. return `additionalOpenBillCount` without merging bills;
7. return no site/bill data when assignment is absent.

Use `b.subtotal`, `b.simulated_tax`, `b.amount`, paid payment sums, and `greatest(b.amount - approved, 0)` in SQL. Keep money as decimal strings.

- [ ] **Step 4: Add service tests for query scope and output shape**

Assert every customer billing query receives the server-derived site ID and active user assignment, recent records are capped at three, 7d/30d validation rejects other values, and no technical gateway/device fields are serialized.

- [ ] **Step 5: Run API tests**

Run:

```powershell
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/customer-portal/*.spec.ts src/common/auth/route-policy.spec.ts src/modules/dashboard/dashboard.service.spec.ts src/modules/dashboard/operations.service.spec.ts
pnpm --filter @solar/api lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/customer-portal apps/api/src/modules/dashboard/dashboard.module.ts apps/api/src/app.module.ts apps/api/src/common/auth/route-policy.ts apps/api/src/common/auth/route-policy.spec.ts
git commit -m "feat(api): add scoped customer home projection"
```

---

## Task 3: Add the safe payment-instructions projection

**Files:**
- Modify: `apps/api/src/modules/customer-portal/customer-portal.module.ts`
- Modify: `apps/api/src/modules/customer-portal/customer-portal.controller.ts`
- Modify: `apps/api/src/modules/customer-portal/customer-portal.service.ts`
- Create: `apps/api/src/modules/customer-portal/payment-instructions.spec.ts`
- Modify: `apps/api/src/common/auth/route-policy.spec.ts`

- [ ] **Step 1: Write a failing projection test**

Prove that only the enabled default configured account is returned, and management-only fields (`id`, `isDefault`, `isConfigured`, `createdAt`, `updatedAt`) are absent.

```ts
test('payment instructions expose one configured default without management metadata', async () => {
  const value = await service.paymentInstructions(customer);
  assert.deepEqual(value, {
    available: true,
    bankName: 'Example Bank',
    bankCode: 'EX',
    accountName: 'Solar Roof',
    accountNumber: '123-4-56789-0',
    branchName: 'Head Office',
    promptpayId: '0100000000000',
    qrCodeUrl: '/assets/qr.png',
  });
  assert.equal('id' in value, false);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/customer-portal/payment-instructions.spec.ts`

Expected: FAIL because the method and route are absent.

- [ ] **Step 3: Implement the customer-only safe projection**

Import `SettingsModule`, call `SettingsService.listBankAccounts()`, choose the configured default, and map only `CustomerPaymentInstructions` fields. Return `{available:false}` when none is configured. Add `GET /v1/customer/portal/payment-instructions` and allow only customer GET/HEAD in the route policy.

- [ ] **Step 4: Run focused API and regression tests**

Run:

```powershell
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/customer-portal/*.spec.ts src/common/auth/route-policy.spec.ts src/modules/settings/company-finance-mutation.spec.ts
pnpm --filter @solar/api lint
```

Expected: PASS; existing owner bank-account management behavior remains unchanged.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/customer-portal apps/api/src/common/auth/route-policy.spec.ts
git commit -m "feat(api): expose safe customer payment instructions"
```

---

## Task 4: Create the customer shell, semantic theme tokens, and translation namespace

**Files:**
- Create: `apps/web/features/customer/shell/customer-app-shell.tsx`
- Create: `apps/web/features/customer/shell/customer-top-nav.tsx`
- Create: `apps/web/features/customer/shell/customer-bottom-nav.tsx`
- Create: `apps/web/features/customer/shell/customer-app-shell.spec.tsx`
- Modify: `apps/web/app/(app)/layout.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `packages/i18n/src/th.ts`
- Modify: `packages/i18n/src/en.ts`
- Create: `packages/i18n/src/customer-portal.spec.ts`

- [ ] **Step 1: Write failing shell and locale tests**

Render the shell in Thai and English and assert navigation labels and unchanged hrefs. Add a dictionary parity walk for the new `customerPortal` namespace.

```ts
test('customer shell keeps the approved three destinations', () => {
  const html = renderToStaticMarkup(<CustomerAppShell locale="th"><div>content</div></CustomerAppShell>);
  assert.match(html, /หน้าแรก/);
  assert.match(html, /เอกสาร/);
  assert.match(html, /บัญชี/);
  for (const href of ['/', '/billing', '/settings']) assert.match(html, new RegExp(`href="${href}"`));
  assert.doesNotMatch(html, /sidebar/);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/customer/shell/customer-app-shell.spec.tsx`

Expected: FAIL because the customer shell does not exist.

- [ ] **Step 3: Add customer semantic tokens**

In `globals.css`, scope tokens under `.customer-portal` and `.dark .customer-portal`. Use Solar Gold for action, keep the approved warm light-theme contrast, and use legacy neutral charcoal/black hero and elevated surfaces in dark mode. Retain semantic success/warning/destructive tokens and chart colors with WCAG AA foregrounds. Add safe-area padding and reduced-motion rules without altering staff token values.

- [ ] **Step 4: Implement the role-aware shell switch**

Keep the current `LocaleProvider`, `SessionUserProvider`, and `SiteSelectionProvider`. For `user?.role === 'customer_user'`, render `CustomerAppShell`; otherwise render the current `SidebarProvider`/`AppSidebar`/`AppHeader`/`MobileBottomNav` tree byte-for-byte in behavior.

- [ ] **Step 5: Add complete translation groups**

Create matching `customerPortal.shell`, `home`, `billing`, `record`, `payment`, `account`, `status`, `validation`, and `common` keys in Thai and English. Do not add paired language ternaries inside new customer components.

- [ ] **Step 6: Run web, i18n, and navigation regression tests**

Run:

```powershell
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/customer/shell/customer-app-shell.spec.tsx components/navigation/nav-config.spec.ts
pnpm --filter @solar/web lint
pnpm --filter @solar/i18n test
pnpm exec tsx --test packages/i18n/src/customer-portal.spec.ts
```

Expected: PASS; staff navigation assertions stay unchanged.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/features/customer/shell apps/web/app/(app)/layout.tsx apps/web/app/globals.css packages/i18n/src/th.ts packages/i18n/src/en.ts packages/i18n/src/customer-portal.spec.ts
git commit -m "feat(web): add customer portal shell and theme"
```

---

## Task 5: Implement the bill-first customer home

**Files:**
- Create: `apps/web/features/customer/api/customer-portal-api.ts`
- Create: `apps/web/features/customer/home/customer-home-page.tsx`
- Create: `apps/web/features/customer/home/current-bill-hero.tsx`
- Create: `apps/web/features/customer/home/bill-breakdown.tsx`
- Create: `apps/web/features/customer/home/customer-energy-chart.tsx`
- Create: `apps/web/features/customer/home/customer-energy-chart-renderer.tsx`
- Create: `apps/web/features/customer/home/recent-financial-records.tsx`
- Create: `apps/web/features/customer/home/customer-home-page.spec.tsx`
- Create: `apps/web/features/customer/home/customer-home-model.spec.ts`
- Modify: `apps/web/features/dashboard/dashboard.tsx`

- [ ] **Step 1: Write failing home-state tests**

Cover amount due, due date, itemized persisted subtotal/tax/total, additional-open-bill link, paid-up-to-date state, API failure, unavailable energy, latest three records, Thai/English labels, and status text not relying on color.

```tsx
test('home puts the actionable bill before chart and recent records', () => {
  const html = renderToStaticMarkup(<CustomerHomePage initial={fixture} locale="en" />);
  assert.ok(html.indexOf('Amount due') < html.indexOf('Energy production'));
  assert.ok(html.indexOf('Energy production') < html.indexOf('Recent documents'));
  assert.match(html, /Subtotal.*Tax.*Total/s);
  assert.match(html, /View all documents/);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/customer/home/*.spec.ts features/customer/home/*.spec.tsx`

Expected: FAIL because the customer home components and model are absent.

- [ ] **Step 3: Add the server API adapter**

`customer-portal-api.ts` must expose a server adapter using `serverFetch` and a relative client adapter for the interactive range switch. Both request `/v1/customer/portal/home?range=7d|30d`, preserve decimal strings, and normalize errors into the customer page states. The server adapter handles 401 through the existing redirect path. Neither adapter silently falls back to the old 100-row billing request.

- [ ] **Step 4: Build the customer home composition**

Implement the approved order and responsive layout. The light hero uses its warm contrast surface, the dark hero uses a neutral charcoal surface, and both use a Solar Gold CTA. The breakdown uses labeled rows, not metric tiles. The chart uses Recharts with keyboard/touch-friendly range controls, null gaps, localized tooltips, and reduced motion. Recent records are exactly the API-provided latest three.

- [ ] **Step 5: Switch only the customer branch in `Dashboard`**

Resolve the session user and locale before loading dashboard data. When the role is `customer_user`, call only the new customer-home adapter and return `CustomerHomePage`; remove the customer's current three-summary-call plus `limit=100` billing fetch. Load `getDashboardData` only inside the non-customer path and leave its staff output unchanged.

- [ ] **Step 6: Run focused and existing dashboard tests**

Run:

```powershell
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/customer/home/*.spec.ts features/customer/home/*.spec.tsx features/dashboard/customer-dashboard.spec.tsx features/dashboard/dashboard-layout.spec.ts
pnpm --filter @solar/web lint
```

Expected: PASS. The legacy `CustomerDashboard` test remains until Task 11 removes unreachable code.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/features/customer/api apps/web/features/customer/home apps/web/features/dashboard/dashboard.tsx
git commit -m "feat(web): deliver bill-first customer home"
```

---

## Task 6: Replace the customer documents table with responsive financial-record cards

**Files:**
- Create: `apps/web/features/customer/documents/customer-documents-page.tsx`
- Create: `apps/web/features/customer/documents/customer-document-filters.tsx`
- Create: `apps/web/features/customer/documents/customer-financial-record-card.tsx`
- Create: `apps/web/features/customer/documents/customer-documents-page.spec.tsx`
- Modify: `apps/web/app/(app)/billing/page.tsx`

- [ ] **Step 1: Write failing customer list tests**

Assert card presentation at all breakpoints, public lifecycle tabs, search/period query preservation, cursor “load more”, and links to `/records/billing/:id`. Assert staff roles still render `OperationPage`.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/customer/documents/customer-documents-page.spec.tsx`

Expected: FAIL because the customer page does not exist.

- [ ] **Step 3: Implement the customer list with the existing operation API**

Reuse `GET /v1/operations/billing` and its cursor/facets contract through a customer-owned adapter. Map only customer-visible states: all, awaiting payment, pending verification, partially paid, overdue, and paid. Each card shows period, invoice number, billed/approved/outstanding amounts, due date, evidence/receipt state, status text/icon, and capability-driven action.

- [ ] **Step 4: Branch by role in the route**

In `billing/page.tsx`, render `CustomerDocumentsPage` for `customer_user` and preserve the current `OperationPage` invocation for all staff roles.

- [ ] **Step 5: Run focused and staff regression tests**

Run:

```powershell
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/customer/documents/customer-documents-page.spec.tsx features/shared/operation-request-query.spec.ts features/shared/operation-cursor-history.spec.ts features/billing/billing-status-tabs.spec.tsx
pnpm --filter @solar/web lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/features/customer/documents apps/web/app/(app)/billing/page.tsx
git commit -m "feat(web): add customer document cards"
```

---

## Task 7: Build the customer financial-record detail and document viewer

**Files:**
- Create: `apps/web/features/customer/records/customer-financial-record-page.tsx`
- Create: `apps/web/features/customer/records/customer-record-status-header.tsx`
- Create: `apps/web/features/customer/records/customer-payment-progress.tsx`
- Create: `apps/web/features/customer/records/customer-document-timeline.tsx`
- Create: `apps/web/features/customer/records/customer-document-viewer.tsx`
- Create: `apps/web/features/customer/records/customer-financial-record-page.spec.tsx`
- Modify: `apps/web/app/(app)/records/[resource]/[id]/page.tsx`

- [ ] **Step 1: Write failing detail-state tests**

Cover awaiting payment, pending verification, partial payment, paid, overdue, and rejected evidence. Assert rejected evidence retains the previous attempt, shows the server reason, and exposes resubmission. Assert no staff approval/send controls appear for customers.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/customer/records/customer-financial-record-page.spec.tsx`

Expected: FAIL because customer record components are absent.

- [ ] **Step 3: Implement customer-owned record composition**

Reuse the scoped `/v1/operations/billing/records/:id` response and current document endpoints. Render status header, persisted breakdown, paid-versus-outstanding progress, chronological invoice/evidence/receipt timeline, and customer actions. Never expose review, issue, replacement, email, or verification controls.

- [ ] **Step 4: Implement responsive preview behavior**

Use a full-screen surface below 768 px and a wide Radix dialog above it. Images and PDFs show download; unavailable previews show a localized explanation plus download when a file exists. Retain focus trap and focus restoration.

- [ ] **Step 5: Branch the record route without changing staff behavior**

After `requirePageAccess`, return `CustomerFinancialRecordPage` only when `user.role === 'customer_user' && resource === 'billing'`. Keep the existing `RecordDetails` path for staff billing/receipts and every other resource.

- [ ] **Step 6: Run focused and shared detail regression tests**

Run:

```powershell
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/customer/records/customer-financial-record-page.spec.tsx features/billing/financial-detail-workspace.spec.tsx features/billing/payment-history.spec.tsx features/shared/record-detail-fields.spec.ts features/shared/original-document-preview.spec.tsx
pnpm --filter @solar/web lint
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/features/customer/records apps/web/app/(app)/records/[resource]/[id]/page.tsx
git commit -m "feat(web): add customer financial record experience"
```

---

## Task 8: Implement the four-step customer payment flow

**Files:**
- Create: `apps/web/features/customer/payment/customer-payment-flow.tsx`
- Create: `apps/web/features/customer/payment/payment-instructions-step.tsx`
- Create: `apps/web/features/customer/payment/payment-evidence-step.tsx`
- Create: `apps/web/features/customer/payment/payment-review-step.tsx`
- Create: `apps/web/features/customer/payment/payment-pending-step.tsx`
- Create: `apps/web/features/customer/payment/customer-evidence-picker.tsx`
- Create: `apps/web/features/customer/payment/customer-payment-model.ts`
- Create: `apps/web/features/customer/payment/customer-payment-model.spec.ts`
- Create: `apps/web/features/customer/payment/customer-payment-flow.spec.tsx`
- Modify: `apps/web/features/customer/home/current-bill-hero.tsx`
- Modify: `apps/web/features/customer/records/customer-financial-record-page.tsx`

- [ ] **Step 1: Write failing validation and state-machine tests**

Cover full amount default, explicit other amount, amount greater than outstanding, zero/negative amounts, future paid date, allowed MIME types, 10 MB limit, back-navigation persistence, pending double-submit prevention, duplicate-evidence conflict copy, and success ending at pending verification.

```ts
test('review cannot open with future date or excess partial amount', () => {
  assert.deepEqual(validatePaymentDraft({ amount: '1200', outstanding: '1000', paidAt: '2026-10-19' }, '2026-10-18'), {
    amount: 'customerPortal.validation.amountExceedsOutstanding',
    paidAt: 'customerPortal.validation.futurePaidDate',
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/customer/payment/*.spec.ts features/customer/payment/*.spec.tsx`

Expected: FAIL because the model and flow do not exist.

- [ ] **Step 3: Implement the payment state machine and evidence picker**

Build four explicit steps: instructions, transfer/evidence, review, pending verification. Mobile uses a full-screen surface; desktop uses a wide dialog. Mobile file input includes `accept="image/jpeg,image/png,application/pdf"` and `capture="environment"`; desktop also handles drag/drop. Provide preview, replace, remove, accessible error summary, and preserved form state.

- [ ] **Step 4: Connect existing submission behavior**

Read instructions from `/v1/customer/portal/payment-instructions`; submit to the existing `POST /v1/billing-cycles/:id/pay`. Keep `PaymentSubmission` metadata semantics. Disable while pending, map duplicate evidence conflicts to a specific localized error, and label completion as “awaiting verification,” never “paid.”

- [ ] **Step 5: Wire actions from home and detail**

Home and record CTAs open the same customer flow with the selected billing cycle. A rejected attempt opens resubmission with a fresh evidence field while keeping the rejected attempt visible in the timeline.

- [ ] **Step 6: Run focused and legacy payment regression tests**

Run:

```powershell
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/customer/payment/*.spec.ts features/customer/payment/*.spec.tsx features/billing/payment-dialog.spec.tsx
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/billing/payment-evidence-review.spec.ts src/modules/billing/payment-metadata-controller.spec.ts src/modules/billing/financial-application.postgres.spec.ts
pnpm --filter @solar/web lint
```

Expected: PASS; the server transaction and staff payment review flow are unchanged.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/features/customer/payment apps/web/features/customer/home/current-bill-hero.tsx apps/web/features/customer/records/customer-financial-record-page.tsx
git commit -m "feat(web): add guided customer payment flow"
```

---

## Task 9: Move customer organization and account settings into the customer boundary

**Files:**
- Create: `apps/web/features/customer/account/customer-account-page.tsx`
- Create: `apps/web/features/customer/account/customer-organization-card.tsx`
- Create: `apps/web/features/customer/account/customer-profile-card.tsx`
- Create: `apps/web/features/customer/account/customer-notification-card.tsx`
- Create: `apps/web/features/customer/account/customer-security-card.tsx`
- Create: `apps/web/features/customer/account/customer-account-page.spec.tsx`
- Modify: `apps/web/app/(app)/settings/page.tsx`
- Keep until cleanup: `apps/web/features/settings/customer-settings-view.tsx`

- [ ] **Step 1: Write failing visibility and behavior tests**

Assert read-only organization identity/address/tax information, editable display name/avatar where already permitted, existing notification preference behavior, password/2FA actions, and absence of staff/role/permission/bank/system/technical settings.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/customer/account/customer-account-page.spec.tsx`

Expected: FAIL because the new page is absent.

- [ ] **Step 3: Build customer-specific compositions over existing APIs**

Reuse the current profile, preference, password, two-factor, locale, and theme behaviors. The customer page may wrap neutral existing form primitives but must not reuse staff tab layout or management cards.

- [ ] **Step 4: Switch the customer settings branch**

Render `CustomerAccountPage` for `customer_user` and preserve the existing staff settings tree for every other role.

- [ ] **Step 5: Run focused and settings regressions**

Run:

```powershell
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/customer/account/customer-account-page.spec.tsx features/settings/customer-settings-view.spec.tsx features/settings/*.spec.tsx
pnpm --filter @solar/web lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/features/customer/account apps/web/app/(app)/settings/page.tsx
git commit -m "feat(web): add customer account experience"
```

---

## Task 10: Add end-to-end customer journeys, accessibility, and responsive regression gates

**Files:**
- Create: `apps/web/test/customer-portal.browser.test.mjs`
- Create: `apps/web/test/customer-portal-accessibility.browser.test.mjs`
- Modify: `apps/web/package.json`
- Modify: `scripts/ci/platform-check.sh`

- [ ] **Step 1: Write failing browser journeys with deterministic route fixtures**

Use the existing `openFixtureBrowser` transport pattern. Cover:

1. home → record → full payment → pending verification;
2. rejected evidence → reason → resubmit;
3. partial payment → remaining balance → second submission;
4. recent record → all documents → detail;
5. document preview fallback/download;
6. locale and theme switches;
7. account notification preference.

Run the layout assertions at viewport widths 390, 768, and 1280. At 390, assert `document.documentElement.scrollWidth === innerWidth`; verify 44 px primary touch targets and 16 px form text.

- [ ] **Step 2: Run the journeys and confirm failure**

Run: `pnpm --filter @solar/web exec node --test test/customer-portal.browser.test.mjs`

Expected: FAIL until all routes and test script wiring are available.

- [ ] **Step 3: Add axe and keyboard tests**

Scan home, documents, detail, payment steps, and account in Thai/light, Thai/dark, English/light, and English/dark. Verify focus order, dialog trap/restore, non-color status text, visible focus, reduced motion, and no serious/critical axe violations.

- [ ] **Step 4: Register the customer suite in CI**

Add explicit package scripts for the two browser files and call them from the browser-enabled CI phase. Do not mix customer screenshots/baselines into staff baselines.

- [ ] **Step 5: Run browser and staff financial regression suites**

Run:

```powershell
pnpm --filter @solar/web exec node --test test/customer-portal.browser.test.mjs test/customer-portal-accessibility.browser.test.mjs
pnpm --filter @solar/web exec node --test test/billing-selection.browser.test.mjs test/billing-approval.browser.test.mjs test/finance-copy-audit.browser.test.mjs
```

Expected: PASS with no page errors and no serious/critical accessibility violations.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/test/customer-portal.browser.test.mjs apps/web/test/customer-portal-accessibility.browser.test.mjs apps/web/package.json scripts/ci/platform-check.sh
git commit -m "test(web): cover customer portal journeys"
```

---

## Task 11: Remove unreachable legacy customer presentation and run the complete verification matrix

**Files:**
- Delete after reference audit: `apps/web/features/dashboard/customer-dashboard.tsx`
- Delete after reference audit: `apps/web/features/dashboard/customer-dashboard.spec.tsx`
- Delete after reference audit: `apps/web/features/dashboard/customer-production-chart.tsx`
- Delete after reference audit: `apps/web/features/dashboard/customer-production-chart-renderer.tsx`
- Delete after reference audit: `apps/web/features/settings/customer-settings-view.tsx`
- Delete after reference audit: `apps/web/features/settings/customer-settings-view.spec.tsx`
- Modify: `apps/web/features/dashboard/business-dashboard.tsx`
- Modify: `apps/web/features/dashboard/business-dashboard.spec.tsx`
- Modify: `docs/superpowers/specs/2026-10-18-customer-mobile-first-portal-design.md`

- [ ] **Step 1: Prove the legacy files are unreachable**

Run:

```powershell
rg -n "CustomerDashboard|customer-dashboard|CustomerProductionChart|customer-production-chart|CustomerSettingsView|customer-settings-view" apps/web
```

Expected: only definitions/tests and the customer branch inside `business-dashboard.tsx` remain. Remove that branch and its `CustomerDashboardProps` import while preserving `BusinessProductionTrend`, which is still used by `/production`; update `business-dashboard.spec.tsx` to cover only the retained production/staff behavior.

- [ ] **Step 2: Delete only unreachable customer-specific legacy files**

Do not delete shared staff billing, operation, dashboard, settings, payment, document, navigation, or UI primitive code.

- [ ] **Step 3: Mark the approved spec implemented**

Change the spec status to “Implemented” and append the final verification date plus the customer projection endpoints. Do not rewrite the approved decisions.

- [ ] **Step 4: Run the full verification matrix**

Run:

```powershell
pnpm --filter @solar/api-contracts test
pnpm --filter @solar/i18n test
pnpm exec tsx --test packages/i18n/src/customer-portal.spec.ts
pnpm --filter @solar/api test
pnpm --filter @solar/web test
pnpm --filter @solar/api lint
pnpm --filter @solar/web lint
pnpm build
```

Then run the customer and staff browser commands from Task 10.

Expected: every command exits 0; no TypeScript errors; customer and staff browser suites pass.

- [ ] **Step 5: Review the final diff for boundary violations**

Run:

```powershell
git diff --check
git diff --stat 0b498d9..HEAD
git status --short
```

Confirm that staff route branches are structurally unchanged except for explicit customer role forks, all new customer copy is translated, and no management-only bank data appears in the customer response.

- [ ] **Step 6: Commit cleanup and verification record**

```powershell
git add -A apps/web/features/dashboard apps/web/features/settings docs/superpowers/specs/2026-10-18-customer-mobile-first-portal-design.md
git commit -m "refactor(web): retire legacy customer presentation"
```

---

## Task 12: Polish the customer shell for mobile-app behavior

**Files:**
- Modify: `apps/web/features/customer/shell/customer-top-nav.tsx`
- Modify: `apps/web/features/customer/shell/customer-app-shell.spec.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/features/customer/**` card surfaces
- Modify: `packages/i18n/src/en.ts`
- Modify: `packages/i18n/src/th.ts`
- Modify: `apps/web/test/customer-portal.browser.test.mjs`
- Modify: `docs/superpowers/specs/2026-10-18-customer-mobile-first-portal-design.md`

- [x] **Step 1: Add a failing rendered shell test**

Prove that the old shell lacks a profile menu, floating mobile navigation, neutral dark tokens, and elevated customer cards. Preserve the existing 16px mobile form-control assertion for iOS focus-zoom protection.

- [x] **Step 2: Replace top-bar controls with the customer profile menu**

Keep account navigation, locale, theme, and sign-out available inside an accessible avatar popover. Do not reuse or modify the staff header.

- [x] **Step 3: Apply the legacy neutral dark palette and card hierarchy**

Remove purple from customer dark background, elevated, hero, muted, border, pending, and chart-comparison tokens. Keep Solar Gold as the only brand accent, add restrained elevation to primary customer cards, and leave light/staff themes independent.

- [x] **Step 4: Float the mobile bottom navigation**

Use an inset safe-area-aware capsule with a translucent neutral surface, subtle edge and shadow. Indicate the active destination through Solar Gold icon/label color without a filled yellow tile.

- [x] **Step 5: Verify mobile input focus and rendered regressions**

Run the focused shell test, web typecheck, full customer browser/accessibility suite, and capture Thai/dark mobile plus English/light desktop screenshots outside the repository. Confirm all visible mobile inputs/selects/textareas compute to at least 16px.

---

## Task 13: Refine customer filters, account editing, profile menu, and financial PDF rhythm

**Files:**
- Modify: `apps/web/features/customer/documents/customer-document-filters.tsx`
- Modify: `apps/web/features/customer/documents/customer-documents-page.spec.tsx`
- Modify: `apps/web/features/customer/account/customer-profile-card.tsx`
- Modify: `apps/web/features/customer/account/customer-notification-card.tsx`
- Modify: `apps/web/features/customer/account/customer-account-page.spec.tsx`
- Modify: `apps/web/features/customer/records/customer-financial-record-page.tsx`
- Modify: `apps/web/features/customer/records/customer-financial-record-page.spec.tsx`
- Modify: `apps/web/features/customer/shell/customer-top-nav.tsx`
- Modify: `apps/web/features/customer/shell/customer-app-shell.spec.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `packages/i18n/src/en.ts`
- Modify: `packages/i18n/src/th.ts`
- Modify: `apps/api/src/modules/documents/document-layout.ts`
- Modify: `apps/api/src/modules/documents/document-layout.spec.ts`
- Modify: customer browser and accessibility regressions

- [x] **Step 1: Add failing customer UI and PDF regressions**

Prove the document toolbar has a prefixed search input, a responsive date-range picker, and a responsive status selector. On desktop the bounded search stays left while the two selector buttons align right; on mobile the search occupies its own row and both selectors share the next row. Prove the account profile is display-first and edits in the existing responsive dialog presentation, notification controls retain standard switch dimensions, the record back action is an outlined surface button, and the customer profile popover reuses the Admin header presentation plus `ProfilePreferences` without account-navigation links.

For both invoices and receipts, prove only the first table rule uses the frozen Solar Gold primary while all remaining table rules use the neutral document border. Totals and Thai amount words retain white backgrounds. Add geometry regressions for short invoices and receipts: when no outstanding-balance table follows, the item region expands and keeps totals above payment accounts/remarks (invoice) or payment facts/remarks (receipt), while long rows and receipts with outstanding balances still paginate safely without forced filler.

- [x] **Step 2: Implement the responsive document toolbar**

Compose the installed Shadcn `InputGroup`, `Calendar`, `Select`-style trigger, `Popover`, and `Sheet` primitives. Preserve the current URL/query contract, opaque cursor reset, back/forward recovery, Thai/English copy, keyboard access, and 16px mobile input text.

- [x] **Step 3: Make account editing display-first and normalize switches**

Keep the existing profile and avatar APIs. Show current avatar, display name, and login email in the card; open the edit form as a centered modal on desktop and a bottom sheet on mobile. Scope customer touch-target rules so they do not distort the Shadcn switch track or thumb.

- [x] **Step 4: Reuse the Admin profile-popover presentation**

Share the Admin `ProfilePreferences` component and its header/trigger spacing. Customer content contains only identity, language, theme, and sign-out; it must not duplicate account navigation inside the popover.

- [x] **Step 5: Refine invoice and receipt document layout**

Apply Solar Gold only to the leading table rule, use the neutral border for all other rules, and keep financial cells white. Preserve the receipt outstanding-balances table when it exists. Add measured filler only to short documents without that table so totals settle near the bottom before the appropriate lower facts; never compromise the reserved signature/footer area or multi-page behavior.

- [ ] **Step 6: Verify local UI, immutable PDF workflow, and complete regressions**

Run focused RED/GREEN suites, web/API type checks, customer browser/accessibility tests at 390 and 1280, financial PDF page/geometry tests, the local invoice/PDF/Mailpit workflow, and the full monorepo test task. Leave local services running and do not stage, commit, or merge.

---

## Completion Criteria

- Customer users receive the dedicated mobile-first shell and customer pages at all existing routes.
- Home is bill-first, uses a persisted itemized breakdown, includes a 7d/30d production chart, and shows the latest three financial records.
- Payment uses the existing transfer/evidence workflow and ends in pending verification.
- Documents, record detail, preview, rejected-evidence recovery, and account settings work in Thai/English and light/dark.
- The customer top bar uses a profile avatar menu; the mobile bottom navigation floats and highlights only the active icon/label in Solar Gold.
- Customer dark mode uses neutral charcoal/black surfaces without purple, and mobile text-entry controls do not trigger iOS focus zoom.
- Viewports 390, 768, and 1280 pass browser checks without page-level horizontal overflow.
- Customer endpoints are customer-only, site-scoped, read-only projections except for the existing payment submission endpoint.
- Bank management metadata is not exposed by payment instructions.
- Existing staff tests and financial lifecycle tests pass unchanged.
- Full build, type checks, unit/component tests, browser journeys, and accessibility scans pass.
