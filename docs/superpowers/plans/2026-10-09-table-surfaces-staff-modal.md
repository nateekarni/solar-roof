# Table surfaces and employee modal

User-approved scope: inspect every table, use white surfaces in light mode, move unlabeled three-dot actions to the far right, and redesign the employee editor. Preserve semantic dark surfaces, selection/hover feedback, and existing authorization/save behavior.

- [x] Shared table and DataTable surfaces and action alignment.
- [x] Audit native tables and feature-specific overrides/action cells.
- [x] Employee editor: compact identity, clear profile/permission sections, accessible scrolling and a separate action footer.
- [x] Type checking, existing focused tests and desktop/mobile browser verification.
- [x] Final code review: no actionable findings in the scoped presentation changes.

Ruling: retain `bg-card` rather than hard-coded white so light mode is white and dark mode remains legible. This is a presentation change; no schema or permission changes are needed.

## Verification

- `pnpm --filter @solar/web lint`: passed.
- `pnpm --filter @solar/web test`: 303 passed, zero failures.
- Edge/Playwright: 11 checks passed with zero page errors, across admin/owner and 9 route visits (gateways, alerts, audit, users in each domain, sites, billing, receipts, rates).
- Computed table backgrounds checked white and action buttons checked in final cells within 20px of the cell's right edge.
- Employee profile and permission tabs captured at 1440×1000 and 390×844; mobile dialog bounds checked within viewport. Dark table checked non-white.
- Static audit includes native dashboard/insight tables, invoice creation, company configuration, contract/site editors, device profiles and payload fields. Calendar tables retain their day-selection styling.
- QA accounts were temporary and removed from the isolated local review database in cleanup.
