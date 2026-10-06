# CI Browser Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Remove repeated slow Linux browser dependency installation while retaining every existing release gate.

**Architecture:** Keep Node, Docker fixture management and tests on the Ubuntu runner. Run a version-matched Playwright browser server in a dedicated container using Linux host networking; the shared fixture browser helper connects to it. This preserves localhost URLs, cookies, database connections and Docker ownership checks.

**Tech Stack:** GitHub Actions, Docker, Node 24.20.0, pnpm 11.24.0, Playwright 1.63.0.

**Spec:** User request to plan CI acceleration and estimate duration, based on timestamped October 6 log and current ci-staging.yml.

## Global Constraints

- Preserve integration, role isolation, MQTT, recovery and capacity gates.
- Publish the exact tested application image IDs only after all gates pass.
- Preserve deployment concurrency protection and stale-main checks.
- No production configuration or application UI changes.
- Container and installed Playwright versions must match the lockfile; reject mismatches.
- Keep local browser launch as the default outside CI.
- Do not change browser launch behavior in this planning-only task.

## Evidence and estimate

Observed browser install: 21m04s, including Linux package download 20m42s at 26.1 kB/s. Browser binaries downloaded in about 7 seconds. Candidate image build observed 4m22s. Remaining recovery, workload and publication durations were not included in the supplied browser log.

Budget for browser container pull/start: 0.5–2 minutes under ordinary runner networking, 2–4 minutes on a cold or slow pull. If the completed baseline is 30 minutes, replacement gives roughly 30 - 21.07 + (0.5 to 2) = 9.4–10.9 minutes. Use 10–15 minutes as the initial full verification/publication target to allow remaining steps and network variance. These are estimates, not measured results; Coolify deployment and runner queue are excluded.

## Task 1: Shared remote browser support

**Files:** Modify apps/web/test/platform/fixture-browser.mjs; create a focused browser connection test under scripts/ci.

**Interfaces:** Optional CI_BROWSER_WS_ENDPOINT; absent means existing chromium.launch behavior. Present means chromium.connect(endpoint), after existing fixture ownership checks.

- [x] Extract only browser transport selection into a testable helper accepting the Chromium transport and environment.
- [x] Add meaningful tests for local launch, explicit remote connect and failed remote connection propagation. A remote failure must fail the suite rather than silently launching locally.
- [x] Restrict the CI endpoint to the designated loopback listener; do not accept an arbitrary remote production browser.
- [x] Preserve fixture project UUID and port ownership assertions before either launch mode.
- [ ] Run the focused Node tests and existing fixture harness verification.

## Task 2: Version-matched browser server lifecycle

**Files:** Create scripts/ci/browser-server.sh; modify .github/workflows/ci-staging.yml; document in .github/CI.md.

- [x] Resolve the installed Playwright version from the web workspace and compare it to 1.63.0 before pulling mcr.microsoft.com/playwright:v1.63.0-noble. Pin the verified image digest during implementation.
- [x] Start a uniquely named CI-only container with --init, --network host and --ipc host. Bind Playwright run-server to 127.0.0.1 on a reserved port different from fixture ports, for example 13999. Install/use the matching Playwright package; the official browser image contains browsers and OS dependencies, not the npm package.
- [x] Bound readiness to 60 seconds and print container logs on failure. Bound setup step to 5 minutes; distinguish pull/start failure from application test failure.
- [x] Replace Install browser with this setup and export CI_BROWSER_WS_ENDPOINT=ws://127.0.0.1:13999/ for all browser suites. Keep existing test commands and Node 24 on the host.
- [x] Add always-run cleanup for only the named browser container; do not delete unrelated stacks or volumes. Capture its logs as evidence without account fixture contents.
- [ ] Verify real browser login, role destinations, mobile width, localhost cookie handling, screenshots and all-fast platform browser suites on a Linux runner. Confirm fixture cleanup still runs on failure.
- [x] Confirm publication remains downstream of all current gates and no production image gains Playwright dependencies.

## Task 3: Measure and report

**Files:** .github/CI.md; this plan's outcome section when implemented.

- [x] Record start/end duration for browser preparation, application image build, integration, platform regression, recovery, capacity and GHCR publication in the job summary.
- [ ] Run at least three comparable complete main/manual runs, including a cold image pull. Report individual durations and median; separately report runner queue and Coolify deployment if enabled.
- [ ] Compare equivalent successful runs against the completed baseline. Do not attribute unrelated workload changes to this fix.
- [ ] If browser preparation exceeds 5 minutes, diagnose registry/package access before choosing additional cache work.

## Optional second phase, after measurement

Evaluate Docker BuildKit caching per image and Dockerfile dependency-layer ordering if application builds remain dominant. Preserve exact tested image publication; do not rebuild for publish. Parallel jobs require isolated fixtures and image transfer budgets and should be designed only after timing evidence. A 7–12 minute full pipeline is a provisional second-phase target, not a commitment.

## Review

The first phase removes the evidenced bottleneck, retains all gates and preserves existing localhost-oriented test code. Main risks are Playwright version mismatch, container pull variability and browser networking. Real Linux integration verification is mandatory before claiming acceleration.

## Implementation outcome — 2026-10-06

Implementation started at the user's request; no commit, push, publication or deployment is performed by this work session.

- Shared transport: implemented with exact loopback endpoint, preserved ownership checks/local launch, IPv4 remote launch options, and connection failures propagated.
- Browser lifecycle/workflow: pinned verified Linux amd64 Playwright image, version validation, bounded setup/readiness, owned cleanup and diagnostic evidence; implementation reviewed alongside all existing release gates.
- Measurement: phase start/end/duration and status instrumentation added. Actual performance results remain pending.
- Verification in this workspace: focused transport tests and fixture guard subset pass. Final CI script suite passed 39/39 tests; fixture guard subset passed 4/4. git diff --check passed. Independent review found no remaining code blocker.
- Pending Linux acceptance: real login, role destinations, mobile width, localhost cookies, screenshots, all-fast suites and fixture failure cleanup against the actual remote browser container.
- Pending measurements: three comparable complete successful main/manual runs (one cold pull), completed baseline comparison, individual durations and median; runner queue and optional Coolify deployment reported separately. These require a later authorized push after the user's deployment work.

The planning-only constraint above belongs to the original planning stage; the explicit user instruction to implement supersedes it. No measured acceleration is claimed.
