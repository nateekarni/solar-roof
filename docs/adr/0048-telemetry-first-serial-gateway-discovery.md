# Telemetry-First Serial Gateway Discovery

## Status

Accepted

## Context

The separate MQTT `/register` path made gateway onboarding depend on a control
message before the telemetry path could be inspected. Topic codes can also be
duplicated or mistyped, so matching only Site, Gateway, and Device codes cannot
prove that a physical asset was previously connected.

## Decision

Schema 1.2 telemetry is the only discovery signal. It adds required
`gatewaySerial` and `device.deviceSerial` fields. Claimed topic codes remain
aliases; an approved serial-to-asset binding is the authoritative connection
state. Unknown or mismatched serials are quarantined as discovery candidates
and never enter production telemetry or billing until an administrator confirms
the binding. MQTT credentials use `gatewaySerial` as username and Client ID.

The `/register` subscription and anonymous ACL are removed. Already-bound
schema 1.1 senders remain compatible during migration but cannot create new
discovery records.

## Consequences

Gateway firmware has one first-contact publish flow and operators can find
unbound Site/Gateway/Device claims directly from telemetry. Duplicate display
codes are visible without being mistaken for an existing connection. Gateway
and device serials become required for all new onboarding, and the first
quarantined payload must be sent again after credentials and configuration are
applied.

