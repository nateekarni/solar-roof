# Customer Payment QR Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present a large PromptPay-style payment QR with details beneath it, a reliable labelled save action, and a compact borderless inline copy icon.

**Architecture:** Keep QR validation/rendering in `customer-payment-qr.ts`, extract visual and interaction concerns into a focused QR card and copy button, and let `PaymentInstructionsStep` compose bank details with generated/fallback QR state.

**Tech Stack:** React 19, Next.js 16, Tailwind CSS 4, shadcn Button/Radix accessibility, `qrcode`, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-payment-and-asset-lifecycle-design.md`

## Global Constraints

- QR generation remains local; no external QR service.
- Preserve image byte/dimension/origin validation and object-URL cleanup.
- QR surface remains white in dark mode and does not shrink to the old 6rem column.
- Save is a visible labelled action; copy is a visually compact icon-only action.
- Copy retains an accessible name, visible keyboard focus, and an expanded invisible hit target.
- Preserve full-payment-only customer behavior from the payment plan.
- Follow `apps/web/AGENTS.md` and inspect the installed Next.js guide before code changes that depend on changed framework APIs.

---

### Task 1: Add pure QR save behavior

**Files:**
- Create: `apps/web/features/customer/payment/customer-payment-qr-save.ts`
- Create: `apps/web/features/customer/payment/customer-payment-qr-save.spec.ts`
- Modify: `apps/web/features/customer/payment/customer-payment-qr.ts`

**Interfaces:**
- Consumes: validated displayed QR URL/data URL.
- Produces: `saveCustomerPaymentQr(input, environment?)` with a deterministic filename and explicit fallback result.

- [ ] **Step 1: Write failing save tests**

```ts
test('save uses a sanitized billing identifier and the displayed QR bytes',async()=>{
  const clicks:string[]=[];
  const anchor:{href:string;download:string;click:()=>void;remove:()=>void}={href:'',download:'',click(){clicks.push(anchor.download);},remove(){}};
  const result=await saveCustomerPaymentQr(
    {url:'data:image/png;base64,iVBORw0KGgo=',billingId:'INV/26 001'},
    {createAnchor:()=>anchor,open:()=>null},
  );
  assert.equal(result,'downloaded');
  assert.deepEqual(clicks,['solar-roof-payment-INV-26-001.png']);
});

test('unsupported direct download opens the validated image as a manual-save fallback',async()=>{
  const opened:string[]=[];
  const result=await saveCustomerPaymentQr(
    {url:'blob:https://portal.test/owned',billingId:'bill'},
    {createAnchor:()=>null,open:url=>{opened.push(url);return true;}},
  );
  assert.equal(result,'opened');
  assert.deepEqual(opened,['blob:https://portal.test/owned']);
});
```

- [ ] **Step 2: Run and confirm failure**

```powershell
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/customer/payment/customer-payment-qr-save.spec.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the helper**

```ts
export type CustomerQrSaveResult='downloaded'|'opened';
export interface QrSaveAnchor {href:string;download:string;click():void;remove():void}
export interface QrSaveEnvironment {
  createAnchor():QrSaveAnchor|null;
  open(url:string,target:'_blank'):boolean;
}
export async function saveCustomerPaymentQr(
  input:{url:string;billingId:string},
  environment?:QrSaveEnvironment,
):Promise<CustomerQrSaveResult>;
```

The default environment creates a detached `<a>` from `document.createElement`, clicks it, and removes it; `open` returns whether `window.open(url,'_blank','noopener,noreferrer')` produced a window. Sanitize `billingId` with `replace(/[^A-Za-z0-9_-]+/g,'-')`, trim leading/trailing hyphens, cap it at 80 characters, and fall back to `billing` when empty. Use the anchor path for `data:` and owned `blob:` URLs; use the already validated URL manual-open fallback when no downloadable anchor is available. Throw a generic `Unable to save payment QR` error when neither path succeeds.

- [ ] **Step 4: Run tests and commit**

```powershell
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/customer/payment/customer-payment-qr-save.spec.ts features/customer/payment/customer-payment-qr.spec.ts
git add apps/web/features/customer/payment/customer-payment-qr-save.ts apps/web/features/customer/payment/customer-payment-qr-save.spec.ts apps/web/features/customer/payment/customer-payment-qr.ts
git commit -m "feat(web): add reliable payment QR saving"
```

