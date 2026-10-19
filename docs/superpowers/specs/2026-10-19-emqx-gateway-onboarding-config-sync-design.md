# EMQX gateway onboarding and configuration synchronization

Status: Approved by the user on 2026-10-19; implementation is tracked in the matching implementation plan.

## Purpose

Define the production MQTT lifecycle for discovering a new gateway, reviewing its reported devices and register mappings, assigning it to a site, synchronizing an approved configuration, and admitting telemetry for document generation. The design preserves the supplied MQTT payload standard while adding the control-plane topics that the supplied document does not define.

## Source contract and naming

The supplied Word standard defines these data-plane topics:

```text
solar/v1/sites/{siteId}/gateways/{gatewayId}/devices/{deviceId}/telemetry
solar/v1/sites/{siteId}/gateways/{gatewayId}/dataAcept
```

The exact `dataAcept` spelling remains part of protocol version 1.1 for compatibility. The standard requires Cloud to publish it only after validation and durable persistence. It does not define first registration, configuration synchronization, configuration updates, or connection status.

This design adds a site-independent gateway control plane:

```text
solar/v1/gateways/{gatewayId}/register
solar/v1/gateways/{gatewayId}/config
solar/v1/gateways/{gatewayId}/configUpdate
solar/v1/gateways/{gatewayId}/configStatus
solar/v1/gateways/{gatewayId}/status
```

Control topics use the stable gateway identity because the site reported before approval is untrusted and a gateway may later be reassigned. Data topics continue to use the approved site identity from the existing standard.

## Topic contract

| Topic suffix | Publisher | Subscriber | QoS | Retained | Purpose |
| --- | --- | --- | --- | --- | --- |
| `register` | Unregistered gateway | Cloud | 1 | No | Report a full discovery snapshot before assignment |
| `config` | Cloud | Authenticated gateway | 1 | Yes | Deliver the latest admin-approved desired configuration |
| `configUpdate` | Authenticated gateway | Cloud | 1 | No | Propose a complete replacement configuration for admin approval |
| `configStatus` | Authenticated gateway | Cloud | 1 | No | Report receipt, application, or failure of a configuration revision |
| `status` | Authenticated gateway or its Last Will | Cloud | 1 | Yes | Report the latest broker connection state |
| `telemetry` | Active gateway | Cloud | 1 | No | Deliver canonical device telemetry |
| `dataAcept` | Cloud | Active gateway | 1 | No | Confirm validation and durable persistence of telemetry |

The backend subscribes once per broker to aggregate wildcard filters. It must not combine overlapping aggregate and per-gateway subscriptions on the same consumer. Horizontally scaled ingestion may use a shared telemetry subscription, while retained configuration remains a normal gateway-specific subscription.

## Lifecycle and state model

The system tracks three independent state dimensions rather than overloading one status:

- `lifecycleState`: `discovered`, `configuring`, `active`, or `disabled`.
- `configState`: `draft`, `pending_sync`, `applied`, `failed`, or `drifted`.
- `connectionState`: `online`, `offline`, or `unknown`.

The lifecycle is:

```text
Anonymous register
  -> discovered + draft
  -> admin reviews gateway, site, devices, preset matches, and mappings
  -> admin confirms
  -> configuring + pending_sync
  -> permanent gateway credential is configured
  -> authenticated reconnect
  -> retained config is delivered
  -> configStatus received
  -> configStatus applied with matching version and hash
  -> active + applied
  -> telemetry admission begins
```

An active gateway remains in the connected tab when temporarily offline. Online/offline is an operational state, not the assignment state.

## Registration and discovery

`register` is a full snapshot of the gateway and every device it currently detects. Required envelope fields are:

- `schemaVersion`
- `messageType: register`
- stable `messageId`
- timezone-bearing `sentAt`
- gateway identity, model, and firmware version
- optional `reportedSiteId`
- a complete `devices` array

Each device may report manufacturer, model, firmware, protocol, current profile information, connection settings, poll groups, and register mappings. Missing preset or mapping data does not prevent discovery.

