# UI Copy, Layout and Locale Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task with review checkpoints. Steps use checkbox syntax for tracking.

**Goal:** Make contract creation, default-setting cards and financial availability understandable in Thai and English.

**Architecture:** Keep existing form payloads, authorization and readiness gates intact. Localize validation and placeholder text inside the existing form; introduce a small rendered financial availability notice that never exposes raw server text. Use existing card components for bilingual descriptions.

**Tech Stack:** Next.js 16.3.3, React 19.2.8, TypeScript 7.0.2, Zod 4.5.4, node:test and server rendering.

**Spec:** docs/ui-improvement-decisions-2026-10-08.md

## Global Constraints

- User terms: องค์กร / Organization, ไซต์งาน / Site, ผู้ใช้งานองค์กร / Organization User.
- Retain role/API/storage identifiers and existing action permission gates.
- English measurement units; Thai Buddhist-year dates and English Gregorian-year dates through existing date components.
- No financial policy assumptions, no database reset in this branch.
- Brand-primary cleanup belongs to the branding branch.

### Task 1: Contract form presentation and language

**Files:** Modify apps/web/features/contracts/contract-form-dialog.tsx; create apps/web/features/contracts/contract-schema.ts and contract-schema.spec.ts.

**Interfaces:** createContractSchema(locale: Locale) returns the existing Zod form schema with localized required-field messages; infer ContractFormValues from its return type. Payload fields remain unchanged.

- [ ] Add a failing schema test for missing required fields in English and Thai. Assert issue paths and text, not markup or implementation.
- [ ] Run `pnpm --filter @solar/web exec tsx --test features/contracts/contract-schema.spec.ts` and confirm failure.
- [ ] Extract the schema factory, use it with zodResolver, remove section numbers, redundant English translations and section divider borders. Use text-sm font-semibold headings. Localize loading/empty placeholders, removal labels and fallback errors; use organization-neutral legal-entity text.
- [ ] Run targeted schema tests and web typechecking; inspect rendered dialog in both locales when a local review server is available.
- [ ] Commit only the contract files with `fix: clarify contract form headings and locale`.

### Task 2: Default-setting descriptions

**Files:** Modify apps/web/features/settings/system-settings-content.tsx.

**Interfaces:** Existing CardTitle and CardDescription components; settings read/write payload unchanged.

- [ ] Wrap each title plus description in a min-w-0 container, keeping Edit aligned alongside it.
- [ ] Add bilingual descriptions for defaults, document numbering, retention and notifications. Explain actual settings shown; do not claim editing prefixes reissues historical documents.
- [ ] Display measurement frequency as sec in both locales. Preserve non-measurement date/retention-year language.
- [ ] Typecheck and visually inspect responsive header wrapping in both locales.
- [ ] Commit with `fix: explain system default cards`.

### Task 3: Financial availability notice

**Files:** Create apps/web/features/shared/financial-availability-notice.tsx and financial-availability-notice.spec.tsx; modify operation-page-actions.tsx.

**Interfaces:** FinancialAvailabilityNotice({locale,role,resource}) renders compact localized status and staff-only details. Caller renders it only when a financial action is unavailable according to server capabilities.

- [ ] Add failing server-render tests: English and Thai, staff details present, organization-user internal setup details absent.
- [ ] Run `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/shared/financial-availability-notice.spec.tsx` and confirm failure.
- [ ] Implement short localized action-unavailable text with a details disclosure for internal roles. Remove raw API unavailable text from the header and position notice below the export/create actions.
- [ ] Preserve unavailable checks and action permissions; do not enable writes or invent missing readiness requirements.
- [ ] Run notice tests, existing financial action tests and full web typecheck/tests.
- [ ] Commit with `fix: localize financial action availability`.

## Follow-on plans

Customer portal, branding and local financial preparation get separate plans after inspecting their current interfaces. Financial calculation/issuance is gated on the explicitly deferred accounting choice. The logo is reviewed before integration.
