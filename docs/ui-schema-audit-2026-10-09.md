# UI and schema alignment audit

Read-only code/schema-definition audit, 2026-10-09. No live database inspection or runtime verification is claimed.

## Minimal changes for the requested UI

- Gateways: `apps/api/src/modules/assets/assets.controller.ts` already provides derived online/offline, telemetry receipt/measured times, selected power and device counts. Connectivity uses gateway heartbeat; telemetry receipt uses sample receipt. No new schema is needed for these display fields. Add validated search/status/site filters as needed, preserving technical scope and retired exclusions.
- List filtering: `apps/api/src/modules/dashboard/operation-query.ts` rejects unknown keys. Add explicit per-resource filter types and parameterized predicates; include filters in cursor fingerprints and apply the same scope/predicates to lists and exports. Existing resource fields generally suffice. Adapt the date-range control to list from/to query parameters.
- Alert rules: migration 043 already models kind, thresholds, duration, cooldown, recovery, recipients, channels and enabled state. DELETE disables rather than deletes. Separate absence of configured rules, absence of enabled rules, absence of alert events, and filtered-empty results. Modal conversion needs no schema migration.
- Alert runtime: `operational-automation.service.ts` gates technical evaluation through localFinancialBinding and FINANCIAL_WRITES_ENABLED. An enabled rule alone does not prove evaluation is running. Resolve intended runtime scope before presenting rules as active automation.
- Staff: migration 047 separates positions, domain permissions and employee grants. Filter existing users.status and position assignment; include unassigned staff. Account status and invitation delivery status are different concepts. Preserve impact previews and current invitation flow.
- Own account: `me.controller.ts` supports own display-name update; preferences persist theme/language. Preserve role/email/identity protection. Password update verifies current password and revokes sessions. Avatar upload/cropping needs own-media endpoints/storage and a migration for the media reference. Authenticator 2FA needs enrollment, login challenge, recovery and credential storage; it is not present today.
- Dashboard: actual sources include installed capacity, measured power, period energy, ranking, finance/maintenance queues, coordinates and data-quality metadata. Missing/stale values must not become zero. Billing amount is not cash received or revenue inferred from generated energy.

## Focused extension boundaries

Use typed filter definitions by resource, a reusable accessible list toolbar/range input/actions cell, separate account profile/media/authentication capabilities, and existing rule kind/channel models. Add only fields and endpoints required by confirmed current flows. Do not introduce a generic query language, speculative configuration UI, or duplicate gateway status fields.

## Mockup review limitations

Generated concepts contain illustrative values and may embellish details. Do not infer new requirements from generated percentages, capacity utilization, energy allocation, site health, geographic points, or comparative figures. Each selected card must be bound to an existing metric or receive an explicit definition before implementation.

## Decision resolution and implementation

The user approved disabled-rule empty state with a persistent settings entry, real TOTP with recovery codes, cropped-image-only retention, mobile cards, and independent technical-alert evaluation. Dashboard selection and implementation were deferred. This document records the initial audit; subsequent implementation and runtime verification are recorded in `docs/ui-account-consistency-verification-2026-10-09.md`.
