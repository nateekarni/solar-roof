# Fast Release CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish immutable API, Worker, and Web digests from `main` in a 5–8 minute warm-cache target while moving exhaustive platform and infrastructure checks out of the application release critical path.

**Architecture:** Add a cancellable Fast Release workflow for application verification, candidate image smoke, and parallel GHCR publication. Convert the existing workflow into non-cancellable Deep Verification for infrastructure, recovery, capacity, browser, and platform checks, and isolate staging deployment in a manual workflow. Refactor application Dockerfiles so dependency installation is cached independently from source changes.

**Tech Stack:** GitHub Actions, Docker Buildx, Docker Compose, Node.js 24.20.0, pnpm 11.24.0, Node test runner, GHCR, Coolify

**Spec:** `docs/superpowers/specs/2026-10-22-fast-release-ci-design.md`

## Global Constraints

- Production continues pulling immutable image digests and never builds application source.
- Fast Release publishes exactly `api`, `worker`, and `web` for one commit SHA.
- Production deployment remains manual; Fast Release receives no Coolify credential or mutation permission.
- Pull requests verify and smoke but never publish.
- Infrastructure changes require Deep Verification and cannot produce a Fast Release-ready summary.
- Deep Verification and deployment are non-cancellable after starting.
- Fast Release is cancellable by a newer commit on the same branch or pull request.
- Existing MQTT, certificate, recovery, capacity, migration, readiness, and rollback guarantees remain intact.

---

### Task 1: Release path classifier and CI contract tests

**Files:**
- Create: `scripts/ci/classify-release.mjs`
- Create: `scripts/ci/classify-release.test.mjs`
- Create: `scripts/ci/fast-release-workflow.test.mjs`

**Interfaces:**
- Consumes: newline-delimited repository paths on stdin, or `git diff --name-only <base> <head>` when two revisions are supplied.
- Produces: stdout JSON `{ "infrastructure": boolean, "paths": string[] }`; when `GITHUB_OUTPUT` is set, appends `infrastructure=true|false`.
- Produces: static workflow contract assertions consumed by `node --test scripts/ci/*.test.mjs`.

- [ ] **Step 1: Write failing classifier tests**

Cover application paths as releasable and each protected family as infrastructure:

```js
assert.deepEqual(classify(['apps/api/src/main.ts']), {infrastructure:false,paths:[]});
assert.equal(classify(['infra/docker/Dockerfile.mqtt']).infrastructure,true);
assert.equal(classify(['infra/docker/postgres-backup/Dockerfile']).infrastructure,true);
assert.equal(classify(['infra/docker/docker-compose.web.yml']).infrastructure,true);
assert.equal(classify(['scripts/ci/integration.sh']).infrastructure,true);
assert.equal(classify(['.github/workflows/fast-release.yml']).infrastructure,true);
```

- [ ] **Step 2: Run classifier tests and observe RED**

Run: `node --test scripts/ci/classify-release.test.mjs`

Expected: FAIL because `classify-release.mjs` does not exist.

- [ ] **Step 3: Implement deterministic classification**

Export `classifyReleasePaths(paths: string[])` and keep the protected prefixes explicit. The CLI validates revisions before invoking `git diff`, normalizes `/`, deduplicates paths, writes JSON, and writes the boolean output without interpolating untrusted path text into shell commands.

- [ ] **Step 4: Run classifier tests and observe GREEN**

Run: `node --test scripts/ci/classify-release.test.mjs`

Expected: all classifier cases pass.

- [ ] **Step 5: Write failing workflow contract tests**

Assert the intended boundaries before workflow files exist:

```js
assert.match(fast, /cancel-in-progress:\s*true/);
assert.match(fast, /packages:\s*write/);
assert.doesNotMatch(fast, /COOLIFY_API_TOKEN/);
assert.match(fast, /web-first-smoke\.sh/);
assert.match(fast, /for app in api worker web/);
assert.match(deep, /recovery-drill\.sh|drills-capacity/);
assert.doesNotMatch(deep, /Deploy Tested Digests to Staging/);
assert.match(deploy, /workflow_dispatch/);
assert.match(deploy, /cancel-in-progress:\s*false/);
```

- [ ] **Step 6: Run workflow contract tests and observe RED**

Run: `node --test scripts/ci/fast-release-workflow.test.mjs`

Expected: FAIL because the Fast Release and separate staging deployment workflows do not exist and the current combined workflow still contains deployment.

- [ ] **Step 7: Commit classifier tests and implementation**

```bash
git add scripts/ci/classify-release.mjs scripts/ci/classify-release.test.mjs scripts/ci/fast-release-workflow.test.mjs
git commit -m "test(ci): define fast release contracts"
```

