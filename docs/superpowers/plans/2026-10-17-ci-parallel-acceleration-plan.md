# CI and Staging Parallel Acceleration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce CI pipeline turnaround time from 35-45 minutes down to ~5-7 minutes by eliminating 16x Docker Compose recreate cycles, enabling Docker BuildKit GHA caching, and splitting the monolithic workflow into concurrent jobs (Option A: PR fast-path, full gate on main).

**Architecture:** 
1. Refactor `scripts/ci/platform-check.sh` so `all-fast` spins up a single Docker Compose environment once, running database resets and API restarts between test suites instead of recreating containers and volumes 16 times.
2. Upgrade Docker builds in CI to Docker Buildx with GitHub Actions layer cache (`type=gha,mode=max`) and parallel image generation.
3. Restructure `.github/workflows/ci-staging.yml` from a single 45-minute sequential job into parallel jobs: `verify-fast` (unit, lint, build), `build-images` (Buildx cache), `platform-browser` (smokes, integration, platform tests), and `drills-capacity` (recovery 190s pause & 90-day load test, run on `main` / full release).

**Tech Stack:** GitHub Actions, Docker Compose, Docker Buildx, pnpm, Node.js 24, Bash, PostgreSQL.

**Spec:** User decision on Option A (PR fast-path + main gate, reuse stack, Buildx cache, parallel jobs).

## Global Constraints
- Preserve full test fidelity: all 16 platform suites, browser tests, and integration tests must run with authentic PostgreSQL and API isolation.
- Keep staging deployment security: staging must only deploy immutable images verified by all required gates on `main`.
- Backward compatibility: running individual platform suites (`platform-check.sh invitation`) must continue to work seamlessly.

---

### Task 1: Refactor `scripts/ci/platform-check.sh` to Reuse Docker Stack Across Suites

**Files:**
- Modify: `scripts/ci/platform-check.sh`
- Modify: `scripts/ci/isolated-stack.sh`

- [ ] **Step 1: Inspect and adjust `scripts/ci/isolated-stack.sh` for multi-suite session support**
  Allow a caller to hold the lock across multiple suites if an environment variable (e.g. `PLATFORM_CI_PERSIST_STACK=true`) is present, so `cleanup` only tears down the stack at the very end of `all-fast`.

- [ ] **Step 2: Refactor `platform-check.sh all-fast` loop**
  Instead of spawning `bash "$0" "$item"` 16 times (each causing full teardown and recreate), spin up the compose stack with all required overlays (`infra/ci/compose.yml`, `infra/ci/request-edge.yml`, `infra/ci/report-worker.yml`, `infra/ci/energy-read-model.yml`, `infra/ci/production-finance.yml`) once.
  Between suites:
  - Truncate / reset PostgreSQL database tables to clean baseline state.
  - Restart the `api` container and wait for `$READINESS_API_URL/ready`.
  - Run the specific suite test commands.

- [ ] **Step 3: Validate bash syntax and local script execution**
  Run `bash -n scripts/ci/platform-check.sh` and `bash -n scripts/ci/isolated-stack.sh`.
  Run `node --test scripts/ci/*.test.mjs` to ensure CI script helper unit tests pass.

- [ ] **Step 4: Commit Task 1**
  Commit message: `perf(ci): reuse docker compose stack across platform suites in platform-check`

---

### Task 2: Implement Docker Buildx and GitHub Actions Layer Cache

**Files:**
- Modify: `.github/workflows/ci-staging.yml`
- Optional: Add Docker BuildKit caching / bake configuration

- [ ] **Step 1: Add Docker Buildx setup step**
  Use `docker/setup-buildx-action@v3` with cache export capabilities.

- [ ] **Step 2: Upgrade image build loop with BuildKit GHA cache and concurrency**
  Replace standard sequential `docker build` with `docker buildx build --cache-from=type=gha --cache-to=type=gha,mode=max --load`.
  Build images with background execution or Buildx bake to utilize all available CPU cores concurrently.

- [ ] **Step 3: Commit Task 2**
  Commit message: `perf(ci): accelerate docker image builds with buildx and gha layer cache`

---

### Task 3: Restructure Workflow into Parallel Jobs (Option A)

**Files:**
- Modify: `.github/workflows/ci-staging.yml`

- [ ] **Step 1: Configure `paths-ignore` for documentation on PRs**
  Add `paths-ignore: ['docs/**', '**.md']` for `pull_request` trigger to avoid redundant 45-minute runs on pure documentation edits.

- [ ] **Step 2: Create `verify-fast` Job**
  Move `pnpm build && pnpm lint && pnpm test`, `node --test scripts/ci/*.test.mjs`, `recovery-sampler.test.py`, and `capacity-policy.test.ts` to `verify-fast`.
  Runs on Ubuntu with Node 24 and pnpm cache. Finishes in ~2 minutes.

- [ ] **Step 3: Create `build-images` Job**
  Builds the 6 images (`api`, `worker`, `web`, `mqtt`, `certbot`, `postgres-backup`) using Buildx and GHA cache.
  On `main` or when needed, publishes images or caches them for downstream consumption.

- [ ] **Step 4: Create `platform-browser` Job (depends on `build-images`)**
  Runs smoke tests, browser tests, `integration.sh`, and `platform-check.sh all-fast --prebuilt`.
  Takes ~4.5 minutes (down from 20 minutes).

- [ ] **Step 5: Create `drills-capacity` Job (Option A Policy)**
  Configure `drills-capacity` to run on `push: branches: [main]` or `workflow_dispatch`, or concurrently on PRs without blocking fast feedback.
  Runs `recovery-drill.sh` and `platform-load.sh`.

- [ ] **Step 6: Update `deploy-staging` Job Dependencies**
  `deploy-staging` requires `needs: [verify-fast, platform-browser, drills-capacity]` before releasing to Coolify.

- [ ] **Step 7: Commit Task 3**
  Commit message: `feat(ci): split verification into parallel jobs with fast PR feedback and staging gates`

---

### Task 4: Complete Pipeline Verification & Documentation

**Files:**
- Modify: `docs/adr/0042-ci-parallel-acceleration-and-stack-reuse.md` (record the architectural decision)

- [ ] **Step 1: Document ADR 0042**
  Record the architectural decisions: Docker stack reuse across platform suites, Docker Buildx caching, and multi-job parallel workflow with Option A policy.

- [ ] **Step 2: Run verification checks on local workspace**
  - `pnpm lint`
  - `pnpm test`
  - Validate all workflow and shell files
  
- [ ] **Step 3: Commit Task 4**
  Commit message: `docs(adr): record ADR 0042 for ci parallel acceleration and stack reuse`
