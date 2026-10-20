# Gateway Primary Status and Pairing Readiness Design

## Context

The gateway index currently renders lifecycle, configuration, connection, and telemetry freshness as four badges in one operational-status column. These are independent diagnostic dimensions, but the index presents them as peers without category labels in compact mode. A single gateway can therefore appear as Active, Applied, Online, and Stale at the same time.

The onboarding index and detail APIs also disagree about which discoveries are actionable. The list reads directly from `discovered_gateways`, while the detail endpoint requires a matching current row in `gateway_discovery_snapshots`. Migration 066 created the snapshot table without backfilling rows created by the earlier telemetry-discovery flow. Such a legacy row appears in the unconnected list but opening it returns a generic 404 because no reviewable registration snapshot exists.

## Goals

- Show exactly one primary gateway status in the index and detail header.
- Model the operator-facing progression as unconnected, connecting, online, or offline.
- Preserve configuration failures and drift as actionable diagnostics without turning them into additional primary-status badges.
- Make the discovery list report whether a row can enter the pairing wizard.
- Replace the generic 404 for legacy discoveries with a stable, actionable registration-required response.
- Allow a legacy unassigned row to become pairable when the gateway publishes a valid schema 1.1 register message.
- Preserve the existing secure four-step pairing, one-time credential, configuration publication, and apply flow.

## Non-goals

- Do not manufacture registration snapshots or device mappings from legacy telemetry.
- Do not persist a duplicated display-status column.
- Do not change gateway authentication, MQTT ACLs, credential issuance, or configuration approval semantics.
- Do not delete or ignore legacy discovery rows automatically.
- Do not redesign the pairing wizard.

## Primary Status Model

The UI derives a `GatewayPrimaryStatus` from authoritative existing fields:

```ts
type GatewayPrimaryStatus = 'unconnected' | 'connecting' | 'online' | 'offline';
```

Precedence is deliberate:

1. A discovery row is `unconnected`.
2. A persisted gateway whose lifecycle is not `active` is `connecting`.
3. An active persisted gateway uses the server-derived recency status: `online` or `offline`.
4. Unknown or malformed active status fails closed to `offline`.

The server-derived `status` already evaluates `gateways.last_seen_at` against the gateway polling interval. The primary badge must use this recency result instead of the stored last connection event, which can remain `online` after telemetry becomes stale.

Configuration state does not override the primary status. A failed or drifted configuration is rendered as an alert in the detail/sync surfaces. A pending update on an already active gateway therefore remains online or offline.

Thai labels are:

- `unconnected`: ยังไม่เชื่อมต่อไซต์
- `connecting`: กำลังเชื่อมต่อ
- `online`: ออนไลน์
- `offline`: ออฟไลน์

English labels are `Not connected`, `Connecting`, `Online`, and `Offline`.

## Index Semantics

The status column and mobile card render one badge using the shared primary-status function. The status filter exposes the same four values, so the selected filter can never disagree with the displayed badge.

Tab membership represents assignment rather than network presence:

- All: every persisted and discovered item.
- Connected: every persisted gateway, including connecting, online, and offline gateways.
- Not connected: discovery rows only.

This removes the current behavior where a persisted configuring gateway is grouped with never-paired discoveries.

The detail header uses the same single primary badge. Lifecycle, desired/applied versions, configuration errors, and sync progress remain available in their dedicated detail sections as facts and alerts rather than additional status badges.

## Discovery Readiness Contract

`DiscoveredGatewayRow` gains:

```ts
onboardingState: 'ready' | 'registration_required';
```

The list service computes `ready` only when both conditions hold:

- `client_id` equals `external_gateway_id`; and
- a snapshot exists for the row's current `discovery_revision`.

Otherwise the row is `registration_required`. This field is computed from durable evidence and is not stored as another mutable status.

The detail service first loads the discovery row. If the row does not exist, it returns 404. If the row exists but its current snapshot is absent or its client identity is not verified, it returns HTTP 409 with code `GATEWAY_REGISTRATION_REQUIRED`. It must not synthesize a detail object from `raw_payload`.

When the gateway later publishes a valid schema 1.1 register message, the existing registration transaction updates the unassigned row, inserts the current snapshot, and makes the next list poll return `ready`.

## Pairing Interaction

- Clicking a ready discovery opens the existing four-step wizard.
- Clicking a registration-required discovery opens a small actionable dialog instead of issuing a detail request that can only fail.
- The dialog explains that the gateway must publish a schema 1.1 register message to `solar/v1/gateways/{gatewayId}/register` with anonymous credentials, QoS 1, and Retain disabled.
- The dialog offers Retry. Retry refreshes the discovery list; if the row becomes ready, the workspace opens the pairing wizard for the refreshed row.
- A race remains possible between list and detail. If detail returns `GATEWAY_REGISTRATION_REQUIRED`, the pairing dialog renders the same guidance and Retry behavior instead of the generic not-found message.

## Historical Data Safety

Before deployment, run a read-only audit counting unassigned rows without a current snapshot or verified client identity. No automatic migration deletes or fabricates those rows. Operators must update or run the gateway client so it sends a valid register message. This is the only safe way to obtain authoritative firmware, device, connection, and mapping evidence.

## Error Handling

- Missing discovery: 404, unchanged.
- Existing discovery without pairable evidence: 409 `GATEWAY_REGISTRATION_REQUIRED`.
- Snapshot changes during review: existing 409 `GATEWAY_DISCOVERY_STALE`, unchanged.
- Discovery-list failure: existing retryable page alert, unchanged.
- Pairing catalogue/detail network failure: existing retry surface, unchanged.

## Test Strategy

- Unit-test the complete primary-status truth table and localized badge output.
- Verify the index renders exactly one primary badge, partitions persisted/configuring gateways correctly, and filters by the displayed status.
- Verify discovery summaries expose readiness for current, missing, and mismatched snapshot evidence.
- Verify discovery detail distinguishes absent rows from registration-required rows.
- Verify a subsequent valid register message repairs the same legacy unassigned row and makes it ready.
- Verify a registration-required row shows guidance without starting the detail query.
- Preserve the existing pairing, secret-handling, sync, permission, publication, and applied-state tests.
- Run API and web type checks, full test suites, build, and the repository CI-equivalent commands before commit.

## Acceptance Criteria

- Every gateway row and detail header has exactly one primary status badge.
- A configuring persisted gateway appears in Connected and displays Connecting.
- An active gateway whose recency status is offline never displays Online merely because its last connection event was online.
- A pending or failed configuration does not create a second primary badge.
- A legacy discovery never opens into a generic 404.
- A fresh schema 1.1 register message makes the same legacy discovery pairable without deleting or fabricating data.
- The existing register-to-apply onboarding flow and permission boundaries remain green.
