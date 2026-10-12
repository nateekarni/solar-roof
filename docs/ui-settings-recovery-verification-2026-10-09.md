# Settings layout, Email OTP and password recovery

User decisions: relative gateway receipt uses existing site freshness; reception cards have balanced padding/descriptions and normal-weight content; staff editors are dialogs; My Account groups profile and row controls; password and 2FA share a card; linked accounts remain separate. Mobile OTP was explicitly replaced by Email OTP. Authenticator App and Email OTP are alternatives. Google OAuth remains deferred and no external connection is fabricated.

## Delivered behavior

- Gateway receipt updates every second with seconds/minutes/hours/days, fresh green pulse within 120 seconds, warning for older data and neutral for absent/invalid data. Absolute time is available on hover. Site filter is removed.
- Reception/settings cards use headings, descriptions, balanced vertical spacing and normal-weight field labels and values.
- Employee/position tabs sit before search at 40px. Employee management opens a Profile/Permissions dialog, with avatar/identity display rows, position selection, permission table with inline effective badges, and searchable/selectable site scope. Explicit saves and impact previews remain. Employee, position and invitation dialogs guard busy/dirty dismissal.
- My Account profile card places avatar left, display rows next, edit at top right. Another card groups language with flag/name, theme, change/forgotten password and 2FA. External connected accounts have a separate truthful empty card.
- Enabling 2FA offers Authenticator App or Email OTP. Email requires the current verified account address and SMTP delivery configuration. Both methods retain single-use recovery codes and revoke sessions on enable/disable.
- Public forgotten-password and reset pages deliver real email links. Reset tokens are random, stored hashed, single-use and expire after 30 minutes. Reset still requires the account's enabled factor or a recovery code. Email codes expire after five minutes, are purpose-bound and single-use, with resend cooldown and persisted attempt limits.
- Password changes invalidate outstanding reset links and email codes; reset consumes its token, revokes sessions and clears authentication cookies. The reset page captures its token durably and removes it from the browser URL with no-referrer/no-store headers.
- Login/refresh retain their shared request budget; factor and reset mutations have distinct budgets. Factor status reads consume no mutation budget.

## Runtime and schema

Migration `055_email_factor_password_reset.sql` extends isolated authenticator method metadata and adds bounded-purpose email codes and reset tokens. It was applied only to the verified owned local Docker review database. Production/deployed databases were not modified.

Existing SMTP variables provide identity email delivery independently of financial automation. `WEB_URL` defines the reset-link origin. A stable `TOTP_ENCRYPTION_KEY` remains required for Authenticator App. Email OTP does not require SMS credentials. Tests send only to local Mailpit; no external emails were sent.

## Verification and review

- Meaningful red/green regressions cover method/verified-address availability, OTP purpose/expiry/single-use, persisted attempt failures, reset factor preservation and atomic consumption, password-change invalidation, cookie clearing, and real HTTP request-budget isolation.
- Actual PostgreSQL/Mailpit integration passes in an isolated schema, including concurrent factor/reset consumption and session revocation.
- Browser checks exercise desktop/mobile reception, gateways, staff and audit; 40px toolbar tabs and staff Profile/Permissions dialog; avatar and display-name persistence; TOTP enrollment/recovery/login/disable; Email OTP enrollment/login and reset; reset URL scrubbing and token replay rejection; own account for all five roles. QA honors Retry-After while logging into several test accounts in succession. Temporary accounts are deleted after tests.
- Production Next.js build and API/web TypeScript checks pass. Full API: 459 tests, 447 passed and 12 opt-in skips; full web: 303 passed; isolated PostgreSQL/Mailpit integration passed separately; browser: 13 checks passed with zero page errors.
- Scoped review findings were corrected: StrictMode token retention, dirty invitation dismissal, invalidating recovery credentials on password change, and authenticated-cookie clearing after reset.

Dashboard changes remain deferred. No commit or deployment was performed.
