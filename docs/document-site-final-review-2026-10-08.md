# Final broad document/site code review

Verdict: APPROVED for the reviewed source. No new actionable Critical, Important, or Minor finding. Final combined tests and runtime acceptance remain the coordinator's completion gate, not evidence produced by this reviewer.

## Immutable scope

- Base: ccbef13
- Document: a38db76dde49148c27a679ca035fc3320181e107
- Site: d87901058f51f58298c728f75c7b3967b8a1af83
- Integration: 3effd7ef8884fd58d5ed313cc9fda26d2aafe6bd
- Package: package.md in this directory.

Read the accepted Q1-Q35 design interview, billing-field-binding review, both implementation plans, the coordinator's verification/decision record, applicable web AGENTS.md, and code-review/requesting-code-review guidance. Review was performed in passes by this reviewer; no additional subagents were dispatched. Application source, Git state, runtime, database and mail were not changed. Only this requested report was written.

## Standards

No actionable documented-standard violation found. The review considered module boundaries, error paths, scope checks, immutable data ownership and async state behavior. No style-only concern is being promoted to a blocker. The web AGENTS.md Next.js writing rule did not require implementation activity in this read-only review.

## Spec

No new actionable mismatch found in the reviewed source.

Strengths and inspected behavior:

- All four bundled TH Sarabun New file hashes independently match the recorded originals. The repository includes the GPL text and font embedding exception; the renderer uses only those bundled faces and the approved logo. A4 black/gray layout, repeated table headers, exact decimal strings and kept-together signature groups are explicit in document-layout.ts.
- Compared the old contract preview body with the new renderer. Existing signer/rate content is retained, with saved payment terms and party/signatory snapshots; no reference-image clause or charge is invented. Rendering a saved contract rate as 3.50000000 is not a finding: the approved scope requires exact frozen rates and does not impose a four-place presentation cap. It remains numerically identical to 3.5000 in the TEST invoice.
- Contract creation, rates, snapshot and original bytes share a transaction. Scoped lookup precedes original access, the advisory lock and unique index enforce one first original, and incomplete legacy identity cannot be fabricated from current customer defaults. Existing originals are reused rather than rerendered.
- Preview, print and download use authenticated saved PDF bytes with hash verification. Contract/financial delivery shares artifact integrity, frozen-recipient eligibility, uncertain-SMTP and retry gates. Production financial readiness and local capture binding remain required.
- Organization identity is centralized, existing edits require explicit impact confirmation, and new organization/site save is atomic. Contract overrides distinguish omitted values from explicit blanks. Historical organization reassignment is rejected while same-organization edits and history-free reassignment remain supported.
- Local device overrides are immutable and device-owned, preserve source lineage, and stay out of the shared catalogue. Site/Gateway/Device protocol identities remain immutable. Per-device editors retain independent drafts, preset overwrite confirmation, editable metadata, field modals, bounded scrolling and sticky table headers.
- Billing explicitly binds the main device, pinned profile/field, units/conversion and physical purpose. Ingestion stamps actual payload provenance, separates valid historical measurement from online freshness, and rechecks activation under lock. The resolver checks all equally nearest candidates and the full segment for invalid readings, reset or mixed provenance; legacy register evidence remains supported.
- Site creation opens billing setup using the actual returned site ID. Missing binding remains a valid configuration state without billing eligibility. Binding controls wait for pending/dirty profile changes. Final d879010 loader guards request generation, site, dialog session and returned config identity, including same-site out-of-order completion and close/reopen behavior; companion device/form loads also reject stale site results. This closes the previously reported issue and is not counted again as a new finding.

## Integration verification

Read-only Git comparisons found no differences between final integration and SITE d879010 for assets, telemetry, site/organization UI and the created-site handoff. No differences from DOC a38db76 for document services, contract controller/form/schema and original-preview/delivery paths. The shared merge surfaces retain both BillingSourceBinding and ContractPdf services, both source-resolution and saved-artifact delivery logic, and ordered migrations 033/034/035/036.

Inspected the regression tests for original concurrency/rollback/scope, delivery integrity/retry, local profiles, organization-history ownership, provenance boundaries/segments and async loader/preset behavior. No full suite or live DB/runtime test was rerun by this reviewer, as assigned. Prior actual MQTT, PostgreSQL, PDF, SMTP and seven-original preservation results are coordinator-supplied evidence recorded in D:/Dev/solar-roof/docs/document-site-verification-2026-10-08.md; they are not represented here as newly executed reviewer tests. The coordinator is running final combined verification on the integrated revision.

## Assessment

Ready from the code-review perspective: yes. No source correction is requested. Keep final test/browser/new PDF/SMTP acceptance evidence alongside the reviewed heads before declaring the entire delivery complete. This verdict does not authorize a main merge or deployment.

Findings: Standards 0; Spec 0.
Coordinator completion: all final verification gates subsequently passed. See document-site-verification-2026-10-08.md for actual results. The disposable package is reconstructible with git diff ccbef13 3effd7ef8884fd58d5ed313cc9fda26d2aafe6bd. Published draft PRs: https://github.com/nateekarni/solar-roof/pull/6 and https://github.com/nateekarni/solar-roof/pull/7.
