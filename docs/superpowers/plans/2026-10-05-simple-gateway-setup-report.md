# Simplified Gateway setup — implemented and verified

Approved scope: consistent neutral controls, two-column dashboard status, wider site modal, blank creation forms, and connection/billing settings only. User also requested removing displayed/test data while retaining users and presets.

## Changes

- Dashboard neutral controls render at 40px with white backgrounds. Shared Select truncates long text without shrinking font size. Recent alerts and Gateway status use two equal columns on desktop and one on small screens.
- Site create/edit modals are 896px wide at the inspected desktop viewport; mobile 390px inspection showed no page overflow. Billing Meter is normal content without a nested padded border. Register preview and protocol options use 14px text.
- Site creation has no sample capacity, coordinates, IDs, serial, protocol or automatic preset choice. Preset selection intentionally supplies its real model and mapping. Legacy billing selector excludes environmental sensors. Missing data format/preset stops progression.
- Severity, voltage/current thresholds and hardware interval controls are removed from both create and edit forms. Requests no longer submit hidden values. API stores empty alert rules and does not publish unsolicited hardware configuration for this simplified path. Reconnection restores only explicitly configured rules. Omitted coordinates persist as NULL rather than example coordinates; zero remains valid.
- Other creation dialogs no longer automatically select a site, school, role, region, report type/format or sample date range. Edit forms preserve stored data.
- Broker test is labelled as broker connectivity; site remains offline until telemetry proves Gateway activity.

## Verification

- New blank form/optional number tests: 2 passed. Full API: 82 tests, 81 passed, 1 skipped, 0 failed. Focused payload/provisioning tests: 9 passed. Final API/web typechecks passed.
- Browser created `Setup Verification Before Cleanup` from the simplified wizard without coordinates. Actual DB showed latitude/longitude NULL and alert_rules `{}`.
- Real MQTT integration passed all 11 checks with the UI-created site. All four payload groups persisted and ACKed; UI displayed 26 canonical fields, 230.41V and cumulative 152431.27kWh. Retry, units, ownership, quality and late-data protections remained verified.
- Final browser inspection after cleanup showed zero sites, blank form inputs, three 40px white dashboard controls and two equal 484px status columns.

## Cleanup and remaining scope

Full database backup saved at `.superpowers/backups/solar-before-cleanup-20261005.sql` (350232 bytes). Automatic approval review rejected a broad deletion of every non-user/non-preset table because company, financial and configuration data could exceed display/test scope.

Safer cleanup explicitly removed only the three known chat-created local test sites and their associated data, in one transaction. Removed: 3 sites, 3 Gateways, 6 devices, 3 test schools, 47 raw/messages, 302 canonical samples and 12 rejections. Final sites/raw/samples counts are zero. User/auth/preset content signatures remained unchanged: 1 user, 2 register presets, 3 payload revisions.

Preserved pending clarification: company profile 1, bank account 1, system settings 9, audit events 21. Contracts, billing cycles, documents and payments were already zero. No external storage objects or authentication data were removed. Historical MQTTBOX evidence/fixtures remain as files, explicitly labelled as pre-cleanup and requiring newly registered IDs/topics before reuse. Physical Gateway/Modbus remains unverified.
