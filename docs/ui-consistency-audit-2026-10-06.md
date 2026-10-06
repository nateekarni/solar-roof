# UI consistency audit

Scope: all TSX files in apps/web/features and apps/web/app, plus shared UI primitives.

## Standards

- Single-line controls and action buttons: 40px. Icon buttons: 40px square.
- Enabled input, select, date trigger and textarea: white; disabled: muted. Textareas retain multiline height.
- Label/control gap: 8px. Section separation: divider plus 16px top spacing.
- Flatten neutral modal groups. Preserve functional table scroll boundaries, upload targets, feedback states, expandable sections, and standalone page cards.

## Modified call sites

- `apps\web\features\billing\billing-cycle-dialog.tsx`: 3 class corrections
- `apps\web\features\billing\billing-detail-modal.tsx`: 19 class corrections
- `apps\web\features\billing\billing-detail-sheet.tsx`: 15 class corrections
- `apps\web\features\billing\payment-dialog.tsx`: 8 class corrections
- `apps\web\features\billing\payment-verification-dialog.tsx`: 8 class corrections
- `apps\web\features\contracts\contract-form-dialog.tsx`: 26 class corrections
- `apps\web\features\dashboard\customize-cards-modal.tsx`: 2 class corrections
- `apps\web\features\dashboard\period-picker.tsx`: 4 class corrections
- `apps\web\features\notifications\notification-settings-dialog.tsx`: 1 class corrections
- `apps\web\features\reports\generate-report-dialog.tsx`: 4 class corrections
- `apps\web\features\reports\history-request-dialog.tsx`: 4 class corrections
- `apps\web\features\schools\school-form-dialog.tsx`: 2 class corrections
- `apps\web\features\settings\school-settings-view.tsx`: 15 class corrections
- `apps\web\features\settings\system-settings-content.tsx`: 16 class corrections
- `apps\web\features\shared\document-preview-modal.tsx`: 1 class corrections
- `apps\web\features\shared\operation-card-list.tsx`: 1 class corrections
- `apps\web\features\shared\operation-query-table.tsx`: 5 class corrections
- `apps\web\features\shared\operation-table.tsx`: 2 class corrections
- `apps\web\features\shared\payload-fields-editor.tsx`: 2 class corrections
- `apps\web\features\sites\site-delete-dialog.tsx`: 1 class corrections
- `apps\web\features\sites\site-edit-dialog.tsx`: 9 class corrections
- `apps\web\features\sites\site-form-dialog.tsx`: 5 class corrections
- `apps\web\features\users\invite-user-dialog.tsx`: 5 class corrections
- `apps\web\features\shared\detail-modals\alert-detail-modal.tsx`: 2 class corrections
- `apps\web\features\shared\detail-modals\audit-detail-modal.tsx`: 4 class corrections
- `apps\web\features\shared\detail-modals\notification-detail-modal.tsx`: 6 class corrections
- `apps\web\features\shared\detail-modals\report-detail-modal.tsx`: 5 class corrections
- `apps\web\features\shared\detail-modals\school-detail-modal.tsx`: 5 class corrections
- `apps\web\features\shared\detail-modals\user-detail-modal.tsx`: 7 class corrections
- `apps\web\app\(app)\settings\page.tsx`: 3 class corrections
- `apps\web\app\(app)\settings\company\page.tsx`: 23 class corrections
- `apps\web\app\(app)\settings\meter-presets\page.tsx`: 14 class corrections
- `apps\web\app\(app)\settings\security\page.tsx`: 7 class corrections

## Modal container decisions

