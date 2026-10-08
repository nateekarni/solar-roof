# Solar-Roof UI improvement interview

Status: user confirmed shared understanding and authorized execution. Accounting-policy selection is a separate checkpoint before financial calculation/issuance implementation. Local reset has not started.

## Accepted round 1

- Q1: replace school-specific general wording across all relevant screens and organization data-entry flows. Preserve actual organization names.
- Q2: canonical terms are องค์กร (Organization), ไซต์งาน (Site), ผู้ใช้งานองค์กร (Organization User).
- Q3/Q4: reorganize the existing portal for organization staff to review energy, costs, payment status and documents using existing capabilities.
- Q5: use an existing company logo as a reference where available; the actual reference/design direction remains unresolved.
- Q6: replace Solar Platform branding with Solar-Roof. Legal issuer identity and logo ownership remain unresolved.
- Q7: preserve the general layout; improve typography and spacing. Centralize primary color and audit hardcoded brand colors across the system.
- Q8: cover Thai/English user-facing text; retain standard abbreviations and English units.
- Q9: exercise the real local flow from contract creation through billing, payment and receipt.
- Q10: user authorizes deleting the old local test dataset and creating a fresh isolated test dataset. Identify local targets and scope before deletion; no reset has run.
- Q11: fix discovered bugs within the work; present decisions requiring confirmation before implementing them.

## Verified prerequisites

- FinancialReadinessService.verifiedReadiness currently returns null, disabling financial writes even with the environment flag enabled.
- The prior financial interview authorized proposal revision/testing only. Accounting confirmation remains outstanding; the current request requires deciding how local synthetic end-to-end testing relates to that prerequisite.
- Existing local-review seed contains display fixtures and does not establish that the real receipt issuance pipeline works.
- Prior decisions preserve issued document artifacts rather than regenerating them from changed company data.

## Pending round 2

Logo reference/design, legal issuer identity, brand versus document logo, primary-color control and semantic colors, historical artifacts, locale date/document conventions, financial implementation/test scope and external-message boundaries.

The original four-branch split remains the starting point. Financial implementation scope may require a separate implementation PR beyond seed.

## Accepted round 2

- Q12: create a new Solar-Roof logo; no existing logo reference.
- Q13: use the attached screenshot as provisional company reference: บริษัท โซลาร์ รูฟ จำกัด / SOLAR ROOF COMPANY LIMITED; registration number 0105554059286; address 68/184 ซอยรามคำแหง 164 แขวงมีนบุรี เขตมีนบุรี กรุงเทพมหานคร 10510. These are transcribed reference data, not independently verified tax/VAT status or banking information.
- Q14: accepted the recommended separation: system branding uses Solar-Roof; new documents use the configured issuer logo. Clarify if the terse yes intended a different choice before implementation.
- Q15: accepted recommendation to preserve historical issued originals and update new/draft documents only.
- Q16/Q17: primary theme tokens live centrally in source; semantic status and chart colors retain separate central tokens.
- Q18: Thai UI uses Buddhist years, English UI Gregorian years; numbering stays consistent; issued document language is fixed when issued.
- Q19: financial implementation authorized as a separate branch/PR after reconciliation with current source.
- Q20: local synthetic financial policy is accepted in principle; detailed accounting conditions remain for later selection. Prepare data and plan in advance, without treating unselected conditions as approved.
- Q21: use a local email capture service, no real recipient delivery.
- Q22: replace the verified local test dataset including test documents; retain connection settings/secrets. Include distinct roles and at least two organizations for access isolation.

## Next frontier

Superseded by the round 3 frontier below.

Logo style and review, interpretation of document branding yes, organization portal navigation and scope, multi-site presentation, local scenario coverage, timing simulation, readiness messaging, legal reference versus tax fields. Accounting-specific selection is explicitly deferred and remains a prerequisite for the financial end-to-end implementation.

## Accepted round 3

