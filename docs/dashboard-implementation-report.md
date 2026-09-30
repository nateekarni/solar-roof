# Dashboard implementation report — 2026-09-30

## Result

Task 3 implemented in the existing checkout. No commit, deployment, database reset or production seed was performed. Existing navigation already omitted schools and the separate system menu; `/system` now redirects to home. Home combines selected-site statistics, billing counts, gateway measurements, charts, alerts, map and site comparison.

## Requirements and file evidence

| Requirement | Implementation |
|---|---|
| Server-authorized site scope on every dashboard query | `apps/api/src/modules/dashboard/dashboard.service.ts`: resolves allowed sites from principal and common `schoolScope`; all telemetry, billing and alert queries use those resolved IDs; invalid site and compare IDs fail closed. Owner/global staff and assigned school users follow common policy. |
| Date bounds, annual disabled | `dashboard-range.ts`, `dashboard.controller.ts`: real calendar validation; both endpoints required; chronological order; at most three calendar months; annual/multi-year rejected. Bangkok current month default. |
| Compare sites and actual IDs | `compare-modal.tsx`: visible site selector, metric and inherited home date range; responses keyed by `siteId`, so duplicate names do not merge. API uses real billing `period_start`/`period_end`, not nonexistent columns. |
| Site filter and per-gateway dashboard | `site-filter.tsx`, `dashboard.tsx`, `power-flow-card.tsx`: selected `site_id` preserved with dates; all authorized gateways displayed with real names, last update and measured power. |
| True empty data | `dashboard.service.ts`: missing telemetry is null / empty arrays, not made-up loads, energy, tariff, present timestamps or hardware specs. Power uses latest fresh per-device `active_power_w / 1000`. No synthetic grid/load/export estimates. Collection shows explicit no billed amount state. |
| Energy and unit semantics | Raw cumulative meter deltas partition by device and include only active billing-meter devices through EXISTS; no summation of cumulative aggregate snapshots or mixed buckets. Queries bounded to selected Bangkok dates. Chart units kWh, power W→kW→MW; partial observed energy explicitly labeled. |
| Money and counts | Scoped bill count and paid bill count; payment existence avoids amount multiplication by duplicate payment joins; full THB amounts in cards, collection and chart. |
| 10-second refresh and 120-second freshness | `hooks/use-auto-refresh.ts`, `power-flow-card.tsx`: network refresh pauses when hidden/offline and resumes on visibility/online. API fresh-power source and received time both <=120 seconds. `lib/telemetry-age.ts` rejects missing/future timestamps. |
| Site list last-updated | Shared table/card list render relative `lastUpdated` with freshness; explicit `operation-columns.ts` field order prevents hidden metadata from shifting headers. Covers all current operation DTO resources. |
| School count hidden | Removed school stat from public contract/API; legacy saved school card maps to total sites. Map/ranking headings use sites and selected dates. |
| System merge and controls | `/system` redirects home; desktop site configuration actions restricted to admin. Billing agent coordinates corresponding mobile actions. |

## Main files

API: `dashboard.controller.ts`, `dashboard.service.ts`, `dashboard-range.ts` plus focused specs under `apps/api/src/modules/dashboard/`.

Web: dashboard feature components including new `site-filter.tsx` and `measured-chart.tsx`; shared operation table/card columns and refresh; new `lib/telemetry-age.ts`; home/system pages; `hooks/use-auto-refresh.ts`.

Contract: `packages/api-contracts/src/index.ts` exposes nullable measurements, selected range, available sites, bill counts, site comparison IDs and optional gateway timestamps.

## Verification

- Date tests were run red (3 failures) before implementation, then green.
- Explicit operation column tests were run red (2 failures) before implementation, then green.
- `pnpm --filter @solar/api exec tsx --test src/modules/dashboard/dashboard-range.spec.ts src/modules/dashboard/dashboard.service.spec.ts`: **8 passed**.
- `pnpm --filter @solar/web exec tsx --test lib/telemetry-age.spec.ts`: **1 passed**.
- `pnpm --filter @solar/web exec tsx --test features/shared/operation-columns.spec.ts`: **2 passed**.
- API, web and api-contracts TypeScript lint commands passed. Last web typecheck repeated after final date/timestamp/control edits and passed.
- Read local Next 16 router documentation before router edits.

