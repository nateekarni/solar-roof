# Payment Confirmation, Reusable Asset Identity, and QR Experience Design

## Status

Approved in conversation on 2026-10-28. Awaiting review of this written specification before implementation planning.

## Goal

Improve three connected operational flows without destroying financial or telemetry history:

1. Staff approve submitted transfer evidence through a confirmation dialog rather than an editable verification form, and receipt issuance happens automatically.
2. Sites and gateways can be removed from active use through a safe soft-delete lifecycle. A later site, gateway, or device may reuse the same human-facing codes and serials while receiving new internal identities and a fresh telemetry baseline.
3. The customer payment screen presents a large, usable PromptPay-style QR card, a reliable save action, and an inline account-number copy action.

## Existing context and superseded decisions

This design extends the existing payment, receipt, MQTT onboarding, telemetry discovery, billing-source, and gateway-installation models. It does not replace their immutable history or audit requirements.

The following earlier decisions are superseded only where stated here:

- `docs/superpowers/specs/2026-10-19-customer-payment-cash-qr-document-v9-design.md` exposed full-payment and other-amount tabs to customers. The customer flow now submits the full outstanding amount only. Partial-payment domain support remains intact for existing data, staff settlement paths, and future product use.
- `docs/superpowers/specs/2026-10-21-telemetry-first-gateway-discovery-design.md` prevented a serial bound to a retired gateway from returning to anonymous discovery. A retired identity may now return to discovery only after decommissioning has revoked credentials and confirmed termination of the old broker session. It creates a new internal gateway/device generation and never reactivates the retired rows.
- Existing financial-document artifacts, approved payments, receipts, telemetry, configuration revisions, discovery evidence, and audit events remain immutable.

## Product decisions

- Never rename or rewrite a retired site's, gateway's, or device's historical name, external code, serial, or UUID merely to free a unique value.
- Every re-created site, gateway, device, billing meter, and billing-source binding receives a new UUID.
- Human-facing names, site codes, gateway codes, gateway serials, device codes, and device serials may be reused only when no active or decommissioning generation reserves them.
- Soft deletion removes records from active operation and active views; it does not physically delete business, financial, telemetry, or audit history.
- Removing a site decommissions its active gateway and operational descendants as one user operation. The user is not required to remove the gateway first.
- Customer transfer submissions must equal the full locked outstanding balance. The database and settlement domain continue to support partial payments.
- Staff approval confirms the submitted facts. Staff do not edit the transfer amount or transfer time in the approval UI.
- Approval and receipt issuance are one atomic business operation.
- The payment QR is visually primary, amount-specific when PromptPay configuration is valid, and saveable.

## Non-goals

- Restoring a retired site or gateway row to active state.
- Physically deleting historical telemetry or financial records.
- Renumbering existing documents or rewriting saved PDF artifacts.
- Exposing customer partial-payment controls in this release.
- Automatically verifying a bank transfer with an external bank API.
- Merging cumulative counters from different gateway/device generations.
- Treating a broker disconnect alone as evidence that a replacement gateway is correctly configured.

## Asset identity model

### Stable history and active generations

The existing internal UUID remains the identity of one persisted generation. Reusing a human-facing identifier creates a new generation:

```text
Gateway generation A
  id = uuid-A
  external_gateway_id = GW-001
  gateway_serial = SERIAL-001
  retired_at = 2026-10-28T10:00:00+07:00

Gateway generation B
  id = uuid-B
  external_gateway_id = GW-001
  gateway_serial = SERIAL-001
  retired_at = null
```

Generation B is not a continuation of generation A. Its devices, configuration revisions, credentials, dashboard-source choices, billing meters, billing-source bindings, and telemetry admission bindings are new records. `gateway_installation_history` links each gateway generation to its installation interval and may link an intentional replacement through `replaced_by_gateway_id`.

The UI may display a derived historical label such as `GW-001 · removed 28 Oct 2026`, but it must not persist that label by mutating the original code or name.

