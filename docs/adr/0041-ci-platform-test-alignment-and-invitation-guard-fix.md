# 0041. CI Platform Test Alignment, Invitation Service Fix, and Idempotent Seed

Date: 2026-10-17

## Status

Accepted

## Context

Following major upgrades across the platform (commit `104e676` including ADRs 0038-0040 for cardless customer financial views, unified settings avatar modals, and dedicated readiness routing), automated CI failed across several regression test suites:

1. **Finance Readiness Routing**: Owner readiness setup notifications were updated in code and contracts to link to the dedicated `/settings/readiness` page (ADR 0029/0039). However, `apps/api/test/production-financial-workflow.integration.ts` still asserted that `destination` was `/settings/company`.
2. **Invitation Service & Guard**:
   - `InvitationService.deliver()` queried `logo_data` from `company_profile`. Because the column does not exist (`logo_url` is the stored column), the database rejected the query with a PostgreSQL exception, resulting in silent delivery failures (`delivery_failed`).
   - `PlatformAccessGuard` defaulted `invitedRole` to `"customer_user"` unconditionally when omitted from the request body. In contrast, `InvitationService` defaults to `"operator"` when `customerId` is null (staff invitation). This caused staff invitations without an explicit role payload to fail with HTTP 403.
3. **Staff Position Browser Test (`staff-position.browser.test.mjs`)**: The test suite had not been updated to reflect the 2-step `EmployeeEditor` modal (`ข้อมูลทั่วไป` -> `สิทธิ์การใช้งานและไซต์`), its title `"แก้ไขข้อมูลพนักงาน"`, and the removal of the redundant custom position confirmation checkbox.
4. **UI Contracts Customer Billing Test (`ui-contracts.mjs`)**: The test was looking for the legacy `OrganizationDocuments` dropdown action (`การจัดการเอกสาร: ...`), whereas customer billing was unified into `OperationPage` actions.
5. **Accessibility SSR Hydration (`accessibility.mjs`)**: Clicking the table row action menu immediately upon page load occasionally raced with React client-side hydration, causing timeouts waiting for `getByRole('menu')`.
6. **Realistic Seed Script (`scripts/seed-platform-realistic.ts`)**: Re-running the seed script executed `DELETE FROM documents`, triggering PostgreSQL trigger `preserve_local_issued_document()` which forbids deleting issued financial documents.

## Decision

1. **Update Financial Workflow Assertion**:
   - In `apps/api/test/production-financial-workflow.integration.ts`, assert `setup[0].destination === '/settings/readiness'` in lockstep with `financeReadinessNotification`.
2. **Fix Invitation Service Query & Guard Defaulting**:
   - In `apps/api/src/modules/identity/invitation.service.ts`, query `SELECT company_name, logo_url FROM company_profile` in `deliver()` and `getInvitationDetails()`.
   - In `apps/api/src/common/auth/platform-access.guard.ts`, align role defaulting: `const invitedRole = req.body?.role ?? (req.body?.customerId ? "customer_user" : "operator");`.
3. **Bring `staff-position.browser.test.mjs` up to Date**:
   - Support `initialTab` parameter in `fixture()`, wait for `/จัดการพนักงาน|แก้ไขข้อมูลพนักงาน/` dialog, navigate via the stepper "ถัดไป" (Next) button, and assert on "บันทึกข้อมูล" (Save details) without obsolete confirmation checkboxes.
4. **Update `ui-contracts.mjs` for Unified OperationPage**:
   - Dynamically handle desktop action menus and mobile direct action buttons for `/billing` document previewing.
5. **Mitigate SSR Hydration Race in `accessibility.mjs`**:
   - Wait for `networkidle` and implement a resilient retry click loop to accommodate client-side hydration before awaiting the menu popover.
6. **Idempotent Realistic Seeding**:
   - In `scripts/seed-platform-realistic.ts`, check `SELECT count(*) FROM billing_cycles WHERE site_id = $1` and skip cycle/document creation if records already exist, avoiding illegal `DELETE` calls on immutable issued records.

## Consequences

- Automated CI suites (`verify`, `integration`, and `platform-regression`) pass reliably without regressions.
- Email delivery via SMTP correctly resolves company branding without SQL errors.
- Staff invitations can be created with or without explicit role fields.
- Re-running realistic seeding is completely idempotent and safe against financial immutability constraints.
