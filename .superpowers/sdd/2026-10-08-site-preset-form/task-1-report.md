# Task 1 — customer organization master

Status: implemented and verified in `codex/site-preset-form`, based on `ccbef13`. Ready for independent review.

## Commits

- Backend prerequisite: `4427ac02e0d32a1c9f4bbb21f96a087b8a09188a` — migration 033, exact contract-author defaults route, contract identity fallback/required-field checks and API tests. This can be cherry-picked independently by the document branch.
- Main task: the subsequent commit containing this report — organization API/master helpers, picker/modal, both site dialog integrations, contract form autofill/validation and UI/API regressions. Final commit SHA is supplied in the worker handoff.

## Implemented behavior

- Existing `schools.id`, `schoolId` and route names stay intact. Organization references are `{id,name,code}`.
- Both site dialogs use a name/code searchable combobox with separate row edit icons and keyboard selection. Typing a different name drops the old selected ID; it never renames that customer.
- New customer drafts have an editable generated `ORG-` code. They are inserted in the site transaction only after save. Failed site/device work rolls back the customer. Site edit supports the same atomic draft selection.
- Matching name-only legacy requests serialize through a PostgreSQL transaction advisory lock and reuse one organization. Explicit new drafts colliding with an existing normalized name return 409 and instruct the caller to select the existing customer, rather than merge conflicting identity.
- Codes are trimmed/canonicalized to uppercase, use 1–64 letters/digits/underscore/hyphen, and are enforced case-insensitively by the database unique index. Concurrent code collisions return a clear 409 with rollback.
- Removed the obsolete one-site-per-organization guard. Site/device/serial/protocol identity rules are retained.
- Separate Admin-only `PATCH /v1/schools/:id` edits display name/code/legal name/tax ID/tax branch/billing address/contact name/phone/document email. It requires `impactConfirmed: true` and `expectedUpdatedAt`; stale updates return 409. Timestamp reads preserve PostgreSQL microseconds through `updated_at::text`.
- Missing legal name/tax ID/address visibly marks the selected organization incomplete but permits site setup.
- New contracts autofill current organization tax/contact defaults into editable fields. The API snapshots those values and accepts contract-specific overrides. Explicit blank required identity cannot silently fall back. New contracts require legal name, 13-digit tax ID and billing address; existing contracts/documents remain unchanged.
- No PDF renderer, signatory, storage, issued-original or financial-readiness behavior was changed.

## Integration interfaces and exact paths

Backend prerequisite:
- `infra/migrations/033_organization_document_identity.sql`: additive customer default columns and normalized code uniqueness.
- `apps/api/src/modules/billing/organization-defaults.ts`: `readOrganizationDefaults(client,siteId)`, `contractIdentity(input,defaults)`.
- `apps/api/src/modules/billing/billing.controller.ts`: `GET /v1/operations/contracts/organization-defaults?siteId=...`, Owner/Admin only; returns `organization: {id,name,code}` plus `companyName,taxId,branch,taxAddress,billingEmail,billingPhone`. `createContract` uses the same defaults/identity rules.
- `apps/api/src/common/auth/route-policy.ts`: exact defaults route author policy.
- `apps/api/src/modules/billing/organization-defaults.spec.ts`: four API contract/defaults/role tests.

