# Site, Gateway and Device identity audit and proposed repair plan

Status: implemented and verified locally after user confirmation of Q1–Q5. No live database writes, backfill or deployment. The specific UUID `f249f3c5-5587-4cfd-aeb9-7b43fcdbad26` has not been mapped to `SITE-001` against live data.

## Identity boundaries established by the current code

| Context | Site / Gateway / Device identity |
| --- | --- |
| Database relationships, authorization, resource URLs, historical telemetry | Internal UUID |
| Standard `solar/v1/...` MQTT topic, telemetry envelope and ACK | Registered external code |
| Legacy `energy/...` ingestion | Device UUID/serial; optional site/gateway UUID; gateway name participates in topic routing |
| User-facing labels in the provisioning modal | External code, despite generic “ID” labels |

Both identifiers can belong to the same record. An internal UUID in a resource URL is expected; substituting it for a registered external code in standard MQTT is incorrect. Existing glossary definitions describe device-facing codes but do not distinguish internal references.

## Findings and affected surfaces

1. Site collection/detail projections omit external codes (`apps/api/src/modules/assets/assets.controller.ts:199–267`; `apps/api/src/modules/dashboard/operations.service.ts:24–35`). Shared dashboard contracts also omit them (`packages/api-contracts/src/index.ts:34`). Clients cannot consistently display or search registered codes from these responses.
2. Payload config uses `siteId`/`gatewayId` for internal UUIDs; generated wire fixtures use those same property names for external codes (`assets.controller.ts:853–866`). Separate API and wire types are required, preserving wire compatibility.
3. Standard ingestion correctly resolves external codes and validates exact topic/envelope agreement (`payload-ingestion.ts:51`; `payload-profile.ts:68`). Legacy ingestion expects internal IDs (`mqtt-ingestion.service.ts:249–253`); examples must name the protocol explicitly.
4. Unmapped-field results expose `payload_messages.device_id` as Device ID, leaking a UUID into an operational device-code column (`assets.controller.ts:862`; `apps/web/features/sites/payload-connection-card.tsx:32`). Project the device code and keep UUID only for navigation/reference.
5. Codes are stored only for payload-profile provisioning (`assets.controller.ts:389,395,405`). Legacy rows intentionally have null external codes. Ordinary PATCH cannot edit codes (`475–493`), and adding a standard device cannot convert a legacy gateway (`771`). Never silently generate a code and switch an existing ingestion protocol.
6. Gateway names still affect legacy topics and configuration commands (`assets.controller.ts:916,959–968`; `mqtt-ingestion.service.ts:322–328`). Count-based default names can collide after deletion/concurrent creation (`assets.controller.ts:345–348`). Display-name changes and protocol-identity changes need distinct operations.
7. Site codes are globally unique; gateway codes are scoped to site; device codes are scoped to gateway. Existing uniqueness is case-sensitive, with nullable legacy codes and ASCII grammar (`infra/migrations/024_payload_profiles.sql:6–12`). Clarify case, archived-code reuse and code allocation before changing constraints.
8. Gateway topic validation runs on gateway writes; changing the site external code directly can leave its subscriptions stale (`infra/migrations/027_payload_subscription.sql:9`). Any commissioned-code change needs coordinated transaction, provisioning, ACL/subscription changes and a replay/retirement policy.
9. Stale ingestion scripts contain synthetic/mismatched IDs and topics (`apps/api/src/scripts/test-gateway-ingestion.ts:49`; root `test_gateway_ingestion.ts`; `simulate-mqtt.ts:89–94`). Replace examples with identifiers read from an explicitly selected registered record.
10. Prisma schema is behind SQL migrations; confirm its active consumers before updating it (`apps/api/prisma/schema.prisma:63`). Treat SQL migrations as the current runtime schema source.
11. `SITE-001` is also an input placeholder, independent of the saved value (`site-edit-dialog.tsx:306`; `site-form-dialog.tsx:346`). Seeing it in an empty field does not prove a code was registered. Verify actual value before diagnosing a UUID/code mismatch.
12. CSV exports include every nonprimary row key, exposing gateway/site UUIDs without operational codes (`operations.controller.ts:6`). Site search covers names only (`operation-query.ts:9`); dashboard selector searches name/UUID (`site-filter.tsx:28`). Use explicit export projections and include external-code search.
13. Configuration details expose source aliases without canonical site/gateway codes (`site-configuration-details.tsx:43`). Show both registered and source codes with distinct labels. Handover currently shows names/serials without a UUID leak; audit identifiers and job filenames are intentional internal references.

## Proposed implementation sequence

### 1. Resolve terminology and reproduce the reported record

- Confirm internal UUID remains stable; external site/gateway/device codes are the user-facing and standard device-facing identifiers.
- Locate the reported UUID with scoped read-only queries; compare registered codes, protocol, subscriptions, gateway/device assignments, and the exact screen/payload where UUID appeared. Do not assume two values match without this check.
- Inventory legacy/null-code records, duplicate/case variants, archived records and all consumers of the affected fields. No unapproved data writes.
- After confirmation, add precise glossary terms and an ADR for the compatibility/migration boundary.

### 2. API and contracts

