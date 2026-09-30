# Gateway staging and E2E readiness — planning interview

Date: 2026-09-30
Status: Draft; decisions in progress. Static inspection only; no deployment or runtime certification performed in this interview.

## Confirmed by user

1. First milestone: accept real Gateway telemetry, persist it, and display it end to end. Full-platform E2E follows.
2. Preserve real Gateway data continuously. E2E data must be separate and must never erase real telemetry.
3. Propose the contract currently supported by the system to the Gateway manager, then obtain confirmation with representative payloads.

## Evidence and blockers

- `infra/docker/docker-compose.prod.yml`: MQTT has no published listener, TLS/authenticator/ACL definition, or persistent broker volume. An external Gateway connection cannot be handed off from this definition as-is.
- `infra/docker/Dockerfile.api`, `Dockerfile.web`, `Dockerfile.worker`: runtime stages invoke pnpm, but enable/install it only in the build stage. Verify and fix runtime tool availability before image acceptance.
- Production worker environment omits JWT and storage configuration required by `packages/domain/src/config/env.ts`; validate service-specific startup configuration.
- Production database initialization mounts only migrations 001/002. Add a controlled migration step for the full current migration ledger; rehearse fresh installation and upgrade without resetting real data.
- `apps/api/src/common/auth/route-policy.ts`: HTTP telemetry ingestion is explicitly denied. Current ingestion transport is MQTT. CONTEXT.md and ADR0005 contain broader HTTPS/Modbus wording that must be reconciled before the handoff contract is published.
- `docs/gateway-implementation-report.md` records unit coverage but explicitly leaves live database/broker, hardware, and browser acceptance unverified. Existing tests are a starting point, not evidence that staging is ready.
- Working tree contains substantial uncommitted changes. Select and verify the exact deployment revision before using Git-based deployment.

## Proposed acceptance sequence — not yet finalized

1. Confirm pilot scope, data isolation, deployment interruption policy, and Gateway firmware capabilities.
2. Fix and verify production images, service environment, migration execution, health checks, public routing, broker security and persistence.
3. Run isolated integration tests with real Timescale/PostgreSQL and MQTT: provision exact identities; publish valid telemetry; assert durable raw data, aggregates, application ACK and API result.
4. Cover replay, concurrent duplicates, late/out-of-order data, unknown identity, wrong topic, malformed payload, timestamp/units/register decoding, persistence failure without application ACK, reconnect and restart.
5. Browser E2E: login, provision the pilot, display the exact emitted sample, freshness/offline states, and cross-school access rejection. Do not accept stale pre-existing data as proof of ingestion.
6. Deploy staging, verify external TLS connection and application response, retain data across redeploy, rehearse backup restore on an isolated target, and perform agreed hardware soak test.
7. Deliver the verified Gateway connection pack and acceptance results; expand E2E to remaining platform workflows afterward.

## Gateway handoff pack to prepare

- Actual broker hostname, listener port, TLS requirements and certificate trust; web URL separately.
- Per-Gateway credentials delivered through a secure channel; publish/subscribe ACL scope.
- Provisioned Gateway name/ID, device UUID/serial, telemetry topic, response/config topics.
- Accepted sample payloads, source timestamp format, units, required fields, register mappings and version behavior.
- Publish QoS/retain policy, application ACK semantics, retry/replay and offline buffering expectations. MQTT PUBACK alone is not proof of database commit.
- Test procedure, expected visible readings, evidence, support contact and change coordination.

## Pending decisions

- Resolved: E2E uses a separate database and broker.
- Resolved: short interruptions permitted after buffering/replay verification; exact duration remains open.
- Resolved: one pilot Gateway; acceptance duration remains open.
- Open: existing Coolify target and available capacity, domain naming, firmware compatibility, traffic envelope, retention/recovery objectives and final acceptance criteria.

## Official deployment references

- https://coolify.io/docs/applications/builds/docker-compose — Git-based Compose configuration, routing, repository bind mounts and Compose-owned health checks.
- https://coolify.io/docs/applications/configuration/persistent-storage — persistent storage configuration; persistence does not replace backup/restore validation.

No ADR accepted yet: infrastructure trade-offs are still under discussion. Update domain glossary only after domain terms are resolved; keep deployment implementation details in this plan.

## Round 2 — confirmed by user

4. E2E uses a separate database and MQTT broker from real-data staging.
5. Short deployment interruptions are acceptable only after offline buffering and replay have been tested successfully.
6. Start with one pilot Gateway, then expand. The proposed 24-hour duration and exact meter count still need acceptance criteria confirmation.

