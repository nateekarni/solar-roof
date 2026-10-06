# Unit conversion design

Status: core dependent unit selection and shared ingestion conversion implemented. Existing profile revisions remain unchanged. The editor shows a fixed 1,000-unit preview; editable sample values, localized catalogue descriptions and broader historical migration remain future work.

Implementation: source and target selects share a versioned catalogue, reset incompatible targets and derive conversion without an independent selector. New pairs use auto-v1 while existing identity/wh-to-kwh/varh-to-kvarh remain supported under envelope schema 1.1. Unknown units already present in profiles remain identity-only. New profiles choose supported catalogue units. Verified with 13 conversion/payload tests, API/web TypeScript checks and the browser Wh → kWh workflow.

## Current behavior

The profile validator allows identity only for identical source and target units. Wh/kWh requires wh-to-kwh, and varh/kvarh requires varh-to-kvarh. A Wh/kWh identity profile is rejected before publishing. MQTT ingestion checks the received unit against the source unit and retains raw values separately from normalized values.

## User interface

Replace the conversion selector with source and target unit comboboxes backed by a shared unit catalogue. Offer only dimension-compatible target units. Default the target to the source when a new source is selected; retain an existing compatible target during edits. Derive the conversion automatically and show its formula, an editable sample input, and the computed output. Do not guess a conversion for unknown units.

Examples: same unit keeps its value; 12,500 Wh becomes 12.5 kWh; 2 kW becomes 2,000 W; 32 °F becomes 0 °C. Show units, precision and missing/invalid values consistently in card and table views.

## Shared conversion module

Use a versioned, server-owned unit registry with canonical codes, localized names, explicit aliases, dimensions and conversion definitions. Start with active energy Wh/kWh/MWh, reactive energy varh/kvarh/Mvarh, active power W/kW/MW, reactive power var/kvar/Mvar, apparent power VA/kVA/MVA, voltage V/kV, current A/mA, frequency Hz/kHz, temperature °C/°F/K, irradiance W/m², wind speed m/s and km/h, and dimensionless ratio/percent.

Keep active, reactive and apparent quantities distinct. Energy cannot convert to power without an explicitly modeled duration; currency cannot convert to energy. Distinguish a dimensionless value from an unknown or missing unit. Unknown units support identity only with the exact same unit. Percent/ratio conversions must use explicit unit codes, never infer semantics from a field name.

The same pure conversion interface validates profiles and calculates ingestion results. Permit only registry-defined scale and offset conversions, never executable scripts. Preserve case-sensitive SI semantics; recognize only explicit aliases. Reject unsupported pairs, nonfinite numbers and invalid definitions. Validate ranges using field metadata where appropriate; do not blanket-reject negative power, which can represent reverse flow.

## Data and billing

Retain raw value/unit, normalized value/unit, profile revision and conversion registry version for traceability. Store computation precision without UI rounding. Format at display/export boundaries, and expose raw and normalized columns distinctly when relevant.

Billing requires the explicitly selected cumulative active-import meter, normalized to kWh. A valid conversion alone does not make a field billable. Preserve existing reset/rollover, ordering and quality handling; never silently recalculate issued bills or historical samples after changing a profile.

## Delivery sequence

1. Implement the shared registry and tests, retaining adapters for the three existing conversion enum values.
2. Introduce a new profile schema version with derived conversion metadata and explicit registry version. Keep old revisions readable and pinned.
3. Update the field editor, automatic conversion, compatible target options, preview and localized validation.
4. Use the shared module for MQTT normalization, then align table, chart and CSV formatting.
5. Offer an explicit revision upgrade for existing devices. Do not rewrite existing profiles or history automatically.

## Verification

Test each supported pair and its inverse, identity, scale and offset conversions, aliases/case sensitivity, unknown units, incompatible dimensions, empty/NaN/Infinity values, very large/small values and fractional precision. Confirm editing card/table views preserves values and the preview matches ingestion. Test Wh payload → normalized kWh storage → display → billing with fixed fixtures, alongside old profile revisions, replay/idempotency, resets, rollovers and out-of-order samples. Confirm unit changes do not alter previously issued bills.
