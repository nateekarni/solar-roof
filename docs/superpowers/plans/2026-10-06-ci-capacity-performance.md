# CI capacity and duration follow-up — 2026-10-06

Scope: Diagnose the supplied `1_verify.txt` log, retain release gates, improve browser startup and CI feedback. User authorized local changes and verification; no commit, push or deployment.

## Evidence and diagnosis

- GitHub run `37477770490` failed in capacity, not recovery. Recovery completed in approximately 5m22s. Its intentional 190-second scheduler pause validates continued sampler freshness beyond the 120-second freshness boundary and must remain.
- One of 80 page samples failed: user 4, `/`, browser-cold, steady, 2059.6 ms against the unchanged 2000 ms limit. All other samples were at most 1788.8 ms. No page errors, missing acknowledged rows or duplicates were recorded. Two reports completed.
- Browser installation consumed 21m03s. Other recorded verification phases total approximately 23m36s, excluding browser installation. A 10–15 minute total pipeline claim is unsupported by this evidence.
- Auth verification is already request-memoized; MapLibre is already loaded asynchronously. Recharts appeared in the dashboard startup graph even for empty chart data. Holding its scripts still allowed dashboard statistics to appear. This does not establish Recharts as the cause of the original outlier.

## Changes

- Use a version-matched, digest-pinned CI browser container instead of installing browser OS dependencies on the runner. Enforce loopback endpoint, ownership, real readiness and cleanup. Local browser behavior remains supported.
- Record build, browser preparation, integration, platform regression, recovery, capacity and publication timings in the job summary. Bound expensive steps with explicit timeouts; keep all verification and deployment gates.
- Emit recovery command and phase progress with fixed operation/service names and elapsed durations. Never log credentials, SQL, arguments or captured command output.
- Report exact failing page/user/cache/phase and collect navigation and script timing details. Keep the same readiness marker, concurrency, workload and 2000 ms page budget.
- Load dashboard chart renderers only when there is data. Preserve titles, financial values, date ranges, empty states, dimensions and chart configuration.
- Treat padded ranges containing only `null` measurements as empty. Keep genuine measured zero values and preserve mixed-series gaps by passing the original data array to the renderer.

## Verification and limits

- CI helper tests: 42 passed. Capacity policy and page budget: 5 passed.
- Workspace lint and tests: all 8 package tasks passed; web has 68 passing tests.
- Web production build and Linux Docker image build passed. Independent final code review found no actionable defect.
- Local baseline used Docker Desktop Linux application containers and a Windows browser: 80 samples, no page errors, maximum 1088 ms. This is not a GitHub runner result or proof of target capacity.
- Equivalent local smoke after optimization completed 80 samples with no page errors, maximum 963.8 ms and p95 960.7 ms (baseline p95 1056.9 ms). The upper median was 552.1 ms versus 508.8 ms; this single pair does not establish an across-the-board latency improvement. Both workloads acknowledged and persisted 72 records, with no loss or duplicates and two completed reports.
- Cold home page during the steady phase fetched 424,112 encoded JavaScript bytes versus 771,180 bytes before the change, a 45.0% reduction. This is actual browser resource evidence for the same fixture/workload on this host, not a raw bundle-size estimate. Workload durations were both approximately 71.85 seconds, as configured.
- Final browser diagnostics verified that the read-model-enabled padded empty range (two null points) renders no chart SVG and downloads no Recharts runtime. Populated rendering was separately verified with actual scoped SQL results: 30 measured energy points, one revenue point, pending billed amount 800, and three chart SVGs with Area/Bar/Pie geometry. This populated diagnostic used the existing SQL fallback with `ENERGY_READ_MODEL_ENABLED=false` only in its disposable fixture because the sparse capacity seed cannot satisfy complete historical midnight boundaries; the capacity run and CI configuration retain the read model. No API responses were mocked. Evidence is saved in `.superpowers/null-series-browser-proof.json` and `.superpowers/lazy-chart-browser-proof.json`.
- Full Ubuntu remote-browser acceptance and comparable successful workflow timings remain pending an authorized push. Publication and staging deployment were not exercised.

## Authorized publication and Ubuntu follow-up

The user subsequently authorized commit/push for CI/CD. Commit `7bf13c4` started run `37491436097`. Image build passed in 4m04s; browser preparation passed in 30s, versus the previous failed run's 21m03s browser installation. Integration then exposed a remote-transport incompatibility: `Download.path()` cannot access the browser container's filesystem. Both report CSV and history gzip E2Es now transfer actual bytes with `saveAs()` into an owned temporary directory, read them locally and clean up. Existing authorization, filename and content assertions remain. A real remote-protocol reproduction confirmed the old call fails and the new transfer preserves CSV and gzip bytes; CI helper tests now pass 44 cases. CI also checks browser download transport immediately after preparation. Full verification and deployment await the corrected run.
