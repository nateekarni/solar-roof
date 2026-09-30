# Financial proposal v2 — review only

Updated after accepted Q1–Q37, 2026-09-30. **60 changed/new files; not applied.** Review `../financial-proposal.patch`; `manifest.json` and `patch-base-hashes.json` identify its files and exact current-source baseline. Full proposed files are in `files/`.

## What changes

| Area | Proposed behavior | Verification / remaining boundary |
|---|---|---|
| Month close | Calendar month closes at midnight Bangkok; scheduler runs from01:00 day1, with durable cursor and deduplicated jobs | Schedule boundary tests; PostgreSQL recovery/concurrent processing tests. New issuance remains blocked by accounting gate below. |
| Actual readings |5-minute tolerance, no synthetic baseline; missing data retries hourly with first and daily staff notices | PostgreSQL partial-month/split-contract/missing-baseline tests. Notices appear in the billing work panel; no staff email destination was assumed. |
| Evidence | Admin records and self-approves actual readings with required reference/reason, including before a cycle exists | School/site/meter identity displayed; server scope enforced. Evidence reference is text, not a new document-upload store. |
| Contracts | Inclusive end dates, explicit per-contract payment days, multiple verified school recipients; defaults autofill only new contracts | End-date normalization,0-day validity, replacement-contract bounds and SQL tests. Controlled termination rejects changes through issued periods. |
| Correction review | Evidence changes calculate impact. A financial actor endorses the request; a different Owner/Accountant approves | Real PostgreSQL rejects Admin→single financial approver bypass and same-person approval. Approval becomes `accounting_blocked`; adjustment issuance is not invented. |
| Settlement | Multiple real transfers may sum to full amount; Owner/Accountant approve; Admin/school users submit evidence | Full-sum tests; transaction rollback tested when accounting policy blocks receipt. No successful new receipt issuance is claimed. |
| PDF | Actual Thai A4 renderer, immutable artifact bytes/hash shared by delivery/download and invoice/receipt preview | Real renderer plus visual inspection. Original stored PDFs can be retrieved; absent originals are unavailable, never reconstructed. |
| Recipients | Current active verified accounts in contract school only; changed email requires reverification | PostgreSQL eligibility and verification code expiry/attempt/replay checks; scoped APIs. New own-account code verification screen. |
| Delivery | Durable outbox; initial attempt plus retries after5m,30m,2h,24h; failed/uncertain states visible | PostgreSQL duplicate-dispatch, byte equality, skipped recipients, exhausted budget and ambiguous timeout tests with injected sender. Real SMTP delivery not tested. |
| Reminders | Disabled initially; explicit positive day offsets required; pause during payment review, stop paid/cancelled | Stored text settings parsed, atomic settings writes, queue/pause tests. |
| Configuration | Blank active company/bank config and payment-day default on new setup; opt-in development/test sample script only | Exact old samples are retained but marked unconfigured; no user-edited account deleted. Company/bank seed script was not run. |
| Historical records | Original records retained, original PDF retrieved when available, no regeneration from mutable data | Local S3-compatible HTTP fixture checks original bytes and rejects URL/path traversal/non-PDF. Actual deployment bucket not tested. |

## Important accounting gate

The user chose an accounting confirmation form instead of inferred tax policy. `requireAccountingPolicy()` deliberately rejects **all new invoice/receipt issuance**, even when measurements are complete. The scheduler creates/calculates eligible cycles but records blocked issuance. Receipt failure rolls back payment approval in the same transaction. Financial correction approval preserves original documents and stops at `accounting_blocked`.

This is a tested review proposal, **not a production-ready financial release**. Tax rates/inclusion, legal issue events, rounding, numbering, withholding, cancellation/reissue and credit/debit document details still need `../accounting-confirmation-form.md`. Confirmed policies must then be implemented and tested; toggling a flag alone is insufficient. Do not apply this patch expecting automatic customer billing to become active immediately.

## Migrations and operational details

- Existing migration009 is not rewritten; its checksum stays valid. Migration011 drops sample defaults and marks only exact untouched known sample records unconfigured. Thus active settings are empty although legacy sample rows remain retained internally.
- Proposed migrations011,013,015,016,017 and the migration list are isolated. Migration016 prevents later email queuing from making a historical document eligible for reconstruction.
- Migration017 adds separate financial endorsement. Its new separation constraint is `NOT VALID` for existing history, while enforced on new writes; legacy approvals require reconciliation before validation.
- A Thai-capable, appropriately licensed font is required at `FINANCIAL_PDF_FONT_PATH`; absence fails explicitly. Validation used an installed Windows Thai font, not a bundled redistribution.
- Provider acceptance is not inbox delivery. A timeout with an unknown SMTP outcome is marked uncertain and requires reconciliation rather than blind retry. Staff retry/reconciliation controls for exhausted/uncertain sends remain a follow-up UI/API requirement before release; current panel exposes the state.
- Payment upload parser is limited to14MB request payload; ordinary JSON requests remain100KB. Multiple large attachments must fit the aggregate request limit. Object-storage upload for payment evidence and malware scanning were not introduced here.
- The scheduler starts from the previous closed month on first migration; earlier financial history is not automatically rebilled. Existing legacy cycles without compatible contract snapshots block with reconciliation required.

## Verification performed

1. Isolated overlay of API/web/worker with proposed files; active application paths never overwritten.
2. **29 focused tests passed,0 failed,0 skipped**, including actual local PostgreSQL, real PDF generation and local HTTP storage fixture. Financial SMTP success/failure uses an injected transport boundary, not external customer mail.
3. API, web and worker TypeScript checks passed. Proposed web production build passed. Build emitted4 CSS optimizer warnings for malformed generated selectors in the nested validation checkout; this warning remains unresolved and is not described as a clean build.
4. Proposed migrations applied and checksum reruns passed on dedicated local `solar_financial_v2`, separate from prior readiness database and user databases. No production migration executed.
5. Browser smoke passed login, own unverified email state, truthful missing-SMTP error, loaded settings, pending financial jobs, no manual monthly-create button, hidden sample company data, mobile width, zero JS errors and no unexpected HTTP5xx. Final shared financial PDF viewer received typecheck/build; its modal interactions were not included in that browser smoke.
6. Browser validation found/fixed two runtime defects missed by typechecks: scoped body parser suppressing login JSON parsing, and settings controller dependency injection absent under tsx.
7. Independent review fixed recipient lookup scope, contract-school join, text-valued reminder parsing, pending-payment state overwrite, historical artifact eligibility, two-financial-actor correction separation, exhausted delivery crash state and ambiguous SMTP outcomes.
8. Active-source hash check:305 files under apps/packages/infra unchanged; no added active files. `git apply --check` passed; no `git apply`, commit or deployment occurred.

Artifacts from local fixture validation are under `artifacts/` (ignored), with reproduction scripts alongside this report. They contain test data, not customer documents. The patch includes regression tests but these financial tests are invoked explicitly; they are not yet added to the default API `src/**/*.spec.ts` test script.

## Review order

1. Billing invariants/persistence and migration011: dates, readings, contract snapshots and fail-closed accounting boundary.
2. Financial automation/delivery, artifacts and migrations013/016: scheduling, concurrency, recipients, immutable bytes and failure recovery.
3. Correction controller and migration017: two financial actors and preserved originals.
4. Settings/contract/payment/PDF UI, identity verification and authorization guards.
5. Regression tests and migration registration; then supply accounting decisions before planning application/release.
