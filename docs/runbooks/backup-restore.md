# Backup and restore runbook

Back up PostgreSQL/TimescaleDB daily and object storage daily with encryption. Retain raw telemetry for 2 years, aggregates for 7 years and financial documents/contracts according to the selected 7–10 year policy.

Monthly: perform a restore verification in an isolated environment, record RPO/RTO, validate Timescale hypertables and object hashes, and confirm the application health endpoints.
