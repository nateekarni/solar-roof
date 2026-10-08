# Organization Portal Implementation Plan

> **For agentic workers:** Use executing-plans or subagent-driven-development task-by-task.

**Goal:** Three-menu organization portal with measured energy, outstanding invoices and contract-centered documents.

**Architecture:** Keep school_user storage/role identifiers and existing server authorization. Use /contracts as the Documents hub for organization users, retaining existing billing/receipt URLs for deep links. Reuse existing scoped power-flow and document/payment controls. Missing contract linkage must be explicit, not inferred from site alone.

**Tech Stack:** React, Next.js, existing node:test/render tests and API operation endpoints.

**Spec:** docs/ui-improvement-decisions-2026-10-08.md

## Global Constraints

- Organization terminology throughout user-facing general labels; actual school organization names remain unchanged.
- Three top-level menus Home, Documents, Settings across mobile/desktop.
- Diagram uses measured values only, missing is never zero.
- Existing organization access scope is authoritative; no widening role permissions.
- English units, localized dates and text. No issuer/bank edits for organization users.

### Task 1: Navigation and terminology

**Files:** apps/web/components/navigation/nav-config.ts and spec; packages/i18n/src/th.ts/en.ts; relevant user-facing school forms, financial intros and organization settings.
- [ ] Add failing navigation tests asserting exactly three top-level organization entries and Documents points to /contracts; retain owner/admin navigation behavior.
- [ ] Return organization-specific three-entry navigation from getNavItems; getBottomNavItems follows same entries. Settings deep links remain accessible through account/settings screens.
- [ ] Replace general school labels with Organization terminology without renaming fields/types/routes or real seeded organization names.
- [ ] Test navigation and localized financial intro. Typecheck, review text audit and commit scoped files.

### Task 2: Organization home

**Files:** dashboard.tsx, school-dashboard.tsx, new organization-power-diagrams.tsx and focused tests.
- [ ] Test outstanding-invoice selection excludes paid/cancelled/draft and includes pending/rejected evidence states; use a pure helper for selection.
- [ ] Fetch a scoped page of bills instead of only latest bill; expose load error and pagination/See all rather than implying complete totals from a limited page.
- [ ] Respect selected site for daily/monthly/period summary requests. Supply SiteFilter to Home; availableSites remains server-scoped.
- [ ] Use useScopedPowerFlow and SolarPowerDiagramView for per-site diagrams with canonical fresh generation reading; show other dimensions unavailable until actual independent measurements exist.
- [ ] Show aggregate numeric summaries, per-site diagrams, localized outstanding invoice list linking to real billing actions. Keep missing-data indicators.
- [ ] Run behavior/render tests, full web typecheck and checks, commit.

### Task 3: Documents hub

**Files:** contracts/page.tsx; new organization-documents.tsx, organization-document-model.ts and tests.
- [ ] Test grouping uses explicit contractId only; documents without linkage go into a clearly labeled unassigned/site group, never incorrectly attributed to a contract version.
- [ ] For organization role render a scoped client hub; other roles keep existing OperationPage. Fetch contracts/billing/receipts through existing authenticated apiClient, follow endpoint pagination safely and surface errors.
- [ ] Render selectable accessible contract cards (site/number/status/dates), localized month/status filters and invoice/receipt lists, reuse existing preview/payment controls for actual actions.
- [ ] Legacy rows without contractId remain viewable and explicitly unlinked. Financial implementation will supply persisted contract linkage; do not fabricate associations in this UI branch.
- [ ] Test filtering, missing links, API errors and unauthorized access behavior; run web tests and commit.

### Task 4: Organization settings

**Files:** school-settings-view.tsx and relevant settings routes.
- [ ] Localize all user-facing text, keep display/account preferences accessible through Settings.
- [ ] Legal identity/address/tax information read-only; remove redundant contract management from settings in favor of Documents link.
- [ ] Preserve existing password and preference APIs, validate English and Thai failures.
- [ ] Run targeted tests/typecheck and responsive light/dark/locale inspection.

## Review checkpoint

Review branch against the full interview. Missing persisted contract association is a documented financial integration dependency; no false grouping. Logo/color changes are in separate branding branch. Do not change main or reset local data here.
