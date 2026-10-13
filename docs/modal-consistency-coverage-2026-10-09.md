# Modal consistency coverage — 2026-10-09

This is an implementation inventory, not a claim that every modal received a screenshot review.

## Shared behavior

- DialogContent supplies a consistent heading/body gap, label/control separation for legacy groups, mobile bottom-sheet scrolling, and desktop maximum height. Task-specific width overrides remain in place for document/table dialogs.
- DialogFooter provides the shared action placement. Own password, authenticator, avatar, and site creation now use it. AlertDialog confirmations retain their compact layout and now have a viewport-safe width/height.
- DialogContent observes newly rendered inline errors (role=alert, FieldError, legacy destructive paragraphs), associates adjacent fields, focuses the first error and scrolls the nearest scroll container. Native invalid events select only the first failing field.
- notify.error provides an in-dialog persistent summary when the active element belongs to that dialog; the toast remains for compatibility. Input/submit clears the persistent summary. This is scoped to the active modal, so unrelated background toast errors are not copied into closed dialogs.
- focusInvalidFields handles React Hook Form errors in DOM order, opens native details, supports an explicit reveal callback, and retains input values. The site wizard explicitly returns to its settings tab before focusing errors.
- FormErrorSummary covers inline financial review and own-profile/authentication page forms as well as account dialogs. Its message is focusable and announced. Repeated native submit is handled by the dialog observer.
- API error mapping suppresses server internals in both languages, gives known authentication recovery steps, and provides friendly connection failure text. Password reset's direct fetch has the same network mapping.

## Inventory

All paths below inherit the shared primitives unless noted. Financial detail/rate callsites are implemented by their respective work streams.

| Callsite | Coverage |
|---|---|
| `apps/web/app/(app)/settings/account/page.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/app/(app)/settings/company/page.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/components/feedback/app-dialog.tsx` | Shared wrapper |
| `apps/web/components/feedback/confirm-action.tsx` | Shared wrapper |
| `apps/web/components/ui/alert-dialog.tsx` | Shared primitive |
| `apps/web/components/ui/command.tsx` | Shared primitive |
| `apps/web/components/ui/dialog.tsx` | Shared primitive |
| `apps/web/features/alerts/acknowledge-dialog.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/alerts/alert-rules-editor.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/billing/bill-rate-editor.tsx` | Financial work stream + shared primitive |
| `apps/web/features/billing/billing-cycle-dialog.tsx` | Shared primitive + RHF invalid focus |
| `apps/web/features/billing/billing-detail-modal.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/billing/billing-detail-sheet.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/billing/manual-bill-dialog.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/billing/payment-dialog.tsx` | Shared primitive + RHF invalid focus |
| `apps/web/features/billing/payment-verification-dialog.tsx` | Financial work stream + shared primitive |
| `apps/web/features/contracts/contract-form-dialog.tsx` | Shared primitive + RHF invalid focus |
| `apps/web/features/customers/customer-form-dialog.tsx` | Shared primitive + RHF invalid focus |
| `apps/web/features/dashboard/compare-modal.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/dashboard/customize-cards-modal.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/notifications/notification-settings-dialog.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/organization/organization-edit-dialog.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/reports/generate-report-dialog.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/reports/history-request-dialog.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/settings/own-authenticator.tsx` | Shared primitive + explicit summary/action footer |
| `apps/web/features/settings/own-avatar.tsx` | Shared primitive + explicit summary/action footer |
| `apps/web/features/settings/own-password.tsx` | Shared primitive + explicit summary/action footer |
| `apps/web/features/settings/rate-settings-workspace.tsx` | Financial work stream + shared primitive |
| `apps/web/features/settings/staff-permissions-workspace.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/shared/detail-modals/alert-detail-modal.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/shared/detail-modals/audit-detail-modal.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/shared/detail-modals/customer-detail-modal.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/shared/detail-modals/notification-detail-modal.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/shared/detail-modals/report-detail-modal.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/shared/detail-modals/user-detail-modal.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/shared/handover-preview-modal.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/shared/operation-page-actions.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/shared/operation-table.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/shared/original-document-preview.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/shared/payload-profile-settings.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/shared/record-documents.tsx` | Financial work stream + shared primitive |
| `apps/web/features/shared/saved-original-document-preview.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/sites/broker-select.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/sites/device-field-register-editor.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/sites/device-profile-editor.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/sites/payload-connection-card.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/sites/preset-editor.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/sites/preset-picker.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/sites/site-configuration-details.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/sites/site-customer-users.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/sites/site-delete-dialog.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/sites/site-edit-dialog.tsx` | Shared primitive + RHF invalid focus |
| `apps/web/features/sites/site-form-dialog.tsx` | Shared primitive + wizard reveal + RHF invalid focus |
| `apps/web/features/sites/site-service-dialog.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/sites/site-telemetry-dialog.tsx` | Shared dialog spacing, scrolling and error observation |
| `apps/web/features/users/invite-user-dialog.tsx` | Shared primitive + RHF invalid focus |

## Authentication and account page coverage

- app/(auth)/login/page.tsx: failed login now uses the focusable summary.
- features/auth/activate-account.tsx: password/submission errors use the summary; invalid-link notice remains a static alert.
- features/auth/password-recovery.tsx: recovery/reset errors use the summary; direct network failures receive localized recovery guidance.
- features/settings/own-profile-form.tsx: save failures use the summary without discarding the edited name.
- Native required/minimum/email validation remains browser-managed on page forms. Dialog forms additionally use the shared first-invalid listener.

## Verification and limits

- Isolated browser regression: real Edge, reduced motion, collapsed details, multiple invalid fields in reversed error-map order, retained input, correct dialog scroll, persistent general server error, and repeated failed submit.
- API mapping tests: internal English/Thai server details suppressed; known account recovery messages; network failure recovery text.
- Elevated TypeScript check passes. Normal sandbox execution cannot resolve some native package realpaths correctly and cannot launch Edge; the same commands succeed outside the sandbox.
- The generic observer can reveal native details; custom unmounted tabs require the explicit reveal callback (wired for the site creation wizard). It does not invent server field names when an endpoint only supplies a general error message.
- Full application desktop/mobile screenshot and keyboard-flow verification is tracked by the parent financial-flow work stream; the isolated tests are not a substitute for those checks.
