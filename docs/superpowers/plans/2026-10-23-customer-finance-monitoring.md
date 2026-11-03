# Customer finance and monitoring implementation plan

**Goal:** Make customer energy monitoring and financial documents consistent, enforce full payment, audit customer settings, and safely remove gateways and sites.

**Architecture:** Keep billing and telemetry authority in the API. Add narrow API contracts for six-month production history, billing evidence attachments, configurable alarm and late-fee policies, and deletion preconditions. Update the existing customer portal and operations screens with those contracts. Preserve issued document snapshots and existing payment records.

**Tech stack:** Next.js 16/React 19, NestJS 12, PostgreSQL, pnpm 11, Playwright and Node tests.

**Reference:** https://mju.triplenclouds.com/plant_overview/1789631801 — current power overview, daily energy chart, cumulative production, environmental/field metrics, and monthly production graph. Use only data available from this platform and provide clear unavailable states.

## Work packages and acceptance

### 1. Billing documents

- Trace invoice approval and PDF generation. The approval signature and date must appear on newly approved billing statements, with the actual approval timestamp and saved signer identity. Do not alter already issued snapshots.
- If the issuer clicks to issue without a saved signature, open an upload modal in context. After the signature is saved, return to the same issuance review and let the issuer continue without losing the pending document state. The API must still reject issuance until the signature is persisted.
- Format tax percentages without trailing zeros, for example `7.0000%` becomes `7%`, while preserving meaningful fractional digits.
- In billing statement and receipt, label signature areas only `ผู้ออกใบวางบิล` and `ผู้รับเงิน`; omit job titles.
- Add a production form attachment slot to the billing statement workflow and document viewer, linked to the issued document/version for review. Accept the supplied form later without inventing its content.
- Add focused API/PDF tests for signature, date, tax formatting, labels, and attachment visibility.

### 2. Full payment and evidence approval

- Retain existing payment storage and historical records. Remove full/partial choice and amount entry from customer payment UI.
- API must require submitted and approved evidence to cover the full outstanding statement amount. Reject a short amount and duplicate/second settlement, including direct API calls and concurrent review.
- Replace approval review flow with a single confirmation modal; show bill identifier and full amount before confirmation.
- Test UI, API validation, and settlement idempotency.

### 3. Customer monitoring and account flow

- Add customer-scoped production history by selectable date, limited to the latest six calendar months and never future dates. Show interval/day totals with timezone and source/status so customers can compare with billing documents.
- Rework home, history, documents, payment, notifications, and account navigation/styles consistently for desktop, TV, and mobile. Use responsive typography, readable chart labels, clear offline/empty/loading states, keyboard accessibility, and no fabricated sensor readings.
- Use the reference page's information hierarchy: current generation, today's trend, cumulative/monthly context, then supporting metrics. Keep existing brand tokens and distinguish actual vs estimated/unknown data.
- Add browser tests at mobile, desktop, and TV viewports and test six-month date limits and site isolation.

### 4. Customer activity audit

- Record customer settings changes server-side with actor, customer/site scope, action, timestamp, before/after values with secret fields redacted, and correlation ID. Ensure settings mutations cannot bypass the log; make logs available to authorized operations users only.
- Test scoped access and redaction.

### 5. Alarm and late-fee policy foundations

- Add versioned critical-factor alarm rule definitions and a seed ingestion path for Huawei conditions. Seed no guessed thresholds; validate imported rule structure and provenance so the supplied conditions can be added deterministically.
- Add versioned late-fee/interest policy configuration and calculation boundary that is disabled until approved rate and conditions are supplied. Show a clear disabled/unconfigured state; never charge an inferred amount.
- Test disabled behavior, validation, and deterministic future seed import.

### 6. Gateway and site removal

- Add authorized gateway removal with explicit dependency handling and audit entry. Preserve financial/telemetry history through soft retirement where required by current schema.
- Add site removal only when no active gateway remains, with an API-side precondition and clear UI message directing removal of gateways first. Guard concurrent deletion.
- Test dependency conflict, authorization, and historical record preservation.

## Execution and verification

1. Implement in the packages above, testing each meaningful API or UI behavior as it lands.
2. Run targeted tests, `pnpm lint`, `pnpm test`, and `pnpm build`; report failures with exact commands.
3. Start the isolated local review environment from `scripts/local-system/README.md`, not the default `.env`, and verify API health.
4. Open the local web app and exercise customer monitoring/date selection, documents, payment evidence, approval modal, activity log, and gateway/site removal at desktop and mobile widths. Use disposable local data only; note any scenario blocked by missing business inputs.

## Inputs still required from the product owner

- Production form file and placement/requiredness rules.
- Huawei critical-factor alarm conditions and thresholds.
- Late-fee/interest triggers, rates, compounding/rounding, grace period, and document presentation.