- `apps\web\features\billing\billing-detail-modal.tsx:335` — flattened; original `p-4 rounded-xl border border-border/70 bg-card/60 space-y-3`
- `apps\web\features\billing\billing-detail-modal.tsx:347` — retained functional container; original `p-2.5 rounded-lg bg-muted/30 border border-border/50 text-center`
- `apps\web\features\billing\billing-detail-modal.tsx:352` — retained functional container; original `p-2.5 rounded-lg bg-muted/30 border border-border/50 text-center`
- `apps\web\features\billing\billing-detail-modal.tsx:357` — retained functional container; original `p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-center`
- `apps\web\features\billing\billing-detail-modal.tsx:366` — flattened; original `p-4 rounded-xl border border-border/70 bg-card/60 space-y-2.5`
- `apps\web\features\billing\billing-detail-modal.tsx:389` — flattened; original `p-2.5 rounded-lg bg-muted/20 border border-border/40 space-y-0.5`
- `apps\web\features\billing\billing-detail-modal.tsx:393` — flattened; original `p-2.5 rounded-lg bg-muted/20 border border-border/40 space-y-0.5`
- `apps\web\features\billing\billing-detail-modal.tsx:404` — flattened; original `p-4 rounded-xl border border-border/70 bg-card/60 space-y-3`
- `apps\web\features\billing\billing-detail-modal.tsx:426` — retained functional container; original `relative group rounded-lg overflow-hidden border border-border/70 bg-background aspect-[4/5] flex items-center justify-center cursor-pointer`
- `apps\web\features\billing\billing-detail-modal.tsx:441` — flattened; original `p-2.5 rounded-lg bg-muted/30 border border-border/40 text-[11px] space-y-1`
- `apps\web\features\billing\billing-detail-modal.tsx:529` — retained functional container; original `p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2 text-emerald-950 dark:text-emerald-200 text-xs`
- `apps\web\features\billing\billing-detail-modal.tsx:543` — flattened; original `p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-950 dark:text-rose-200 text-xs space-y-1`
- `apps\web\features\billing\billing-detail-modal.tsx:585` — flattened; original `p-3 rounded-lg border border-rose-500/30 bg-rose-500/5 space-y-2`
- `apps\web\features\billing\payment-dialog.tsx:174` — flattened; original `p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-2`
- `apps\web\features\billing\payment-dialog.tsx:188` — retained functional container; original `flex flex-col items-center justify-center p-4 rounded-xl border border-dashed border-border/80 bg-card text-center space-y-2`
- `apps\web\features\billing\payment-dialog.tsx:210` — retained functional container; original `relative border-2 border-dashed border-border/80 hover:border-primary/60 rounded-xl p-3 text-center transition-colors cursor-pointer bg-muted/20`
- `apps\web\features\billing\payment-dialog.tsx:220` — retained functional container; original `size-12 rounded-lg bg-emerald-500/10 border border-emerald-500/30 overflow-hidden shrink-0 flex items-center justify-center`
- `apps\web\features\billing\payment-verification-dialog.tsx:151` — flattened; original `grid grid-cols-2 gap-2 p-3.5 rounded-xl bg-muted/40 border border-border/60 text-xs`
- `apps\web\features\billing\payment-verification-dialog.tsx:175` — retained functional container; original `border border-border/80 rounded-xl overflow-hidden bg-neutral-900/5 dark:bg-neutral-900/40 p-2 flex flex-col items-center justify-center min-h-[220px]`
- `apps\web\features\billing\payment-verification-dialog.tsx:203` — retained functional container; original `p-3 rounded-xl border border-destructive/30 bg-destructive/5 space-y-2`
- `apps\web\features\contracts\contract-form-dialog.tsx:218` — flattened; original `rounded-xl border border-border/70 bg-card p-3.5 space-y-3`
- `apps\web\features\contracts\contract-form-dialog.tsx:288` — flattened; original `rounded-xl border border-border/70 bg-card p-3.5 space-y-3`
- `apps\web\features\contracts\contract-form-dialog.tsx:371` — flattened; original `rounded-xl border border-border/70 bg-card p-3.5 space-y-3`
- `apps\web\features\contracts\contract-form-dialog.tsx:389` — retained functional container; original `overflow-x-auto rounded-lg border border-border`
- `apps\web\features\dashboard\customize-cards-modal.tsx:94` — flattened; original `space-y-1.5 rounded-lg border border-border/70 p-2.5 bg-muted/20`
- `apps\web\features\notifications\notification-settings-dialog.tsx:78` — retained functional container; original `flex items-center justify-between rounded-lg border border-border p-3`
- `apps\web\features\notifications\notification-settings-dialog.tsx:109` — retained functional container; original `flex items-center justify-between rounded-lg border border-border p-3`
- `apps\web\features\sites\site-delete-dialog.tsx:88` — retained functional container; original `rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2 text-amber-800 dark:text-amber-300`
- `apps\web\features\sites\site-delete-dialog.tsx:101` — flattened; original `rounded-xl border border-border bg-muted/20 p-3 text-muted-foreground text-xs leading-relaxed space-y-1.5`
- `apps\web\features\sites\site-edit-dialog.tsx:420` — flattened; original `space-y-2 rounded-lg border p-3`
- `apps\web\features\sites\site-edit-dialog.tsx:439` — retained functional container; original `rounded-xl border border-border p-3 bg-muted/30 flex flex-col gap-2`
- `apps\web\features\sites\site-edit-dialog.tsx:467` — retained functional container; original `flex items-center gap-2 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 text-sm`
- `apps\web\features\sites\site-edit-dialog.tsx:479` — retained functional container; original `flex flex-col gap-1 text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-2 text-sm`
- `apps\web\features\sites\site-form-dialog.tsx:581` — retained functional container; original `max-h-36 overflow-y-auto rounded-lg border border-border bg-card`
- `apps\web\features\sites\site-form-dialog.tsx:613` — retained functional container; original `max-h-64 overflow-auto rounded-lg border`
- `apps\web\features\sites\site-form-dialog.tsx:624` — flattened; original `rounded-xl border border-border bg-card p-3.5 space-y-2.5 text-sm`
- `apps\web\features\sites\site-form-dialog.tsx:668` — retained functional container; original `rounded-xl border border-border p-3.5 bg-muted/30 flex flex-col gap-2.5`
- `apps\web\features\sites\site-form-dialog.tsx:696` — retained functional container; original `flex flex-col gap-1 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 text-sm`
- `apps\web\features\sites\site-form-dialog.tsx:717` — retained functional container; original `flex flex-col gap-1.5 text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-2.5 text-sm`
- `apps\web\features\sites\site-telemetry-dialog.tsx:79` — retained functional container; original `rounded-lg border p-3`
- `apps\web\features\users\invite-user-dialog.tsx:163` — flattened; original `rounded-xl border border-border bg-muted/30 p-4 space-y-2.5`
- `apps\web\features\shared\detail-modals\alert-detail-modal.tsx:130` — flattened; original `grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-muted/40 border border-border/60`
- `apps\web\features\shared\detail-modals\alert-detail-modal.tsx:164` — flattened; original `space-y-2 p-3.5 rounded-xl border border-border/60 bg-card`
- `apps\web\features\shared\detail-modals\alert-detail-modal.tsx:174` — retained functional container; original `p-3.5 rounded-xl bg-blue-500/5 dark:bg-blue-950/20 border border-blue-500/20 space-y-1.5`
- `apps\web\features\shared\detail-modals\audit-detail-modal.tsx:91` — flattened; original `grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-muted/40 border border-border/60`
- `apps\web\features\shared\detail-modals\audit-detail-modal.tsx:143` — flattened; original `space-y-2 p-3.5 rounded-xl border border-border/60 bg-card`
- `apps\web\features\shared\detail-modals\audit-detail-modal.tsx:233` — retained functional container; original `p-3.5 rounded-xl border border-dashed border-border/80 bg-muted/20 text-center text-muted-foreground text-xs`
- `apps\web\features\shared\detail-modals\notification-detail-modal.tsx:104` — flattened; original `p-4 rounded-xl border border-border/70 bg-card/60 space-y-2`
- `apps\web\features\shared\detail-modals\notification-detail-modal.tsx:120` — retained functional container; original `p-3 rounded-lg bg-muted/30 border border-border/40 text-foreground text-xs leading-relaxed whitespace-pre-line select-text`
- `apps\web\features\shared\detail-modals\notification-detail-modal.tsx:127` — flattened; original `p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1`
- `apps\web\features\shared\detail-modals\notification-detail-modal.tsx:138` — flattened; original `p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1`
- `apps\web\features\shared\detail-modals\notification-detail-modal.tsx:148` — flattened; original `p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1`
- `apps\web\features\shared\detail-modals\notification-detail-modal.tsx:158` — flattened; original `p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1`
- `apps\web\features\shared\detail-modals\report-detail-modal.tsx:118` — flattened; original `p-3.5 rounded-xl border border-border/70 bg-card/60 space-y-1.5`
- `apps\web\features\shared\detail-modals\report-detail-modal.tsx:133` — flattened; original `p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1`
- `apps\web\features\shared\detail-modals\report-detail-modal.tsx:143` — flattened; original `p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1`
- `apps\web\features\shared\detail-modals\report-detail-modal.tsx:153` — flattened; original `p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1`
- `apps\web\features\shared\detail-modals\report-detail-modal.tsx:163` — flattened; original `p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1`
- `apps\web\features\shared\detail-modals\school-detail-modal.tsx:107` — flattened; original `p-3 rounded-xl border border-border/60 bg-muted/20 text-center space-y-1`
- `apps\web\features\shared\detail-modals\school-detail-modal.tsx:118` — flattened; original `p-3 rounded-xl border border-border/60 bg-muted/20 text-center space-y-1`
- `apps\web\features\shared\detail-modals\school-detail-modal.tsx:129` — flattened; original `p-3 rounded-xl border border-border/60 bg-muted/20 text-center space-y-1`
- `apps\web\features\shared\detail-modals\school-detail-modal.tsx:146` — flattened; original `rounded-xl border border-border/60 bg-card p-3 space-y-2.5 text-xs`
- `apps\web\features\shared\detail-modals\school-detail-modal.tsx:164` — retained functional container; original `p-2.5 rounded-lg bg-muted/40 border border-border/40 flex items-center justify-between text-xs`
- `apps\web\features\shared\detail-modals\user-detail-modal.tsx:141` — flattened; original `p-3.5 rounded-xl border border-border/70 bg-card/60 space-y-2`
- `apps\web\features\shared\detail-modals\user-detail-modal.tsx:158` — flattened; original `p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1`
- `apps\web\features\shared\detail-modals\user-detail-modal.tsx:179` — flattened; original `p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1`
- `apps\web\features\shared\detail-modals\user-detail-modal.tsx:189` — flattened; original `p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1`
- `apps\web\features\shared\detail-modals\user-detail-modal.tsx:199` — flattened; original `p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1`
- `apps\web\features\shared\detail-modals\user-detail-modal.tsx:212` — retained functional container; original `p-2.5 rounded-lg bg-muted/40 border border-border/40 flex items-center justify-between text-xs`

## Additional sweep

- `apps\web\components\navigation\app-header.tsx` — field gaps, nested sheet sections or control overrides normalized.
- `apps\web\components\ui\data-table.tsx` — field gaps, nested sheet sections or control overrides normalized.
- `apps\web\features\billing\billing-detail-sheet.tsx` — field gaps, nested sheet sections or control overrides normalized.
- `apps\web\features\dashboard\customize-cards-button.tsx` — field gaps, nested sheet sections or control overrides normalized.
- `apps\web\features\settings\system-settings-content.tsx` — field gaps, nested sheet sections or control overrides normalized.

Calendar day and navigation controls use 40px; month grid widened to 280px to prevent overlap. Command search height corrected from important 32px override.

## Verification

- Web TypeScript passed.
- PPA modal browser: ten field labels measured 8px gaps; enabled inputs and date triggers measured 40px and rgb(255,255,255).
- Browser exposed legacy global calendar CSS overriding sizes with !important; corrected its calendar dimensions from 32/36px to 40px.
- No contract/site data submitted during visual checks.
