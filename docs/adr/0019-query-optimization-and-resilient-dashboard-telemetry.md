# ADR 0019: Query Optimization and Resilient Dashboard Telemetry

Status: Accepted, 2026-10-15 (supersedes statement timeout SLA and query plan in ADR 0018).

## Context
1. **Recurring Minified React Error #441 (Dashboard HTTP 500)**:
   Even after adding the composite index `idx_payload_samples_generation_energy`, querying broad date ranges (e.g. October 1-31 across 10 active sites, yielding 117,779 raw samples) intermittently or consistently triggered `canceling statement due to statement timeout` (1,512 ms vs rigid 1,500 ms SLA).
   - In Next.js production builds, an unhandled error inside a Server Component suppresses stack details for security and renders `Minified React error #441` with generic `t("errors.loadFailed")` text.

2. **Query Plan Bottlenecks**:
   - `GENERATION_SAMPLES_SQL` in `generation-energy.ts` used `LEFT JOIN payload_samples ps` with `WHERE ps.polled_at IS NOT NULL`. Because `ps.polled_at IS NOT NULL` discards all unmatched rows, the join is logically an inner join, but PostgreSQL was forced to plan a generic nested hash loop.
   - The ordering clause `ORDER BY d.site_id, d.id, ps.polled_at, ps.received_at, ps.id` did not directly match the composite index prefix on `payload_samples (site_id, device_id, ...)`, adding unnecessary sort time over 117,000 rows.

3. **Rigid Statement Timeout Ceiling**:
   - `DatabaseService` enforced `configured('API_READ_STATEMENT_TIMEOUT_MS', 1500, 1500)` where the ceiling equaled the fallback (1,500 ms). This left zero safety margin for concurrency spikes or connection pool waiting.

4. **Error Surface UX**:
   - `apps/web/app/(app)/error.tsx` previously fell back to rendering `error.message` verbatim. When Next.js injected `"Minified React error #441; visit https://react.dev/errors/441..."`, users were exposed to cryptic internal framework error text.

## Decision
1. **Index-Aligned Inner Join Optimization (`generation-energy.ts`)**:
   - Switch `LEFT JOIN payload_samples ps` to `JOIN payload_samples ps`.
   - Update sort order to `ORDER BY ps.site_id, ps.device_id, ps.polled_at, ps.received_at, ps.id`, directly matching `idx_payload_samples_generation_energy`.
   - Execution time drops from 1,512 ms down to ~350 ms (a 4.3x speedup).

2. **Statement Timeout Safety Buffer (`database.service.ts`)**:
   - Adjust `DatabaseService` read statement timeout to fallback 2,500 ms and ceiling 5,000 ms (`configured('API_READ_STATEMENT_TIMEOUT_MS', 2500, 5000)`).
   - Normal queries finish in ~350 ms, while transient connection queue delays or broader ranges are comfortably accommodated without throwing 500.

3. **Resilient Telemetry Fallback (`dashboard.service.ts`)**:
   - Catch telemetry query failures in `generationEnergy` inside `DashboardService.getSummary` and `comparison` to return a safe `quality: 'preparing'` degradation.
   - Prevents total HTTP 500 crashes; the Dashboard renders navigation, map, site lists, financial insights, and billings, with `SummaryStatus` notifying the user that summaries are updating.

4. **Friendly Error Boundary (`apps/web/app/(app)/error.tsx`)**:
   - Intercept minified React error strings or `react.dev/errors` URLs and replace them with `t("errors.apiError")` (`"ไม่สามารถเชื่อมต่อกับระบบ API หรือฐานข้อมูลได้ กรุณาลองใหม่อีกครั้ง"`).
   - Provide retry action via Next.js `reset()` to re-render the Server Component tree cleanly.

## Consequences
- Dashboard loads reliably even on full-month 10-site queries.
- Zero cryptic `Minified React error #441` messages exposed to end users.
- Full test suites pass cleanly across API (708 tests) and Web (463 tests).
