# Customer Feedback Implementation Plan

> **For agentic workers:** Use subagent-driven-development for scoped implementation and review; execute continuously after user authorization.

**Goal:** Implement the approved site-based service/billing system, simple evidence submission, role-scoped UX and Docker-local-only readable demo seed.

**Architecture:** Site configuration replaces contract prerequisite. Shared role/site policy controls API and navigation. Versioned tariffs/documents and verified transfers enforce financial invariants. Existing original-PDF infrastructure provides previews.

**Tech Stack:** NestJS/PostgreSQL, Next.js/React, domain/API contracts, Docker local, pnpm.

**Spec:** docs/superpowers/specs/2026-10-09-customer-feedback-system-design.md

## Global Constraints

- No OCR. Evidence-only customer submission with optional note; reviewer confirms amount/time.
- One customer account per site, many accounts per site; one gateway per site.
- Admin cannot access finance. Owner configures sites; contracts no longer prerequisite.
- Preserve pre-existing working changes. Work in current workspace to include them; no automatic commits, pushes or production operations.
- Seed Docker local only. Readable real names, no [Test]/[DEMO] labels or IDs as display names; retain technical IDs internally. Never derive fake legal/bank identities as production defaults.
- Approved payments lock amount/rate edits. Issued originals immutable; revision replaces current bill without changing due date.

## Work packages

- [x] A Access/site model: packages/domain/src/access, API guards/identity/dashboard/notifications, migration assignments/config; tests cross-site, no assignment and current-session revocation. Produce authoritative site scope and role rules.
- [x] B Evidence workflow: API payments/billing, API contracts/payments, web payment-dialog/verification/history; tests attachment-only, reviewer amount/time, partial approval/exact settlement/concurrency. Produce verified transfer DTO and mutations.
- [x] C Local seed: scripts/local-review and local-financial-review plus Docker-local runner/guard; tests reject remote/nonlocal/prod targets, readable identity mapping, idempotent/non-destructive behavior. Run only validated local Docker target.
- [x] D Site/tariff/billing: site config migration/service, rate catalog/history/bulk matched-site preview, automatic/manual billing and immutable revisions. Tests rate intervals, existing unpaid selected bill correction, payment locks and unchanged due dates.
- [x] E Frontend/document UX: role navigation, customer/site/gateway flow, Table/JSON, two customer document tables with related links/inline preview; PDF reference layout/logo/signature snapshots. Focused tests and rendered desktop/mobile.
- [x] F Automation/alerts: 01:00 issuance, real-data readiness, reminder pause/resume, persisted rule recipients/delivery attempts. Tests duplicates, scope and delivery failures.
- [x] G Integration review: domain/API/web tests, types/lint/build, local Docker end-to-end and role/viewport verification; repair actionable findings.

Each package starts with failing behavioral tests where behavior changes, then implementation and verification. Review source dependencies before mutation and record execution evidence here. Package boundaries may be split further; do not invent successful checks.

## Execution ledger

- Authorized by user to implement approved design and local-only demo seed.
- Ruling: reuse current checkout because approved baseline contains extensive uncommitted development work; new worktree would omit it.
- Verified dedicated Docker-local project solar-financial-flow-review, loopback PostgreSQL15449; migrations040–046 applied. Guarded seed rerun preserved passwords, assignments, and issued originals. No production operations.

### Delivered behavior

- Site/customer assignments control current-session access. Admin finance routes are denied; customer dashboard has one site. Contract creation/editing is disabled and the old menu redirects to billing.
- Site service settings, one gateway per site, editable Table/JSON fields, device register overrides, tariff catalog/history and selected/matched/all-site impact previews are implemented.
- Manual additional bills calculate configured tax; automatic issuance remains01:00 Bangkok. Unpaid rate corrections create immutable revisions, preserve due dates, update future tariff history, and require confirmation before replacing scheduled rates. Pending/approved transfers block edits.
- Customer payment submission requires only an attachment and optional note. Reviewers confirm actual amount/time per transfer, may add payer/bank details, view the original bill, and see approved/remaining balances. Exact settlement produces one current receipt; duplicate evidence and excess amounts are blocked.
- Thai billing/receipt tables and related-document links show stored PDF originals. Reference layout places logo/document metadata above company/customer columns, items, payment details, notes and signatures. Receipt tax/logo/identity freeze the issued bill values; uploaded evidence bytes are never printable text.
- Persistent alert/reminder recipients and outboxes support bounded delivery retries, pending-payment pause and abandoned-claim recovery. Possibly delivered mail requires reconciliation rather than blind resend.
- Docker-local seed names use readable customer/site/gateway/device/role labels, without Test/DEMO markers or generated identifiers as display names. Remote, unknown, and production seed targets are rejected.

### Verification, 2026-10-09

- API suite:390 tests,381 passed,9 environment-gated integrations skipped,0 failed. Web suite:259 passed. Domain suite:24 passed. Local seed/guard suite:20 passed.
- Environment-gated checks run separately against the verified local PostgreSQL target: notification scope/lifecycle8 passed, abandoned-outbox recovery1 passed, large-evidence/duplicate/partial-settlement/PDF adapter1 passed. The site-billing integration runner passed configured tax, same-day manual bills, immutable revisions, preserved due dates, tariff retirement and pending/partial-transfer locks; transactions roll back test mutations.
- API/web TypeScript checks passed. Next production build compiled successfully using isolated `.next-build-review`; no deployment performed. Logs are under `.superpowers/customer-feedback-*-tests.log` and `customer-feedback-web-build.log`.
- Browser workflow issued INV261000007, customer submitted attachment-only evidence, Owner approved the verified107.00 THB transfer and opened RCP261000006 through the related-document link. Actual exported invoice and receipt PDFs each render on one A4 page. The earlier owned QA receipt with the pre-fix evidence-text layout was superseded by a layout-only revision RCP261000007; its immutable original/payment data remain intact.
- Role/viewport screenshots and browser results are stored at `C:/Users/natee/.codex/visualizations/2026/10/09/01a11ee1-61be-7941-8f68-7374d1c33d65`. Local demo URL: http://localhost:13049.
- Final browser pass covered Owner, Admin, Operator, Accountant and Customer across16 route checks, with no page runtime errors. Admin finance pages were denied; customer mobile390×844 had no horizontal overflow. Desktop screenshots and dark-theme screenshots were captured for all five roles. Build output is gitignored to prevent Tailwind scanning compiled artifacts; the local dev server was restarted and the browser pass rerun after verification.

### Practical limits

- Production financial readiness remains guarded. This work changes the application and local demo; it does not deploy or enable production accounting.
- Real gateway hardware publication/telemetry and external SMTP delivery require the target deployment's connections. Local tests prove authorization, persistence, processing and rendered UX; they do not claim physical device or production email delivery.
- Existing issued originals remain immutable. Layout changes apply to newly generated documents; historical documents retain the saved version and bytes.
