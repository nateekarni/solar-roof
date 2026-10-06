# Gateway payload presets and end-to-end verification

Status: Approved by the user on 2026-10-05; implementation and verification tracked in the matching implementation plan.

## Evidence

Sources are the user-provided MQTT_Payload_Examples_v1.1.json and เอกสารมาตรฐาน MQTT Payload-V.3-PM2230.docx in Downloads. Both describe schemaVersion 1.1, hierarchical telemetry topics, nested device identity, timestamped poll groups, canonical tags, Wh/varh energy and the exact dataAcept acknowledgement spelling. Register addresses and decoding definitions are explicitly examples or outside the supplied standard; this change must not invent physical Modbus addresses.

The current consumer requires a string deviceId/device at the root, root timestamp/sourceTime and a fixed metric vocabulary. It currently acknowledges /response. Site creation and database constraints only permit energy/{gatewayName}/# or /{gatewayName}/#. Existing presets contain mutable Modbus register maps without payload profile versions. These constraints must change together with provisioning and tests.

Docker inspected on this machine: healthy broker currently publishes host ports 1883 and 18083. 8083 is not published. 18083 is the broker management dashboard. Proposed local MQTTBox transports are MQTT TCP on localhost:1883 and optional WebSocket on localhost:8083/mqtt after publishing that listener. The DOCX describes MQTT TLS for cloud transport; this local test does not certify a production TLS deployment.

## Options and recommendation

1. Hardcode adapters for the supplied devices: smallest patch but requires releases for new field mappings and risks silent loss of future fields.
2. Versioned declarative payload presets (recommended): retain a bounded schema parser, store validated tag/unit/semantic mappings and immutable profile revisions, and bind a specific revision to each provisioned device.
3. User-supplied executable transformation scripts: very flexible but require execution isolation and introduce unnecessary operational and security complexity. Out of scope.

## Presets and provisioning

Provide schneider-pm2230 and huawei-smartlogger3000a profile 1.0.0 for envelope 1.1. Keep raw Modbus register presets as a separate mode for existing senders. A payload profile describes supported poll groups, tags, source units, display names, target units, permitted numeric conversion and optional roles in legacy dashboard metrics. Editing creates a new immutable revision; existing devices retain their pinned revision until explicitly upgraded. No custom executable expressions.

Provisioning supports explicit external site/gateway/device identifiers such as SITE-001/GW-001/METER-001 independently of internal UUIDs. Topic identifiers and envelope identifiers must agree and resolve to a registered site, gateway and device relationship. Payloads never create devices automatically or choose their own database ownership.

Site creation selects its billing meter profile and identifiers. Support attaching a SmartLogger as an additional registered device under that gateway, with a profile selection. Show exact publish and dataAcept subscribe topics, current profile version and copyable test payloads in site details/configuration. Preserve the approved vertical read-only/edit pattern.

## Ingestion and storage

Validate envelope size, schemaVersion, messageType, identities, supported group, finite numeric values, unit compatibility and timezone-bearing timestamps. polledAt is the primary sample time; measuredAt is optional and must never be fabricated. Store sentAt/receivedAt independently. Missing profileId/profileVersion in environment examples resolve to the provisioned device revision; supplied profile references must match its assigned revision. Reject unsupported schema/profile revisions visibly.

Keep original payload and canonical values/units, including phase voltages/currents, import/export active/reactive energy, plant power/yields and environment values. Persist extensible canonical samples and profile revision references rather than forcing every field into the existing eight-column snapshot. Future unconfigured tags remain available as unmapped raw values; they do not silently feed dashboards or billing.

Normalize Wh to kWh exactly as configured while preserving original Wh. PM2230 billing defaults to explicitly assigned active import cumulative energy. Export energy, daily yield and reactive energy must not substitute for billing import. Configure billing field assignment explicitly rather than inferring it from whichever energy field arrived most recently.

Maintain latest state per field/device/group using polledAt. Realtime must not clear prior energy readings; late samples persist without replacing newer state. Treat each field's age separately. quality.status/communication are distinct from age, and poor-quality values are excluded from billing. Missing values are missing, not zero.

Deduplicate logical messages using registered gateway/device plus messageId, retaining lotNumber/sequence/polledAt. Resend can change sentAt without creating new measurements. A conflicting reuse of a message identity is rejected with a recorded reason. uint32 lotNumber accepts 1 through 4294967295 and rollover to 1; identity and source timestamps disambiguate rollover/reboot. Sequence gaps may be recorded but do not cause fabricated samples or reject valid delayed messages.

Commit raw payload, samples and existing energy dirty-day bookkeeping before publishing accepted ACK. Durable duplicates receive the same correlated ACK without duplicate sample/aggregate effects. Match supplied dataAcept envelope and exact gateway topic. Failed validation/persistence receives no success ACK. Explicitly exclude ACK/status/config messages from telemetry ingestion; status topics must not fabricate meter readings. Persist rejected-message reasons and display them for diagnosing MQTTBox sends.

## Compatibility and migration

Use additive migrations. Preserve existing devices, readings, energy read models and legacy raw-register/flat-metric ingestion. Expand topic validation in both database constraints and APIs to support the declared standard without permitting cross-site subscriptions. Preserve one site per school and one registered gateway per site. Device profile upgrades are explicit and do not rewrite past readings. No database reset, credential changes or production deployment are required.

## Verification and deliverables

1. Unit tests for supplied four telemetry examples, missing profile references, all canonical fields and energy conversions; invalid identity/schema/unit/timestamp/lot rejection; replay with changed sentAt; rollover; separate poll-group state; late data and failing database commit.
2. Local integration test creates a clearly labelled dedicated test school/site/gateway/PM2230 through application provisioning APIs and attaches a SmartLogger. Select presets through the web UI and verify persisted assignments. Preserve existing data.
3. Publish all four adapted examples through the running Docker MQTT broker using a real MQTT client. Use registered identifiers and fresh polledAt/sentAt for live-state checks, while separately testing historical examples as historical data.
4. Subscribe to dataAcept before publish; verify correlated ACK only after stored raw/canonical records exist. Check database counts, units, latest per-field values and website telemetry; resend and confirm no duplicates. Test incorrect topics and invalid messages without success ACK.
5. Verify cumulative import meter deltas without creating financial documents or changing real billing. Demonstrate realtime and energy updates together.
6. Deliver MQTTBox client settings for supported local TCP/WebSocket transport, actual concrete topics/identifiers, ready-to-paste JSON fixtures and expected ACK. Automated publishes traverse the actual broker and ingestion service; they are distinct from physical Gateway/Modbus verification. A physical Gateway connection cannot be claimed without that device.
7. Save test evidence and limitations in a repository report. Keep labelled local test site available for the user to publish from MQTTBox. No other user's records are deleted.

## Scope boundary

Supports configurable finite canonical telemetry fields and additional profile revisions through validated configuration. Arbitrary new envelope protocols may still require an adapter release. It cannot guarantee all future device formats without a schema definition. Physical PM2230 register correctness, real gateway firmware behavior and cloud TLS are verified only when those devices/environment are provided.
