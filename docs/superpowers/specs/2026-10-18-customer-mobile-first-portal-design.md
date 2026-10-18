# Mobile-first customer portal redesign

## Status

Approved for implementation planning on 2026-10-18.

## Intent

Redesign the complete `customer_user` experience as a consumer-facing, mobile-first billing application while preserving the existing customer routes, authentication, financial lifecycle, and server-enforced site scope. The experience prioritizes the current bill and payment task, follows with energy insight and recent financial records, and remains usable in Thai and English, light and dark themes, and desktop and mobile viewports.

The customer presentation is a dedicated boundary. Staff-facing pages and components remain unchanged. Existing APIs are reused when their contracts fit; missing customer projections are added without changing staff endpoint semantics.

## Approved product decisions

- Keep the customer navigation label **เอกสาร / Documents** and the existing routes.
- Preserve the Solar Roof primary gold (`#f29700` or its tokenized equivalent).
- Replace blue/navy presentation accents with a deep aubergine family that contrasts with Solar Gold.
- Use a bill-first hierarchy: amount due, status, due date, and payment action precede energy information.
- Show an itemized, persisted bill breakdown rather than generic metric tiles.
- Place an interactive energy chart below the billing section.
- Show the three latest financial records below the chart with a link to all documents.
- Keep payment as QR or bank transfer followed by evidence submission. Do not imply card payment, direct debit, or automatic payment confirmation.
- Default to full payment and expose partial payment through a secondary “other amount” action.
- Use a step-by-step payment flow: instructions, transfer details and evidence, review, then pending-verification confirmation.
- Support rejected-evidence recovery from the same financial record.
- Support Thai and English and both current themes from the first implemented slice.
- Implement real product behavior directly; a standalone HTML prototype is no longer required.

## Scope

The redesign covers the complete customer portal in phased vertical slices:

1. Customer shell, semantic tokens, navigation, responsive foundation, localization, and themes.
2. Customer home, including the bill-first summary, breakdown, energy graph, and recent financial records.
3. Customer financial record detail, document preview, and payment-evidence flow.
4. Customer documents list, filters, and lifecycle states.
5. Customer organization, account, notification, and security presentation.
6. Accessibility, failure states, performance, API compatibility, and staff regression protection.

## Non-goals

- Rebranding Solar Roof or replacing the existing primary gold.
- Changing staff workflows or the presentation of owner, admin, accountant, or operator pages.
- Introducing a payment gateway, card payment, direct debit, or automatic PromptPay confirmation.
- Adding multi-site selection to the current `customer_user` experience.
- Combining several billing cycles into one payment transaction.
- Inventing financial, savings, battery, grid, CO2, or efficiency metrics that are not backed by current data.
- Replacing authentication, authorization, document generation, or financial lifecycle rules.

## Presentation boundary

Customer routes retain their current public paths:

- `/` — customer home
- `/billing` — all customer financial records
- `/records/billing/:id` — unified billing-cycle detail
- `/settings` — organization and account

These routes render a dedicated customer component suite, expected under a focused boundary such as `apps/web/features/customer/`. Existing staff operation tables, review controls, and dense back-office layouts are not reused when they impose staff behavior or visual structure.

Shared UI primitives remain reusable when they are presentation-neutral: buttons, inputs, dialogs, focus management, form controls, theme infrastructure, and localization utilities. Customer compositions, view models, layouts, status presentation, and payment navigation remain customer-owned.

## Visual system

The customer visual language uses Solar Gold for primary actions and important highlights and deep aubergine for contrasting hero surfaces and premium depth. Colors are exposed through semantic tokens rather than hardcoded component values. Suggested token responsibilities include:

- `--customer-action-primary`
- `--customer-action-primary-foreground`
- `--customer-surface-hero`
- `--customer-surface-elevated`
- `--customer-chart-primary`
- `--customer-chart-comparison`

Light and dark themes provide separate token values while retaining the same hierarchy. Dark theme uses a darker aubergine rather than reverting to blue. Success, warning, pending, and destructive states use semantic colors distinct from brand colors.

Motion is purposeful and limited to chart entry, progress transitions, and direct manipulation feedback. `prefers-reduced-motion` removes nonessential motion without hiding information.

## Customer application shell

