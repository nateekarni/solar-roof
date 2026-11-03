# Gateway register, billing meter, and bulk approval plan

**Date:** 2026-10-23  
**Status:** Implemented and verified locally; physical SPM91 decoder still requires confirmation against the meter specification or live telemetry before real gateway publication  
**Source:** User request in this conversation and the attached `Zoom_PmY2LjuzfU.png` raw-register example. The image supplies sample data, not implementation instructions.

## Goal and current findings

1. Make the Pilot SPM91 preset populate complete default register mappings, with variable names, units, physical decoder settings, and a coherent Config/Update representation. The current `pilot-spm91` payload preset in `infra/migrations/028_preset_catalog.sql` has semantic fields and units but no register addresses. A separate legacy `SPM91` preset in `infra/migrations/008_gateway_telemetry_and_register_mapping.sql` has R0–R12 decoder definitions. The config preparation path copies only `registerAddress` from payload profiles and therefore cannot populate complete decoder settings from a payload preset.
2. Make selection of a billing meter available while configuring a gateway that has not connected. The site billing-source picker already exists, but its placement and data dependencies need to be checked against the disconnected/new gateway flow. Saving a source must not imply that readings exist or that a bill is ready.
3. Make both bulk approval entry points (selected rows and the page-header Approve button) present the same site/amount/chevron table. The current shared bulk component already has that table but wraps expanded details in another bordered card. Remove that inner card and preserve existing review, selection, signature, password, and approval safeguards.

### Register sample and data integrity

The attached image labels R0/R1 energy, R2 voltage, R3/R4 current, R5/R6 active power, R7/R8 apparent power, R9/R10 reactive power, R11 frequency, and R12 power factor. Example raw values include `R0=96`, `R2=22956`, `R9=65443`, `R10=65535`, `R11=4996`, `R12=972`. The image does not specify Modbus address base, scale, signedness, byte order, or physical units. The legacy preset provides candidate decoder settings, which must be verified against the Pilot SPM91 device specification or representative real telemetry before publishing a changed config. In particular, the current payload profile marks energy `Wh -> kWh`, whereas the legacy decoder labels the scaled energy value `kWh`; this mismatch could double-convert billing energy. Do not invent an export-energy register: the sample only demonstrates import/total active energy.

## Implementation sequence after approval

### 1. Baseline and contract trace

- Record the preexisting working-tree diff, identify the actual `SPM91-01` device and site in local seed/database, and trace `config` (server to gateway) versus `configUpdate` (gateway proposal to server). Keep existing protocol direction and version/hash/approval rules.
- Trace how preset fields, explicit device mappings, active `register_mapping_versions`, and billing-source eligibility combine. Capture representative payloads and decoder output before changes.
- Inspect the current gateway create/edit flow in disconnected, pending, and connected states; inspect both bulk approval launchers and narrow-screen behavior.

**Files to inspect:** `packages/api-contracts/src/gateway-control.ts`, `apps/api/src/modules/gateway-control/gateway-control-payload.ts`, `apps/api/src/modules/gateway-control/gateway-configuration.service.ts`, `apps/web/features/sites/gateway-form-dialog.tsx`, `apps/web/features/sites/gateway-edit-dialog.tsx`, `apps/web/features/sites/site-billing-source.tsx`, `apps/web/features/billing/billing-header-bulk-action.tsx`, `apps/web/features/shared/operation-table.tsx`.

### 2. Pilot SPM91 default mapping and Config/Update

- Add a new immutable preset revision/migration for Pilot SPM91, leaving old revisions and historical ingest evidence intact. Define R0/R1, R2, R3/R4, R5/R6, R7/R8, R9/R10, R11, and R12 against their semantic tags, with complete decoder metadata (`registerAddress`, `registerCount`, `dataType`, word/byte order, scale, offset), poll group, variable label, source unit, target unit, and conversion.
- Reconcile the `Wh -> kWh` energy profile with the legacy `kWh` decoder before selecting a final scale/conversion. Mark only the proven import/total energy field as billing eligible; handle the existing export field without fabricating an address or silently declaring the mapping complete.
- Extend the payload-profile schema and preset-to-device application path so every physical decoder field survives preset selection, preview, config preparation, storage, and serialization. Preserve intentionally overridden mappings, and avoid silently rewriting an approved/live config.
- Confirm `config` emits the complete mapping. Confirm a gateway-originated `configUpdate` round-trips the same metadata through parsing, proposal review, and approval. If the gateway firmware requires additional variable/unit properties beyond the current `GatewayRegisterMapping` contract, add them compatibly and update validation for both message types rather than changing message direction.
- Target `SPM91-01` by verified device identity, with a reviewable migration/reconciliation step for any existing instance; show a config diff and require the normal publish/acknowledgement lifecycle. Do not mass-update other meters.