### Lifecycle fields

Add lifecycle timestamps where the current model lacks an unambiguous retirement boundary:

- `sites.retired_at timestamptz null`
- `gateways.decommission_started_at timestamptz null`
- `devices.retired_at timestamptz null`

`gateways.retired_at` remains the final gateway retirement boundary. Existing `sites.status='archived'`, `gateways.lifecycle_state='disabled'`, and offline statuses remain presentation/operational state, while timestamps are the canonical lifecycle boundaries.

Gateway lifecycle invariants are:

```text
active/configuring:
  decommission_started_at is null
  retired_at is null

disconnecting:
  decommission_started_at is not null
  retired_at is null
  mqtt_access_suspended = true
  lifecycle_state = disabled

retired:
  decommission_started_at is not null
  retired_at is not null
  mqtt_access_suspended = true
  lifecycle_state = disabled
```

A disconnecting gateway is hidden from ordinary connected/active views but continues to reserve all reusable identifiers until broker-session termination succeeds.

### Active-only uniqueness

Replace all-history uniqueness with active-generation uniqueness. Migration preflight must identify conflicting active data before changing constraints.

The steady-state database rules include:

```sql
CREATE UNIQUE INDEX sites_external_site_id_active_unique
  ON sites(external_site_id)
  WHERE external_site_id IS NOT NULL AND retired_at IS NULL;

CREATE UNIQUE INDEX gateways_name_active_unique
  ON gateways(name)
  WHERE retired_at IS NULL;

CREATE UNIQUE INDEX gateways_external_pair_active_unique
  ON gateways(site_id, external_gateway_id)
  WHERE external_gateway_id IS NOT NULL AND retired_at IS NULL;

CREATE UNIQUE INDEX gateways_gateway_serial_active_unique
  ON gateways(gateway_serial)
  WHERE gateway_serial IS NOT NULL AND retired_at IS NULL;

CREATE UNIQUE INDEX devices_serial_number_active_unique
  ON devices(serial_number)
  WHERE retired_at IS NULL;
```

The migration drops the corresponding legacy all-history unique constraints/indexes only after the new columns are backfilled and active conflicts are proven absent. Existing uniqueness scope that is stricter in application logic, including MQTT username ambiguity, remains strict among active and disconnecting rows.

`reserveGatewayIdentity` continues to take a transaction advisory lock for an identity, but conflicts only with gateway generations whose `retired_at IS NULL`. This deliberately includes disconnecting gateways. The same lock serializes final retirement and creation of a replacement generation.

The active credential username index remains unchanged. Final retirement revokes the old active credential before a replacement can issue the same username.

### Discovery identity reuse

Discovery records are historical evidence, not the active gateway identity. A previously assigned discovery row must not block a new unassigned candidate after its gateway is retired.

- Serial-bearing candidate uniqueness remains broker + serial + `status='unassigned'`.
- Legacy no-serial candidate uniqueness becomes broker + claimed gateway ID + `status='unassigned'`.
- Registration and telemetry-first discovery queries select only unassigned rows when refreshing a candidate.
- An assigned/configuring/ignored historical candidate remains queryable for audit but is never updated into the new candidate.
- Confirmation still uses `discoveryRevision` optimistic concurrency and the same advisory identity lock used by every gateway-creation path.

Anonymous rediscovery of a retired serial/code is admitted only after final retirement. A disconnecting generation still blocks rediscovery and replacement confirmation.

## Safe decommissioning

### Gateway removal

`DELETE /v1/gateways/:id` becomes an idempotent decommission command with two durable phases.

Phase 1, inside a database transaction:

1. Lock the site and active gateway in the established site-before-gateway order.
2. If already retired, return the existing retired result.
3. Set `decommission_started_at`, `mqtt_access_suspended=true`, `lifecycle_state='disabled'`, and operational status offline.
4. Revoke every active `gateway_mqtt_credentials` row.
5. Prevent configuration publication, proposal approval, telemetry admission, and new device/billing mutations for the disconnecting gateway.
6. Write one audit event recording the start of decommissioning.

