# Targeted UI verification — 2026-10-09

Implemented the five requested follow-ups while preserving the restored Dashboard layout.

- Shared checkbox cells measure 40px; actions remain 64px. Other columns absorb remaining space.
- Audit owner/admin read access repaired before business-role fallback; other roles and writes remain denied. Owner browser/API returns HTTP 200.
- Explicit selected site replaces top statistics with a full-width pale yellow configuration summary. Owner receives read-only inventory for already authorized sites. Customer/accountant technical restrictions remain. All-sites statistics remain unchanged.
- Financial record electricity details always visible. Each document/evidence preview lives inside its own expanded row. Download and authorized evidence-review buttons sit at the right of the header before the chevron. Transfer metadata and rejection reasons retained.
- Inline PDF.js renders original verified bytes without native browser controls. Download uses the same original blob. Worker is bundled locally. Receipt and invoice render inside their rows, desktop/mobile have no horizontal page overflow. Pending evidence buttons open the proper review dialog; no payment mutation performed.

Validation: web 348 passing; API 463 passing, 12 optional integration skips; both typechecks and web production build pass. Browser proof is in tmp/targeted-ui-proof; full logs are tmp/targeted-web-tests-final.log, tmp/targeted-api-tests.log, tmp/targeted-web-build.log.

Samples: output/pdf/latest-sample-invoice.pdf and latest-sample-receipt.pdf were rendered with the current production renderer using the existing synthetic renderer-fix-2 snapshots. Both are one A4 page and visually inspected. Existing issued documents were not regenerated. Current template headings remain “ใบวางบิล” and “ใบเสร็จรับเงิน / ใบกำกับภาษี”; the samples intentionally show these current headings faithfully.

No commit, deployment, or real financial mutation performed.
