# Organization Portal implementation evidence

Implemented on `codex/customer-portal-ui` in its isolated worktree. Internal `school_user`, `schoolId`, `schoolName`, storage and API resource identifiers remain in place; real organization names are displayed as stored.

- Organization navigation has exactly Home, Documents and Settings on desktop/mobile. Documents uses `/contracts`; existing document/payment detail routes remain available.
- Home respects selected authorized site for daily, monthly and selected-period summaries. Outstanding invoices exclude paid, draft and cancelled records, include pending verification/rejected proof, and link to existing bill details/evidence controls. A bounded 100-row first page explicitly reports when additional records exist and offers Documents.
- Instantaneous solar power uses only canonical fresh solar logger readings. Generic billing-meter `currentMw` is never labeled solar. Aggregate power is unavailable if any site reading is absent/stale; building load, solar-to-building and grid import/export remain unavailable until independently measured.
- Documents follows opaque server cursors, rejects repeated cursors, and clears data on load/access failure. Contract cards include site, number, dates and status; month/status filters combine on the same page. Thai month labels use Buddhist years; English uses Gregorian years.
- Existing billing and receipt rows have no persisted `contractId`. They remain visible in the explicit Documents without contract linkage group. The financial implementation must persist that relationship before contract-version grouping can become available. No site-based association is fabricated.
- Document preview uses the existing persisted-document control. Current server responses truthfully report original-artifact preview unavailable; this branch does not synthesize or regenerate issued documents.
- Settings supports own display name, language, theme, notifications and password. Legal organization records from scoped contracts remain read-only. Account email remains read-only because no verified email-change workflow exists. Password changes verify the existing secret, apply the existing 12–128-character policy, atomically revoke every session, clear cookies and redirect to login with a localized explanation.
- Added own-profile PUT and own notification GET, strict preference payload checks, and GET/HEAD-only school_user power-flow access. Server site/organization scope still rejects other organizations before telemetry lookup.

Verification: full web tests and typecheck; API typecheck; focused navigation, document association/filter/pagination, measured diagram, invoice list, own-account, password/session and cross-organization API tests. Live desktop/mobile, Thai/English, light/dark browser acceptance has not yet been performed in this implementation session.

Terminology audit covers general labels in portal, organization forms, site organization-user forms, financial intros, operation tables and i18n values. Internal identifiers, real stored names and historical technical documents are preserved. Existing broader locale gaps remain in legacy controls outside the new portal (for example older form validation and some detail-modal/date/status strings); this branch does not claim exhaustive translation completeness based on render tests alone. Copy/layout branch overlap in contract-form-dialog.tsx and shared i18n needs reconciliation before merging.

## Locale follow-up resolution

Reachable payment controls: `apps/web/features/billing/payment-dialog.tsx` has no locale hook and Thai-only errors/labels (file validation, missing proof, success, payment title/period, energy/amount, bank accounts, proof upload, transfer time and footer). Resolved with Thai/English text while retaining mutation and bank-reading controls.

Original preview UI: `apps/web/features/shared/document-preview-modal.tsx` has localized loading/unavailable-artifact notice but print-paper tax/address/signature/company-empty labels remain Thai/bilingual; Resolved labels retain truthful unavailable original-artifact behavior.

Organization/contract entry: `apps/web/features/contracts/contract-form-dialog.tsx` still has Thai schema validation for site/effectiveDate/paymentTerms/signer and Thai payment-terms/branch/address/end-date placeholders. This file overlaps the copy/layout branch and requires explicit reconciliation. Organization form name/region validation and region display are localized in this branch.

Legacy deep link: `apps/web/app/(app)/settings/security/page.tsx` still uses the old 8-character validation and expects password-change success without login redirect. Organization users now have the complete password control on `/settings`; Resolved: both screens now use the same tested12–128 validation and redirect after server session revocation.

Final automated evidence at handoff: web 115/115 passed; API 142 passed, 2 skipped (144 total); both typechecks passed; git diff whitespace check passed. Live visual review remains for parent coordination. Payment-dialog labels/errors and preview labels are now localized; both Settings password screens share the tested12–128 workflow and login redirect. Reviewer P2 raw billing periods are localized using the common Buddhist/Gregorian month formatter. Contract form locale integration remains with the completed copy/layout branch. Checkpoint commit authorized; push and draft PR are handled by the parent task.

## Contrast review follow-up

Replaced bare primary-colored Documents preview/retry/clear actions with shared outline Buttons using foreground text. Settings save-name/save-notification/change-password actions use shared filled primary Buttons. Signout uses destructive fill and its foreground token in both themes, explicitly overriding the shared variant's inherited dark translucent surface.

Actual Edge headless + axe color-contrast recheck used the real OrganizationDocuments and SchoolSettingsView components in a temporary provider/API fixture route (no production auth/API changes). Results: Documents 8/8 and Settings 8/8 combinations passed, zero color-contrast violations across desktop 1280×900 / mobile 390×844, Thai/English and light/dark. Temporary route/script/server and generated next-env changes were removed. Tests preserve filled foreground/surface pairing and prevent dark destructive tint regression.
Final contrast-fix verification: full web suite117/117 and typecheck passed; API behavior is unchanged by this follow-up.
