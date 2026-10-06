# Task 3 — Payload profile and site UI

Implemented web-only changes; no staging, commits, browser automation, broker writes or API edits. Prior UI work was retained. Read the approved spec, Task 3 brief, authoritative Task 2 report, apps/web/AGENTS.md, bundled Next use-client guide, shadcn skill and verification-before-completion skill. shadcn CLI docs failed because sandbox networking returned EACCES; official Select/Field/DataTable documentation was read through web tools.

## Files and behavior

- `apps/web/features/sites/payload-contracts.ts`: explicit profile/revision/config/device/canonical-field contracts. External site/gateway IDs and ACK topic accommodate the actual legacy null response; legacy sites do not show payload controls.
- `apps/web/features/shared/payload-profile-settings.tsx`: separately labelled full-width payload profile settings alongside legacy register presets. Every revision remains visible, with shadcn filters and sortable mappings. Read-only display exposes revision UUID, version, schema, device type, groups, units, conversion and role. Edit opens a controlled vertical form, suggests a patch version, and POSTs a new immutable revision. Fields can be added/deleted/edited; only the three declarative conversions and allowed roles can be selected. API errors remain in the form; existing assignments are explicitly documented as pinned.
- `apps/web/app/(app)/settings/meter-presets/page.tsx`: adds PayloadProfileSettings without replacing the existing register preset work.
- `apps/web/features/sites/site-form-dialog.tsx`: legacy/canonical selector; canonical billing profiles require billing-import and exclude logger profiles. Explicit independent external site/gateway/device IDs, pinned revision, PM2230 physical model and required separate serial. Canonical endpoint is generated from aliases; mode switching clears incompatible assignment and restores legacy endpoint. Legacy auto-generators do not overwrite canonical endpoint. Submission includes only the mode's profile field. Basic alias validation and API failures remain visible. Wizard dialog can scroll.
- `apps/web/features/sites/payload-connection-card.tsx`: vertical read-only external identities, exact wildcard subscription, device publish topics, dataAcept ACK topic, pinned revision and copyable ready-to-publish JSON. Includes local MQTTBox TCP/WebSocket/dashboard guidance and new message ID/lot/time versus intentional retry note. Sortable rejection and unmapped raw tables remain visible when empty. Explicit Edit/upgrade filters by current device type and PATCHes only revision assignment. Attach supports PM2230 and SmartLogger based on selected profile, separate physical serial and external device ID; logger does not change billing assignment. Errors remain visible.
- `apps/web/features/sites/site-edit-dialog.tsx`: standard connection card with explicit profile edits and attachment; retains legacy addDevice form. Friendly gateway-name edits preserve standard topic (endpoint prefix guards even before the config request finishes). External IDs are locked with reprovisioning explanation.
- `apps/web/features/sites/site-telemetry-dialog.tsx`: retrieves payload config independently of existing telemetry, showing topics/fixtures before first sample. Sortable canonical table shows device/tag/value/unit/raw value/raw unit/group/poll time/receive time/quality/communication/age/stale/profile/version with named headers retained when empty. Age and quality are separate; poor quality cannot be labelled realtime solely because source is fresh. Legacy compatibility metrics remain; RawRegisters/mapping display is hidden only for canonical mode.

## Verification

Final commands (PowerShell, login:false):

```text
node_modules/.bin/tsc.cmd --noEmit -p apps/web/tsconfig.json
node_modules/.bin/tsx.cmd --tsconfig apps/web/tsconfig.ui-tests.json --test apps/web/features/shared/empty-table.spec.tsx
```

Web typecheck: exit 0. Existing focused table test: 1 test, 1 pass, 0 fail, exit 0. Initial sandbox tsx failed with uv_os_get_passwd ENOMEM; approved escalated run passed, and final run with login:false was clean.

## Remaining verification

Root owns rendered CUA verification, real provisioning through UI and screenshots. No browser result is claimed by this task. API remains the authority for profile validation, duplicate version conflicts, billing/type restrictions and ownership. Physical gateway configuration, MQTTBox manual publication and production TLS are not certified by web typechecking.

## CUA review corrections

Root observed Step 2 Next progressing and saving without clicking final Save. The form now prevents implicit submission, Next click prevents its default action, and a separately keyed final `type=button` invokes react-hook-form submission explicitly. Save additionally guards step 3, loading and canonical validation. Review also caught the canonical validation function missing from navigation; Step 2 now calls it before Step 3 and final save calls it again.

Root observed `GW-002` displayed as a date. The generic date heuristic matched `gateway` because it contained `at`. Added `isTemporalColumn` in `operation-columns.ts` and used it in `operation-table.tsx`: timestamps require camel-case `At` or `_at` suffix, with existing date/time/Thai field recognition retained. Regression in `operation-columns.spec.ts` covers gateway/name/category/format as text and actual date/timestamp columns. Observed red (gateway true instead of false), then green: 3 tests, 3 pass, 0 fail, exit 0. Final web typecheck after these fixes: exit 0. Root owns retesting actual wizard interaction in CUA. The already-created labelled UI site remains intact.
