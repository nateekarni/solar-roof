# Fast Release CI Design

Date: 2026-10-22
Status: Approved design, pending implementation plan

## 1. Context

Production runs on a resource-constrained Coolify host. Application images must continue to be built outside Production and deployed by immutable digest. Building from Git source on the Production host is intentionally excluded because dependency installation and Next.js/API builds can compete with live workloads for CPU, memory, and disk.

The current `CI and staging` workflow combines release-critical verification, six image builds, browser and platform regression, disaster-recovery drills, capacity tests, image publication, and optional staging deployment. In the completed run for commit `ce8252a`, Fast Verification finished in about 2 minutes, while Platform Regression, Smokes & Acceptance took about 24 minutes. Within that job, application image builds took about 3.5 minutes, isolated platform regression about 8 minutes, serial publication of six images about 4.25 minutes, and Buildx cleanup about 2.3 minutes. Disaster Recovery & Capacity ran in parallel and took about 16.5 minutes.

The goal is to make immutable Web/API/Worker image digests available quickly without moving build work to Production or presenting an untested image as release-ready.

## 2. Goals

- Publish immutable `api`, `worker`, and `web` image digests within a target of 5–8 minutes for a normal application-only change on a warm cache.
- Keep the existing production model: Coolify pulls images and does not build application source.
- Keep mandatory unit, lint, type, build, migration, startup, readiness, login, and Web/API integration coverage before an application image is marked Fast Release ready.
- Preserve complete deep regression, recovery, capacity, managed MQTT, certificate, and infrastructure verification without blocking application image availability.
- Prevent an older commit from delaying a newer application release when no deployment has started.
- Preserve immutable SHA tags and digest-based rollback.
- Keep production deployment manual during this change; publishing a digest must not automatically modify Production.

## 3. Non-goals

- Building Web/API/Worker on the Coolify production host.
- Automatically deploying Production from GitHub Actions.
- Weakening database migration ordering, health checks, immutable image references, or release evidence.
- Fast-publishing MQTT, Certbot, or PostgreSQL backup infrastructure images without their existing infrastructure verification.
- Removing deep verification or treating nightly results as optional maintenance.
- Introducing a remote Turbo cache service or paid larger GitHub runner in the first iteration.

## 4. Considered approaches

### A. Separate Fast Release and Deep Verification workflows — selected

Fast Release performs the bounded application release gate and publishes application images. Deep Verification performs exhaustive platform, infrastructure, recovery, and capacity checks independently. This gives the clearest status, allows different concurrency rules, and avoids an old deep run blocking a new application digest.

### B. Add a fast publication job to the existing workflow

This is a smaller YAML edit, but it duplicates builds, leaves workflow-level non-cancelling concurrency in place, and makes one workflow simultaneously report an early releasable result and a later deep result. Operators could mistake the overall workflow state for the application-release state.

### C. Fully path-aware release manifests in one workflow

Building only the exact affected image is the theoretical fastest approach, but a deployment needs a complete compatible set of API, Worker, Web, and infrastructure digests. Resolving unchanged digests from a durable release manifest adds state and rollback complexity. This can be added after the two-lane pipeline is stable.

## 5. Workflow architecture

### 5.1 Fast Release

Add a dedicated workflow for pushes to `main`, application pull requests, and manual dispatches. Documentation-only changes remain ignored. Pull requests run verification and smoke without publishing. Its workflow-level concurrency is scoped to the branch or pull request and uses `cancel-in-progress: true` because this workflow publishes immutable SHA-addressed artifacts and does not deploy Production. Cancelling an older run cannot replace or mutate an already published digest.

The workflow contains three gates:

1. **Fast verification**
   - checkout with credentials disabled;
   - exact Node and pnpm versions from the repository;
   - cached pnpm store;
   - frozen dependency install;
   - package build, application build, lint, unit tests, CI script tests, recovery sampler unit tests, and lightweight performance policy tests.
2. **Application candidate build, smoke, and publication**
   - start only after Fast verification succeeds;
   - build `solar-api`, `solar-worker`, and `solar-web` in parallel with Buildx GHA caches scoped per image;
   - build the PostgreSQL backup image locally in parallel as the fixture expected by `web-first-smoke.sh`; Fast Release never publishes this fixture;
   - run the actual `docker-compose.web.yml` through `web-first-smoke.sh` against candidate application images;
   - verify migrations complete, storage initializes, API and Web become healthy, manual account creation is idempotent, login works, MQTT-disabled readiness is correct, and an unavailable broker does not break core Web/API readiness.
3. **Publication section of the candidate job**
   - run only for `main` or manual release events and only after the candidate smoke passes;
   - tag images with the exact Git commit SHA;
   - push API, Worker, and Web concurrently;
   - resolve and validate registry digests;
   - write all three immutable digest references and the commit SHA to the job summary and workflow outputs;
   - never publish placeholder, `latest`, branch-only, or mutable production references.

