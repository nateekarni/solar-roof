# Document layout refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement task-by-task.

**Goal:** Produce modern formal future originals with full-width customer identity, prose PPA and final-page signatures.
**Architecture:** Keep the shared frozen-snapshot renderer and saved-original channels. Capture protocol site identity at issuance and render all layout from that snapshot. Version future templates without touching existing artifacts.
**Tech Stack:** TypeScript, pdfmake, TH Sarabun New, PostgreSQL, node tests.
**Spec:** docs/document-layout-refinement-grill-2026-10-08.md

## Global Constraints

- Preserve saved historical originals and existing accounting/authorization rules.
- Exact TH Sarabun New and approved logo; black and light gray; no added dependencies without concrete need.
- No invented legal terms, signing dates, site identifiers or customer facts.
- Implement on codex/document-layout-sarabun; no runtime, database, SMTP, push or merge actions by implementer.

### Task 1: Frozen identity and shared document presentation

**Files:** document-layout.ts and specs, contract-pdf.service.ts and specs, local-test-pdf.ts and specs, billing issuance snapshot query and associated tests under apps/api/src/modules; new focused PDF regression test/fixture helper as needed.
**Consumes:** Existing DocumentSnapshot, ContractSnapshot, renderDocumentPdf and immutable artifact-first lookup.
**Produces:** Optional frozen siteExternalId and contract effective/payment fields consumed by shared renderer; future template versions sarabun-a4-v3 and ppa-th-sarabun-new-v2.

- [x] Read the accepted spec and repository AGENTS/CONTEXT instructions. Locate exact issuance queries via `rg -n 'site_name|external_site_id|customer_snapshot' apps/api/src/modules`.
- [x] Add failing behavioral tests: future snapshots capture external_site_id; legacy missing ID never substitutes UUID; PPA exposes effective dates and each rate as prose, no visible data table; issuer header/customer full width; blank signing dates; continuation headers; final-page signature layout; numeric widths fit contents; ordinary PDFs one A4 page and long PDFs preserve all rows.
- [x] Run focused existing node/tsx test commands and record red failures before implementation.
- [x] Add optional frozen siteExternalId to DocumentSnapshot and carry external_site_id from actual site issuance queries to contract/financial snapshots. Expose existing frozen startDate/endDate/paymentTermDays to rendering without inventing values.
- [x] Replace rigid issuer/customer grid with issuer upper-left logical lines and right document metadata, full-width customer below. Use soft spacing/type weight, black/light gray only. Site display `ไซต์งาน: <name> (<protocol ID>)`, name-only for absent ID.
- [x] Render PPA factual prose for parties/site/effective dates/each dated rate/payment terms. Preserve complete existing facts and exact decimals. No legal clauses added. Paired signatures with blank signing date lines.
- [x] Anchor signature block on final-page bottom and protect footer; continuation headers compact. Choose a safe pdfmake pagination strategy and document any reserved-space tradeoff. Avoid signature-only final pages when reasonable; completeness/readability take priority for unusually long content.
- [x] Numeric columns auto-size to formatted values; descriptions use remaining width. Maintain readable existing font sizes and repeated table headers, ensure long row content remains complete.
- [x] Bump future template versions only. Run focused tests and API typecheck. Render ordinary contract/invoice/receipt and stress fixtures to the authorized visualization directory; inspect page counts, text bounds, final signature positions, fonts and complete content.
- [x] Commit only task source/tests plus accepted spec/plan with per-command identity Nateekarn S. / nateekarn.ns@gmail.com. Write implementation report with exact commands/results, hashes, evidence paths and pagination tradeoffs.

### Task 2: Root integration and release evidence

**Files:** docs/document-layout-refinement-verification-2026-10-08.md; existing runtime integration checkout only reviewed merges.
**Consumes:** Reviewed Task 1 commit and frozen snapshots.
**Produces:** Verified actual HTTP/MQTT issuance, PDF channel parity and updated existing draft PR #6.

- [ ] Record all current saved-original hashes before creating additive new fixtures; never reseed.
- [ ] Merge reviewed document commits into codex/document-site-integration and restart owned API.
- [ ] Run existing normal MQTT fixture and document-channels.integration.ts with explicit local acceptance environment. Verify actual contract/invoice/receipt PDFs, saved/download/mail attachment hashes and old-original hashes.
- [ ] Verify browser iframe/download/print use saved bytes; inspect ordinary one-page PDFs and stress continuation/final-page signatures visually.
- [ ] Run full tests, lint/types and relevant opt-in PostgreSQL contract-original tests; record exact results.
- [ ] Obtain most-capable final delta review, fix/review findings, commit verification docs, push authorized feature branch and update draft PR #6 without merging main.
