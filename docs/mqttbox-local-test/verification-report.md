# Local Gateway payload verification — 2026-10-05

Implemented versioned declarative presets for Schneider PM2230 and Huawei SmartLogger3000A using the supplied JSON v1.1 and DOCX. Immutable revisions retain original lineage; device upgrades are explicit. Unknown tags retain raw values without acquiring billing roles. Only PM active import cumulative energy projects to billing.

## Verification performed

- Migration 024 applied to the existing local database without reset or seed.
- Full API suite: 81 tests, 80 passed, 1 skipped, 0 failed. API, web and worker typechecks passed. UI table test passed; temporal-column regression tests passed 3/3.
- Actual Docker MQTT TCP and WebSocket exercised. Four supplied groups persisted and received correlated `dataAcept` after commit. Integration script passed all 11 checks on API-provisioned and UI-provisioned sites, and again after revision upgrade.
- Retry changing `sentAt` added no duplicate measurements. Conflicting ID reuse, bad units and ownership mismatch were rejected without accepted ACK. Late and historical source data did not replace current fields. Bad quality was retained but excluded from the billing energy projection. `1000 Wh` cumulative increase produced `1 kWh`.
- Sixteen concurrent deliveries through eight TCP and eight WebSocket clients produced sixteen accepted ACKs and exactly one stored message, four samples and one raw row. An injected failure in the actual PostgreSQL transaction rolled back message, samples and raw rows. Immutable revision database guard rejected UPDATE. See durability-evidence.json.
- Browser flow created **MQTTBOX UI Test**, internal site `03d4b82c-3bd5-4ee5-9ca5-48076cada64f`, and attached SmartLogger through the UI. Both device bindings/topics displayed before data arrived. After publication the UI displayed 26 canonical fields, independent poll groups, raw units, quality, freshness, rejections and unmapped values.
- Browser created PM2230 revision 1.0.1 by adding `future.custom_metric` with identity `widgets` conversion and no billing role. The assigned device stayed at 1.0.0 until explicitly upgraded through the UI. A new broker measurement displayed `12.5 widgets` under 1.0.1. Historical samples retain 1.0.0 and 1.0.1; an old-revision retry still receives ACK without duplication. See revision-evidence.json.
- Browser found and verified fixes for accidental wizard submission and Gateway names being formatted as dates. Incomplete canonical IDs/profile now keep the wizard on step 2. A complete wizard now stays on the review step until Save is explicitly pressed; the validation-only draft was cancelled without adding a site.
- Separate profile, backend, UI and final integration reviews passed after fixes, with no remaining Critical or Important findings.

## Remaining limits

The MQTT client tests verify broker → ingestion → PostgreSQL → ACK → rendered UI. They do not verify a physical Gateway/PM2230/SmartLogger Modbus connection or cloud TLS. Native MQTTBOX could not be operated through the available UI tools; the exact client settings and complete publish fixtures are provided for manual use. Canonical-table archive/purge is not implemented. New envelope standards and conversions outside the supported declarative choices require adapter implementation.

Test sites, test measurements and PM2230 revision 1.0.1 are retained locally for MQTTBOX testing. No database reset or financial-document creation was performed. Changes are left in the existing working checkout alongside earlier approved UI work.