## Further verified findings

- Shared health checks validate configuration values, not live dependency connections (`packages/domain/src/health/dependency-health.ts`). Add actual ingestion readiness evidence; a green HTTP health response alone is insufficient.
- Web Dockerfile does not declare the public API build argument supplied by Compose. Select and verify browser routing; production Compose also omits WEB_URL used by API CORS.
- Existing Gateway smoke scripts use a site-based topic and hardcoded gateway identifier inconsistent with current matching. Replace with provisioned identities and correlate ingestionId/sourceTime, application ACK, durable row and displayed sample.
- MQTT protocol delivery confirmation is distinct from the application's post-COMMIT response. Firmware buffering/retry must be validated against the application response.
- Migration 011 is intentionally pending financial review; its absence must not trigger fabrication or automatic renumbering.
- Updated by round 3: we will provide the broker and add application resources to the existing Coolify installation. Recovery objectives and web access policy remain open; all application roles must be testable.

## Round 3 — confirmed by user

7. We provide and manage the MQTT broker.
8. Corrected by user: a server and Coolify already exist. Add resources for this application to that existing installation; do not provision a new server by default.
9. Staging must support testing every application role for complete end-to-end usage. This does not grant every role administrative permissions: verify allowed actions and denied actions for owner, admin, operator, accountant and school_user.

Confirmed: Gateway handoff follows passing ingestion, persistence and display acceptance; remaining full-role workflows can be tested in parallel and do not block that initial handoff. All-role testing does not itself authorize real financial documents or external notifications.

## Current decision tree

- Gateway-first delivery: confirmed; remaining full-role workflow tests do not block the first Gateway handoff.
- Real-data preservation: confirmed -> isolated E2E database/broker confirmed -> backup/recovery and retention targets open.
- Infrastructure: existing server and Coolify, with our broker -> inspect available capacity and add this application; resource target and domain naming remain open.
- Pilot: one Gateway confirmed -> firmware contract confirmation, traffic and soak criteria open.
- User testing: all roles confirmed -> team-operated test accounts first, then real stakeholders; notification/document test destinations remain open.
- Deployment interruption: conditional acceptance confirmed -> measured replay verification and allowed downtime open.

## Round 4 — corrections and confirmations

- Existing server and Coolify are available. Only this application's resources have not been added. This supersedes the earlier assumption that a new server was required.
- Start Gateway ingestion after its end-to-end path passes, then continue broader workflow testing in parallel.
- The development team initially uses separate test accounts for every role; invite real users after this round succeeds.
- Next infrastructure step is read-only inspection of the selected existing Coolify environment and available capacity, followed by a concrete resource configuration plan.

## Round 5 — target supplied and access check

- User selected existing Coolify project: https://coolify.fowir.com/project/lskcgscsooocwo8o8kwgsgsw
- Project identifier: lskcgscsooocwo8o8kwgsgsw.
- User selected solar.fowir.com for the staging web application. DNS, TLS and Coolify routing are not yet configured or verified. User selected mqtt-solar.fowir.com for MQTT. DNS, TLS and listener configuration remain unverified.
- Read-only HTTP check reached Coolify and redirected to https://coolify.fowir.com/login (HTTP 200 login form). No authenticated project contents, environments, server capacity or resources have been inspected.
- Browser automation could not initialize because its local sandbox helper reported setup refresh errors. The web reader could not access the project. These are inspection limitations, not evidence of a Coolify outage.
- No Coolify resources, DNS records, certificates, users or credentials were created or modified.
- Follow-up evidence needed: selected environment/server and available resources from the authenticated project. Do not infer capacity or existing resource configuration from the project URL.

## Round 6 — web domain selected

- Confirmed web domain: solar.fowir.com; intended web URL: https://solar.fowir.com.
- This hostname identifies the staging environment despite not containing the word staging.
- MQTT hostname subsequently confirmed as mqtt-solar.fowir.com; listener and TLS configuration remain to be verified.
- No DNS or Coolify configuration changed in this step.

## Round 7 — MQTT domain and supplied UI evidence

- User confirmed MQTT hostname: mqtt-solar.fowir.com.
- Web hostname remains solar.fowir.com.
- Supplied screenshot shows Coolify v4.0.0-beta.463, New Resource page, with environment production selected. It does not show server capacity, selected deployment server, or existing application resources.
- Recommend a dedicated staging environment within the selected project to match intended usage. This is a pending proposal, not a configuration change.
- DNS, certificates, listener port, broker authentication and topic ACL still require setup and verification. Neither hostname is yet a verified working endpoint.

