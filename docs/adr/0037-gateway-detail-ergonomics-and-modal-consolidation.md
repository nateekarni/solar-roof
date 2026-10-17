# ADR 0037: Gateway Detail Page Ergonomics, Modal 3-Tab Consolidation, and Disclosure Toggle Elimination

## Status
Accepted

## Context
1. **Gateway Detail Page Navigation & Visual Hierarchy**:
   - The Gateway Detail Page (`/gateways/[id]`) used a breadcrumb-style header (`< จัดการเกตเวย์ > [Name]`) which diverged from standard page views across the system that use a prominent button-style back link.
   - MQTT Subscribe and Publish topics were styled inside `<div className="bg-muted/40 p-2 rounded border">`, creating the visual appearance of disabled form input boxes rather than clean display labels.
   - Device cards displayed "รอบอ่านคาดหวัง" (expected cadence) in their header alongside device model and publish topic, creating visual noise and an unbalanced 3-column header layout.
2. **Gateway Edit Dialog Structure & Disclosure Arrows**:
   - In `GatewayEditDialog`, the "แหล่งพลังงานผลิต" and "แหล่งกำลังผลิต" fields placed their labels inline horizontally with select dropdowns, causing the Thai word "ผลิต" to awkwardly wrap onto a second line.
   - The dialog featured multiple HTML `<details><summary>` disclosure toggles displaying raw JSON dumps and developer-oriented configuration schemas (`ตัวอย่าง JSON`, `ขั้นสูง · ข้อมูลโปรไฟล์`, `การรับข้อมูลขั้นสูง`), which were not used in day-to-day operations and added visual clutter.
   - Per-device telemetry cadences ("รอบรับข้อมูลรายอุปกรณ์") and cross-cadence comparisons were isolated in a separate 4th tab (`reconciliation`), separating them from their associated device configurations and breaking parity with the 3-tab creation modal (`GatewayFormDialog`).
3. **Audit Record Details Nested Card Redundancy**:
   - The Audit Record Detail page (`/records/audit/[id]`) wrapped definition lists inside an additional `<div className="rounded-xl border ...">` nested within `<CardContent>`, creating redundant borders and padding mismatch compared to standard detail cards.

## Decision
1. **Gateway Detail Page Formal Unification (`/gateways/[id]`)**:
   - Replaced breadcrumb navigation with the standard button-styled back link (`กลับไปหน้าจัดการเกตเวย์`).
   - Added a formal page header with title and descriptive subtitle (`ดูข้อมูลสถานะการเชื่อมต่อ อุปกรณ์ที่ผูกอยู่ และข้อมูลโทรมาตรสดของเกตเวย์`) on the left and action buttons (`รีเฟรชข้อมูล`, `ตั้งค่าเกตเวย์`) on the right, matching `/records/sites/[id]` and `/records/audit/[id]`.
   - Removed the 4 standalone mini KPI boxes and consolidated gateway status, metrics, and MQTT connection details into a single top Overview `<Card>`:
     - Header (`px-6 py-3.5 [.border-b]:pb-3.5 border-b border-border/60`): Displays the online/offline status badge alongside the last received timestamp on the left, and a compact copyable Gateway ID on the right.
     - Body (`px-6 py-6`): Renders a 3-column definition list (`<dl className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">`) with Site Name, Site Code, Current Power, Connected Devices Count, Default Cadence, Configuration Version, Subscription Topic, and ACK Topic.
   - Standardized each connected device card to use the same clean `<Card>` styling (white surface with `ring-1 ring-foreground/10 shadow-xs`, no floating section `<h2>` with orange icon, no `bg-muted/20` header tint, 2-line `<CardHeader>` with Device Name + Billing Meter badge + External Device ID on row 1, and Device Model + Publish Topic on row 2, followed by the live telemetry table or frameless empty state inside `<CardContent>`).
