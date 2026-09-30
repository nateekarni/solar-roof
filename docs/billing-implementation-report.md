# Billing implementation and financial review — 2026-09-30

> Historical v1 report below. Superseded after Q1–Q37 by [proposal v2 review](financial-proposal/review-v2.md):60 unapplied files,29 focused tests, isolated PostgreSQL and browser verification. Read v2 for current scope and explicit accounting-dependent blockers.

## Current decision

The user requested **review and present the financial diff before applying it**. The proposal is `docs/financial-proposal.patch` (20 files). Complete proposed file contents are under `docs/financial-proposal/files/`; `manifest.json` lists them. **None of those proposed financial changes is active.** New helpers, regression tests and migration011 were moved out of application source/test/migration directories. Migration011 is not registered. No database migration, seed, production-data modification, commit or deployment was run.

## Applied UI / settings changes

- Shared A4 document component replaces invented company/accounts, monthly history, document numbers, readings, environmental metrics and tax calculations. Contract and handover fields remain, with empty states. Existing scoped `/v1/operations/documents` supplies records; no new endpoint. Financial records without immutable snapshots are explicitly unavailable and cannot print/download. Printable documents open in a dedicated window; actual HTML download is labelled HTML, while PDF uses browser Print/Save PDF.
- Table/card preview inputs use persisted IDs and fields; fake tax IDs, dates, signers and hardware defaults removed. Mobile site edit/delete is admin-only, coordinated with dashboard work.
- Billing detail removes fake readings, paid timestamp, receipt number and inferred VAT; email URL/body matches current server DTO; PNG/JPEG/PDF drag/drop preserved with a10MB bound; read failure notifies rather than claiming refresh.
- Payment dialog loads saved bank accounts, removes invalid simulated PromptPay QR and hardcoded bank, removes inferred VAT/rate, checks file size.
- Settings service returns blank company data when absent and requires bank/account name/number for new accounts; existing persistence retained.

## What the review-only proposal changes

1. Real cumulative-meter billing from configured meters and normalized kWh readings at site-local boundaries, within15 minutes. Rate changes are segmented; gaps, overlap, reset, absent baseline or unsupported currency/type reject. PostgreSQL `to_char(...,'YYYY-MM-DD')` preserves calendar dates without driver/local-midnight shifts. A cycle spanning multiple contracts must be split.
2. Explicit rates, open final interval and exclusive end-date semantics; one-site contracts; site lock and active-contract overlap check. `GET /v1/contracts` binds `schoolScope(req.user)` in SQL; the temporary global-guard denial is removed only together with that query.
3. Payment, receipt and audit use one acquired connection and transaction. Cycle row locking makes repeated approval idempotent; atomic number-series updates replace count numbering. Audit actor attribution is supplied for route-driven mutations. Manual financial override is rejected.
4. Issued documents persist a snapshot/hash, with database immutability trigger. Existing scoped operations DTO includes the snapshot so the already applied A4 UI can select only actual issued periods. Legacy documents with no snapshot cannot be silently reconstructed or reissued.
5. SMTP requires explicit recipient/configured sender, uses actual saved invoice content, checks accepted recipients and propagates failure. No default sender/recipient and no fake attachment path. Current proposal sends a truthful text invoice email, not an uncreated PDF attachment.
6. All company/bank records are retained. Migration011 adds `is_configured`; only the **exact entire original migration009 sample business payload plus known ID** is marked unconfigured. Timestamps are intentionally excluded from matching; optional logo, bank label/branch/default flag and any extra columns participate. Reads ignore only unconfigured rows. No DELETE, no bank-account removal, no site/customer-bank inference. User-modified records remain untouched.
7. General settings' `DEFAULT_COMPANY` sample is blank in the proposal; absent `defaultUnitPriceThb` is omitted instead of4.25; contract rate input starts blank and requires explicit entry. These particular remaining defaults are **not changed live**, per the review-first instruction.
8. Legacy in-memory document finalizer becomes durable and delegates issue to the same cycle-based transaction; verification reads persisted data. Legacy standalone payment mutations, manual document creation, direct cancellation and the unused direct monthly invoice writer fail closed rather than bypassing the reviewed workflow.
9. Payment JSON body parsing has a bounded14MB route limit to accommodate the existing10MB base64 upload UI. This is only in the proposal.

## Verification actually completed

- Current frontend: `pnpm --filter @solar/web lint` passed after applied UI work.
- Current API: `pnpm --filter @solar/api lint` passed.
- Isolated full API source copy with all proposed API files overlaid: `pnpm exec tsc --noEmit -p docs/financial-proposal/validation/tsconfig.json` passed. The active source was never overwritten.
- Isolated proposal regressions: **7 passed**:100→125kWh at4THB=100THB; missing/reset/nonfinite readings rejected; open-ended schedule accepted/overlap rejected; empty baseline invalid; transaction callback failure rolls back/rethrows; commit failure cannot return success; contracts bind authenticated school scope.
- The initial empty-baseline test was observed failing against the unchanged live implementation (`complete` instead of `invalid`), then passing only in the isolated proposal. Tests were moved out of active test discovery with the proposal.
- `git apply --check docs/financial-proposal.patch` passed against the current working tree. Patch control lines use LF, resolving Windows newline mismatch. This command is read-only; the patch was not applied.
- Driver-boundary transaction tests use a small external-database test double. They **do not** claim PostgreSQL SQL correctness, simultaneous receipt approval under actual locking, migration execution or SMTP integration. No disposable PostgreSQL integration run, browser print screenshot or real mail send occurred. Proposed frontend changes are simple typed input/default edits but were not overlaid into a separate Next build; current frontend lint is not represented as validation of unapplied frontend code.

## Pending decisions / acceptance gates

- Confirm15-minute meter-boundary tolerance, exclusive rate end date, and rejection/splitting at contract boundaries.
- Confirm full-payment-only handling; partial/overpayment, meter-reset correction, legacy billing reconciliation, cancellation/credit notes and automatic worker issuance need defined workflows. Proposal rejects these rather than silently inventing results.
- Confirm tax treatment before adding VAT/tax-invoice calculations; current/proposed document totals do not infer VAT from an unrecorded rate.
- Confirm real company/bank configuration after exact sample records become unconfigured. The existing migration009 seeds are still present in the live tree until approved migration011.
- Decide whether a separate generated PDF attachment/server download is required; current truthful offering is printable A4 / Save PDF and HTML download, proposal email is text.
- Before applying/deploying: review the20-file diff, run migration and concurrent approval tests in a disposable PostgreSQL database, verify SMTP success/failure, exercise scoped contract/document reads, and inspect A4 print output. Only then apply approved changes and rerun full checks.

## Present availability (do not overstate)

Financial core is still unchanged: live missing-telemetry billing fallback, non-atomic payment/receipt/count numbering and swallowed SMTP failure remain pending. The corrected UI email request alone does not fix server false-success behavior. Issued snapshot previews/period selection are unavailable until the proposal is approved and real documents are issued; legacy records continue to show unavailable. General settings sample defaults and optional default tariff remain live until approval.

## Automatic approval-review record

The broad shell rewrite and subsequent explicit create-cycle/contract patch were rejected for financial-workflow breakage risk; a document GET proposal was rejected because resource-scoped authorization was not yet visible. Root explained those decisions and asked the user; the user chose review first. No rejected mutation was retried after that decision. The completed proposal is now isolated and reviewable.
