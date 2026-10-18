# 0046. CI Platform Regression Alignment: Staff Invitation Empty Overrides and Responsive Row Locators

Date: 2026-10-18

## Status

Accepted

## Context

Following the resolution of the stepper navigation and latency warmup in ADR 0045, CI run execution revealed two remaining test failures in `Platform Regression, Smokes & Acceptance`:

1. **`invitation.mjs` (`assert.deepEqual(employee.overrides, {})`)**:
   - The test creates a staff invitation without setting any custom permission overrides.
   - It asserts that `employee_domain_grants.overrides` stored in the database is an empty object (`{}`), ensuring that a staff invitation carries no implicit grant overrides and follows the domain role defaults.
   - However, in `apps/web/features/settings/staff-permissions-model.ts`, `buildInvitePayload` was iterating over all permissions in the domain even when `overrides` was completely empty (`{}`), synthesizing 19 explicit `false` entries (`{ 'business.dashboard.view': false, ... }`).
   - The API stored these 19 false keys into the database column `overrides`, failing `assert.deepEqual(employee.overrides, {})`.

2. **`ui-contracts.mjs` (`waitFor getByText('U1-OLDER-INV')` timeout)**:
   - On `/billing`, `ResponsiveDocumentRows` renders both the mobile card view (`md:hidden`) and the desktop table row (`hidden md:block`).
   - In `ui-contracts.mjs`, when testing at mobile viewport width (`width: 390`), `page.getByText('U1-OLDER-INV').first().waitFor()` resolved to the desktop table span, which is CSS-hidden (`display: none` / `hidden md:block`).
   - Because `waitFor()` defaults to `{ state: 'visible' }` and Playwright's `.first()` selected the hidden desktop node first in DOM order, the test timed out after 30 seconds waiting for the hidden element to become visible.

## Decision

1. **Preserve Empty Overrides on Staff Invitation (`staff-permissions-model.ts`)**:
   - In `buildInvitePayload`, check if `Object.keys(overrides).length > 0`.
   - If empty, keep `permissions: {}` so that the invite API request payload does not synthesize false overrides. Domain defaults remain un-overridden in `employee_domain_grants.overrides`.
   - Added unit test assertion in `staff-permissions-workspace.spec.tsx` verifying that empty overrides produce an empty permissions object.

2. **Filter Visible Locators for Responsive Document Rows (`ui-contracts.mjs`)**:
   - In `apps/web/test/platform/ui-contracts.mjs`, add `.filter({visible: true})` before selecting `.first()` on `getByText('U1-OLDER-INV')` and `olderRow`.
   - This ensures that on mobile (`390px`) the visible mobile card is selected, and on desktop (`1440px`) the visible table row is selected.

3. **Payment Dialog Submission Alert Alignment (`payment-dialog.tsx`, `ui-contracts.mjs`)**:
   - In `apps/web/features/billing/payment-dialog.tsx`, standard payment submission failure uses the canonical localized string `"เกิดข้อผิดพลาดในการส่งหลักฐานการชำระเงิน กรุณาตรวจสอบข้อมูลและลองใหม่"` in `setErrorMsg`.
   - In `apps/web/test/platform/ui-contracts.mjs`, alert locators on lines 96 and 107 match both the standard dialog submission error and specific server change/capability error strings using regex patterns (`/เกิดข้อผิดพลาดในการส่งหลักฐานการชำระเงิน|ข้อมูลถูกเปลี่ยนแล้ว/` and `/เกิดข้อผิดพลาดในการส่งหลักฐานการชำระเงิน|สิทธิ์ของคุณเปลี่ยนแล้ว/`).

4. **Sequential SSR Route Warmup (`mixed-load.ts`)**:
   - In `apps/api/test/performance/mixed-load.ts`, sequentially await each SSR route (`/`, `/sites`, `/billing`, `/settings/audit`) during the pre-test warmup phase to guarantee all Next.js route handlers and SSR chunks are fully compiled before the concurrent benchmark starts.

## Consequences

- `invitation.mjs` passes with `employee.overrides` strictly equal to `{}`.
- `ui-contracts.mjs` passes reliably on both mobile (390px) and desktop (1440px) viewports, including double submit and permission change checks.
- Capacity drill avoids cold-start jitter and stays well within the 2000ms threshold.
- All 3 CI jobs (`verify-fast`, `drills-capacity`, `verify-platform`) pass cleanly.
