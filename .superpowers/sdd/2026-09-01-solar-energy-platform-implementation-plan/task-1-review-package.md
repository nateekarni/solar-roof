BASE: 5f7e129
HEAD: 6e80fa9
COMMITS:
6e80fa9 chore: scaffold solar platform task 1
STAT:
 .env.example                                       |   17 +
 .gitignore                                         |   27 +-
 .nvmrc                                             |    2 +
 .../progress.md                                    |   32 +
 .../task-1-brief.md                                |   32 +
 README.md                                          |   63 +
 apps/api/package.json                              |   25 +
 apps/api/src/app.module.ts                         |    9 +
 apps/api/src/health/health.controller.ts           |   14 +
 apps/api/src/health/health.module.ts               |   26 +
 apps/api/src/health/health.service.ts              |   16 +
 apps/api/src/main.ts                               |   19 +
 apps/api/src/scripts/db-migrate.ts                 |    8 +
 apps/api/tsconfig.json                             |   16 +
 apps/web/app/health/route.ts                       |   15 +
 apps/web/app/layout.tsx                            |   15 +
 apps/web/app/page.tsx                              |   11 +
 apps/web/next-env.d.ts                             |    7 +
 apps/web/next.config.mjs                           |   10 +
 apps/web/package.json                              |   25 +
 apps/web/tsconfig.json                             |   15 +
 apps/worker/package.json                           |   24 +
 apps/worker/src/app.module.ts                      |    9 +
 apps/worker/src/health/health.controller.ts        |   14 +
 apps/worker/src/health/health.module.ts            |   26 +
 apps/worker/src/health/health.service.ts           |   17 +
 apps/worker/src/main.ts                            |   19 +
 apps/worker/tsconfig.json                          |   16 +
 docs/runbooks/local-development.md                 |   68 +
 infra/docker/compose.yml                           |   65 +
 infra/docker/init-timescaledb.sql                  |    3 +
 package.json                                       |   24 +
 packages/api-contracts/package.json                |   23 +
 packages/api-contracts/src/index.ts                |   12 +
 packages/api-contracts/tsconfig.json               |   12 +
 packages/connectors/package.json                   |   23 +
 packages/connectors/src/index.ts                   |   27 +
 packages/connectors/tsconfig.json                  |   12 +
 packages/domain/package.json                       |   25 +
 packages/domain/src/config/env.ts                  |   38 +
 packages/domain/src/health/dependency-health.ts    |   42 +
 packages/domain/src/index.ts                       |    5 +
 packages/domain/test/env.test.ts                   |   48 +
 packages/domain/tsconfig.json                      |   14 +
 packages/i18n/package.json                         |   23 +
 packages/i18n/src/index.ts                         |    3 +
 packages/i18n/src/locale.ts                        |   23 +
 packages/i18n/src/th.ts                            |   14 +
 packages/i18n/tsconfig.json                        |   12 +
 packages/ui/package.json                           |   23 +
 packages/ui/src/index.ts                           |   12 +
 packages/ui/tsconfig.json                          |   12 +
 pnpm-lock.yaml                                     | 2203 ++++++++++++++++++++
 pnpm-workspace.yaml                                |    5 +
 tsconfig.base.json                                 |   18 +
 turbo.json                                         |   24 +
 56 files changed, 3326 insertions(+), 16 deletions(-)
DIFF:
diff --git a/.env.example b/.env.example
new file mode 100644
index 0000000..daf205c
--- /dev/null
+++ b/.env.example
@@ -0,0 +1,17 @@
+NODE_ENV=development
+DATABASE_URL=postgresql://solar:solar@localhost:5432/solar_platform
+REDIS_URL=redis://localhost:6379
+MQTT_URL=mqtt://localhost:1883
+MQTT_USERNAME=solar
+MQTT_PASSWORD=solar
+STORAGE_ENDPOINT=http://localhost:9000
+STORAGE_REGION=ap-southeast-1
+STORAGE_BUCKET=solar-platform
+STORAGE_ACCESS_KEY=solar
+STORAGE_SECRET_KEY=change-me-storage-secret
+JWT_ACCESS_SECRET=change-me-access-secret-change-me-access-secret
+JWT_REFRESH_SECRET=change-me-refresh-secret-change-me-refresh-secret
+WEB_PORT=3000
+API_PORT=3001
+WORKER_PORT=3002
+
diff --git a/.gitignore b/.gitignore
index 88d6c8a..2d47603 100644
--- a/.gitignore
+++ b/.gitignore
@@ -1,17 +1,12 @@
-node_modules/
-.pnpm-store/
-.turbo/
-dist/
-build/
-.next/
-coverage/
+node_modules
+.next
+dist
+.turbo
+coverage
+.DS_Store
 .env
