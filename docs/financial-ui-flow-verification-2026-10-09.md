# Financial UI flow verification — 2026-10-09

## Delivered behavior

- Rates open on site/current-rate information. Template management opens separately; application proceeds through scope/rate/date/reason, impact preview, and explicit confirmation. Existing selected/matching/all scopes remain available.
- Billing and receipt details prioritize inline evidence review, readable record data, on-demand original documents, and transfer history. Receipt details fetch related billing/payment information with existing scoped endpoints.
- The billing table has no slip column. Its review action enters record details. Top-right previous/next uses a saved ID sequence from the original filtered and sorted result, across cursor pages. Approving a record does not advance automatically. Returning to the list restores cursor history as well as its filters.
- Receipt states use translated labels and consistent semantic colors; superseded documents are filterable. Document status remains distinct from payment status. Customer receipt lists now also render mobile cards.
- Shared modal heading/body and label/control gaps, footer placement, bounded scrolling, first-error focus, general-error summaries, and friendly API messages are implemented. See the complete source inventory in `docs/modal-consistency-coverage-2026-10-09.md`.

## Checks

| Check | Result |
| --- | --- |
| Web TypeScript check | Passed |
| Full web node:test suite | 324 passed, 0 failed |
| Edge error-focus browser regressions | 3 passed |
| Component browser integration, 1440×1000 and 390×844 | Passed |
| Create-site label/input separation | Measured at least 7 px, first invalid input focused |
| Rates template modal and preview/confirm | Passed; preview performs no application, confirm applies once |
| Table review action and page-two return | Passed; review opens details, previous-page control remains enabled on return |
| Inline review validation and correction | Passed; amount receives focus, correcting it clears stale error styling |
| Review success and record navigation | Passed; success remains on current record, next uses saved sequence |
| Receipt mobile layout and status | Passed; superseded remains document status even when payment is paid; no horizontal overflow |
| Original-document loading | No document request before selection; unavailable-original recovery rendered after selection |
| Browser runtime errors | None in the tested component flows |

Commands run from the repository root:

```powershell
node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json
$tests=@(rg --files apps/web/lib apps/web/features apps/web/components | Where-Object {$_ -match '\.spec\.tsx?$'})
node node_modules/tsx/dist/cli.mjs --tsconfig apps/web/tsconfig.ui-tests.json --test @tests
node --test apps/web/test/form-feedback.browser.test.mjs
node tmp/financial-ui-browser.mjs
```

The Windows sandbox cannot resolve some pnpm dependency symlinks or access test loopback/browser processes. The final checks ran outside that sandbox; no dependency changes were required.

## Browser evidence and limits

Browser plugin was unavailable. Playwright used installed Edge and a temporary loopback server. The harness bundles the actual components, freshly compiled application CSS, and the app brand color. It substitutes Next navigation and API fixture responses. These are component integration checks, not a deployed-app or live-database end-to-end run. No real payment was approved and no real rate was changed.

Screenshots and machine-readable result are under:

`C:/Users/natee/.codex/visualizations/2026/10/09/01a120db-3d22-7401-bea5-91e4000260cf/`

- `site-create-desktop.png`
- `rates-desktop.png`
- `rates-template-modal.png`
- `rates-preview.png`
- `billing-review-desktop.png`
- `billing-review-mobile.png`
- `receipts-mobile.png`
- `financial-ui-browser-result.json`

Every modal call site was inventoried against shared primitives; representative business, account/auth error handling, and native/RHF validation paths were tested. This does not claim screenshots of every modal. No live mail delivery, receipt issuance, or database mutation was exercised. Catalog management retains its existing list/create API capabilities.