Main task:
- `apps/api/src/modules/assets/organization-master.ts`: organization validation, insertion and atomic organization resolution.
- `apps/api/src/modules/assets/assets.controller.ts`: extended `GET /v1/schools`, confirmed `PATCH /v1/schools/:id`, `newOrganization` input on site create/edit, `schoolCode` read output, multi-site support and removal of implicit master rename.
- `apps/api/src/modules/assets/organization-master.spec.ts`: ten atomicity/concurrency/uniqueness/shared-edit regressions.
- `apps/api/src/modules/assets/payload-provisioning.spec.ts`: existing query fixture now returns a real inserted organization ID.
- `apps/web/features/organization/organization-selection.ts`: `OrganizationReference`, `OrganizationDraft`, `OrganizationRecord`, `OrganizationSelection`, search/selection/payload/completeness helpers and keyboard index calculation.
- `apps/web/features/organization/organization-picker.tsx`: `OrganizationPickerProps` takes `organizations,value,onChange,onRecordUpdated,locale,canEdit,disabled`; `useOrganizationCatalog(open)` loads and updates organization records.
- `apps/web/features/organization/organization-edit-dialog.tsx`: `OrganizationEditDialog` handles confirmed existing edits or local draft edits; reusable `OrganizationIdentityFields`.
- `apps/web/features/organization/organization-selection.spec.ts`, `organization-picker.spec.tsx`: nine model/render/keyboard cases.
- `apps/web/features/sites/site-form-dialog.tsx`, `site-edit-dialog.tsx`: picker integration; `organizationSitePayload` sends an existing `schoolId` or a local `newOrganization` draft, never implicit name mutation.
- `apps/web/features/contracts/contract-form-dialog.tsx`: current defaults load on site selection with stale-response cancellation; editable contract fields and pending-load save gate.
- `apps/web/features/contracts/contract-schema.ts`, `contract-schema.spec.ts`: localized TH/EN required customer identity validation.

## RED evidence

- Initial organization API run: four expected failures — second-site guard, ignored edited ORG code, concurrent name-only creation, duplicate-code failure path.
- Initial contract/defaults API run: three expected assertion failures — absent master defaults, incomplete identity accepted, other roles allowed at the proposed defaults read path.
- Initial frontend model run with behavior stubs: five assertion failures for search, existing/new selection, ambiguity, completeness and copied defaults.
- Initial rendered picker/editor run with component stubs: three assertion failures for combobox/read-only code/incomplete status, new editable code and identity fields.
- Required contract identity validation run: two localized validation failures.
- Site reassignment collision test failed with raw `duplicate code`, then passed after consistent 409 translation.
- Keyboard edge case failed because initial ArrowUp selected row 1 rather than final row 2; corrected and verified.
- Mutation check removing the actual transaction name-lock call made both concurrency regressions fail (separate organization IDs and two explicit-draft successes). The production lock was restored before final verification.

## GREEN evidence

Commands run with `login:false` in the managed worktree:

- `pnpm install --offline --ignore-scripts --frozen-lockfile --store-dir D:/Dev/solar-roof/.pnpm-store` — success; no downloads/scripts.
- `pnpm --filter './packages/*' build` — all five shared packages passed.
- Focused organization/provisioning cases — passed; final organization master file has 10 passing cases.
- Focused contract defaults — 4/4 passed.
- Focused final picker/model/keyboard — 9/9 passed.
- `pnpm --filter @solar/api lint` — exit 0.
- `pnpm --filter @solar/web lint` — exit 0.
- `pnpm --filter @solar/web test` — final full suite: 170/170 passed, zero skips/failures; includes web typecheck. Re-run was justified by the keyboard edge case discovered in self-review.
- `pnpm --filter @solar/api test` — final full suite: 180 total, 178 passed, zero failures and the two existing opt-in integration skips. Captured again to provide the requested full review log.
- `git diff --check` — clean.

Full logs are saved beside this report: `task-1-api-test.log` and `task-1-web-test.log`.

## Self-review and limits

- Checked API role and resource policy, name normalization/locking, explicit draft conflicts, code collision translation on create and edit, transaction rollback, stale organization updates and current-default/contract-snapshot separation.
- Corrected timestamp precision during self-review so a legitimate microsecond `updated_at` value round-trips exactly.
- Corrected keyboard entry/wrap behavior and added an independently derived regression.
- No known unresolved implementation findings remain in Task 1. Device-editor/field-binding changes belong to later tasks.
- API transaction tests use independent staged transactions and lock-aware query doubles; the concurrency mutation proves they detect removing the production lock. The worker did not run live database migrations or create a runtime fixture. Migration 033 must be applied by the root-owned fixture workflow before runtime review.
- UI coverage is model and rendered-component coverage, not a browser fixture exercise; root owns subsequent runtime/UI review.
- The two existing skipped suites are disposable PostgreSQL dashboard SQL and real local MQTT/PostgreSQL bundle integration.
- No runtime database writes, migration execution, mail, server restart, reset, push or subagent dispatch occurred.

