# Solar Roof Branding Implementation Plan

> **For agentic workers:** Use executing-plans or subagent-driven-development task-by-task.

**Goal:** Solar Roof identity and centralized UI brand color across platform and new document previews.

**Architecture:** A shared platform BrandMark renders the approved symbol-only PNG; UI text uses a central brand name. Document headers use the approved Solar Roof wordmark PNG by default or configured issuer logo for new/draft documents. Existing issued artifacts and snapshots never acquire a current logo retrospectively. CSS primary is the single source of interactive brand color; semantic and chart colors remain separate tokens.

**Tech Stack:** React, CSS/Tailwind tokens, node:test rendering, generated transparent PNG assets.

**Spec:** docs/ui-improvement-decisions-2026-10-08.md and user follow-up: documents wordmark exact Solar Roof (no hyphen), platform symbol-only.

### Task 1: Asset and platform identity

**Files:** public/brand/solar-roof-mark.png, public/brand/solar-roof-document.png; new components/brand/brand-mark.tsx and spec; app/layout.tsx; header/sidebar/mobile-menu/login/loading components; current user-facing brand strings in web and API email/signatory defaults.
- [ ] Confirm PNG alpha and asset paths; preserve generated originals.
- [ ] Add render tests for decorative mark accessibility and explicit accessible label where standalone; no duplicated spoken brand name.
- [ ] Render symbol-only mark in every current platform logo location; retain actual sun icons used for theme/status/energy semantics.
- [ ] Replace user-facing Solar Platform with Solar Roof, a central web name export; keep package names/internal identifiers unchanged.
- [ ] Ensure loading/login/header/sidebar sizing and no colored background obscuring the mark. Dark-background contrast uses the bright mark and themed text.
- [ ] Test, typecheck and audit old brand names.

### Task 2: New/draft document logo

**Files:** features/shared/document-preview-modal.tsx, shared brand document component if needed, document render tests.
- [ ] Test draft logo default, configured logo, issued snapshot logo, and historical snapshot missing-logo behavior.
- [ ] Render full wordmark in new contract/draft document headers. Financial issued snapshot uses only its saved logoUrl/logo_url; never fall back to current configured logo on historical documents.
- [ ] Do not mutate existing PDF files or financial snapshots. Real artifact renderer branding is reconciled in financial implementation.
- [ ] Preserve current attachment/download logic and readiness gates.

### Task 3: Central primary and color audit

**Files:** app/globals.css and web components containing hardcoded brand colors.
- [ ] Bind ring/sidebar-primary/selected tab surfaces to primary token with color-mix where needed in both themes. Preserve independently meaningful success/warning/error and chart series colors.
- [ ] Replace fixed brand button/link/header colors with bg-primary/text-primary/primary-foreground and opacity utilities. Do not replace warning/status yellow or solar measurement colors by blanket regex.
- [ ] Inspect inline SVG/chart colors and replace brand uses with CSS vars; retain semantics and document fixed visual identity where meaningful.
- [ ] Run targeted tests/full web tests and typecheck. Audit remaining hardcoded colors, explain retained semantic/illustration colors.
- [ ] Verify a temporary primary change propagates in light/dark; restore approved yellow primary before commit.

## Constraints

- User approved generated logo design with precise no-hyphen document wordmark and symbol-only platform variant.
- No destructive data changes; no changes to financial permissions.
- Portal branch owns Organization vocabulary, avoid editing its files unnecessarily; integration reconciles overlaps explicitly.
