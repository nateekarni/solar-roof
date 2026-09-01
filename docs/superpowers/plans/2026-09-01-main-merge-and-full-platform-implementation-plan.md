# Main Branch Merge and Full Platform Implementation Plan

**Goal:** Merge the approved `feat/solar-platform` work into `main`, standardize the entire Web UI on shadcn/ui, finish all remaining Phase 1 tasks, and provide separate production/local Docker Compose workflows.

**Branch strategy:** The current repository uses `master` as the existing default branch. Create/rename the default branch to `main` only after checking the GitHub default-branch setting. Merge the development branch with `--no-ff`, preserve all commits, then continue development on `main`. Keep a safety tag before the merge.

**Design-system decision:** Use shadcn/ui source-owned components with Radix primitives and Lucide icons. Use Tailwind CSS v4 and semantic CSS variables. Do not copy private-tutor application code; reuse only the design principles and token structure.

**Private-tutor audit inputs:** `E:/private-tutor/components.json`, `E:/private-tutor/src/app/globals.css`, `E:/private-tutor/src/styles/shadcn-big-calendar.css`, and `.wayfinder/ticket-1-css-audit.md`.

## Global rules

- `main` must pass lint, typecheck, unit tests, E2E, build, and Compose smoke tests.
- All user-facing strings come from the Thai-first i18n dictionary.
- All API input, query parameters and uploads are validated; server-side role/school scope remains authoritative.
- Financial documents are immutable after finalize; cancellation and adjustment create audit records.
- Billing uses `Billing Meter` cumulative `Total Energy`, cutoff 23:59:59.999 Asia/Bangkok, and invalid quality cannot finalize.
- Production Compose runs web, api, worker, postgres/timescaledb, redis, mqtt and object storage dependencies; local Compose runs dependencies only because Web/API run with `pnpm dev`.

## Task 0: Merge preparation

1. Confirm clean worktree and create tag `pre-main-merge` on `ef75675`.
2. Push the latest `feat/solar-platform` commit if explicitly approved.
3. Create local `main` from current default branch, merge `feat/solar-platform` with `--no-ff`, and verify all historical commits are present.
4. Push `main` only after the merge commit is inspected.
5. Work only on `main` afterward.

## Task 1: Install and configure Web dependencies

Modify `apps/web/package.json`, `apps/web/app/globals.css`, `apps/web/tsconfig.json`, `apps/web/next.config.mjs`; create `apps/web/components.json`, `apps/web/lib/utils.ts`, and `apps/web/components/ui/`.

Install Tailwind, `tw-animate-css`, `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`, `next-themes`, `sonner`, TanStack Query/Table, Zod, React Hook Form, hookform resolvers, date-fns, `@date-fns/tz`, nuqs, Recharts, MapLibre and React Map GL.

Run shadcn init with Radix base and add button, card, table, badge, input, label, form, select, dialog, alert-dialog, dropdown-menu, sheet, tabs, tooltip, popover, calendar, command, skeleton, separator, avatar, checkbox and switch. Use the official existing-project/monorepo flow via `pnpm dlx shadcn@latest init -c apps/web -t next` and add only components used by the application.

## Task 2: Migrate CSS and UI to semantic tokens

Replace the current raw CSS palette with semantic shadcn variables. Follow private-tutor’s pattern of importing Tailwind and `shadcn/tailwind.css`, add dark-mode tokens, use `var(--background)`, `var(--foreground)`, `var(--card)`, `var(--border)`, `var(--primary)`, `var(--muted-foreground)` and chart tokens. Keep brand navy/solar green/amber/danger values as theme tokens, not scattered hex values.

Refactor sidebar, topbar, dashboard cards, charts, tables, buttons and settings forms to use shadcn components and Lucide icons. Remove hardcoded colors and fix mobile dark-mode backgrounds. Add accessibility tests for keyboard focus, labels, contrast, table headings, status text and responsive navigation.

## Task 3: Complete identity and scope enforcement

