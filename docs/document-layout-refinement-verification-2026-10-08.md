# Document layout refinement verification — 2026-10-08

Status: complete; implementation, actual-flow verification and final independent review approved.

## Accepted scope

Issuer details with upper-left approved logo; full-width customer identity; protocol site ID frozen prospectively; factual prose PPA and dated rates; distinct issue/effective/signing dates; paired final-page bottom signatures; compact continuation headers; content-sized numeric columns. Exact TH Sarabun New and black/light-gray palette retained. Only future originals use new templates.

## Historical-original baseline

Before runtime changes, 13 stored document artifacts were hashed from actual PDF bytes and checked against their stored SHA-256. Baseline is preserved outside the repository in document-layout-refinement/original-hashes-before.json. No reseed/reset authorized for this refinement.

## Pagination ruling

Measured signature/footer space may be reserved on all pages while signatures appear only on the final page. This protects content and footer and avoids a signature-only final page. Cost: continuation pages can hold fewer rows. Complete content and readable type remain the priority.

## Verification record

Root will record reviewed commits, fresh suite/type results, actual HTTP/MQTT issuance, exact saved/download/SMTP byte parity, old-original preservation, browser controls, ordinary/stress PDF inspection and final independent review here.

## Fresh verification evidence

- Document implementation e08ec698; task reviewer approved both spec and quality with no findings. PostgreSQL fixture correction fea44aa adds the actual protocol field and freezes metadata correctly.
- Document branch: full pnpm test and pnpm lint, eight tasks successful each. Integrated application at bf1344db: full pnpm test and pnpm lint, eight tasks successful each; API 265 pass / 0 fail / 4 opt-in skips; web 220 pass / 0 fail / 0 skips.
- Focused renderer/snapshot tests 36/36. Actual isolated PostgreSQL contract-original suite 7/7 after fixture correction; root combined PostgreSQL contract-original/billing-boundary suite rerun passed 12/12 with zero skips after scoped review. Initial isolated test failure was missing external_site_id in its minimal fixture schema; actual application schema/live issuance was correct. No production workaround introduced.
- Eight actual pdfmake geometry fixtures include ordinary documents, 60 rates, 45 invoice rows, 35 approved transfers, long identity and a single 100-line row. Complete content, final-only paired signatures, readable margins and compact continuation headers verified. Ordinary fixtures one page, long contract/invoice four, long receipt three, long identity two, oversized row four.
- Root independently inspected ordinary invoice/contract and long-contract final-page PNGs. Actual HTTP-issued originals each have one A4 page with embedded TH Sarabun New faces and frozen DOC protocol ID. Actual contract/receipt/invoice PNGs inspected; numeric columns fit and description gets remaining space.
- Real normal MQTT ingress fixture created site 400ebde8-3ead-475d-98d6-a0baa38be55e through HTTP, explicit billing binding, opening/closing counters 1,234.567 kWh apart; no SQL telemetry/contract/billing insertion.
- Actual HTTP contract 29eb4551-19f9-4113-b5cc-37a9165f7177 and cycle 294b98b9-dea1-4a3f-aa26-ddb70571af31: invoice INV2026100008 and receipt RCT2026100005 total 4,623.45 THB under existing synthetic policy.
- Actual saved PDF/download/SMTP Mailpit attachment byte equality passed for all three documents. Cross-organization access returns 404; send retry produces no extra mail; arbitrary recipient and customer contract-send restrictions passed.
- Browser actual saved-original iframe, download and print links share one blob; real download and desktop/mobile no-overflow checks pass with no page errors.
- Root historical verification preserves all 13 baseline original hashes; current artifact count 16 after three additive future originals. No reseed/reset or original rewrite.
- Evidence outside repository: C:/Users/natee/.codex/visualizations/2026/10/08/01a1194a-084d-7ae1-9eec-a07cb4aac7e9/document-layout-refinement. Ordinary PDF filenames now refer to actual HTTP-issued originals; fixture geometry/hash report records prior fixture renders, stress fixtures retained.

## Exact original hashes

- Contract: 0b3a0b9c2620c5c3b1064ffa4acb53778fe89d1bd6b5edb949514b407e1ec0ba.
- Invoice: 712c13def48a867aaee0e5f79982f99ca5f6c0d72a7d1bcc3059eae2c1d5d65f.
- Receipt: 3471ff6f80858f63de4c575efd3bb9b36c9c52628e72e5a7a91c52793763daa9.

## Maintenance note

Signature measurement uses narrow internal pdfmake APIs. Actual geometry regressions must run when upgrading pdfmake. An impossible signature block larger than the printable page fails explicitly rather than clipping factual content. Existing issued originals remain served as their saved bytes, including their historical layouts.


Final integrated code head 21a7dd2f: fresh full test/lint rerun after the test-fixture correction again passed all eight tasks. API 265 pass / 4 opt-in skips; web 220 pass. Root original hash recheck remains 13/13 preserved (16 current). Actual browser download SHA-256 equals the saved contract original.


Final independent Astra review approved the whole refinement delta fea539a..fea44aa with no actionable findings, including production UUID continuation-header clearance. Draft PR: https://github.com/nateekarni/solar-roof/pull/6. Main was not merged and no deployment performed.

