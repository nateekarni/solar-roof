# Document layout refinement interview — 2026-10-08

Status: Q1–Q9 recommendations accepted; user confirmed implementation on 2026-10-08.

## Confirmed requested direction

- Move issuer company details beside/below the upper-left approved logo.
- Give customer identity the full available document width.
- Present site identity as the human site name followed by its protocol Site ID, rather than internal identifiers or technical UI wording.
- Present the PPA as written prose with paired signatures. Visible data tables belong to invoices and receipts.
- Size numeric financial columns to their actual displayed values and reserve more width for descriptions.
- Ordinary invoice/receipt content should fit one A4 page; long content must remain complete and move signatures to the bottom of its final page.
- Retain the accepted exact TH Sarabun New, approved logo, black/light-gray palette, saved-original channel parity and financial rules.

## Verified current facts

- Current issuer/customer blocks use a two-column bordered table; header has logo on the left and title/number/date on the right.
- Shared frozen snapshots currently contain siteName but not the protocol externalSiteId. Internal UUID siteId is not the user-facing Site ID. Future snapshots need the protocol identifier captured explicitly.
- The current PPA has party identities, site/contract identifiers, factual rate schedule, optional payment terms and paired signatures. It has no stored substantive legal-clause body. Existing contract start/end and payment-term days are frozen separately but not fully exposed in the shared renderer.
- Current signatures are an unbreakable block appended to the body, not anchored to the final page bottom.
- Current financial columns reserve 65/65/115pt for quantity/rate/amount, leaving the remaining width for descriptions. Existing ordinary fixtures fit one page; this is not a guarantee for arbitrary content lengths.
- Issued originals are immutable and served as saved bytes across preview/print/download/email. A new layout must not silently overwrite them.

## Decision tree and frontier

1. Header detail density and full-width customer presentation.
2. Missing protocol Site ID presentation for otherwise valid sites.
3. PPA prose content boundary; further legal-source decisions depend on this answer.
4. Multi-rate factual prose arrangement.
5. Document date versus actual signing date versus effective date.
6. Final-page signature alignment and paired-block overflow behavior.
7. Repeated header on continuation pages.
8. One-page readability boundary and complete long-content handling.
9. Future-original versus historical-original change scope.

All recommendations and user answers will be recorded here. No sample legal clause, signature, identifier or unrecorded date becomes factual document data by inference.

## Accepted decisions

1. Modern formal issuer header: approved logo and company name, address, tax identity, contact on distinct logical lines; full-width customer identity below.
2. Site name followed by frozen protocol externalSiteId in parentheses; legacy missing ID displays name only, never UUID.
3. PPA is factual prose with paired signatures, no visible data tables and no new legal terms.
4. Every frozen rate is a dated numbered paragraph.
5. Issue date, effective start/end and blank actual signing date remain separate.
6. Signatures sit at the bottom of the final page with protected footer clearance and paired alignment.
7. Continuation pages have compact logo/title/number headers; financial table headers repeat.
8. Numeric columns fit displayed values, description gets remaining space; ordinary financial documents target one readable page, long content remains complete.
9. Only future originals use new versions. Saved historical originals remain byte-identical across every channel.