- Add explicit external-code fields to site list/detail/dashboard, telemetry context and device diagnostics without changing existing UUID route/foreign-key fields.
- Share distinct types for database references, user-facing identities and standard wire identities; use unambiguous names in newly introduced contracts.
- Preserve existing `siteId`/`gatewayId`/`deviceId` semantics at compatibility boundaries; do not perform a global string replacement.
- Apply authorization to code-based lookups, search, exports and diagnostic projections just as to UUID-based lookup.

### 3. Frontend and operator outputs

- Use registered codes for labels, selection descriptions, operational details, telemetry diagnostics, copy actions and generated commissioning instructions. Preserve UUID as selected value/navigation parameter.
- Add explicit “internal reference” labels only where support/audit needs a UUID. Missing registered code must show a clear empty state, not fall back silently to UUID under a code label.
- Audit site/gateway/device configuration, dashboard/map/selectors, receipt/invoice/contract metadata, handover, jobs/history exports, alert/rejection/unmapped tables and all roles.
- Preserve immutable issued-document snapshots; new presentation must not regenerate signed/issued historical documents.

### 4. Protocol and data migration

- Keep standard MQTT external topic/envelope/ACK agreement and legacy routing contracts separate.
- Repair stale fixtures/scripts and config command identifiers without breaking existing hardware consumers.
- Decide whether legacy records require universal display codes or only codes when commissioned for standard MQTT. Backfill, if approved, must not change topics or hardware bindings implicitly.
- Default recommendation: lock codes after commissioning; a separate supervised migration handles corrections. If editing is approved, implement atomic identity/topic changes, old-message handling, device rollout and rollback first.
- Use collision-safe allocation if automatic codes are approved; retain UUIDs, billing mappings, replay keys, ownership scopes and historical references.

### 5. Verification and rollout

- Tests: code projections, same UUID/code record consistency, scoped lookup, duplicate/case rules, missing codes, concurrent creation, internal URL continuity and wrong topic/envelope rejection.
- Separate standard/legacy end-to-end MQTT cases; assert actual registered topic, payload identity, config command and ACK destinations.
- Browser checks across all roles: list/detail/edit/telemetry/copy/export use the same code; no UUID under an operational code label; selection still calls UUID APIs.
- Read-only rollout report first, then reviewed migration with backup/rollback if needed. Validate ingestion continuity and billing mappings after deployment.

## Confirmed decisions (2026-10-09)

- Show external asset codes to users; retain UUIDs internally and label support references explicitly.
- Missing codes must not silently display UUIDs or example placeholders as registered codes.
- Commissioned codes are locked in ordinary edit forms; coordinated migration handles corrections.
- User requests a short auto-generation placeholder for applicable code inputs: “เว้นว่างเพื่อสุ่มรหัสอัตโนมัติ”. This must be backed by actual server allocation, not only changed text. Read-only codes must not promise allocation, and tax IDs/serial numbers must not be generated.

## Confirmed allocation behavior (Q4–Q5)

- Scope: recommend blank automatic allocation for new customer, site, gateway and device codes; exclude tax IDs, manufacturer serials, existing locked codes and issued document numbers.
- Legacy initialization: recommend allocation for newly created records only; legacy missing codes require an explicit setup operation, preserving topics and protocol until coordinated commissioning.
- Preserve current exact case-sensitive protocol matching and uniqueness scopes. Avoid automatic uppercasing or changing existing codes.
- Generate short prefixed random codes on the server with database uniqueness and bounded collision retry, rather than count-based numbering. Preview/test uses the same resolved draft codes that final creation persists; never show a sample as an allocated value.
- Verify allocation under concurrent creation, retries, draft changes and rollback, plus generated topic/envelope/ACK consistency.

## Implementation ledger and verification

- Completed: API external-code projections and shared contracts; site-code search; explicit CSV projections with named internal references; all affected frontend displays/selectors/readonly edits and new-code placeholders; unmapped device names/codes; standard and legacy routing separation; server allocation and bounded conflicts; actual draft codes used by test/save; registered-identity legacy simulation scripts.
- Ruling: draft allocation is stateless, not a database reservation. The client submits the resolved codes unchanged; final uniqueness constraints remain authoritative. An intervening collision returns an actionable conflict rather than replacing a code already previewed.
- Ruling: existing explicitly confirmed customer master code edits remain supported; commissioned protocol asset codes remain locked. Blank customer updates never generate a new code.
- Ruling: Prisma has no runtime consumers in API source; SQL migrations remain authoritative and no unrelated schema regeneration is performed.
- Ruling: no existing-record backfill or new commissioning transition is implied. Legacy missing codes remain visibly unregistered until a separately coordinated commissioning operation.
- Review found and repaired a legacy-to-standard bypass in payload-import and reception settings. Both require a registered standard endpoint, not merely external code presence. Final review found no remaining actionable regression.
- Web complete suite: 242 tests passed, including TypeScript. API complete suite: 336 passed, 7 optional integrations skipped. API typecheck passed.
- Browser QA: actual site form resolved blank codes exactly once, displayed actual topics/codes, submitted the identical site/gateway/device codes on save; existing missing-code edit remained readonly and did not allocate; desktop/mobile checks passed without browser errors or dialog overflow. Temporary QA route/scripts removed; screenshots retained in `.superpowers/identity-*.png`.
- Live PostgreSQL collision/concurrency and real MQTT broker integration were not run for this change; existing service-level MQTT tests and simulated transactional allocation tests passed. No production state or immutable issued-document snapshots changed.
