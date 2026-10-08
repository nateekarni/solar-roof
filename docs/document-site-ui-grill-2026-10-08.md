# Document and site form design interview — 2026-10-08

Status: Q1–Q35 accepted; user authorized parallel agent implementation on 2026-10-08.

## Confirmed request

- Use the three supplied document images as visual references, not as approved company data, contractual terms, tax policy or signatures.
- Documents use TH Sarabun New and the approved existing Solar Roof document wordmark. Use black instead of navy and light gray instead of pale blue.
- Replace the site connection-details accordion with visible sections associated with the main meter and each additional device.
- Preset field tables support adding, editing and removing fields while retaining a stable table structure.
- Remove the exact explanatory blocks identified by the user.
- Use a single upper Site ID source; order the identity section as site name, site code, organization name, organization code.
- Gateway mapping derives from the gateway input; preset selection auto-fills editable values. Additional devices choose a preset first.
- Move main billing meter configuration into Connection and Preset; meter model remains editable.

## Decisions to resolve

Document coverage and renderer parity; document language; monochrome versus approved logo colors; pagination; factual/legal content versus reference-only content; signatures and footer; missing-data presentation; item/rate and multi-transfer layout; historical originals.

Site-code terminology and editable identity lifecycle; organization selection versus creation; gateway display name versus payload identifier; per-site profile overrides versus shared presets; fixed table structure versus viewport height; table columns and field editing; preset-switch overwrite behavior; advanced mapping visibility; explicit billing-field selection and validation; device creation and removal behavior; branch/PR split.

Answers will be recorded in rounds. Unresolved decisions remain open; no legal wording or preset behavior is inferred from the reference screenshots.

## Accepted round 1 — Q1–Q23

All recommendations in round 1 were accepted. Q1 additionally requires actual PDF artifacts for display and email attachment across all document types. Q12 additionally requires a searchable organization combobox; unmatched entered organization data becomes a new organization on successful save.

Confirmed design: retain PPA content and financial rules; Thai primary with secondary English headings; approved colored logo, black/gray document layout, A4 pagination, actual rate rows and approved transfer evidence; blank/configured signatory without invented signature; concise company/contact/footer; omit absent optional data and block absent required data; preserve already issued originals.

Site identity: upper site code is the protocol Site ID; organization code is central organization data; existing-organization changes require impact confirmation. Gateway display name and Gateway ID remain distinct. Protocol identifiers remain immutable after creation; name/model/serial/mapping remain editable. Main meter configuration moves into connection/preset and auto-filled model is editable.

Per-device tables remain visible with stable columns, bounded height, sticky headers and mobile horizontal scrolling. Field editing uses a dedicated form. Overrides create a new local device profile revision; shared presets and historical readings remain unchanged. Advanced configuration stays in a per-device collapsible section. Switching presets after manual edits requires overwrite confirmation and retains protocol IDs. A main meter cannot be saved without a valid billing cumulative kWh field. Additional devices select preset first, then name, Device ID, model/serial and independent field table.

Branches: codex/document-layout-sarabun and codex/site-preset-form, based on the verified integrated prior work. Remaining frontier: contract PDF lifecycle, language snapshots and signatory settings, new organization creation/collision handling, per-device revision activation and table bounds.

## Source findings for round 1

- The current lower externalSiteId is the actual protocol Site ID; there is no separate human-readable site-code column. The upper form currently has only site name and organization name.
- Organization code exists as schools.code but is generated automatically; explicit code input and existing-organization selection require application changes.
- gatewayName and externalGatewayId are distinct. Protocol identity editing is excluded by the current site update API.
- Profile revisions are immutable and devices/history pin their revision. Per-device editable fields should create new local revisions rather than mutate the shared preset.
- Current profile previews deduplicate by revision ID; two devices using the same preset currently share one preview. The requested UI needs a separate editor per device.
- Main meter model is currently read-only in payload mode; additional preset selection does not consistently auto-fill device name/model.
- The current local financial PDF renderer is separate from contract preview/export and uses a configured local font. TH Sarabun New was not found in the inspected Windows font directory; font bundling and embedding must be part of the plan.

## Round 2 source findings

Contracts currently become active at creation with no draft/approval lifecycle. Their preview/export is HTML using current company settings; no persisted contract PDF or issuer snapshot exists yet. Invoice/receipt originals already use immutable saved PDF artifacts. Company settings have no signatory title or signature-image fields. Device profile activation is immediate; historical samples pin original revisions. Site creation retains an obsolete one-site-per-organization controller guard despite multi-site schema support; removing it is necessary to implement the accepted organization combobox. Existing shared organization edits currently lack the accepted impact confirmation.

## Round 2 frontier — Q24–Q30

Q24 contract PDF generation/snapshot timing; Q25 signatory data location; Q26 new organization code default; Q27 combobox typing versus intentional shared organization editing; Q28 activation and billing-field impact confirmation; Q29 custom device setup without matching preset; Q30 visible billing field selection.

## Accepted round 2 and correction

Q24–Q26 accepted: persist contract PDF on creation, create first original for existing contracts at first access, add default issuer signatory/name/title and per-contract customer signatory fields, generate editable unique ORG organization codes.

Q27 supersedes the generic edit action: organization list entries expose an edit icon opening a modal for name, organization code and tax/document identity together. This is a single customer master record usable for document preparation. Q28 accepted prospective profile revisions and billing-impact confirmation.

Q29 supersedes the explicit custom preset option: no preset selection means manual device configuration, with the same validation; it must not create a shared preset.

Q30 remains open. A generic billing-role toggle is insufficient UX. The plan must distinguish field decoding/normalization from an explicit billing-source binding and show device, source field/path, conversion, cumulative kWh, usage and actual calculation flow. Existing financial calculation consumes active billing_meters device/semantic bindings and matching quality/unit-validated telemetry, not arbitrary numeric fields. Physical measurement purpose cannot be inferred from tag names.

## Accepted round 3 — Q31–Q35

All recommendations accepted. Replace a standalone billing checkbox with a dedicated billing-source binding showing device identity, source tag/path, source unit, conversion, cumulative kWh preview and exact calculation flow. Unverified/missing actual readings cannot produce a bill. Capture the physical measurement purpose explicitly; do not infer it from import tag names or substitute solar logger generation.

Organization edit modal includes display name, organization code, legal name, tax ID, tax branch, billing address, contact name, phone and document email. Organization defaults auto-fill new contracts; contract-specific billing identity remains editable and frozen with the contract/document. Organization changes do not rewrite existing contracts or originals. Incomplete organization tax data is permitted for site setup, visibly marked incomplete; required identity is checked before creating contracts or issuing documents.

Decision frontier is closed for this scope. Implementation plans are document-layout-sarabun and site-preset-form. Execution was explicitly authorized by the user after the final plan, including parallel agents.

Engineering acceptance: real MQTT/profile ingestion must retain valid billable reading provenance, not rely on manually seeded register mapping IDs. Measurement validity and online freshness are independent: validated historical readings may be used for their period, while stale readings do not mark a device online. Future/invalid/reset/incomplete source data must remain blocked. See billing-field-binding-review-2026-10-08.md for current source gaps.