Before admin approval, repeated valid snapshots for the same gateway update its discovery draft using last-write-wins semantics. Every update increments a `discoveryRevision` and retains prior snapshots for audit. An admin modal opened on an older revision cannot confirm silently; the API returns a conflict and requires the user to reload the latest snapshot.

`reportedSiteId` is an untrusted suggestion. The UI may use it to preselect or highlight a likely site, but only `assignedSiteId`, written by the admin confirmation transaction, controls ownership and data routing.

Preset matching is advisory:

- Exact model/profile matches may prepopulate an existing preset.
- Gateway-reported mappings may seed a gateway-sourced draft.
- Admins may select a different preset or create a complete manual configuration.
- The system may create a new draft without a preset.
- The active snapshot records `mappingSource` as `preset`, `manual`, or `gateway` and optionally records its preset provenance.

The system does not fabricate a physical register address, datatype, byte order, word order, scaling factor, or unit when no operator, preset, or gateway report supplied it. Admin-entered values are allowed and become part of the approved revision.

## Configuration revision model

Admin confirmation creates an immutable configuration revision containing:

- gateway and assigned site identities
- monotonically increasing `configVersion`
- SHA-256 `configHash` over UTF-8 JSON with object keys sorted recursively, arrays preserved in order, and the `configHash` field excluded
- issue timestamp and approving admin identity
- complete device inventory
- device enablement and connection settings
- optional preset provenance
- complete poll groups and register mappings

The snapshot sent to a gateway is self-contained. A gateway does not need access to the platform's preset database to apply it.

The first discovery draft permits last-write-wins until admin confirmation. Once a revision becomes active, neither a new `register` nor a gateway update overwrites it. All later changes create a new immutable revision.

The platform stores `desiredConfigVersion` separately from `activeConfigVersion`. On first assignment there is no active version until the gateway reports `applied`. For a later update, the previous active version remains valid for telemetry while the next desired version is pending. The active pointer advances atomically only when the matching version/hash is applied.

## Configuration delivery and status

Cloud publishes the latest approved `config` at QoS 1 with retain enabled. A broker PUBACK confirms only broker ownership, not device application.

The gateway publishes `configStatus` with the exact `configVersion` and `configHash`. Supported status values are:

- `received`: the gateway received and parsed the envelope.
- `applied`: the gateway validated, persisted, and activated the complete revision.
- `failed`: the gateway could not validate, persist, or activate it.

A failure includes a stable error code and may identify the affected device, tag, or register. It must not expose secrets. Reapplying the same version/hash is idempotent.

The platform moves a gateway to `active/applied` only after receiving `applied` for the latest desired version and hash. Older or mismatched reports are retained for audit but cannot activate the gateway. A later report showing a different applied version/hash sets `configState=drifted`.

## Configuration updates after activation

`configUpdate` is a complete proposed snapshot, not a patch. It includes a unique `proposalId`, stable `messageId`, and `baseConfigVersion`.

The initial release always requires admin approval:

```text
Gateway publishes full configUpdate
  -> platform creates proposed revision
  -> admin reviews the complete difference
  -> admin approves or rejects
  -> approval creates the next desired config revision
  -> Cloud publishes retained config
  -> gateway reports configStatus
```

If `baseConfigVersion` does not equal the current active version, the proposal is marked stale and cannot overwrite active state. The UI presents the conflict for explicit resolution. The data model may retain an `approvalMode` field so a later release can support automatic approval without changing topics or payloads; version 1 uses manual approval only.

## Connection status

At CONNECT time, an authenticated gateway configures a retained offline Last Will on its own `status` topic. After CONNACK and required SUBACKs succeed, it publishes a retained online status. Before a graceful disconnect it publishes retained offline status itself.

Status includes gateway ID, a boot/session ID, firmware version, applied configuration version/hash, and a reported timestamp where available. The backend always records its own receive time because a Last Will payload timestamp may have been created earlier.

The platform evaluates separately:

- latest broker connection state
- last telemetry time relative to expected polling cadence
- desired versus applied configuration state

