# Settings layout and password recovery follow-up

User approved gateway freshness semantics, settings/staff/account layouts, grouping password and second-factor controls, a separate linked-accounts card, and real email password recovery. Dashboard remains deferred. Google OAuth implementation is deferred; do not fabricate linked accounts.

Use subagent-driven-development for independent implementation and scoped review. Preserve all existing unrelated working-tree changes. Do not commit or deploy.

- [x] Staff: 40px tabs before search, employee/position management dialogs; employee Profile and Permissions tabs, display identity/avatar, position selection; inline effective permission badge and selectable/searchable site table; preserve permission previews/revocation and explicit save.
- [x] Reception settings: balanced padded cards with headings/descriptions, normal-weight values and field labels.
- [x] My Account: profile card with avatar left/details next/edit top right; preference/password/2FA rows in another card; authenticator/mobile choice dialog; linked accounts separate card with truthful empty state.
- [x] Password reset: single-use expiring email token, throttled generic request response, existing 2FA verification preserved, atomic password change/session revocation; connect UI and local SMTP test.
- [x] Email OTP: user replaced Mobile OTP with Email OTP. Use verified account email and existing SMTP; no SMS implementation. Protect enrollment/login/disable/reset with purpose-bound, expiring, single-use codes and persisted throttling.
- [x] Focused meaningful tests, type checks, browser verification and final scoped review.

Ruling: keep staff permissions and site scope in their existing business/technical domain, preserve explicit-save semantics and warn before discarding dirty modal work. Existing employee identity is read-only except approved position/grant edits.