-.env.*
-!.env.example
-.superpowers/sdd/
-.worktrees/
-worktrees/
-*.log
-apps/mobile/.dart_tool/
-apps/mobile/build/
-apps/mobile/.packages
+.env.local
+.env.*.local
+pnpm-debug.log*
+*.tsbuildinfo
+
diff --git a/.nvmrc b/.nvmrc
new file mode 100644
index 0000000..1a3bf52
--- /dev/null
+++ b/.nvmrc
@@ -0,0 +1,2 @@
+24.20.0
+
diff --git a/.superpowers/sdd/2026-09-01-solar-energy-platform-implementation-plan/progress.md b/.superpowers/sdd/2026-09-01-solar-energy-platform-implementation-plan/progress.md
new file mode 100644
index 0000000..70fe65a
--- /dev/null
+++ b/.superpowers/sdd/2026-09-01-solar-energy-platform-implementation-plan/progress.md
@@ -0,0 +1,32 @@
+# SDD ledger — plan: docs/superpowers/plans/2026-09-01-solar-energy-platform-implementation-plan.md
+
+## Pre-flight plan scan
+
+| Scope | Relationship checked | Result / ruling |
+|---|---|---|
+| Task 1 ↔ Task 2 | workspace manifests → Prisma/migrations | Compatible; Task 1 establishes packages, Task 2 adds schema |
+| Task 1 ↔ Task 12 | env/scripts → containers/observability | Compatible; Task 12 consumes Task 1 scripts |
+| Task 2 ↔ Task 3 | User/School/assignment entities → auth guards | Compatible; Task 2 owns persistence, Task 3 owns policy |
+| Task 2 ↔ Task 4 | School/Site/Gateway/Device entities → asset services | Compatible |
+| Task 2 ↔ Task 6 | mapping/raw telemetry entities → ingestion | Compatible |
+| Task 2 ↔ Task 8 | contract/billing entities → billing services | Compatible |
+| Task 2 ↔ Task 9 | document/payment entities → document services | Compatible |
+| Task 3 ↔ Tasks 4,6,8,9,10,11 | scope guards → protected APIs/UI | Compatible; all consumers use server-side policy |
+| Task 4 ↔ Task 5 | Gateway/Device records → connector registry | Compatible |
+| Task 5 ↔ Task 6 | connector read results → ingestion batch | Compatible; adapter interface is stable |
+| Task 6 ↔ Task 7 | raw telemetry → aggregation/alarms | Compatible |
+| Task 7 ↔ Task 8 | aggregate/quality → billing preview | Compatible |
+| Task 8 ↔ Task 9 | finalized invoice/payment → receipt/document jobs | Compatible |
+| Task 9 ↔ Task 10 | document/payment APIs → Web screens | Compatible |
+| Task 10 ↔ Task 11 | Web shell/shared UI → operational pages | Compatible |
+| Task 12 ↔ Task 13 | OpenAPI → Flutter client | Compatible |
+| Every task | own files, interfaces and tests | Internally consistent; no contradictory requirements found |
+
+## Rulings
+
+- Ruling: initialize this greenfield workspace as a Git repository and use `.worktrees/solar-platform` — required by the approved SDD workflow; cost if wrong is repository setup churn, but it preserves isolation.
+- Ruling: use PostgreSQL + TimescaleDB and Prisma as the relational access layer — matches the approved spec and keeps telemetry/billing persistence coherent; cost if wrong is migration effort if scale later requires a separate time-series store.
+
+## Progress
+
+- Task 1: in progress
diff --git a/.superpowers/sdd/2026-09-01-solar-energy-platform-implementation-plan/task-1-brief.md b/.superpowers/sdd/2026-09-01-solar-energy-platform-implementation-plan/task-1-brief.md
new file mode 100644
index 0000000..4dda8c1
--- /dev/null
+++ b/.superpowers/sdd/2026-09-01-solar-energy-platform-implementation-plan/task-1-brief.md
@@ -0,0 +1,32 @@
+# Task 1: สร้าง monorepo และ local infrastructure
+
+อ่าน implementation plan ที่อนุมัติแล้วเป็นบริบทอ้างอิง แต่ไฟล์นี้คือ requirements หลักของ Task 1 และค่าต่าง ๆ ต้องใช้ตามนี้
+
+## Files
+
+- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.env.example`
+- Create: `apps/web/package.json`, `apps/api/package.json`, `apps/worker/package.json`
+- Create: `packages/domain/package.json`, `packages/api-contracts/package.json`, `packages/connectors/package.json`, `packages/i18n/package.json`, `packages/ui/package.json`
+- Create: `infra/docker/compose.yml`, `infra/docker/init-timescaledb.sql`
+- Create: `README.md`, `docs/runbooks/local-development.md`
+
+## Requirements
+
+- Provide scripts: `pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm db:migrate`.
+- Pin Node.js LTS, pnpm and TypeScript versions in `package.json` and `.nvmrc`.
+- Local Compose must provide PostgreSQL/TimescaleDB, Redis, MQTT broker and S3-compatible object storage, with healthchecks.
+- Add `packages/domain/src/config/env.ts` with schema validation that fails startup when database, JWT, MQTT or storage secrets are absent.
+- Web, API and Worker must expose dependency health without exposing secrets.
+- Run `pnpm install`, `pnpm lint`, `pnpm test`, and `docker compose -f infra/docker/compose.yml config`.
+- Use TypeScript, Next.js, NestJS and pnpm workspace conventions. Keep dependency versions current and mutually compatible.
+- Do not implement domain features in this task; establish only the buildable foundation.
+
+## Interfaces
+
+- Later tasks import packages by workspace names, using `src/` entrypoints.
+- Environment schema exports `envSchema` and `loadEnv(input: Record<string, unknown>): AppEnv`.
+- Each app exposes a `/health` route or equivalent health check.
+
+## Report contract
+
+Write the full report to `.superpowers/sdd/2026-09-01-solar-energy-platform-implementation-plan/task-1-report.md`. Include changed files, commands and exact test/build output, remaining concerns, and commit SHA. Return only status, commit, one-line test summary and concerns to the controller.
diff --git a/README.md b/README.md
new file mode 100644
index 0000000..d66284a
--- /dev/null
+++ b/README.md
@@ -0,0 +1,63 @@
+# Solar Energy Management Platform
+
+Task 1 sets up the buildable monorepo foundation for the Solar Energy Management Platform.
+
+## What is included
+
+- `apps/web`: Next.js web app
+- `apps/api`: NestJS HTTP API
+- `apps/worker`: NestJS worker process
+- `packages/domain`: shared domain configuration and health helpers
+- `packages/api-contracts`: shared API DTO helpers
+- `packages/connectors`: connector interfaces
+- `packages/i18n`: Thai locale helpers
+- `packages/ui`: shared UI token placeholders
+- `infra/docker`: local PostgreSQL/TimescaleDB, Redis, MQTT and S3-compatible storage
+
+## Prerequisites
+
+- Node.js 24.20.0
+- pnpm 11.24.0
+- Docker Compose
+
+Use `nvm use` after placing `.nvmrc` in your shell workflow if you manage Node with nvm.
+
+## Install
+
+```bash
+pnpm install
+```
+
+## Development
+
+```bash
+pnpm dev
+```
+
+This starts the workspace dev processes through Turborepo.
+
+## Checks
+
+```bash
+pnpm lint
+pnpm test
+pnpm build
+pnpm db:migrate
+docker compose -f infra/docker/compose.yml config
+```
+
+## Local services
+
+- PostgreSQL/TimescaleDB: `localhost:5432`
+- Redis: `localhost:6379`
+- MQTT broker: `localhost:1883`
+- MQTT dashboard: `localhost:18083`
+- Object storage: `localhost:9000`
+- Object storage console: `localhost:9001`
+
+## Health endpoints
+
+- Web: `http://localhost:3000/health`
+- API: `http://localhost:3001/health`
+- Worker: `http://localhost:3002/health`
+
diff --git a/apps/api/package.json b/apps/api/package.json
new file mode 100644
index 0000000..84853dd
--- /dev/null
+++ b/apps/api/package.json
@@ -0,0 +1,25 @@
+{
+  "name": "@solar/api",
+  "private": true,
+  "type": "module",
+  "scripts": {
+    "dev": "tsx watch src/main.ts",
+    "build": "tsc -p tsconfig.json",
+    "start": "tsx src/main.ts",
+    "lint": "tsc --noEmit -p tsconfig.json",
+    "test": "tsc --noEmit -p tsconfig.json",
+    "db:migrate": "tsx src/scripts/db-migrate.ts"
+  },
+  "dependencies": {
+    "@nestjs/common": "12.0.1",
+    "@nestjs/core": "12.0.1",
+    "@nestjs/platform-express": "12.0.1",
+    "@solar/domain": "workspace:*",
+    "express": "5.2.1",
+    "reflect-metadata": "0.2.2",
+    "rxjs": "7.8.2"
+  },
+  "devDependencies": {
+    "@types/express": "5.0.6"
+  }
+}
\ No newline at end of file
diff --git a/apps/api/src/app.module.ts b/apps/api/src/app.module.ts
new file mode 100644
index 0000000..0f21176
--- /dev/null
+++ b/apps/api/src/app.module.ts
@@ -0,0 +1,9 @@
+import { Module } from "@nestjs/common";
+
+import { HealthModule } from "./health/health.module.js";
+
+@Module({
+  imports: [HealthModule]
+})
+export class AppModule {}
+
diff --git a/apps/api/src/health/health.controller.ts b/apps/api/src/health/health.controller.ts
new file mode 100644
index 0000000..5ccd118
--- /dev/null
+++ b/apps/api/src/health/health.controller.ts
@@ -0,0 +1,14 @@
+import { Controller, Get } from "@nestjs/common";
+
+import { HealthService } from "./health.service.js";
+
+@Controller("health")
+export class HealthController {
+  constructor(private readonly healthService: HealthService) {}
+
+  @Get()
+  getHealth() {
+    return this.healthService.getSnapshot();
+  }
+}
+
diff --git a/apps/api/src/health/health.module.ts b/apps/api/src/health/health.module.ts
new file mode 100644
index 0000000..18dcea8
--- /dev/null
+++ b/apps/api/src/health/health.module.ts
@@ -0,0 +1,26 @@
+import { Module } from "@nestjs/common";
+
+import { loadEnv } from "@solar/domain";
+
+import { HealthController } from "./health.controller.js";
+import { HealthService } from "./health.service.js";
+
+const envProvider = {
+  provide: "APP_ENV",
+  useFactory: () => loadEnv(process.env)
+};
+
+@Module({
+  controllers: [HealthController],
+  providers: [
+    envProvider,
+    {
+      provide: HealthService,
+      useFactory: (env: ReturnType<typeof loadEnv>) => new HealthService(env),
+      inject: ["APP_ENV"]
+    }
+  ],
+  exports: [HealthService]
+})
+export class HealthModule {}
+
diff --git a/apps/api/src/health/health.service.ts b/apps/api/src/health/health.service.ts
new file mode 100644
index 0000000..fa87bc1
--- /dev/null
+++ b/apps/api/src/health/health.service.ts
@@ -0,0 +1,16 @@
+import { Injectable } from "@nestjs/common";
+
+import { buildDependencyHealth, type AppEnv } from "@solar/domain";
+
+@Injectable()
+export class HealthService {
+  constructor(private readonly env: AppEnv) {}
+
+  getSnapshot() {
+    return {
+      ...buildDependencyHealth("api", this.env),
+      checkedAt: new Date().toISOString()
+    };
+  }
+}
+
diff --git a/apps/api/src/main.ts b/apps/api/src/main.ts
new file mode 100644
index 0000000..422bd3c
--- /dev/null
+++ b/apps/api/src/main.ts
@@ -0,0 +1,19 @@
+import "reflect-metadata";
+
+import { NestFactory } from "@nestjs/core";
+
+import { AppModule } from "./app.module.js";
+
+async function bootstrap() {
+  const app = await NestFactory.create(AppModule, { logger: false });
+  const port = Number(process.env.API_PORT ?? 3001);
+
+  await app.listen(port, "0.0.0.0");
+  process.stdout.write(`API listening on http://0.0.0.0:${port}\n`);
+}
+
+bootstrap().catch((error: unknown) => {
+  console.error(error);
+  process.exitCode = 1;
+});
+
diff --git a/apps/api/src/scripts/db-migrate.ts b/apps/api/src/scripts/db-migrate.ts
new file mode 100644
index 0000000..2974e1b
--- /dev/null
+++ b/apps/api/src/scripts/db-migrate.ts
@@ -0,0 +1,8 @@
+import { loadEnv } from "@solar/domain";
+
+const env = loadEnv(process.env);
+
+console.log("Database migration bootstrap is ready.");
+console.log(`Target database is configured for ${env.NODE_ENV}.`);
+console.log("No application migrations exist yet for Task 1.");
+
diff --git a/apps/api/tsconfig.json b/apps/api/tsconfig.json
new file mode 100644
index 0000000..18ba8e0
--- /dev/null
+++ b/apps/api/tsconfig.json
@@ -0,0 +1,16 @@
+{
+  "extends": "../../tsconfig.base.json",
+  "compilerOptions": {
+    "module": "NodeNext",
+    "moduleResolution": "NodeNext",
+    "outDir": "dist",
+    "rootDir": "src",
+    "types": ["node"],
+    "experimentalDecorators": true,
+    "emitDecoratorMetadata": true,
+    "declaration": true,
+    "declarationMap": true
+  },
+  "include": ["src/**/*.ts"]
+}
+
diff --git a/apps/web/app/health/route.ts b/apps/web/app/health/route.ts
new file mode 100644
index 0000000..4337047
--- /dev/null
+++ b/apps/web/app/health/route.ts
@@ -0,0 +1,15 @@
+import { NextResponse } from "next/server";
+
+import { buildDependencyHealth, loadEnv } from "@solar/domain";
+
+export const runtime = "nodejs";
+
+export async function GET() {
+  const env = loadEnv(process.env);
+
+  return NextResponse.json({
+    ...buildDependencyHealth("web", env),
+    checkedAt: new Date().toISOString()
+  });
+}
+
diff --git a/apps/web/app/layout.tsx b/apps/web/app/layout.tsx
new file mode 100644
index 0000000..1dfa96f
--- /dev/null
+++ b/apps/web/app/layout.tsx
@@ -0,0 +1,15 @@
+import type { ReactNode } from "react";
+
+export const metadata = {
+  title: "Solar Energy Management Platform",
+  description: "Monorepo foundation for the solar energy management platform"
+};
+
+export default function RootLayout({ children }: { children: ReactNode }) {
+  return (
+    <html lang="th">
+      <body>{children}</body>
+    </html>
+  );
+}
+
diff --git a/apps/web/app/page.tsx b/apps/web/app/page.tsx
new file mode 100644
index 0000000..61ed8f4
--- /dev/null
+++ b/apps/web/app/page.tsx
@@ -0,0 +1,11 @@
+import { t } from "@solar/i18n";
+
+export default function Page() {
+  return (
+    <main>
+      <h1>{t("app.title")}</h1>
+      <p>Foundation ready for dashboard, billing, telemetry and document workflows.</p>
+    </main>
+  );
+}
+
diff --git a/apps/web/next-env.d.ts b/apps/web/next-env.d.ts
new file mode 100644
index 0000000..3229e7d
--- /dev/null
+++ b/apps/web/next-env.d.ts
@@ -0,0 +1,7 @@
+/// <reference types="next" />
+/// <reference types="next/image-types/global" />
+/// <reference types="react" />
+/// <reference types="react-dom" />
+
+// NOTE: This file is maintained by Next.js and should remain checked in.
+
diff --git a/apps/web/next.config.mjs b/apps/web/next.config.mjs
new file mode 100644
index 0000000..e0d8d25
--- /dev/null
+++ b/apps/web/next.config.mjs
@@ -0,0 +1,10 @@
+/** @type {import('next').NextConfig} */
+const nextConfig = {
+  experimental: {
+    externalDir: true
+  },
+  transpilePackages: ["@solar/domain", "@solar/i18n", "@solar/ui"]
+};
+
+export default nextConfig;
+
diff --git a/apps/web/package.json b/apps/web/package.json
new file mode 100644
index 0000000..6dec727
--- /dev/null
+++ b/apps/web/package.json
@@ -0,0 +1,25 @@
+{
+  "name": "@solar/web",
+  "private": true,
+  "type": "module",
+  "scripts": {
+    "dev": "next dev -p 3000",
+    "build": "next build",
+    "start": "next start -p 3000",
+    "lint": "tsc --noEmit -p tsconfig.json",
+    "test": "tsc --noEmit -p tsconfig.json"
+  },
+  "dependencies": {
+    "@solar/domain": "workspace:*",
+    "@solar/i18n": "workspace:*",
+    "@solar/ui": "workspace:*",
+    "next": "16.3.3",
+    "react": "19.2.8",
+    "react-dom": "19.2.8"
+  },
+  "devDependencies": {
+    "@types/react": "19.2.18",
+    "@types/react-dom": "19.2.5"
+  }
+}
+
diff --git a/apps/web/tsconfig.json b/apps/web/tsconfig.json
new file mode 100644
index 0000000..067c378
--- /dev/null
+++ b/apps/web/tsconfig.json
@@ -0,0 +1,15 @@
+{
+  "extends": "../../tsconfig.base.json",
+  "compilerOptions": {
+    "module": "ESNext",
+    "moduleResolution": "Bundler",
+    "jsx": "preserve",
+    "lib": ["DOM", "DOM.Iterable", "ES2022"],
+    "allowJs": false,
+    "noEmit": true,
+    "types": ["node", "react", "react-dom"]
+  },
+  "include": ["app/**/*.ts", "app/**/*.tsx", "next-env.d.ts"],
+  "exclude": ["node_modules"]
+}
+
diff --git a/apps/worker/package.json b/apps/worker/package.json
new file mode 100644
index 0000000..73e01dd
--- /dev/null
+++ b/apps/worker/package.json
@@ -0,0 +1,24 @@
+{
+  "name": "@solar/worker",
+  "private": true,
+  "type": "module",
+  "scripts": {
+    "dev": "tsx watch src/main.ts",
+    "build": "tsc -p tsconfig.json",
+    "start": "tsx src/main.ts",
+    "lint": "tsc --noEmit -p tsconfig.json",
+    "test": "tsc --noEmit -p tsconfig.json"
+  },
+  "dependencies": {
+    "@nestjs/common": "12.0.1",
+    "@nestjs/core": "12.0.1",
+    "@nestjs/platform-express": "12.0.1",
+    "@solar/domain": "workspace:*",
+    "express": "5.2.1",
+    "reflect-metadata": "0.2.2",
+    "rxjs": "7.8.2"
+  },
+  "devDependencies": {
+    "@types/express": "5.0.6"
+  }
+}
\ No newline at end of file
diff --git a/apps/worker/src/app.module.ts b/apps/worker/src/app.module.ts
new file mode 100644
index 0000000..21a625c
--- /dev/null
+++ b/apps/worker/src/app.module.ts
@@ -0,0 +1,9 @@
+import { Module } from "@nestjs/common";
+
+import { WorkerHealthModule } from "./health/health.module.js";
+
+@Module({
+  imports: [WorkerHealthModule]
+})
+export class WorkerAppModule {}
+
diff --git a/apps/worker/src/health/health.controller.ts b/apps/worker/src/health/health.controller.ts
new file mode 100644
index 0000000..e9b4291
--- /dev/null
+++ b/apps/worker/src/health/health.controller.ts
@@ -0,0 +1,14 @@
+import { Controller, Get } from "@nestjs/common";
+
+import { WorkerHealthService } from "./health.service.js";
+
+@Controller("health")
+export class WorkerHealthController {
+  constructor(private readonly healthService: WorkerHealthService) {}
+
+  @Get()
+  getHealth() {
+    return this.healthService.getSnapshot();
+  }
+}
+
diff --git a/apps/worker/src/health/health.module.ts b/apps/worker/src/health/health.module.ts
new file mode 100644
index 0000000..e28d02d
--- /dev/null
+++ b/apps/worker/src/health/health.module.ts
@@ -0,0 +1,26 @@
+import { Module } from "@nestjs/common";
+
+import { loadEnv } from "@solar/domain";
+
+import { WorkerHealthController } from "./health.controller.js";
+import { WorkerHealthService } from "./health.service.js";
+
+const envProvider = {
+  provide: "APP_ENV",
+  useFactory: () => loadEnv(process.env)
+};
+
+@Module({
+  controllers: [WorkerHealthController],
+  providers: [
+    envProvider,
+    {
+      provide: WorkerHealthService,
+      useFactory: (env: ReturnType<typeof loadEnv>) => new WorkerHealthService(env),
+      inject: ["APP_ENV"]
+    }
+  ],
+  exports: [WorkerHealthService]
+})
+export class WorkerHealthModule {}
+
diff --git a/apps/worker/src/health/health.service.ts b/apps/worker/src/health/health.service.ts
new file mode 100644
index 0000000..324bfef
--- /dev/null
+++ b/apps/worker/src/health/health.service.ts
@@ -0,0 +1,17 @@
+import { Injectable } from "@nestjs/common";
+
+import { buildDependencyHealth, type AppEnv } from "@solar/domain";
+
+@Injectable()
+export class WorkerHealthService {
+  constructor(private readonly env: AppEnv) {}
+
+  getSnapshot() {
+    return {
+      ...buildDependencyHealth("worker", this.env),
+      checkedAt: new Date().toISOString(),
+      queue: "idle"
+    };
+  }
+}
+
diff --git a/apps/worker/src/main.ts b/apps/worker/src/main.ts
new file mode 100644
index 0000000..fcdb8d7
--- /dev/null
+++ b/apps/worker/src/main.ts
@@ -0,0 +1,19 @@
+import "reflect-metadata";
+
+import { NestFactory } from "@nestjs/core";
+
+import { WorkerAppModule } from "./app.module.js";
+
+async function bootstrap() {
+  const app = await NestFactory.create(WorkerAppModule, { logger: false });
+  const port = Number(process.env.WORKER_PORT ?? 3002);
+
+  await app.listen(port, "0.0.0.0");
+  process.stdout.write(`Worker listening on http://0.0.0.0:${port}\n`);
+}
+
+bootstrap().catch((error: unknown) => {
+  console.error(error);
+  process.exitCode = 1;
+});
+
diff --git a/apps/worker/tsconfig.json b/apps/worker/tsconfig.json
new file mode 100644
index 0000000..18ba8e0
--- /dev/null
+++ b/apps/worker/tsconfig.json
@@ -0,0 +1,16 @@
+{
+  "extends": "../../tsconfig.base.json",
+  "compilerOptions": {
+    "module": "NodeNext",
+    "moduleResolution": "NodeNext",
+    "outDir": "dist",
+    "rootDir": "src",
+    "types": ["node"],
+    "experimentalDecorators": true,
+    "emitDecoratorMetadata": true,
+    "declaration": true,
+    "declarationMap": true
+  },
+  "include": ["src/**/*.ts"]
+}
+
diff --git a/docs/runbooks/local-development.md b/docs/runbooks/local-development.md
new file mode 100644
index 0000000..6e75598
--- /dev/null
+++ b/docs/runbooks/local-development.md
@@ -0,0 +1,68 @@
+# Local Development Runbook
+
+This runbook covers the Task 1 foundation only. It does not describe later domain flows.
+
+## 1. Bootstrap the workspace
+
+1. Install the pinned toolchain.
+2. Install dependencies.
+3. Start the local services.
+4. Launch the workspace dev processes.
+
+```bash
+pnpm install
+docker compose -f infra/docker/compose.yml up -d
+pnpm dev
+```
+
+## 2. Environment file
+
+Copy `.env.example` to your local environment file and set the required secrets before starting API or worker processes.
+
+Required values include:
+
+- `DATABASE_URL`
+- `JWT_ACCESS_SECRET`
+- `JWT_REFRESH_SECRET`
+- `MQTT_URL`
+- `MQTT_USERNAME`
+- `MQTT_PASSWORD`
+- `STORAGE_ENDPOINT`
+- `STORAGE_REGION`
+- `STORAGE_BUCKET`
+- `STORAGE_ACCESS_KEY`
+- `STORAGE_SECRET_KEY`
+
+`REDIS_URL` is included for local queue wiring and can remain pointed at the bundled Redis container.
+
+## 3. Local service ports
+
+- PostgreSQL/TimescaleDB: `5432`
+- Redis: `6379`
+- MQTT: `1883`
+- MQTT dashboard: `18083`
+- Object storage: `9000`
+- Object storage console: `9001`
+
+## 4. App ports and health checks
+
+- Web: `3000`
+- API: `3001`
+- Worker: `3002`
+
+Each app exposes a `/health` endpoint that reports dependency readiness without printing secrets or raw credentials.
+
+## 5. Verification commands
+
+Run these commands before handing off Task 1:
+
+```bash
+pnpm lint
+pnpm test
+pnpm build
+pnpm db:migrate
+docker compose -f infra/docker/compose.yml config
+```
+
+If `pnpm db:migrate` reports that no application migrations exist yet, the bootstrap is still correct for Task 1.
+
diff --git a/infra/docker/compose.yml b/infra/docker/compose.yml
new file mode 100644
index 0000000..5d36288
--- /dev/null
+++ b/infra/docker/compose.yml
@@ -0,0 +1,65 @@
+services:
+  postgres:
+    image: timescale/timescaledb:latest-pg16
+    container_name: solar-postgres
+    environment:
+      POSTGRES_DB: solar_platform
+      POSTGRES_USER: solar
+      POSTGRES_PASSWORD: solar
+    ports:
+      - "5432:5432"
+    volumes:
+      - postgres-data:/var/lib/postgresql/data
+      - ./init-timescaledb.sql:/docker-entrypoint-initdb.d/001-init-timescaledb.sql:ro
+    healthcheck:
+      test: ["CMD-SHELL", "pg_isready -U solar -d solar_platform"]
+      interval: 10s
+      timeout: 5s
+      retries: 10
+
+  redis:
+    image: redis:7.4-alpine
+    container_name: solar-redis
+    ports:
+      - "6379:6379"
+    command: ["redis-server", "--appendonly", "yes"]
+    healthcheck:
+      test: ["CMD", "redis-cli", "ping"]
+      interval: 10s
+      timeout: 5s
+      retries: 10
+
+  mqtt:
+    image: emqx/emqx:5.8.5
+    container_name: solar-mqtt
+    ports:
+      - "1883:1883"
+      - "18083:18083"
+    healthcheck:
+      test: ["CMD-SHELL", "emqx ctl status >/dev/null"]
+      interval: 15s
+      timeout: 5s
+      retries: 12
+
+  storage:
+    image: minio/minio:latest
+    container_name: solar-storage
+    command: ["server", "/data", "--console-address", ":9001"]
+    environment:
+      MINIO_ROOT_USER: solar
+      MINIO_ROOT_PASSWORD: solar-storage-secret
+    ports:
+      - "9000:9000"
+      - "9001:9001"
+    volumes:
+      - minio-data:/data
+    healthcheck:
+      test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:9000/minio/health/live >/dev/null"]
+      interval: 10s
+      timeout: 5s
+      retries: 10
+
+volumes:
+  postgres-data:
+  minio-data:
+
diff --git a/infra/docker/init-timescaledb.sql b/infra/docker/init-timescaledb.sql
new file mode 100644
index 0000000..3044f9d
--- /dev/null
+++ b/infra/docker/init-timescaledb.sql
@@ -0,0 +1,3 @@
+CREATE EXTENSION IF NOT EXISTS timescaledb;
+ALTER DATABASE solar_platform SET timezone TO 'Asia/Bangkok';
+
diff --git a/package.json b/package.json
new file mode 100644
index 0000000..dd03f5c
--- /dev/null
+++ b/package.json
@@ -0,0 +1,24 @@
+{
+  "name": "solar-platform",
+  "private": true,
+  "type": "module",
+  "packageManager": "pnpm@11.24.0",
+  "engines": {
+    "node": ">=24.20.0 <25",
+    "pnpm": ">=11.24.0 <12"
+  },
+  "scripts": {
+    "dev": "turbo run dev --parallel",
+    "build": "turbo run build",
+    "lint": "turbo run lint",
+    "test": "turbo run test",
+    "db:migrate": "pnpm --filter @solar/api db:migrate"
+  },
+  "devDependencies": {
+    "@types/node": "26.4.0",
+    "tsx": "4.23.13",
+    "turbo": "2.10.12",
+    "typescript": "7.0.2"
+  }
+}
+
diff --git a/packages/api-contracts/package.json b/packages/api-contracts/package.json
new file mode 100644
index 0000000..3873754
--- /dev/null
+++ b/packages/api-contracts/package.json
@@ -0,0 +1,23 @@
+{
+  "name": "@solar/api-contracts",
+  "private": true,
+  "type": "module",
+  "exports": {
+    ".": {
+      "types": "./src/index.ts",
+      "default": "./src/index.ts"
+    },
+    "./*": {
+      "types": "./src/*.ts",
+      "default": "./src/*.ts"
+    }
+  },
+  "main": "./src/index.ts",
+  "types": "./src/index.ts",
+  "scripts": {
+    "build": "tsc -p tsconfig.json",
+    "lint": "tsc --noEmit -p tsconfig.json",
+    "test": "tsc --noEmit -p tsconfig.json"
+  }
+}
+
diff --git a/packages/api-contracts/src/index.ts b/packages/api-contracts/src/index.ts
new file mode 100644
index 0000000..d3a5138
--- /dev/null
+++ b/packages/api-contracts/src/index.ts
@@ -0,0 +1,12 @@
+export interface ApiEnvelope<T> {
+  data: T;
+  traceId?: string;
+}
+
+export interface PaginatedResult<T> {
+  items: T[];
+  total: number;
+  page: number;
+  pageSize: number;
+}
+
diff --git a/packages/api-contracts/tsconfig.json b/packages/api-contracts/tsconfig.json
new file mode 100644
index 0000000..d0f53fc
--- /dev/null
+++ b/packages/api-contracts/tsconfig.json
@@ -0,0 +1,12 @@
+{
+  "extends": "../../tsconfig.base.json",
+  "compilerOptions": {
+    "module": "ESNext",
+    "moduleResolution": "Bundler",
+    "outDir": "dist",
+    "rootDir": "src",
+    "types": []
+  },
+  "include": ["src/**/*.ts"]
+}
+
diff --git a/packages/connectors/package.json b/packages/connectors/package.json
new file mode 100644
index 0000000..6e776b7
--- /dev/null
+++ b/packages/connectors/package.json
@@ -0,0 +1,23 @@
+{
+  "name": "@solar/connectors",
+  "private": true,
+  "type": "module",
+  "exports": {
+    ".": {
+      "types": "./src/index.ts",
+      "default": "./src/index.ts"
+    },
+    "./*": {
+      "types": "./src/*.ts",
+      "default": "./src/*.ts"
+    }
+  },
+  "main": "./src/index.ts",
+  "types": "./src/index.ts",
+  "scripts": {
+    "build": "tsc -p tsconfig.json",
+    "lint": "tsc --noEmit -p tsconfig.json",
+    "test": "tsc --noEmit -p tsconfig.json"
+  }
+}
+
diff --git a/packages/connectors/src/index.ts b/packages/connectors/src/index.ts
new file mode 100644
index 0000000..3044b3d
--- /dev/null
+++ b/packages/connectors/src/index.ts
@@ -0,0 +1,27 @@
+export interface ConnectorConfig {
+  readonly id: string;
+  readonly type: "simulator" | "file-import" | "modbus-tcp";
+}
+
+export interface RegisterReadRequest {
+  readonly address: number;
+  readonly quantity: number;
+}
+
+export interface RegisterReadResult {
+  readonly address: number;
+  readonly value: string;
+}
+
+export interface ConnectorHealth {
+  readonly status: "healthy" | "degraded" | "offline";
+  readonly lastCheckedAt?: string;
+}
+
+export interface EnergyConnector {
+  connect(config: ConnectorConfig): Promise<void>;
+  read(requests: readonly RegisterReadRequest[]): Promise<readonly RegisterReadResult[]>;
+  health(): Promise<ConnectorHealth>;
+  disconnect(): Promise<void>;
+}
+
diff --git a/packages/connectors/tsconfig.json b/packages/connectors/tsconfig.json
new file mode 100644
index 0000000..d0f53fc
--- /dev/null
+++ b/packages/connectors/tsconfig.json
@@ -0,0 +1,12 @@
+{
+  "extends": "../../tsconfig.base.json",
+  "compilerOptions": {
+    "module": "ESNext",
+    "moduleResolution": "Bundler",
+    "outDir": "dist",
+    "rootDir": "src",
+    "types": []
+  },
+  "include": ["src/**/*.ts"]
+}
+
diff --git a/packages/domain/package.json b/packages/domain/package.json
new file mode 100644
index 0000000..4381bca
--- /dev/null
+++ b/packages/domain/package.json
@@ -0,0 +1,25 @@
+{
+  "name": "@solar/domain",
+  "private": true,
+  "type": "module",
+  "exports": {
+    ".": {
+      "types": "./src/index.ts",
+      "default": "./src/index.ts"
+    },
+    "./*": {
+      "types": "./src/*.ts",
+      "default": "./src/*.ts"
+    }
+  },
+  "main": "./src/index.ts",
+  "types": "./src/index.ts",
+  "scripts": {
+    "build": "tsc -p tsconfig.json",
+    "lint": "tsc --noEmit -p tsconfig.json",
+    "test": "tsx --test test"
+  },
+  "dependencies": {
+    "zod": "4.5.4"
+  }
+}
\ No newline at end of file
diff --git a/packages/domain/src/config/env.ts b/packages/domain/src/config/env.ts
new file mode 100644
index 0000000..a28eebc
--- /dev/null
+++ b/packages/domain/src/config/env.ts
@@ -0,0 +1,38 @@
+import { z } from "zod";
+
+const nonEmptyString = z.string().trim().min(1);
+const urlString = z.string().trim().url();
+
+export const envSchema = z.object({
+  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
+  DATABASE_URL: nonEmptyString,
+  JWT_ACCESS_SECRET: nonEmptyString.min(32, "JWT_ACCESS_SECRET must be at least 32 characters long"),
+  JWT_REFRESH_SECRET: nonEmptyString.min(32, "JWT_REFRESH_SECRET must be at least 32 characters long"),
+  MQTT_URL: nonEmptyString,
+  MQTT_USERNAME: nonEmptyString,
+  MQTT_PASSWORD: nonEmptyString,
+  STORAGE_ENDPOINT: urlString,
+  STORAGE_REGION: nonEmptyString,
+  STORAGE_BUCKET: nonEmptyString,
+  STORAGE_ACCESS_KEY: nonEmptyString,
+  STORAGE_SECRET_KEY: nonEmptyString,
+  REDIS_URL: nonEmptyString.optional(),
+  WEB_PORT: z.coerce.number().int().positive().default(3000),
+  API_PORT: z.coerce.number().int().positive().default(3001),
+  WORKER_PORT: z.coerce.number().int().positive().default(3002)
+});
+
+export type AppEnv = z.infer<typeof envSchema>;
+
+export function loadEnv(input: Record<string, unknown>): AppEnv {
+  const result = envSchema.safeParse(input);
+  if (!result.success) {
+    const details = result.error.issues
+      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
+      .join("; ");
+    throw new Error(`Invalid environment configuration: ${details}`);
+  }
+
+  return result.data;
+}
+
diff --git a/packages/domain/src/health/dependency-health.ts b/packages/domain/src/health/dependency-health.ts
new file mode 100644
index 0000000..e714c9f
--- /dev/null
+++ b/packages/domain/src/health/dependency-health.ts
@@ -0,0 +1,42 @@
+import type { AppEnv } from "../config/env.js";
+
+export type DependencyStatus = "healthy" | "degraded" | "missing";
+
+export interface DependencyHealth {
+  name: string;
+  status: DependencyStatus;
+  configured: boolean;
+}
+
+export interface ServiceHealth {
+  service: string;
+  status: "healthy" | "degraded";
+  dependencies: DependencyHealth[];
+}
+
+function dependency(name: string, configured: boolean, required = true): DependencyHealth {
+  return {
+    name,
+    configured,
+    status: configured ? "healthy" : required ? "missing" : "degraded"
+  };
+}
+
+export function buildDependencyHealth(service: string, env: AppEnv): ServiceHealth {
+  const dependencies: DependencyHealth[] = [
+    dependency("database", Boolean(env.DATABASE_URL)),
+    dependency("jwt", Boolean(env.JWT_ACCESS_SECRET) && Boolean(env.JWT_REFRESH_SECRET)),
+    dependency("mqtt", Boolean(env.MQTT_URL) && Boolean(env.MQTT_USERNAME) && Boolean(env.MQTT_PASSWORD)),
+    dependency(
+      "storage",
+      Boolean(env.STORAGE_ENDPOINT) && Boolean(env.STORAGE_BUCKET) && Boolean(env.STORAGE_ACCESS_KEY) && Boolean(env.STORAGE_SECRET_KEY)
+    ),
+    dependency("redis", Boolean(env.REDIS_URL), false)
+  ];
+
+  return {
+    service,
+    status: dependencies.some((item) => item.status !== "healthy") ? "degraded" : "healthy",
+    dependencies
+  };
+}
\ No newline at end of file
diff --git a/packages/domain/src/index.ts b/packages/domain/src/index.ts
new file mode 100644
index 0000000..d09d0d7
--- /dev/null
+++ b/packages/domain/src/index.ts
@@ -0,0 +1,5 @@
+export { envSchema, loadEnv } from "./config/env.js";
+export type { AppEnv } from "./config/env.js";
+export { buildDependencyHealth } from "./health/dependency-health.js";
+export type { DependencyHealth, DependencyStatus, ServiceHealth } from "./health/dependency-health.js";
+
diff --git a/packages/domain/test/env.test.ts b/packages/domain/test/env.test.ts
new file mode 100644
index 0000000..d059fa9
--- /dev/null
+++ b/packages/domain/test/env.test.ts
@@ -0,0 +1,48 @@
+import assert from "node:assert/strict";
+import test from "node:test";
+
+import { buildDependencyHealth, loadEnv } from "../src/index.js";
+
+const baseEnv = {
+  NODE_ENV: "development",
+  DATABASE_URL: "postgresql://solar:solar@localhost:5432/solar_platform",
+  JWT_ACCESS_SECRET: "access-secret-access-secret-access-secret",
+  JWT_REFRESH_SECRET: "refresh-secret-refresh-secret-refresh-secret",
+  MQTT_URL: "mqtt://localhost:1883",
+  MQTT_USERNAME: "solar",
+  MQTT_PASSWORD: "solar",
+  STORAGE_ENDPOINT: "http://localhost:9000",
+  STORAGE_REGION: "ap-southeast-1",
+  STORAGE_BUCKET: "solar-platform",
+  STORAGE_ACCESS_KEY: "solar",`r`n  STORAGE_SECRET_KEY: "storage-secret-storage-secret-storage-secret",`r`n  REDIS_URL: "redis://localhost:6379"
+};
+
+test("loadEnv validates required secrets", () => {
+  const env = loadEnv(baseEnv);
+
+  assert.equal(env.DATABASE_URL, baseEnv.DATABASE_URL);
+  assert.equal(env.WEB_PORT, 3000);
+  assert.equal(env.API_PORT, 3001);
+  assert.equal(env.WORKER_PORT, 3002);
+});
+
+test("loadEnv rejects missing secrets", () => {
+  assert.throws(
+    () => loadEnv({ ...baseEnv, JWT_ACCESS_SECRET: "" }),
+    /JWT_ACCESS_SECRET/
+  );
+});
+
+test("buildDependencyHealth does not expose secret values", () => {
+  const health = buildDependencyHealth("api", loadEnv(baseEnv));
+
+  assert.equal(health.service, "api");
+  assert.equal(health.status, "healthy");
+  assert.deepEqual(
+    health.dependencies.map((dependency) => dependency.name),
+    ["database", "jwt", "mqtt", "storage", "redis"]
+  );
+  assert.ok(health.dependencies.every((dependency) => typeof dependency.configured === "boolean"));
+});
+
+
diff --git a/packages/domain/tsconfig.json b/packages/domain/tsconfig.json
new file mode 100644
index 0000000..11d0444
--- /dev/null
+++ b/packages/domain/tsconfig.json
@@ -0,0 +1,14 @@
+{
+  "extends": "../../tsconfig.base.json",
+  "compilerOptions": {
+    "module": "NodeNext",
+    "moduleResolution": "NodeNext",
+    "outDir": "dist",
+    "rootDir": "src",
+    "types": ["node"],
+    "declaration": true,
+    "declarationMap": true
+  },
+  "include": ["src/**/*.ts", "test/**/*.ts"]
+}
+
diff --git a/packages/i18n/package.json b/packages/i18n/package.json
new file mode 100644
index 0000000..e920927
--- /dev/null
+++ b/packages/i18n/package.json
@@ -0,0 +1,23 @@
+{
+  "name": "@solar/i18n",
+  "private": true,
+  "type": "module",
+  "exports": {
+    ".": {
+      "types": "./src/index.ts",
+      "default": "./src/index.ts"
+    },
+    "./*": {
+      "types": "./src/*.ts",
+      "default": "./src/*.ts"
+    }
+  },
+  "main": "./src/index.ts",
+  "types": "./src/index.ts",
+  "scripts": {
+    "build": "tsc -p tsconfig.json",
+    "lint": "tsc --noEmit -p tsconfig.json",
+    "test": "tsc --noEmit -p tsconfig.json"
+  }
+}
+
diff --git a/packages/i18n/src/index.ts b/packages/i18n/src/index.ts
new file mode 100644
index 0000000..ad6e268
--- /dev/null
+++ b/packages/i18n/src/index.ts
@@ -0,0 +1,3 @@
+export { createTranslator, t } from "./locale.js";
+export { th } from "./th.js";
+
diff --git a/packages/i18n/src/locale.ts b/packages/i18n/src/locale.ts
new file mode 100644
index 0000000..298ef60
--- /dev/null
+++ b/packages/i18n/src/locale.ts
@@ -0,0 +1,23 @@
+import { th } from "./th.js";
+
+export type TranslationDictionary = typeof th;
+
+export function createTranslator(dictionary: TranslationDictionary) {
+  return function t(key: string): string {
+    const segments = key.split(".");
+    let current: unknown = dictionary;
+
+    for (const segment of segments) {
+      if (typeof current !== "object" || current === null || !(segment in current)) {
+        return key;
+      }
+
+      current = (current as Record<string, unknown>)[segment];
+    }
+
+    return typeof current === "string" ? current : key;
+  };
+}
+
+export const t = createTranslator(th);
+
diff --git a/packages/i18n/src/th.ts b/packages/i18n/src/th.ts
new file mode 100644
index 0000000..2ec0551
--- /dev/null
+++ b/packages/i18n/src/th.ts
@@ -0,0 +1,14 @@
+export const th = {
+  app: {
+    title: "แพลตฟอร์มจัดการพลังงานแสงอาทิตย์",
+    health: "สถานะระบบ"
+  },
+  navigation: {
+    dashboard: "แดชบอร์ด",
+    schools: "โรงเรียน",
+    sites: "ไซต์",
+    gateways: "เกตเวย์",
+    billing: "การเรียกเก็บเงิน"
+  }
+} as const;
+
diff --git a/packages/i18n/tsconfig.json b/packages/i18n/tsconfig.json
new file mode 100644
index 0000000..d0f53fc
--- /dev/null
+++ b/packages/i18n/tsconfig.json
@@ -0,0 +1,12 @@
+{
+  "extends": "../../tsconfig.base.json",
+  "compilerOptions": {
+    "module": "ESNext",
+    "moduleResolution": "Bundler",
+    "outDir": "dist",
+    "rootDir": "src",
+    "types": []
+  },
+  "include": ["src/**/*.ts"]
+}
+
diff --git a/packages/ui/package.json b/packages/ui/package.json
new file mode 100644
index 0000000..433cf17
--- /dev/null
+++ b/packages/ui/package.json
@@ -0,0 +1,23 @@
+{
+  "name": "@solar/ui",
+  "private": true,
+  "type": "module",
+  "exports": {
+    ".": {
+      "types": "./src/index.ts",
+      "default": "./src/index.ts"
+    },
+    "./*": {
+      "types": "./src/*.ts",
+      "default": "./src/*.ts"
+    }
+  },
+  "main": "./src/index.ts",
+  "types": "./src/index.ts",
+  "scripts": {
+    "build": "tsc -p tsconfig.json",
+    "lint": "tsc --noEmit -p tsconfig.json",
+    "test": "tsc --noEmit -p tsconfig.json"
+  }
+}
+
diff --git a/packages/ui/src/index.ts b/packages/ui/src/index.ts
new file mode 100644
index 0000000..7d912fc
--- /dev/null
+++ b/packages/ui/src/index.ts
@@ -0,0 +1,12 @@
+export interface UiTokenSet {
+  readonly brand: string;
+  readonly surface: string;
+  readonly accent: string;
+}
+
+export const uiTokens: UiTokenSet = {
+  brand: "solar",
+  surface: "surface",
+  accent: "accent"
+};
+
diff --git a/packages/ui/tsconfig.json b/packages/ui/tsconfig.json
new file mode 100644
index 0000000..d0f53fc
--- /dev/null
+++ b/packages/ui/tsconfig.json
@@ -0,0 +1,12 @@
+{
+  "extends": "../../tsconfig.base.json",
+  "compilerOptions": {
+    "module": "ESNext",
+    "moduleResolution": "Bundler",
+    "outDir": "dist",
+    "rootDir": "src",
+    "types": []
+  },
+  "include": ["src/**/*.ts"]
+}
+
diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
new file mode 100644
index 0000000..41bbf2b
--- /dev/null
+++ b/pnpm-lock.yaml
@@ -0,0 +1,2203 @@
+lockfileVersion: '9.0'
+
+settings:
+  autoInstallPeers: true
+  excludeLinksFromLockfile: false
+
+importers:
+
+  .:
+    devDependencies:
+      '@types/node':
+        specifier: 26.4.0
+        version: 26.4.0
+      tsx:
+        specifier: 4.23.13
+        version: 4.23.13
+      turbo:
+        specifier: 2.10.12
+        version: 2.10.12
+      typescript:
+        specifier: 7.0.2
+        version: 7.0.2
+
+  apps/api:
+    dependencies:
+      '@nestjs/common':
+        specifier: 12.0.1
+        version: 12.0.1(reflect-metadata@0.2.2)(rxjs@7.8.2)
+      '@nestjs/core':
+        specifier: 12.0.1
+        version: 12.0.1(@nestjs/common@12.0.1(reflect-metadata@0.2.2)(rxjs@7.8.2))(@nestjs/platform-express@12.0.1)(reflect-metadata@0.2.2)(rxjs@7.8.2)
+      '@nestjs/platform-express':
+        specifier: 12.0.1
+        version: 12.0.1(@nestjs/common@12.0.1(reflect-metadata@0.2.2)(rxjs@7.8.2))(@nestjs/core@12.0.1)
+      '@solar/domain':
+        specifier: workspace:*
+        version: link:../../packages/domain
+      express:
+        specifier: 5.2.1
+        version: 5.2.1
+      reflect-metadata:
+        specifier: 0.2.2
+        version: 0.2.2
+      rxjs:
+        specifier: 7.8.2
+        version: 7.8.2
+    devDependencies:
+      '@types/express':
+        specifier: 5.0.6
+        version: 5.0.6
+
+  apps/web:
+    dependencies:
+      '@solar/domain':
+        specifier: workspace:*
+        version: link:../../packages/domain
+      '@solar/i18n':
+        specifier: workspace:*
+        version: link:../../packages/i18n
+      '@solar/ui':
+        specifier: workspace:*
+        version: link:../../packages/ui
+      next:
+        specifier: 16.3.3
+        version: 16.3.3(@types/node@26.4.0)(react-dom@19.2.8(react@19.2.8))(react@19.2.8)
+      react:
+        specifier: 19.2.8
+        version: 19.2.8
+      react-dom:
+        specifier: 19.2.8
+        version: 19.2.8(react@19.2.8)
+    devDependencies:
+      '@types/react':
+        specifier: 19.2.18
+        version: 19.2.18
+      '@types/react-dom':
+        specifier: 19.2.5
+        version: 19.2.5(@types/react@19.2.18)
+
+  apps/worker:
+    dependencies:
+      '@nestjs/common':
+        specifier: 12.0.1
+        version: 12.0.1(reflect-metadata@0.2.2)(rxjs@7.8.2)
+      '@nestjs/core':
+        specifier: 12.0.1
+        version: 12.0.1(@nestjs/common@12.0.1(reflect-metadata@0.2.2)(rxjs@7.8.2))(@nestjs/platform-express@12.0.1)(reflect-metadata@0.2.2)(rxjs@7.8.2)
+      '@nestjs/platform-express':
+        specifier: 12.0.1
+        version: 12.0.1(@nestjs/common@12.0.1(reflect-metadata@0.2.2)(rxjs@7.8.2))(@nestjs/core@12.0.1)
+      '@solar/domain':
+        specifier: workspace:*
+        version: link:../../packages/domain
+      express:
+        specifier: 5.2.1
+        version: 5.2.1
+      reflect-metadata:
+        specifier: 0.2.2
+        version: 0.2.2
+      rxjs:
+        specifier: 7.8.2
+        version: 7.8.2
+    devDependencies:
+      '@types/express':
+        specifier: 5.0.6
+        version: 5.0.6
+
+  packages/api-contracts: {}
+
+  packages/connectors: {}
+
+  packages/domain:
+    dependencies:
+      zod:
+        specifier: 4.5.4
+        version: 4.5.4
+
+  packages/i18n: {}
+
+  packages/ui: {}
+
+packages:
+
+  '@borewit/text-codec@0.2.2':
+    resolution: {integrity: sha512-DDaRehssg1aNrH4+2hnj1B7vnUGEjU6OIlyRdkMd0aUdIUvKXrJfXsy8LVtXAy7DRvYVluWbMspsRhz2lcW0mQ==}
+
+  '@emnapi/runtime@1.11.3':
+    resolution: {integrity: sha512-Xz4Tpyki7XyrpbUK1jR1AhdAdaXyhhY4lZ3neLodmhpuWfy2PAQN5B46sAiU4liOXGLkHypn/qU+jvfWSCYYLA==}
+
+  '@esbuild/aix-ppc64@0.28.2':
+    resolution: {integrity: sha512-XExcO+dvLKvVtNTibSTBej1NCAbaGhWn9Ww1ZPx80qsahhPFe/8jgWP0IchNe0F3HwkU7n8ejhH8bjonqht8mQ==}
+    engines: {node: '>=18'}
+    cpu: [ppc64]
+    os: [aix]
+
+  '@esbuild/android-arm64@0.28.2':
+    resolution: {integrity: sha512-5YfKeeI8qWfBZIX+u2xZC3Zlb3Os/gLS2sbEKM+I4ZOcsWmHS2WLysCcQZDAFRslDUU5Oiq44gf6PYN1vGwG5A==}
+    engines: {node: '>=18'}
+    cpu: [arm64]
+    os: [android]
+
+  '@esbuild/android-arm@0.28.2':
+    resolution: {integrity: sha512-kXXoiPVVGQcnIYGOeaovwOURpniDBpSq4A03qkQ+BMQqtGG6HYap3xne9C1O1yo4TR3qxlCX5IqqmX6fFo2Lqg==}
+    engines: {node: '>=18'}
+    cpu: [arm]
+    os: [android]
+
+  '@esbuild/android-x64@0.28.2':
+    resolution: {integrity: sha512-O387ite7SzUyCcy3JQX4P4bLtEA7bLLkx+esve5JHnyYfNTxcVpXZo9jhdB0lTKN44gztELTdU7nS8Nr16Fs1Q==}
+    engines: {node: '>=18'}
+    cpu: [x64]
+    os: [android]
+
+  '@esbuild/darwin-arm64@0.28.2':
+    resolution: {integrity: sha512-n4KqkOQrraxHJcgjM1RvwbigfQKIKJVpM7xp+KsxiyUSrRdIXnt73VhrPAx0fV44hgfmIVKjxMN9J1t5jySVkw==}
+    engines: {node: '>=18'}
+    cpu: [arm64]
+    os: [darwin]
+
+  '@esbuild/darwin-x64@0.28.2':
+    resolution: {integrity: sha512-uq6suIWYP37qzGddBKPw5QEQPi6HiLGsO7UmkpfyaYNQ3D+rN6w6WfwH+nuqcGXWvawGwxOEroO4YGnFh95azw==}
+    engines: {node: '>=18'}
+    cpu: [x64]
+    os: [darwin]
+
+  '@esbuild/freebsd-arm64@0.28.2':
+    resolution: {integrity: sha512-n+I0BTSRIoy+d6RPKnEVwql5UwBJolytvY4mAOIEJorKlqgPII8ix6slVVrfZ5Tnj7glIZvloylbB/EJPMWEXw==}
+    engines: {node: '>=18'}
+    cpu: [arm64]
+    os: [freebsd]
+
+  '@esbuild/freebsd-x64@0.28.2':
+    resolution: {integrity: sha512-78XJTJkvPs0kz2w61301PJjXl4g7q3JqiYMZ/M/yVI73EHBrCRTgkhu9oqG7vPqq+a/yadEW8aD+agKlk5xrmg==}
+    engines: {node: '>=18'}
+    cpu: [x64]
+    os: [freebsd]
+
+  '@esbuild/linux-arm64@0.28.2':
+    resolution: {integrity: sha512-pW4AC0P3it8c7do9MVM4p51FzHzdM/TZrerurgRcHJ2WTa1VQ1CIq18xncfpBJw4ojkiZZrKW2yIBWBP92j6Ug==}
+    engines: {node: '>=18'}
+    cpu: [arm64]
+    os: [linux]
+
+  '@esbuild/linux-arm@0.28.2':
+    resolution: {integrity: sha512-XlDnu2q5yoqems+xay6wSAcg9DDD7K9RLKZEBOMZm3ckNpJBvOX20tSfby8KfrrhINDyv9V2YVZKY/SpoGJI8w==}
+    engines: {node: '>=18'}
+    cpu: [arm]
+    os: [linux]
+
+  '@esbuild/linux-ia32@0.28.2':
+    resolution: {integrity: sha512-CYbnj78HsIeA+DhgUKgFCfvNsTHFhMMrinUrMZpDXJXKN8T3XViTZ/+wtHeVxEWY8ewSzTFN+nRmSwO2tZaLUQ==}
+    engines: {node: '>=18'}
+    cpu: [ia32]
+    os: [linux]
+
+  '@esbuild/linux-loong64@0.28.2':
+    resolution: {integrity: sha512-buwkd8nsph4R+ajRvw0qM5Hja/TXQow3ptzWO2EbG/cqcIkHloRrdlBtQlshyYGTNFvfkfJ5tpPLVkY4DtsPfQ==}
+    engines: {node: '>=18'}
+    cpu: [loong64]
+    os: [linux]
+
+  '@esbuild/linux-mips64el@0.28.2':
+    resolution: {integrity: sha512-ZVykbDyk7519VwiNb9Lcj9m8XM6v5V9uKPvrEMkkEedVewf+0itkhahp4HDpgERXhwLRpWFypsGbG/J8s0QjJA==}
+    engines: {node: '>=18'}
+    cpu: [mips64el]
+    os: [linux]
+
+  '@esbuild/linux-ppc64@0.28.2':
+    resolution: {integrity: sha512-CAXl+Dtd9UUuJd8pKKdwh6MLm3MUMiqMPmhZ3tTSXPqfyQ3vDl6R5hZdZ/kYojK4ofXtdfSv1tFq8XzWx3heNQ==}
+    engines: {node: '>=18'}
+    cpu: [ppc64]
+    os: [linux]
+
+  '@esbuild/linux-riscv64@0.28.2':
+    resolution: {integrity: sha512-GeXCej4IQtU1B+QlDV8W/RRvbzI3O/Stss+/bCXv4lZls5WGRtu2a+3JkA3i4qIUlMXpcHebWpF8AkJhATowuA==}
+    engines: {node: '>=18'}
+    cpu: [riscv64]
+    os: [linux]
+
+  '@esbuild/linux-s390x@0.28.2':
+    resolution: {integrity: sha512-3H1weTYZPxt/WOhByszQZybS9w5lKzUn1FDMsgEChbHWQwHYQQRfBxgCcZvPhjHfKyJjIievvMmEUawJrdY9Dg==}
+    engines: {node: '>=18'}
+    cpu: [s390x]
+    os: [linux]
+
+  '@esbuild/linux-x64@0.28.2':
+    resolution: {integrity: sha512-4xTZr1FUmSoQW4XIWmit3tzQrUTZM+N3P0XV8xROKYF50XfI7xeO90+1bZvNwxIufQ9hDQVRJH5YhgPVF8A/HQ==}
+    engines: {node: '>=18'}
+    cpu: [x64]
+    os: [linux]
+
+  '@esbuild/netbsd-arm64@0.28.2':
+    resolution: {integrity: sha512-sSATRjPeDBg3pdgHoQfoYBob11Kk1FGa9lui5RIHZCoCkJa9QKlvl3/vKz2usCmYYjs7ymJR/2Nnsqe+Hjt5nw==}
+    engines: {node: '>=18'}
+    cpu: [arm64]
+    os: [netbsd]
+
+  '@esbuild/netbsd-x64@0.28.2':
+    resolution: {integrity: sha512-lqnzCV+mM0gIADaKihiCg6ifgfU2L3h5E33rNQBN1Y4MaVGnzryzmvvf7UHxprpQdE8hpqLolJ9Rl+SkIRDpyw==}
+    engines: {node: '>=18'}
+    cpu: [x64]
+    os: [netbsd]
+
+  '@esbuild/openbsd-arm64@0.28.2':
+    resolution: {integrity: sha512-AL2qJILH7lNjrDmCQDvdxMfAUIv8KMNZOvrwAQ8i8//ntL9FflhOyMJ8OZSMBb8/AWXe3/5v5S20y3zCoZWKoQ==}
+    engines: {node: '>=18'}
+    cpu: [arm64]
+    os: [openbsd]
+
+  '@esbuild/openbsd-x64@0.28.2':
+    resolution: {integrity: sha512-QtiuPytchRyC4rwUKhexJdQKvDuZ6hWloi3igqPQNUJCS1/v9EiO3UTOXR6A3FoMo4fnAKbWJdqaIwhOzh8qEw==}
+    engines: {node: '>=18'}
+    cpu: [x64]
+    os: [openbsd]
+
+  '@esbuild/openharmony-arm64@0.28.2':
+    resolution: {integrity: sha512-WkhYDmpTjLvGlScA1rwjRUmhl4k8oXR3cIbtqWmELgU/dFeHHlEllxDvdWcNJV9rbzCexB5vz8gtNewWLgCT7Q==}
+    engines: {node: '>=18'}
+    cpu: [arm64]
+    os: [openharmony]
+
+  '@esbuild/sunos-x64@0.28.2':
+    resolution: {integrity: sha512-GPMSkTOtMnv2U2F8gxe4Io6qmVs+YKyp832Etqqxr0hFngmXQ3rzwytelm3GIn7T4VviRUlf3sOgBOiTdvaf7g==}
+    engines: {node: '>=18'}
+    cpu: [x64]
+    os: [sunos]
+
+  '@esbuild/win32-arm64@0.28.2':
+    resolution: {integrity: sha512-PIhhEkE9uPBleRBrQEJpUn7MBnibZzbGzYWPmY3x+YoVg/95zbjB4CxPPOQ8l5tYYM4mMaCthF8/1DIfBQQyWQ==}
+    engines: {node: '>=18'}
+    cpu: [arm64]
+    os: [win32]
+
+  '@esbuild/win32-ia32@0.28.2':
+    resolution: {integrity: sha512-YmJbfTlvU7Sdn9BB+4PRES4oB6pxgS37MAONj+hBr/cpXS1aBPKXxNnDbu+QCWPj0o9dgyxeq79g6c5P8KeuYA==}
+    engines: {node: '>=18'}
+    cpu: [ia32]
+    os: [win32]
+
+  '@esbuild/win32-x64@0.28.2':
+    resolution: {integrity: sha512-5ebpxr3nWMzrL/rnUI755Jkuee0bHL/Gq0WTF9lvcpv73wAp5eu8MfBUgWK9bhWvZjj7yX8etf/8tI8Ney695g==}
+    engines: {node: '>=18'}
+    cpu: [x64]
+    os: [win32]
+
+  '@img/colour@1.1.0':
+    resolution: {integrity: sha512-Td76q7j57o/tLVdgS746cYARfSyxk8iEfRxewL9h4OMzYhbW4TAcppl0mT4eyqXddh6L/jwoM75mo7ixa/pCeQ==}
+    engines: {node: '>=18'}
+
+  '@img/sharp-darwin-arm64@0.35.4':
+    resolution: {integrity: sha512-Uhfl4V4lhP2nbUVF9+hyH1+luj86f1gUFeo8ALYxFoULoU+G87D43BfeMP8XHsk9boxAnCY/bf2EHwhA7MuGsA==}
+    engines: {node: '>=20.9.0'}
+    cpu: [arm64]
+    os: [darwin]
+
+  '@img/sharp-darwin-x64@0.35.4':
+    resolution: {integrity: sha512-hWniXY3bG5qKpkKrAwPe4y+VTPmf086YQAnkxWh7uA1YrlRouWGa0M0Mxj3ZjnXFkv7/TD1bTy9lGUK26vRvWw==}
+    engines: {node: '>=20.9.0'}
+    cpu: [x64]
+    os: [darwin]
+
+  '@img/sharp-freebsd-wasm32@0.35.4':
+    resolution: {integrity: sha512-lIsKw/BU+kjB4eZjxrYrZmwOJYi3Ajrv66iAlBmUPyKc3HpnloevB1g3wxGD9P/5BbQ1brBGl65VRRrCvQDEqA==}
+    engines: {node: '>=20.9.0'}
+    os: [freebsd]
+
+  '@img/sharp-libvips-darwin-arm64@1.3.3':
+    resolution: {integrity: sha512-suTBPTDGrI9WodccaDdwZItTSaBYASlBk1NSfElSHrUfzu3szG6lvIF58+WiFvnfzuK8ZBFS5zE00PxqxnRiPg==}
+    cpu: [arm64]
+    os: [darwin]
+
+  '@img/sharp-libvips-darwin-x64@1.3.3':
+    resolution: {integrity: sha512-FVJZ5mITMobmXIz/hPDTw0EintTW5H3WfrxwLqEqjiIihlu+hVRyGrFQ60xl0Lxn7Bt3zdpevPaQi0HEzqz9fw==}
+    cpu: [x64]
+    os: [darwin]
+
+  '@img/sharp-libvips-linux-arm64@1.3.3':
+    resolution: {integrity: sha512-0DaL0A6Xu6sQSQFwe4iVCrKWU2cCTItnRsYsCdxAMm9NF6twAA9BKnoqy4hqz4+azQ0JHuA26qiUKsf1XJ/v5A==}
+    cpu: [arm64]
+    os: [linux]
+    libc: [glibc]
+
+  '@img/sharp-libvips-linux-arm@1.3.3':
+    resolution: {integrity: sha512-3rbU4vqXXc3hY/OiXdl52xZvT0F1yEngWfvqudtPJg/KkyiaQw2DRsFrNzpmLvfavbwOq3qXn36GP8obHRULQA==}
+    cpu: [arm]
+    os: [linux]
+    libc: [glibc]
+
+  '@img/sharp-libvips-linux-ppc64@1.3.3':
+    resolution: {integrity: sha512-cdn1OvUBwsXhbC0zSzJnNzf5MZ/mTrobawDvNXBTxe8VtqKAm0sRuEY2Evzovb/w9JMk4TvRxqt1mekSuJz64w==}
+    cpu: [ppc64]
+    os: [linux]
+    libc: [glibc]
+
+  '@img/sharp-libvips-linux-riscv64@1.3.3':
+    resolution: {integrity: sha512-HjPVx7yKz+0lqdhDlTw1tt90wamBoxhiXpvl1XZpJLiHH4RCJ5yDTqH+VlYPv2fwFs89JFw4c1IexYOcQUi4IQ==}
+    cpu: [riscv64]
+    os: [linux]
+    libc: [glibc]
+
+  '@img/sharp-libvips-linux-s390x@1.3.3':
+    resolution: {integrity: sha512-neWLh+3yCNThxnfy3c4BbVBeGgt9aftno+XbT56iK28RgeDs3UOFWviLWlUu0bArYVYJaFDK+RRohbicUNCm8Q==}
+    cpu: [s390x]
+    os: [linux]
+    libc: [glibc]
+
+  '@img/sharp-libvips-linux-x64@1.3.3':
+    resolution: {integrity: sha512-4vKmvAst9nrowcqquKFAyZJUDolUaIp8uRiN0mWFguJ1IplC9/pitXtlnnlU4aa/eJw3J7i67V+pwUL+wZGdsA==}
+    cpu: [x64]
+    os: [linux]
+    libc: [glibc]
+
+  '@img/sharp-libvips-linuxmusl-arm64@1.3.3':
+    resolution: {integrity: sha512-Y9kQaLMuNoB0bPYOOdcZMaseNrFpPodIWWMrx+CZyydf2xn68j9WYc6sWWRrDwNkzCQjKYfc68L7jKjGlHMibw==}
+    cpu: [arm64]
+    os: [linux]
+    libc: [musl]
+
+  '@img/sharp-libvips-linuxmusl-x64@1.3.3':
+    resolution: {integrity: sha512-fj8Mv0HHfD1Rr+4I68+3agJynxDWtBFgicTbSOb9Bke6pIwzGcJ+RX/yHjmiEGFMCavY/dxvem7MyNaJF+wDiw==}
+    cpu: [x64]
+    os: [linux]
+    libc: [musl]
+
+  '@img/sharp-linux-arm64@0.35.4':
+    resolution: {integrity: sha512-De4jpEnAU8Hd5oT0j1G3uL4ZvTuipVMn7YC6vPaJhy6/7EwEae0SVAoBrUMYQbkLGDm85taVWwuPc1a44LTzCQ==}
+    engines: {node: '>=20.9.0'}
+    cpu: [arm64]
+    os: [linux]
+    libc: [glibc]
+
+  '@img/sharp-linux-arm@0.35.4':
+    resolution: {integrity: sha512-7OAS8gI0EReKGVN2HssHlM6umJgxF5VI3xN0p9FA91p/YO+ou5hiNghLdZ5BEHztwaaK5+bLKRf8x/o2L2nk9A==}
+    engines: {node: '>=20.9.0'}
+    cpu: [arm]
+    os: [linux]
+    libc: [glibc]
+
+  '@img/sharp-linux-ppc64@0.35.4':
+    resolution: {integrity: sha512-2oYZJeIl4kCcMGk4ouZVjnkCtFrpQFlNEtJ6GbxzhHQchwH0NH/qEb9ykmOl29dqwMq+JhFdZn+1ak2FKhI9fQ==}
+    engines: {node: '>=20.9.0'}
+    cpu: [ppc64]
+    os: [linux]
+    libc: [glibc]
+
+  '@img/sharp-linux-riscv64@0.35.4':
+    resolution: {integrity: sha512-cPbNChoRURAWdebDIHSenxRpgEdy7JkPydSnUxRm9VvKD7m0/xVaR/8Fzlu81pk5nHEvHH87UZUA7cTtwnbJSA==}
+    engines: {node: '>=20.9.0'}
+    cpu: [riscv64]
+    os: [linux]
+    libc: [glibc]
+
+  '@img/sharp-linux-s390x@0.35.4':
+    resolution: {integrity: sha512-RY0JFY8Fd6RonCBtHz+DvadaPkXDSI1AUn6yWL9TipqkZ1vY8w8evqdgyDFnkm4/K1ve1TvZiaePP5oSd4+WVQ==}
+    engines: {node: '>=20.9.0'}
+    cpu: [s390x]
+    os: [linux]
+    libc: [glibc]
+
+  '@img/sharp-linux-x64@0.35.4':
+    resolution: {integrity: sha512-9qvvEAuk8k89TfWUoX2htWjbAMX8p+NxCppjpcg5k6xMsjhBQPTsoIh36h9Qde4WRuGpJeYnOjdosDn/cnv+OA==}
+    engines: {node: '>=20.9.0'}
+    cpu: [x64]
+    os: [linux]
+    libc: [glibc]
+
+  '@img/sharp-linuxmusl-arm64@0.35.4':
+    resolution: {integrity: sha512-KB5jxpfWQTr0nc3xdHtWChdbifHrBGsd2SM62Eyxrl8afikm+f5qGBU75SJIZBT/S1MC8XyacdlXBMSWq6OURA==}
+    engines: {node: '>=20.9.0'}
+    cpu: [arm64]
+    os: [linux]
+    libc: [musl]
+
+  '@img/sharp-linuxmusl-x64@0.35.4':
+    resolution: {integrity: sha512-f+eZJZIQNEEd26RPSW+76chwOf1XtA2Y/O+5ocVyLliHkeih3e+jhLVBdNTd2rS3IbNXK8+ug93Vf5ZXtF5Lxg==}
+    engines: {node: '>=20.9.0'}
+    cpu: [x64]
+    os: [linux]
+    libc: [musl]
+
+  '@img/sharp-wasm32@0.35.4':
+    resolution: {integrity: sha512-zQnl4Kwp7Q6NHsENtU2T/00Zi+w3AQNwz3+UaTyVBy2FpXrzXzGjndpK61onhZjRtRpQXxCTeqw19bVyXOh7jA==}
+    engines: {node: '>=20.9.0'}
+
+  '@img/sharp-webcontainers-wasm32@0.35.4':
+    resolution: {integrity: sha512-ESfNkywmCfPNyaZjxooddJQiQ+l/nTpGEOGthxiLnIHXC/CmcBixnfwUleX9mCz9ovrUUvKMap/pm8RYbzfwaA==}
+    engines: {node: '>=20.9.0'}
+    cpu: [wasm32]
+
+  '@img/sharp-win32-arm64@0.35.4':
+    resolution: {integrity: sha512-iNdlBX9gLVvqe2I3uIJSIKTq6wckP/DYxZtcqxm09x5Gi24DnFBmPAWZmr60ZyYMG0xlzo6goG3670ar+RXvRw==}
+    engines: {node: '>=20.9.0'}
+    cpu: [arm64]
+    os: [win32]
+
+  '@img/sharp-win32-ia32@0.35.4':
+    resolution: {integrity: sha512-kqRsbaa5CS6KHlpxnN7WhE6vAAugXyZButpRdvDWetlv6Qv4N9WTcrWzF7tXfB9T7MsoadqdI8hmwLq6UlLvtw==}
+    engines: {node: ^20.9.0}
+    cpu: [ia32]
+    os: [win32]
+
+  '@img/sharp-win32-x64@0.35.4':
+    resolution: {integrity: sha512-XtmnYhBcrORsJ4XJngyzr/EWP0hRZLAZRFaApdKuviyqF78+ylxh2y06ZmtULAMOnObJ3ucpN0AcwSWnMowTRg==}
+    engines: {node: '>=20.9.0'}
+    cpu: [x64]
+    os: [win32]
+
+  '@lukeed/csprng@1.1.0':
+    resolution: {integrity: sha512-Z7C/xXCiGWsg0KuKsHTKJxbWhpI3Vs5GwLfOean7MGyVFGqdRgBbAjOCh6u4bbjPc/8MJ2pZmK/0DLdCbivLDA==}
+    engines: {node: '>=8'}
+
+  '@nestjs/common@12.0.1':
+    resolution: {integrity: sha512-v0zTaRCTV2K2xSnb3GnJoQKtaR6VxouJtm+P2gpr5w61dlXeWpXl1WVknCSzUqx2QwTV10tBkHETxvQvkf2Exg==}
+    peerDependencies:
+      class-transformer: '>=0.4.1'
+      class-validator: '>=0.13.2'
+      reflect-metadata: ^0.1.12 || ^0.2.0
+      rxjs: ^7.1.0
+    peerDependenciesMeta:
+      class-transformer:
+        optional: true
+      class-validator:
+        optional: true
+
+  '@nestjs/core@12.0.1':
+    resolution: {integrity: sha512-rU6tAi8vDdyzHgN0iW0J4UJvziroOqzHqzlqL7phOSPizaXVEePfv+OUOsdJEOh0Qd14mslc3udOheLrAEcZow==}
+    engines: {node: '>= 20'}
+    peerDependencies:
+      '@nestjs/common': ^12.0.0
+      '@nestjs/microservices': ^12.0.0
+      '@nestjs/platform-express': ^12.0.0
+      '@nestjs/websockets': ^12.0.0
+      reflect-metadata: ^0.1.12 || ^0.2.0
+      rxjs: ^7.1.0
+    peerDependenciesMeta:
+      '@nestjs/microservices':
+        optional: true
+      '@nestjs/platform-express':
+        optional: true
+      '@nestjs/websockets':
+        optional: true
+
+  '@nestjs/platform-express@12.0.1':
+    resolution: {integrity: sha512-nF8bRgROptMyixYBfiJUAsjj2o9k13zxAjUKYaqHTPk8mTSd+gk7hXz6NykXNrfHWmMEYC9RttQlMUdMHNTbuA==}
+    peerDependencies:
+      '@nestjs/common': ^12.0.0
+      '@nestjs/core': ^12.0.0
+
+  '@next/env@16.3.3':
+    resolution: {integrity: sha512-U2eYQRwXj+dsqxV79zFqExDdatnNY/ZWc2nsJU1p/OgT7fd3dXwlF6OjYaFQCfMoeTA19PWq+wVmYgimVA+V+g==}
+
+  '@next/swc-darwin-arm64@16.3.3':
+    resolution: {integrity: sha512-8Hiv32QJPwdV6KYJ8meR9SBA061tQqnIKTJDocvOXlEQqib0xMFpzArosuffFUUc0sslbh7QQ8a3Yey1QV8EIw==}
+    engines: {node: '>= 10'}
+    cpu: [arm64]
+    os: [darwin]
+
+  '@next/swc-darwin-x64@16.3.3':
+    resolution: {integrity: sha512-A1lgKgwVchRYmSe467zdwhxT9040dd8lH+o65sL5Jet8fjB4kegw/rDyPIpYVRb6jAqwXFOJpjIXJLxQKLiE3A==}
+    engines: {node: '>= 10'}
+    cpu: [x64]
+    os: [darwin]
+
+  '@next/swc-linux-arm64-gnu@16.3.3':
+    resolution: {integrity: sha512-bf0FIssMFueU2dm7vQEWWxk0c8UjKTdW0yzuh0sQsD8pf1+KCLDdaqhYZNMYGmXwEOiHAUzgBKudovIlcvvBjg==}
+    engines: {node: '>= 10'}
+    cpu: [arm64]
+    os: [linux]
+    libc: [glibc]
+
+  '@next/swc-linux-arm64-musl@16.3.3':
+    resolution: {integrity: sha512-W7viwCk9JY/cAkdz/A273rd5bb3RgT/IHwR7Upv90tunjBWNtAAhGhoecHh+teRNRSinuAFmE+l7fwZ4YKkrXg==}
+    engines: {node: '>= 10'}
+    cpu: [arm64]
+    os: [linux]
+    libc: [musl]
+
+  '@next/swc-linux-x64-gnu@16.3.3':
+    resolution: {integrity: sha512-0W46zw1N3ODpI6n0GeivHvvob1pooozgZVqy65k0mh4/7vr+FbY9+WpHzNVXjHipJf/A3FDheBG19H1s5A25rA==}
+    engines: {node: '>= 10'}
+    cpu: [x64]
+    os: [linux]
+    libc: [glibc]
+
+  '@next/swc-linux-x64-musl@16.3.3':
+    resolution: {integrity: sha512-H4mBso8ZTMBPtdT0PN0pBx2ayTvQuTuvS6qT13d77yVFJXAPCxkyIhLTmdMaGTJs0krQYI/qpzdHijCeihXhbg==}
+    engines: {node: '>= 10'}
+    cpu: [x64]
+    os: [linux]
+    libc: [musl]
+
+  '@next/swc-win32-arm64-msvc@16.3.3':
+    resolution: {integrity: sha512-cTMUJpcEGmeywofCUfhR+rSsoE33+rVPnPEYNTNdLNlsOeEg/vktOsKUSTb28vUGqD2jkm4Zaskcwn7OCI6FQg==}
+    engines: {node: '>= 10'}
+    cpu: [arm64]
+    os: [win32]
+
+  '@next/swc-win32-x64-msvc@16.3.3':
+    resolution: {integrity: sha512-2VR4cTBzHXaBjnGsuH6GyJjENzQOmHeAh11uY1iUhjm3j5dEUrVJuUj+VL78jaGi/Dik8xS76zEj18BsFhlVZQ==}
+    engines: {node: '>= 10'}
+    cpu: [x64]
+    os: [win32]
+
+  '@standard-schema/spec@1.1.0':
+    resolution: {integrity: sha512-l2aFy5jALhniG5HgqrD6jXLi/rUWrKvqN/qJx6yoJsgKhblVd+iqqU4RCXavm/jPityDo5TCvKMnpjKnOriy0w==}
+
+  '@swc/helpers@0.5.23':
+    resolution: {integrity: sha512-5lSsMOTXURePglDfvuAQUqkGek9Hg2kksOYay2m0+XR++b2NWYL/4sWyuvVBIs8oKnJaxkdi9whaL/sqN13afw==}
+
+  '@tokenizer/inflate@0.4.1':
+    resolution: {integrity: sha512-2mAv+8pkG6GIZiF1kNg1jAjh27IDxEPKwdGul3snfztFerfPGI1LjDezZp3i7BElXompqEtPmoPx6c2wgtWsOA==}
+    engines: {node: '>=18'}
+
+  '@tokenizer/token@0.3.0':
+    resolution: {integrity: sha512-OvjF+z51L3ov0OyAU0duzsYuvO01PH7x4t6DJx+guahgTnBHkhJdG7soQeTSFLWN3efnHyibZ4Z8l2EuWwJN3A==}
+
+  '@turbo/darwin-64@2.10.12':
+    resolution: {integrity: sha512-9nKgKoF6ZOUsM+or0OtNf+TTJSfGvDNP7ZFv/ZGWVwOSCkumyctQiTeHwB4UNljHTnC41AqylgbunLDHoccNrA==}
+    cpu: [x64]
+    os: [darwin]
+
+  '@turbo/darwin-arm64@2.10.12':
+    resolution: {integrity: sha512-H4Elb1jqTZVeIC9bbcNwjSzemZ6RegoTOVHeuV5Osirt2Z8UguTyisMEkvZjPVZgMeN9J4ERZBFad40tFnkb7w==}
+    cpu: [arm64]
+    os: [darwin]
+
+  '@turbo/linux-64@2.10.12':
+    resolution: {integrity: sha512-lr7KIotukvjZwEXiFSYAeOH3BWzjFVBbSzTbv0fuGFsNukYyH0+g1hB5ecqnJkgkYU+KHEMG1edOhnjiKON1wQ==}
+    cpu: [x64]
+    os: [android, linux]
+
+  '@turbo/linux-arm64@2.10.12':
+    resolution: {integrity: sha512-f0pZDTtvzB5SuNwuXBaKbZHUCMCukgc8nMlHEuvLmj91Fzec+MEbr3cAvGNor5htEDqZnO6Lxt9N/GPI/77oGA==}
+    cpu: [arm64]
+    os: [android, linux]
+
+  '@turbo/windows-64@2.10.12':
+    resolution: {integrity: sha512-SDOueJRjS/QcykWf2KCRtTLmIl5YMKsLbXkXQGhDwcTXvKXZiS5ih5lBl/gkwZIpYFjqA/rAlfMzlAFcVHNe0g==}
+    cpu: [x64]
+    os: [win32]
+
+  '@turbo/windows-arm64@2.10.12':
+    resolution: {integrity: sha512-0i0mVUa4kKk+/B3RwEwPMf9CB+T7ul56hn5FFHNA4VUNTOoLBEd6aNf3FaKfCatDNZ6cicCEf6if9QUTVyzzcA==}
+    cpu: [arm64]
+    os: [win32]
+
+  '@types/body-parser@1.19.6':
+    resolution: {integrity: sha512-HLFeCYgz89uk22N5Qg3dvGvsv46B8GLvKKo1zKG4NybA8U2DiEO3w9lqGg29t/tfLRJpJ6iQxnVw4OnB7MoM9g==}
+
+  '@types/connect@3.4.38':
+    resolution: {integrity: sha512-K6uROf1LD88uDQqJCktA4yzL1YYAK6NgfsI0v/mTgyPKWsX1CnJ0XPSDhViejru1GcRkLWb8RlzFYJRqGUbaug==}
+
+  '@types/express-serve-static-core@5.1.3':
+    resolution: {integrity: sha512-dPfW8NFiOF4wOHc7+N/QSxlY9cfSsenewGbAz8C8U/MULPd/YZ27LvJUIlzaXie7e6Ove9YunJGgC9tbHD2cKw==}
+
+  '@types/express@5.0.6':
+    resolution: {integrity: sha512-sKYVuV7Sv9fbPIt/442koC7+IIwK5olP1KWeD88e/idgoJqDm3JV/YUiPwkoKK92ylff2MGxSz1CSjsXelx0YA==}
+
+  '@types/http-errors@2.0.5':
+    resolution: {integrity: sha512-r8Tayk8HJnX0FztbZN7oVqGccWgw98T/0neJphO91KkmOzug1KkofZURD4UaD5uH8AqcFLfdPErnBod0u71/qg==}
+
+  '@types/node@26.4.0':
+    resolution: {integrity: sha512-faiGnoIrLH/V8cibOMEAZ8pMw6oXqSukl29ra4mN8GdaB2ZewzeaLj+INpV5N+Z1eKWzY+IzaIZH2EIR6YZRNQ==}
+
+  '@types/qs@6.15.1':
+    resolution: {integrity: sha512-GZHUBZR9hckSUhrxmp1nG6NwdpM9fCunJwyThLW1X3AyHgd9IlHb6VANpQQqDr2o/qQp6McZ3y/IA2rVzKzSbw==}
+
+  '@types/range-parser@1.2.7':
+    resolution: {integrity: sha512-hKormJbkJqzQGhziax5PItDUTMAM9uE2XXQmM37dyd4hVM+5aVl7oVxMVUiVQn2oCQFN/LKCZdvSM0pFRqbSmQ==}
+
+  '@types/react-dom@19.2.5':
+    resolution: {integrity: sha512-fMPwH9v7r/pp43yUd2/Mbiex5KouJwwR3dzHkhLREUC6764VyDsqxhAxv6OFEYR1RhjOyD1naqba8ECDBe7ZQg==}
+    peerDependencies:
+      '@types/react': ^19.2.0
+
+  '@types/react@19.2.18':
+    resolution: {integrity: sha512-AnzbBERsrLKtk2XSfTbYRLjQPdy116Sty4q+T+Bp3IC4l6jNBvreVPAHmpq9qhXQM7CXZPjLVmGMw9sy+hxQ3w==}
+
+  '@types/send@1.2.1':
+    resolution: {integrity: sha512-arsCikDvlU99zl1g69TcAB3mzZPpxgw0UQnaHeC1Nwb015xp8bknZv5rIfri9xTOcMuaVgvabfIRA7PSZVuZIQ==}
+
+  '@types/serve-static@2.2.0':
+    resolution: {integrity: sha512-8mam4H1NHLtu7nmtalF7eyBH14QyOASmcxHhSfEoRyr0nP/YdoesEtU+uSRvMe96TW/HPTtkoKqQLl53N7UXMQ==}
+
+  '@typescript/typescript-aix-ppc64@7.0.2':
+    resolution: {integrity: sha512-MTKKkWB7p/0E9xi1d1tHtZ5PiLkGEMIq88pK2CubZjOsLtYTLqhgIgi6zepFa+9GHZ6h05NMCkQxGKiPXMxXtQ==}
+    engines: {node: '>=16.20.0'}
+    cpu: [ppc64]
+    os: [aix]
+
+  '@typescript/typescript-darwin-arm64@7.0.2':
+    resolution: {integrity: sha512-gowzar9MwS/aRWp6f3a4KUqzRjAZjOsmGNCM6LcTgXum+dBfgsBVMN+AgvOCCbguXyick6LJhpBszxMebJ8syA==}
+    engines: {node: '>=16.20.0'}
+    cpu: [arm64]
+    os: [darwin]
+
+  '@typescript/typescript-darwin-x64@7.0.2':
+    resolution: {integrity: sha512-SZ9xZInqApNlNGc9s0W1VSsktYSOe9cFqNOIqmN1Gs8SmkjKZYFt017G4VwPxASInODuAdbTW7sXiFUf893RgA==}
+    engines: {node: '>=16.20.0'}
+    cpu: [x64]
+    os: [darwin]
+
+  '@typescript/typescript-freebsd-arm64@7.0.2':
+    resolution: {integrity: sha512-W5NH4y/J0plIIS5b2xvTEkU7JFxyqdMAOgf+Ilhl0vHQXKO5dZoxd+C/jEtq56c4F3wk71RB4BMRQ2XdI+bwYQ==}
+    engines: {node: '>=16.20.0'}
+    cpu: [arm64]
+    os: [freebsd]
+
+  '@typescript/typescript-freebsd-x64@7.0.2':
+    resolution: {integrity: sha512-UMGDx5sTpzNw3WiPebH7l90IWfJggEd+egHt/q6p7/Cm3zqoV7VxkGXt+3DxPIw8CcmvAB0j3sVVfbhX+M4Tpw==}
+    engines: {node: '>=16.20.0'}
+    cpu: [x64]
+    os: [freebsd]
+
+  '@typescript/typescript-linux-arm64@7.0.2':
+    resolution: {integrity: sha512-Qh4eU4/y3yDjnfjjyPYihMj5/ODIlmt+Bzu17OI+fiSRDW57QmU5SiN63exPRNJPKUzcc1INa1NXdrJ+MqHjUQ==}
+    engines: {node: '>=16.20.0'}
+    cpu: [arm64]
+    os: [linux]
+
+  '@typescript/typescript-linux-arm@7.0.2':
+    resolution: {integrity: sha512-gffT3xPz9sR7j/YJExkyPntrI0P2EP9XbOyWzth2/Gs0RstK+90RBcO0ncXoXy/beYll1SXw846Nf2zdnEz0QQ==}
+    engines: {node: '>=16.20.0'}
+    cpu: [arm]
+    os: [linux]
+
+  '@typescript/typescript-linux-loong64@7.0.2':
+    resolution: {integrity: sha512-uEHck9i8hoAzXPiYRib1O7miOnz23SxIeVl6F4LXox+qov1K35jHcEW6VHKvZI+pyvl7fZEP4MCU5LYvIq1GuQ==}
+    engines: {node: '>=16.20.0'}
+    cpu: [loong64]
+    os: [linux]
+
+  '@typescript/typescript-linux-mips64el@7.0.2':
+    resolution: {integrity: sha512-R4KvAMnE43W5Qeqb0Ly56O3mWMWIAgsMyz36DCaycd5nbg/9kzm0liw3JocfRqyJY0KPmzFjbswozXyW0DnIYA==}
+    engines: {node: '>=16.20.0'}
+    cpu: [mips64el]
+    os: [linux]
+
+  '@typescript/typescript-linux-ppc64@7.0.2':
+    resolution: {integrity: sha512-DORx5b3sd/4S7eayxm4FQv+A7CrkUIGRaHiwI8oiHTAI1fAPWhF4J0vAlkC8biAlHSVVwxMQ3tjZ2/DVbnQiiA==}
+    engines: {node: '>=16.20.0'}
+    cpu: [ppc64]
+    os: [linux]
+
+  '@typescript/typescript-linux-riscv64@7.0.2':
+    resolution: {integrity: sha512-wf0jqEDOjrPRnKwYRyyJDRo11KMbvMFrU+q4zqKyChODBzvlkbhNQfKvLxQCcwTpdDaXSHZTVuh0JoCrKCUMHQ==}
+    engines: {node: '>=16.20.0'}
+    cpu: [riscv64]
+    os: [linux]
+
+  '@typescript/typescript-linux-s390x@7.0.2':
+    resolution: {integrity: sha512-IkwJc3L7yhytWd/ewjyxNDfOmswCm9GWMJT/ue/dU4aZNbwZeYAetq42VyLmsmSjvoX7z74X6ZaYCtzAr0EuGw==}
+    engines: {node: '>=16.20.0'}
+    cpu: [s390x]
+    os: [linux]
+
+  '@typescript/typescript-linux-x64@7.0.2':
+    resolution: {integrity: sha512-EYdf2cNg7rgCWJnxCdJ+F3V39O8ihb37eHAu1LK8oAFizgTQbPOK7zHHXbPt8rX24COqODXeI3sIf0fCXG7H/A==}
+    engines: {node: '>=16.20.0'}
+    cpu: [x64]
+    os: [linux]
+
+  '@typescript/typescript-netbsd-arm64@7.0.2':
+    resolution: {integrity: sha512-+polYF4MF04aPpO5FTkHran9yUQDSXqy5GiSDKpsll5jy3l3+g9QLhpf39T+ePtefhXLOGrLl0QIjkQP6VnelA==}
+    engines: {node: '>=16.20.0'}
+    cpu: [arm64]
+    os: [netbsd]
+
+  '@typescript/typescript-netbsd-x64@7.0.2':
+    resolution: {integrity: sha512-8YIT0EHM/3dq10ZOVF/A7pc/YSMtbcecct4rWtexrnSCHOPcpC2KTLXfTCR6vDpnSiY12heNb1GiN/wu+T/FyA==}
+    engines: {node: '>=16.20.0'}
+    cpu: [x64]
+    os: [netbsd]
+
+  '@typescript/typescript-openbsd-arm64@7.0.2':
+    resolution: {integrity: sha512-APT8+ClYnuYm1u9+kgGXoMj2VzWzcymwh2gNSQVySHfkRDGOTVkoWLjCmOQSaO+PoqQ57B0flRp9SA+7GnnkzQ==}
+    engines: {node: '>=16.20.0'}
+    cpu: [arm64]
+    os: [openbsd]
+
+  '@typescript/typescript-openbsd-x64@7.0.2':
+    resolution: {integrity: sha512-yX7s+Q0Dln0Dt9tEzZsAjXXR/+ytBM7AlglaqyeMPxQszJ1JhlJdZ6jLA+IzldHtflX81em7lDao1xXu+aRRkg==}
+    engines: {node: '>=16.20.0'}
+    cpu: [x64]
+    os: [openbsd]
+
+  '@typescript/typescript-sunos-x64@7.0.2':
+    resolution: {integrity: sha512-dLJDGaLZ1D4HPQn62u1n8mBDkJREwMsAkCdkwd4Ieqw+x3TUyTsqY0YiBCtE6H6OzzgGk3iuZ3vFWRS+E8/d1g==}
+    engines: {node: '>=16.20.0'}
+    cpu: [x64]
+    os: [sunos]
+
+  '@typescript/typescript-win32-arm64@7.0.2':
+    resolution: {integrity: sha512-Gyl1Vy6OsWesLzmq+EP0Fb7b4Nid5232AvcA2SFcdYreldpNtYFFofPjnt62y9hQy7VTaZp65ICJjuAQRaVcIQ==}
+    engines: {node: '>=16.20.0'}
+    cpu: [arm64]
+    os: [win32]
+
+  '@typescript/typescript-win32-x64@7.0.2':
+    resolution: {integrity: sha512-0BQ3HkAHHlKLSp1qRvf3SUhGpGsDuhB/jgFw75guyqbxJqEaS0Cw/VFO8i2nHglJUzQCRtMMR/IBAKE3ETMC4g==}
+    engines: {node: '>=16.20.0'}
+    cpu: [x64]
+    os: [win32]
+
+  accepts@2.0.0:
+    resolution: {integrity: sha512-5cvg6CtKwfgdmVqY1WIiXKc3Q1bkRqGLi+2W/6ao+6Y7gu/RCwRuAhGEzh5B4KlszSuTLgZYuqFqo5bImjNKng==}
+    engines: {node: '>= 0.6'}
+
+  append-field@1.0.0:
+    resolution: {integrity: sha512-klpgFSWLW1ZEs8svjfb7g4qWY0YS5imI82dTg+QahUvJ8YqAY0P10Uk8tTyh9ZGuYEZEMaeJYCF5BFuX552hsw==}
+
+  baseline-browser-mapping@2.11.20:
+    resolution: {integrity: sha512-H0ulySigv6icDJ1F7SjtdCD6PrhTpdYCmP0CactWy1+ekh0AFd0o1Wn5T8b+hnTmdBx19u9yhL6wvCylXMY7zw==}
+    engines: {node: '>=6.0.0'}
+    hasBin: true
+
+  body-parser@2.3.0:
+    resolution: {integrity: sha512-2cGmJupaNgg+QUwVLAucDuWuoMZ6EX9iHDRswZ5lsNYEmwPaRknMPCLZz07yTzVq/83p4o/wzbDZbBrTvGGTIw==}
+    engines: {node: '>=18'}
+
+  buffer-from@1.1.2:
+    resolution: {integrity: sha512-E+XQCRwSbaaiChtv6k6Dwgc+bx+Bs6vuKJHHl5kox/BaKbhiXzqQOwK4cO22yElGp2OCmjwVhT3HmxgyPGnJfQ==}
+
+  busboy@1.6.0:
+    resolution: {integrity: sha512-8SFQbg/0hQ9xy3UNTB0YEnsNBbWfhf7RtnzpL7TkBiTBRfrQ9Fxcnz7VJsleJpyp6rVLvXiuORqjlHi5q+PYuA==}
+    engines: {node: '>=10.16.0'}
+
+  bytes@3.1.2:
+    resolution: {integrity: sha512-/Nf7TyzTx6S3yRJObOAV7956r8cr2+Oj8AC5dt8wSP3BQAoeX58NoHyCU8P8zGkNXStjTSi6fzO6F0pBdcYbEg==}
+    engines: {node: '>= 0.8'}
+
+  call-bind-apply-helpers@1.0.2:
+    resolution: {integrity: sha512-Sp1ablJ0ivDkSzjcaJdxEunN5/XvksFJ2sMBFfq6x0ryhQV/2b/KwFe21cMpmHtPOSij8K99/wSfoEuTObmuMQ==}
+    engines: {node: '>= 0.4'}
+
+  call-bound@1.0.4:
+    resolution: {integrity: sha512-+ys997U96po4Kx/ABpBCqhA9EuxJaQWDQg7295H4hBphv3IZg0boBKuwYpt4YXp6MZ5AmZQnU/tyMTlRpaSejg==}
+    engines: {node: '>= 0.4'}
+
+  caniuse-lite@1.0.30001810:
+    resolution: {integrity: sha512-TITQPUkaz+aVk5GL6NhOdwk1aEaNTSDPsGFWrTuhKGtjTF70jL/Oht2W4c6rXUe5fu7Ie19VIahAXHIIiWWNeg==}
+
+  client-only@0.0.1:
+    resolution: {integrity: sha512-IV3Ou0jSMzZrd3pZ48nLkT9DA7Ag1pnPzaiQhpW7c3RbcqqzvzzVu+L8gfqMp/8IM2MQtSiqaCxrrcfu8I8rMA==}
+
+  concat-stream@2.0.0:
+    resolution: {integrity: sha512-MWufYdFw53ccGjCA+Ol7XJYpAlW6/prSMzuPOTRnJGcGzuhLn4Scrz7qf6o8bROZ514ltazcIFJZevcfbo0x7A==}
+    engines: {'0': node >= 6.0}
+
+  content-disposition@1.1.0:
+    resolution: {integrity: sha512-5jRCH9Z/+DRP7rkvY83B+yGIGX96OYdJmzngqnw2SBSxqCFPd0w2km3s5iawpGX8krnwSGmF0FW5Nhr0Hfai3g==}
+    engines: {node: '>=18'}
+
+  content-type@1.0.5:
+    resolution: {integrity: sha512-nTjqfcBFEipKdXCv4YDQWCfmcLZKm81ldF0pAopTvyrFGVbcR6P/VAAd5G7N+0tTr8QqiU0tFadD6FK4NtJwOA==}
+    engines: {node: '>= 0.6'}
+
+  content-type@2.1.0:
+    resolution: {integrity: sha512-mj7UPXE0jaqaOsukNZRUEfEi2AcL7C/vwmwcHV0O97eO1E1pxBZuyjlZrx5seTaNBg1U6+o35wpa35Qfcc+7ag==}
+    engines: {node: '>=18'}
+
+  cookie-signature@1.2.2:
+    resolution: {integrity: sha512-D76uU73ulSXrD1UXF4KE2TMxVVwhsnCgfAyTg9k8P6KGZjlXKrOLe4dJQKI3Bxi5wjesZoFXJWElNWBjPZMbhg==}
+    engines: {node: '>=6.6.0'}
+
+  cookie@0.7.2:
+    resolution: {integrity: sha512-yki5XnKuf750l50uGTllt6kKILY4nQ1eNIQatoXEByZ5dWgnKqbnqmTrBE5B4N7lrMJKQ2ytWMiTO2o0v6Ew/w==}
+    engines: {node: '>= 0.6'}
+
+  cors@2.8.6:
+    resolution: {integrity: sha512-tJtZBBHA6vjIAaF6EnIaq6laBBP9aq/Y3ouVJjEfoHbRBcHBAHYcMh/w8LDrk2PvIMMq8gmopa5D4V8RmbrxGw==}
+    engines: {node: '>= 0.10'}
+
+  csstype@3.2.3:
+    resolution: {integrity: sha512-z1HGKcYy2xA8AGQfwrn0PAy+PB7X/GSj3UVJW9qKyn43xWa+gl5nXmU4qqLMRzWVLFC8KusUX8T/0kCiOYpAIQ==}
+
+  debug@4.4.3:
+    resolution: {integrity: sha512-RGwwWnwQvkVfavKVt22FGLw+xYSdzARwm0ru6DhTVA3umU5hZc28V3kO4stgYryrTlLpuvgI9GiijltAjNbcqA==}
+    engines: {node: '>=6.0'}
+    peerDependencies:
+      supports-color: '*'
+    peerDependenciesMeta:
+      supports-color:
+        optional: true
+
+  depd@2.0.0:
+    resolution: {integrity: sha512-g7nH6P6dyDioJogAAGprGpCtVImJhpPk/roCzdb3fIh61/s/nPsfR6onyMwkCAR/OlC3yBC0lESvUoQEAssIrw==}
+    engines: {node: '>= 0.8'}
+
+  detect-libc@2.1.2:
+    resolution: {integrity: sha512-Btj2BOOO83o3WyH59e8MgXsxEQVcarkUOpEYrubB0urwnN10yQ364rsiByU11nZlqWYZm05i/of7io4mzihBtQ==}
+    engines: {node: '>=8'}
+
+  dunder-proto@1.0.1:
+    resolution: {integrity: sha512-KIN/nDJBQRcXw0MLVhZE9iQHmG68qAVIBg9CqmUYjmQIhgij9U5MFvrqkUL5FbtyyzZuOeOt0zdeRe4UY7ct+A==}
+    engines: {node: '>= 0.4'}
+
+  ee-first@1.1.1:
+    resolution: {integrity: sha512-WMwm9LhRUo+WUaRN+vRuETqG89IgZphVSNkdFgeb6sS/E4OrDIN7t48CAewSHXc6C8lefD8KKfr5vY61brQlow==}
+
+  encodeurl@2.0.0:
+    resolution: {integrity: sha512-Q0n9HRi4m6JuGIV1eFlmvJB7ZEVxu93IrMyiMsGC0lrMJMWzRgx6WGquyfQgZVb31vhGgXnfmPNNXmxnOkRBrg==}
+    engines: {node: '>= 0.8'}
+
+  es-define-property@1.0.1:
+    resolution: {integrity: sha512-e3nRfgfUZ4rNGL232gUgX06QNyyez04KdjFrF+LTRoOXmrOgFKDg4BCdsjW8EnT69eqdYGmRpJwiPVYNrCaW3g==}
+    engines: {node: '>= 0.4'}
+
+  es-errors@1.3.0:
+    resolution: {integrity: sha512-Zf5H2Kxt2xjTvbJvP2ZWLEICxA6j+hAmMzIlypy4xcBg1vKVnx89Wy0GbS+kf5cwCVFFzdCFh2XSCFNULS6csw==}
+    engines: {node: '>= 0.4'}
+
+  es-object-atoms@1.1.2:
+    resolution: {integrity: sha512-HWcBoN6NileqtSydK2FqHbS/LoDd2pqrnQHLyJzBj4kOp/ky2MWMN694xOfkK8/SnUsW2DH7EfyVlydKCsm1Zw==}
+    engines: {node: '>= 0.4'}
+
+  esbuild@0.28.2:
+    resolution: {integrity: sha512-HKVLS8dvII+xoKW9kmqxbRKrnWEXfJJr/FZhhJmiqIB0e053QNYFqOBouTMO/k5sID4MvCiUCvv8b9M4h32wIA==}
+    engines: {node: '>=18'}
+    hasBin: true
+
+  escape-html@1.0.3:
+    resolution: {integrity: sha512-NiSupZ4OeuGwr68lGIeym/ksIZMJodUGOSCZ/FSnTxcrekbvqrgdUxlJOMpijaKZVjAJrWrGs/6Jy8OMuyj9ow==}
+
+  etag@1.8.1:
+    resolution: {integrity: sha512-aIL5Fx7mawVa300al2BnEE4iNvo1qETxLrPI/o05L7z6go7fCw1J6EQmbK4FmJ2AS7kgVF/KEZWufBfdClMcPg==}
+    engines: {node: '>= 0.6'}
+
+  express@5.2.1:
+    resolution: {integrity: sha512-hIS4idWWai69NezIdRt2xFVofaF4j+6INOpJlVOLDO8zXGpUVEVzIYk12UUi2JzjEzWL3IOAxcTubgz9Po0yXw==}
+    engines: {node: '>= 18'}
+
+  fast-safe-stringify@2.1.1:
+    resolution: {integrity: sha512-W+KJc2dmILlPplD/H4K9l9LcAHAfPtP6BY84uVLXQ6Evcz9Lcg33Y2z1IVblT6xdY54PXYVHEv+0Wpq8Io6zkA==}
+
+  file-type@22.0.2:
+    resolution: {integrity: sha512-0H8TsCUGBLx+V5adH3EY52hTAcyLKbV1D4gq5cIOJ6DnQAHeV9Z2Hhuc5CoBX4YmvB2oL+JIC84z0qO7JsCoNw==}
+    engines: {node: '>=22'}
+
+  finalhandler@2.1.1:
+    resolution: {integrity: sha512-S8KoZgRZN+a5rNwqTxlZZePjT/4cnm0ROV70LedRHZ0p8u9fRID0hJUZQpkKLzro8LfmC8sx23bY6tVNxv8pQA==}
+    engines: {node: '>= 18.0.0'}
+
+  forwarded@0.2.0:
+    resolution: {integrity: sha512-buRG0fpBtRHSTCOASe6hD258tEubFoRLb4ZNA6NxMVHNw2gOcwHo9wyablzMzOA5z9xA9L1KNjk/Nt6MT9aYow==}
+    engines: {node: '>= 0.6'}
+
+  fresh@2.0.0:
+    resolution: {integrity: sha512-Rx/WycZ60HOaqLKAi6cHRKKI7zxWbJ31MhntmtwMoaTeF7XFH9hhBp8vITaMidfljRQ6eYWCKkaTK+ykVJHP2A==}
+    engines: {node: '>= 0.8'}
+
+  fsevents@2.3.3:
+    resolution: {integrity: sha512-5xoDfX+fL7faATnagmWPpbFtwh/R77WmMMqqHGS65C3vvB0YHrgF+B1YmZ3441tMj5n63k0212XNoJwzlhffQw==}
+    engines: {node: ^8.16.0 || ^10.6.0 || >=11.0.0}
+    os: [darwin]
+
+  function-bind@1.1.2:
+    resolution: {integrity: sha512-7XHNxH7qX9xG5mIwxkhumTox/MIRNcOgDrxWsMt2pAr23WHp6MrRlN7FBSFpCpr+oVO0F744iUgR82nJMfG2SA==}
+
+  get-intrinsic@1.3.0:
+    resolution: {integrity: sha512-9fSjSaos/fRIVIp+xSJlE6lfwhES7LNtKaCBIamHsjr2na1BiABJPo0mOjjz8GJDURarmCPGqaiVg5mfjb98CQ==}
+    engines: {node: '>= 0.4'}
+
+  get-proto@1.0.1:
+    resolution: {integrity: sha512-sTSfBjoXBp89JvIKIefqw7U2CCebsc74kiY6awiGogKtoSGbgjYE/G/+l9sF3MWFPNc9IcoOC4ODfKHfxFmp0g==}
+    engines: {node: '>= 0.4'}
+
+  gopd@1.2.0:
+    resolution: {integrity: sha512-ZUKRh6/kUFoAiTAtTYPZJ3hw9wNxx+BIBOijnlG9PnrJsCcSjs1wyyD6vJpaYtgnzDrKYRSqf3OO6Rfa93xsRg==}
+    engines: {node: '>= 0.4'}
+
+  has-symbols@1.1.0:
+    resolution: {integrity: sha512-1cDNdwJ2Jaohmb3sg4OmKaMBwuC48sYni5HUw2DvsC8LjGTLK9h+eb1X6RyuOHe4hT0ULCW68iomhjUoKUqlPQ==}
+    engines: {node: '>= 0.4'}
+
+  hasown@2.0.4:
+    resolution: {integrity: sha512-T2UbfbBEF32wiepXIsMlTW9+dDYC6wMh/t/vYA4tuOMKqWz/n3vr1NFSxQiyP+zk2mXsoMA/i/7qV6LKut1t1A==}
+    engines: {node: '>= 0.4'}
+
+  http-errors@2.0.1:
+    resolution: {integrity: sha512-4FbRdAX+bSdmo4AUFuS0WNiPz8NgFt+r8ThgNWmlrjQjt1Q7ZR9+zTlce2859x4KSXrwIsaeTqDoKQmtP8pLmQ==}
+    engines: {node: '>= 0.8'}
+
+  iconv-lite@0.7.3:
+    resolution: {integrity: sha512-IKXpvIzjnC9XTAUbVBcMfGS0EPaIXtW6v+zr+RRp+hqULEpo0owZax6wyRwPOJbWbzjYspQwusTsfVr0ifh4uQ==}
+    engines: {node: '>=0.10.0'}
+
+  ieee754@1.2.1:
+    resolution: {integrity: sha512-dcyqhDvX1C46lXZcVqCpK+FtMRQVdIMN6/Df5js2zouUsqG7I6sFxitIC+7KYK29KdXOLHdu9zL4sFnoVQnqaA==}
+
+  inherits@2.0.4:
+    resolution: {integrity: sha512-k/vGaX4/Yla3WzyMCvTQOXYeIHvqOKtnqBduzTHpzpQZzAskKMhZ2K+EnBiSM9zGSoIFeMpXKxa4dYeZIQqewQ==}
+
+  ipaddr.js@1.9.1:
+    resolution: {integrity: sha512-0KI/607xoxSToH7GjN1FfSbLoU0+btTicjsQSWQlh/hZykN8KpmMf7uYwPW3R+akZ6R/w18ZlXSHBYXiYUPO3g==}
+    engines: {node: '>= 0.10'}
+
+  is-promise@4.0.0:
+    resolution: {integrity: sha512-hvpoI6korhJMnej285dSg6nu1+e6uxs7zG3BYAm5byqDsgJNWwxzM6z6iZiAgQR4TJ30JmBTOwqZUw3WlyH3AQ==}
+
+  iterare@1.2.1:
+    resolution: {integrity: sha512-RKYVTCjAnRthyJes037NX/IiqeidgN1xc3j1RjFfECFp28A1GVwK9nA+i0rJPaHqSZwygLzRnFlzUuHFoWWy+Q==}
+    engines: {node: '>=6'}
+
+  load-esm@1.0.3:
+    resolution: {integrity: sha512-v5xlu8eHD1+6r8EHTg6hfmO97LN8ugKtiXcy5e6oN72iD2r6u0RPfLl6fxM+7Wnh2ZRq15o0russMst44WauPA==}
+    engines: {node: '>=13.2.0'}
+
+  math-intrinsics@1.1.0:
+    resolution: {integrity: sha512-/IXtbwEk5HTPyEwyKX6hGkYXxM9nbj64B+ilVJnC/R6B0pH5G4V3b0pVbL7DBj4tkhBAppbQUlf6F6Xl9LHu1g==}
+    engines: {node: '>= 0.4'}
+
+  media-typer@0.3.0:
+    resolution: {integrity: sha512-dq+qelQ9akHpcOl/gUVRTxVIOkAJ1wR3QAvb4RsVjS8oVoFjDGTc679wJYmUmknUF5HwMLOgb5O+a3KxfWapPQ==}
+    engines: {node: '>= 0.6'}
+
+  media-typer@1.1.1:
+    resolution: {integrity: sha512-yz3xRaG20c6/BOzvYoDaGtPmGscs7YivItZEEqe6GbwNfHuxu9YNmvnEkMzKldAGY4/80pRcQRZSEnhquk9XuQ==}
+    engines: {node: '>= 0.8'}
+
+  merge-descriptors@2.0.0:
+    resolution: {integrity: sha512-Snk314V5ayFLhp3fkUREub6WtjBfPdCPY1Ln8/8munuLuiYhsABgBVWsozAG+MWMbVEvcdcpbi9R7ww22l9Q3g==}
+    engines: {node: '>=18'}
+
+  mime-db@1.52.0:
+    resolution: {integrity: sha512-sPU4uV7dYlvtWJxwwxHD0PuihVNiE7TyAbQ5SWxDCB9mUYvOgroQOwYQQOKPJ8CIbE+1ETVlOoK1UC2nU3gYvg==}
+    engines: {node: '>= 0.6'}
+
+  mime-db@1.54.0:
+    resolution: {integrity: sha512-aU5EJuIN2WDemCcAp2vFBfp/m4EAhWJnUNSSw0ixs7/kXbd6Pg64EmwJkNdFhB8aWt1sH2CTXrLxo/iAGV3oPQ==}
+    engines: {node: '>= 0.6'}
+
+  mime-types@2.1.35:
+    resolution: {integrity: sha512-ZDY+bPm5zTTF+YpCrAU9nK0UgICYPT0QtT1NZWFv4s++TNkcgVaT0g6+4R2uI4MjQjzysHB1zxuWL50hzaeXiw==}
+    engines: {node: '>= 0.6'}
+
+  mime-types@3.0.2:
+    resolution: {integrity: sha512-Lbgzdk0h4juoQ9fCKXW4by0UJqj+nOOrI9MJ1sSj4nI8aI2eo1qmvQEie4VD1glsS250n15LsWsYtCugiStS5A==}
+    engines: {node: '>=18'}
+
+  ms@2.1.3:
+    resolution: {integrity: sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==}
+
+  multer@2.2.0:
+    resolution: {integrity: sha512-6rdyFg2kLrMh9Jee7/BMPuV9lEAd7lLW2YUpF9/YxR7njyoUwwQ0ZPh3TaIY50Sw6vlyD2HW3wGOkTS4P79xrQ==}
+    engines: {node: '>= 10.16.0'}
+
+  nanoid@3.3.18:
+    resolution: {integrity: sha512-DTg4MJbGMWkfi6VZFdNt2/caMbQy4Ou+Op/hJQvGEWcnVfoA1QA+xzRKAzw9jD6+GVOOeYr/mIcuDSdug6F6+w==}
+    engines: {node: ^10 || ^12 || ^13.7 || ^14 || >=15.0.1}
+    hasBin: true
+
+  negotiator@1.1.0:
+    resolution: {integrity: sha512-NMPBRMJgiQHjbd8phG3Vebdx4kZ1H121rbl5IkMqeOsahptB9BKo/d7oJ3zTXqTgagn2bWlNSXkh0QUGM31RYg==}
+    engines: {node: '>=18'}
+
+  next@16.3.3:
+    resolution: {integrity: sha512-tuRTx1nQ/yVw83cwJBo9F+njGUgMn3UHQycreWHB8XsStvvAh1AthbI8/4IpKnFaF58F+iSiHejYOlMQ/eq83g==}
+    engines: {node: '>=20.9.0'}
+    hasBin: true
+    peerDependencies:
+      '@opentelemetry/api': ^1.1.0
+      '@playwright/test': ^1.51.1
+      babel-plugin-react-compiler: '*'
+      react: ^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0
+      react-dom: ^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0
+      sass: ^1.3.0
+    peerDependenciesMeta:
+      '@opentelemetry/api':
+        optional: true
+      '@playwright/test':
+        optional: true
+      babel-plugin-react-compiler:
+        optional: true
+      sass:
+        optional: true
+
+  object-assign@4.1.1:
+    resolution: {integrity: sha512-rJgTQnkUnH1sFw8yT6VSU3zD3sWmu6sZhIseY8VX+GRu3P6F7Fu+JNDoXfklElbLJSnc3FUQHVe4cU5hj+BcUg==}
+    engines: {node: '>=0.10.0'}
+
+  object-inspect@1.13.4:
+    resolution: {integrity: sha512-W67iLl4J2EXEGTbfeHCffrjDfitvLANg0UlX3wFUUSTx92KXRFegMHUVgSqE+wvhAbi4WqjGg9czysTV2Epbew==}
+    engines: {node: '>= 0.4'}
+
+  on-finished@2.4.1:
+    resolution: {integrity: sha512-oVlzkg3ENAhCk2zdv7IJwd/QUD4z2RxRwpkcGY8psCVcCYZNq4wYnVWALHM+brtuJjePWiYF/ClmuDr8Ch5+kg==}
+    engines: {node: '>= 0.8'}
+
+  once@1.4.0:
+    resolution: {integrity: sha512-lNaJgI+2Q5URQBkccEKHTQOPaXdUxnZZElQTZY0MFUAuaEqe1E+Nyvgdz/aIyNi6Z9MzO5dv1H8n58/GELp3+w==}
+
+  parseurl@1.3.3:
+    resolution: {integrity: sha512-CiyeOxFT/JZyN5m0z9PfXw4SCBJ6Sygz1Dpl0wqjlhDEGGBP1GnsUVEL0p63hoG1fcj3fHynXi9NYO4nWOL+qQ==}
+    engines: {node: '>= 0.8'}
+
+  path-to-regexp@8.4.2:
+    resolution: {integrity: sha512-qRcuIdP69NPm4qbACK+aDogI5CBDMi1jKe0ry5rSQJz8JVLsC7jV8XpiJjGRLLol3N+R5ihGYcrPLTno6pAdBA==}
+
+  picocolors@1.1.1:
+    resolution: {integrity: sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==}
+
+  postcss@8.5.23:
+    resolution: {integrity: sha512-g50586zr4bZmwFiTlflMu8E0bDTb5I5gertgwAKmsdUlTQIhZtunzUlD1WSzwcVWPoAVpsrA6vlfCD7oXvRwgg==}
+    engines: {node: ^10 || ^12 || >=14}
+
+  proxy-addr@2.0.7:
+    resolution: {integrity: sha512-llQsMLSUDUPT44jdrU/O37qlnifitDP+ZwrmmZcoSKyLKvtZxpyV0n2/bD/N4tBAAZ/gJEdZU7KMraoK1+XYAg==}
+    engines: {node: '>= 0.10'}
+
+  qs@6.16.0:
+    resolution: {integrity: sha512-h6fhOIaRrID2CbEY2fqs+7t+UXZo+MLAnU5gRIq85uFtdiUPCdsApMlHhXogKVM4HM2DVbIjGNTTYH2OcmP1vA==}
+    engines: {node: '>=0.6'}
+
+  range-parser@1.3.0:
+    resolution: {integrity: sha512-hek2mFQpPuI4E1BBKrSto+BU3e3x4xuarsbiwr3+lf7p44juvFMV0XFWQAP3xUyqXA4RrXLIoaSUGbSt056ZMw==}
+    engines: {node: '>= 0.6'}
+
+  raw-body@3.0.2:
+    resolution: {integrity: sha512-K5zQjDllxWkf7Z5xJdV0/B0WTNqx6vxG70zJE4N0kBs4LovmEYWJzQGxC9bS9RAKu3bgM40lrd5zoLJ12MQ5BA==}
+    engines: {node: '>= 0.10'}
+
+  react-dom@19.2.8:
+    resolution: {integrity: sha512-rVprimfGBG3DR+Tq0IQG2DT5PxKth1WIGDmj5yPmlzr4YBe7uyE+Du4oVqTDXZSHGGGXRtTJEGSSePyQCMBglQ==}
+    peerDependencies:
+      react: ^19.2.8
+
+  react@19.2.8:
+    resolution: {integrity: sha512-PWaYA1L/q9u2u7xYQi+Y3L3Yfnie7XyLeaJICV1MGD6LprsBxcAqGjYyr0eY3p+QdsA+x/Irkt4Qif8D63+Sbw==}
+    engines: {node: '>=0.10.0'}
+
+  readable-stream@3.6.2:
+    resolution: {integrity: sha512-9u/sniCrY3D5WdsERHzHE4G2YCXqoG5FTHUiCC4SIbr6XcLZBY05ya9EKjYek9O5xOAwjGq+1JdGBAS7Q9ScoA==}
+    engines: {node: '>= 6'}
+
+  reflect-metadata@0.2.2:
+    resolution: {integrity: sha512-urBwgfrvVP/eAyXx4hluJivBKzuEbSQs9rKWCrCkbSxNv8mxPcUZKeuoF3Uy4mJl3Lwprp6yy5/39VWigZ4K6Q==}
+
+  router@2.2.0:
+    resolution: {integrity: sha512-nLTrUKm2UyiL7rlhapu/Zl45FwNgkZGaCpZbIHajDYgwlJCOzLSk+cIPAnsEqV955GjILJnKbdQC1nVPz+gAYQ==}
+    engines: {node: '>= 18'}
+
+  rxjs@7.8.2:
+    resolution: {integrity: sha512-dhKf903U/PQZY6boNNtAGdWbG85WAbjT/1xYoZIC7FAY0yWapOBQVsVrDl58W86//e1VpMNBtRV4MaXfdMySFA==}
+
+  safe-buffer@5.2.1:
+    resolution: {integrity: sha512-rp3So07KcdmmKbGvgaNxQSJr7bGVSVk5S9Eq1F+ppbRo70+YeaDxkw5Dd8NPN+GD6bjnYm2VuPuCXmpuYvmCXQ==}
+
+  safer-buffer@2.1.2:
+    resolution: {integrity: sha512-YZo3K82SD7Riyi0E1EQPojLz7kpepnSQI9IyPbHHg1XXXevb5dJI7tpyN2ADxGcQbHG7vcyRHk0cbwqcQriUtg==}
+
+  scheduler@0.27.0:
+    resolution: {integrity: sha512-eNv+WrVbKu1f3vbYJT/xtiF5syA5HPIMtf9IgY/nKg0sWqzAUEvqY/xm7OcZc/qafLx/iO9FgOmeSAp4v5ti/Q==}
+
+  semver@7.8.5:
+    resolution: {integrity: sha512-Y7/KDsb8LjooZpwaqGyulO6DQlksgCncchHGk+sZIY4SBvUocMBEFH5Ur1fI4dV+Jvl0w6cjvucaIi40puRioA==}
+    engines: {node: '>=10'}
+    hasBin: true
+
+  send@1.2.1:
+    resolution: {integrity: sha512-1gnZf7DFcoIcajTjTwjwuDjzuz4PPcY2StKPlsGAQ1+YH20IRVrBaXSWmdjowTJ6u8Rc01PoYOGHXfP1mYcZNQ==}
+    engines: {node: '>= 18'}
+
+  serve-static@2.2.1:
+    resolution: {integrity: sha512-xRXBn0pPqQTVQiC8wyQrKs2MOlX24zQ0POGaj0kultvoOCstBQM5yvOhAVSUwOMjQtTvsPWoNCHfPGwaaQJhTw==}
+    engines: {node: '>= 18'}
+
+  setprototypeof@1.2.0:
+    resolution: {integrity: sha512-E5LDX7Wrp85Kil5bhZv46j8jOeboKq5JMmYM3gVGdGH8xFpPWXUMsNrlODCrkoxMEeNi/XZIwuRvY4XNwYMJpw==}
+
+  sharp@0.35.4:
+    resolution: {integrity: sha512-n++8XWcj+jCOr2IOl7h8LbKnGBDY4aPbmprMONBNFdn0ImXqpGVv5zliDs0V9HbmbCQLpbuo2ej9rAoOQTvMDA==}
+    engines: {node: '>=20.9.0'}
+    peerDependencies:
+      '@types/node': '*'
+    peerDependenciesMeta:
+      '@types/node':
+        optional: true
+
+  side-channel-list@1.0.1:
+    resolution: {integrity: sha512-mjn/0bi/oUURjc5Xl7IaWi/OJJJumuoJFQJfDDyO46+hBWsfaVM65TBHq2eoZBhzl9EchxOijpkbRC8SVBQU0w==}
+    engines: {node: '>= 0.4'}
+
+  side-channel-map@1.0.1:
+    resolution: {integrity: sha512-VCjCNfgMsby3tTdo02nbjtM/ewra6jPHmpThenkTYh8pG9ucZ/1P8So4u4FGBek/BjpOVsDCMoLA/iuBKIFXRA==}
+    engines: {node: '>= 0.4'}
+
+  side-channel-weakmap@1.0.2:
+    resolution: {integrity: sha512-WPS/HvHQTYnHisLo9McqBHOJk2FkHO/tlpvldyrnem4aeQp4hai3gythswg6p01oSoTl58rcpiFAjF2br2Ak2A==}
+    engines: {node: '>= 0.4'}
+
+  side-channel@1.1.1:
+    resolution: {integrity: sha512-6x6dK6zJdpTzF4sQeNYxwtvBzf6Eg4GtlesS94HOvTudUeyK2WXAaIfmDgsyslYrRBeFIlsi54AYsFGUuhmvrQ==}
+    engines: {node: '>= 0.4'}
+
+  source-map-js@1.2.1:
+    resolution: {integrity: sha512-UXWMKhLOwVKb728IUtQPXxfYU+usdybtUrK/8uGE8CQMvrhOpwvzDBwj0QhSL7MQc7vIsISBG8VQ8+IDQxpfQA==}
+    engines: {node: '>=0.10.0'}
+
+  statuses@2.0.2:
+    resolution: {integrity: sha512-DvEy55V3DB7uknRo+4iOGT5fP1slR8wQohVdknigZPMpMstaKJQWhwiYBACJE3Ul2pTnATihhBYnRhZQHGBiRw==}
+    engines: {node: '>= 0.8'}
+
+  streamsearch@1.1.0:
+    resolution: {integrity: sha512-Mcc5wHehp9aXz1ax6bZUyY5afg9u2rv5cqQI3mRrYkGC8rW2hM02jWuwjtL++LS5qinSyhj2QfLyNsuc+VsExg==}
+    engines: {node: '>=10.0.0'}
+
+  string_decoder@1.3.0:
+    resolution: {integrity: sha512-hkRX8U1WjJFd8LsDJ2yQ/wWWxaopEsABU1XfkM8A+j0+85JAGppt16cr1Whg6KIbb4okU6Mql6BOj+uup/wKeA==}
+
+  strtok3@10.3.5:
+    resolution: {integrity: sha512-ki4hZQfh5rX0QDLLkOCj+h+CVNkqmp/CMf8v8kZpkNVK6jGQooMytqzLZYUVYIZcFZ6yDB70EfD8POcFXiF5oA==}
+    engines: {node: '>=18'}
+
+  styled-jsx@5.1.6:
+    resolution: {integrity: sha512-qSVyDTeMotdvQYoHWLNGwRFJHC+i+ZvdBRYosOFgC+Wg1vx4frN2/RG/NA7SYqqvKNLf39P2LSRA2pu6n0XYZA==}
+    engines: {node: '>= 12.0.0'}
+    peerDependencies:
+      '@babel/core': '*'
+      babel-plugin-macros: '*'
+      react: '>= 16.8.0 || 17.x.x || ^18.0.0-0 || ^19.0.0-0'
+    peerDependenciesMeta:
+      '@babel/core':
+        optional: true
+      babel-plugin-macros:
+        optional: true
+
+  toidentifier@1.0.1:
+    resolution: {integrity: sha512-o5sSPKEkg/DIQNmH43V0/uerLrpzVedkUh8tGNvaeXpfpuwjKenlSox/2O/BTlZUtEe+JG7s5YhEz608PlAHRA==}
+    engines: {node: '>=0.6'}
+
+  token-types@6.1.2:
+    resolution: {integrity: sha512-dRXchy+C0IgK8WPC6xvCHFRIWYUbqqdEIKPaKo/AcTUNzwLTK6AH7RjdLWsEZcAN/TBdtfUw3PYEgPr5VPr6ww==}
+    engines: {node: '>=14.16'}
+
+  tslib@2.8.1:
+    resolution: {integrity: sha512-oJFu94HQb+KVduSUQL7wnpmqnfmLsOA/nAh6b6EH0wCEoK0/mPeXU6c3wKDV83MkOuHPRHtSXKKU99IBazS/2w==}
+
+  tsx@4.23.13:
+    resolution: {integrity: sha512-BL5MGkRln6aDYhb0xbQlEAGw743BaZYWdbWtdJOBriYJboKgUUYCadFp2/FpBBZquBC/ezNBn7wMMPx7FDZUDw==}
+    engines: {node: '>=18.0.0'}
+    hasBin: true
+
+  turbo@2.10.12:
+    resolution: {integrity: sha512-AswgMPnpOoaVZHrrSBejETzEbuIA69OVGwfkHwfrY0A23VjWXBANzgq9+OymWOHAIArB7D1+1z498WY8fGg1Jw==}
+    hasBin: true
+
+  type-is@1.6.18:
+    resolution: {integrity: sha512-TkRKr9sUTxEH8MdfuCSP7VizJyzRNMjj2J2do2Jr3Kym598JVdEksuzPQCnlFPW4ky9Q+iA+ma9BGm06XQBy8g==}
+    engines: {node: '>= 0.6'}
+
+  type-is@2.1.0:
+    resolution: {integrity: sha512-faYHw0anBbc/kWF3zFTEnxSFOAGUX9GFbOBthvDdLsIlEoWOFOtS0zgCiQYwIskL9iGXZL3kAXD8OoZ4GmMATA==}
+    engines: {node: '>= 18'}
+
+  typedarray@0.0.6:
+    resolution: {integrity: sha512-/aCDEGatGvZ2BIk+HmLf4ifCJFwvKFNb9/JeZPMulfgFracn9QFcAf5GO8B/mweUjSoblS5In0cWhqpfs/5PQA==}
+
+  typescript@7.0.2:
+    resolution: {integrity: sha512-8FYau96o3NKOhbjKi/qNvG/W5jhzxkbdm5sj9AbZ/5T5sWqn3hJgLfGx27sRKZWTvyzCP8dLRBTf5tBTSRVUNA==}
+    engines: {node: '>=16.20.0'}
+    hasBin: true
+
+  uid@2.0.2:
+    resolution: {integrity: sha512-u3xV3X7uzvi5b1MncmZo3i2Aw222Zk1keqLA1YkHldREkAhAqi65wuPfe7lHx8H/Wzy+8CE7S7uS3jekIM5s8g==}
+    engines: {node: '>=8'}
+
+  uint8array-extras@1.5.0:
+    resolution: {integrity: sha512-rvKSBiC5zqCCiDZ9kAOszZcDvdAHwwIKJG33Ykj43OKcWsnmcBRL09YTU4nOeHZ8Y2a7l1MgTd08SBe9A8Qj6A==}
+    engines: {node: '>=18'}
+
+  undici-types@8.3.0:
+    resolution: {integrity: sha512-j375ScV60dom+YkPFIfTLcOiPxkN/buHz5GobjLhixFuANaNs3C9l4GmrWqejgXWJ7BbJcFYpTEUkS1Ge8bpZQ==}
+
+  unpipe@1.0.0:
+    resolution: {integrity: sha512-pjy2bYhSsufwWlKwPc+l3cN7+wuJlK6uz0YdJEOlQDbl6jo/YlPi4mb8agUkVC8BF7V8NuzeyPNqRksA3hztKQ==}
+    engines: {node: '>= 0.8'}
+
+  util-deprecate@1.0.2:
+    resolution: {integrity: sha512-EPD5q1uXyFxJpCrLnCc1nHnq3gOa6DZBocAIiI2TaSCA7VCJ1UJDMagCzIkXNsUYfD1daK//LTEQ8xiIbrHtcw==}
+
+  vary@1.1.2:
+    resolution: {integrity: sha512-BNGbWLfd0eUPabhkXUVm0j8uuvREyTh5ovRa/dyow/BqAbZJyC+5fU+IzQOzmAKzYqYRAISoRhdQr3eIZ/PXqg==}
+    engines: {node: '>= 0.8'}
+
+  wrappy@1.0.2:
+    resolution: {integrity: sha512-l4Sp/DRseor9wL6EvV2+TuQn63dMkPjZ/sp9XkghTEbV9KlPS1xUsZ3u7/IQO4wxtcFB4bgpQPRcR3QCvezPcQ==}
+
+  zod@4.5.4:
+    resolution: {integrity: sha512-sC95tT5iHHH9gtpj6A81kh+NEaRAUFN+qlUPDUbRfOMvNf5QCBqsb3WgvnpVtK5Y+4UfA6KqufotuTvMGiTlsA==}
+
+snapshots:
+
+  '@borewit/text-codec@0.2.2': {}
+
+  '@emnapi/runtime@1.11.3':
+    dependencies:
+      tslib: 2.8.1
+    optional: true
+
+  '@esbuild/aix-ppc64@0.28.2':
+    optional: true
+
+  '@esbuild/android-arm64@0.28.2':
+    optional: true
+
+  '@esbuild/android-arm@0.28.2':
+    optional: true
+
+  '@esbuild/android-x64@0.28.2':
+    optional: true
+
+  '@esbuild/darwin-arm64@0.28.2':
+    optional: true
+
+  '@esbuild/darwin-x64@0.28.2':
+    optional: true
+
+  '@esbuild/freebsd-arm64@0.28.2':
+    optional: true
+
+  '@esbuild/freebsd-x64@0.28.2':
+    optional: true
+
+  '@esbuild/linux-arm64@0.28.2':
+    optional: true
+
+  '@esbuild/linux-arm@0.28.2':
+    optional: true
+
+  '@esbuild/linux-ia32@0.28.2':
+    optional: true
+
+  '@esbuild/linux-loong64@0.28.2':
+    optional: true
+
+  '@esbuild/linux-mips64el@0.28.2':
+    optional: true
+
+  '@esbuild/linux-ppc64@0.28.2':
+    optional: true
+
+  '@esbuild/linux-riscv64@0.28.2':
+    optional: true
+
+  '@esbuild/linux-s390x@0.28.2':
+    optional: true
+
+  '@esbuild/linux-x64@0.28.2':
+    optional: true
+
+  '@esbuild/netbsd-arm64@0.28.2':
+    optional: true
+
+  '@esbuild/netbsd-x64@0.28.2':
+    optional: true
+
+  '@esbuild/openbsd-arm64@0.28.2':
+    optional: true
+
+  '@esbuild/openbsd-x64@0.28.2':
+    optional: true
+
+  '@esbuild/openharmony-arm64@0.28.2':
+    optional: true
+
+  '@esbuild/sunos-x64@0.28.2':
+    optional: true
+
+  '@esbuild/win32-arm64@0.28.2':
+    optional: true
+
+  '@esbuild/win32-ia32@0.28.2':
+    optional: true
+
+  '@esbuild/win32-x64@0.28.2':
+    optional: true
+
+  '@img/colour@1.1.0':
+    optional: true
+
+  '@img/sharp-darwin-arm64@0.35.4':
+    optionalDependencies:
+      '@img/sharp-libvips-darwin-arm64': 1.3.3
+    optional: true
+
+  '@img/sharp-darwin-x64@0.35.4':
+    optionalDependencies:
+      '@img/sharp-libvips-darwin-x64': 1.3.3
+    optional: true
+
+  '@img/sharp-freebsd-wasm32@0.35.4':
+    dependencies:
+      '@img/sharp-wasm32': 0.35.4
+    optional: true
+
+  '@img/sharp-libvips-darwin-arm64@1.3.3':
+    optional: true
+
+  '@img/sharp-libvips-darwin-x64@1.3.3':
+    optional: true
+
+  '@img/sharp-libvips-linux-arm64@1.3.3':
+    optional: true
+
+  '@img/sharp-libvips-linux-arm@1.3.3':
+    optional: true
+
+  '@img/sharp-libvips-linux-ppc64@1.3.3':
+    optional: true
+
+  '@img/sharp-libvips-linux-riscv64@1.3.3':
+    optional: true
+
+  '@img/sharp-libvips-linux-s390x@1.3.3':
+    optional: true
+
+  '@img/sharp-libvips-linux-x64@1.3.3':
+    optional: true
+
+  '@img/sharp-libvips-linuxmusl-arm64@1.3.3':
+    optional: true
+
+  '@img/sharp-libvips-linuxmusl-x64@1.3.3':
+    optional: true
+
+  '@img/sharp-linux-arm64@0.35.4':
+    optionalDependencies:
+      '@img/sharp-libvips-linux-arm64': 1.3.3
+    optional: true
+
+  '@img/sharp-linux-arm@0.35.4':
+    optionalDependencies:
+      '@img/sharp-libvips-linux-arm': 1.3.3
+    optional: true
+
+  '@img/sharp-linux-ppc64@0.35.4':
+    optionalDependencies:
+      '@img/sharp-libvips-linux-ppc64': 1.3.3
+    optional: true
+
+  '@img/sharp-linux-riscv64@0.35.4':
+    optionalDependencies:
+      '@img/sharp-libvips-linux-riscv64': 1.3.3
+    optional: true
+
+  '@img/sharp-linux-s390x@0.35.4':
+    optionalDependencies:
+      '@img/sharp-libvips-linux-s390x': 1.3.3
+    optional: true
+
+  '@img/sharp-linux-x64@0.35.4':
+    optionalDependencies:
+      '@img/sharp-libvips-linux-x64': 1.3.3
+    optional: true
+
+  '@img/sharp-linuxmusl-arm64@0.35.4':
+    optionalDependencies:
+      '@img/sharp-libvips-linuxmusl-arm64': 1.3.3
+    optional: true
+
+  '@img/sharp-linuxmusl-x64@0.35.4':
+    optionalDependencies:
+      '@img/sharp-libvips-linuxmusl-x64': 1.3.3
+    optional: true
+
+  '@img/sharp-wasm32@0.35.4':
+    dependencies:
+      '@emnapi/runtime': 1.11.3
+    optional: true
+
+  '@img/sharp-webcontainers-wasm32@0.35.4':
+    dependencies:
+      '@img/sharp-wasm32': 0.35.4
+    optional: true
+
+  '@img/sharp-win32-arm64@0.35.4':
+    optional: true
+
+  '@img/sharp-win32-ia32@0.35.4':
+    optional: true
+
+  '@img/sharp-win32-x64@0.35.4':
+    optional: true
+
+  '@lukeed/csprng@1.1.0': {}
+
+  '@nestjs/common@12.0.1(reflect-metadata@0.2.2)(rxjs@7.8.2)':
+    dependencies:
+      '@standard-schema/spec': 1.1.0
+      file-type: 22.0.2
+      iterare: 1.2.1
+      load-esm: 1.0.3
+      reflect-metadata: 0.2.2
+      rxjs: 7.8.2
+      tslib: 2.8.1
+      uid: 2.0.2
+    transitivePeerDependencies:
+      - supports-color
+
+  '@nestjs/core@12.0.1(@nestjs/common@12.0.1(reflect-metadata@0.2.2)(rxjs@7.8.2))(@nestjs/platform-express@12.0.1)(reflect-metadata@0.2.2)(rxjs@7.8.2)':
+    dependencies:
+      '@nestjs/common': 12.0.1(reflect-metadata@0.2.2)(rxjs@7.8.2)
+      fast-safe-stringify: 2.1.1
+      iterare: 1.2.1
+      path-to-regexp: 8.4.2
+      reflect-metadata: 0.2.2
+      rxjs: 7.8.2
+      tslib: 2.8.1
+      uid: 2.0.2
+    optionalDependencies:
+      '@nestjs/platform-express': 12.0.1(@nestjs/common@12.0.1(reflect-metadata@0.2.2)(rxjs@7.8.2))(@nestjs/core@12.0.1)
+
+  '@nestjs/platform-express@12.0.1(@nestjs/common@12.0.1(reflect-metadata@0.2.2)(rxjs@7.8.2))(@nestjs/core@12.0.1)':
+    dependencies:
+      '@nestjs/common': 12.0.1(reflect-metadata@0.2.2)(rxjs@7.8.2)
+      '@nestjs/core': 12.0.1(@nestjs/common@12.0.1(reflect-metadata@0.2.2)(rxjs@7.8.2))(@nestjs/platform-express@12.0.1)(reflect-metadata@0.2.2)(rxjs@7.8.2)
+      cors: 2.8.6
+      express: 5.2.1
+      multer: 2.2.0
+      path-to-regexp: 8.4.2
+      tslib: 2.8.1
+    transitivePeerDependencies:
+      - supports-color
+
+  '@next/env@16.3.3': {}
+
+  '@next/swc-darwin-arm64@16.3.3':
+    optional: true
+
+  '@next/swc-darwin-x64@16.3.3':
+    optional: true
+
+  '@next/swc-linux-arm64-gnu@16.3.3':
+    optional: true
+
+  '@next/swc-linux-arm64-musl@16.3.3':
+    optional: true
+
+  '@next/swc-linux-x64-gnu@16.3.3':
+    optional: true
+
+  '@next/swc-linux-x64-musl@16.3.3':
+    optional: true
+
+  '@next/swc-win32-arm64-msvc@16.3.3':
+    optional: true
+
+  '@next/swc-win32-x64-msvc@16.3.3':
+    optional: true
+
+  '@standard-schema/spec@1.1.0': {}
+
+  '@swc/helpers@0.5.23':
+    dependencies:
+      tslib: 2.8.1
+
+  '@tokenizer/inflate@0.4.1':
+    dependencies:
+      debug: 4.4.3
+      token-types: 6.1.2
+    transitivePeerDependencies:
+      - supports-color
+
+  '@tokenizer/token@0.3.0': {}
+
+  '@turbo/darwin-64@2.10.12':
+    optional: true
+
+  '@turbo/darwin-arm64@2.10.12':
+    optional: true
+
+  '@turbo/linux-64@2.10.12':
+    optional: true
+
+  '@turbo/linux-arm64@2.10.12':
+    optional: true
+
+  '@turbo/windows-64@2.10.12':
+    optional: true
+
+  '@turbo/windows-arm64@2.10.12':
+    optional: true
+
+  '@types/body-parser@1.19.6':
+    dependencies:
+      '@types/connect': 3.4.38
+      '@types/node': 26.4.0
+
+  '@types/connect@3.4.38':
+    dependencies:
+      '@types/node': 26.4.0
+
+  '@types/express-serve-static-core@5.1.3':
+    dependencies:
+      '@types/node': 26.4.0
+      '@types/qs': 6.15.1
+      '@types/range-parser': 1.2.7
+      '@types/send': 1.2.1
+
+  '@types/express@5.0.6':
+    dependencies:
+      '@types/body-parser': 1.19.6
+      '@types/express-serve-static-core': 5.1.3
+      '@types/serve-static': 2.2.0
+
+  '@types/http-errors@2.0.5': {}
+
+  '@types/node@26.4.0':
+    dependencies:
+      undici-types: 8.3.0
+
+  '@types/qs@6.15.1': {}
+
+  '@types/range-parser@1.2.7': {}
+
+  '@types/react-dom@19.2.5(@types/react@19.2.18)':
+    dependencies:
+      '@types/react': 19.2.18
+
+  '@types/react@19.2.18':
+    dependencies:
+      csstype: 3.2.3
+
+  '@types/send@1.2.1':
+    dependencies:
+      '@types/node': 26.4.0
+
+  '@types/serve-static@2.2.0':
+    dependencies:
+      '@types/http-errors': 2.0.5
+      '@types/node': 26.4.0
+
+  '@typescript/typescript-aix-ppc64@7.0.2':
+    optional: true
+
+  '@typescript/typescript-darwin-arm64@7.0.2':
+    optional: true
+
+  '@typescript/typescript-darwin-x64@7.0.2':
+    optional: true
+
+  '@typescript/typescript-freebsd-arm64@7.0.2':
+    optional: true
+
+  '@typescript/typescript-freebsd-x64@7.0.2':
+    optional: true
+
+  '@typescript/typescript-linux-arm64@7.0.2':
+    optional: true
+
+  '@typescript/typescript-linux-arm@7.0.2':
+    optional: true
+
+  '@typescript/typescript-linux-loong64@7.0.2':
+    optional: true
+
+  '@typescript/typescript-linux-mips64el@7.0.2':
+    optional: true
+
+  '@typescript/typescript-linux-ppc64@7.0.2':
+    optional: true
+
+  '@typescript/typescript-linux-riscv64@7.0.2':
+    optional: true
+
+  '@typescript/typescript-linux-s390x@7.0.2':
+    optional: true
+
+  '@typescript/typescript-linux-x64@7.0.2':
+    optional: true
+
+  '@typescript/typescript-netbsd-arm64@7.0.2':
+    optional: true
+
+  '@typescript/typescript-netbsd-x64@7.0.2':
+    optional: true
+
+  '@typescript/typescript-openbsd-arm64@7.0.2':
+    optional: true
+
+  '@typescript/typescript-openbsd-x64@7.0.2':
+    optional: true
+
+  '@typescript/typescript-sunos-x64@7.0.2':
+    optional: true
+
+  '@typescript/typescript-win32-arm64@7.0.2':
+    optional: true
+
+  '@typescript/typescript-win32-x64@7.0.2':
+    optional: true
+
+  accepts@2.0.0:
+    dependencies:
+      mime-types: 3.0.2
+      negotiator: 1.1.0
+
+  append-field@1.0.0: {}
+
+  baseline-browser-mapping@2.11.20: {}
+
+  body-parser@2.3.0:
+    dependencies:
+      bytes: 3.1.2
+      content-type: 2.1.0
+      debug: 4.4.3
+      http-errors: 2.0.1
+      iconv-lite: 0.7.3
+      on-finished: 2.4.1
+      qs: 6.16.0
+      raw-body: 3.0.2
+      type-is: 2.1.0
+    transitivePeerDependencies:
+      - supports-color
+
+  buffer-from@1.1.2: {}
+
+  busboy@1.6.0:
+    dependencies:
+      streamsearch: 1.1.0
+
+  bytes@3.1.2: {}
+
+  call-bind-apply-helpers@1.0.2:
+    dependencies:
+      es-errors: 1.3.0
+      function-bind: 1.1.2
+
+  call-bound@1.0.4:
+    dependencies:
+      call-bind-apply-helpers: 1.0.2
+      get-intrinsic: 1.3.0
+
+  caniuse-lite@1.0.30001810: {}
+
+  client-only@0.0.1: {}
+
+  concat-stream@2.0.0:
+    dependencies:
+      buffer-from: 1.1.2
+      inherits: 2.0.4
+      readable-stream: 3.6.2
+      typedarray: 0.0.6
+
+  content-disposition@1.1.0: {}
+
+  content-type@1.0.5: {}
+
+  content-type@2.1.0: {}
+
+  cookie-signature@1.2.2: {}
+
+  cookie@0.7.2: {}
+
+  cors@2.8.6:
+    dependencies:
+      object-assign: 4.1.1
+      vary: 1.1.2
+
+  csstype@3.2.3: {}
+
+  debug@4.4.3:
+    dependencies:
+      ms: 2.1.3
+
+  depd@2.0.0: {}
+
+  detect-libc@2.1.2:
+    optional: true
+
+  dunder-proto@1.0.1:
+    dependencies:
+      call-bind-apply-helpers: 1.0.2
+      es-errors: 1.3.0
+      gopd: 1.2.0
+
+  ee-first@1.1.1: {}
+
+  encodeurl@2.0.0: {}
+
+  es-define-property@1.0.1: {}
+
+  es-errors@1.3.0: {}
+
+  es-object-atoms@1.1.2:
+    dependencies:
+      es-errors: 1.3.0
+
+  esbuild@0.28.2:
+    optionalDependencies:
+      '@esbuild/aix-ppc64': 0.28.2
+      '@esbuild/android-arm': 0.28.2
+      '@esbuild/android-arm64': 0.28.2
+      '@esbuild/android-x64': 0.28.2
+      '@esbuild/darwin-arm64': 0.28.2
+      '@esbuild/darwin-x64': 0.28.2
+      '@esbuild/freebsd-arm64': 0.28.2
+      '@esbuild/freebsd-x64': 0.28.2
+      '@esbuild/linux-arm': 0.28.2
+      '@esbuild/linux-arm64': 0.28.2
+      '@esbuild/linux-ia32': 0.28.2
+      '@esbuild/linux-loong64': 0.28.2
+      '@esbuild/linux-mips64el': 0.28.2
+      '@esbuild/linux-ppc64': 0.28.2
+      '@esbuild/linux-riscv64': 0.28.2
+      '@esbuild/linux-s390x': 0.28.2
+      '@esbuild/linux-x64': 0.28.2
+      '@esbuild/netbsd-arm64': 0.28.2
+      '@esbuild/netbsd-x64': 0.28.2
+      '@esbuild/openbsd-arm64': 0.28.2
+      '@esbuild/openbsd-x64': 0.28.2
+      '@esbuild/openharmony-arm64': 0.28.2
+      '@esbuild/sunos-x64': 0.28.2
+      '@esbuild/win32-arm64': 0.28.2
+      '@esbuild/win32-ia32': 0.28.2
+      '@esbuild/win32-x64': 0.28.2
+
+  escape-html@1.0.3: {}
+
+  etag@1.8.1: {}
+
+  express@5.2.1:
+    dependencies:
+      accepts: 2.0.0
+      body-parser: 2.3.0
+      content-disposition: 1.1.0
+      content-type: 1.0.5
+      cookie: 0.7.2
+      cookie-signature: 1.2.2
+      debug: 4.4.3
+      depd: 2.0.0
+      encodeurl: 2.0.0
+      escape-html: 1.0.3
+      etag: 1.8.1
+      finalhandler: 2.1.1
+      fresh: 2.0.0
+      http-errors: 2.0.1
+      merge-descriptors: 2.0.0
+      mime-types: 3.0.2
+      on-finished: 2.4.1
+      once: 1.4.0
+      parseurl: 1.3.3
+      proxy-addr: 2.0.7
+      qs: 6.16.0
+      range-parser: 1.3.0
+      router: 2.2.0
+      send: 1.2.1
+      serve-static: 2.2.1
+      statuses: 2.0.2
+      type-is: 2.1.0
+      vary: 1.1.2
+    transitivePeerDependencies:
+      - supports-color
+
+  fast-safe-stringify@2.1.1: {}
+
+  file-type@22.0.2:
+    dependencies:
+      '@tokenizer/inflate': 0.4.1
+      strtok3: 10.3.5
+      token-types: 6.1.2
+      uint8array-extras: 1.5.0
+    transitivePeerDependencies:
+      - supports-color
+
+  finalhandler@2.1.1:
+    dependencies:
+      debug: 4.4.3
+      encodeurl: 2.0.0
+      escape-html: 1.0.3
+      on-finished: 2.4.1
+      parseurl: 1.3.3
+      statuses: 2.0.2
+    transitivePeerDependencies:
+      - supports-color
+
+  forwarded@0.2.0: {}
+
+  fresh@2.0.0: {}
+
+  fsevents@2.3.3:
+    optional: true
+
+  function-bind@1.1.2: {}
+
+  get-intrinsic@1.3.0:
+    dependencies:
+      call-bind-apply-helpers: 1.0.2
+      es-define-property: 1.0.1
+      es-errors: 1.3.0
+      es-object-atoms: 1.1.2
+      function-bind: 1.1.2
+      get-proto: 1.0.1
+      gopd: 1.2.0
+      has-symbols: 1.1.0
+      hasown: 2.0.4
+      math-intrinsics: 1.1.0
+
+  get-proto@1.0.1:
+    dependencies:
+      dunder-proto: 1.0.1
+      es-object-atoms: 1.1.2
+
+  gopd@1.2.0: {}
+
+  has-symbols@1.1.0: {}
+
+  hasown@2.0.4:
+    dependencies:
+      function-bind: 1.1.2
+
+  http-errors@2.0.1:
+    dependencies:
+      depd: 2.0.0
+      inherits: 2.0.4
+      setprototypeof: 1.2.0
+      statuses: 2.0.2
+      toidentifier: 1.0.1
+
+  iconv-lite@0.7.3:
+    dependencies:
+      safer-buffer: 2.1.2
+
+  ieee754@1.2.1: {}
+
+  inherits@2.0.4: {}
+
+  ipaddr.js@1.9.1: {}
+
+  is-promise@4.0.0: {}
+
+  iterare@1.2.1: {}
+
+  load-esm@1.0.3: {}
+
+  math-intrinsics@1.1.0: {}
+
+  media-typer@0.3.0: {}
+
+  media-typer@1.1.1: {}
+
+  merge-descriptors@2.0.0: {}
+
+  mime-db@1.52.0: {}
+
+  mime-db@1.54.0: {}
+
+  mime-types@2.1.35:
+    dependencies:
+      mime-db: 1.52.0
+
+  mime-types@3.0.2:
+    dependencies:
+      mime-db: 1.54.0
+
+  ms@2.1.3: {}
+
+  multer@2.2.0:
+    dependencies:
+      append-field: 1.0.0
+      busboy: 1.6.0
+      concat-stream: 2.0.0
+      type-is: 1.6.18
+
+  nanoid@3.3.18: {}
+
+  negotiator@1.1.0:
+    dependencies:
+      content-type: 2.1.0
+
+  next@16.3.3(@types/node@26.4.0)(react-dom@19.2.8(react@19.2.8))(react@19.2.8):
+    dependencies:
+      '@next/env': 16.3.3
+      '@swc/helpers': 0.5.23
+      baseline-browser-mapping: 2.11.20
+      caniuse-lite: 1.0.30001810
+      postcss: 8.5.23
+      react: 19.2.8
+      react-dom: 19.2.8(react@19.2.8)
+      styled-jsx: 5.1.6(react@19.2.8)
+    optionalDependencies:
+      '@next/swc-darwin-arm64': 16.3.3
+      '@next/swc-darwin-x64': 16.3.3
+      '@next/swc-linux-arm64-gnu': 16.3.3
+      '@next/swc-linux-arm64-musl': 16.3.3
+      '@next/swc-linux-x64-gnu': 16.3.3
+      '@next/swc-linux-x64-musl': 16.3.3
+      '@next/swc-win32-arm64-msvc': 16.3.3
+      '@next/swc-win32-x64-msvc': 16.3.3
+      sharp: 0.35.4(@types/node@26.4.0)
+    transitivePeerDependencies:
+      - '@babel/core'
+      - '@types/node'
+      - babel-plugin-macros
+
+  object-assign@4.1.1: {}
+
+  object-inspect@1.13.4: {}
+
+  on-finished@2.4.1:
+    dependencies:
+      ee-first: 1.1.1
+
+  once@1.4.0:
+    dependencies:
+      wrappy: 1.0.2
+
+  parseurl@1.3.3: {}
+
+  path-to-regexp@8.4.2: {}
+
+  picocolors@1.1.1: {}
+
+  postcss@8.5.23:
+    dependencies:
+      nanoid: 3.3.18
+      picocolors: 1.1.1
+      source-map-js: 1.2.1
+
+  proxy-addr@2.0.7:
+    dependencies:
+      forwarded: 0.2.0
+      ipaddr.js: 1.9.1
+
+  qs@6.16.0:
+    dependencies:
+      es-define-property: 1.0.1
+      side-channel: 1.1.1
+
+  range-parser@1.3.0: {}
+
+  raw-body@3.0.2:
+    dependencies:
+      bytes: 3.1.2
+      http-errors: 2.0.1
+      iconv-lite: 0.7.3
+      unpipe: 1.0.0
+
+  react-dom@19.2.8(react@19.2.8):
+    dependencies:
+      react: 19.2.8
+      scheduler: 0.27.0
+
+  react@19.2.8: {}
+
+  readable-stream@3.6.2:
+    dependencies:
+      inherits: 2.0.4
+      string_decoder: 1.3.0
+      util-deprecate: 1.0.2
+
+  reflect-metadata@0.2.2: {}
+
+  router@2.2.0:
+    dependencies:
+      debug: 4.4.3
+      depd: 2.0.0
+      is-promise: 4.0.0
+      parseurl: 1.3.3
+      path-to-regexp: 8.4.2
+    transitivePeerDependencies:
+      - supports-color
+
+  rxjs@7.8.2:
+    dependencies:
+      tslib: 2.8.1
+
+  safe-buffer@5.2.1: {}
+
+  safer-buffer@2.1.2: {}
+
+  scheduler@0.27.0: {}
+
+  semver@7.8.5:
+    optional: true
+
+  send@1.2.1:
+    dependencies:
+      debug: 4.4.3
+      encodeurl: 2.0.0
+      escape-html: 1.0.3
+      etag: 1.8.1
+      fresh: 2.0.0
+      http-errors: 2.0.1
+      mime-types: 3.0.2
+      ms: 2.1.3
+      on-finished: 2.4.1
+      range-parser: 1.3.0
+      statuses: 2.0.2
+    transitivePeerDependencies:
+      - supports-color
+
+  serve-static@2.2.1:
+    dependencies:
+      encodeurl: 2.0.0
+      escape-html: 1.0.3
+      parseurl: 1.3.3
+      send: 1.2.1
+    transitivePeerDependencies:
+      - supports-color
+
+  setprototypeof@1.2.0: {}
+
+  sharp@0.35.4(@types/node@26.4.0):
+    dependencies:
+      '@img/colour': 1.1.0
+      detect-libc: 2.1.2
+      semver: 7.8.5
+    optionalDependencies:
+      '@img/sharp-darwin-arm64': 0.35.4
+      '@img/sharp-darwin-x64': 0.35.4
+      '@img/sharp-freebsd-wasm32': 0.35.4
+      '@img/sharp-libvips-darwin-arm64': 1.3.3
+      '@img/sharp-libvips-darwin-x64': 1.3.3
+      '@img/sharp-libvips-linux-arm': 1.3.3
+      '@img/sharp-libvips-linux-arm64': 1.3.3
+      '@img/sharp-libvips-linux-ppc64': 1.3.3
+      '@img/sharp-libvips-linux-riscv64': 1.3.3
+      '@img/sharp-libvips-linux-s390x': 1.3.3
+      '@img/sharp-libvips-linux-x64': 1.3.3
+      '@img/sharp-libvips-linuxmusl-arm64': 1.3.3
+      '@img/sharp-libvips-linuxmusl-x64': 1.3.3
+      '@img/sharp-linux-arm': 0.35.4
+      '@img/sharp-linux-arm64': 0.35.4
+      '@img/sharp-linux-ppc64': 0.35.4
+      '@img/sharp-linux-riscv64': 0.35.4
+      '@img/sharp-linux-s390x': 0.35.4
+      '@img/sharp-linux-x64': 0.35.4
+      '@img/sharp-linuxmusl-arm64': 0.35.4
+      '@img/sharp-linuxmusl-x64': 0.35.4
+      '@img/sharp-webcontainers-wasm32': 0.35.4
+      '@img/sharp-win32-arm64': 0.35.4
+      '@img/sharp-win32-ia32': 0.35.4
+      '@img/sharp-win32-x64': 0.35.4
+      '@types/node': 26.4.0
+    optional: true
+
+  side-channel-list@1.0.1:
+    dependencies:
+      es-errors: 1.3.0
+      object-inspect: 1.13.4
+
+  side-channel-map@1.0.1:
+    dependencies:
+      call-bound: 1.0.4
+      es-errors: 1.3.0
+      get-intrinsic: 1.3.0
+      object-inspect: 1.13.4
+
+  side-channel-weakmap@1.0.2:
+    dependencies:
+      call-bound: 1.0.4
+      es-errors: 1.3.0
+      get-intrinsic: 1.3.0
+      object-inspect: 1.13.4
+      side-channel-map: 1.0.1
+
+  side-channel@1.1.1:
+    dependencies:
+      es-errors: 1.3.0
+      object-inspect: 1.13.4
+      side-channel-list: 1.0.1
+      side-channel-map: 1.0.1
+      side-channel-weakmap: 1.0.2
+
+  source-map-js@1.2.1: {}
+
+  statuses@2.0.2: {}
+
+  streamsearch@1.1.0: {}
+
+  string_decoder@1.3.0:
+    dependencies:
+      safe-buffer: 5.2.1
+
+  strtok3@10.3.5:
+    dependencies:
+      '@tokenizer/token': 0.3.0
+
+  styled-jsx@5.1.6(react@19.2.8):
+    dependencies:
+      client-only: 0.0.1
+      react: 19.2.8
+
+  toidentifier@1.0.1: {}
+
+  token-types@6.1.2:
+    dependencies:
+      '@borewit/text-codec': 0.2.2
+      '@tokenizer/token': 0.3.0
+      ieee754: 1.2.1
+
+  tslib@2.8.1: {}
+
+  tsx@4.23.13:
+    dependencies:
+      esbuild: 0.28.2
+    optionalDependencies:
+      fsevents: 2.3.3
+
+  turbo@2.10.12:
+    optionalDependencies:
+      '@turbo/darwin-64': 2.10.12
+      '@turbo/darwin-arm64': 2.10.12
+      '@turbo/linux-64': 2.10.12
+      '@turbo/linux-arm64': 2.10.12
+      '@turbo/windows-64': 2.10.12
+      '@turbo/windows-arm64': 2.10.12
+
+  type-is@1.6.18:
+    dependencies:
+      media-typer: 0.3.0
+      mime-types: 2.1.35
+
+  type-is@2.1.0:
+    dependencies:
+      content-type: 2.1.0
+      media-typer: 1.1.1
+      mime-types: 3.0.2
+
+  typedarray@0.0.6: {}
+
+  typescript@7.0.2:
+    optionalDependencies:
+      '@typescript/typescript-aix-ppc64': 7.0.2
+      '@typescript/typescript-darwin-arm64': 7.0.2
+      '@typescript/typescript-darwin-x64': 7.0.2
+      '@typescript/typescript-freebsd-arm64': 7.0.2
+      '@typescript/typescript-freebsd-x64': 7.0.2
+      '@typescript/typescript-linux-arm': 7.0.2
+      '@typescript/typescript-linux-arm64': 7.0.2
+      '@typescript/typescript-linux-loong64': 7.0.2
+      '@typescript/typescript-linux-mips64el': 7.0.2
+      '@typescript/typescript-linux-ppc64': 7.0.2
+      '@typescript/typescript-linux-riscv64': 7.0.2
+      '@typescript/typescript-linux-s390x': 7.0.2
+      '@typescript/typescript-linux-x64': 7.0.2
+      '@typescript/typescript-netbsd-arm64': 7.0.2
+      '@typescript/typescript-netbsd-x64': 7.0.2
+      '@typescript/typescript-openbsd-arm64': 7.0.2
+      '@typescript/typescript-openbsd-x64': 7.0.2
+      '@typescript/typescript-sunos-x64': 7.0.2
+      '@typescript/typescript-win32-arm64': 7.0.2
+      '@typescript/typescript-win32-x64': 7.0.2
+
+  uid@2.0.2:
+    dependencies:
+      '@lukeed/csprng': 1.1.0
+
+  uint8array-extras@1.5.0: {}
+
+  undici-types@8.3.0: {}
+
+  unpipe@1.0.0: {}
+
+  util-deprecate@1.0.2: {}
+
+  vary@1.1.2: {}
+
+  wrappy@1.0.2: {}
+
+  zod@4.5.4: {}
diff --git a/pnpm-workspace.yaml b/pnpm-workspace.yaml
new file mode 100644
index 0000000..ad5dad1
--- /dev/null
+++ b/pnpm-workspace.yaml
@@ -0,0 +1,5 @@
+packages:
+  - apps/*
+  - packages/*
+allowBuilds:
+  esbuild: set this to true or false
diff --git a/tsconfig.base.json b/tsconfig.base.json
new file mode 100644
index 0000000..e8c9209
--- /dev/null
+++ b/tsconfig.base.json
@@ -0,0 +1,18 @@
+{
+  "compilerOptions": {
+    "target": "ES2022",
+    "lib": [
+      "ES2022"
+    ],
+    "strict": true,
+    "isolatedModules": true,
+    "forceConsistentCasingInFileNames": true,
+    "exactOptionalPropertyTypes": true,
+    "noUncheckedIndexedAccess": true,
+    "noImplicitOverride": true,
+    "skipLibCheck": true,
+    "esModuleInterop": true,
+    "resolveJsonModule": true,
+    "verbatimModuleSyntax": true
+  }
+}
\ No newline at end of file
diff --git a/turbo.json b/turbo.json
new file mode 100644
index 0000000..e368045
--- /dev/null
+++ b/turbo.json
@@ -0,0 +1,24 @@
+{
+  "$schema": "https://turbo.build/schema.json",
+  "tasks": {
+    "build": {
+      "dependsOn": ["^build"],
+      "outputs": [".next/**", "dist/**"]
+    },
+    "db:migrate": {
+      "cache": false,
+      "persistent": false
+    },
+    "dev": {
+      "cache": false,
+      "persistent": true
+    },
+    "lint": {
+      "dependsOn": ["^lint"]
+    },
+    "test": {
+      "dependsOn": ["^test"]
+    }
+  }
+}
+