After phase 1 commits, terminate the broker session through `GatewaySessionRevoker`. The client identity is the gateway serial when present, otherwise the external gateway ID. Local/demo ingestion refreshes its subscriptions as well. A failure returns a recoverable service-unavailable result while leaving the gateway safely suspended and its identifiers reserved. Retrying the same command resumes termination rather than repeating the first-phase effects.

Phase 2, after termination is confirmed, runs in a second database transaction:

1. Re-lock the site and gateway and verify it is still the same disconnecting generation.
2. Set `gateways.retired_at` and close the open `gateway_installation_history.removed_at` interval.
3. Set every child device `status='offline'` and assign `devices.retired_at`; active queries use `retired_at`, not the display status, as the lifecycle guard.
4. Set related `billing_meters.active=false`.
5. Set `retired_at` on active operational selectors such as `gateway_dashboard_sources` (adding the lifecycle column where absent); immutable readings and binding history remain untouched.
6. Mark pending configuration proposals stale/cancelled where their state model permits it; immutable revisions and status events remain.
7. Complete the decommission audit event or add one final event with the retired timestamp and preserved-history flag.

Only phase 2 releases active-only uniqueness.

### Site removal

`DELETE /v1/sites/:id` is one user command and no longer rejects the request merely because an active gateway exists.

1. Lock the active site.
2. Start or resume decommissioning of its active gateway, if any.
3. Confirm broker-session termination using the gateway flow.
4. In the final transaction, retire the gateway and devices, deactivate billing meters and operational bindings, set `revoked_at` on every active site-account assignment, set `sites.status='archived'`, and set `sites.retired_at`.
5. Preserve contracts, billing cycles, documents, receipts, payments, telemetry, installation history, and audit events.

If broker termination fails, the site remains in a visible `removal pending` state for authorized administrators, is unavailable for new operational writes, and continues to reserve its site code. A retry resumes the command.

A site with no active gateway can complete retirement in one transaction. A subsequent site created with the same external site code receives a new site UUID and has no implicit relationship to the retired site's operational or financial state.

### Authorization and API responses

Existing role/capability boundaries remain in force; this work does not broaden who can remove sites or gateways. Server-side authorization is re-evaluated on every retry.

Responses distinguish these states without exposing broker credentials:

```text
200 retired       removal is complete; history is preserved
404 not found     the caller cannot address this asset in scope
409 conflict      a concurrent lifecycle or replacement operation changed the generation
503 unavailable   broker termination could not be confirmed; retry is safe
```

The command attempts termination synchronously on every call. A `503` response includes a stable non-secret error code indicating that the persisted state is disconnecting; the next call resumes from that state. The exact response contract is shared by the gateway and site removal dialogs so both can render progress and recovery consistently.

## Telemetry and counter separation

### Admission boundary

Production telemetry must resolve to the active gateway generation and its active configuration/device binding. Resolution includes internal gateway ID, device ID, configuration version/hash, broker scope, and the approved alias/serial checks already required by ingestion.

Retired and disconnecting generations cannot ingest production telemetry or receive `dataAcept`. A replacement generation using the same topic aliases does not become active until its own configuration is approved and applied.

### Fresh baseline

The first valid cumulative reading for a new device/binding generation establishes its baseline. It contributes zero incremental energy until a later valid reading exists. The raw cumulative value is never treated as energy produced or consumed since the retired generation.

Operational read models use active generation IDs. Historical read models use installation intervals and calculate differences within each generation before combining display totals. They must never subtract a reading from generation A from a reading in generation B.

If a reporting day spans a generation cutover, each generation is evaluated only within its own observed interval. An interval with insufficient boundaries is shown as partial/missing rather than inventing continuity.

### Billing behavior at cutover

New billing meters and billing-source bindings point to the new device UUID and therefore cannot select telemetry from a retired device. Existing invoices and meter snapshots remain unchanged.

