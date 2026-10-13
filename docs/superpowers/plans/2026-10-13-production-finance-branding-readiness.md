# Production Finance, Document, and Branding Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable audited production finance and document workflows after Owner-controlled readiness is complete, surface actionable Owner notifications, and use the uploaded company logo throughout the application and newly issued documents.

**Architecture:** A dedicated financial-readiness module owns canonical configuration fingerprints, production approval evidence, action-level gates, and Owner checklist data. Existing settings mutations invalidate approvals atomically, the notification feed derives one Owner setup item from the same readiness result, and the financial application freezes production policy and branding into immutable cycle/document snapshots. A public image-only branding endpoint feeds the shared web `BrandMark`; scheduler and SMTP readiness remain separate deployment controls.

**Tech Stack:** TypeScript 7, Node.js 24, NestJS 12, PostgreSQL/TimescaleDB, Next.js 16 App Router, React 19, pdfmake, Nodemailer, node:test, Playwright, Docker Compose, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-13-production-finance-branding-readiness-design.md`

## Global Constraints

- Follow strict red-green-refactor: every production behavior starts with a test that fails for the intended missing behavior.
- Use Node.js `>=24.20.0 <27` and pnpm `>=11.24.0 <12`; do not change dependency versions for this work.
- The uploaded company logo and signatory image accept PNG/JPEG only and at most 1 MiB decoded bytes; API validation is authoritative.
- Owner controls business identity and final production confirmation; environment secrets and SMTP values never enter the Owner UI.
- `FINANCIAL_WRITES_ENABLED` and `FINANCIAL_SCHEDULER_ENABLED` default to `false`; neither flag bypasses persisted approval or site checks.
- Production monthly cutoff remains 01:00 Asia/Bangkok and must be idempotent across retries and redeploys.
- Existing document bytes, snapshots, document numbers, cycles, jobs, approvals, and delivery state are immutable or retained.
- An incomplete site cannot block a ready site.
- No migration or seed creates an approved production financial state.
- Preserve the local synthetic fixture and its visible TEST marking; production output contains no synthetic labels.
- Before changing Next.js components, read `apps/web/node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`, `06-fetching-data.md`, and `08-caching.md` as required by `apps/web/AGENTS.md`.

---

### Task 1: Persist production approval evidence and shared readiness contracts

**Files:**
- Create: `infra/migrations/056_production_financial_readiness.sql`
- Create: `packages/api-contracts/src/financial-readiness.ts`
- Create: `apps/api/src/modules/financial-readiness/financial-configuration.ts`
- Create: `apps/api/src/modules/financial-readiness/financial-configuration.spec.ts`
- Modify: `apps/api/src/scripts/db-migrate.ts`
- Modify: `packages/api-contracts/src/capabilities.ts`
- Modify: `packages/api-contracts/src/index.ts`

**Interfaces:**
- Produces `FinancialReadinessItem`, `FinancialReadinessStatus`, `FinancialReadinessContext`, and `FinancialScope` contracts.
- Produces `canonicalFinancialConfiguration(value): string` and `financialConfigurationHash(value): string`.
- Adds `financial_readiness_approvals` plus nullable `policy_snapshot` and `financial_scope` cycle fields without rewriting existing cycles.

- [ ] **Step 1: Write the failing canonicalization tests**

Create literal assertions that prove object-key ordering does not change a hash, array order remains significant, and a changed tax/identity field changes the hash:

```ts
test('financial configuration hash is stable for object key order', () => {
  assert.equal(
    financialConfigurationHash({company:{name:'Issuer',taxId:'123'},banks:[{id:'a'}]}),
    financialConfigurationHash({banks:[{id:'a'}],company:{taxId:'123',name:'Issuer'}}),
  );
});