An online value never substitutes for telemetry freshness or configuration correctness.

## Telemetry admission and data acceptance

A gateway starts normal polling and telemetry publication only after applying an approved configuration. The backend accepts a telemetry message only when:

- the gateway lifecycle is active
- topic, payload, authenticated gateway, assigned site, and device identities agree
- the device is enabled in the active configuration
- the canonical payload schema and pinned profile rules pass
- the logical message is idempotent or a valid duplicate
- the database transaction commits successfully

Only then does Cloud publish the correlated `dataAcept`. Broker PUBACK is not application acceptance. Discovery messages and unpersisted telemetry never receive a successful `dataAcept`. QoS 1 duplicates return the same durable acceptance result without duplicating readings or downstream document effects.

## Authentication and authorization

Version 1 intentionally permits anonymous discovery because the same operator configures the platform and physical gateway. Anonymous access is quarantined and is not production data access.

Before approval, an unregistered MQTT client may only publish:

```text
solar/v1/gateways/{clientId}/register
```

The broker or HTTP authorizer requires MQTT Client ID and topic gateway ID to match. The registration handler separately requires the payload gateway ID to match both. Anonymous clients cannot subscribe, publish status, propose updates, report config state, or publish telemetry. Registration is rate-limited and logs source address, client ID, timestamp, and authorization result.

Admin confirmation creates a strong permanent credential and displays it once. Only its password hash is stored. The operator configures that credential on the gateway, which reconnects using `username == clientId == gatewayId`.

After authentication, ACLs grant only the gateway's own control topics and its approved site/device data topics. Cross-gateway and cross-site access is denied by default. Revoking, disabling, or reassigning a gateway removes prior data-plane authorization and clears obsolete retained configuration where required.

## Admin experience

The unconnected tab updates without a full page reload through polling or server-driven invalidation. API failures are shown explicitly and never converted silently into an empty list.

Selecting a discovery row opens a four-step modal:

1. Review gateway identity, firmware, reported site, discovery time, device count, and revision.
2. Select the actual site, with a visible warning when it differs from the reported site.
3. Review every device and its match state, choose a preset or manual configuration, and edit connection, poll-group, and register mapping fields.
4. Review the complete assignment and configuration summary, then confirm.

Device match labels include matched preset, matched by model, manual configuration, no mapping, and invalid configuration. An enabled device must pass configuration validation before confirmation. Devices may be disabled and completed later.

Confirmation atomically assigns the site, creates the permanent gateway/device records, snapshots the approved configuration, creates the credential, and enters `configuring/pending_sync`. The modal then becomes a live synchronization view showing credential setup, authenticated reconnect, configuration delivery, `received`, `applied`, or failure. It does not report success before the matching `applied` status arrives.

Tab placement follows lifecycle:

- discovered, draft, pending sync, and sync failed remain under unconnected with distinct status labels.
- active gateways appear under connected whether currently online or offline.

### UI implementation constraints

All new and changed UI must use shadcn/ui components or reusable components already present in the application. Raw form controls, dialogs, tables, badges, tabs, alerts, and ad hoc components are prohibited when an established system component exists.

Colors, spacing, typography, radii, focus states, status variants, and responsive behavior must use existing design tokens and component variants. Do not hard-code visual values, duplicate component logic, or introduce one-off status colors unless the design system genuinely lacks a necessary semantic token. Extend a shared component or variant in that case.

The modal must preserve keyboard navigation, focus management, accessible labels, error associations, loading states, and mobile/responsive behavior provided by the existing component system.

## Transaction and failure behavior

Admin confirmation is atomic. Failure before commit leaves the discovery draft unchanged and creates no partially assigned gateway. Failure after commit but before gateway reconnect leaves the gateway in pending sync; the retained desired configuration is delivered when the authenticated gateway subscribes.

The system records stable failure stages for authentication, authorization, registration validation, stale discovery revision, preset/config validation, credential setup, broker publication, configuration receipt, configuration application, telemetry validation, and persistence.

