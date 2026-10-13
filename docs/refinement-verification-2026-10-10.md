# Approved UI and document refinement verification

Scope: the nine-point request approved on 2026-10-10. Work extends the existing dirty checkout; no commits, deployment, issued PDF replacement or real financial writes.

## Financial navigation and Dashboard

- Live local PostgreSQL: all 16 bill/receipt collection-status list and summary requests returned 200.
- Collection cohort uses issued current invoices; counts and amounts distinguish paid, pending review, overdue and not yet due. Paid amounts include approved partial payments, while paid counts include fully settled invoices.
- Bill list shows one overdue column combining days and successful reminder cycles. Review confirms recipient/channel duplicates do not increase cycle count.
- Browser: pending-review filter shows two fixture rows and preserves date/status context through detail navigation and back link.
- Browser: all 14 authorized sites appear in comparison; date validation blocks ranges beyond three calendar months; mobile has no page-level horizontal overflow.
- Comparison graphs use full applied calendar range: missing financial events are zero; missing production readings stay null.
- Browser: Solar/building and latest alerts share a desktop row; collection donut renders correctly after chart animation.
- Live role comparison: owner/accountant/admin/customer all return 200; customer sees one assigned site, technical context is stripped, and a different site returns 403. Admin finance is null.
- Task 1 and Task 2 independent reviews are clean after scoped fixes.

## Site and settings browser checks

- Owner /settings/system redirects server-side to /settings; admin retains technical settings. Neither displays removed business defaults.
- Password masks absent for owner/admin.
- Inline create modal: one dialog, full document identity fields, paired coordinates, desktop/mobile390px within viewport.
- Intercepted POST carries newOrganization plus latitude/longitude and no existing customer ID; the interception returned400 and created no records.

## Documents

- Production renderer creates one-page A4 synthetic invoice and receipt samples under output/pdf/refined-sample-*.pdf (matching PNG previews alongside).
- Compact reference structure uses bundled licensed Sarabun, not the reference's embedded Sukhumvit font. Existing logo, brand, frozen company facts and amounts are retained.
- All 13 rendered pages inspected: two samples, three-page long invoice, five-page long receipt, three-page oversized description. No clipping, overlap or blank/signature-only last page. Continuation identity and page counts remain visible.
- Issued original PDFs are not regenerated; the new template applies to newly rendered documents.
- PDF and site/settings task reviews are clean.

## Final checks

- Web: 365 tests passed, zero failures/skips.
- API: 489 tests, 477 passed, 12 opt-in integration tests skipped, zero failures.
- Web/API/contracts typechecks and final production web build passed.
- Full web suite caught a missing legacy collection fallback action; restored it and reran the full suite successfully.
- Local API restarted to load final changes. Broad final integration review clean; no actionable regressions found.

Limits: live site-creation concurrency was verified through transactional lock fixtures, not a live PostgreSQL write test. Local data was not changed by browser form verification. PDF samples are visibly marked synthetic.