- Q23/Q24: transparent roof/solar symbol and Solar-Roof wordmark, compact symbol-only and light/dark variants. Yellow/orange branding; fixed logo colors, token-based UI colors. Present logo for selection before integration.
- Q25: system uses Solar-Roof; new documents use configured issuer logo, initially the new logo. Preserve historical issued originals.
- Q26 supersedes five-menu proposal: only Home, Documents, Settings. Home includes production/consumption diagram, numeric summaries and unpaid invoices. Documents uses contract cards with related invoice/receipt lists. Settings includes display and account preferences.
- Q27: aggregate permitted sites by default with site selection; monetary totals respect scope; bills remain tied to contracts/sites.
- Q28: two organizations, three sites, around three months of history and distinct contract, billing, payment and missing-data scenarios.
- Q29: local-only time simulation and job execution exercise real workflow and duplicate prevention.
- Q30: localized readiness status near unavailable actions; internal setup details for staff only.
- Q31: fill missing company, bank, email, signer and tax-related test identities with synthetic values; real accuracy is unnecessary for the local test. This does not settle deferred calculation/document policy.

## Remaining frontier after round 3

Aggregate diagram meaning/missing measurements; contract navigation and account-setting scope; timing of the deferred accounting-policy selection checkpoint.

## Accepted round 4

- Q32: Home shows aggregate numbers followed by per-site energy diagrams. A single selected site gets its own full diagram. Missing measurements are unavailable, never silently zero-filled.
- Q33: selecting a contract card shows its invoices/receipts on the same Documents page with month/status filters. Cards identify site, contract number, status and dates. Home payment actions open bill details and evidence submission directly.
- Q34: organization users edit personal profile, password, language, theme and notifications. Legal organization identity/tax/address fields are read-only and changed by internal staff; existing access boundaries remain in force.
- Q35: proceed with UI/branding and prepare local fixtures and financial plans first. Present accounting-policy options and example calculations before implementing financial calculation and issuance; no unselected policy is implicitly approved.

## Consolidated implementation scope

1. codex/ui-copy-layout-locale: contract form headings, removal of numbered sections/dividers and redundant English parentheticals, consistent icon-heading typography; system-setting card descriptions; Thai/English audit and contextual readiness messaging.
2. codex/customer-portal-ui: Organization vocabulary across relevant UI/documents and the three-menu organization portal, aggregate numbers, per-site diagrams, unpaid bills, contract-centered documents and scoped account preferences. Retain current internal identifiers unless a separately approved change is necessary.
3. codex/company-branding: Solar-Roof branding, new transparent logo reviewed before integration, issuer-logo document behavior, centralized primary/semantic/chart tokens and hardcoded-brand-color audit. Preserve issued originals.
4. codex/local-financial-flow-implementation: reconcile existing proposal against current code and implement authorized real financial workflow only after accounting-policy checkpoint. No readiness bypass by flag alone.
5. codex/local-financial-flow-seed: verified isolated local reset and synthetic two-organization/three-site fixtures, local email capture and time simulation, real contract-to-receipt tests, failure states and cross-organization isolation. Preserve connection settings and secrets. Only reset the identified authorized local test resources.

UI and branding can proceed before accounting selection. Financial plans and fixture specifications can be prepared in advance; actual complete flow verification depends on approved test-policy choices and implementation. Branches/PRs are separate review units; shared-file dependencies must be reconciled explicitly.

## Acceptance evidence

- Desktop/mobile, Thai/English and light/dark UI checks.
- Temporarily changing the central primary token propagates to branded UI; semantic colors and diagrams retain their meanings.
- Organization scope prevents viewing or acting on other organizations' data.
- Missing measurements are distinguishable from zero values.
- Local flow produces real persisted issued artifacts and captured email attachments, resists duplicate issuance, and exercises payment rejection/resubmission and missing data.
- Historical issued originals are preserved outside the intentionally reset local test dataset.

## Final confirmation

User explicitly confirmed the consolidated scope. Proceed with UI/branding and financial preparation, retaining the deferred accounting-policy checkpoint.