### Task 2: Split Fast Release, Deep Verification, and staging deployment

**Files:**
- Create: `.github/workflows/fast-release.yml`
- Modify: `.github/workflows/ci-staging.yml`
- Create: `.github/workflows/deploy-staging.yml`
- Test: `scripts/ci/fast-release-workflow.test.mjs`

**Interfaces:**
- Consumes: classifier output `infrastructure` from Task 1.
- Produces: GHCR digests named `API_IMAGE`, `WORKER_IMAGE`, and `WEB_IMAGE` in the Fast Release summary.
- Produces: manual staging deployment inputs `commit_sha`, `api_image`, `worker_image`, `web_image`, `mqtt_image`, and `certbot_image`.

- [ ] **Step 1: Add the Fast Release workflow**

Use `push(main)`, `pull_request`, and `workflow_dispatch`; ignore documentation-only changes. Add branch/PR concurrency with cancellation. Keep global `contents: read` and grant `packages: write` only to the candidate publication job.

The jobs are:

```yaml
jobs:
  classify:
    outputs:
      infrastructure: ${{ steps.paths.outputs.infrastructure }}
  verify-fast:
    # existing unit/lint/build/script/performance checks
  application-candidate:
    needs: [classify, verify-fast]
    if: needs.classify.outputs.infrastructure != 'true'
    permissions:
      contents: read
      packages: write
```

Build API, Worker, Web, and the local PostgreSQL backup smoke fixture in parallel with image-scoped GHA caches. The fixture is never published by Fast Release. Run `infra/ci/web-first-smoke.sh`. For non-PR events, login to GHCR, push API/Worker/Web concurrently, wait for all pushes, validate each `RepoDigest`, then write the complete set to `GITHUB_OUTPUT` and `GITHUB_STEP_SUMMARY` only after all three validate.

- [ ] **Step 2: Convert the combined workflow to Deep Verification**

Rename the displayed workflow to `Deep Verification`. Trigger it nightly, manually, and on `main`/pull-request changes to infrastructure path families. Retain managed MQTT, certificates, browser regression, platform regression, recovery, capacity, evidence upload, and infrastructure publication. Keep `cancel-in-progress: false`. Remove the Fast Verification job and the staging deployment job because they move to dedicated workflows.

- [ ] **Step 3: Add isolated manual staging deployment**

Create a `workflow_dispatch` workflow with required immutable digest inputs and commit SHA. Keep `contents: read`, use non-cancelling deployment concurrency, reject a SHA that is not current `main`, and invoke `scripts/ci/coolify-deploy.mjs` with staging environment secrets. It must not trigger from Fast Release automatically.

- [ ] **Step 4: Run workflow contract tests and observe GREEN**

Run: `node --test scripts/ci/fast-release-workflow.test.mjs scripts/ci/classify-release.test.mjs scripts/ci/coolify-deploy.test.mjs`

Expected: all contract, classifier, and deployment safety cases pass.

- [ ] **Step 5: Validate workflow YAML**

Run a Node script using the repository-resolved YAML parser to load all files in `.github/workflows/` and fail on parse errors. Confirm `git diff --check` is clean.

- [ ] **Step 6: Commit workflow split**

```bash
git add .github/workflows/fast-release.yml .github/workflows/ci-staging.yml .github/workflows/deploy-staging.yml scripts/ci/classify-release.mjs scripts/ci/classify-release.test.mjs scripts/ci/fast-release-workflow.test.mjs
git commit -m "feat(ci): add fast application release lane"
```

### Task 3: Cache application dependencies before source copy

**Files:**
- Create: `scripts/ci/docker-build-cache.test.mjs`
- Modify: `infra/docker/Dockerfile.api`
- Modify: `infra/docker/Dockerfile.worker`
- Modify: `infra/docker/Dockerfile.web`

**Interfaces:**
- Consumes: root/workspace package manifests and `pnpm-lock.yaml`.
- Produces: a stable `dependencies` Docker stage shared by each image's build stage within that Dockerfile.

- [ ] **Step 1: Write failing Dockerfile ordering tests**

For each application Dockerfile, assert:

```js
assert.ok(file.indexOf('COPY package.json pnpm-lock.yaml pnpm-workspace.yaml') < file.indexOf('RUN pnpm install --frozen-lockfile'));
assert.ok(file.indexOf('RUN pnpm install --frozen-lockfile') < file.indexOf('COPY . .'));
assert.match(file, /COPY packages\/domain\/package\.json/);
assert.match(file, /USER app/);
```

- [ ] **Step 2: Run Docker cache tests and observe RED**

Run: `node --test scripts/ci/docker-build-cache.test.mjs`

Expected: FAIL because current Dockerfiles copy all source before dependency installation.