## Round 8 — user-supplied server capacity snapshot

- Selected server shown in Coolify: live; shell hostname: Zircle-Live.
- nproc: 2 CPUs. Memory: 3.8 GiB total, 1.1 GiB used, 2.7 GiB available. Swap: none.
- Root filesystem: 116 GB total, 106 GB available, 9% used.
- Snapshot includes existing mock-server, app-chat, app-invoice, Coolify proxy and sentinel containers. Preserve these workloads.
- These are user-supplied point-in-time readings, not peak-load measurements or proof that the additional stack fits.
- Proposed approach: evaluate the existing machine for the one-Gateway pilot with measured memory/CPU limits and headroom. Build images and execute isolated E2E outside this host, then deploy tested images through Coolify. This avoids concurrent build/test pressure on existing applications.
- Pilot acceptance must measure full-stack steady state, replay bursts, restarts and deployment peaks. If headroom is insufficient, upgrade or isolate infrastructure before expansion. No guaranteed memory budget or capacity conclusion yet.
- Confirmed in round 9: automated repository CI builds and tests, outside the staging host.

## Round 9 — automated build and testing selected

- User selected automatic build and E2E when code is pushed to the repository, instead of manual development-machine builds.
- Verified Git origin: https://github.com/nateekarni/solar-roof.git. No existing .github directory or alternative CI configuration was found at the inspected root paths.
- Proposed implementation: GitHub Actions on hosted runners; isolated test database/broker; build images, test the built images, and publish the passing revision to GitHub Container Registry. Coolify pulls immutable revision tags/digests.
- Confirmed pipeline: work on separate feature/fix branches -> pull request checks -> merge into main -> main revision build and E2E acceptance -> publish immutable images -> automatically trigger Coolify deployment -> staging smoke test on dedicated test identities. main is the staging deployment branch.
- Serialize deployments and migrations. Failed checks prevent deployment. Production data never enters disposable CI fixtures. Keep existing unrelated server applications running.
- Subsequently confirmed: deploy automatically after merge into main, only after checks pass. No manual deployment approval step is requested for that workflow. No CI files, registry packages or remote resources have been created during this planning interview.

## Round 10 — main is staging, automatic deployment confirmed

- User works on separate branches for individual changes and merges completed work into main.
- main is the staging branch. After merge, build and E2E must pass for that exact revision before automatic deployment to the existing Coolify target.
- Feature branches and pull requests run checks without deploying to the shared real-data staging environment.
- Disable any independent deploy-on-push trigger that would bypass passing CI. Deploy immutable image versions for the tested commit.
- Deployment jobs must be serialized; do not interrupt an in-progress database migration when a newer commit arrives.
- CI or build failure blocks deployment and leaves the existing running revision in place. Post-deployment smoke failures require reporting and a defined recovery procedure; image rollback must not imply automatic database rollback.
- Branch protection/required checks configuration remains to be verified during implementation; do not claim main is protected yet.

## Round 11 — prepare Gateway handoff now

- User approved preparing a draft for the Gateway manager immediately and investigating integration issues during the pilot, without waiting for a 24-hour soak.
- Keep the short deploy -> connect -> persist -> display acceptance check before declaring the endpoint ready for actual use.
- Created docs/gateway-handoff/gateway-connection-draft-th.md and message-to-gateway-manager-th.txt for external handoff; internal-release-checklist.md tracks activation evidence.
- Documents mark the endpoints as not yet verified, preserve pending port/credentials/device identities, and request firmware compatibility and sample payload confirmation.
- No external message sent and no deployment performed in this documentation step.

## Round 12 — readiness explanation and detailed runbook

- User explicitly confirmed MQTT remains the incoming transport; Gateway pushes data itself. No new HTTP POST ingestion is requested.
- Reinspection confirms deployment blockers still exist; prior work produced planning/handoff documents, not deployment implementation.
- Added docs/runbooks/coolify-staging-deployment-th.md with prerequisite fixes, CI/image publication, DNS, Coolify setup, runtime variables, broker TLS/ACL, migrations, smoke checks and recovery procedure.
- Guide clearly marks proposed files/settings and unexecuted steps. No deployment or CI implementation occurred in this step.
