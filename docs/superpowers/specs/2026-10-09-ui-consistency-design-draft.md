# UI consistency and own-account design

Status: Approved for implementation on 2026-10-09, except Dashboard which is deferred by the user.

## Confirmed requirements

- Apply the shared list pattern to all roles, respecting existing permissions: title, description, primary action on the right; search left, filters right; no visible labels above search/filter controls, with accessible names retained; one period picker; blank final action heading with a three-dot menu.
- Remove count cards from system alerts and activity history.
- Alert-rule empty state means no configured alert conditions, independently of alert-event counts. A rule-settings card opens a modal. Persistent access and disabled-rule behavior remain to be resolved.
- Simplify settings navigation to company/payment accounts, electricity tariffs, service/documents, device templates, employees/permissions, activity history, and My Account, subject to role visibility.
- Gateway list emphasizes last received and colored status badges, with search and status filters. Remove configuration-version diagnostics from the list, retaining operational behavior.
- Replace employee invitation disclosure with an Add Employee button. Put Employees/Positions tabs after heading/description and list controls below.
- Merge own profile/preferences/security as My Account. Display values with separate edit actions; avatar selection opens a pan/zoom crop modal. Name editing, password change, and 2FA are intended capabilities.
- Generate three administrator dashboard concepts: production, operations, and balanced energy/business. User will select individual elements across concepts before final dashboard design. Mockup values are illustrative; finance respects permissions and unavailable data must be explicit.
- Inspect current code and schema together. Implement only current UI behavior; retain focused extension points for future options without speculative generalized subsystems.

## Verified implementation facts

- Shared operation table already provides a blank action heading and three-dot menu. Its query wrapper currently supports search/sort/date/pagination; proposed domain filters require API-side support.
- Dashboard period picker and operation-list date query parameters differ and require an adapter or shared range control.
- Gateway index already contains last-received data and a summarized configuration status; attached screenshot reflects an earlier layout.
- Account profile endpoint currently supports own display-name editing. Password change exists; avatar and 2FA storage/authentication flows require new work.
- Existing responsive convention uses tables on desktop and rich cards on mobile.

## Resolved interview frontier

1. Show rule empty-state card only when there are no configured rules, or also when every rule is disabled? Where is the persistent modal entry after rules exist?
2. Deliver working authenticator-app 2FA with recovery and login verification in this scope, or defer it explicitly?
3. Preserve mobile cards while standardizing desktop tables?
4. Dashboard component selection after reviewing generated concepts.

## Final user rulings

- Show rule card when no enabled rules; distinguish never configured from all disabled; permanent settings entry.
- Implement standard authenticator-app TOTP 2FA with recovery codes and login verification now.
- Persist the cropped avatar only; choose a new file for later re-cropping.
- Preserve mobile cards and desktop tables.
- Separate technical alert evaluation from financial automation gating.
- Execute all other approved work now; do not change Dashboard.

## Code and schema audit

Initial source/schema audit: `docs/ui-schema-audit-2026-10-09.md`. Final implementation, migration requirements and verified checks: `docs/ui-account-consistency-verification-2026-10-09.md`.
