# ADR 0023: Alert Rules Management Workspace and PATCH API

Status: Accepted, 2026-10-16.

## Context
Previously, the system's operational alert rules were configured via a small dialog (`AlertRulesEditor`), which crammed the rule creation form and existing rules into a single modal. Users could not view an overview of which alert rules applied to which sites, could not edit existing rules (they had to delete and recreate them), and had no direct way to inspect or toggle rules across the entire fleet of sites. Furthermore, `/alerts` only displayed the incident log table (`OperationPage resource="alerts"`) without top-level navigation to manage rules.

## Decision
1. **Segmented Tab Navigation on `/alerts`**:
   - The `/alerts` interface is structured with segmented tabs directly below the filter bar:
     - **รายการแจ้งเตือน (Alert Incidents)**: Displays real-time incident records and provides the `นำออกข้อมูล` (Export CSV) action.
     - **รายการกฎการแจ้งเตือน (Alert Rules)**: Displays a dedicated table of configured alert rules across all managed sites, with the header action switching to `+ เพิ่มกฎแจ้งเตือน` (Add alert rule).

2. **Alert Rules Overview Table (7 Columns)**:
   - **ไซต์งาน (Site)**: Displays site name and site code (e.g. `Bangkok Factory 1 · BK-01`).
   - **เงื่อนไข (Condition / Trigger)**: Clearly indicates rule type with badges (e.g. `เกตเวย์ออฟไลน์`, `ข้อมูลไม่ขยับ`, `กำลังไฟ > 50 kW`).
   - **การตรวจจับและระยะพัก (Duration & Cooldown)**: Shows sustained duration and cooldown periods (e.g. `120s / 300s`).
   - **ช่องทาง (Channels)**: Badges for `ในระบบ` (In-App) and `อีเมล` (Email).
   - **ผู้รับ (Recipients)**: Recipient count and preview of verified users.
   - **สถานะ (Status)**: Interactive switch toggle to enable or disable the rule with a single click.
   - **จัดการ (Actions)**: Dropdown action menu with `แก้ไขกฎ (Edit rule)` and `ลบกฎ (Delete rule)`.

3. **Multi-Site Filter & Overview**:
   - Above the rules table, filter dropdowns allow filtering by Site (`ทุกไซต์งาน` or specific site), Condition kind, and Status (`ทั้งหมด`, `เปิดใช้งาน`, `ปิดใช้งาน`).
   - Quick summary stats indicate total rules, active count, and number of covered sites.

4. **RESTful `PATCH /v1/alert-rules/:id` Endpoint**:
   - Added `PATCH /v1/alert-rules/:id` in `OperationalAutomationController` and `OperationalAutomationService` to update rule configuration (condition, thresholds, duration, cooldown, recovery, recipients, channels, and enabled status) while retaining rule identity and audit history.
   - When editing an existing rule in the modal, the `siteId` field is locked (read-only) because recipient eligibility is strictly bound to site access permissions.
