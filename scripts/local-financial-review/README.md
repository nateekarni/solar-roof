# Local financial flow fixture

Seed preflight and commands (PowerShell, repository root):

```powershell
. ./scripts/local-financial-review/environment.ps1
node scripts/local-review/verify-target.mjs financial
# September fixture; repeat execution preserves existing accounts/documents:
node scripts/local-financial-review/seed-september.mjs
# Alternatively, three-site prerequisite fixture (also safe to repeat):
node scripts/local-financial-review/seed.mjs
```

Every seed validates the running local Docker PostgreSQL container's Compose
ownership, database and loopback port before connecting. Remote Docker daemons,
production/staging environments and URL query overrides are refused. Seeding never
resets or truncates. Both seeds recognize owned data and normalize bracketed display
prefixes only on deterministic fixture IDs. They preserve passwords and completed
financial records, and backfill absent explicit customer site assignments after
migration 040. Conflicting assignments are preserved and reported as an error.
Readable displays retain fixture names without bracketed test prefixes. User
displays use Thai role labels because verified personal names were not supplied.
Tax and banking values remain the previously approved synthetic fixture values;
these commands do not verify or invent real tax or banking data.

Repeat execution also replaces opaque acceptance fixture suffixes with readable
site/gateway labels when an exact known label, matching technical code and a
`billing_source.bind` audit establish ownership. Existing customer reference names
are บ้านคลองแสน, บ้านดอนแก้ว and บ้านไผ่เมือง; role names are used for people.
Historical document snapshots and immutable payload revisions retain their original
contents. Cleaned current payload displays use new revisions rather than rewriting
history. Technical IDs, external codes and login addresses remain deterministic.

`seed-pilot-users.ts` and `seed-site-customer-user.ts` now require these dedicated
local Docker review targets. The capacity seed requires its owned local Docker
readiness target. Production account provisioning must use the normal account API.

## September 2026 manual billing test

