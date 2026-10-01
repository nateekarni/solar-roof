# Isolated platform baseline

Run `bash scripts/ci/platform-check.sh harness` from the checkout. The runner builds API, worker and web sequentially, takes a shared exclusive lock for the fixed localhost ports, creates a UUID Compose project, and removes only that run's project. `integration.sh` shares the lock. Unknown or unfinished suites fail before Docker starts. `all-fast` currently declares only `harness` and lists unfinished suites explicitly.

`--prebuilt` is restricted to CI with HEAD equal to GITHUB_SHA and all three images bearing the same revision label. CI builds those images in the immediately preceding build step. Local execution always builds the working tree. A lock left by an interrupted host requires an operator to verify that its owning run has exited before removing the lock; runners never guess that another project is abandoned.

The fixture contains 100 schools, 100 sites, 100 gateways, 1,000 meters and 3,000 raw readings (three samples per meter spaced one minute apart), two school memberships with different roles, and an invoice. The harness runs the actual migration executable from baseline commit `098c14748fd6cb5ee8a405f58a5bd5ebef5fd798` into a unique test-owned schema, inserts the fixture, reruns the current migration executable and verifies full user, reading and document snapshots. Historical migration content is checked against Git; checkout line-ending conversion is normalized only for that identity check, while both executable runs retain original checkout bytes and unchanged checksum semantics. It also creates an independent fresh schema without financial proposal 011. Compose separately creates a fresh database with the application's actual migration command.

The safety guard permits only PostgreSQL URLs pointing to loopback port 15432 and database `solar_readiness`, without URL query overrides or fragments. Caller-supplied external readiness endpoints fail before resources are created. Schema cleanup uses only generated names successfully created by the test.

`test/artifacts/platform-baseline.json` records tested Git revision, host and Docker CPU/memory, Node version, fixture row counts, query row counts, serialized response bytes, elapsed milliseconds and cache state. The measurements are one warm execution after insertion, useful for regression comparisons under the same environment. They are not evidence that 1,000 messages/minute, 50 concurrent users, a 2-second page target, or recovery/archive targets pass.

Request logs contain generated request IDs, HTTP method, route templates and status only. Duration labels allow only `route-template`, `method` and `status`. Query timings never contain SQL or parameter values. Metrics aggregate duration sums and observation counts (mean = sum/count), ingress counters and the latest pool waiting count in at most 256 series. Aggregates flush every 30 seconds; logs stop writing until stdout drains when the destination applies backpressure. This is a bounded operational baseline, without percentile histograms or an external metrics collector.

Duration timing covers `DatabaseService.query`; direct `PoolClient` transaction statements are outside that path. ACK timing covers receipt through the MQTT publish callback after durable commit.

Measured on 2026-10-01: Windows host Node 26.5.0 / pnpm 11.24.0, 12 logical CPUs and 34,243,780,608 bytes RAM; Docker allocated 12 CPUs and 4,105,277,440 bytes RAM. API, worker and web service images use pinned Node 24.20.0 / pnpm 11.24.0. Assertions and migration subprocesses ran on host Node. The source was the B1 working tree on Git base `098c14748fd6cb5ee8a405f58a5bd5ebef5fd798`, before the B1 commit; the run's JSON stores that base revision.

| Query | SQL shape | Rows | JSON bytes | Warm milliseconds |
| --- | --- | ---: | ---: | ---: |
| Sites | `SELECT id,name FROM sites ORDER BY name` | 100 | 6291 | 2.685 |
| Latest reading | Site-scoped raw readings ordered by source time, limit 1 | 1 | 101 | 2.605 |
| Tenant sites | `SELECT id,name FROM sites WHERE school_id=$1` | 1 | 63 | 1.284 |
| Documents | Site-scoped document number and amount | 1 | 64 | 0.980 |

Final sequential image build and unmounted harness passed (5 tests, 0 failures, 0 skips). Existing `integration.sh` passed real HTTP authorization/tenant isolation, MQTT durable ACK/replay, malformed payload redaction, actual dashboard SQL, PostgreSQL/MQTT/storage outage recovery, API restart and browser/mobile checks with zero page errors. A short unmounted rerun verified the final all-fast contention assertion on the same images. Integration logs contain all seven expected metric names and no `test-secret` marker.

Docker reports image sizes of 2.69 GB for API and worker and 2.96 GB for web. These are observations of the existing full-workspace/dependency Dockerfiles, with no image-size improvement claimed. Download speed warnings, package-update notices and occasional Docker Desktop pipe/http2 diagnostics occurred between otherwise successful builds. A redundant all-fast build was cancelled before replacing any tested image; its abandoned lock was removed only after verifying the recorded owner PID had exited and its exact UUID project had no Docker containers or networks.