Important recovery rules:

- Retrying the same `messageId`, proposal, or configuration version is idempotent.
- A failed `configStatus` does not roll back automatically; admin may correct the draft and issue a new revision.
- An offline gateway remains pending until it reconnects and applies the latest retained configuration.
- A stale `configUpdate` remains reviewable but cannot become active without explicit conflict resolution.
- Decommissioning or reassignment clears obsolete retained control state and revokes old data-topic permissions.

## Backend boundaries

Keep the implementation separated into focused modules:

- MQTT connection manager: broker connections, subscriptions, SUBACK validation, reconnect, and readiness.
- Gateway registration service: anonymous register validation, snapshots, matching suggestions, and discovery revisions.
- Configuration service: draft validation, immutable revisions, hashing, approval, desired state, and proposals.
- MQTT control-plane handler: config publication plus configUpdate, configStatus, and status ingestion.
- Telemetry ingestion: canonical validation, active-config authorization, idempotent persistence, and dataAcept.
- Gateway administration API: modal queries, conflict-aware edits, confirmation, proposal approval, and sync state.

Broker-specific EMQX webhooks remain adapters at the edge; domain state transitions must also be testable without EMQX.

## Deployment and observability

The API and test clients must connect to the same configured broker. Deployment readiness requires a connected backend MQTT client and successful wildcard subscriptions, not merely a gateway connection.

Expose or log:

- broker connection and reconnect state
- granted subscriptions and SUBACK failures
- anonymous registrations and rate-limit decisions
- authentication and ACL denials
- configuration version/hash publication and status transitions
- telemetry received, rejected, persisted, deduplicated, and acknowledged counts
- dropped/no-subscriber messages
- configuration synchronization and data acceptance latency

The admin UI must surface broker or discovery API errors rather than showing a misleading zero count.

## Verification strategy

Automated tests cover:

1. Anonymous registration can publish only its own full snapshot and cannot subscribe or access runtime topics.
2. Repeated registration updates the draft and increments discovery revision; stale admin confirmation receives a conflict.
3. Preset, gateway-sourced, and manual mappings all produce a complete validated snapshot.
4. Admin confirmation is atomic and generates a permanent credential plus immutable configuration revision.
5. Authenticated ACLs prevent cross-gateway and cross-site access.
6. Retained config reaches a gateway after reconnect; PUBACK alone does not activate it.
7. Matching `received`, `applied`, `failed`, old-version, wrong-hash, duplicate, and drifted configStatus cases.
8. Full configUpdate proposal, stale base version, approval, rejection, and subsequent synchronization.
9. Online, abnormal offline Last Will, graceful offline, reconnect, and stale status behavior.
10. Telemetry is rejected before activation and accepted after the exact configuration is applied.
11. Data is persisted before dataAcept; QoS 1 replay is idempotent.
12. Connected and unconnected tabs, modal steps, API errors, live sync progress, revision conflict, keyboard operation, and responsive layout using existing shadcn/system components.

An end-to-end environment must include the exact EMQX version, API, PostgreSQL, web application, and a real MQTT client. The test proves register through active telemetry and dataAcept, including reconnect and failure paths. Unit tests alone do not certify deployment wiring.

## Compatibility and migration

The migration is additive. Existing canonical telemetry and `dataAcept` topics remain unchanged. Existing gateways can be assigned a generated configuration revision and permanent credential through an explicit migration path. Legacy raw-register ingestion remains isolated behind an explicit protocol mode and does not redefine the canonical telemetry envelope.

The control-plane rollout may temporarily support the old config/configAck implementation internally, but new documentation and gateway integrations use `configStatus`. Any compatibility adapter must be observable and time-bounded; it must not expose both paths as ambiguous sources of active state.

## Scope boundary

This design governs MQTT onboarding, configuration synchronization, status, telemetry admission, and the gateway administration experience. It does not invent vendor register definitions, alter financial document rules, automatically approve post-activation updates in version 1, or certify physical device behavior without the corresponding gateway and meter hardware.
