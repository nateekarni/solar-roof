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

