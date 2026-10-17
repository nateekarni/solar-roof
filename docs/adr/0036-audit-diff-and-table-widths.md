# ADR 0036: Audit Log Visual Diff Viewer, Backend Ingestion, Table Column Width Bounds, and Notification Localization

## Status
Accepted

## Context
1. **Audit Log Details Lacked Visual Diff & Historical Context**:
   - The Audit Log Detail page (`/records/audit/[id]`) displayed raw action codes (`technical.employee.deactivated`) and entity types without contextual visualization of what changed between states.
   - The backend previously recorded audit events without populating `before_json` and `after_json` on employee permissions, position updates, account deactivations, user invitations, or domain settings.
2. **Table Columns Over-Stretching on Short Content**:
   - In TanStack `DataTable` across the application (e.g. gateway index, sites, and operational logs), columns with short predictable widths (such as `status` badges, `deviceCount`, `capacityMwp`, and `actions`) stretched proportionally across available screen space instead of fitting their content bounds.
3. **Hardcoded English Texts in Notifications & Feeds**:
   - Notification popover dropdowns and alerts contained hardcoded English strings such as `offline` and `แจ้งเตือน / Alert`, causing language leakage when users switched the application to Thai.

## Decision
1. **Backend Audit Ingestion with Sensitive Data Sanitization**:
   - Enhanced `apps/api/src/modules/identity/team.service.ts`, `invitation.service.ts`, `site-customer-users.service.ts`, and `settings.service.ts` to record both `before_json` and `after_json` during state transitions (updating grants, revoking permissions, saving positions, deactivating/reactivating accounts, inviting users, cancelling invites, and updating domain settings).
   - Implemented `sanitizeAuditJson()` to automatically scrub and redact sensitive fields (e.g., `password`, `token`, `secret`, `hash`, `refresh_hash`) before persisting audit rows into `audit_events`.
   - Updated `operations.service.ts` to expose `beforeJson` and `afterJson` in the audit query payload.
2. **Audit Log Detail Layout & Git-Style Visual Diff Viewer**:
   - Created `apps/web/features/shared/audit-diff-viewer.tsx`:
     - Displays key-value diffs comparing `before` and `after` states.
     - Modified values render previous values with `-` in soft red (`text-rose-700 bg-rose-50/50 dark:bg-rose-950/20`) and new values with `+` in soft green (`text-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20`).
     - Newly added keys render with `+` in soft green; deleted keys render with `-` in soft red.
     - Includes a "ดู JSON แบบเต็ม" (Raw JSON) toggle and a one-click "คัดลอก JSON" button with visual copy feedback.
   - Created `apps/web/features/shared/audit-record-details.tsx`:
     - 2-card layout:
       1. **General Information Card**: Highlighting human-readable Thai action badge, localized entity type, actor name and email, formatted Bangkok timestamp, and compact copyable entity ID.
       2. **Changes Card**: Houses the Git-style `AuditDiffViewer`.
   - Updated `apps/web/app/(app)/records/[resource]/[id]/page.tsx` and `record-details.tsx` to route `audit` records directly to `AuditRecordDetails`.
3. **Strict Column Width Sizing in `DataTable`**:
   - Updated `apps/web/components/ui/data-table.tsx` with `getColumnStyle(columnDef)` to respect `size`, `minSize`, and `maxSize` on `TableHead` and `TableCell`.
   - Configured explicit column widths in `gateway-index.tsx` (e.g., `status`: 95px, `deviceCount`: 80px, `currentProductionKw`: 110px, `lastReceivedAt`: 140px, `actions`: 48px) and in `operation-table.tsx` (`COLUMN_SIZES` mapping for `status`, `deviceCount`, `capacityMwp`, `actions`), allowing flexible content columns to expand naturally without warping short indicators.
4. **Notification and Alert Localization**:
   - Updated `apps/web/components/navigation/notification-bell.tsx` and `operation-table.tsx` to dynamically translate system alerts and device statuses:
     - `offline` -> `เกตเวย์ออฟไลน์` (TH) / `Gateway offline` (EN)
     - `แจ้งเตือน / Alert` -> `การแจ้งเตือนระบบ` (TH) / `System Alert` (EN)
   - Ensured zero English leakage in the notification feed and bell popover when Thai locale is active.

## Consequences
- Operations and compliance teams gain complete visibility into configuration changes with clear visual diffs and raw JSON inspection.
- Sensitive credentials, hashes, and tokens are protected from accidental exposure in audit logs.
- Table layouts across the application maintain balanced proportions with compact indicator columns and legible text columns.
- System notifications and alert headers adapt cleanly to the active user language.
- Full test suites pass with 557 web tests and 686 API tests passing, and `turbo build` builds all 8 packages successfully.
