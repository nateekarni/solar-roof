# ADR 0035: Dedicated Gateway Full Page, Live Device Telemetry, Flexible Decimals, and Audit Log Localization

## Status
Accepted

## Context
1. **Modal Popup Cramping & Missing Live Device Telemetry**:
   - Previously, clicking a gateway row in the Manage Gateways index (`/gateways`) opened a modal dialog (`GatewayDetailModal`).
   - The modal view constrained the layout, making it difficult to inspect connected devices, and it lacked live telemetry readings (e.g. active power, energy, voltage, current, frequency, and quality) for each connected device.
2. **Unformatted Trailing Zeros in General Display Numbers**:
   - In alert rules and metrics, threshold values pulled from PostgreSQL `numeric` columns rendered with trailing zeros (e.g., `temperature > 65.00000000`).
   - Users required general numbers to be displayed as clean integers when no fractional precision exists (e.g., `65`), while strictly formatting currencies and rates to 2 decimals, and preserving higher precision when explicitly specified by users (e.g., `65.1234` or `0.0025`).
3. **Developer-Centric Audit Logs & English Identifiers**:
   - In `/settings/audit` ("ประวัติการทำงาน"), actions and entity types were rendered as raw developer identifiers (e.g. `technical.employee.deactivated`, `employee_permission`).
   - Ordinary business users and staff found these technical action codes confusing and difficult to search using everyday Thai keywords (e.g. "ระงับ", "พนักงาน", "สิทธิ์").

## Decision
1. **Dedicated Full-Page Gateway View (`/gateways/[id]`)**:
   - Replaced modal popup invocation with navigation to a dedicated full-page view at `/gateways/[id]`.
   - Structured the page with:
     - Breadcrumb navigation (`จัดการเกตเวย์` > `[Gateway Name]`)
     - Status header with online/offline badge, external gateway ID, site name/code, and action buttons (Configure Gateway, Refresh)
     - 4-column Quick KPI Summary cards (Current Power, Devices, Cadence, Last Received)
     - MQTT connection and version information card
     - Connected devices panel featuring a **Live Measurements Table** per device, listing parameters (with friendly Thai display labels), latest values with units, Bangkok polling timestamps, and quality badges
     - Reconciliation pairs comparison panel
   - Standardized padding and gaps with 4px micro-spacing and consistent card padding matching the design system.
2. **`formatFlexibleDecimal` Utility**:
   - Created `apps/web/lib/number-format.ts` with `formatFlexibleDecimal(val, options)`.
   - Formats currency and rates strictly to 2 decimal places with thousands grouping (e.g., `฿1,250.00`, `4.50`).
   - For general numbers and threshold rules:
     - Converts whole numbers and strings with trailing zeros (`65.00000000`) into clean integers (`65`).
     - Retains full precision when users explicitly configure precision greater than 2 decimals (`65.1234`).
     - Added `temperature` and `irradiance` to `FIELD_LABELS` in `alert-rules-model.ts`, formatting conditions cleanly (e.g. `อุณหภูมิ > 65 °C`).
3. **Audit Log Localization & Intuitive Thai Search**:
   - Created `apps/web/features/shared/audit-wording.ts` with comprehensive mapping for actions, entity types, and actors into clear Thai phrases with semantic badges:
     - `technical.employee.deactivated` -> **"ระงับการใช้งานพนักงาน"** (destructive red badge)
     - `technical.employee.created` -> **"สร้างบัญชีพนักงาน"** (success emerald badge)
     - `user.login` -> **"เข้าสู่ระบบ"** (muted badge)
     - `employee_permission` -> **"สิทธิ์พนักงาน"**
     - `Platform Administrator` -> **"ผู้ดูแลระบบแพลตฟอร์ม"**
   - Cleaned up entity UUIDs to show truncated compact tags rather than long cluttered strings.
   - Enhanced `operationPredicate` in `operation-query.ts` to expand Thai search terms (e.g. "ระงับ", "พนักงาน", "สิทธิ์", "สร้าง") into their corresponding technical action substrings in SQL queries.

## Consequences
- Operations and technical teams have a spacious, comprehensive dashboard for every gateway with live per-device telemetry.
- Floating-point decimal spam (`.00000000`) is eliminated across alert rules and metrics.
- Audit logs are intuitive and easy to understand for ordinary users while preserving technical audit fidelity.
- All 551 web tests and 685 API tests pass without regression.