- [ ] **Step 3: Refactor all three Dockerfiles**

In each file, copy the root manifest, lockfile, workspace file, all three app manifests, and all five package manifests before `pnpm install --frozen-lockfile`. Then copy the repository source and run the existing target build. Preserve Node/pnpm versions, runtime working directory, non-root user, exposed port, and command.

- [ ] **Step 4: Run Docker cache tests and application builds**

Run:

```bash
node --test scripts/ci/docker-build-cache.test.mjs
docker build -f infra/docker/Dockerfile.api -t solar-api:fast-release-test .
docker build -f infra/docker/Dockerfile.worker -t solar-worker:fast-release-test .
docker build -f infra/docker/Dockerfile.web -t solar-web:fast-release-test .
```

Expected: tests pass and all three builds exit 0.

- [ ] **Step 5: Commit Docker cache boundaries**

```bash
git add scripts/ci/docker-build-cache.test.mjs infra/docker/Dockerfile.api infra/docker/Dockerfile.worker infra/docker/Dockerfile.web
git commit -m "perf(ci): cache application dependencies"
```

### Task 4: Update operator documentation

**Files:**
- Modify: `.github/CI.md`
- Modify: `docs/runbooks/coolify-web-first-deployment-th.md`
- Modify: `docs/superpowers/specs/2026-10-22-fast-release-ci-design.md`

**Interfaces:**
- Consumes: workflow names and digest summary contract from Task 2.
- Produces: exact operator guidance for Fast Release, Deep Verification, manual Coolify promotion, and rollback.

- [ ] **Step 1: Write failing documentation assertions**

Extend `scripts/ci/fast-release-workflow.test.mjs` to require the docs to name `Fast Release`, list exactly `API_IMAGE`, `WORKER_IMAGE`, `WEB_IMAGE`, state that Production remains manual, and state that infrastructure changes require Deep Verification.

- [ ] **Step 2: Run documentation assertions and observe RED**

Run: `node --test scripts/ci/fast-release-workflow.test.mjs`

Expected: FAIL because the current runbooks still direct operators to wait for the combined six-image workflow.

- [ ] **Step 3: Update CI and Coolify runbooks**

Document:

- application releases use the three digests from Fast Release;
- PostgreSQL/MQTT/Certbot digests remain unchanged for application-only releases;
- Deep Verification is nightly/manual and mandatory for protected infrastructure paths;
- Production remains a manual Coolify variable update and deploy;
- rollback restores the previous three application digests;
- the local smoke fixture PostgreSQL image is built but not published by Fast Release.

Update the spec's PostgreSQL fixture wording to the implemented local-build behavior, removing the unconfirmed repository-variable dependency.

- [ ] **Step 4: Run documentation assertions and observe GREEN**

Run: `node --test scripts/ci/fast-release-workflow.test.mjs`

Expected: all workflow and documentation assertions pass.

- [ ] **Step 5: Commit documentation**

```bash
git add .github/CI.md docs/runbooks/coolify-web-first-deployment-th.md docs/superpowers/specs/2026-10-22-fast-release-ci-design.md scripts/ci/fast-release-workflow.test.mjs
git commit -m "docs(ci): document fast release promotion"
```

### Task 5: Full verification, push, and live workflow check

**Files:**
- Verify all modified files from Tasks 1–4.

**Interfaces:**
- Produces: pushed `main` commits and GitHub Actions run links/status for the new workflow layout.

- [ ] **Step 1: Run all CI helper tests**

Run: `node --test scripts/ci/*.test.mjs`

Expected: 0 failures.

- [ ] **Step 2: Run application verification**

Run:

```bash
pnpm build
pnpm lint
pnpm test
```

Expected: all commands exit 0.

- [ ] **Step 3: Run Compose and formatting validation**

Run the existing deployment configuration tests, `docker compose config --quiet` for the Web deployment with test-safe immutable image variables, and `git diff --check`.

Expected: all exit 0.

- [ ] **Step 4: Review changes and repository state**

Confirm only plan-scoped files changed, no secrets or generated artifacts are staged, and `main` is not behind `origin/main`.

- [ ] **Step 5: Commit remaining verification-only changes, if any**

No empty commit. If verification required a real scoped fix, commit it with a message describing that fix and rerun the failed command.

- [ ] **Step 6: Push main**

Run: `git push origin main`

Expected: remote `main` advances to the verified local HEAD without force.

- [ ] **Step 7: Inspect GitHub Actions**

Confirm the infrastructure-changing implementation commit triggers Deep Verification and that Fast Release classifies it as infrastructure rather than publishing an application-ready summary. Report links, live status, and any remaining operator action without claiming CI success while a run is pending.
