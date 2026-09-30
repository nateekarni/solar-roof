# Customer feedback acceptance ledger — 2026-09-30

This records the local working tree, including pre-existing user changes. It is not a production readiness certificate. Financial core changes are proposed only: the user requested review of the diff before implementation. No production migration or deployment was performed.

**Status:** Implemented = code and indicated local checks; Partial = remaining integration or implementation work; Proposal = not applied. Annual selection is disabled, following the later explicit feedback item. Test fixtures are isolated and never application fallbacks.

| # | Customer feedback | Status and evidence |
|---|---|---|
| 1 | One school/site/gateway, many devices; hide school menu | Implemented in assets controller, site forms, navigation and migration010; migration rejects conflicting legacy data instead of deleting it. Device add/list supported. Requires migration on target environment. |
| 2 | Owner cannot configure gateways; admin/mechanic only | Implemented server route policy and resource guard plus site controls; HTTP integration verifies owner403/admin201 and scoped access. |
| 3 | No mobile app yet | Preserved web scope; responsive browser checks only. |
| 4 | School text input | Implemented site form/edit; scoped admin cannot create another school's site. |
| 5 | MQTT only; HTTPS later | MQTT enforced in assets; HTTP ingestion denied. |
| 6 | Generate topic from gateway name, subscribe wildcard | Implemented configured topic identity validation and subscription; cross-gateway sample rejected in tests. |
| 7 | Show preset fields/registers | Implemented site forms and preset selection; mapping edits versioned, byte order retained. |
| 8 | Meter serial label | Implemented Thai meter label in site forms. |
| 9 | Gateway sends; server receives and responds | Implemented persist-before-ACK, replay deduplication, response/config exclusion; tested through real local broker and PostgreSQL. |
| 10 | Preserve gateway/server timestamps | Implemented ingestion and schema; late samples do not replace latest data. |
| 11 | Configured interval overrides hardware | Partial: persisted and published retained configuration; physical hardware application has not been verified. |
| 12 | Named gateway API delivers hardware parameters | Partial: named lookup rejects ambiguous identity, configuration publishes/replays after reconnect; hardware acknowledgement/application requires field test. |
| 13 | Latest data within120seconds is real time | Implemented backend and UI; exact120second boundary tests. Missing/future timestamps are not live. |
| 14 | Site relative last update/offline | Implemented real server-received timestamp; archived/inactive site state preserved. |
| 15 | Refresh every10seconds | Implemented dashboard/site refresh, pauses while hidden or offline. |
| 16 | Separate gateway dashboards | Implemented gateway cards and site telemetry detail using persisted measurements. |
| 17 | Owner site view only | Implemented UI and server enforcement; browser/HTTP acceptance checks. |
| 18 | Remove total schools homepage statistic | Implemented dashboard cards/navigation. |
| 19 | Monthly range no more than3months | Implemented picker and API validation tests. |
| 20 | Annual max1year / annual selection prohibited | Later prohibition takes precedence: annual option disabled and API rejects yearly mode. |
| 21 | Comparison date selection; label site | Implemented bounded range/site comparison; query consolidated to scoped grouped query. |
| 22 | Dashboard site filter | Implemented scoped site IDs and backend rejection of out-of-scope sites. |
| 23 | Bill/paid counts and ordinary currency units | Implemented actual scoped billing counts/amounts in THB; upstream financial accuracy remains pending proposal. |
| 24 | Merge diagram and overview | Implemented system route redirect and dashboard power flow. Missing measured grid/load stays unknown. |
| 25 | Severity conditions in gateway settings | Implemented persisted gateway rule/interval form and delivery; actual alarm/hardware end-to-end acceptance still required. |
| 26 | Contract site/tax data; editable rate periods/open end | Partial: existing form and real read DTO support fields; server overlap, boundary and charge validation are in unapplied financial proposal. |
| 27 | Standard bill/receipt PDF | Partial: shared A4 preview layout, browser Print/Save PDF; issued documents without immutable snapshots explicitly unavailable. Snapshot backend and full visual financial acceptance pending. |
| 28 | Email bill to selected email | Partial: UI recipient/endpoint corrected; existing server can swallow SMTP failure. Fix is proposed only; real delivery unverified. |
| 29 | Company/bank management | Partial: persisted settings and required account fields; absent company service returns empty. Existing migration009 samples and general settings defaults remain pending financial diff. |
| 30 | Admin drag/drop payment evidence | Existing flow retained with MIME/10MB validation; receipt/payment transaction integrity remains proposed. |
| 31 | Receipt modal same layout as invoice | Shared layout implemented; immutable snapshot read path is pending, so legacy documents are not fabricated. |

## Additional fixes and limits

- JWT authorization reloads current active user role/scope. Server checks IDs and ID arrays; trailing-slash and scoped role-escalation cases are covered. Scoped direct contract collection is denied until the proposed query is applied; the scoped operations read remains available.
- Reports now persist actual CSV bytes and enforce creator access. PDF/XLSX report options were removed because those generators do not exist. CSV formula cells are neutralized and exported headers match real columns.
- Removed invented telemetry, report files/sizes, notification delivery, account details, session/2FA success states and login capacity claims. Unsupported functionality is explicit. Financial placeholders are still listed above; the entire system cannot yet be described as having no mock fallback.
- Migrations use checksum tracking, locking and per-migration transactions. Migration010/012 passed on a disposable database and rerun. Migration011 is deliberately excluded.
- Full production performance/load, physical hardware configuration application, SMTP, payment concurrency, financial PDF print output and legacy-data migration acceptance remain unverified. Query consolidation and bounded reads improve identified paths, but no claim of best possible performance is made.

## Verification

- Workspace `pnpm test`, `pnpm lint`, `pnpm build`: passed. API suite33 passed/1 database test skipped in default run; the skipped query test passed separately against disposable PostgreSQL. Three focused web mapping/freshness tests passed.
- HTTP/MQTT integration against isolated PostgreSQL/EMQX: passed authorization, bounded date ranges, persisted reports, duplicate telemetry, durable ACK and empty telemetry checks.
- Browser acceptance passed login, dashboard, hidden school/year controls, owner view-only sites, last-update column, reports and mobile width with zero page errors. Desktop/mobile screenshots were inspected under `apps/web/test/artifacts/`. These tests use isolated fixture accounts/data, not production credentials or fallback data.
- The financial empty-baseline regression failed against the unchanged implementation, then passed only in the isolated proposal. All proposed tests are outside active discovery:7 passed with an isolated API typecheck; standalone `git apply --check` passed. This does not verify real database concurrency, migration or SMTP.

Review artifacts: [original two-axis review](system-review-2026-09-30.md), [financial status](billing-implementation-report.md), [financial patch](financial-proposal.patch), [gateway report](gateway-implementation-report.md), [dashboard report](dashboard-implementation-report.md).