The Fast Release result is successful only when all three application digests are published and validated. A partially pushed failed run is not release-ready; immutable SHA tags make any partial artifacts harmless and distinguishable from a complete summary.

### 5.2 Deep Verification

Retain the existing exhaustive checks in a separate workflow triggered by:

- a nightly schedule;
- manual dispatch;
- pull requests that change MQTT, Certbot, PostgreSQL backup, recovery, capacity, Docker/Compose infrastructure, or CI scripts.

Deep Verification retains:

- managed MQTT and certificate lifecycle tests;
- managed staging and full integration stacks;
- browser acceptance and platform regression;
- latency baseline;
- disaster-recovery fixture;
- reduced capacity workload;
- production-finance evidence generation;
- infrastructure image builds and publication gates.

Deep failures remain visible and actionable but do not retroactively mutate an immutable Fast Release image. Operators must not promote infrastructure changes through Fast Release. A deep failure affecting an application commit requires either a corrective commit or an explicit rollback to a previous digest.

### 5.3 Deployment separation

Automatic staging/production deployment must not remain coupled to the cancellable Fast Release workflow. Any automated staging deployment is moved to a separate workflow or `workflow_run`-style consumer with non-cancelling deployment concurrency. It accepts only a complete Fast Release digest set for the same commit and rejects stale commits.

Production remains manual: the operator copies the three validated application digests into the existing Coolify resource, deploys the same resource, and preserves its volumes. No Fast Release job receives permission to change the Production resource.

## 6. Docker cache design

The application Dockerfiles currently copy the entire repository before `pnpm install`, so ordinary source changes invalidate the dependency layer. Refactor API, Worker, and Web Dockerfiles into stable dependency and source layers:

1. copy the root package manifest, lockfile, workspace file, and required workspace package manifests;
2. run `pnpm fetch` or an equivalent lockfile-only cacheable dependency step;
3. install from the fetched store with the frozen lockfile;
4. copy application and package source;
5. build only the target workspace and its dependencies;
6. retain the existing non-root runtime user and runtime commands.

The implementation must prove that a source-only edit reuses the dependency layer and that a lockfile or package-manifest edit invalidates it. BuildKit cache scopes remain image-specific to prevent incompatible API/Web/Worker cache collisions.

## 7. Change classification

The first iteration publishes API, Worker, and Web together for every application Fast Release. This avoids creating or looking up a partial release manifest and guarantees that the three application images share one commit SHA.

Infrastructure paths are excluded from the Fast Release publication contract. A path-classification job checks MQTT/Certbot/PostgreSQL backup Docker contexts, managed broker configuration, recovery scripts, capacity scripts, deployment Compose, and CI workflow/helper files. A matching change requires Deep Verification and prevents Fast Release from publishing a release-ready application summary. Application images may still be built on a mixed commit for feedback, but the result is not a complete release.

A later iteration may add durable release manifests and true per-image path selection after measured evidence shows that building all three application images remains a material bottleneck.

## 8. Failure and concurrency behavior

- A failed Fast verification or smoke publishes no release-ready summary.
- Image publication runs only after every mandatory gate succeeds.
- Each image uses the commit SHA and registry digest; retries are idempotent for identical content.
- Newer `main` commits cancel older Fast Release runs before publication when possible.
- Deep Verification and deployments use separate concurrency groups and are never terminated merely because a newer commit arrives.
- Deployment rejects a digest set whose recorded commit is no longer the selected release commit.
- Secrets remain scoped to the publication or deployment job that requires them.
- GitHub Actions permissions default to `contents: read`; only the publication job receives `packages: write`.

## 9. Verification strategy

Implementation tests must cover:

- workflow syntax and event/path filters;
- Fast Release permissions and concurrency policy;
- mandatory job dependencies and event conditions so publication cannot run after a failed gate or on a pull request;
- infrastructure path classification blocks a Fast Release summary and requires Deep Verification;
- exactly three application digest outputs tied to one commit SHA;
- parallel publication with digest validation;
- no Production deployment permission or Coolify mutation in Fast Release;
- Deep Verification retains recovery, capacity, browser, MQTT, certificate, and infrastructure checks;
- Dockerfile dependency cache boundaries;
- application image builds and `web-first-smoke.sh` on Linux;
- existing CI helper unit tests and Coolify deployment tests.

The rollout first runs Fast Release without changing the production deployment procedure. Compare at least three warm-cache runs and record total time plus build, smoke, publication, and cleanup phases. Only after stable evidence may the old combined publication path be removed.

## 10. Success criteria

- A normal application-only `main` commit produces API, Worker, and Web digests in 5–8 minutes on a warm cache.
- Fast Release cannot report success without passing its mandatory verification and smoke gates.
- Production continues to pull images and does not compile source.
- Operators receive one complete, copyable digest set for a single commit.
- The deep suite remains scheduled/manual and retains all current high-cost checks.
- A newer application commit is not queued behind an obsolete deep verification run.
- Rollback remains changing Coolify variables back to a previously recorded immutable digest set and redeploying the existing resource.
