# Local Development Runbook

This runbook covers the Task 1 foundation only. It does not describe later domain flows.

## 1. Bootstrap the workspace

1. Install the pinned toolchain.
2. Install dependencies.
3. Start the local services.
4. Launch the workspace dev processes.

```bash
pnpm install
docker compose -f infra/docker/compose.yml up -d
pnpm dev
```

## 2. Environment file

Copy `.env.example` to your local environment file and set the required secrets before starting API or worker processes.

Required values include:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `MQTT_URL`
- `MQTT_USERNAME`
- `MQTT_PASSWORD`
- `STORAGE_ENDPOINT`
- `STORAGE_REGION`
- `STORAGE_BUCKET`
- `STORAGE_ACCESS_KEY`
- `STORAGE_SECRET_KEY`

`REDIS_URL` is included for local queue wiring and can remain pointed at the bundled Redis container.

## 3. Local service ports

- PostgreSQL/TimescaleDB: `5432`
- Redis: `6379`
- MQTT: `1883`
- MQTT dashboard: `18083`
- Object storage: `9000`
- Object storage console: `9001`

## 4. App ports and health checks

- Web: `3000`
- API: `3001`
- Worker: `3002`

Each app exposes a `/health` endpoint that reports dependency readiness without printing secrets or raw credentials.

## 5. Verification commands

Run these commands before handing off Task 1:

```bash
pnpm lint
pnpm test
pnpm build
pnpm db:migrate
docker compose -f infra/docker/compose.yml config
```

If `pnpm db:migrate` reports that no application migrations exist yet, the bootstrap is still correct for Task 1.