Mobile uses a safe-area-aware bottom navigation for หน้าแรก/Home, เอกสาร/Documents, and บัญชี/Account. Desktop and tablet use a compact top navigation and a centered consumer-app content width rather than the staff sidebar and full-width operations workspace.

The shell owns customer navigation, locale and theme controls, page-width constraints, route-level loading presentation, and the customer token scope. It does not own financial state or authorization decisions.

## Customer home

The home component tree is:

```text
CustomerHomePage
├── CustomerWelcomeHeader
├── CurrentBillHero
│   ├── BillingStatus
│   ├── AmountDue
│   ├── DueDate
│   └── PrimaryPaymentAction
├── BillBreakdown
├── CustomerEnergyChart
└── RecentFinancialRecords
```

### Focused bill

The server selects one focused bill using the following priority:

1. Oldest overdue record
2. Partially paid record with a remaining balance
3. Nearest upcoming due date
4. Pending-verification record
5. No open record, represented as paid up to date

If more open records exist, the UI shows their count and links to `/billing`. It does not merge them into a single payment action because payment submission is scoped to one billing cycle.

### Bill breakdown

The breakdown uses persisted financial values only:

- consumed energy
- rate
- persisted subtotal
- persisted tax
- billed amount
- approved paid amount
- outstanding amount

The browser does not recreate authoritative accounting calculations. It may format values but does not infer absent values as zero or invent a previous-balance line.

### Energy chart

The chart supports 7-day and 30-day ranges, a touch- and pointer-accessible tooltip, localized labels, loading and unavailable states, and entry motion that respects reduced-motion preferences. It renders only production data supported by current APIs.

### Recent records

The home page shows the latest three unified financial records with period, document number, billed amount, approved amount, remaining amount, due date, lifecycle status, and capability-driven action. A “ดูเอกสารทั้งหมด / View all documents” link opens `/billing`.

## Customer documents

`/billing` uses customer cards at all breakpoints instead of the staff desktop table. It retains cursor pagination, search, period filtering, and the current public lifecycle tabs:

- all
- awaiting payment
- pending verification
- partially paid
- overdue
- paid

Each record card exposes period, document number, billed/paid/outstanding values, due date, related evidence or receipt count, lifecycle status, and capability-driven actions. Loading additional records uses the existing cursor model.

## Customer financial record

The detail page separates customer presentation from staff verification controls:

```text
CustomerFinancialRecordPage
├── RecordStatusHeader
├── BillingSummary
├── BillBreakdown
├── PaymentProgress
├── FinancialDocumentTimeline
└── CustomerRecordActions
```

Mobile is a single readable sequence. Desktop may use two columns for the summary and document area, but it remains a consumer layout rather than a review workspace.

The document timeline contains the current billing statement, submitted payment evidence in chronological order, and issued receipts. Pending evidence remains prominent. Rejected evidence shows the reason and a resubmission action without removing the prior attempt.

Document preview is full-screen on mobile and a wide modal on desktop. PDF and image previews include a download action. Preview failures explain the problem and offer download rather than leaving an empty frame.

## Payment flow

The payment experience is a mobile full-screen flow and a wide desktop dialog:

1. **Payment instructions** — display the enabled default PromptPay or QR instruction, outstanding amount, billing-statement number, and copyable bank details.
2. **Transfer details and evidence** — full amount by default, optional other amount, paid date, transfer method, optional note, and JPG/PNG/PDF evidence.
3. **Review** — summarize the billing cycle, destination, declared amount, paid date, method, and evidence before submission.
4. **Pending-verification confirmation** — explicitly confirm receipt of evidence, show the verification timeline, and offer return-home and record-detail actions.

The confirmation never calls an unverified submission “paid” or “successful payment.”

Mobile supports camera or file selection. Desktop supports drag-and-drop and file selection. Both provide preview, replacement, and removal before submission. Back navigation preserves entered data.

Validation covers supported MIME types, the 10 MB limit, positive amount, amount no greater than the outstanding balance, and a non-future paid date in the customer UI. Errors are localized, shown beside the field and in an accessible summary, and preserve unaffected form state for retry.

The existing server transaction and evidence-hash duplicate checks remain authoritative. The client disables repeated submission while a request is pending and presents duplicate-evidence conflicts specifically.

## Customer organization and account

`/settings` uses customer-specific presentation for:

- read-only contracted organization identity, address, and tax information
- editable display name and avatar where currently permitted
- notification preferences through the existing preference API
- existing password and two-factor security actions

It does not expose staff, role, permission, system, banking-management, or technical settings.

## API design

### Customer home projection

Add a customer-only endpoint:

```http
GET /v1/customer/portal/home?range=7d|30d
```

The response contains the scoped site, focused bill, additional-open-bill count, energy series, three recent financial records, and permitted actions. The server reuses existing services and remains authoritative for scope and focused-bill ordering. It returns canonical values and statuses; localization stays in the client.

### Payment instructions projection

Add a customer-only endpoint:

```http
GET /v1/customer/portal/payment-instructions
```

It returns only the enabled default receiving account fields needed for display, PromptPay details, and the active QR asset. It does not expose bank-account management fields or non-default accounts.

### Existing endpoints

Reuse existing scoped record detail, payment submission, payment history, and document preview/download endpoints. If additional customer display values are required, add optional fields to a customer contract or customer-only endpoint. Do not change staff response semantics.

All customer endpoints enforce the authenticated `customer_user` role and current assigned-site policy on the server. Client route state, IDs, and hidden controls are never authorization mechanisms.

## Localization and themes

Every customer-visible label, state, validation message, empty state, error, and confirmation uses translation keys for Thai and English. No customer component embeds paired Thai/English ternaries as its long-term translation mechanism.

The initial implementation supports all four combinations:

- Thai/light
- Thai/dark
- English/light
- English/dark

The initial locale remains Thai. The initial theme follows the current system preference behavior. User preference updates continue through the current preference mechanism.

## Responsive and accessibility requirements

- 360 and 390 px: one column, no page-level horizontal overflow, safe-area bottom navigation, full-screen payment and preview surfaces.
- 768 px: use two columns only where reading order remains clear; payment instructions and form may split.
- 1280 px and wider: centered maximum-width consumer layout; bill hero and breakdown align side by side; charts and records use the available content width.
- Touch targets are at least 44 px.
- Mobile inputs use at least 16 px text to avoid browser auto-zoom.
- Focus order follows the visual and task order.
- Dialogs trap and restore focus correctly.
- Status is never communicated by color alone.
- Brand and semantic foreground/background combinations meet WCAG AA contrast.

## Loading, empty, stale, and failure behavior

Major components provide shape-preserving skeletons, explicit empty states, local retry actions, and stale-data indicators while background refresh retains prior content. Routine refetches do not replace the entire page with a spinner.

Payment upload or submission failures preserve all unaffected input. Document preview failure offers download. Customer-home API failure may fall back to independent existing reads only if that fallback preserves the same scope and canonical status rules; otherwise it shows a scoped retry state.

## Verification strategy

### Unit and contract tests

- focused-bill priority and all lifecycle states
- customer view-model normalization and money/date formatting
- billed, approved, and outstanding presentation
- localization completeness and token invariants
- customer-home and payment-instruction response contracts
- customer scope and capability enforcement
- absence of bank-management-only fields
- unchanged staff endpoint contracts

### Component tests

- home states, energy ranges, and recent records
- document filters and cursor loading
- payment navigation, partial payment, validation, retry, and confirmation
- rejected evidence and resubmission
- document preview and fallback
- account and preference surfaces
- Thai/English and light/dark combinations
- keyboard behavior and reduced motion

### Browser tests

- home → record → payment → pending verification
- rejected evidence → resubmit
- partial payment → remaining balance → next payment
- recent records → all documents → record detail
- document preview and download
- customer account and preferences
- 390, 768, and 1280 px viewports
- automated accessibility scan and manual keyboard flow

### Regression protection

Run existing owner, admin, accountant, and operator tests for every vertical slice. Staff navigation, tables, modals, capability checks, and financial lifecycle behavior must remain unchanged. Customer visual baselines are separate from staff baselines.

## Delivery sequence

Each slice is implemented, verified, and reviewed before starting the next:

1. Customer foundation and shell
2. Customer home and customer-home API projection
3. Customer financial record and payment flow
4. Customer documents
5. Customer organization and account
6. Cross-cutting accessibility, performance, localization, theme, and regression hardening

Routes remain stable throughout. No big-bang cutover is required.

