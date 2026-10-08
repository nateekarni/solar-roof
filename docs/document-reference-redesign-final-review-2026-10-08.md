# Final reference-document redesign review

Reviewed 2026-10-08. Immutable scope: `a2c5fe1280e3b7d135456d1cf7023c4964ffb96d` through `6227dbc01e055c5fac55732558f34bee507515a3`, using the supplied `final-review.diff`. This is the complete new redesign delta over the previously reviewed header/reference work, not a fresh review of the PR's unrelated base. HEAD was independently confirmed as the supplied revision.

## Strengths

- `packages/domain/src/document-number.ts:14` provides one transactional allocator for API, generic and worker issuers. Bangkok issuance dates, separate INV/RCP/PPA counters, five-digit formatting, atomic increment and overflow rejection are coherent. Callers persist the number in the same transaction. Billing-cycle lock/recheck and contract advisory-lock/original-first behavior protect the main retry paths.
- `apps/api/src/modules/documents/contract-pdf.service.ts:95` returns the existing immutable original and its actual number before allocation or rendering. New numbers are frozen once and reused by list/search/sort/export, invoice contract references, original loaders, download names and mail. The existing unique contract-original index supports the scalar number lookups; existing pagination handles nullable unissued contract numbers. The shared filename sanitizer prevents header control characters.
- `apps/api/src/modules/billing/local-financial-application.service.ts:70` retains full-settlement validation and freezes only paid transfers. Optional metadata is trimmed, bounded and method-validated in the shared API contract, exposed through the scoped officer detail endpoint, and persisted by registered migration 037. Renderers distinguish origin accounts from issuer receiving accounts and do not fabricate missing values.
- `apps/api/src/modules/documents/contract-pdf.service.ts:56` freezes the ten-clause draft only under the exact existing localFinancialBinding. Capacity conversion is decimal-string based, rates remain complete, and the renderer consumes frozen clause text. No new penalty computation or financial-policy/hash change appears in this delta.
- `apps/api/src/modules/documents/document-layout.ts:373` implements the shared reference arrangement and exact Sarabun roles. Measured signature reservation, breakable tables, auto-sized numeric columns and bounded heading leads address pagination without shrinking body text. Receipt classification remains visibly TEST; receipt signatures are issuer-only, and all signature dates are blank. A shared BRAND_PRIMARY feeds both web CSS and new snapshots.

## Issues

### Critical

None found.

### Important

None found.

### Minor / prior finding disposition

No new source-code finding. The ledger's deferred Task 2 scratch-report concern is resolved in the reviewed delta by the durable `docs/document-reference-redesign-payer-metadata-report-2026-10-08.md` copy and removal from tracked scratch state. Root's planned trailing blank-line cleanup in the plan is cosmetic and does not require a source fix wave. Final plan/review status bookkeeping remains a root finishing action, rather than an implementation defect.

## Verification and review limits

Read the accepted Q1-Q12 specification, implementation plan, durable verification record, progress ledger, prior findings and scoped dispositions. Reviewed the supplied production delta and tests in passes, then followed the relevant unchanged transaction, uniqueness, immutability, query/pagination, local-binding and delivery boundaries. Applicable web guidance was read. No subagents, source/index/branch edits, runtime changes, database actions, sends or package-suite reruns were performed; this report is the only write.

Independent read-only evidence checks against `D:/Dev/solar-roof/.superpowers/document-reference-redesign`:

- Recomputed SHA-256 for each of the six final-flow PDFs and its captured Mailpit attachment: all match both each other and the recorded original hash. Recomputed the browser-downloaded PPA hash: it matches the same saved original.
- Inspected all nine final actual-flow page rasters, not only ordinary fixture examples. Ordinary invoice/receipt are each one A4 page, PPA is two pages with all ten clauses, and the two-transfer receipt is two pages. No visible clipping, overlap or footer identity; role-correct signatures are at the bottom of the final page. Both transfers and their separate amounts remain visible.
- Read both final-flow renderer snapshots: actual human references, frozen primary `#f29700`, financial v5/PPA v4, real 100 kWp capacity, complete ten-clause PPA bodies, and one/two approved transfers agree with the artifacts. Read the font/bounds inspection reports: exact TH Sarabun New and expected 14/16/18/22/26-point roles, zero outside-page characters across all nine actual pages. Read the recorded human SMTP attachment filenames and browser evidence.
- Read historical-integrity evidence reporting 19/19 and later 25/25 prior originals preserved, with 31 current artifacts. These database results are root-run evidence; I did not access or mutate the database to repeat them.
- Read the actual `.superpowers/redesign-final-postgres-layout-fix2.log`: 11 passed, zero failed/skipped, including concurrent originals, typed allocations, rollback and exhaustion. Root's durable record supplies full integrated test/lint success and the separate five-test billing-source boundary run. Those suites were not redundantly rerun in this review. The 40-page stress-fixture inspection is root/implementer evidence, distinct from my independent nine-page actual-artifact inspection.

## Assessment

**Spec compliance: Approved. Quality: Approved. Ready to merge: Yes, within the reviewed redesign scope.**

No blocking finding or final source fix wave is required. The implementation preserves immutable identity/bytes and financial boundaries while delivering the accepted numbering, reviewed payment fields and reference layout. This review supports the authorized existing draft-PR update; it is not authorization to merge main or deploy. Root should finish the durable review/verification bookkeeping and normal pre-push checks.
