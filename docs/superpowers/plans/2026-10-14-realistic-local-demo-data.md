# Realistic Local Demo Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the retained local environment immediately usable with stable login accounts and realistic, clearly synthetic Thai customer, site, gateway, finance, document, and notification data.

**Architecture:** Keep the isolated `solar_financial_flow_review` database and its existing ten-site history. Centralize demo identity metadata in a pure module, add an idempotent local-only reconciliation script guarded by the existing loopback/database/fixture checks, and launch the full app against the reconciled dataset. Existing domain-readable site and gateway codes remain stable while user UUIDs and financial history retain referential integrity.

**Tech Stack:** Node.js ESM, PostgreSQL, PowerShell, Docker Compose, Node test runner, pnpm/NestJS/Next.js.

**Spec:** User-approved design in the 2026-10-14 conversation.

## Global Constraints

- Operate only on `postgresql://review:local-financial-only@127.0.0.1:15449/solar_financial_flow_review`.
- Require the existing local fixture audit marker before changing identities.
- Use only fictional names, reserved `.test` email addresses, and synthetic IDs.
- Preserve primary keys and all billing, document, payment, audit, and telemetry relationships.
- Keep automatic financial scheduling disabled in local testing.
- Keep all SMTP delivery inside loopback Mailpit.

---

### Task 1: Deterministic demo account catalog

**Files:**
- Create: `scripts/local-system/demo-accounts.mjs`
- Modify: `scripts/local-system/fixture.test.mjs`
- Modify: `scripts/local-system/replace-users.mjs`

**Interfaces:**
- Consumes: the ten entries exported by `scripts/local-system/telemetry-fixture.mjs`.
- Produces: `buildDemoAccounts(existingUsers, sites)` with stable role, email, display name, and customer/site assignments.

- [x] Write a failing fixture test that requires realistic Thai display names, reserved `.test` emails, all five roles, ten customer accounts, and stable site assignments.
- [x] Run `node --test scripts/local-system/fixture.test.mjs` and confirm the new assertion fails because the catalog does not exist.
- [x] Implement the pure account catalog and use it in `replace-users.mjs`.
- [x] Re-run the fixture test and confirm it passes.

### Task 2: Idempotent local identity reconciliation

**Files:**
- Create: `scripts/local-system/reconcile-demo-identities.mjs`
- Create: `scripts/local-system/reconcile-demo-identities.test.mjs`
- Modify: `scripts/local-system/start.ps1`

**Interfaces:**
- Consumes: the catalog from Task 1, the local accounts manifest, and the existing fixture marker.
- Produces: updated active local users and a refreshed ignored `output/local-system/accounts.json` without replacing user primary keys.

- [x] Write a failing test for the reconciliation plan that rejects duplicate emails and maps every fixture account exactly once.
- [x] Run the test and confirm it fails because reconciliation planning is absent.
- [x] Implement the planner and guarded database reconciliation.
- [x] Add reconciliation to the local launcher after history preparation.
- [x] Re-run the focused tests and confirm they pass.

### Task 3: Documentation and live verification

**Files:**
- Modify: `scripts/local-system/README.md`
- Modify: `scripts/local-system/browser-smoke.mjs`
- Modify: `scripts/local-system/check-payment.mjs`

**Interfaces:**
- Consumes: the reconciled account manifest and live local services.
- Produces: current credentials/documentation plus API and browser verification artifacts under ignored `output/local-system/`.

- [x] Update hard-coded smoke/payment account lookups to select accounts from the manifest by role and site ordering.
- [x] Document the realistic accounts, IDs, data scenarios, URLs, and one-command startup.
- [x] Start Docker and local services from `main`.
- [x] Run login checks for every role and verify Dashboard, sites, gateways, billing, documents, alerts, and notification feed.
- [x] Run browser smoke checks and leave the login page open for the user.

### Observed integration fixes

- [x] Add an indexed latest-sample query after the realistic 1.6-million-row fixture exposed a Gateway timeout.
- [x] Restore missing local Mailpit copies from immutable, hash-verified PDF artifacts without changing financial delivery state.
- [x] Move the missing-boundary rollback check to a non-overlapping October period.