From the repository root, run `pwsh -NoProfile -File scripts/local-financial-review/start-test.ps1 -RunBilling`.
This starts the isolated infrastructure, applies pending migrations, seeds the September fixture once,
starts API/web in hidden processes, then creates the contract, billing cycle, invoice and local SMTP email
through the normal API. Existing fixture accounts and financial documents are preserved on replay.
Open [the test app](http://localhost:13049) and [Mailpit](http://localhost:18049).

All five synthetic accounts use password `LocalFinancial2026!` by default:

| Role | Email |
| --- | --- |
| admin | admin.september@example.test |
| owner | owner.september@example.test |
| operator | operator.september@example.test |
| accountant | accountant.september@example.test |
| customer_user | customer.september@example.test |

Set `LOCAL_FINANCIAL_TEST_PASSWORD` before the first seed to override the password. Replays preserve
the original passwords; the runner must use that same override. The customer account belongs only to
the new test customer. The site is `SEP-SITE-001`, gateway `SEP-GW-001`, with independently configured
meter and logger profiles. History is synthetic hourly September data in Asia/Bangkok, including both
month boundaries: 11,900 kWh at 3.50 THB/kWh, subtotal 41,650.00, VAT 2,915.50, total 44,565.50 THB.
It is not a record of actual customer usage. Email is captured locally, with no real recipient.

For seed/start without issuing an invoice, omit `-RunBilling`. For billing replay with servers already
running, source `./scripts/local-financial-review/environment.ps1` then run
`pnpm exec tsx scripts/local-financial-review/run-september.mjs`.
The runner verifies all five logins, one invoice, stored PDF hash and matching Mailpit attachment.
Results are saved to `.superpowers/september-billing-result.json` and `.superpowers/september-invoice.pdf`.
Invoice numbering uses the issue date; the usage period remains September.

The older fixture instructions below describe the previous acceptance dataset; no reset is needed
to add or replay the September fixture.

Run from the repository root. All credentials below are synthetic local-only fixtures. No real email recipient or real payment slip belongs here.

```powershell
. ./scripts/local-financial-review/environment.ps1
docker compose -f scripts/local-financial-review/compose.yml -p solar-financial-flow-review up -d
pnpm db:migrate
node scripts/local-financial-review/seed.mjs
node --test scripts/local-financial-review/guard.test.mjs
```

Requires migrations 029–032 from the financial implementation branch. Six login identities are listed in docs/financial-local-fixture-inputs-2026-10-08.json. Default local-only password: `LocalFinancial2026!`; optionally set `LOCAL_FINANCIAL_TEST_PASSWORD` before seed. The seed never prints passwords/hashes or creates financial outputs. Credentials are never sourced from .env.

Database 127.0.0.1:15449/solar_financial_flow_review; Redis16449; SMTP11049; Mailpit UI18049; storage19049. All Compose published ports bind loopback. App API13059/web13049. Canonical local fixture marker solar-financial-flow-review-v1.

Seed creates two organizations, three sites, six scoped users, meter/logger devices and independent cumulative measurements hourly from July 1 to October 1 Bangkok. Site A new has no contract. Site B omits September final boundary. Use API/job workflow with simulated time October1 01:00 Bangkok to create financial outputs; never insert fake issued invoices. Missing boundary repair should insert an actual marked canonical reading through permitted local ingestion and rerun normal recheck.

Reset defaults to dry-run. `node scripts/local-financial-review/reset.mjs --apply` checks exact URL, connected database, marker for nonempty fixture and exact Docker project/volume labels before deleting only this stack's volumes. Old dashboard dataset deletion is deliberately separate: verify both exact old volume labels, old database fixture audit `solar-dashboard-review-v1` and no running unrelated users before removing solar-dashboard-review_review-postgres and solar-dashboard-review_review-storage. Never use global Docker prune.

Workflow acceptance must capture issued downloadable PDF and Mailpit attachment bytes, compare SHA256, and record invoice contract IDs, document numbers, receipts, rejected/resubmitted transfers, exact settlement, idempotent replays and cross-organization denials. Persist local policy state verification_in_progress before runner; mark verified only after real API/job checks pass. Production readiness remains unchanged.

## Verified execution on 2026-10-08

The real guarded seed transaction passed after migrations 029 and 031. Database evidence showed 2 organizations, 3 sites, 6 users, 2 contracts, 13,252 raw readings and 13,252 canonical payload samples, all `good/online`. Documents and payments remained zero. Exact fixture marker `solar-financial-flow-review-v1` persisted with policy state `verification_in_progress` and purpose `real_api_workflow_verification`.

The old dataset deletion completed after rechecking Compose labels, its audit marker `solar-dashboard-review-v1`, 18 synthetic REVIEW customers, 5 review.local users and no client application sessions. Only owned old project containers and exact volumes `solar-dashboard-review_review-postgres` and `solar-dashboard-review_review-storage` were removed. Other volumes and networks were preserved.

The canonical history provides cumulative meter import and independent logger total yield. It provides no current solar active-power sample, so current generation remains unavailable until supported ingestion supplies it.

Canonical sample values and units are derived from each pinned profile before insertion: Wh identity stores value × 1000; Wh-to-kWh stores kWh. Unsupported or inconsistent mappings stop the seed. The inspected pinned Schneider/Huawei profiles currently target kWh; raw source values remain Wh and billing telemetry remains kWh.

## Launch and acceptance

After migration and seed, source `environment.ps1` in each terminal and run `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json src/main.ts` and `pnpm --filter @solar/web exec next dev -H 127.0.0.1 -p 13049`. The API binds 127.0.0.1; open http://localhost:13049. Organization account: finance-a@example.test. Owner account: owner@example.test. Consult the fixture manifest for all six identities.

On a fresh fixture only, run `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json test/local-financial-workflow.integration.ts`. The runner performs real writes, so reset and reseed before repeating it; preserve the completed fixture for manual review.

The complete runner passed 18 checks on 2026-10-08: monthly issue, exact decimal totals, downloaded/SMTP PDF equality, rejection/resubmission, multiple transfers, underpayment and overpayment blocks, concurrent duplicate evidence, cross-organization scope, replay safety, immutable artifacts, hourly missing-data gate and repair, HTTP contract creation with inclusive multi-rate periods, required bank data, Owner/Accountant approval authority, invalid dates and unchanged original bytes after settings edits. The persisted TEST policy was marked verified only after all checks passed. Full adjustment/cancellation and production accounting rules remain deferred.
