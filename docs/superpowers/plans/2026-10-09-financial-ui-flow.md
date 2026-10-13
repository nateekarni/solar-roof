# Financial UI flow implementation plan

> **For agentic workers:** Use executing-plans or subagent-driven-development for the independently owned tasks below.

**Goal:** Implement the approved rates, financial record, navigation, and modal/error experience.

**Architecture:** Reuse current API authorization and financial mutations. Extract shared presentation and error behavior; preserve a list ID snapshot for record navigation so a reviewed item leaving a filter cannot shift the next item.

**Tech Stack:** Next.js App Router, React, Radix, TypeScript, node:test through tsx.

**Spec:** `docs/superpowers/specs/2026-10-09-financial-ui-flow-design.md`

## Global constraints

- Preserve existing uncommitted work; do not reset or commit unrelated files.
- Thai/English labels, responsive layouts, existing authorization and financial-readiness checks.
- No additional financial mutations or changes to issuance semantics.

## Tasks

- [x] Rates: restructure `features/settings/rate-settings-workspace.tsx` into a site-first view and separate template management dialog; preserve all application scopes and preview confirmation. Test scope/preview behavior and bill correction consequences.
- [x] Record detail: update `features/shared/record-details.tsx` and billing review components for inline review first, readable data, on-demand documents, and history. Test permissions, multi-transfer selection, and post-review state.
- [x] Shared dialogs/errors: audit modal call sites; implement consistent field spacing and shared error reveal/focus behavior. Test invalid fields, general errors, reduced motion, and retained input.
- [x] Navigation: implement a tested `record-navigation.ts` model to traverse cursor pages with original filters, snapshot IDs, and compute neighbors without shifting after approval. Integrate list entry and top-right record controls, including customer lists and direct links.
- [x] Status/list: remove slip from billing display keys; add receipt lifecycle labels/colors and superseded filter. Test Thai/English badges and filter vocabulary.
- [x] Integration: run targeted suites and web typecheck, then full web tests; inspect desktop/mobile UI where a running local app is available. Record coverage and any environment limitations.

## Navigation test cases

1. Query retains status/search/sort/direction/date, removes starting cursor when collecting full result order.
2. Two or more pages preserve server order; duplicate cursors fail rather than loop.
3. Snapshot `[A,B,C]` keeps next `B` after approving `A`, even when live filter would exclude `A`.
4. First/last neighbors are absent; a record outside the snapshot has neither neighbor.
5. Return URL is constrained to the originating financial list and preserves its query.

## Validation commands

From `apps/web`, use `pnpm exec tsx --tsconfig tsconfig.ui-tests.json --test <target spec paths>` during each behavior change, then `pnpm exec tsc --noEmit -p tsconfig.json` and `pnpm test` after integration.
