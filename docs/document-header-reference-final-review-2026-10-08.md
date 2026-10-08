# Final compact document header review — 2026-10-08

## Scope and verdict

**Ready to merge: Yes.** No actionable Critical, Important, or Minor source findings in the reviewed header-refinement delta.

Reviewed base `4a26f9f6fa3e1d0999cd7a0434b46a5304e527a1` through head `4b05c5b9fc625da1701e59ee25357fe8a9fb0971`, against the accepted grill specification, immutable final-review package, Task 1 report/review, and root verification record. The review was read-only except this report. No suites, servers, databases, merges, or pushes were run by this reviewer.

## Strengths and requirement alignment

- `apps/api/src/modules/documents/document-layout.ts:178` derives literal 15/10/35/10/30 percent widths from the printable A4 area, with zero additional column gap. The stacked logo, logically separated issuer rows, and right-aligned title/English title/number/issue date preserve the accepted structure; customer identity remains full width below the complete header. Due date remains in invoice body content.
- `document-layout.ts:141` measures text and image height using the same font/layout engine. The bounded continuation logo and measured top margin prevent its tall source aspect ratio or wrapped identifier from colliding with continuation content. The separate footer page-label column and extra measured height retain complete long identifiers and page labels. Existing final-page-only paired signature construction remains intact.
- `contract-pdf.service.ts:59` and `local-financial-application.service.ts:71` select the new stacked PNG only when creating future originals. The resulting data URI is frozen in the same persisted snapshot used for rendering; contract and financial future template versions are consistently advanced to `ppa-th-sarabun-new-v3` and `sarabun-a4-v4`. Existing originals return before current logo/settings rendering. Delivery continues to retrieve saved artifact bytes.
- The unchanged TEST financial policy/hash and legacy logo compatibility metadata follow the explicit execution ruling. The presentation logo is independently frozen in snapshot fields; no accounting/readiness rebind or historical rerender is introduced.
- New regressions inspect actual pdfmake line/image coordinates, complete long values, readable font sizes, continuation clearance, and every page label. Issuance tests compare frozen image hashes with the selected file, rather than testing only a path string.

## Evidence assessed

- Inspected saved geometry for all nine fixtures / 25 pages. Ordinary contract, invoice, and receipt each occupy one page. Long cases preserve their serialized snapshots, have exactly two signature labels only on their final page, and record maximum line bottoms below 830 pt.
- Independently inspected the actual issued receipt raster and refreshed `fixtures/long-header-5.png`. The receipt retains its wrapped title, complete customer/body facts, readable black/light-gray typography, and single-page signatures. The refreshed long final page shows the complete continuation logo/title/identifier, clear body, paired signatures, wrapped footer identifier, and Page 5 / 5. The earlier stale-raster finding is resolved.
- Read actual PDF evidence: all three new originals are single-page documents with embedded TH Sarabun New family fonts. Read historical hash evidence recording 16 preserved originals and 19 current originals after the three additive issuances.
- Root verification records integrated test/lint success (eight tasks each; API 268 passing, web 220 passing), actual PostgreSQL 12/12, normal HTTP/MQTT issuance, stored/download/SMTP attachment byte parity, browser saved-original byte parity, and all 16 historical hashes unchanged. These runtime checks were assessed as supplied evidence and were not independently rerun.

## Issues

### Critical

None.

### Important

None.

### Minor

None remaining in the reviewed delta. The scoped review's stale PNG was refreshed and independently inspected here.

## Assessment

The implementation meets the accepted geometry and future-original snapshot requirements without changing retrieval of historical bytes. Regression coverage and the supplied runtime evidence support pagination, exact font use, channel parity, and immutable-original behavior. No source correction is requested before integration; no main merge or deployment was performed by this review.
