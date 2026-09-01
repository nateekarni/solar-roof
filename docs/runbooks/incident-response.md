# Incident response runbook

1. Record incident start, correlation IDs and affected school/site scope.
2. Protect billing/document integrity: pause close/finalize jobs when data quality is uncertain.
3. Inspect API, worker, database, Redis, MQTT and storage health checks.
4. Preserve audit logs and raw telemetry; do not overwrite or delete evidence.
5. Restore service, reconcile affected cycles, document corrective adjustment and notify owner.
