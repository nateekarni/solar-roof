# Compact document header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development.

**Goal:** Match confirmed reference header using a new stacked logo and 15/35/30 percent columns separated by two 10 percent gaps.
**Architecture:** Update shared future-original PDF header and frozen logo source; preserve original artifact lookup. Keep existing continuation/header/footer pagination regressions.
**Tech Stack:** TypeScript, pdfmake, exact TH Sarabun New.
**Spec:** docs/document-header-reference-grill-2026-10-08.md

## Global Constraints

- Future originals only; no changes to saved historical bytes, accounting policy, platform logo or legal content.
- Exact existing font, black/light-gray document styling and approved symbol/colors.
- New asset apps/web/public/brand/solar-roof-document-stacked.png (generated transparent PNG by root).
- Explicit widths across printable area: logo15%, gap10%, issuer35%, gap10%, metadata30%. No implicit extra columnGap.
- Metadata top-right title, existing English secondary, number, issue date only; no copy badge or due-date duplication.
- Full-width customer below; all factual data/long content retained; readable type and final-page signatures preserved.

### Task 1: Header, frozen logo and regression coverage

**Files:** document-layout.ts/spec/regression/spec fixtures; contract-pdf.service.ts/spec; local-test-pdf.ts/spec; local-financial-application.service.ts/spec; selected stacked PNG; accepted spec/plan. Search actual related logo/template constants rather than broad renaming.
**Consumes:** Existing immutable DocumentSnapshot and generated PNG.
**Produces:** Future financial sarabun-a4-v4 and contract ppa-th-sarabun-new-v3 templates with stacked asset frozen at issuance.

- [x] Read accepted spec, AGENTS/CONTEXT and relevant TDD/PDF skills.
- [x] Add red-first tests for header exact positions/widths, right title/number/date, issuer logical line wraps, selected logo source and version; actual PDF geometry ordinary/long identity/continuation/signatures.
- [x] Change header using five explicit column widths computed from page printable width515.28pt, `columnGap:0`; logo image width77.292pt, issuer180.348pt, metadata154.584pt, gaps51.528pt each. Keep long identifiers/dates complete by wrapping, no forced noWrap or tiny type.
- [x] Use newly generated stacked PNG at contract and financial issuance only; keep original horizontal and platform assets. Handle tall stacked logo in continuation header with bounded image dimensions and suitable header/body clearance; continuation title/number remain legible.
- [x] Bump future template constants and any applicable policy/readiness asset paths consistently. No historical rerender or migration.
- [x] Run focused red/green tests and API typecheck, render ordinary and long PDFs to new evidence directory (no database/server/mail actions). Verify complete text/bounds/font/final-only signatures, ordinary invoice/receipt one page when normal content fits. Preserve typography over arbitrary content squeezing.
- [x] Inspect generated asset alpha and transparent content bounds read-only; image edits only imagegen. Report if asset unusable. No new unnecessary dependencies.
- [x] Commit selected source/test/asset/spec/plan with per-command git identity Nateekarn S. / nateekarn.ns@gmail.com. Full report in task-1-report.md, concise return with commit/checks/risks.

### Task 2: Root actual verification and PR update

- [ ] Capture all existing artifact hashes before runtime changes, merge reviewed feature into integration checkout.
- [ ] Run fresh additive normal HTTP/MQTT contract/invoice/receipt flow; saved/download/SMTP parity, browser controls and historical hashes.
- [ ] Inspect actual A4 header proportions and page counts, stress continuation/footer boundaries.
- [ ] Run full integrated test/lint and PostgreSQL opt-in original/boundary suites. Independent task and final review; fixes scoped and reviewed.
- [ ] Record durable evidence, push feature and update existing draft PR6 (authorized), no main merge/deploy.

Execution ruling: TEST_FINANCIAL_POLICY logo compatibility metadata and hash stay unchanged. New PDF logo is frozen by issuance/template; no financial policy/readiness rebind.

