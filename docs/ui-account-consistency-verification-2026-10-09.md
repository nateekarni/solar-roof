# UI and account consistency — delivery and verification

Scope: approved Q1–Q10 for all roles. Dashboard is deferred by the user. Existing unrelated working-tree changes were preserved.

## Delivered

- Shared operational lists use accessible search, resource-specific filters and one period picker; API predicates, cursor fingerprints, summaries and exports share validated filter semantics. Alert and audit count cards are removed.
- Gateways show connectivity badges and latest telemetry receipt, search/status/site filters, and a final unnamed actions column. Configuration version diagnostics remain in the configuration workflow.
- Employees and positions use header actions, tabs after the description, search/filters and three-dot actions. Invitation, permission previews and revocation remain in their existing domain workflows.
- Alert rule settings open in a modal from a persistent header button. The empty card reflects absence of enabled rules, distinguishing no configured rules from all disabled rules.
- Concise settings navigation leads to My Account, combining profile, preferences, password and authenticator settings. Own-avatar selection supports drag/zoom cropping; only a validated 256px re-encoded image persists and appears in the header.
- Standard RFC 6238 authenticator setup/login and single-use recovery codes are implemented. Recovery codes require explicit saved acknowledgement before navigation. Wrong credentials and attempt throttling have specific Thai messages.
- Technical alert evaluation and delivery are independent of financial write eligibility. Existing financial safety boundaries remain enforced; unavailable technical email delivery does not burn retries.

## Schema and deployment requirements

SQL migrations are the runtime schema authority in this codebase. Migration `053_user_authenticators.sql` stores encrypted active/pending credentials, expiry, replay counters, hashed recovery codes and attempt windows. Migration `054_user_avatar.sql` adds bounded avatar data to users. These migrations were applied only to the verified local Docker financial-review database, not to a deployed database.

Set a stable, secret 64-hex-character `TOTP_ENCRYPTION_KEY` before enabling enrollment in another environment. Keep it across restarts so encrypted authenticator credentials remain readable. `.env.example` documents the setting; the gitignored local review environment is configured. `TECHNICAL_ALERTS_ENABLED` defaults to true; existing SMTP settings determine email availability. These are deployment settings, not extra product controls.

Current profile media is intentionally bounded inline data. Credentials are isolated in their own table and service; filter vocabularies are typed by resource; alert kinds/channels keep the existing extensible model. No speculative configuration fields were added to the UI.

## Verification

- Full API suite: 450 tests, 438 passed, 12 opt-in tests skipped, zero failures.
- Actual PostgreSQL authenticator integration: passed separately on the verified local target, including concurrent factor consumption, recovery use and session revocation.
- Full web suite and TypeScript checks: 297 tests passed, zero failures.
- Next.js production build: passed with `NODE_ENV=production`. An initial build used the local development environment value and failed prerendering; correcting the build environment resolved it.
- Edge/Playwright browser verification: 11 checks passed at 1440×1000 and 390×844. Own-account/name/header persistence for admin, owner, operator, accountant and customer; avatar pan/zoom/save/reload; desktop/mobile gateway, alerts, staff and audit controls; enrollment, implicit recovery-dialog dismissal prevention, password-only rejection, recovery login and disable. No browser page errors. Temporary test users and assignments are removed in a finally block.
- Integration review findings were fixed and rereviewed with no remaining actionable findings in the scoped review.

Browser evidence and the local QA script are saved under the task visualization directory. Dashboard concept images remain proposals and were not implemented.

## Approved follow-up: relative gateway receipt

Gateway latest receipt now reuses the site's relative-time component on desktop and mobile, updating each second. Fresh means at most 120 seconds: green pulse; older receipt is warning; missing/invalid receipt is neutral. Reduced-motion preference suppresses animation. Absolute receipt time remains available through the title tooltip. Site filter is removed; search and status remain. Five focused gateway/relative-time/hydration tests and web TypeScript checks passed.

Additional settings/staff/account layout requests are being clarified. Google account linking is external sign-in identity, distinct from authenticator second-factor verification; no OAuth or forgotten-password flow existed in the inspected identity code.
