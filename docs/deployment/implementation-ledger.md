# Deployment implementation ledger

Plan: docs/superpowers/plans/2026-09-30-gateway-staging-e2e-readiness.md

Ruling: work in the existing codex/customer-readiness branch and dirty checkout, preserving user changes; a clean worktree would omit the telemetry/auth work this deployment must ship. No commits/push/main changes during implementation.

| Task | Owner | Interface / check | Status |
|---|---|---|---|
| Images + staging Compose + broker | container_stack | WEB_IMAGE/API_IMAGE/WORKER_IMAGE; API /ready; migration runner | complete; local verification passed |
| CI/E2E/deploy | ci_pipeline | consumes tested images, publishes digest refs, same Compose vars | complete; local verification passed |
| Runtime readiness/worker schema | readiness_runtime | /ready public, actual dependencies; worker minimal env | complete; local verification passed |
| Non-destructive bootstrap + runbook + verification | root | db:bootstrap and persistent account/bucket | complete; local verification passed |

No reachable final implementation spec beyond accepted conversation plan; defaults documented and reversible. MQTT stays push-based. CI database/broker isolated. Broker TLS and deployment secrets require external operator configuration; do not fabricate live verification.


Final evidence: docs/deployment/verification.md. Full isolated runner exit0; remote provisioning remains operator setup, not a verified live deployment.