test('financial configuration hash changes when approved financial data changes', () => {
  assert.notEqual(
    financialConfigurationHash({company:{taxId:'123'}}),
    financialConfigurationHash({company:{taxId:'456'}}),
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/financial-readiness/financial-configuration.spec.ts`

Expected: FAIL because `financial-configuration.ts` does not exist.

- [ ] **Step 3: Implement canonicalization and contracts**

Define contracts with stable, non-secret identifiers:

```ts
export type FinancialScope = 'TEST' | 'PRODUCTION';
export type ReadinessResponsibility = 'owner' | 'technical' | 'environment';
export interface FinancialReadinessItem {
  id:string;
  ready:boolean;
  responsibility:ReadinessResponsibility;
  destination?:string;
  siteId?:string;
}
export interface FinancialReadinessStatus {
  scope:FinancialScope|null;
  fingerprint:string;
  approval:{id:string;approvedAt:string;approvedBy:string}|null;
  items:FinancialReadinessItem[];
  actions:Record<FinancialAction,{enabled:boolean;missing:string[]}>;
}
export interface FinancialReadinessContext {
  siteId?:string;
  billingCycleId?:string;
  periodStart?:string;
  periodEnd?:string;
}
```

Canonicalize recursively with lexicographically sorted object keys, preserved array order, JSON scalar semantics, and SHA-256 over UTF-8 JSON. Extend `Capabilities.financialScope` to `FinancialScope`.

- [ ] **Step 4: Add migration 056**

Create an append-only approval table and active-row constraint:

```sql
CREATE TABLE financial_readiness_approvals (
 id uuid PRIMARY KEY,
 scope text NOT NULL CHECK(scope='PRODUCTION'),
 config_hash text NOT NULL CHECK(config_hash ~ '^[a-f0-9]{64}$'),
 snapshot jsonb NOT NULL,
 approved_by uuid NOT NULL REFERENCES users(id),
 approved_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 revoked_by uuid REFERENCES users(id),
 revoke_reason text,
 CHECK((revoked_at IS NULL)=(revoked_by IS NULL))
);
CREATE UNIQUE INDEX financial_readiness_one_active_production
 ON financial_readiness_approvals(scope) WHERE revoked_at IS NULL;
ALTER TABLE billing_cycles ADD COLUMN policy_snapshot jsonb;
ALTER TABLE billing_cycles ADD COLUMN financial_scope text
 CHECK(financial_scope IN('TEST','PRODUCTION'));
```

Append the migration path after `055_email_factor_password_reset.sql` in `db-migrate.ts`.

- [ ] **Step 5: Run package tests and type checks**

Run:

```sh
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/financial-readiness/financial-configuration.spec.ts
pnpm --filter @solar/api lint
pnpm --filter @solar/api-contracts build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```sh
git add infra/migrations/056_production_financial_readiness.sql apps/api/src/scripts/db-migrate.ts packages/api-contracts/src apps/api/src/modules/financial-readiness
git commit -m "feat: persist production finance approval evidence"
```

---

### Task 2: Make company and bank mutations audited, approval-aware, and safe for uploaded branding

**Files:**
- Create: `apps/api/src/modules/settings/company-image.ts`
- Create: `apps/api/src/modules/settings/company-image.spec.ts`
- Create: `apps/api/src/modules/settings/company-finance-mutation.spec.ts`
- Create: `apps/api/src/modules/settings/branding.controller.ts`
- Create: `apps/api/src/modules/settings/branding.controller.spec.ts`
- Modify: `apps/api/src/modules/settings/settings.service.ts`
- Modify: `apps/api/src/modules/settings/settings.controller.ts`
- Modify: `apps/api/src/modules/settings/settings.module.ts`
- Modify: `apps/api/src/common/auth/request-origin.guard.ts`
- Modify: `apps/api/src/common/auth/route-policy.spec.ts`

**Interfaces:**
- Produces `decodeCompanyImage(value, purpose): {bytes:Buffer; mimeType:'image/png'|'image/jpeg'; dataUri:string}`.
- Produces `GET /v1/public/branding/logo`, returning only image bytes with ETag and cache headers.
- Company/bank writes consume actor identity and revoke active approvals atomically when the canonical global snapshot changes.

- [ ] **Step 1: Write failing image validation tests**

Cover a real minimal PNG, a real minimal JPEG, MIME/signature mismatch, malformed base64, decoded bytes over 1 MiB, an HTTP URL, and an empty removal value. Assert the normalized data URI and decoded MIME/bytes, not parser internals.

- [ ] **Step 2: Run image tests and verify RED**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/settings/company-image.spec.ts`

Expected: FAIL because `decodeCompanyImage` is missing.

- [ ] **Step 3: Implement authoritative image validation**

Validate the `data:image/(png|jpeg);base64,` envelope, decode once, enforce `bytes.length <= 1_048_576`, and verify PNG (`89 50 4e 47 0d 0a 1a 0a`) or JPEG (`ff d8 ff`) signatures. Accept `''` as removal. Keep legacy `/brand/...` values readable but reject them on new writes.

- [ ] **Step 4: Write failing mutation and branding endpoint tests**

Tests must prove:

- company and bank changes write audit events with the actor;
- a financial change revokes the active production approval in the same transaction;
- an unchanged save does not revoke approval;
- exactly one default bank remains after create/update/delete;
- the logo endpoint serves configured bytes and MIME with a SHA-256 ETag;
- missing/legacy logo serves the bundled fallback;
- the public endpoint exposes no company JSON and requires no session.

- [ ] **Step 5: Implement transactional settings mutations**

Change controller calls to pass `req.user.id`. Move company and bank writes into `DatabaseService.transaction`, lock the affected profile/accounts, compute before/after canonical global financial snapshots, and revoke an active approval only when hashes differ. Insert audit actions `company.profile.updated`, `company.bank.created`, `company.bank.updated`, `company.bank.deleted`, and `finance.approval.revoked` in that transaction.

Change company and bank mutation decorators to `@Roles('owner')`; keep authenticated reads governed by the existing business permissions. Update both authorization layers so Admin, Operator, Accountant, and Customer User cannot mutate the global issuer profile or payment accounts.

Require one default bank after mutation: promoting one clears other defaults; deleting the current default promotes the oldest remaining configured account; deleting the only bank leaves no default and readiness becomes incomplete.

- [ ] **Step 6: Implement the public logo response**

Add `BrandingController` with `@Public()` and `@Get('v1/public/branding/logo')`. Use `Content-Type`, `ETag`, and `Cache-Control: public, max-age=300, must-revalidate`; honor `If-None-Match` with 304. Update request-origin behavior only as needed for safe public GET/HEAD requests and add a regression test.

- [ ] **Step 7: Run focused and authorization tests**

Run:

```sh
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/settings/company-image.spec.ts src/modules/settings/company-finance-mutation.spec.ts src/modules/settings/branding.controller.spec.ts src/common/auth/route-policy.spec.ts
pnpm --filter @solar/api lint
```

Expected: PASS.

- [ ] **Step 8: Commit**

```sh
git add apps/api/src/modules/settings apps/api/src/common/auth/request-origin.guard.ts apps/api/src/common/auth/route-policy.spec.ts
git commit -m "feat: validate and audit company branding"
```

---

### Task 3: Build the production readiness engine and Owner confirmation API

**Files:**
- Create: `apps/api/src/modules/financial-readiness/financial-readiness.module.ts`
- Create: `apps/api/src/modules/financial-readiness/financial-readiness.service.ts`
- Create: `apps/api/src/modules/financial-readiness/financial-readiness.controller.ts`
- Create: `apps/api/src/modules/financial-readiness/financial-readiness.service.spec.ts`
- Create: `apps/api/src/modules/financial-readiness/financial-readiness.postgres.spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/modules/billing/billing.module.ts`
- Modify: `apps/api/src/modules/documents/documents.module.ts`
- Modify: `apps/api/src/modules/settings/settings.module.ts`
- Modify: `apps/api/src/modules/billing/financial-readiness.service.ts` (remove after consumers move)
- Modify: `apps/api/src/common/auth/domain-route-policy.ts`
- Modify: `apps/api/src/common/auth/domain-route-policy.spec.ts`
- Modify: `apps/api/src/common/auth/route-policy.ts`

**Interfaces:**
- Produces `status(actor, context?): Promise<FinancialReadinessStatus>`.
- Produces `confirm(actor): Promise<FinancialReadinessStatus>`.
- Produces `assertEnabled(action, context): Promise<{scope:FinancialScope; approvalId:string; policyHash:string}>`.
- Produces `GET /v1/settings/finance-readiness` and Owner-only `POST /v1/settings/finance-readiness/confirm`.

- [ ] **Step 1: Write a failing readiness matrix test**

Use explicit database-result fixtures to prove:

- missing logo/signatory/default bank returns Owner item IDs;
- complete global data without an active matching approval reports `approval.confirmation` missing;
- changed data makes an old approval stale;
- SMTP is missing only from `send` and scheduler readiness;
- a missing site rate/meter/recipient blocks only that site;
- `FINANCIAL_WRITES_ENABLED=false` disables every write action;
- local fixture still returns scope `TEST` without satisfying production approval.

- [ ] **Step 2: Run readiness tests and verify RED**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/financial-readiness/financial-readiness.service.spec.ts`

Expected: FAIL because the module and context-aware API are missing.

- [ ] **Step 3: Implement one readiness query boundary**

Build normalized item IDs such as:

```ts
const GLOBAL_OWNER_ITEMS = [
 'company.logo','company.name','company.tax_id','company.branch',
 'company.address','company.phone','company.email','company.signatory',
 'company.signature','company.default_bank','approval.confirmation',
] as const;
```

Return only safe booleans, IDs, responsible party, and destinations. For a supplied period, validate exact rate coverage and boundary readings. Without a period, report structural meter/binding/rate readiness and leave period-boundary checks for `assertEnabled('calculate', context)`.

- [ ] **Step 4: Implement atomic Owner confirmation**

Inside one transaction, lock company profile and bank rows, recompute readiness, reject if any Owner global item is incomplete, revoke any stale active approval, and insert the canonical snapshot/hash with `approved_by`. Write `finance.approval.confirmed` audit evidence. A repeated confirmation of the same active hash returns the existing approval without creating a duplicate.

- [ ] **Step 5: Wire routes and shared provider ownership**

Register one `FinancialReadinessModule` in `AppModule`, export the service, and import it from Billing, Documents, Settings, and Notification modules. Remove duplicate service providers. Permit Owner read/confirm routes through both route-policy layers; reject Admin, Operator, Accountant, and Customer User confirmation.

- [ ] **Step 6: Add a real PostgreSQL integration test**

Against the repository's explicitly gated test database, apply migration 056, insert an Owner and complete configuration, confirm readiness, change the logo in a transaction, and assert the approval is revoked with an audit event. The test must refuse non-loopback/non-test database URLs following existing PostgreSQL integration test guards.

- [ ] **Step 7: Run focused tests and lint**

Run:

```sh
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/financial-readiness/*.spec.ts src/common/auth/domain-route-policy.spec.ts
pnpm --filter @solar/api lint
```

Expected: unit tests PASS; PostgreSQL test either PASS with its explicit test URL or SKIP with the documented guard.

- [ ] **Step 8: Commit**

```sh
git add apps/api/src/modules/financial-readiness apps/api/src/modules/billing apps/api/src/modules/documents/documents.module.ts apps/api/src/modules/settings/settings.module.ts apps/api/src/common/auth apps/api/src/app.module.ts
git commit -m "feat: gate finance on verified production readiness"
```

---

### Task 4: Add the Owner finance setup notification to the existing feed

**Files:**
- Create: `apps/api/src/modules/notifications/finance-readiness-notification.ts`
- Create: `apps/api/src/modules/notifications/finance-readiness-notification.spec.ts`
- Modify: `apps/api/src/modules/notifications/notification-feed.service.ts`
- Modify: `apps/api/src/modules/notifications/notification-feed.module.ts`
- Modify: `apps/api/src/modules/notifications/notification-feed.integration.spec.ts`
- Modify: `apps/web/components/navigation/notification-feed-state.ts`
- Modify: `apps/web/components/navigation/notification-bell.tsx`
- Modify: `apps/web/components/navigation/notification-bell.spec.tsx`

**Interfaces:**
- Consumes `FinancialReadinessService.status`.
- Produces `financeReadinessNotification(user, status)` with ID `workflow:finance-readiness:<fingerprint-prefix>` and destination `/settings/company`.
- Extends feed read/read-all behavior so a visible derived item uses `notification_feed_reads` exactly like persisted items.

- [ ] **Step 1: Write failing derived-notification tests**

Assert that only an Owner receives the item, the detail contains counts rather than secrets, the fingerprint changes when missing IDs change, the item remains absent after Owner-controlled completion, and environment-only SMTP status does not keep an Owner setup reminder alive.

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/notifications/finance-readiness-notification.spec.ts`

Expected: FAIL because the helper is missing.

- [ ] **Step 3: Compose the derived item into feed/read operations**

Fetch persisted feed data and readiness independently, merge at most one derived item, join its read state from `notification_feed_reads`, and recompute `unreadCount`. For read mutations, accept the derived identity only when the current user can currently see the matching fingerprint; then insert its read row. Do not loosen `parseNotificationIds` for arbitrary identities.

- [ ] **Step 4: Update the bell presentation**

Keep the existing bell and polling. Render finance readiness as a workflow item, link to Company Settings, and use localized detail copy based on item metadata returned by the API. Do not add a second notification store or toast loop.

- [ ] **Step 5: Run feed, permission, and component tests**

Run:

```sh
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/notifications/*.spec.ts
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test components/navigation/notification-bell.spec.tsx components/navigation/notification-feed-state.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```sh
git add apps/api/src/modules/notifications apps/web/components/navigation
git commit -m "feat: notify owners about finance setup"
```

---

### Task 5: Use uploaded branding globally and add the Owner readiness UI

**Files:**
- Create: `apps/web/components/brand/branding-logo.ts`
- Create: `apps/web/components/brand/branding-logo.spec.ts`
- Create: `apps/web/features/settings/company-logo-field.tsx`
- Create: `apps/web/features/settings/company-logo-field.spec.tsx`
- Create: `apps/web/features/settings/finance-readiness-card.tsx`
- Create: `apps/web/features/settings/finance-readiness-card.spec.tsx`
- Modify: `apps/web/components/brand/brand-mark.tsx`
- Modify: `apps/web/components/brand/brand-mark.spec.tsx`
- Modify: `apps/web/app/(app)/settings/company/page.tsx`
- Modify: `apps/web/lib/api-error-message.ts`

**Interfaces:**
- Consumes `GET /v1/public/branding/logo` and `FinancialReadinessStatus`.
- Produces `brandingLogoSrc(revision): string` and browser event `company-branding-updated`.
- Produces a localized readiness card and confirmation action without exposing environment values.

- [ ] **Step 1: Read the repository-pinned Next.js documentation**

Read the three files listed in Global Constraints before choosing client boundaries or caching behavior.

- [ ] **Step 2: Write failing logo-source and upload-field tests**

Assert that every `BrandMark` renders `/v1/public/branding/logo`, an update revision changes the URL, the accessible-label behavior remains correct, and the upload field rejects wrong MIME/size before setting a preview. Keep API rejection handling because client validation is not authoritative.

- [ ] **Step 3: Run focused web tests and verify RED**

Run:

```sh
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test components/brand/branding-logo.spec.ts components/brand/brand-mark.spec.tsx features/settings/company-logo-field.spec.tsx
```

Expected: FAIL on the old static mark and missing components.

- [ ] **Step 4: Implement shared live branding**

Make `BrandMark` a small client component that starts with `/v1/public/branding/logo`, listens for `company-branding-updated`, and appends a numeric revision query. Preserve `alt` and `aria-hidden` semantics. Because sidebar, mobile menu, login, header, and loading components already consume `BrandMark`, do not duplicate fetch logic in those components.

- [ ] **Step 5: Write the failing readiness-card test**

Render literal statuses for incomplete, awaiting confirmation, infrastructure-only, and ready states. Assert Owner items have links/actions, technical/environment items are explanatory only, confirmation is disabled until Owner items are complete, and SMTP credentials are absent.

- [ ] **Step 6: Implement the readiness UI and refactor Company Settings**

Extract logo/signature upload fields from the large page. Load company, banks, and `/v1/settings/finance-readiness` together, render the card before profile sections, refresh after company/bank saves, and dispatch `company-branding-updated` after a successful logo change. POST confirmation and replace the card with the server-returned status.

- [ ] **Step 7: Run web unit tests, lint, and build**

Run:

```sh
pnpm --filter @solar/web test
pnpm --filter @solar/web lint
pnpm --filter @solar/web build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```sh
git add apps/web/components/brand apps/web/features/settings apps/web/app/'(app)'/settings/company/page.tsx apps/web/lib/api-error-message.ts
git commit -m "feat: apply owner branding and finance checklist"
```

---

### Task 6: Freeze uploaded logos and remove duplicate company names from document headers

**Files:**
- Modify: `apps/api/src/modules/documents/document-layout.ts`
- Modify: `apps/api/src/modules/documents/document-layout.spec.ts`
- Modify: `apps/api/src/modules/documents/document-reference.spec.ts`
- Modify: `apps/api/src/modules/documents/contract-pdf.service.ts`
- Modify: `apps/api/src/modules/documents/contract-pdf.service.spec.ts`
- Modify: `apps/api/src/modules/documents/local-test-pdf.ts`
- Modify: `apps/api/src/modules/documents/local-test-pdf.spec.ts`
- Modify: `apps/web/components/brand/document-brand.tsx`
- Modify: `apps/web/features/shared/handover-preview-modal.tsx`
- Modify: relevant preview component tests under `apps/web/features/**`

**Interfaces:**
- Consumes validated `company_profile.logo_url` and bundled fallback.
- Produces immutable document snapshots whose `logoDataUri` is the exact issuance-time image.
- Produces first-page headers with logo and document metadata only; issuer identity appears in the Company Information block.

- [ ] **Step 1: Change PDF layout assertions first and verify RED**

Replace the current header expectation with behavior assertions:

```ts
assert.deepEqual(header.columns.map((column:any)=>column.width), [65, '*', 245]);
assert.equal(header.columns[0].image, snapshot.logoDataUri);
assert.equal(visibleText(header.columns[1]), '');
assert.equal(countVisibleText(definition.content, snapshot.issuer.name), 1);
```

Add equivalent contract and preview tests. Run the focused specs and confirm they fail because issuer name still appears beside the logo.

- [ ] **Step 2: Write contract-logo snapshot tests and verify RED**

Issue a contract with a custom company data URI, mutate company logo afterward, and assert the saved PDF/hash/snapshot remain unchanged. Add a fallback case for an unconfigured logo.

- [ ] **Step 3: Implement document layout and logo sourcing**

Remove the issuer-name stack beside the logo from both layout paths and browser previews. Resolve the current validated company logo for new contracts, invoices, and receipts, then freeze it in the snapshot. Preserve invoice logo for its receipt and preserve historical snapshot behavior. Increment the contract and financial template versions for new artifacts.

- [ ] **Step 4: Render and inspect deterministic PDF fixtures**

Run:

```sh
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/documents/document-layout.spec.ts src/modules/documents/contract-pdf.service.spec.ts src/modules/documents/document-reference.spec.ts
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json src/modules/documents/document-reference.render-fixtures.ts
```

Inspect generated first pages to verify the logo is legible, issuer name appears once below, metadata does not collide, signatures remain on the expected page, and long issuer/customer values still wrap.

- [ ] **Step 5: Run API/web document suites**

Run:

```sh
pnpm --filter @solar/api test
pnpm --filter @solar/web test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```sh
git add apps/api/src/modules/documents apps/web/components/brand/document-brand.tsx apps/web/features/shared
git commit -m "feat: freeze company branding in documents"
```

---

### Task 7: Promote the financial application from local TEST to audited production scope

**Files:**
- Create: `apps/api/src/modules/billing/financial-policy.ts`
- Create: `apps/api/src/modules/billing/financial-policy.spec.ts`
- Rename: `apps/api/src/modules/billing/local-financial-application.service.ts` to `apps/api/src/modules/billing/financial-application.service.ts`
- Rename: `apps/api/src/modules/documents/local-test-pdf.ts` to `apps/api/src/modules/documents/financial-document-pdf.ts`
- Modify: `apps/api/src/modules/billing/financial-application.service.ts`
- Modify: `apps/api/src/modules/billing/billing.controller.ts`
- Modify: `apps/api/src/modules/billing/site-billing.service.ts`
- Modify: `apps/api/src/modules/billing/billing.module.ts`
- Modify: `apps/api/src/modules/billing/saved-document-delivery.ts`
- Modify: `apps/api/src/modules/billing/saved-document-delivery.spec.ts`
- Modify: billing/document tests and local scripts importing renamed symbols

**Interfaces:**
- Produces `financialPolicySnapshot(config, scope)` and a hash stored with each new cycle.
- Consumes context-aware `assertEnabled(action, {siteId|billingCycleId|periodStart|periodEnd})`.
- Produces production artifacts/email without TEST labels while retaining TEST labels for local scope.

- [ ] **Step 1: Write failing production policy tests**

Use hand-calculated literals to prove tax-exclusive and tax-inclusive totals, exact decimal rounding, canonical policy hash stability, different site tax settings producing different hashes, and production snapshots carrying `scope:'PRODUCTION'` without synthetic fields.

- [ ] **Step 2: Run policy tests and verify RED**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/billing/financial-policy.spec.ts`

Expected: FAIL because the production policy module is missing.

- [ ] **Step 3: Implement production policy snapshots**

Build the policy from persisted site settings and fixed arithmetic rules:

```ts
{
 scope:'PRODUCTION', currency:'THB', taxRate:exactRate(config.tax_rate),
 pricesIncludeTax:config.prices_include_tax,
 kwhScale:3, rateScale:4, moneyScale:2, rounding:'half_up',
 documentNumbering:'database_sequence',
}
```

Persist `policy_snapshot`, `policy_hash`, and `financial_scope` on new cycles. Keep the local test adapter emitting the existing frozen TEST policy.

Extract a scope-neutral exact energy-charge helper for `kWh × rate` and use that in production segments. Do not call `calculateTestTotals`, `TEST_FINANCIAL_POLICY`, or any hard-coded 7% helper from the production calculation branch; tax comes only from the confirmed site policy.

- [ ] **Step 4: Write failing production workflow tests**

Cover calculate, issue, full payment approval/receipt, adjust/supersede, manual invoice, and send. Assert each readiness call receives the correct site/cycle context, documents freeze policy/company/bank/recipient/signatory/logo, production output lacks TEST labels, and a replay returns the existing cycle/document/outbox rows.

- [ ] **Step 5: Refactor the application service**

Rename the class to `FinancialApplicationService`, remove local binding checks from production branches, and select TEST/PRODUCTION behavior from readiness evidence. Replace every TEST hash equality with persisted policy snapshot/hash validation. Keep exact rate coverage, meter evidence, document immutability, payment settlement, and outbox integrity unchanged.

Update `saved-document-delivery.ts` so subject/body TEST marking depends on frozen snapshot scope. Never infer scope from the current environment for an already issued document.

- [ ] **Step 6: Update controllers, modules, tests, and local scripts**

Pass action context from every endpoint. Update imports in `scripts/local-system`, `scripts/local-financial-review`, API tests, and document tests. Local fixture assertions must continue to prove TEST scope and Mailpit binding.

- [ ] **Step 7: Run financial suites and lint**

Run:

```sh
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/billing/*.spec.ts src/modules/documents/*.spec.ts
node --test scripts/local-system/*.test.mjs
pnpm --filter @solar/api lint
```

Expected: PASS.

- [ ] **Step 8: Commit**

```sh
git add apps/api/src/modules/billing apps/api/src/modules/documents scripts/local-system scripts/local-financial-review
git commit -m "feat: enable audited production financial workflows"
```

---

### Task 8: Enable the production scheduler safely and document Coolify SMTP activation

**Files:**
- Rename: `apps/api/src/modules/billing/local-financial-scheduler.ts` to `apps/api/src/modules/billing/financial-scheduler.ts`
- Create: `apps/api/src/modules/billing/financial-scheduler.spec.ts`
- Modify: `apps/api/src/modules/billing/financial-application.service.ts`
- Modify: `apps/api/src/modules/billing/billing.module.ts`
- Modify: `infra/docker/.env.web.example`
- Modify: `infra/docker/.env.staging.example`
- Modify: `infra/docker/docker-compose.web.yml`
- Modify: `infra/docker/docker-compose.staging.yml`
- Modify: `docs/runbooks/coolify-billing-test-th.md`
- Modify: `docs/runbooks/coolify-web-first-deployment-th.md`
- Modify: `docs/runbooks/coolify-solar-fowir-deployment-detailed-th.md`

**Interfaces:**
- Consumes `FINANCIAL_WRITES_ENABLED`, `FINANCIAL_SCHEDULER_ENABLED`, current approval, and SMTP readiness.
- Produces isolated per-site monthly processing at Bangkok 01:00 with durable blocked notices and retry.

- [ ] **Step 1: Write failing scheduler tests**

Prove no timer/run when either flag is false, approval is stale, or SMTP is incomplete; one tick at 00:59 Bangkok does nothing; 01:00 creates the previous-month jobs; a blocked site does not stop a ready site; replay creates no duplicate documents or emails; and concurrent ticks do not overlap.

- [ ] **Step 2: Run scheduler tests and verify RED**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/billing/financial-scheduler.spec.ts`

Expected: FAIL because the production scheduler does not exist.

- [ ] **Step 3: Implement the scheduler and per-site failure isolation**

Rename the provider, gate startup on the two flags, and ask readiness for scheduler/global SMTP status before installing the interval. Preserve the in-process overlap guard and database uniqueness. Process jobs one by one; record safe missing item IDs in `financial_staff_notices` and continue. Keep failed SMTP uncertainty in the outbox reconciliation path.

- [ ] **Step 4: Wire deployment variables**

Pass both financial flags through web and staging API services. Add comments stating the activation order and keep defaults false. Do not add secret values to examples.

- [ ] **Step 5: Update runbooks with exact activation and verification commands**

Document:

1. deploy with both flags false;
2. complete Owner readiness;
3. configure SMTP in Coolify;
4. confirm readiness;
5. enable writes and run one controlled manual flow;
6. enable scheduler only after delivery/replay passes;
7. verify status without printing SMTP secrets;
8. disable both flags for immediate write stop without deleting data.

- [ ] **Step 6: Run scheduler, compose, and CI script tests**

Run:

```sh
pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/billing/financial-scheduler.spec.ts
node --test scripts/ci/*.test.mjs
docker compose -f infra/docker/docker-compose.web.yml --env-file infra/docker/.env.web.example config
docker compose -f infra/docker/docker-compose.staging.yml --env-file infra/docker/.env.staging.example config
```

Expected: tests PASS and Compose configs resolve with test-safe substituted image values used by the existing CI harness.

- [ ] **Step 7: Commit**

```sh
git add apps/api/src/modules/billing infra/docker docs/runbooks
git commit -m "feat: schedule production billing behind readiness"
```

---

### Task 9: Add production-path acceptance coverage and run the complete verification gate

**Files:**
- Create: `apps/api/test/production-financial-workflow.integration.ts`
- Create: `apps/web/test/platform/finance-readiness-browser.mjs`
- Modify: `scripts/ci/integration.sh`
- Modify: `scripts/ci/platform-check.sh`
- Modify: `.github/CI.md`
- Modify: `docs/runbooks/coolify-billing-test-th.md`
- Modify: `docs/runbooks/platform-rollout.md`

**Interfaces:**
- Exercises the actual production readiness/application/scheduler code against disposable PostgreSQL, storage, and Mailpit services.
- Produces CI evidence for Owner setup, branding, one controlled site, document bytes, email capture, and idempotent replay.

- [ ] **Step 1: Write the failing API production-path integration test**

The test must:

- refuse any database/storage/SMTP endpoint outside the disposable CI/local allowlist;
- create an Owner, company identity/logo/signature, default bank, customer, site, contract, tax settings, verified recipient, meter binding, rate, and actual boundary readings;
- confirm the canonical production approval;
- calculate and issue one invoice;
- submit and approve full payment, then issue one receipt;
- send through Mailpit and verify PDF attachments/hashes;
- replay calculation, issuance, approval, send, and monthly tick without duplicates;
- mutate the logo afterward and prove existing artifacts remain byte-identical;
- leave another incomplete site blocked without affecting the ready site.

- [ ] **Step 2: Add it to the disposable integration stack and verify initial RED**

Run: `bash scripts/ci/integration.sh`

Expected before final wiring: FAIL at production readiness or missing test entrypoint, while the environment safety assertions pass.

- [ ] **Step 3: Complete integration wiring and make it GREEN**

Set production-path test flags only inside the disposable stack, seed no approval outside the test, run the new integration after migrations, query Mailpit through its local test port, and add produced JSON/PDF hashes to `test/artifacts`.

- [ ] **Step 4: Write and run the browser acceptance flow**

The browser test signs in as Owner and verifies:

- the fallback logo before setup;
- the readiness bell item and Company Settings destination;
- logo upload preview/save and replacement on login/sidebar/header/loading surfaces;
- checklist progression and disabled/enabled confirmation;
- infrastructure blockers reveal no SMTP values;
- the duplicate issuer name is absent beside the logo in document preview;
- role boundaries prevent Admin/Customer User from confirming production readiness.

Run the focused browser command through the existing CI browser server helper and confirm RED before wiring selectors/data, then GREEN.

- [ ] **Step 5: Run the complete local verification gate once**

Run:

```sh
pnpm lint
pnpm test
pnpm build
node --test scripts/ci/*.test.mjs
bash infra/ci/managed-staging-smoke.sh
bash infra/ci/web-first-smoke.sh
bash scripts/ci/integration.sh
bash scripts/ci/platform-check.sh all-fast --prebuilt
bash scripts/ci/recovery-drill.sh --profile fixture
bash scripts/ci/platform-load.sh --profile smoke --history-days 90
```

Expected: every command exits 0; evidence includes the new production finance and branding checks. Do not repeat broad suites unless a later code change invalidates the result.

- [ ] **Step 6: Review the complete diff for safety and scope**

Verify no credential, local output, generated PDF, browser screenshot, `.env`, database volume, or test artifact is staged. Inspect migrations for append-only compatibility and inspect every changed financial mutation for an audit and readiness gate.

- [ ] **Step 7: Commit final acceptance and documentation**

```sh
git add apps/api/test apps/web/test scripts/ci .github/CI.md docs/runbooks
git commit -m "test: verify production finance and branding readiness"
```

- [ ] **Step 8: Run verification-before-completion and publish through the normal branch/PR flow**

Record the exact passing commands and commit SHA. Push the implementation branch, let the main workflow build and publish immutable image digests, merge only after required checks pass, then use all image digests from the same successful main run for Coolify.
