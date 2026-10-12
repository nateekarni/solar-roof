# UI and account consistency implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development for independent tasks and integration review. Track verified completion below.

**Goal:** Deliver the approved list, settings, staff, alerts and own-account changes, excluding Dashboard.

**Architecture:** Reuse list controls and existing resource query scopes; keep account media and TOTP separate from profile identity. Add only schema needed for avatar and authentication credentials. Preserve existing working-tree changes.

**Tech Stack:** Next.js/React, NestJS, PostgreSQL, TypeScript node:test.

**Spec:** docs/superpowers/specs/2026-10-09-ui-consistency-design-draft.md

## Global constraints

All roles, permissions preserved; Thai/English; responsive cards on mobile; accessible controls despite hidden visual labels. No Dashboard changes. No resets, deployment or database mutations without target verification. Keep existing unrelated edits.

## Task 1: Shared lists and filters (root)

- [x] Inspect operation query contracts, predicates, toolbar, period picker, exports and all independent list controls.
- [x] Test validated resource-specific status/severity/type/role/action filters and cursor mismatch rejection before implementation.
- [x] Add typed filters, parameterized predicates and consistent export/summary semantics.
- [x] Share single range picker, hidden labels, right-side filters, remove alert/audit count cards; retain mobile layouts.
- [x] Verify API query tests and frontend type checks.

## Task 2: Gateways, staff and rule configuration (UI implementer)

- [x] Add search/status/site filters, colored gateway status, final blank action heading and three-dot menu; hide version diagnostics from list.
- [x] Employee Add button/modal; tabs following page description; search/status/position controls, unassigned position support.
- [x] Rule settings modal with persistent button and true rule empty state distinguishing disabled/all absent; place inside approved page layout.
- [x] Verify focused UI tests and type checks. Own gateway/staff/alerts files only, not shared operation files.

## Task 3: Authenticator backend (identity implementer)

- [x] Failing tests for RFC TOTP vectors, replay rejection, no session without second factor, single-use recovery, own enrollment/disable, refresh-session revocation.
- [x] Migration 053: encrypted authenticator credentials, pending enrollment expiry, replay counter, hashed recovery codes and attempt controls.
- [x] Enroll/confirm/status/disable endpoints; existing login returns second-factor-required without tokens/session; accept code or recovery on next login request.
- [x] Preserve standard cookies/token claims, password and authorization behavior. Publish endpoint/body contract to root/UI worker.
- [x] Verify focused authentication tests and API type checks.

## Task 4: My Account/avatar/login UI (account implementer)

- [x] Migration 054 and own-avatar endpoint validating bounded PNG/JPEG upload, own-only data; cropped image persisted.
- [x] My Account display fields, individual edits, preference and password flows, avatar selection/crop pan/zoom/save, header image update.
- [x] TOTP enrollment modal/manual authenticator setup, confirmation, recovery-code display, disable and login verification using Task 3 contract.
- [x] Merge security route entry and shorten central menu labels without changing role visibility.
- [x] Verify crop validation and account/login UI tests and web/API types. Coordinate ownership of identity module/me controller with authenticator worker.

## Task 5: Technical automation separation (root)

- [x] Write regression for technical evaluation without financial write binding.
- [x] Separate technical rule scheduler/evaluation gates from financial reminder/delivery eligibility; preserve financial boundaries.
- [x] Verify rule evaluation/delivery tests.

## Task 6: Integration and review

- [x] Review each implementation against scope, permissions and UI requirements; resolve defects.
- [x] Run combined focused/full relevant suites, API/web builds or type checks, and browser render checks if runtime available.
- [x] Record migration/runtime configuration requirements and limitations honestly.

## Progress / rulings

- Ruling: Create a new branch in the existing checkout to preserve extensive prior uncommitted work; a fresh worktree would omit the current implementation being improved.
- Approved answers Q1–Q10 recorded in spec. Dashboard deferred.
