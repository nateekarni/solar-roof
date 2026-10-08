# Local financial flow fixture

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

The old dataset deletion completed after rechecking Compose labels, its audit marker `solar-dashboard-review-v1`, 18 synthetic REVIEW schools, 5 review.local users and no client application sessions. Only owned old project containers and exact volumes `solar-dashboard-review_review-postgres` and `solar-dashboard-review_review-storage` were removed. Other volumes and networks were preserved.

The canonical history provides cumulative meter import and independent logger total yield. It provides no current solar active-power sample, so current generation remains unavailable until supported ingestion supplies it.

Canonical sample values and units are derived from each pinned profile before insertion: Wh identity stores value × 1000; Wh-to-kWh stores kWh. Unsupported or inconsistent mappings stop the seed. The inspected pinned Schneider/Huawei profiles currently target kWh; raw source values remain Wh and billing telemetry remains kWh.

## Launch and acceptance

After migration and seed, source `environment.ps1` in each terminal and run `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json src/main.ts` and `pnpm --filter @solar/web exec next dev -H 127.0.0.1 -p 13049`. The API binds 127.0.0.1; open http://localhost:13049. Organization account: finance-a@example.test. Owner account: owner@example.test. Consult the fixture manifest for all six identities.

On a fresh fixture only, run `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json test/local-financial-workflow.integration.ts`. The runner performs real writes, so reset and reseed before repeating it; preserve the completed fixture for manual review.

The complete runner passed 18 checks on 2026-10-08: monthly issue, exact decimal totals, downloaded/SMTP PDF equality, rejection/resubmission, multiple transfers, underpayment and overpayment blocks, concurrent duplicate evidence, cross-organization scope, replay safety, immutable artifacts, hourly missing-data gate and repair, HTTP contract creation with inclusive multi-rate periods, required bank data, Owner/Accountant approval authority, invalid dates and unchanged original bytes after settings edits. The persisted TEST policy was marked verified only after all checks passed. Full adjustment/cancellation and production accounting rules remain deferred.