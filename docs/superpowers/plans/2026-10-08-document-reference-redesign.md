# Reference documents and human numbering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development.

**Goal:** Match accepted three PDF references and replace new-document UUID labels with stable human numbering.
**Architecture:** Central transactional numbering module shared by all issuance paths, optional reviewed payment metadata, frozen new document snapshots and a shared reference renderer. Preserve historical bytes and existing financial policy.
**Tech Stack:** TypeScript, PostgreSQL migrations, React, pdfmake, exact TH Sarabun New.
**Spec:** docs/document-reference-redesign-grill-2026-10-08.md

## Global Constraints

- Exact accepted Q1–Q12 in spec bind every task. Future originals only; preserve every old artifact/hash/number. No main merge/deploy.
- Number INV/RCP/PPA +Gregorian Bangkok YYMM +five digits; atomic monthly typed sequence with overflow rejection.
- Financial policy/hash/rounding/settlement/scoping unchanged. Reference PPA legal clauses local SYNTHETIC DRAFT only; no new computed penalties.
- Exact TH Sarabun New roles26/16/18/16/14/22pt as accepted; existing stacked logo; central primary accent frozen, gray cards, black text.
- Body/signatures/long rows/rates/transfers complete. No visible footer metadata; final-page bottom signatures.
- Work in existing codex/document-layout-sarabun isolated checkout. Implementers no runtime/SMTP/production DB/push/merge; root owns guarded fixture/migrations/actual validation.

### Task 1: Central human numbering and all display references

**Files:** apps/api/src/modules/documents new allocator +tests, contract-pdf.service.ts/spec/PGspec, billing/local-financial-application.service.ts/spec, billing.controller.ts, generic documents/document.service.ts, dashboard operations service/controller, worker monthly issuance; API contracts/web original loaders/previews/lists/organization selector as required by named surfaces. New migration037 only if real persistent contract-number field needed (existing applied migrations immutable). Read web AGENTS.
**Consumes:** Existing document_number_series transaction and immutable original paths.
**Produces:** Central actual number allocator API and documented contract/document number mapping for Tasks2–3, no renderer style changes.

- [x] Read accepted spec and find all number emitters/display paths using `rg -n 'document_number|contractNumber|NumberSeries|padStart|RCT|REC' apps packages`.
- [x] Write red-first tests covering INV261000001/RCP261000001/PPA261000001, Bangkok month rollover, separate families, concurrency/overflow, rollback/idempotency and old artifact first-return without reallocation.
- [x] Implement allocator transactionally on actual shared counter; preserve original counter rows and historical numbers. A issued number is never reused; failure before issue may rollback transaction normally.
- [x] Assign human PPA number at new contract issuance and store/freeze it. Every invoice/receipt contract reference resolves real stored PPA number; existing historical number retained. Avoid UUID fallback for new normal record. Internal IDs still route requests.
- [x] Replace inconsistent future issuance allocators (local/legacy/worker/generic) with same authority, safe routing of unsupported document families without arbitrary prefix substitution. Preserve gating and no duplicate issue side effects.
- [x] Expose actual document number in original endpoint and list/search/sort/export/organization selection; use stored number for server/browser filenames and mail. Validate Content-Disposition/header escaping, not raw untrusted filenames.
- [x] Run focused tests, API/web/worker types as touched. Record needed migration bytes and interfaces for next tasks. Commit selective source/tests/spec/plan using per-command identity Nateekarn S. / nateekarn.ns@gmail.com.

### Task 2: Optional reviewed payer metadata

**Files:** new migration038 (or next unused ordinal), billing application/controller/DTO/API contracts/payment submission/approval UI/locales/specs, snapshot conversion interfaces. No renderer style edits.
**Consumes:** Task1 reviewed numbering paths; existing scoped payment submission/approval/full-settlement guards.
**Produces:** Optional payerName/paymentMethod/originBank/originAccount frozen approved transfer fields; report exact property names to Task3.