**Likely files:** `infra/migrations/` (new numbered migration), `packages/api-contracts/src/gateway-control.ts`, payload-profile contract/schema, `apps/api/src/modules/gateway-control/gateway-configuration.service.ts`, gateway payload schema, preset/UI mapping adapter, focused API/domain tests.

**Acceptance checks:** Selecting the new Pilot SPM91 preset shows R0–R12 defaults and correct variable/unit labels; saving and reloading preserves all decoder fields; Config and configUpdate validate and contain the expected fields; decoding sample registers yields plausible voltage/current/power/frequency/PF/energy values with correct signed reactive power, and billing energy is converted exactly once; older preset revisions remain readable.

### 3. Billing meter selection before gateway connection

- Expose the site billing-source selection during the disconnected gateway setup/edit flow as soon as the site and candidate meter/profile exist, independent of MQTT connection or first telemetry. For gateway creation, guide the user into the picker after gateway and device creation succeeds, preserving the current partial-success/retry behavior.
- Make candidate availability, chosen meter, measurement purpose, and required confirmation clear in the UI. Keep server-side checks that the meter is eligible, belongs to the site, and has a valid billing import field. Display pending/offline status separately from binding state.
- Ensure a save/reload shows the selected billing meter immediately and that switching site/gateway does not leak stale selection.

**Likely files:** `apps/web/features/sites/gateway-form-dialog.tsx`, `gateway-edit-dialog.tsx`, `gateway-billing-source-section.tsx`, `site-billing-source.tsx`, `billing-source-panel.tsx`, relevant billing-source API/service only if it currently rejects disconnected devices.

**Acceptance checks:** Admin can choose and save `SPM91-01` as billing source before first connection; other roles retain intended permissions; server rejects invalid/other-site/unsuitable devices; pending connection remains visibly pending; choice survives reload and does not enable billing without valid readings.

### 4. Bulk approval modal

- Route the two requested launchers through the same bulk table presentation, even when the bulk selection contains one item. Keep row-level single-document approval behavior as a separate entry point.
- Show one row per document with site name on the left, formatted amount right aligned, and an accessible chevron for expansion. Render period, energy, tariff, replacement notice, and other existing details directly in the expanded table row without an inner bordered/background card. Keep checkbox selection, total/count, review-token checks, signature upload, password prompt, failure feedback, and 100-document limit.
- Check responsive width and scrolling on mobile, keyboard/ARIA expansion, Thai/English labels, and consistency between page-header and selected-row launchers.

**Likely files:** `apps/web/features/billing/billing-bulk-approval.tsx`, `billing-header-bulk-action.tsx`, `apps/web/features/shared/operation-table.tsx`, existing component tests.

**Acceptance checks:** Both launchers show the same table; every row displays site/amount/chevron; expand/collapse reveals content without a nested card; submitted IDs match selected eligible rows only; validation and approval remain intact.

### 5. Verification and local review

- Run focused contract, decoder, gateway-config, billing-source, and bulk-approval tests, then typecheck/build and any affected migration validation. Add tests for the specific cross-layer risks above rather than visual snapshots that merely mirror markup.
- Start the local API/web stack and exercise Pilot SPM91 preset selection, disconnected billing-meter selection, Config/Update payload inspection, and both approval-modal launchers. Inspect desktop and mobile layouts, document actual results and any firmware/device-spec uncertainty.
- Review the final diff against preexisting changes. Only modify files required for this request.

## Verification outcome

The user approved implementation. Codex CLI ran with `gpt-5.6-sol` and high reasoning effort. The focused gateway, decoder, billing-source, and bulk-approval suites passed; repository lint and build passed. The isolated local review stack exercised the Pilot SPM91 preset, creation and binding of an offline `SPM91-01` meter, and both bulk approval launchers at desktop and mobile widths. No document was approved during the UI check. The full repository test run remains red in a separate receipt-idempotency test (`human-numbering.spec.ts`, “Billing statement is already settled”), which is outside this plan's changes.
