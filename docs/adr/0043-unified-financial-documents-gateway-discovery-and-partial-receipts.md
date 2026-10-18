# Unified Financial Documents, Gateway Discovery, and Partial Payment Receipts

## Context
User feedback required several architectural evolutions across device ingestion and billing lifecycle:
1. Industrial IoT gateways sending telemetry before site configuration need automatic detection and registration into a dedicated workspace tab, with instantaneous profile mapping pushed back via MQTT.
2. Financial workflows had fragmented billing statements and receipts across separate routes and mental models; these must be unified into a single lifecycle record containing the billing statement, payment slip evidence, and receipt(s).
3. Receipts needed streamlined payment metadata (channel, datetime, amount, evidence reference only), payment-date synchronization, and an outstanding debts table when partially paid.

## Decisions
1. **Gateway Ingestion & Discovery**:
   - MQTT ingestion subscribes to the wildcard pattern `solar/v1/sites/+/gateways/+/devices/+/telemetry`.
   - Gateways whose IDs or sites are unregistered in the system are captured in a new `discovered_gateways` table and surfaced under the "ยังไม่เชื่อมต่อ" (Unconnected) tab with badge counts.
   - When an unassigned gateway sends telemetry specifying its device model (e.g. `PowerLogic PM2230`), the server resolves the corresponding `meter_presets` registers and pushes the mapping back via MQTT config topic (`solar/v1/sites/{siteId}/gateways/{gatewayId}/config`).
   - Admins can pair discovered gateways directly to an existing site via a dedicated modal.

2. **Unified Financial Records & Single Customer Portal**:
   - The billing statement and receipt lifecycle is consolidated into a single record per billing cycle.
   - The customer interface consolidates navigation into a single "เอกสาร" (Documents) menu pointing to `/billing`, listing monthly periods and providing unified access to billing statements, uploaded slips, and receipts in one row.
   - Owner/admin views pin items in "รอตรวจหลักฐาน" (`pending_verification`) to the top of the table.

3. **Partial Receipts & Outstanding Balances**:
   - For partial payments, receipts are issued for the verified payment amount with sequential installment suffix (e.g., `REC-202610-0012/1`).
   - Receipt PDFs display only four payment metadata fields (Channel, Date/Time, Amount, Evidence Reference).
   - An "Outstanding Balance" table is appended under billing items, detailing remaining balance for the current bill plus any past unpaid bills for that customer.
   - Receipt issue date reflects the customer-selected payment date.
   - All mobile inputs and date pickers use `>= 16px` font size (`text-base md:text-sm`) to prevent browser auto-zooming on smartphones.