- [x] Write red tests for valid optional metadata, trimmed/length/enum limits, omitted legacy compatibility, rejected malformed values, scoped officer review and approved snapshot freeze.
- [x] Add nullable data columns via new migration; never edit applied SQL. Support current transfer flow metadata without new cash/card settlement behavior.
- [x] Capture optional fields when submitting payment, expose them in officer review, preserve on resubmission/approval semantics and snapshot only approved transfers. Missing values remain absent/dash; receiving accounts never masquerade as payer accounts.
- [x] Add translated Thai/English inputs/review labels and API types, meaningful behavior tests; preserve decimal amounts/authorization/retry behavior. Commit selective code/tests/migration with report.

### Task 3: Reference PDF rendering and frozen local draft

**Files:** documents/document-layout.ts/spec/regression/fixture files; contract/local financial snapshot adapters and tests; shared central branding token source only if needed; new local PPA draft template module/tests and frozen clause field. No numbering changes outside reviewed interface adaptation.
**Consumes:** Stored human document/contract numbers, optional Task2 payment metadata; approved stacked logo.
**Produces:** Future financial sarabun-a4-v5 and contract ppa-th-sarabun-new-v4 snapshots and matching renderer.

- [x] Read all accepted constraints and user PNG references (layout source, draft clauses explicitly adopted only local). Write red tests for numbering/title consistency, three reference layouts, palette snapshot, footer blank, signatures and required text completeness.
- [x] Reuse centralized brand primary, freeze actual chosen color into new snapshots. Old saved originals not rerendered. No hardcoded unrelated accent colors.
- [x] Invoice: header with title/number/issued/due card; paired customer/project cards; table sequence/description/kWh/THBperKWh/amount auto numeric widths; right subtotal/tax/total; Thai amountwords; receiving accounts/accepted remarks paired; paired blank-date signatures.
- [x] Receipt: combined TEST title; reference invoice human number; customer/payment pair; all approved transfers with truthful method/payer/origin fields and date/time; received energy subtotal/tax/total consistent existing calculation (do not double count partial payments); Thai amountwords; recorded remarks; issuer-only right blank-date signature. No invented names/accounts.
- [x] PPA: numbered written clauses1–10; frozen actual parties/site/protocolID/capacity/effective dates/paymentdays and complete dated rate table. Local synthetic draft clause texts frozen from adopted reference; outside guarded local binding, retain factual-only PPA rather than silently publish legal template.
- [x] Typography exact accepted roles, blackgray+primary accent, thin border/card spacing like reference. Match spatial arrangement, not previous literal15/35/30 header. No visible footer metadata; compact continuation header, final-page bottom signatures and no clipping/overlap/signature-only ordinary page. Long rows can continue.
- [x] Run focused red/green geometry/actualPDF tests and API types. Render ordinary and long reference fixtures to root-authorized evidence directory supplied by controller; inspect every page, fonts/text bounds/all rows/clauses/transfers. Ordinary invoice/receipt target1 A4, complete long PPA can span pages.
- [x] Commit selective source/tests/docs report.

### Task 4: Root guarded integration, review and release

- [x] Before any additive writes record every current original hash; root applies only required new migrations to approved loopback synthetic fixture after checking migration bytes/markers.
- [x] After each scoped review merge reviewed feature commits into integration and verify shared application. Run fresh normal HTTP/MQTT→PPA→invoice→payment→receipt; multiple transfers, optional metadata and concurrent allocation; saved/download/SMTP/browser parity, old hashes, crossorg/retry guards.
- [x] Full integrated tests/lint and opt-in PostgreSQL original/numbering/payment boundaries. Independent most-capable final delta review; one scoped fix wave for final findings.
- [x] Record durable verification/review and ADR for permanent human-numbering identity tradeoff, push authorized feature and update existing draftPR6. Keep main unmerged and no deployment.
