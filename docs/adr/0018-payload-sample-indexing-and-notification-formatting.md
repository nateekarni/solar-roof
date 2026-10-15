# ADR 0018: Payload Sample Indexing and Notification Formatting

Status: Accepted, 2026-10-15.
*(Note: Query plan optimization and timeout ceiling were subsequently updated in [ADR 0019](0019-query-optimization-and-resilient-dashboard-telemetry.md) which supersedes the 1,500 ms SLA with an optimized query plan and 2,500 ms default statement timeout).*

## Context
1. **Dashboard Query Timeout**:
   As historical telemetry grew past 2.35 million rows in `payload_samples`, 30-day bounded dashboard generation energy queries exceeded the PostgreSQL 1,500 ms `statement_timeout`. The existing indexes lacked `polled_at` as a range index key for device samples, causing full-table scans that triggered `Minified React error #441` (HTTP 500) on the Dashboard home page (`/`).

2. **Raw Notification Copy & Incomplete Context**:
   Workflow and lifecycle notifications previously presented unformatted database values or technical strings:
   - Payment approvals displayed raw database status `"paid"` as the detail text without context.
   - Payment rejections mixed English and Thai strings (e.g., `"ปฏิเสธหลักฐาน / Evidence rejected: ..."`).
   - Document issuance items displayed only raw codes (e.g., `"RCP261000002"`, `"INV261000030"`) without site context.
   - Timestamps were placed on a separate third line under the detail text, causing unnecessary vertical sprawl.

## Decision
1. **Covering Index for Generation Energy (`060_payload_samples_generation_energy_idx.sql`)**:
   - Add composite index `idx_payload_samples_generation_energy ON payload_samples(site_id, device_id, profile_revision_id, tag, polled_at, received_at, id)`.
   - Reduces 30-day generation energy scan times from ~2,420 ms to ~500 ms (~80% speedup), comfortably remaining within the 1,500 ms SLA budget.
   - Register the migration in `apps/api/src/scripts/db-migrate.ts`.

2. **Backend Notification Context Enrichment**:
   - Expand `notificationVisibleSql` in `NotificationFeedService` to join `sites s` across feed events, alerts, and platform workflows to return `siteName` in the feed payload.

3. **Presentation Layer Normalization & Layout**:
   - In `NotificationFeedRow` (`notification-bell.tsx`), implement a robust formatter for both historical and future records:
     - Payment Approvals: Title `"ยืนยันการชำระเงินแล้ว"` | Detail `"บันทึกการชำระเงินเรียบร้อยแล้ว"` + bold site name.
     - Payment Rejections: Title `"ปฏิเสธหลักฐานการชำระเงิน"` | Detail clean reason + bold site name.
     - Document Issuance: Title `"ออกใบวางบิลแล้ว"` / `"ออกใบเสร็จรับเงินแล้ว"` | Detail `[Document Number]` + bold site name.
     - Reminders: Title `"แจ้งเตือนครบกำหนดชำระเงิน"` | Detail localized due date + bold site name.
     - Site name is rendered prominently with `<strong className="font-semibold text-foreground">`.
   - Layout:
     - Line 1 (Header): Title on the left, right-aligned timestamp + unread indicator dot.
     - Line 2 (Detail): Detail description with bold site name.