---

### Task 2: Build the compact accessible account copy action

**Files:**
- Create: `apps/web/features/customer/payment/account-copy-button.tsx`
- Create: `apps/web/features/customer/payment/account-copy-button.spec.tsx`
- Modify: `packages/i18n/src/th.ts`
- Modify: `packages/i18n/src/en.ts`

**Interfaces:**
- Consumes: account number and locale.
- Produces: icon-only copy/check state with inline error callback.

- [ ] **Step 1: Write failing markup and interaction tests**

```tsx
test('copy action is borderless and layout-compact while retaining accessible feedback',()=>{
  const html=renderToStaticMarkup(<AccountCopyButton value="044-2-74140-9" locale="th"/>);
  assert.match(html,/aria-label="คัดลอกเลขบัญชี"/);
  assert.match(html,/p-0/);
  assert.match(html,/border-0/);
  assert.match(html,/after:-inset-/);
  assert.match(html,/focus-visible:ring/);
  assert.doesNotMatch(html,/variant="outline"/);
});
```

Use a browser/unit harness with mocked clipboard to assert Copy -> Check -> Copy and a polite live-region announcement.

- [ ] **Step 2: Run and confirm failure**

```powershell
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/customer/payment/account-copy-button.spec.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the component**

Use a semantic `<button type="button">` or the shared Button with `variant="ghost"`, but override visual layout to `relative inline-grid size-5 shrink-0 place-items-center border-0 bg-transparent p-0 shadow-none`. Add an `after:absolute after:-inset-3` hit target that does not affect line layout. Keep `focus-visible:ring-2` and `sr-only`/`aria-live="polite"` feedback.

On clipboard rejection, call `onError(t('customerPortal.payment.copyFailed'))`; never report copied success.

- [ ] **Step 4: Run tests and commit**

```powershell
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/customer/payment/account-copy-button.spec.tsx
git add apps/web/features/customer/payment/account-copy-button.tsx apps/web/features/customer/payment/account-copy-button.spec.tsx packages/i18n/src/th.ts packages/i18n/src/en.ts
git commit -m "feat(web): add inline account copy action"
```

---

### Task 3: Replace the narrow QR column with a large vertical payment card

**Files:**
- Create: `apps/web/features/customer/payment/payment-qr-card.tsx`
- Create: `apps/web/features/customer/payment/payment-qr-card.spec.tsx`
- Modify: `apps/web/features/customer/payment/payment-instructions-step.tsx`
- Modify: `apps/web/features/customer/payment/customer-payment-flow.tsx`
- Modify: `packages/i18n/src/th.ts`
- Modify: `packages/i18n/src/en.ts`

**Interfaces:**
- Consumes: displayed QR URL, amount, billing ID, fallback flag, bank/PromptPay instructions.
- Produces: centered 280-320 px QR, details below, save action, and inline errors.

- [ ] **Step 1: Write failing layout tests**

```tsx
test('payment QR is primary and details follow below it',()=>{
  const html=renderToStaticMarkup(<PaymentQrCard locale="th" qr="data:image/png;base64,AA==" amount="1234.56"
    billingId="bill" instructions={{available:true,bankName:'ธนาคาร',accountName:'บริษัท',accountNumber:'123',promptpayId:'010555'}}
    fallback={false}/>);
  assert.match(html,/max-w-\[20rem\]/);
  assert.match(html,/w-full.*object-contain/);
  assert.ok(html.indexOf('alt="QR Code สำหรับชำระเงิน"')<html.indexOf('1,234.56'));
  assert.match(html,/บันทึก QR Code/);
  assert.doesNotMatch(html,/grid-cols-\[minmax\(0,1fr\)_6rem\]/);
});
```

Add a fallback case asserting `qrFallback` appears and bank details remain when `qr` is null.

- [ ] **Step 2: Run and confirm failure**

```powershell
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/customer/payment/payment-qr-card.spec.tsx
```

Expected: FAIL because `PaymentQrCard` does not exist.

- [ ] **Step 3: Implement `PaymentQrCard`**

Use this composition:

```tsx
<section className="mx-auto w-full max-w-md rounded-2xl border bg-card p-4 sm:p-6">
  <header className="text-center">
    <h2 className="text-lg font-semibold">{title}</h2>
    <p className="text-sm text-muted-foreground">{channelLabel}</p>
  </header>
  {qr&&<div className="mx-auto mt-4 w-full max-w-[20rem] rounded-2xl bg-white p-3">
    <img className="aspect-square w-full object-contain" src={qr} alt={qrAlt} width={320} height={320}/>
  </div>}
  <div className="mt-4 space-y-3 text-center">
    <strong className="block text-2xl">{formattedAmount}</strong>
    <p>{instructions.accountName}</p>
    <p className="inline-flex items-center justify-center gap-1">
      <span>{instructions.accountNumber}</span>
      <AccountCopyButton value={instructions.accountNumber} locale={locale} onError={onError}/>
    </p>
  </div>
  {qr&&<Button className="mt-4 w-full" variant="outline" onClick={onSave}>
    <Download aria-hidden="true"/> {saveLabel}
  </Button>}
  <div aria-live="polite">{feedback}</div>
