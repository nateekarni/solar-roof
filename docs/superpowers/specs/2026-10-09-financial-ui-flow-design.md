# Financial UI flow and modal consistency

Status: Implemented on 2026-10-09 following the user's acceptance of Q1–Q7 and instruction to begin. Verification and environment limits: `docs/financial-ui-flow-verification-2026-10-09.md`.

## Confirmed decisions

- Electricity rates: site/current-rate table is the main view. Manage rate templates in a separate modal. Application flow: select sites, choose rate and effective date, preview impact, confirm.
- Billing and receipt details prioritize readable record data. Order: pending evidence review and actions, customer/site/amount/status information, supporting documents, history. Open PDF on document selection.
- Remove the payment-slip column from the billing table.
- Put previous/next controls at the top right of detail pages. Preserve originating filters and sort order, including navigation across table pages. After review, remain on the current record to show the result until the user chooses next.
- Standardize all modals, including customer, account, and authentication surfaces. Share heading, description, field spacing, error presentation, and action placement conventions. Size confirmation, form, and document dialogs according to their task.
- On unsuccessful submission, automatically scroll to the relevant error. Audit error messages for understandable language that explains the problem and recovery action.

## Confirmed review, status, and error behavior

- Review pending evidence inline at the top of record detail; retain one-transfer-at-a-time review when several transfers exist.
- Keep document status separate from payment status. Align receipt badges and filters with actual supported document states, including superseded documents.
- Receipt labels/colors: issued = ออกแล้ว / green; superseded = ถูกแทนที่ด้วยฉบับใหม่ / gray; cancelled = ยกเลิก / red. Where supported by actual receipt data, draft = ร่าง / gray and finalized = ยืนยันแล้ว / green. Use equivalent English labels in English mode. Display text as well as color. Do not introduce backend lifecycle states merely to populate the UI.
- Default rate application to explicitly selected sites; preserve broader application only with visible scope and impact confirmation.
- Preserve existing financial effects of bill-specific rate correction, exposing reissue/send consequences clearly before confirmation.
- For field errors, reveal any collapsed section, scroll within the appropriate page/dialog container and focus the first invalid field. For general/server errors, focus a visible error summary; retain entered data. Respect reduced-motion settings.

## Implementation acceptance criteria

- Rate templates are readable in their management modal, with a separate create action. The existing catalog API supports list/create, so template mutation beyond creation is not introduced. Site rate application retains selected, matching-rate, and all-site scopes; selected sites are the default. Preview identifies affected sites, effective date, existing issued documents, and any scheduled-rate replacement before confirmation.
- Record details retain existing authorization and financial-readiness checks. Inline review shows the selected evidence, required verification fields, bill amount, approved total, and outstanding balance. Rejection requires a reason. Reviewed evidence remains accessible in history.
- Documents open on explicit selection and retain download/print access. Receipt and billing details show their related documents and payment information without putting a large PDF before the record data.
- Previous/next uses the originating result order and filters across pagination. Reviewing a record does not remove its visible success result or skip the next pending record. Boundaries disable the unavailable direction. Direct links without list context use an explicit default list order, and return-to-list restores available originating context.
- Receipt status labels, badge colors, and filter options agree across staff/customer lists and details. Unknown legacy values use a neutral, understandable fallback rather than a misleading success state.
- Audit all dialog/modal call sites, including site creation, customer views, own account, and authentication. Record coverage so consistency is demonstrated beyond the screenshots. Preserve desktop tables and usable mobile layouts.
- A failed submit reveals the error within the correct scroll container, focuses its field or summary, associates field messages accessibly, and preserves entered values. Cover client validation, server field errors, general API errors, and network failures. Messages explain what happened and an available recovery step in the selected language without exposing internal exception text.
- Verify desktop/mobile layouts, keyboard focus, long forms, multiple errors, and successful retry. Verify navigation after approval under the pending-review filter and across list-page boundaries.

## Evidence inspected

- `apps/web/features/settings/rate-settings-workspace.tsx`: existing application preview and future-rate replacement handling.
- `apps/web/features/billing/bill-rate-editor.tsx`: bill correction changes site rates and reissues/sends the bill.
- `apps/web/features/shared/operation-table.tsx`: active detail entry routes to a record page.
- `apps/web/features/billing/payment-verification-dialog.tsx`: existing transfer review fields and actions.
- `packages/api-contracts/src/operation-filters.ts`: receipt filter vocabulary differs from the superseded state visible in the supplied screenshot.

UI layout decisions are recorded here rather than added to the domain glossary. No new domain term or architectural trade-off has been resolved that warrants an ADR yet.
