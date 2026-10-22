# EMQX 5.x and MQTT flow research

Date: 2026-10-19

Scope: connection and message-flow semantics for the Solar Roof gateway/backend contract. Protocol claims below come from the OASIS MQTT 3.1.1 and 5.0 specifications; broker claims come from official EMQX documentation.

## Version boundary

EMQX's `latest` documentation includes features added after the first 5.x releases and, in a few places, features added in 6.x. Production should pin an exact EMQX image, minor version, and edition, then verify its feature matrix. Relevant gates include durable sessions (5.7.0+), end-to-end OpenTelemetry tracing (5.8.3+), `base.hocon` (5.8.4+), and HTTP-authentication ACL presets (5.8.0+). Wildcard topic-metric collections documented as 6.3 must not be assumed on EMQX 5.x.

Primary references: [EMQX configuration](https://docs.emqx.com/en/emqx/latest/guides/configuration/configuration.html), [durable sessions](https://docs.emqx.com/en/emqx/latest/guides/durability/durability_introduction.html), [OpenTelemetry traces](https://docs.emqx.com/en/emqx/latest/guides/observability/opentelemetry/e2e-traces.html), [HTTP authentication ACLs](https://docs.emqx.com/en/emqx/latest/guides/access-control/authn/acl.html), and [topic metrics](https://docs.emqx.com/en/emqx/latest/guides/observability/topic-metrics.html).

## Recommended production flow

1. Provision a site/gateway identity, per-device credential or certificate, and a least-privilege ACL before permitting normal production traffic.
2. The gateway connects with a stable, identity-bound Client ID and an offline Last Will. It validates CONNACK before proceeding.
3. It subscribes to its own retained `/config` and event-style `/dataAcept` topics, then validates every SUBACK result rather than treating a successful connection as a successful subscription.
4. It receives the retained desired configuration, validates and applies it, and publishes `/configAck` with separate `acknowledged` and `applied` states plus the configuration version/hash.
5. It publishes telemetry at QoS 1 with a stable application message ID. A broker PUBACK means MQTT accepted ownership; it does **not** mean the backend database committed the reading.
6. The backend validates and durably commits the reading, then publishes the correlated application `/dataAcept` response. Replayed QoS 1 deliveries are handled idempotently and return the same accepted result.
7. On a healthy connection the gateway publishes retained `online` status, replacing the retained offline Will. Monitoring separately evaluates broker connection, last-message freshness, and configuration state.

This preserves the project's existing, intentionally misspelled topic contract: `dataAcept`, not `dataAccept`.

## 1. Connections, subscriptions, topics, and messages are different signals

EMQX exposes point-in-time statistics separately from cumulative metrics. Its statistics distinguish `connections.count`, `live_connections.count`, `sessions.count`, `topics.count`, `subscribers.count`, `subscriptions.count`, shared subscriptions, and retained-message count. Its counters separately report connect/connected/disconnected events, subscribe operations, packets, published/received/sent messages, and dropped messages. [EMQX statistics and metrics](https://docs.emqx.com/en/emqx/latest/guides/observability/metrics-and-stats.html)

| Signal | What it proves | What it does not prove |
| --- | --- | --- |
| Connected client | An MQTT network connection completed | The client subscribed, is publishing, or is authorized for a topic |
| Session | Broker-held MQTT session state exists | The transport is currently live or the application processed a message |
| Subscription | A client/session has a topic filter | Any publisher exists or a message was delivered |
| Topic count | EMQX has distinct active subscribed topic names/filters | A topic is a pre-created resource or currently has retained data |
| Publish/receive/send counters | Packets/messages traversed a broker stage | The backend transaction committed successfully |
| Application `dataAcept` | The backend-specific acceptance condition was met | The device is still online now |

The Dashboard's subscription view is a client-to-filter mapping, while the topic view deduplicates topic filters across clients/nodes; multiple subscriptions can therefore correspond to one displayed topic. [EMQX subscription management](https://docs.emqx.com/en/emqx/latest/guides/dashboard/subscriptions/overview.html)

Operational dashboards should not collapse these into one “online” number. At minimum graph connection count/churn, subscription count, publish rate, backend accepted rate, dropped/no-subscriber/queue-full counts, and acceptance latency separately.

## 2. Backend subscription patterns

MQTT topic filters use `+` for one level and terminal `#` for zero or more levels. A filter not beginning with `$` does not match `$` topics. See [MQTT 5.0 §4.7](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html#_Toc3901246) and [MQTT 3.1.1 §4.7](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/mqtt-v3.1.1.html#_Toc398718106).

For the current hierarchy, a singleton backend can subscribe once to:

```text
solar/v1/sites/+/gateways/+/devices/+/telemetry
solar/v1/sites/+/gateways/+/configAck
solar/v1/sites/+/gateways/+/status
```

For horizontally scaled telemetry ingestion, EMQX shared subscriptions use `$share/{group}/{filter}` and route each matching publication to one member of the group. This is load balancing, not broadcast. [EMQX shared-subscription feature](https://docs.emqx.com/en/emqx/latest/get-started/feature.html) and [MQTT 5.0 §4.8.2](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html#_Toc3901250)

Example:

```text
$share/solar-ingest/solar/v1/sites/+/gateways/+/devices/+/telemetry
```

Important constraints:

- Avoid subscribing the same consumer to both per-gateway filters and the aggregate wildcard. For overlapping filters, MQTT permits additional copies for additional matching subscriptions; ingestion must be idempotent even if the design avoids the overlap. [MQTT 5.0 §3.8.4](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html#_Toc3901185)
- Shared subscriptions do not receive retained messages, so they are appropriate for replicated backend workers, not for each gateway's desired configuration. [MQTT 5.0 §4.8.2](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html#_Toc3901250)
- Every SUBSCRIBE has a corresponding SUBACK with one result per topic filter. A broker may begin delivering matching messages before SUBACK arrives, so handlers must be ready before subscribing. [MQTT 5.0 §3.8.4](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html#_Toc3901185) and [MQTT 3.1.1 §3.9](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/mqtt-v3.1.1.html#_Toc398718068)

## 3. Retained messages

A retained publication replaces the broker's stored retained message for that exact topic. A new matching non-shared subscription receives the retained value according to its retain-handling options; a retained publication with an empty payload deletes the stored message. Retained messages are not MQTT session state and therefore survive session deletion. [MQTT 5.0 §3.3.1.3](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html#_Toc3901104) and [MQTT 3.1.1 §3.3.1.3](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/mqtt-v3.1.1.html#_Toc398718038)

Recommended semantics:

- `/config`: retained desired state with an immutable version/hash; ideal for first connect and reconnect.
- `/status`: retained latest declared state; offline Will is replaced by an online publication after the session is ready.
- `/telemetry`, `/dataAcept`, `/configAck`: non-retained event streams unless a separate, explicitly modeled “last reported state” topic is required.

EMQX retained messages do not expire by default, although expiry and storage limits can be configured. Decommissioning, reassignment, and topic-version migrations therefore need an explicit retained-message cleanup step; otherwise an old gateway can receive stale configuration immediately after subscribing. [EMQX retained messages](https://docs.emqx.com/en/emqx/latest/guides/dashboard/retained.html)

## 4. Last Will and online/offline status

An MQTT 3.1.1 Will is published when the broker detects an abnormal connection end, and is removed without publication after a normal DISCONNECT. MQTT 5 adds a Will Delay Interval; if the same client session reconnects before the delay expires, the Will can be suppressed. [MQTT 3.1.1 §3.1.2.5](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/mqtt-v3.1.1.html#_Toc398718031) and [MQTT 5.0 §3.1.2.5/§3.1.3.2.2](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html#_Toc3901047)

Use a retained offline Will on the gateway's own `/status` topic. Once CONNACK and critical subscriptions succeed, publish a retained online payload containing at least `observedAt`, a boot/session identifier, and software/config version. On MQTT 5, a short Will Delay reduces offline/online flapping during brief reconnects. On MQTT 3.1.1, implement the grace period in backend status evaluation because the protocol has no Will Delay.

Do not treat a retained `online` value as proof of current health: abrupt failure detection is bounded by keepalive/network timing, and retained state can be stale. Track at least:

- `brokerConnected`: latest broker connection event or status-Will state;
- `lastTelemetryAt`: freshness relative to the device's expected cadence;
- `configState`: desired, acknowledged, applied, and failed versions.

EMQX `$SYS` topics publish client connected/disconnected events, but the docs recommend the Rule Engine for lower-coupling device-status tracking, and `$SYS` access is restricted to localhost by default. [EMQX system topics](https://docs.emqx.com/en/emqx/latest/guides/observability/mqtt-system-topics.html)

## 5. QoS, duplicates, and session persistence

QoS 1 is “at least once”: retransmission can produce duplicate deliveries. Consumers must deduplicate by an application message ID and make database writes idempotent. The delivered QoS is no greater than both the publish QoS and the subscription's granted maximum. [MQTT 5.0 §4.3.2](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html#_Toc3901235) and [MQTT 3.1.1 §4.3.2](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/mqtt-v3.1.1.html#_Toc398718103)

MQTT session persistence retains protocol state, such as subscriptions and pending/inflight QoS 1/2 messages; it is not an application database guarantee.

- MQTT 3.1.1 `CleanSession=false` requests a persistent session. `CleanSession=true` discards prior state and keeps state only for that connection. [MQTT 3.1.1 §3.1.2.4](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/mqtt-v3.1.1.html#_Toc398718030)
- MQTT 5 uses Clean Start plus Session Expiry Interval. Expiry absent or zero ends the session when the network connection closes; a positive interval requests retained state. CONNACK Session Present tells the client whether a prior session was found. [MQTT 5.0 §3.1.2.4 and §3.1.2.11.2](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html#_Toc3901046)
- In EMQX, ordinary persistent sessions are memory-resident and can be lost on node restart. Durable sessions, introduced in 5.7.0 and disabled by default, persist/replicate state but add latency and store messages only for QoS-greater-than-zero subscriptions. [EMQX durable sessions](https://docs.emqx.com/en/emqx/latest/guides/durability/durability_introduction.html)

Recommended baseline: QoS 1 for config, config acknowledgement, telemetry, and `dataAcept`; bounded queues/expiry; a stable message ID; and idempotent processing. Choose a deliberate session expiry based on acceptable offline backlog. Test reconnect, broker restart, node loss, queue overflow, and expiry on the exact EMQX topology.

## 6. MQTT acknowledgement versus application `dataAcept`

PUBACK acknowledges a QoS 1 MQTT PUBLISH exchange. The receiver may PUBACK after accepting ownership without completing onward delivery or application processing. It therefore cannot prove schema validation, business acceptance, or database commit. [MQTT 5.0 §4.3.2](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html#_Toc3901235) and [MQTT 3.1.1 §4.3.2](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/mqtt-v3.1.1.html#_Toc398718103)

The project-level `dataAcept` should mean exactly: the backend validated the message and durably committed the canonical result. Publish no success response on validation or persistence failure. If a QoS 1 duplicate arrives, return the same correlated accepted result after confirming the existing durable record.

The payload should correlate at least the stable input `messageId` (and the current `lotNumber` contract where applicable), gateway/site identity, accepted timestamp, and schema/config revision. A rejection channel may include a stable reason code but must not leak sensitive internals. Keep `/configAck` separate: acknowledging/applying desired configuration is a different state transition from accepting telemetry.

MQTT 5 Response Topic and Correlation Data can formalize request/response, but an explicit response topic and payload correlation remain necessary for MQTT 3.1.1 compatibility. [MQTT 5.0 request/response properties](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html#_Toc3901114)

## 7. Authentication and topic authorization

EMQX allows all clients by default if no authenticator is configured, so production must configure at least one authenticator. Authentication establishes identity; authorization independently controls publish/subscribe actions. [EMQX authentication](https://docs.emqx.com/en/emqx/latest/guides/access-control/authn/authn.html)

Production baseline:

- TLS for all external listeners, ideally per-gateway X.509 certificates or unique rotated credentials;
- bind Client ID to the authenticated identity to prevent another client taking over its persistent session;
- deny by default, grant only the gateway's own topic subtree, and tightly control wildcard subscriptions;
- change Dashboard defaults and restrict the management API/listener;
- never make a gateway a superuser.

[EMQX security checklist](https://docs.emqx.com/en/emqx/latest/guides/access-control/security-checklist.html)

Suggested ACL matrix:

| Principal | Publish | Subscribe |
| --- | --- | --- |
| Gateway `{siteId}/{gatewayId}` | own device telemetry, own status, own configAck | own config and own dataAcept |
| Backend ingest | dataAcept/config/status commands as explicitly required | telemetry/configAck/status wildcard, preferably shared for replicated workers |
| Observability principal | none by default | restricted `$SYS/#` and/or metrics API only |

HTTP authorization can evaluate username, Client ID, peer address, action, topic, QoS, and retain flag for each publish/subscribe request. JWT/HTTP authentication can also return per-client ACLs; use the documented version-specific format. [EMQX HTTP authorization](https://docs.emqx.com/en/emqx/latest/guides/access-control/authz/http.html) and [authentication ACL presets](https://docs.emqx.com/en/emqx/latest/guides/access-control/authn/acl.html)

Project implication: automatic discovery must not mean that an unregistered username-shaped gateway receives normal production permissions regardless of password. If zero-touch discovery is required, give the bootstrap identity a separate credential and quarantine topic with no cross-tenant read and no production telemetry/config authority. Promotion should issue the normal identity/credential/ACL atomically.

## 8. Observability and tracing

Use four complementary layers:

1. Broker statistics/counters via Dashboard, REST, or Prometheus for fleet health and alerts. [EMQX statistics and metrics](https://docs.emqx.com/en/emqx/latest/guides/observability/metrics-and-stats.html) and [Prometheus integration](https://docs.emqx.com/en/emqx/latest/guides/observability/prometheus.html)
2. Exact-topic metrics in EMQX 5.x for incoming/outgoing/dropped counts and rates. Do not depend on the wildcard topic-metric collections documented as 6.3. [EMQX topic metrics](https://docs.emqx.com/en/emqx/latest/guides/observability/topic-metrics.html)
3. Targeted Log Trace by Client ID, topic, or IP to diagnose connection, subscription, authorization, and message-routing failures without globally enabling debug logs. [EMQX Log Trace](https://docs.emqx.com/en/emqx/latest/guides/observability/tracer.html)
4. End-to-end OpenTelemetry on 5.8.3+ when needed, with sampling because tracing every message adds overhead. MQTT 5 User Properties can propagate W3C `traceparent`/`tracestate`; clients on older protocol versions have less selective propagation. [EMQX end-to-end tracing](https://docs.emqx.com/en/emqx/latest/guides/observability/opentelemetry/e2e-traces.html) and [trace context propagation](https://docs.emqx.com/en/emqx/latest/guides/observability/opentelemetry/traces.html)

Alert on authentication failures, authorization denies, connection churn, dropped/no-subscriber/queue-full messages, telemetry-publish versus application-accept divergence, p95/p99 `dataAcept` latency, stale telemetry, and desired/acknowledged/applied config-version divergence. Include `messageId`, authenticated gateway identity, topic, and trace ID in structured backend logs.

## 9. First-connect and configuration bootstrap

Treat broker and device bootstrap as a reproducible deployment workflow, not an implicit side effect of the first untrusted connection.

1. Pin and stage the exact EMQX version/edition and configuration. Configure TLS, authentication, deny-by-default authorization, metrics, retention/expiry limits, session limits, and hardened Dashboard/API access.
2. Create the application site/gateway identity and immutable topic mapping.
3. Seed or issue the gateway credential and scoped ACL. EMQX's built-in-database `bootstrap_file` is only read when the authenticator is first created; it does not overwrite existing users, and parse/read failures can log warnings while authenticator creation still succeeds. Verify every seeded identity explicitly. [EMQX built-in database authentication](https://docs.emqx.com/en/emqx/latest/guides/access-control/authn/mnesia.html)
4. Publish a retained, versioned desired configuration only after identity and authorization exist.
5. On first connection, require successful CONNACK and SUBACKs, consume config, validate/apply it, then publish versioned config acknowledgement.
6. Admit normal telemetry only after the gateway reaches the required lifecycle state. Keep discovery/quarantine traffic isolated if it is supported.
7. Exercise failure paths before rollout: duplicate QoS 1 delivery, stale retained config, wrong credentials, cross-tenant topics, client-ID collision, expired session, queue overflow, broker/node restart, and offline/online flapping.
8. Back up and reconcile dynamic EMQX configuration. EMQX separates static startup configuration from runtime cluster configuration; `base.hocon` is available only from 5.8.4. [EMQX configuration files](https://docs.emqx.com/en/emqx/latest/guides/configuration/configuration.html)

## Project-specific decisions

- Keep the current exact topic spelling `dataAcept` for compatibility; correct spelling would require a versioned migration.
- Use either the broad telemetry wildcard or per-gateway subscriptions in one backend client, not both.
- Continue publishing `dataAcept` only after the database transaction commits, and make duplicate responses deterministic.
- Make config retained and versioned; keep config acknowledgement and telemetry acceptance as distinct non-retained events.
- Replace unrestricted discovery with a restricted bootstrap/quarantine flow before production.
- Explicitly set Clean Start/Clean Session and session expiry rather than relying on client-library defaults; validate SUBACK and CONNACK Session Present.

## Normative protocol sources

- [OASIS MQTT Version 5.0 specification](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html)
- [OASIS MQTT Version 3.1.1 specification](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/mqtt-v3.1.1.html)
