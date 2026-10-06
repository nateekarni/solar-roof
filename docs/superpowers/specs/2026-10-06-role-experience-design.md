# Role access and responsive user experience

## Approved intent

Admin is Super Admin with access to every application menu and role-authorized action. Owner manages company financial documents and company information. School User views production and financial documents for the assigned school and submits payment evidence. Owner and School User use a minimal, nontechnical interface. Support responsive web now and a future mobile application using the same server-enforced authorization.

## Existing findings

- Desktop sidebar and mobile menu both render `NAV_ITEMS` without role filtering; mobile bottom navigation defines a separate role map.
- `Dashboard` renders Gateway summaries and operational diagnostics for every role.
- Server policies currently grant Owner technical reads, broker access and user management. Some financial routes and role decorators exclude Admin.
- School scoping exists in `schoolScope`, `PlatformAccessGuard`, dashboard queries and operation reads. Preserve and verify those checks, including users without an assigned school.
- The working directory contains substantial pre-existing changes. Preserve them and limit edits to the access and presentation flow.

## Access model

One domain module describes role capabilities and page access through a small interface. Server adapters apply those capabilities to route authorization, role decorators and verified resource scope. Web navigation and page guards consume the same role rules. Browser storage is presentation state only; authoritative identity comes from the authenticated server session.

| Role | Pages | Actions and scope |
| --- | --- | --- |
| Admin | All existing application pages | All role-authorized actions across schools; domain validation and financial readiness still apply |
| Owner | Home, contracts, invoices, receipts, company and banking, personal account preferences | Manage documents and company information across schools; no equipment configuration, users, system defaults, audit, brokers or operational controls |
| School User | Home, production, contracts, invoices, receipts, personal account preferences | Read assigned-school data and download available documents; submit payment evidence for own school; no approval or document issuance |

Retain existing operator/accountant compatibility; do not migrate or remove stored roles. Deny unknown roles. Resource scope is validated for list queries, direct detail URLs, downloads and mutations. Admin is globally scoped even when a legacy school assignment remains on the account. An unassigned School User receives no school data.

Financial readiness is independent of role permission: granting Admin access must not bypass accounting readiness, payment verification, receipt availability or document lifecycle rules. Company/bank data needed for payment instructions may be read by School User, but configuration remains inaccessible.

## Presentation

Use existing typography, theme tokens and Thai/English translations. Primary surfaces use quiet backgrounds, rounded cards, clear titles and generous spacing. Use the repository's term “หน้าแรก”. Avoid Gateway, protocol, register mapping and raw telemetry labels in Owner and School User screens.

Owner home: selected period, production and revenue summaries, document/payment status when supported by existing data, production and revenue trends, and direct links to contracts, invoices and receipts. Never infer missing financial values as zero. Hide Gateway cards, technical alerts, live power-flow diagnostics and equipment controls.

School home: identify the assigned school, selected period, generated energy and own billing status, production trend and direct document links. Present electricity charges as charges rather than company revenue. Production details reuse the existing daily/monthly date selector and available measurements, with plain explanations for unavailable data. Preserve the API's established maximum of three calendar months per request; annual reporting is outside this role/responsive change. Do not offer cross-school comparison or selection.

Documents retain existing lifecycle behavior and downloads. Owner sees permitted management actions. School User sees readable document summaries and payment-evidence submission only. Use clear amounts, periods and status labels; operational configuration details stay out of these views.

## Responsive behavior

- At 360/390 px, use one-column cards, wrapping titles and full-width essential controls. No page-level horizontal overflow.
- At 768 px, use two-column summaries where space allows; at 1280 px, expand charts and summary layouts.
- Desktop sidebar, mobile menu and bottom navigation derive destinations from the same role configuration.
- Keep mobile navigation compact and allow access to every permitted document destination through the menu. Respect bottom safe-area insets and provide at least 44 px touch targets.
- Tables use existing mobile card presentation or contained scrolling; dialogs fit the viewport and scroll internally. Keep labels, focus order and keyboard access clear.
- Future mobile clients consume authenticated API capabilities and scoped data; no native application, new authentication protocol or speculative mobile framework is included.

## Verification and completion

Write failing authorization tests before changing access behavior. Cover Admin global access, Owner rejection of technical/user routes, School User own-school access and cross-school denial, unknown roles and missing school assignment. Test navigation destinations against page access and test direct server page access independently of menu visibility.

Run relevant domain, API and web tests and type checks. Inspect rendered Owner and School User views at 360/390, 768 and 1280 px, including light/dark theme, document dialogs and empty states. Report any environment limitation separately from verified results. Review the final diff for unrelated changes and readiness bypasses.