</section>
```

Keep the QR background white without a `dark:` override. Format amount with the existing customer money formatter. Put `<AccountCopyButton>` immediately after the account number in the same inline flex row.

- [ ] **Step 4: Compose it from `PaymentInstructionsStep`**

Keep generated amount QR priority (`amountQr ?? fallbackQr`) and all existing cleanup effects. Replace the old two-column markup with `PaymentQrCard`. Pass the current billing identifier from `CustomerPaymentFlow` so the download filename is meaningful.

- [ ] **Step 5: Run component tests and commit**

```powershell
pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/customer/payment/payment-qr-card.spec.tsx features/customer/payment/customer-payment-flow.spec.tsx features/customer/payment/customer-payment-qr.spec.ts
git add apps/web/features/customer/payment/payment-qr-card.tsx apps/web/features/customer/payment/payment-qr-card.spec.tsx apps/web/features/customer/payment/payment-instructions-step.tsx apps/web/features/customer/payment/customer-payment-flow.tsx packages/i18n/src/th.ts packages/i18n/src/en.ts
git commit -m "feat(web): redesign customer payment QR card"
```

---

### Task 4: Verify responsive, download, clipboard, and accessibility behavior

**Files:**
- Modify: `apps/web/test/customer-payment-qr.browser.test.mjs`
- Modify: `apps/web/test/customer-payment.browser.test.mjs`
- Modify: `apps/web/test/customer-portal-accessibility.browser.test.mjs`

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: browser evidence at mobile and desktop breakpoints.

- [ ] **Step 1: Extend browser tests before changing implementation expectations**

At viewport widths 320, 640, 768, and 1024, assert:

```js
const qr=page.getByRole('img',{name:'Payment QR code'});
const box=await qr.boundingBox();
assert.ok(box.width<=320);
assert.ok(box.width>=Math.min(280,page.viewportSize().width-48));
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
await expect(page.getByRole('button',{name:'Save QR code'})).toBeVisible();
await expect(page.getByRole('button',{name:'Copy account number'})).toBeVisible();
```

Mock clipboard success/failure and download support/fallback. Preserve all existing object-URL revoke assertions and raw-data-URL protection.

- [ ] **Step 2: Run the browser tests**

```powershell
pnpm --filter @solar/web exec node --test --test-concurrency=1 test/customer-payment-qr.browser.test.mjs test/customer-payment.browser.test.mjs test/customer-portal-accessibility.browser.test.mjs
```

Expected: PASS after Tasks 1-3; no page errors or accessibility violations.

- [ ] **Step 3: Run the full web and workspace verification**

```powershell
pnpm --filter @solar/web test
pnpm --filter @solar/web test:customer:browser
pnpm --filter @solar/web test:customer:accessibility
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 4: Commit**

```powershell
git add apps/web/test/customer-payment-qr.browser.test.mjs apps/web/test/customer-payment.browser.test.mjs apps/web/test/customer-portal-accessibility.browser.test.mjs
git commit -m "test(web): verify payment QR usability"
```
