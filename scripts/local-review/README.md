# Local synthetic Dashboard review

Open http://localhost:13009 on Nateekarn-PC. API: http://localhost:13019/health.
Use `admin@review.local` or `owner@review.local`, password `ReviewSolar2026!`.
Other roles: `operator`, `accountant`, `school_user` at the same domain/password.
All identities, schools, amounts and readings are synthetic. These credentials are local review fixtures only.

## Isolated data

The compose project is `solar-dashboard-review`. PostgreSQL is exclusively
`127.0.0.1:15439/solar_dashboard_review`; Redis16379 and storage19009 use separate
containers/volumes. MQTT and default broker connections are disabled. Existing
solar containers, production data and the original checkout are not modified.

The seed creates18 schools/sites,17 gateways,34 devices,5 users,576 billing cycles,
invoices/payments, alerts, profile variants and approximately36,000 cumulative
readings across October2025–October2027. Dates in the future are intentional fixtures.
Site14 has missing days/bad latest quality;15 has stale readings;13 has measured
zero;16 is empty;17 is unconfigured. Indices are zero-based; labels start at01.
Historical and refreshed energy use the same explicit Bangkok baseline.

## Start/restart (PowerShell, repository root)

```powershell
docker compose -f scripts/local-review/compose.yml up -d
. ./scripts/local-review/environment.ps1
# Only for an empty newly created review volume:
node node_modules/tsx/dist/cli.mjs apps/api/src/scripts/db-migrate.ts
node scripts/local-review/seed.mjs
# Keep running for current synthetic readings:
node scripts/local-review/refresh.mjs --watch
```

The seed refuses an existing database with schools and never truncates or deletes.
Do not run the repository's general `db:seed` command: it is not this safe fixture.
Refresh verifies the exact database and ownership marker; it is repeatable and
inserts synthetic samples every30seconds. Stop its terminal with Ctrl+C to let
readings become stale naturally. `align-history.mjs` is a one-time idempotent
repair for earlier versions of this fixture; it updates only marked synthetic
history, performs a transactional curve check, and is unnecessary for a new seed.

In separate terminals, with the environment script loaded in each:

```powershell
node node_modules/tsx/dist/cli.mjs --tsconfig apps/api/tsconfig.json apps/api/src/main.ts
# Web terminal:
Set-Location apps/web
node node_modules/next/dist/bin/next dev --webpack -H 127.0.0.1 -p 13009
```

Use the existing installed dependencies. Build local workspace packages before
starting if dependencies have changed. The current worktree's dependency links
resolve `@solar/*` to this worktree. Stop application terminals with Ctrl+C;
`docker compose -f scripts/local-review/compose.yml stop` preserves fixture data.
No reset/delete command is provided.

## Visual review

Select October2026 for dense data. Select site17 (zero-based16) for empty cards.
Dashboard retains its existing maximum of three calendar months per request.
November2026–January2027 exercises a year boundary. The requested longer
October2026–October2027 string is covered by formatter tests; that long API
range remains rejected by the existing guard.
Admin sees Gateway/meter cards; Owner sees shared business content and the solar
diagram while technical pages remain forbidden. Open comparison and check more
metric columns. Settings > meter values contains Profile cards/details/Add with versioned editing. The Register tab was removed in round2; its backend remains. Display/production menus are removed; compatible URLs
remain and profile settings stay available from the profile popover.

The normal diagram displays PV only from an explicitly mapped fresh solar logger.
Building load and grid directions remain unknown until independently measured.
Separate screenshots of fully measured import/export use a prominently labeled
synthetic test harness of the same view component, not a production data override.

## Telemetry/Register audit limits

No current production site, authenticated live telemetry or external broker was
accessed. The historical user sample (2200Wh import,0Wh export,
`pilot-spm911.0.0`) proves no instantaneous power or physical direction.
Repository capabilities include voltage/current/frequency/power factor,
active/reactive/apparent power, import/export energy, solar logger power/yield,
irradiance and temperatures. These are supported fields, not evidence of what
any real site currently publishes. Many electrical/environmental fields are not
shown on the Dashboard; they must be checked against real bound profiles/samples.

The solar/v1 schema1.1 payload path uses profile revision mapping, tags, units and
roles, without Register decoding. Legacy rawRegisters/registers ingestion still
uses effective register_mapping_versions, and archives preserve those versions.
Direct legacy numeric metrics bypass decoding. Register presets clone into device
configuration; profile and Register preset selection are mutually exclusive.
ModbusTcpConnector exists as adapter/tests; no live polling consumer was found.
Hardware-config can separately publish register/parameter configuration; there is
no identified web caller. Register CRUD alone is not that publish operation.
Register backend/history is retained; the latest round2 instruction removes its tab from the meter-values UI.

## Checks

`node --test scripts/local-review/guard.test.mjs scripts/local-review/energy-baseline.spec.mjs`
checks the local target guard and the shared timezone baseline. Web/API lint
scripts are TypeScript checks. Full suite results and visual evidence are recorded
in the controller's `../evidence`, `../ui-report.md` and `../review-report.md`.

Round1 checks: web83/83; API134passed,2skipped; local safety/baseline2/2;
browser20/20, Admin/Owner main flow has no console errors. API skipped cases are
the opt-in disposable PostgreSQL dashboard suite and local MQTT+PostgreSQL
integration suite. Both application TypeScript/lint commands and diff whitespace
check passed. A production build and external broker/live-site tests were not run.
The independent source review passed after two P2 fixes; browser QA additionally
found and fixed the Profile picker's unstable default-array rendering loop.

Round2 verification: web90/90, API134passed/2skipped, final focused controls2/2,
96 route/theme/role computed-style checks and34 browser interaction cases.
Profile edit created version1.0.1;34device bindings,36,228historical readings and
the original revision stayed unchanged. Evidence: ../evidence/round2.

## Round 3 review

The dashboard shares URL site selection across markers, dropdown, map fallback,
reset, values and scoped notifications. Owner authorization stays separate from
Admin. Gateway freshness describes one representative gateway per site. Unknown
load/grid measurements remain unknown. Charts support native tap, keyboard and
switching between them, with theme-aware Thai date/unit tooltips.

Final web suite: 103 passed. API suite: 135 passed, 2 existing opt-in skips.
TypeScript/lint and API build passed. Next production build passed with
`next build --webpack`. Default Turbopack cannot follow this isolated worktree's
node_modules junction outside its filesystem root; dependency and build settings
were not changed. Detailed browser results and screenshots live in
`../evidence/round3`; final counts are in `verification-summary.json`.

The before/after database fingerprint preserves 34 device bindings, 11 profile
revisions, 36,228 historical rows and 576 bills. Synthetic live readings keep
refreshing. No real-site telemetry, physical flow or external map-tile service
availability is claimed from these fixtures.
