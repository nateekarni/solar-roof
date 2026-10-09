# Role notifications and shared UI implementation plan

> **For agentic workers:** Use subagent-driven-development to implement independent tasks and review the integrated result.

**Goal:** Every role receives only accessible notifications; reading is personal; frontend controls and colors use the shared design system.

**Architecture:** A scoped API feed combines real persisted workflow events and permitted technical alerts. A separate per-user read store leaves shared alert acknowledgment untouched. The shared header uses one responsive Bell component for all verified roles. UI migration reuses existing shadcn primitives and semantic theme tokens.

**Tech stack:** NestJS, PostgreSQL, Next.js, React, shadcn/Radix, Tailwind.

**Spec:** User-approved Q1–Q3 in this chat: actual business events plus authorized technical alarms; per-user reads; whole frontend migration.

## Constraints

- Filter rows, unread count, mutations and destinations on the server using the authenticated principal and existing organization scope.
- Customer scope never includes another organization or technical infrastructure alerts.
- No generated example notifications, widening page access, or changes to financial readiness.
- Preserve previous site-form changes and existing unrelated working files. No dependency installation, commits or deployment.
- Native HTML inside shared primitives and authentic static brand assets are intentional, not duplicate controls.

## Tasks

- [x] API: migration and feed/read endpoints; tests for cross-user reads, role restrictions, missing/changed organization assignments, out-of-scope IDs, counts and destinations. Sources must correspond to persisted real events.
- [x] Bell: all-role trigger, responsive popover, scoped rows/count, per-user read commands, inaccessible-link defense, loading/error/empty states; ignore stale responses on session or site change.
- [x] Controls: migrate all nonprimitive raw form controls and interactive cards to shared shadcn components; preserve values, keyboard behavior and form submission.
- [x] Colors: semantic status/chart/illustration tokens; migrate every production component literal/palette color; retain authentic asset colors and token definitions.
- [x] Integrate: review diffs, type checks and meaningful focused/full suites, audit residual raw matches, rendered desktop/mobile and dark/light checks with role-scoped fixtures.

## API contract

GET `/v1/me/notification-feed?site_id=...` returns `{rows,unreadCount}`. Rows contain `id,title,detail,destination,createdAt,readAt,kind` and optional `severity`. PUT `/v1/me/notification-feed/read` accepts `{ids}`; PUT `/v1/me/notification-feed/read-all` accepts optional `{siteId}`. Read commands never acknowledge alarms.

## Verification and rollout

- Web: 235 tests passed; desktop/mobile role fixtures passed for all five roles and light/dark themes without browser errors.
- API: full regression suite passed (313 passed, 6 optional integrations skipped); dedicated PostgreSQL notification integration passed 10 tests, including deterministic concurrent reads on two connections and the issued invoice destination.
- Production components contain no native form controls outside shared primitives or literal component colors outside theme token definitions.
- Migration 038 is registered but has not been applied to production. Contracts/documents begin history at migration time; verified payments retain their actual historical timestamps. Bell shows the latest 100 accessible events and counts all unread accessible events.
- Review corrected invoice destinations to the supported document detail route, contract initialization duplicate events, and concurrent read-count snapshots.
