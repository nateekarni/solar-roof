# Billing Field Binding Review — 2026-10-08

Read-only inspection for Q30. Source examined: `C:/Users/natee/.codex/worktrees/ui-financial-integration/solar-roof`. These are implementation facts, not approval of production billing policy.

## Current binding and calculation

- `apps/api/src/modules/assets/assets.controller.ts:415` creates an active `billing_meters` row for the primary device with site ID, device ID, and semantic field `total_energy`. Additional devices are not assigned a billing meter automatically.
- `apps/api/src/modules/telemetry/payload-profile.ts:20` accepts `billing-import` only for canonical tag `energy.active.import.total`, normalized unit `kWh`; line 23 permits at most one such Field per profile. `sourceTag`, source unit, and conversion determine the actual payload value selected.
- `apps/api/src/modules/assets/assets.controller.ts:782` upgrades a device profile. Line 793 updates the profile revision only. Changing a Field role does not create or change a `billing_meters` binding. A profile containing a billing role on an additional device therefore does not by itself make that device billable.
- `apps/api/src/modules/telemetry/payload-ingestion.ts:81` selects normalized `billing-import` energy only when the device has an active billing meter and source quality/communication are healthy. Lines 85–86 write that value as `telemetry_raw.normalized_value`, `total_energy_kwh`, and semantic `total_energy`, with payload profile revision provenance.
- `apps/api/src/modules/billing/local-financial-application.service.ts:29` loads active site billing meters. Line 37 loads actual cumulative readings for each bound device and semantic at opening/closing rate boundaries in the site's timezone, within five minutes, with complete quality and kWh unit. It calculates closing minus opening and multiplies by each effective contract rate, using the agreed local TEST rounding/tax policy.

## Verified code gap requiring planned repair

The local TEST calculator's boundary query at line 37 requires an inner join through `telemetry_raw.mapping_version_id` to `register_mapping_versions`. Canonical MQTT ingestion at `payload-ingestion.ts:85` does not populate `mapping_version_id`; it records `payload_profile_revision_id` instead. These actual ingested rows cannot satisfy the existing boundary query. Changing a role checkbox alone cannot bridge this provenance mismatch.

The previously passing seeded financial flow validates calculation/document/payment behavior using seeded register-mapping provenance. It does not establish that canonical MQTT ingestion reaches billing calculation. The next implementation needs an explicit supported provenance path for both immutable payload profile revisions and legacy register mappings, then an ingestion-to-calculation test using actual accepted messages rather than prewritten billing readings.

Additional behavior to review: `payload-ingestion.ts:83` marks healthy messages older than two minutes as partial, while billing requires complete quality. A valid late-arriving historical boundary currently cannot qualify without a separately agreed distinction between measurement validity and live freshness. Do not silently relax quality checks.

## Physical meaning must be explicit

The `import` tag names a device counter direction; it cannot prove whether the meter measures solar energy delivered to the customer, grid import, or total facility consumption. Preset selection and a role cannot establish installation topology. The UI should show the selected site's primary device, source Field, canonical tag, units/conversion, measurement purpose, effective mapping, and the actual delta × contract-rate formula. Confirm the intended measurement purpose instead of inferring it from `import`.

## Organization tax identity

- `infra/migrations/002_platform_data.sql:2` stores organization identity in the internal `schools` table: name, unique code, region, and status. It has no customer tax identity fields.
- `infra/migrations/009_company_banking_and_contract_rates.sql:40` onward adds customer tax ID, legal company name, branch, tax address, billing email, and billing phone to individual contracts.
- `apps/api/src/modules/billing/local-financial-application.service.ts:58` requires the contract's customer legal/tax identity when issuing documents. `company_profile` contains issuer identity, not customer organization identity.

Q27 therefore requires an organization tax master plus prefill into new contracts/documents, while existing contract and issued-document snapshots remain unchanged. Editing the master must not rewrite historical issued identity. Whether an editable draft follows later master changes should be an explicit behavior, with refresh/review rather than silent replacement.
