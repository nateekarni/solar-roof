# 0042. CI Acceleration via Docker Stack Reuse, BuildKit Layer Caching, and Multi-Job Parallelism

Date: 2026-10-17

## Status

Accepted

## Context

Automated CI on GitHub Actions (`.github/workflows/ci-staging.yml`) took **32 to 45 minutes** to verify every commit and pull request. Analysis of execution logs revealed three primary bottlenecks:

1. **Monolithic Sequential Pipeline**: Every step (pnpm build/lint/test, Docker builds, smoke tests, browser tests, integration, 16 platform suites, recovery drill, load test) executed sequentially on a single 2-core Ubuntu runner.
2. **Platform Check Docker Teardown Loop**: `scripts/ci/platform-check.sh all-fast` dispatched 16 platform test suites by repeatedly invoking subshells (`bash "$0" "$item"`). Each subshell initialized `isolated-stack.sh`, which executed `docker compose up -d --wait` (waiting for database, redis, and api readiness) and on exit executed `docker compose down --volumes`. This forced Docker Compose to create and tear down containers, networks, and volumes 16 times in succession, squandering ~11-12 minutes on container lifecycle overhead while actual test execution took under 3 minutes.
3. **Sequential Docker Image Generation without Layer Cache**: Six container images (`api`, `worker`, `web`, `mqtt`, `certbot`, `postgres-backup`) were built sequentially using plain `docker build`, without Docker BuildKit or GitHub Actions layer caching, consuming 4.5 minutes on every run regardless of whether dependencies or Dockerfiles changed.
4. **Heavy Hardcoded Drills in Fast PR Feedback**: `recovery-drill.sh` contains an intentional 190-second fault-injection pause to verify sampler continuity during frozen backups, and `platform-load.sh` generates 90 days of synthetic telemetry. Running these on every small PR branch inflated cycle time unnecessarily.

## Decision

1. **Docker Compose Stack Reuse Across Platform Suites (`scripts/ci/platform-check.sh` & `scripts/ci/isolated-stack.sh`)**:
   - Introduce `PLATFORM_CI_SESSION` and `PLATFORM_CI_STACK_REUSED` session awareness in `isolated-stack.sh`.
   - In `all-fast` mode, the stack is brought up once with all needed overlays.
   - Subsequent test suites detect the active session lock, reuse the running stack, restart the API container to reset in-memory budgets and rate limits, and execute their tests.
   - The entire Compose stack is torn down cleanly once at the end of `all-fast`.
   - Single-suite runs (`platform-check.sh <suite>`) continue to be fully disposable and self-cleaning.

2. **Docker Buildx with GitHub Actions Layer Caching**:
   - Configure `docker/setup-buildx-action@v3`.
   - Build candidate images in parallel background subshells (`&` + `wait`) using BuildKit.
   - Export and import layer caches with `--cache-from=type=gha,scope=$app` and `--cache-to=type=gha,mode=max,scope=$app`.
   - Load built images directly into the local Docker daemon with `--load`.

3. **Multi-Job Parallel Workflow Architecture (Option A)**:
   - **`verify-fast` (Unit, Lint, Build - ~2 min)**: Runs in parallel without Docker to provide immediate feedback to developers on PRs.
   - **`verify-platform` (Smokes, Browser & Platform Suites - ~6 min)**: Builds images in parallel with Buildx GHA cache, runs smoke tests, integration, and fast stack-reusing platform regression tests. Manages its own `browser-server.sh` container lifecycle for browser verification suites.
   - **`drills-capacity` (Disaster Recovery 190s & 90-day Load Test - ~7 min)**: Runs concurrently with `verify-platform` on `main` and `workflow_dispatch`, avoiding blocking normal PR workflows. Because `platform-load.sh` (`mixed-load.ts`) concurrently exercises browser latency (`measurePages`) during steady and burst phases, `drills-capacity` manages an independent `browser-server.sh` container instance started immediately prior to the capacity drill and cleaned up on exit.
   - **`deploy-staging`**: Gatekeeper requiring all three jobs (`verify-fast`, `verify-platform`, `drills-capacity`) before releasing immutable image digests to staging via Coolify.
   - Add `paths-ignore: ['docs/**', '**.md']` on pull requests to skip CI when only documentation is updated.

## Consequences

- PR verification turnaround decreases from **35-45 minutes to ~5-6 minutes** (>80% reduction).
- Documentation-only PRs run in 0 seconds.
- Staging deployment safety remains 100% intact: every immutable release digest deployed to Coolify continues to pass the complete battery of unit, platform, recovery, and capacity gates.
- Resource usage on GitHub Actions runners is drastically reduced by caching image layers and eliminating 15 redundant container boot/shutdown loops.
- Browser test isolation is maintained across parallel runner VMs by scoping container ownership (`solar-ci-browser-$owner`) to each job (`$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT-$GITHUB_JOB`).
