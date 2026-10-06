# Role experience implementation plan

> **For agentic workers:** Use subagent-driven-development to implement and review each task.

**Goal:** Enforce Admin/Owner/School User permissions and deliver minimal responsive business screens.

**Architecture:** A shared domain role module exposes page permissions and role capabilities. Server route adapters enforce these capabilities and school scope; web navigation and authenticated page guards consume them. Business dashboards and document presentation reuse existing scoped read models.

**Tech Stack:** TypeScript, NestJS, Next.js 16, React 19, Tailwind, Node test runner via tsx.

**Spec:** docs/superpowers/specs/2026-10-06-role-experience-design.md

## Global constraints

- Preserve pre-existing changes and legacy operator/accountant compatibility.
- Server identity is authoritative; browser storage never grants access.
- Admin is globally scoped; School User without school gets no school data.
- Retain financial readiness and lifecycle validation.
- Responsive views at 360/390, 768 and 1280 px; accessible 44 px touch targets.

## Task 1: Server and shared access policy

Files: packages/domain/src/access/role-experience.ts and src/index.ts; apps/api/src/common/auth/route-policy.ts, platform-access.guard.ts, role guards and identity invitation policy; related authorization tests.

Produces: `canVisitPage(role: string, path: string): boolean` and `isBusinessRole(role: string): boolean` exported by @solar/domain.

- [x] Add failing tests for Admin global scope and actions, Owner technical/user denial, School User isolation and personal settings, unknown-role denial.
- [x] Run focused tsx tests and record expected failures.
- [x] Implement role/page module and server adapters; inspect every controller role restriction and retain lifecycle readiness.
- [x] Run domain/API tests and type checks; review authorization diff.

Example assertion: `assert.equal(routeAllowed('owner','GET','/v1/mqtt-brokers'),false)`; `assert.equal(schoolScope({role:'admin',schoolId:'school-a'}),null)`.

## Task 2: Responsive navigation and authenticated pages

Files: apps/web/components/navigation/{nav-config,app-sidebar,mobile-menu-sheet,mobile-bottom-nav,app-header}.tsx/ts; app/(app)/layout.tsx and page guards; new production route if needed.

Consumes: `canVisitPage(role,path)` from Task 1.

- [x] Write/run failing destination tests for each role and forbidden direct pages.
- [x] Derive navigation for all surfaces from one role map; use server-verified identity for page guard.
- [x] Add School User production destination and preserve personal account preferences.
- [x] Verify web type check and navigation tests.

Example assertion: `assert.equal(canVisitPage('owner','/settings/users'),false)`; `assert.equal(canVisitPage('school_user','/production'),true)`.

## Task 3: Minimal business dashboards and documents

Files: apps/web/features/dashboard/dashboard.tsx and new business-dashboard module; financial page/shared presentation modules; role presentation tests.

Consumes: authenticated server identity; existing DashboardSummaryResponse and scoped document operations.

- [x] Write/run meaningful rendering tests proving Owner/School User exclude Gateway and operational controls.
- [x] Implement business summary, production trend and document shortcuts; use existing real data and unknown states.
- [x] Apply responsive document presentation and role actions; hide technical diagnostics for business roles.
- [x] Run relevant rendering tests and web type check.

## Task 4: Integrated verification and review

- [x] Verify domain/API/web checks with fresh outputs.
- [x] Inspect rendered views at mobile/tablet/desktop widths; check overflow, dialogs, navigation and access denial.
- [x] Review complete task diff for scope leaks and readiness bypasses; fix findings.
- [x] Record commands, results and limitations in a completion report.

## Execution rulings

Continue in current working directory because required existing flows contain substantial uncommitted changes that a fresh checkout would omit. Do not reset, stage or commit other work. User's “ทำเลย” authorizes execution without further planning approval.

Completed implementation and independent reviews. Verification results and remaining pre-existing typecheck limitations: docs/role-experience/verification-2026-10-06.md.
