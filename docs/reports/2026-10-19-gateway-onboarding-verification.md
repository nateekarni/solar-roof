# Gateway onboarding verification — 2026-10-19

## Scope and tested revision

- Implementation base: `f3ace6dd106097d743e1c2344103d00acb809548` (`f3ace6d`) plus the uncommitted Task 12 verifier changes described here.
- Expected broker deployment version: EMQX `5.8.3`, as asserted by `emqx-deployment.spec.ts` against the checked-in deployment files.
- The EMQX version was **not** read from a running broker during this task.
- The verifier uses a synthetic `UNVERIFIED-METER` mapping for an isolated test site. It does not certify Schneider PM2230 register addresses, data types, byte order, word order, scale, units, firmware behavior, or physical hardware.

## Real verifier added

Run the verifier with:

```bash
pnpm --filter @solar/api verify:gateway-onboarding
```

Required environment:

- `MQTT_E2E_URL`
- `DATABASE_URL`
- `E2E_ADMIN_ACCESS_TOKEN`
- `E2E_SITE_ID`

Optional environment:

- `E2E_API_URL` (defaults to `http://127.0.0.1:3001`)
- `MQTT_E2E_CA_FILE` (custom CA bytes; TLS verification is never disabled)
- `MQTT_E2E_POLL_TIMEOUT_MS` (bounded to 1,000–120,000 ms)
- `MQTT_E2E_OPERATION_TIMEOUT_MS` (single MQTT/SQL/HTTP operation; defaults to 10,000 ms and is bounded to 1,000–30,000 ms)
- `MQTT_E2E_SCENARIO_TIMEOUT_MS` (whole test scenario; defaults to 300,000 ms and is bounded to 30,000–900,000 ms)
- `MQTT_E2E_CLEANUP_USERNAME` / `MQTT_E2E_CLEANUP_PASSWORD` (backend broker account used only to tombstone retained test topics; defaults to the API's `MQTT_USERNAME` / `MQTT_PASSWORD`)
- `MQTT_E2E_REQUIRED=true` (missing required settings fail instead of skipping)

`MQTT_E2E_URL` must not contain URL userinfo; this keeps the registration connection genuinely anonymous. The live verifier also requires the backend cleanup account (through either environment-name pair above) before it creates retained packets. `E2E_SITE_ID` must identify a dedicated, active site with an `external_site_id` and no non-retired gateway. Each run creates random gateway, device, proposal, session, and message identities. The result prints correlation IDs and configuration hashes only; it never returns or logs the admin token, MQTT password, or password hash.

The harness exercises and asserts:

1. anonymous connection and denied `config` subscription;
2. QoS 1 registration and discovery through the admin API;
3. admin confirmation with a complete synthetic manual mapping;
4. one-time credential storage as a hash and authenticated reconnect;
5. retained configuration version/hash delivered at QoS 1;
6. `received` then `applied` status and active transition;
7. pre-apply `dataAcept` subscription and telemetry publication denial, with no durable message row;
8. canonical post-apply telemetry after the exact online status event is durable, held behind a real PostgreSQL row-lock barrier whose blocked activity is identified by the telemetry query predicates, no pre-commit ACK, then committed `payload_messages`, `payload_samples`, and `telemetry_raw` evidence followed by correlated QoS 1 non-retained `dataAcept`;
9. idempotent QoS 1 replay with the exact same durable message, sample, downstream telemetry, and presence effects;
10. full `configUpdate`, manual admin approval, retained next revision, and application;
11. cross-gateway subscription and cross-site publication denial using MQTT v5 reason codes;
12. online, graceful offline, abnormal Last Will offline, and reconnect status evidence;
13. bounded cleanup limited to the generated gateway: gracefully close test clients, tombstone its retained `config` and `status`, then atomically revoke its credential, set it offline/disabled, retire it, and mark its discovery ignored using one checked-out database client. Immutable audit/config/profile history is intentionally retained.

Topics used by the verifier:

```text
solar/v1/gateways/{gatewayId}/register
solar/v1/gateways/{gatewayId}/config
solar/v1/gateways/{gatewayId}/configUpdate
solar/v1/gateways/{gatewayId}/configStatus
solar/v1/gateways/{gatewayId}/status
solar/v1/sites/{siteId}/gateways/{gatewayId}/devices/{deviceId}/telemetry
solar/v1/sites/{siteId}/gateways/{gatewayId}/dataAcept
```

## Executed automated evidence

### Focused Task 12 and onboarding suites

- Task 12 focused contract suite after review fixes: **6 passed, 1 skipped, 0 failed**. The skipped test is the real broker/database E2E because its required environment was absent.
- Task 12 focused contract suite after the second review fix: **9 passed, 1 skipped, 0 failed**. The skipped test is the same unconfigured live broker/database E2E.
- Gateway-control API regression suite after the second review fix: **248 passed, 1 skipped, 0 failed**.
- Gateway-control API regression suite after review fixes: **245 passed, 1 skipped, 0 failed**.
- Focused web gateway onboarding suite: **53 passed, 0 failed**.
- Required-mode check with `MQTT_E2E_REQUIRED=true` and no environment: **failed as intended** and named all four missing variable names without printing values.
- API TypeScript check: passed.
- `git diff --check`: passed.

### Repository verification

- `pnpm lint`: **8/8 packages passed**.
- API full suite, outside the loopback-restricted sandbox: **1,047 passed, 37 skipped, 0 failed**.
- Web full suite, outside the loopback-restricted sandbox: **648 passed, 0 skipped, 0 failed**.
- The first sandboxed test run had four API failures and one web failure because connections to ephemeral `127.0.0.1` ports returned `EACCES`. Re-running outside that restriction passed; these results were not converted to success without the rerun.
- `pnpm build` built **7/8 packages**, then the web build failed under the bundled Node `24.19.0` with a Turbopack PostCSS worker error: `creating new process` / `node process exited before we could connect to it with exit code: 0`.
- Re-running the same Next.js production build directly with the repository-supported Node `24.21.0` passed: compiled successfully, TypeScript completed, and 24/24 static pages generated.

## Live broker/database evidence not executed

At verification time, none of `MQTT_E2E_URL`, `DATABASE_URL`, `E2E_ADMIN_ACCESS_TOKEN`, or `E2E_SITE_ID` was configured. Therefore:

- no MQTT connection was made;
- no EMQX runtime version, clients, subscriptions, PUBACK/SUBACK, retained packets, ACL denial, or Last Will behavior was observed;
- no API lifecycle row, credential hash, configuration revision/hash, proposal, status event, telemetry row, or `dataAcept` was created or observed in a live PostgreSQL/API deployment;
- no Docker Compose environment was started;
- no live run IDs, message IDs, configuration versions/hashes, database row IDs, or UI screenshots exist for this report.

The conditional E2E test remains skipped in this state. This report is not deployment certification; run the verifier against the intended EMQX/API/PostgreSQL environment and append its sanitized JSON result before approval for production use.

## Physical hardware limitation

No physical gateway, Schneider PM2230, or other meter was connected. The synthetic register address used by the E2E harness exists only to exercise validation and synchronization. PM2230 correctness requires the verified vendor register document, exact model/firmware, wiring, and a real hardware test.
