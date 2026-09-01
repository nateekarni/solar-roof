# Observability baseline

## Required metrics

- `solar_gateway_last_seen_seconds{site_id,gateway_id}` — seconds since the last accepted gateway message.
- `solar_telemetry_ingest_lag_seconds{site_id}` — ingestion delay from device timestamp to API receipt.
- `solar_aggregate_last_completed_timestamp{site_id,granularity}` — watermark for 15-minute, hourly, daily and monthly aggregation.
- `solar_billing_runs_total{status}` — billing runs by `preview`, `finalized`, `failed`, `blocked_quality`.
- `solar_document_generation_total{document_type,status}` — invoice, receipt and report generation outcomes.
- `solar_notification_delivery_total{channel,status}` — in-app and email delivery outcomes.

## Logging rules

Use structured JSON logs with request/correlation ID, site ID, actor ID and job ID where available. Never log JWTs, passwords, MQTT credentials, signed URLs, raw document contents or payment evidence. Redact sensitive fields at the logger boundary.

## SLO starting points

- API availability: 99.5% monthly.
- Telemetry ingestion: 99% accepted within 60 seconds.
- Monthly billing cutoff: complete before 00:15 Asia/Bangkok on the first day of the following month.
- Critical alarm notification: enqueue within 60 seconds.
