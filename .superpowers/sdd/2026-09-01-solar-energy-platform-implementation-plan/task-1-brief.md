# Task 1: สร้าง monorepo และ local infrastructure

อ่าน implementation plan ที่อนุมัติแล้วเป็นบริบทอ้างอิง แต่ไฟล์นี้คือ requirements หลักของ Task 1 และค่าต่าง ๆ ต้องใช้ตามนี้

## Files

- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.env.example`
- Create: `apps/web/package.json`, `apps/api/package.json`, `apps/worker/package.json`
- Create: `packages/domain/package.json`, `packages/api-contracts/package.json`, `packages/connectors/package.json`, `packages/i18n/package.json`, `packages/ui/package.json`
- Create: `infra/docker/compose.yml`, `infra/docker/init-timescaledb.sql`
- Create: `README.md`, `docs/runbooks/local-development.md`

## Requirements

- Provide scripts: `pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm db:migrate`.
- Pin Node.js LTS, pnpm and TypeScript versions in `package.json` and `.nvmrc`.
- Local Compose must provide PostgreSQL/TimescaleDB, Redis, MQTT broker and S3-compatible object storage, with healthchecks.
- Add `packages/domain/src/config/env.ts` with schema validation that fails startup when database, JWT, MQTT or storage secrets are absent.
- Web, API and Worker must expose dependency health without exposing secrets.
- Run `pnpm install`, `pnpm lint`, `pnpm test`, and `docker compose -f infra/docker/compose.yml config`.
- Use TypeScript, Next.js, NestJS and pnpm workspace conventions. Keep dependency versions current and mutually compatible.
- Do not implement domain features in this task; establish only the buildable foundation.

## Interfaces

- Later tasks import packages by workspace names, using `src/` entrypoints.
- Environment schema exports `envSchema` and `loadEnv(input: Record<string, unknown>): AppEnv`.
- Each app exposes a `/health` route or equivalent health check.

## Report contract

Write the full report to `.superpowers/sdd/2026-09-01-solar-energy-platform-implementation-plan/task-1-report.md`. Include changed files, commands and exact test/build output, remaining concerns, and commit SHA. Return only status, commit, one-line test summary and concerns to the controller.
