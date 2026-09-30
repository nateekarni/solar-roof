# Financial proposal v2 Implementation Plan

> For agentic workers: use subagent-driven-development for isolated proposal tasks and independent review. Never apply proposal files to active source.

**Goal:** Produce a reviewable, tested financial diff matching the accepted Q1–Q37 decisions.
**Architecture:** Edit complete proposed files under `docs/financial-proposal/files/` only. Reuse transactional PostgreSQL financial persistence; add durable scheduling/delivery, immutable PDF artifacts and explicit accounting-readiness gates. Overlay into a disposable validation directory for checks.
**Tech Stack:** TypeScript, Nest, Next, PostgreSQL, worker, SMTP/PDF.
**Spec:** `docs/financial-decisions-2026-09-30.md`, latest accepted rounds override earlier conflicting answers; `docs/accounting-confirmation-form.md` remains pending.

## Global constraints

- Review only: no active financial source edits, production database writes, migrations, seed execution, commits or deployment.
- Automatic month close, process01:00 Asia/Bangkok day1; hourly missing-data retry and daily staff summary; actual issue date plus contract calendar days.
- Inclusive UI rate end dates;5-minute real reading tolerance; no estimation; Admin evidence entry/self-approval requires evidence/reason.
- Owner/Accountant financial approval; full settlement from multiple transfers; corrections require different financial approver.
- School-scoped selected verified active recipients; PDF artifact reused for email/download; bounded delivery retries; reminders disabled until configured.
- New installation empty configuration; explicit development/test seed only. Do not silently change checksums of already-applied migrations.
- Accounting not confirmed: block tax-dependent issuance with actionable state; never choose VAT/rounding/adjustment rules implicitly.

## Tasks

- [ ] Core: revise proposed billing controller/invariants/persistence/migration011; add evidence readings, contract terms/recipients, inclusive dates, multiple transfers and correction approvals. Regression examples: Jan31 inclusive ends at Feb1 boundary;100→125 at4 yields100; absent baseline rejects; same-person correction approval rejects;6000+4000 settles10000 but6000 does not.
- [ ] Automation/documents: add isolated scheduler/outbox/PDF service and module wiring; worker integration only if necessary. Tests: duplicate ticks one issue; missing data pending; missing accounting blocks issue; real PDF signature; delivery reuses artifact; inactive/wrong-school recipient skipped; bounded retry persists failure.
- [ ] UI/settings: proposed default-day configuration, contract autofill/override and recipient selection, evidence/correction/payment UI aligned to API; opt-in sample seed and blank production configuration. Test zero vs missing term, existing contract unaffected by default edits, recipient scope and invalid values.
- [ ] Integrate schema/interfaces and overlay all files; run proposed API/web/worker typechecks and focused regressions, actual isolated PostgreSQL checks where possible. Review task findings and correct significant gaps.
- [ ] Regenerate patch/manifest with source hashes; `git apply --check` only. Update coverage and verification report, explicitly list accounting-dependent unavailable behaviors and unverified external delivery. Confirm active files unchanged by proposal work.

## Ledger

Execution completed as a review-only proposal:60 changed/new files;29 tests passing, isolated migration/retry, API/web/worker typechecks, web build and browser smoke. See `docs/financial-proposal/review-v2.md` for coverage and remaining accounting/operational gates. Independent reviews found and repaired major flow defects. New document issuance and adjustment issuance deliberately remain blocked pending accounting confirmation. Active source305-file hash check unchanged; patch applicability checked without application. A final shared financial PDF viewer was typechecked/built after browser smoke and is explicitly marked not browser-exercised.

Q37 A confirms shared understanding and authorizes revising/testing the diff only. Existing isolated proposal is reused. No worktree needed because active source must remain untouched and the proposal already has a dedicated directory. Technical retry timings are to be stated in the proposal and covered by tests; no new business choices are inferred.
