# Telemetry-First Gateway Discovery Design

## Goal

Use the per-device telemetry topic as the only first-contact MQTT path. A
gateway must not publish a separate `/register` message before it can be found
and paired.

> Requirement update: discovery supports both schema 1.1 without serials and
> schema 1.2 with both serials. The dual-mode rules below supersede the earlier
> serial-only wording retained in this design history.

## Canonical identity

The codes in the MQTT topic are claims supplied by the sender:

```text
solar/v1/sites/{siteId}/gateways/{gatewayId}/devices/{deviceId}/telemetry
```

They are useful labels but are not proof that the sender is already connected.
When available, physical identity is carried in the schema 1.2 telemetry envelope:

- `gatewaySerial` identifies one physical gateway.
- `device.deviceSerial` identifies one physical device below that gateway.
- A serial-bearing device observation is keyed by `gatewaySerial + deviceSerial`.
- An approved binding connects those serials to internal Site, Gateway, and
  Device records.

Duplicate claimed codes never make a candidate connected. If a new serial uses
codes already present elsewhere, it remains in **Not connected** and the UI
shows an identity-conflict warning.

## Telemetry contract

Schema 1.2 retains the existing schema 1.1 message shape and adds two required
fields:

```json
{
  "schemaVersion": "1.2",
  "messageType": "telemetry",
  "messageId": "GW-001-000001260",
  "sequence": 1260,
  "lotNumber": 1260,
  "siteId": "SITE-001",
  "gatewayId": "GW-001",
  "gatewaySerial": "GW-SN-A1B2C3D4",
  "device": {
    "deviceId": "SMARTLOGGER-001",
    "deviceSerial": "2102312FAP10XXXXXXXX",
    "deviceType": "solar-logger",
    "manufacturer": "Huawei",
    "model": "SmartLogger3000A",
    "profileId": "huawei-smartlogger3000a",
    "profileVersion": "1.0.0",
    "protocol": "modbus-tcp"
  }
}
```

The topic identity and the envelope `siteId`, `gatewayId`, and
`device.deviceId` must match exactly. Serials are trimmed, case-sensitive
identifiers of 1–128 characters using `A-Z`, `a-z`, `0-9`, `_`, and `-`.

Schema 1.1 without serials is also accepted for new discovery. It is keyed by
broker + claimed `gatewayId`, and devices merge by claimed `deviceId`. Serial
and no-serial candidates are stored separately and never merge automatically.
If an exact claimed route is already bound, schema 1.1 continues through normal
production ingestion; otherwise it becomes a configurable not-connected candidate.

## Classification and storage

For each valid schema 1.1 or 1.2 message the ingestion boundary classifies the sender:

1. When broker, gateway serial, device serial, and approved topic aliases all
   match an active binding, ingest telemetry normally and return `dataAcept`.
2. Otherwise, upsert a discovery candidate keyed by broker + gateway serial
   when present, or broker + claimed gateway ID when absent. Merge devices by
   device serial when present, otherwise by claimed device ID, and do not
   acknowledge it as production telemetry.
3. Store only a bounded latest evidence snapshot for pairing. Discovery
   messages never enter production samples, aggregates, billing, or reports.
4. A later observation from the same serial with different claimed codes
   increments the discovery revision and exposes the mismatch for review.

The existing connected Gateway remains connected when a new device serial is
observed. Only the new device evidence appears as not connected. The UI may
therefore show a connected gateway and a separate not-connected candidate with
the same claimed gateway code.

## Pairing

Every telemetry-derived candidate is reviewable without a registration
snapshot. The pairing workspace pre-fills device type, manufacturer, model,
profile hints, protocol, and serials that were present in telemetry. Missing
connection details and mappings remain explicit admin inputs.

Confirmation is optimistic-concurrency protected by `discoveryRevision`. The
transaction:

1. locks the candidate and target Site;
2. validates serial identity when serials were supplied;
3. creates the Gateway with optional `gateway_serial` and materializes enabled
   Devices with optional observed serials;
4. creates the immutable desired configuration;
5. issues MQTT credentials whose username/client ID is `gatewaySerial` when
   present, otherwise the claimed `gatewayId`;
6. marks the candidate configuring and publishes configuration.

The first discovery message is not replayed. The gateway reconnects with its
new credentials and publishes the next current telemetry message.

## MQTT authorization

- First contact uses no username/password. Client ID should use the serial when
  present or the claimed gateway ID when serials are absent.
- Anonymous clients may publish only canonical telemetry topics; they may not
  subscribe, publish control/status messages, or receive `dataAcept`.
- A serial already bound to an active or retired Gateway cannot downgrade to
  anonymous access.
- After pairing, username and Client ID both equal the approved MQTT identity
  (gateway serial when present, otherwise gateway ID) and the issued password is required.
- Authenticated clients may publish only the Site/Gateway/Device topic aliases
  in their approved binding.
- QoS is 1, Retain is false, and existing payload, nesting, rate, and bounded
  evidence limits remain enforced.

## Status model

Each row renders one primary status:

1. `unconnected` — observed serial without an approved binding;
2. `connecting` — binding approved but configuration not active;
3. `online` — active and within the server recency window;
4. `offline` — active but outside the recency window.

Configuration errors remain detail alerts and do not become extra primary
status badges.

## Removal and compatibility

- Stop subscribing to `solar/v1/gateways/+/register`.
- Remove anonymous ACL access to `/register`.
- Remove registration-required UI and API behavior.
- Keep control topics for configuration, configuration status, gateway status,
  and `dataAcept`; only first-contact registration is removed.
- Existing paired schema 1.1 gateways continue ingesting during migration.

## Documentation

The Thai MQTT onboarding runbook and checked-in JSON examples must document
both schema modes, optional paired `gatewaySerial`/`deviceSerial`, the single
telemetry discovery path, and the connected/unconnected decision table. No
instruction may require publishing `/register`.

## Acceptance criteria

- A valid schema 1.1 no-serial or schema 1.2 serial telemetry message creates or
  refreshes a not-connected candidate without writing production telemetry.
- Multiple devices from one gateway serial merge into one candidate and remain
  individually identifiable by `deviceSerial`.
- Multiple no-serial devices from one gateway ID merge into one candidate and
  remain individually identifiable by `deviceId`.
- Duplicate claimed Site/Gateway/Device codes do not reuse an existing binding.
- An exact serial and approved alias match ingests and acknowledges normally.
- A new device serial under a connected gateway becomes reviewable without
  changing the connected gateway's primary status.
- Pairing no longer depends on a `/register` snapshot.
- MQTT docs and examples contain no first-contact `/register` step.