A billing period that crosses a source-generation cutover is not silently calculated from one old opening and one new closing. Until an explicit segmented-source billing workflow is introduced, calculation stops with a recoverable continuity-review error. A period wholly covered by the new binding uses the new generation's own opening and closing boundaries.

## Removal user experience

Gateway and site removal use destructive confirmation dialogs that state:

- the connection will be stopped;
- the item disappears from active operation;
- historical telemetry and financial records are preserved;
- reusing the same code later creates a new data generation and does not continue counters.

The site dialog also lists the active gateway/device count that will be decommissioned. It does not instruct the user to remove the gateway first.

While termination is running, the dialog disables duplicate submission and shows the current stage. A termination failure keeps the dialog actionable with a retry. Completion refreshes active site/gateway queries and does not remove historical routes already open in another tab.

## Customer payment policy

### Preserve partial-payment domain support

The following remain supported and tested in the domain/database:

- multiple payments per billing cycle;
- `partially_paid` billing status;
- installment receipt numbering and `payments.receipt_document_id`;
- staff cash settlement for a positive amount not exceeding the outstanding balance;
- approval of valid historical pending partial-transfer evidence.

No migration removes partial-payment rows, constraints, receipt relations, or status values.

### Customer full-payment boundary

The customer payment screen removes the amount tabs and every editable amount input. It displays one read-only full outstanding amount.

Customer submission revalidates the amount on the server after locking the billing cycle and payments. The submitted amount must equal the current outstanding balance. A stale page receives a recoverable latest-balance error and must refresh before resubmission. This rule applies to customer-originated transfer submissions, not to the reusable settlement domain itself.

The customer flow continues to require transfer evidence and a valid transfer date no later than today in `Asia/Bangkok`. Cash remains staff-only.

## Staff evidence confirmation and automatic receipt

### Review UI

The review workspace continues to show the invoice/billing statement, evidence image or PDF, submitted amount, submitted transfer date, submitter, and optional note. Approval contains no editable amount, date, reference, payer, bank, or account fields.

Selecting approve opens a compact confirmation dialog containing:

- invoice/billing identifier;
- submitted amount;
- submitted transfer date;
- a statement that confirmation records the submitted facts and automatically issues a receipt.

The primary action is `ยืนยันว่าหลักฐานถูกต้อง`. Rejection remains a separate dialog and requires a reason. Rejecting never issues a receipt.

### Approval transaction

Approval delegates to the settlement application service and executes atomically:

1. Lock the billing cycle and all relevant payment rows.
2. Resolve the selected payment and verify it remains `pending_verification`.
3. Copy the immutable submitted amount/date into verified fields; do not accept editable approval facts from the client.
4. Validate the amount against the locked outstanding balance. Historical partial evidence may produce `partially_paid`; current customer submissions normally settle the full balance.
5. Mark the payment paid and update the billing-cycle status.
6. Allocate the receipt number and create the receipt document/snapshot/artifact.
7. Set `payments.receipt_document_id`.
8. Enqueue financial delivery/notification outbox work and write the audit event.

Failure in steps 1-8 rolls back the payment approval and receipt. Notification delivery after commit remains retryable through the outbox and does not roll back a completed settlement.

### Idempotency

A retry for the same already-approved payment returns its linked receipt and current settlement result. It does not allocate another document number or artifact. Approval of a different payment after the cycle is fully settled remains a conflict. Rejection of an already-reviewed payment remains a conflict.

The approval request identifies the payment and decision only. Submitted financial facts are server-owned.

## PromptPay and bank presentation

### Visual hierarchy

Replace the current narrow side-by-side QR treatment with a vertically composed payment card:

1. Short heading such as `สแกนเพื่อชำระเงิน` and the active transfer channel.
2. A centered white QR surface with an image width of approximately 280-320 px, constrained to the available viewport width.
3. The full outstanding amount as the most prominent text below the QR.
4. Account name followed by PromptPay ID or bank name, branch, and account number.
5. A visible labelled save action with a download icon.

