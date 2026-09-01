# Billing reconciliation runbook

1. Identify cycle key, site, Billing Meter and contract/rate version.
2. Compare opening/closing snapshots with target cutoff and actual observed timestamps.
3. Check quality status. Never finalize `invalid`; require owner/admin reason for `partial` or `estimated`.
4. Check raw telemetry corrections. Raw readings are immutable; use correction/adjustment records.
5. Rebuild preview before lock. After lock use credit/debit adjustment with audit event.
6. Confirm invoice/receipt numbering and idempotency key before re-running a job.