Create persistent Prisma-backed user, invitation, school, admin assignment and session repositories. Replace in-memory auth/asset/billing/document stores. Use Argon2id, JWT/JWK with jose, MFA owner/admin, refresh-token rotation, session revocation, invitation expiry and global validation. Add controllers guarded by role and school scope. Add cross-school negative tests for all three roles.

## Task 4: Complete asset, gateway and telemetry domains

Add Prisma/Timescale persistence for Gateway, Device, RegisterMappingVersion, BillingMeter, TelemetryRaw and TelemetryAggregate. Add register mapping fields: address/register, data type, signed/unsigned, byte order, scale, unit, polling interval, quality rule and semantic field. Keep simulator/file import and connector registry; add MQTT ingestion, deduplication, raw immutability, correction records, aggregate rebuild and connector health.

## Task 5: Complete billing, contract, invoice and receipt workflow

Persist versioned contracts/rates with non-overlap constraints and one active contract per Site. Implement monthly cutoff reader, opening/closing snapshots, multi-meter sum, quality states, preview, owner/admin approval, rejection, finalize and cancel. Add immutable invoice numbering by document type/year, payment state changes restricted to owner/admin, school_user evidence upload, transactional idempotent receipt creation and adjustment records after lock.

## Task 6: Complete files, notifications and reports

Use private S3-compatible storage with server-side encryption, MIME/content/size validation, expiring signed URLs and access audit. Generate Thai Invoice, Receipt and Billing Statement PDFs with embedded Thai font and snapshot hash. Add CSV/XLSX/PDF reports with server-side scope filtering. Add in-app/email notification adapters for alarm, document and payment events; leave LINE/SMS/push behind interfaces.

## Task 7: Finish Website domains and API integration

Create authenticated query/mutation providers, OpenAPI-generated client, loading/empty/partial/estimated/invalid/offline/error/permission-denied states, dashboard map/charts, gateway/device screens, telemetry quality filters, billing review/finalize screens, document download/print/verification, audit and notification center. No page may use hardcoded API fixtures in production mode.

## Task 8: Production readiness and observability

Add OpenAPI source contract, structured JSON logging, correlation IDs, Prometheus metrics, OpenTelemetry tracing, health checks, rate limits, security headers, dependency/license audit, backup/restore runbooks, billing reconciliation runbook and incident response. Add Dockerfiles using non-root users, locked dependencies, healthchecks and environment-injected secrets.

## Task 9: Docker Compose workflows

Create `infra/docker/docker-compose.prod.yml` with web, api, worker, postgres/timescaledb, redis, mqtt and minio services, private network, healthchecks, named volumes, non-root application containers, restart policy and no secrets committed.

Create `infra/docker/docker-compose.local.yml` with only postgres/timescaledb, redis, mqtt and minio. Web/API are intentionally absent; developers run `pnpm dev` from the repository. Add `.env.example`, `infra/docker/.env.local.example`, startup/readiness checks and README commands.

Commands:

- Local dependencies: `docker compose -f infra/docker/docker-compose.local.yml up -d`
- Local apps: `pnpm dev`
- Production-like stack: `docker compose -f infra/docker/docker-compose.prod.yml --env-file .env.production up -d --build`
- Smoke check: health endpoints, database readiness, Redis readiness, MQTT connection, object-storage bucket and Web page.

## Task 10: Flutter Phase 2

After the OpenAPI contract is stable, create `apps/mobile` with Riverpod, go_router, Dio/Retrofit, Freezed/json_serializable, secure storage, connectivity, file picker, Thai i18n and integration tests. Target school_user scope and the mobile reference screens.

## Verification gates

Each task must run its focused tests and then the full suite. Final release gate:

`pnpm lint`
`pnpm test`
`pnpm build`
`pnpm test:e2e`
`docker compose -f infra/docker/docker-compose.local.yml config`
`docker compose -f infra/docker/docker-compose.prod.yml config`

Commit every task separately and push after each approved checkpoint. Do not merge to production deployment until staging smoke and backup-restore verification pass.