2. **Gateway Add & Edit Modal Unification, Separated Button Tabs, and Footer Consolidation**:
   - Unified `GatewayFormDialog` (Add Gateway) with `GatewayEditDialog` (Configure Gateway): `GatewayFormDialog` now uses the same tabbed structure (`เกตเวย์และการเชื่อมต่อ` and `อุปกรณ์และการรับข้อมูล`) and card layout as `GatewayEditDialog`.
   - Replaced segmented pill `TabsList` containers with **Separated Button Tabs** (`!bg-transparent p-0 gap-2 border-0 shadow-none`, each `TabsTrigger` styled as a standalone bordered card button that turns `bg-primary text-neutral-950 font-bold` when active, matching the Staff/Position tabs in `StaffPermissionsWorkspace`).
   - Consolidated all form save actions into a single primary **`บันทึกการตั้งค่า`** / **`บันทึกและสร้างเกตเวย์`** button at the bottom-right of `DialogFooter`, and moved the **`ปิด`** / **`ยกเลิก`** button to the bottom-left (`justify-between`), removing inline per-section and per-device save buttons.
   - Moved **`+ เพิ่มอุปกรณ์`** inside Tab 2 (`อุปกรณ์และการรับข้อมูล`) and converted **`เปลี่ยนเกตเวย์ของไซต์`** in Tab 3 (`ประวัติและการสลับเปลี่ยน`) from an inline form into a nested modal dialog, ensuring no inline sub-form confirmation buttons exist inside tabs (except the operational MQTT `เผยแพร่การตั้งค่า` button in `ConfigurationPublishSection`).
   - Removed the redundant **"แหล่งข้อมูลการผลิตไฟฟ้า"** (`GatewayDashboardSources`), **"แหล่งข้อมูลสำหรับคำนวณบิล"** (`SiteBillingSource`), **"รอบรับข้อมูล (จากเกตเวย์)"** (`CadenceFormSection`), and **"คู่ตรวจเทียบการวัด"** (`GatewayComparisons`) cards.
   - Upgraded the `ตาราง` / `JSON` toggle in `DeviceProfileEditor` (and `PayloadFieldsEditor`) to sync immediately without an "Apply JSON" button: switching back to `ตาราง` validates and applies the JSON immediately, or blocks switching with a shake animation (`animate-shake`) and a concise compiler/IDE-style diagnostic message indicating the exact syntax or field schema error.
3. **Modal Scroll Container Separation & System-Wide Field-Level Validation on Submit**:
   - Fixed `DialogContent` in `components/ui/dialog.tsx` so the outer dialog shell never scrolls alongside an inner scroll container (`overflow-hidden sm:overflow-hidden max-sm:overflow-hidden flex flex-col`), cleanly separating the fixed header, scrollable body (`min-h-0 flex-1 overflow-y-auto`), and pinned bottom footer (`DialogFooter`).
   - Across all modals in the system, enabled submit/next buttons (only disabling while `busy`) and implemented field-level validation that automatically switches to the first tab containing an invalid field, scrolls and focuses the control, marks the control with `aria-invalid="true"` (red border and ring), and renders an inline field error message directly beneath the invalid input or select.
4. **Audit Record Details Content-Driven Header Height & Frameless Empty State**:
   - Overrode `<CardHeader>`'s default `[.border-b]:pb-6` rule using `px-6 py-3.5 [.border-b]:pb-3.5 border-b border-border/60` (or `py-4 [.border-b]:pb-4`) so that each card header scales strictly to its content height—making the 1-line Overview card header visibly more compact than the 2-line Changes card header (which includes a `<CardDescription>`).
   - Removed the dashed border and inner background box (`border border-dashed border-border/80 bg-muted/15`) from the empty state in `audit-diff-viewer.tsx`, rendering the empty state directly inside the card body without nested frames.

## Consequences
- Detail pages across the system (`/records/audit/[id]`, `/records/sites/[id]`, `/gateways/[id]`) share a unified, formal card architecture, typography, and 3-column `<dl>` metadata grid.
- Add Gateway and Configure Gateway modals share the same separated-button tab navigation, device card editors, nested modal workflows, and bottom-left Close / bottom-right Save footer layout.
- Modal footers remain strictly pinned to the bottom edge without infinite scroll or blank space below the footer, and submitting any incomplete modal form immediately highlights and scrolls to the offending field.
