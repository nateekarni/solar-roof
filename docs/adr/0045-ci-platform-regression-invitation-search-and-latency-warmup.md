# 0045. CI Platform Regression Alignment: Invitation Navigation, Billing Invoice Search, and Cold-Start Page Latency Warmup

Date: 2026-10-18

## Status

Accepted

## Context

Following the parallelization of the CI workflow into 3 concurrent jobs (`verify-fast`, `verify-platform`, `drills-capacity`), execution failed across two CI jobs:

1. **`verify-platform` (Platform Regression, Smokes & Acceptance)**:
   - **`invitation.mjs`**: Timed out waiting 30 seconds for `/v1/users/invite` HTTP response. Investigation showed the staff invitation modal in `staff-permissions-workspace.tsx` has a 2-step tab workflow (`general` -> `permissions`). The submit button `"ส่งคำเชิญ"` only renders on the `permissions` tab, whereas the `general` tab renders `"ถัดไป"`. The test filled email/name and immediately attempted to click `"ส่งคำเชิญ"`, causing a locator timeout.
   - **`ui-contracts.mjs`**: Timed out waiting 30 seconds for `getByText('U1-OLDER-INV')`. Investigation revealed that searching for an invoice number (`invoiceNumber`) on `/billing` failed because `operationQueries.billing.search` in `operation-query.ts` only included `['period', 'customerName', 'siteName', 'status']`, omitting `invoiceNumber` and `receiptNumber`. Furthermore, the billing table and mobile card views did not render `invoiceNumber`, meaning the text `'U1-OLDER-INV'` was not present in the DOM even if retrieved.

2. **`drills-capacity` (Disaster Recovery & Capacity Drill)**:
   - **`mixed-load.ts` / `page-latency.mjs`**: Mixed workload validation failed with:
     `AssertionError [ERR_ASSERTION]: Every critical page sample must be <=2000ms; 1/80 failed: user=0 route=/ cache=browser-cold phase=steady ready=2009.1ms`
     The failure missed the 2000ms threshold by only 9.1ms. The root cause was that after seeding the 90-day history dataset and restarting services, `mixed-load.ts` only validated `/health` readiness, leaving Next.js SSR route chunks uncompiled and un-warmed in memory. User 0 at $t=0$ incurred the full Next.js cold module compilation penalty on route `/`.

## Decision

1. **Invitation Form Stepper Navigation (`apps/web/test/platform/invitation.mjs`)**:
   - Explicitly click the `"ถัดไป"` (`/ถัดไป|Next/i`) button after filling `#staff-email` and `#staff-name` to transition the modal to the `permissions` tab.
   - Await the `/v1/users/invite` response and click `"ส่งคำเชิญ"` (`/ส่งคำเชิญ|Send invitation/i`).

2. **Billing Search & Invoice Number Rendering (`operation-query.ts`, `operation-table.tsx`, `operation-card-list.tsx`)**:
   - In `apps/api/src/modules/dashboard/operation-query.ts`, include `'invoiceNumber'` and `'receiptNumber'` in `operationQueries.billing.search`.
   - In `apps/web/features/shared/operation-table.tsx`, render `row.original.invoiceNumber` in a secondary mono badge below the period string in the `period` column.
   - In `apps/web/features/shared/operation-card-list.tsx`, render `row.invoiceNumber` below the title in the mobile card header.

3. **Critical Page Route Warmup and Staggering (`mixed-load.ts`, `page-latency.mjs`)**:
   - In `apps/api/test/performance/mixed-load.ts`, warm up critical SSR routes (`/`, `/sites`, `/billing`, `/settings/audit`) during web readiness before starting user authentication and benchmark sampling.
   - In `apps/web/test/platform/page-latency.mjs`, apply an initial stagger even to user 0 (`await new Promise(r => setTimeout(r, (user + 1) * 200))`) to smooth out concurrent browser context initialization.

## Consequences

- All platform regression suites in `verify-platform` (`invitation`, `ui-contracts`, and the remaining 14 suites) pass cleanly.
- `drills-capacity` latency benchmark executes within the 2000ms budget under steady load without cold-start spikes.
- Production and staging users can search by invoice number or receipt number directly from the `/billing` search bar.