## Integration limits / follow-up checks

- PostgreSQL16 execution was subsequently verified against the explicitly authorized disposable solar_readiness database using read-only connections. Missing AS before day aliases reproduced SQLSTATE42601 red, then passed after correction. Browser visual acceptance, live gateway and production infrastructure remain root integration checks.
- Energy is the sum of observed nonnegative consecutive meter increments, and deliberately marked partial. The first reading inside the selected interval has no attributable in-range predecessor; no fabricated midnight interpolation is applied. Meter resets are omitted instead of producing negative energy. Billing remains separately governed by financial baseline rules.
- Live card deliberately reports building load/import/export as unavailable because the current ingestion supplies generation-meter measurements without configured flow roles. Installing/identifying those meters is needed for a defensible flow diagram.
- Power-flow layout was simplified from the previous synthetic diagram to per-gateway real-measurement cards. Browser visual review remains necessary.
- Site one-gateway enforcement belongs to gateway task/migration010. Legacy gateway conflicts must be resolved before rollout; dashboard chooses oldest gateway deterministically for a site pending migration validation.
- Comparison caps at10 sites, resolves authorization once and executes at most one grouped metric query; query-count regression ran red (13 queries) and green (2 queries).
- Root should change audit final header from result to reason to match actual persisted `reason`; no fake success result was added.


## PostgreSQL integration repair

- Added dashboard.postgres.spec.ts gated by DASHBOARD_TEST_DATABASE_URL and restricted to127.0.0.1:15432/solar_readiness; default_transaction_read_only=on.
- Exercised summary, all5 compare metrics and power flow against real PostgreSQL16.
- Combined dashboard suite:9 passed; API typecheck passed.


## Nonfinancial UI mock cleanup follow-up

Removed unverified login claims (18+ sites,16.3MWp,100% security), replacing them with feature descriptions. No billing implementation files were edited.

- `app/(auth)/login/page.tsx`: feature copy replaces invented statistics.
- `app/(app)/settings/security/page.tsx`: removed fake2FA toggle/success, fabricated Windows/iPhone sessions and no-op sign-out success. Explicitly states that these capabilities are unavailable. Real password API remains intact.
- `app/(app)/settings/account/page.tsx`: removed fictional phone/department and local-only profile save success; renders saved account identity read-only with administrator update guidance.
- `app/(app)/settings/page.tsx`, `features/settings/school-settings-view.tsx`: removed fictional fallback email addresses; school overview now leaves absent contract number/rate/date/signers unknown rather than substituting sample values.
- `features/settings/system-settings-content.tsx`: loading/error state prevents local initial values from masquerading as a successfully loaded configuration.
- School detail: removed default site/gateway counts1 and invented operational-health prose; missing capacity/status is unknown.
- Report detail: removed sample generated timestamp,1.5MB size, made-up format/scope/description.
- Audit/notification/user details: missing status no longer becomes success/delivered/active, recipient and scope defaults no longer invent identities. Clipboard success follows the actual awaited browser action and handles failure.

Verification: web TypeScript lint passed after all changes. Low-impact copy/read-only UI edits were checked by source inspection and typecheck; browser visual acceptance remains with root.

Concrete leftovers intentionally outside this nonfinancial scope:

1. `app/(app)/settings/general/page.tsx:75`: DEFAULT_COMPANY still contains sample company name, tax ID0105562089412, Bangkok address, phone02-555-9000 and billing email; fetchCompany keeps defaults for absent/error responses. This is the paused financial configuration surface and needs separate approved cleanup.
2. `apps/api/src/modules/settings/settings.service.ts:59`: absent defaultUnitPriceThb is returned as4.25; system settings will faithfully display that API default after loading. Financial default policy needs owner resolution.
3. Account profile updates,2FA and session listing/revocation have no real implementation wired to these pages; unavailable features are now explicit instead of pretending success.
