# Local Financial Workflow Preparation Plan

> **For agentic workers:** Use executing-plans or subagent-driven-development after the financial-policy checkpoint is selected.

**Goal:** Repeatable, isolated real contract-to-invoice-to-payment-to-receipt verification with new synthetic local fixtures.

**Architecture:** Reconcile proposal v2 with active financial readiness/service interfaces; do not blindly apply the historical patch. Persist exact contract linkage and immutable issuance snapshots/artifacts. Provision local DB/storage/mail capture and guard reset by exact loopback host, port, database, project ownership and fixture marker. Seed prerequisite identities, contracts and canonical actual readings; exercise issuance/payment through real API/job workflows rather than seeding fake successful outputs.

**Tech Stack:** NestJS, PostgreSQL/Timescale, worker jobs, local object storage, local email capture, node:test/Playwright.

**Spec:** docs/ui-improvement-decisions-2026-10-08.md; deferred choices in docs/financial-local-test-options-2026-10-08.md.

## Global constraints

- This is preparation, not approval of the unselected calculation/tax-document policies.
- Never enable production readiness with a flag alone; local test provenance is environment-bound.
- Preserve real access controls and canonical measurements; no estimated energy or fabricated successful documents.
- Two organizations, three sites, three months of history; English measurement units.
- No external email; use loopback email capture only.
- Reset only verified local test data/resources; retain secrets/connection configuration and source files.

### Task 1: Reconcile financial proposal

**Files:** docs/financial-proposal/manifest.json and files/; active apps/api/src/modules/billing, documents, payments, settings; apps/worker/src/jobs; new reconciliation report.
- [ ] Compare each proposed file against active source and migration history. Categorize reusable logic, obsolete interfaces and missing readiness verifier.
- [ ] Record exact API and schema requirements for contract association, immutable artifacts, idempotent numbering, payment approval and email capture.
- [ ] Resolve selected local fixture policies from the options document before implementing calculations and issuance.
- [ ] Add integration tests that first fail for real blocked/missing pipeline, not tests asserting a permissive flag.

### Task 2: Real financial pipeline

**Files:** active billing/document/payment services and migrations identified by reconciliation; financial readiness evidence verifier; scoped API contracts; worker jobs.
- [ ] Persist contract_id on each new cycle with a verified matching contract. Do not assign ambiguous historical cycles to a contract version automatically.
- [ ] Use decimal calculations according to selected fixture policy; save issuer/customer/logo/language/payment snapshots and exact issued PDF bytes.
- [ ] Allocate numbering transactionally and reuse prior results on repeated issue/approve requests.
- [ ] Preserve missing-boundary/config blocks and separate correction approver policy.
- [ ] Deliver only to local mail capture in test environment; verify downloadable PDF equals attachment bytes.
- [ ] Run PostgreSQL tests for approval, isolation, idempotency and immutable issued history.

### Task 3: Guarded reset and prerequisite seed

**Files:** new scripts/local-financial-review guard/reset/seed/fixture files and tests; local compose and README.
- [ ] Add failing tests rejecting non-loopback URLs, wrong ports/databases/project labels and missing ownership marker for nonempty data.
- [ ] Inspect local Docker DB/storage resources; identify old solar_dashboard_review synthetic dataset and ownership before reset. No unrelated volumes or databases may be removed.
- [ ] Prepare new isolated solar_financial_flow_review stack with loopback bindings and email capture; stop only owned obsolete review application processes before resetting old test resources.
- [ ] Seed company reference, synthetic bank/signers/contact data, Admin/Owner/Accountant/Operator/organization-user identities and two organizations/three sites.
- [ ] Seed real canonical meter/logger samples across July–September 2026, including independent production versus building/grid channels only where mappings support them; avoid inferring direction.
- [ ] Leave one site contract-free for create flow; provide complete boundary data on another and a missing boundary on the third.
- [ ] Generate unpaid/pending/rejected/paid scenarios by running actual workflows after policy selection. No direct insertion masquerading as issuance verification.

### Task 4: End-to-end verification

- [ ] Create a contract via staff API/UI, inspect org-user read-only view, execute October 1 01:00 Bangkok job in local simulated clock.
- [ ] Verify invoice persisted contract linkage and document grouping in the portal, PDF download/captured email match.
- [ ] Submit synthetic slip, reject with reason, resubmit and approve as Owner/Accountant; verify persisted receipt/PDF/captured email.
- [ ] Replay job/approval; assert unchanged numbers/artifact counts and no duplicated email outside retry policy.
- [ ] Test missing boundary, second organization denial, several transfers exact settlement, under/overpayment and unauthorized own-profile changes.
- [ ] Record commands, IDs, screenshots and hashes in evidence; provide repeatable run/reset instructions.

## Current execution boundary

User selected the recommended synthetic 7%/half-up test calculation, combined receipt/test-tax document and normal-flow scope. Local calculation/issuance implementation and real scenario generation are now authorized. Production accounting policy and adjustment-document issuance remain unapproved. Local runtime inspection found no running Docker containers at preparation time, but the old review database/storage volumes exist and must be verified before resetting.
