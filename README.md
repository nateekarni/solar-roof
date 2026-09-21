# Solar Energy Management Platform

Task 1 sets up the buildable monorepo foundation for the Solar Energy Management Platform.

## What is included

- `apps/web`: Next.js web app
- `apps/api`: NestJS HTTP API
- `apps/worker`: NestJS worker process
- `packages/domain`: shared domain configuration and health helpers
- `packages/api-contracts`: shared API DTO helpers
- `packages/connectors`: connector interfaces
- `packages/i18n`: Thai locale helpers
- `packages/ui`: shared UI token placeholders
- `infra/docker`: local PostgreSQL/TimescaleDB, Redis, MQTT and S3-compatible storage

## Prerequisites

- Node.js 24.20.0
- pnpm 11.24.0
- Docker Compose

Use `nvm use` after placing `.nvmrc` in your shell workflow if you manage Node with nvm.

## Install

```bash
pnpm install
```

## Development

```bash
pnpm dev
```

This starts the workspace dev processes through Turborepo.

## Checks

```bash
pnpm lint
pnpm test
pnpm build
pnpm db:migrate
docker compose -f infra/docker/compose.yml config
```

## Local services

- PostgreSQL/TimescaleDB: `localhost:5432`
- Redis: `localhost:6379`
- MQTT broker: `localhost:1883`
- MQTT dashboard: `localhost:18083`
- Object storage: `localhost:9000`
- Object storage console: `localhost:9001`

## Health endpoints

- Web: `http://localhost:3000/health`
- API: `http://localhost:3001/health`
- Worker: `http://localhost:3002/health`


## Docker workflows

Local dependencies only (Web/API use `pnpm dev`):

`docker compose --env-file infra/docker/.env.local.example -f infra/docker/docker-compose.local.yml up -d`

Production-like stack (replace all example secrets first):

`docker compose --env-file .env.production -f infra/docker/docker-compose.prod.yml up -d --build`

Compose validation:

`docker compose --env-file infra/docker/.env.local.example -f infra/docker/docker-compose.local.yml config`
`docker compose --env-file infra/docker/.env.production.example -f infra/docker/docker-compose.prod.yml config`

API OpenAPI UI: `http://localhost:3001/docs`

## Database-backed demo data

Local dependencies and database:

Copy `infra/docker/.env.local.example` to `.env` before running the API scripts. The example contains local-only credentials.

```bash
docker compose --env-file infra/docker/.env.local.example -f infra/docker/docker-compose.local.yml up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The demo seed is deterministic and recreates local/demo data only. It creates 12 schools, 18 sites, 18 gateways, 36 devices, 60-second raw telemetry for 7 days, 15-minute/hour/day/month aggregates, contracts, rate versions, billing cycles, invoices, payments, alerts and audit events.

To intentionally recreate the local dataset:

```bash
pnpm db:seed:reset
```

`db:seed` and `db:seed:reset` refuse to run when `NODE_ENV=production`. Do not use demo seed against a production database.

Production-like stack and seed:

```bash
docker compose --env-file .env.production -f infra/docker/docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f infra/docker/docker-compose.prod.yml run --rm api pnpm --filter @solar/api db:migrate
# Seed is intentionally local/demo only; do not run it against production data.
```

Web reads dashboard and management rows from API endpoints backed by PostgreSQL/TimescaleDB. There is no static-data fallback. If the API/database is unavailable, the UI shows an error state.
