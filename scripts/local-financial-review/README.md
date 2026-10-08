# Local financial flow fixture

Run from the repository root. All credentials below are synthetic local-only fixtures. No real email recipient or real payment slip belongs here.

```powershell
. ./scripts/local-financial-review/environment.ps1
docker compose -f scripts/local-financial-review/compose.yml -p solar-financial-flow-review up -d
pnpm db:migrate
node scripts/local-financial-review/seed.mjs
node --test scripts/local-financial-review/guard.test.mjs
```

Requires migration 029 from financial implementation. Six login identities are listed in docs/financial-local-fixture-inputs-2026-10-08.json. Default local-only password: `LocalFinancial2026!`; optionally set `LOCAL_FINANCIAL_TEST_PASSWORD` before seed. The seed never prints passwords/hashes or creates financial outputs. Credentials are never sourced from .env.

Database 127.0.0.1:15449/solar_financial_flow_review; Redis16449; SMTP11049; Mailpit UI18049; storage19049. All Compose published ports bind loopback. App API13059/web13049. Canonical local fixture marker solar-financial-flow-review-v1.

Seed creates two organizations, three sites, six scoped users, meter/logger devices and independent cumulative measurements hourly from July 1 to October 1 Bangkok. Site A new has no contract. Site B omits September final boundary. Use API/job workflow with simulated time October1 01:00 Bangkok to create financial outputs; never insert fake issued invoices. Missing boundary repair should insert an actual marked canonical reading through permitted local ingestion and rerun normal recheck.

Reset defaults to dry-run. `node scripts/local-financial-review/reset.mjs --apply` checks exact URL, connected database, marker for nonempty fixture and exact Docker project/volume labels before deleting only this stack's volumes. Old dashboard dataset deletion is deliberately separate: verify both exact old volume labels, old database fixture audit `solar-dashboard-review-v1` and no running unrelated users before removing solar-dashboard-review_review-postgres and solar-dashboard-review_review-storage. Never use global Docker prune.

Workflow acceptance must capture issued downloadable PDF and Mailpit attachment bytes, compare SHA256, and record invoice contract IDs, document numbers, receipts, rejected/resubmitted transfers, exact settlement, idempotent replays and cross-organization denials. Persist local policy state verification_in_progress before runner; mark verified only after real API/job checks pass. Production readiness remains unchanged.
