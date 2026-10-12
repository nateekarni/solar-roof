# Dashboard, financial workflow and document refinement Implementation Plan

> **For agentic workers:** Use subagent-driven-development task-by-task. User approved the nine-point design in chat on 2026-10-10.

**Goal:** Implement all nine approved refinements without replacing previously approved work.
**Architecture:** Extend existing scoped Dashboard read models and operation filters, then consume them in the current UI. Keep original issued PDF bytes immutable; change the renderer for future documents and synthetic samples only.
**Tech Stack:** Next.js, React, shadcn, NestJS, PostgreSQL, pdfmake, PDF.js.
**Spec:** The user's nine-point request and approved assistant design immediately preceding “ยืนยัน”; copied into tasks below.

## Global constraints
- Preserve dirty checkout and existing work. No commit, push, deployment or financial mutation.
- Date selections stay within three calendar months. Compare only authorized sites and role-allowed financial/configuration fields. Add site columns progressively; no silent truncation to ten.
- Current validation: one customer, one site, one active gateway; keep schema future-compatible.
- Missing readings remain missing. Do not fabricate energy, receipts, reminders or configuration.
- Thai/English and responsive layouts; graphs maintain consistent per-site colors.
- Work in existing checkout; fresh sequential implementation agents and read-only reviews. Tests precede behavior changes; CSS-only copy tweaks verified via rendering.

### Task 1: Financial read models and bill navigation (requests 1, 2, 7)
Files: apps/api/src/modules/dashboard/{dashboard.service.ts,financial-insights.ts,operations.service.ts}; related query validation and packages/api-contracts/src/dashboard*.ts; apps/web/features/shared/{operation-columns.ts,operation-query-table.tsx,record-navigation.ts}.
- [x] Test exclusive collection buckets, partial payments, pending review, zero counts, scoped date filters and successful reminder counts.
- [x] Extend summary collection with amount/count per status and aging 1–7/8–30/31–60/>60 days, as of Bangkok today for selected billing cohort. Preserve old fields for compatibility.
- [x] Expose bill overdue days/successful reminder count; support status/site/date filtering for bills and paid receipts. Retain filters through list/detail previous/next navigation.
- [x] Run focused API/contracts/navigation tests; publish exact DTO/query names to next task.

### Task 2: Dashboard presentation and comparison (requests 1–4)
Files: apps/web/features/dashboard/{dashboard.tsx,collection-chart.tsx,compare-modal.tsx}; new focused aging/comparison helpers/components; API dashboard compare/controller/contracts as required.
- [x] Test collection destination query strings and counts, comparison authorization/date limits, matrix rows and unavailable values.
- [x] Replace revenue card with aging, make collection statuses links, show solar/alerts side by side (stack mobile).
- [x] Comparison: dates at top, add/remove site columns, grouped metric rows for production/finance/config; production and finance multi-series graphs below. Use grouped bounded queries, no per-site raw telemetry scan or hidden ten-site truncation.
- [x] Verify browser at desktop/mobile, empty/loading/error, permissions and selected-site scope.

### Task 3: Site creation and settings (requests 5, 6, 8)
Files: apps/web/features/sites/{site-service-dialog.tsx,site-service-payload.ts}; organization form fields; apps/api/src/modules/sites files; settings business page/navigation and own-password.tsx, own-authenticator.tsx.
- [x] Test inline new customer payload, coordinate bounds/pairs, server one-site/customer and one-active-gateway restrictions.
- [x] Inline full document customer fields; remove customer picker/nested dialog/shared-data confirmation; replace region with latitude/longitude.
- [x] Remove redundant business defaults page/menu after tracing references, retain runtime defaults/data needed by consumers. Remove password mask and 2FA description.
- [x] Verify role-aware creation and browser form validation without creating real data.

### Task 4: PDF template (request 9)
Files: apps/api/src/modules/documents/document-layout.ts and renderer tests; output/pdf samples.
Reference: C:/Users/natee/Downloads/QT2610001-PJ26012.pdf (two pages); rendered references tmp/reference-document-layout.png and tmp/reference-document-layout-page2.png.
- [x] Inspect font sizes/positions. Test invoice/receipt headings, sums, page breaks, signatures and preserved Thai text.
- [x] Match compact header, issuer/customer two columns, thin ruled item grid (quantity/unit/unit-price/total), totals at grid bottom, payment/terms below, signatures/footer. Preserve current brand/logo/company; document content remains billing/receipt, not quotation-specific terms or draft badge.
- [x] Generate synthetic samples with production renderer; inspect all pages, no clipping; no issued PDF rewrites.

### Task 5: Integration verification
- [x] Independent review changed boundaries; fix concrete findings.
- [x] Web/API typecheck, focused tests then full tests and production build.
- [x] Browser proof collection filter→detail navigation, aging, comparison matrix/chart/date, site modal, settings and mobile.
- [x] Publish final samples and verification report, mark completed tasks here.
