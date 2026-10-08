# Reference PDF redesign — verification and decisions

Date: 2026-10-08. Scope: prospective originals, accepted Q1–Q12 in document-reference-redesign-grill-2026-10-08.md. Existing draft PR6 remains against codex/ui-financial-integration; main is not merged or deployed.

## Decisions

- User accepting all twelve recommendations is design confirmation. Existing execution/push/draft-PR authorization applies; another confirmation menu would duplicate it. If interpreted incorrectly, the cost is reviewable, reversible branch work.
- Immutable PPA documents are the authority for contract numbers, avoiding a second mutable column. Unissued legacy contracts show no invented alias, and historical UUID numbers remain as issued. The cost is that old records retain their old visible labels.
- A single exported BRAND_PRIMARY token supplies web CSS and new PDF snapshots; colors are frozen at issue time. The cost is intentionally retaining historical colors when the current theme changes.
- Receipt title uses 26pt “ใบเสร็จรับเงิน”, with a separate 14pt “ใบกำกับภาษีทดสอบ” classification and 16pt English combined label. This preserves the accepted combined TEST classification while avoiding an ordinary second page. No text or font roles are removed.
- PPA clauses use tighter heading spacing while retaining 16pt body text and complete content. Long documents continue normally and paired signatures stay at the bottom of the last page.
- Existing actual PDF artifacts are never replaced to test layout fixes. Each normal test flow issues a new numbered original and proves preservation of all earlier hashes.

## Verification status

Reviewed source revision c13b9bb; integrated revision 8021045492e682fccc636ba2a60229b12d874ec0. Fresh actual-flow verification passed; final independent whole-delta review approved at6227dbc with no blocking findings and no source fix wave. Root API, MQTT, PostgreSQL, object storage and SMTP checks use only the explicitly guarded loopback synthetic fixture. No live email recipients or production data.

Before final layout adjustment, 25 actual stored originals were captured as a separate immutable integrity baseline; the initial 19-file baseline is also retained.

Root actual PostgreSQL billing-source boundary suite: 5 passed, 0 failed, 0 skipped, covering nearest source readings, deterministic duplicate provenance and contradictory evidence rejection.

Browser original proof: human-numbered contract list, preview/print/download same original blob, safe human filename, downloaded SHA-256 equals saved original, desktop/mobile overflow and no page errors. Initial harness opened the menu before the page was stable; a post-menu diagnostic locator also became hidden by modal accessibility. Corrected harness passed without changing application code.

Task3 fix2 offline inspection: all11 PDFs /40pages have zero outside-page text characters and exact embedded TH Sarabun New roles14/16/18/22/26pt. Exact ordinary issued receipt fits1page and PPA2pages; stress fixtures preserve long content.


Final integrated `pnpm test`: 8 tasks successful; API308 passed/5 opt-in skips, web223, worker18, domain23, connectors3;0failures. Unchanged packages reused Turbo cache. Final integrated `pnpm lint`:8tasks successful. Separately opted-in PostgreSQL numbering/contract-original11passed0skips and billing-source boundary5passed0skips.

## Actual normal application flows

Both final flows used real HTTP site/contract/billing/payment endpoints, the normal MQTT ingestion service, PostgreSQL persistence and actual captured local SMTP messages. Physical input10000000Wh→11234567Wh normalized to1234.567kWh. Calculation1234.567×3.5000=4320.98; simulated7%tax302.47;total4623.45THB.

| Flow | Contract | Invoice | Receipt | Pages contract/invoice/receipt |
| --- | --- | --- | --- | --- |
| One complete transfer | PPA261000003 | INV261000003 | RCP261000003 |2/1/1|
| Rejected evidence, then two approved transfers | PPA261000004 | INV261000004 | RCP261000004 |2/1/2|

The second flow rejects a complete synthetic slip, keeps its history, accepts2000.00 and2623.45, denies partial approval409, approves only the exact full total and excludes the rejected transfer from the receipt. Optional payer name/method/origin bank/account are reviewed and frozen; both approved transfers remain visible. Cash is rejected400 and another organization cannot submit payments or retrieve originals. Retry approval returns the same receipt/hash; retry sends produce no extra SMTP message; arbitrary recipient is rejected400 and customer contract sending403.

For all six new originals, the saved SHA-256, authenticated download and captured SMTP attachment bytes match exactly; subjects and download filenames use the actual issued human number. Final browser proof passed again for PPA261000003, including original preview/print/download, filename/hash, desktop/mobile bounds and no page errors.

All nine pages of the six final originals were rendered through Poppler and visually inspected by root. Exact embedded TH Sarabun New14/16/18/22/26pt roles and zero outside-page text characters independently checked. Ordinary invoice/receipt each fit1A4; PPA complete written clauses and paired signatures fit2A4. Multiple-transfer receipt safely spans2pages and issuer signature is at the bottom of the final page. No visible footer identity/page counter. Stress fixtures separately preserve oversized rows, every rate and approved transfer.

Historical integrity: original19/19 unchanged; later pre-fix25/25 unchanged. Current31artifacts are intact; layout fixes only issue new originals.

Evidence directory on the task host: D:/Dev/solar-roof/.superpowers/document-reference-redesign. Flow evidence JSON, original PDFs, mailpit copies, browser evidence, font/bounds reports and PNGs remain there. Test harness failures are retained separately rather than misrepresented as application fixes.

Independent final reviewer recomputed all six PDF/SMTP hashes and the browser-download hash, inspected all nine actual pages, and approved specification and quality. Full report: document-reference-redesign-final-review-2026-10-08.md. All six actual SMTP attachment filenames independently checked as issued humanNumber.pdf.