The QR remains square, uses `object-contain`, preserves a quiet white margin, and stays on a white surface in dark mode. Desktop centers the card without shrinking the QR. Mobile uses one column and remains usable at a 320 px viewport without horizontal overflow.

### QR source and fallback

When a valid PromptPay identifier and current full amount exist, generate the EMVCo payload locally and render a 512 px PNG data URL. Do not call an external QR service.

The amount-specific generated QR takes priority over a configured uploaded QR. If generation fails or PromptPay is unavailable, a validated configured QR may appear as a fallback with text stating that it does not contain the amount and the customer must verify the transfer amount. Bank details remain available even when no QR can be rendered.

All existing image-size, format, origin, object-URL ownership, and cleanup protections remain.

### Save action

The save action is visible text plus a download icon, not an unexplained icon-only control. It saves the exact displayed QR using a meaningful filename such as `solar-roof-payment-<billing-id>.png` after sanitizing the identifier. When direct download is not supported, the fallback opens the validated image in a form the user can save manually. Failure shows an inline recoverable message and does not clear the payment draft.

### Account copy action

The account-number copy action is an icon-only semantic button inline with the account number:

- no visible border, background, or layout padding;
- the icon remains visually compact and baseline-aligned;
- an invisible pseudo-element expands the hit target without changing line layout;
- a visible focus ring appears for keyboard users;
- accessible name/title changes from `คัดลอกเลขบัญชี` to `คัดลอกแล้ว`;
- successful copy temporarily replaces the copy icon with a check icon and announces the result through a polite live region;
- failure keeps the copy icon and shows an inline recovery message.

## Error handling and concurrency

- Creation and retirement of the same identity serialize on the same advisory key and database unique indexes remain the final guard.
- A concurrent creation cannot reuse identifiers while a gateway is disconnecting.
- A repeated removal command resumes from persisted state and never duplicates credential revocation, retirement timestamps, or audit effects.
- A failed broker kick leaves access suspended and identifiers reserved.
- A failed final retirement transaction leaves a safely suspended command that can be retried.
- A stale customer balance preserves the evidence draft and presents the latest outstanding amount.
- A failed approval/receipt transaction leaves the payment pending and keeps the confirmation dialog open with a recoverable message.
- A receipt retry returns the existing linked receipt when the original transaction committed but the HTTP response was lost.
- QR generation, copy, or download failures do not block bank-transfer evidence submission when valid bank instructions remain.

## Component and service boundaries

Keep the implementation in focused units rather than expanding the already-large asset controller:

- Asset lifecycle service: gateway/site decommission state transitions, identifier locks, descendant retirement, and audit payloads.
- Broker termination adapter: session termination only; it does not decide business lifecycle state.
- Gateway identity reservation: shared active-generation conflict and advisory-lock behavior for legacy creation, replacement, and managed onboarding.
- Telemetry generation boundary: active binding resolution and per-generation counter derivation.
- Payment settlement service: balance, payment transition, receipt issuance, idempotent replay, and audit/outbox writes.
- Customer payment policy: full-outstanding submission rule without deleting the reusable partial settlement model.
- Payment instructions component: QR resolution/rendering, visual payment card, save action, and inline copy feedback.

Web changes continue to use existing shadcn/Radix components and design tokens. Dialog focus trapping, visible focus, semantic buttons, screen-reader names, live feedback, and responsive behavior are required.

## Migration and rollout

### Migration order

1. Add lifecycle timestamp columns and backfill archived/retired state conservatively from existing timestamps.
2. Preflight for conflicting active identifiers and abort with actionable identities if conflicts exist.
3. Add active-only unique indexes.
4. Drop legacy all-history constraints/indexes after the new indexes succeed.
5. Update discovery uniqueness for unassigned candidates.
6. Deploy API/worker lifecycle, telemetry, settlement, and query changes.
7. Deploy the web dialogs and payment/QR presentation.
8. Run operational verification with a disposable gateway identity before enabling removal in production.

