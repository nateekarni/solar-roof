# UI consistency implementation plan

**Goal:** Apply the approved company, configuration and data-table presentation across the local application.

**Architecture:** Keep the shared shadcn/TanStack table, use server sorting and scoped record endpoints, and render configuration values vertically before edit mode.

**Tech Stack:** Next.js, React, shadcn, NestJS, PostgreSQL.

**Spec:** User-approved requirements in the current conversation.

- [x] Company/bank page: correct title and breadcrumb, only related cards, vertical values, edit/save/cancel.
- [x] Shared table: remove column picker, move query controls above headers, sort using API query, ellipsis actions and row navigation.
- [x] Scoped record detail API and separate route; preserve authorization and bound identifiers.
- [x] Full-width account/security/school settings; vertical system settings values.
- [x] Verify typechecking, table rendering, scoped endpoint tests and desktop/mobile browser behavior.

Verification: web typecheck + 8 unit tests; 1 UI empty table test; API typecheck + 54 unit tests (one unrelated disposable PostgreSQL dashboard test skipped); 140 local PostgreSQL sort queries. Browser checked desktop 1440×900 and mobile 390×844, company edit cancellation, row/menu detail navigation and comparison empty table. Most operational records are absent in the local database; populated billing/report/telemetry flows were not exercised through the browser. Independent review findings were fixed and reviewed again.