During a rolling deployment, old application instances must remain unable to create duplicate active rows. Database indexes provide this safety. Removal actions remain feature-gated until all API instances understand the new lifecycle timestamps and disconnecting state.

### Existing archived data

Existing archived sites receive a retirement timestamp derived from their last persisted update when available. Existing gateways with `retired_at` keep that timestamp and receive `decommission_started_at=retired_at`. Devices below retired gateways receive the gateway retirement time. No historical identifiers are rewritten.

## Verification strategy

### Database and identity

- Migration test proves active duplicates fail while a value used only by retired rows succeeds.
- Coverage includes site external code, gateway name/code/serial, device serial, and active credential username.
- Migration preflight rejects two active rows before dropping any legacy guard.
- New rows use new UUIDs even when every human-facing identifier matches a retired generation.

### Lifecycle and MQTT

- Unit tests cover active -> disconnecting -> retired transitions, retries at every stage, and idempotent audit effects.
- Integration tests prove credential revocation and ingestion denial happen before identifier release.
- Broker-adapter tests cover successful kick, absent session, unavailable management API, wrong broker mapping, and sanitized errors.
- A real EMQX test proves an old session cannot publish accepted telemetry after retirement and before/after recreation with the same identity.
- Site removal tests prove cascade retirement, preserved financial/telemetry rows, and rollback/retry behavior.

### Telemetry and billing

- Recreate one gateway and its devices with the same codes/serials and assert that production samples resolve only to the new UUIDs.
- The first new cumulative reading establishes a baseline and produces no increment by itself.
- Current dashboard sources exclude retired operational selectors.
- Historical calculation never subtracts counters across generation IDs.
- Billing calculation rejects a period that crosses source generations without reviewed segmentation and accepts a period wholly covered by the new binding.

### Payment and receipt

- Customer component and API tests prove no amount tabs/input exist and stale or partial customer submissions are rejected without losing the draft.
- Domain tests retain full and partial settlement, `partially_paid`, installment receipt, and staff cash coverage.
- Approval UI tests prove no editable financial fields exist in the confirmation dialog.
- Integration tests cover full approval, historical partial approval, rejection, automatic receipt linkage, transaction rollback, same-payment replay, and different-payment settled conflict.

### QR and accessibility

- Component tests assert the large vertical QR card, full amount, account details, visible save action, and compact inline copy icon.
- Browser tests cover generated QR, configured fallback, failed generation, download, download fallback, clipboard success/failure, and object-URL cleanup.
- Responsive tests cover 320, 640, 768, and 1024 px widths without QR shrinkage below the safe available size or horizontal overflow.
- Keyboard tests cover focus order, visible focus, dialog return focus, and icon-button activation.
- Screen-reader assertions cover QR alternative text, copy state, save action, fallback warning, and error live regions.
- Dark-mode verification confirms a white QR quiet zone and readable surrounding text.

## Acceptance criteria

- Removing a gateway stops its connection, revokes credentials, retains history, and eventually releases its active identifiers.
- Removing a site decommissions its active gateway and descendants without requiring a separate gateway-removal step.
- The same site code, gateway name/code/serial, and device serial can be used by new rows after final retirement, while active duplicates remain impossible.
- A recreated gateway/device uses new UUIDs and never continues cumulative arithmetic from the retired generation.
- Old financial documents, telemetry, configuration, discovery, and audit records remain addressable and unchanged.
- Customers see no partial-payment tab or editable payment amount and can submit only the full current outstanding balance.
- Partial-payment data structures and staff/domain behavior remain covered and usable for future product exposure.
- Staff approve evidence through a confirmation dialog with no editable financial facts, and a successful approval automatically returns the linked receipt.
- Approval and receipt issuance are atomic and safe to retry.
- The payment QR is large, centered, amount-specific when possible, and saveable; bank details remain usable without QR.
- The account copy action is a compact borderless inline icon with accessible feedback.
