# Customer payment, cash settlement, PromptPay QR, and document v9

## Status

Approved in conversation on 2026-10-19. Awaiting final review of this written specification before implementation planning.

## Intent

Finish the customer payment experience without pretending the system can observe an offline cash handover. Customers pay by transfer and submit evidence. Owner and accountant users record cash received through a separate staff-only action. Both paths settle the same billing balance through one transactional domain service, while reminder delivery revalidates the latest balance and evidence state.

This change also consolidates payment progress into the financial-record header, generates amount-specific PromptPay QR codes, fixes the payment date picker state, and introduces immutable financial-document template `sarabun-a4-v9`.

## Approved product decisions

- Customer users can submit bank transfers only. Cash is not exposed in the customer portal.
- Customer transfer submission always requires evidence.
- `payment_method` describes the settlement method: `bank_transfer` or `cash`.
- `transfer_channel` describes a bank transfer route: `bank_account` or `promptpay`; it is `null` for cash.
- Owner and accountant users can record full or partial cash payments from an outstanding financial record.
- Recording cash immediately settles the entered amount and issues a receipt in the same transaction.
- PromptPay QR is generated from the configured PromptPay identifier and the amount selected by the customer.
- Existing financial-document artifacts remain immutable. The current invoice receives a new revision rendered with template v9.
- A queued reminder is never trusted blindly; delivery must revalidate the current payment state.

## Non-goals

- Detecting physical cash automatically.
- Allowing customers to declare that they paid cash.
- Automatically verifying bank transfers from a bank or payment gateway.
- Replacing the existing document approval workflow.
- Rewriting or deleting existing v8 PDF artifacts.
- Combining multiple billing cycles into one settlement.

## Domain model and lifecycle

### Payment classification

The persisted payment classification becomes:

```text
payment_method: bank_transfer | cash
transfer_channel: bank_account | promptpay | null
```

`transfer_channel` must be non-null for `bank_transfer` and null for `cash`. Existing rows whose legacy `payment_method` is `promptpay` migrate to `payment_method=bank_transfer` and `transfer_channel=promptpay`. Existing `bank_transfer` rows migrate with `transfer_channel=bank_account` unless their persisted metadata identifies PromptPay.

### Transfer lifecycle

```text
awaiting_payment
  -> customer submits amount, date, evidence, and optional note
pending_verification
  -> owner/accountant approves
partially_paid | paid
```

Rejected evidence returns the billing cycle to an actionable customer state without losing the audit history of the rejected submission.

### Cash lifecycle

```text
awaiting_payment | partially_paid | overdue
  -> owner/accountant records cash amount, received date, and note
partially_paid | paid
```

Cash does not create a pending-verification state or require evidence. The cash endpoint rejects zero, negative, and overpayment amounts and rejects records with no outstanding balance.

### Shared settlement boundary

Transfer approval and cash receipt call one settlement application service. The service owns balance calculation, row locking, status transition, receipt issuance request, notification enqueueing, and audit data. Channel-specific handlers validate their input and then delegate to this service; they do not duplicate financial arithmetic.

## API and authorization

Add a staff-only endpoint equivalent to:

```http
POST /v1/billing-cycles/:id/cash-payment
Idempotency-Key: <client-generated-key>

{
  "amount": "10000.00",
  "receivedAt": "2026-10-19",
  "note": "รับที่สำนักงาน"
}
```

Only `owner` and `accountant` roles with the cash-recording capability may call it. The server derives actor identity and organization scope from authentication; callers cannot supply either value. A successful response includes the new balance, billing status, settlement identifier, and generated receipt reference.

The existing customer payment endpoint accepts `payment_method=bank_transfer` and an explicit `transfer_channel`, while the customer UI supplies the configured channel. It continues to require valid evidence, a payment date no later than today in `Asia/Bangkok`, and an amount no greater than the current outstanding balance.

## Transaction and concurrency rules

Cash settlement executes in one database transaction:

1. Lock the billing cycle and current balance.
2. Resolve or reject the idempotency key.
3. Validate the entered amount against the locked outstanding balance.
4. Insert the immutable cash payment event and audit metadata.
5. Apply the settlement and update billing status.
6. Create the receipt/revision records required by the existing approval and document rules.
7. Cancel queued customer reminders that are no longer eligible.
8. Enqueue the customer confirmation and internal audit events.

Any failure rolls back all eight effects. A repeated request with the same key and same payload returns the original result. Reuse of the same key with a different payload is rejected.

Corrections do not overwrite the original cash event. They use the existing adjustment or reversal pattern and retain a link to the corrected event.

## Customer payment experience

### Financial record header

Move payment progress into the main financial-record header. Desktop places a compact block on the right; mobile stacks it below the record metadata inside the same card. The block contains only:

- `ความคืบหน้าการชำระเงิน`
- `ชำระแล้ว <paid> / <total>`
- A capped-width progress bar with an accessible numeric label

Remove the separate payment-progress card.

### Payment panel

The customer does not choose between cash, bank, and PromptPay as payment methods. The panel presents one transfer flow:

1. Amount tabs: full outstanding balance or another amount.
2. A compact transfer-channel card containing bank account data and PromptPay QR.
3. Evidence uploader.
4. Transfer date and note.
5. Review and submit.

Desktop keeps the bank/QR card and transfer form compact enough to fit in the modal with minimal scrolling. Mobile uses the established full-screen payment panel and header. Date and note sit side by side on desktop and stack on mobile. The note label does not include the phrase “ไม่บังคับ”, although an empty note remains valid.

The uploader remains a single icon, label, and description target. Once a preview exists, a destructive-color delete icon appears at the preview's top-right.

### Date picker

The current selected date uses the Solar Gold selected treatment immediately on first open. The selected style wins over the separate “today” style. Future dates are disabled and visibly muted. Desktop uses a popover; mobile uses the existing sheet. The mobile calendar width follows the sheet content width.

## PromptPay QR

Generate an EMVCo Thai QR/PromptPay payload from the configured `promptpayId` and selected amount. The implementation must normalize and validate supported Thai mobile-number and national/tax identifier forms before producing a QR. It must calculate the CRC required by the Thai QR standard.

The QR is amount-specific:

- Full-payment tab uses the latest outstanding balance.
- Other-amount tab regenerates after a valid amount is entered.
- An invalid or empty amount shows guidance and no payable QR.

Render the payload as an image in the client or through a trusted local server utility; do not call a third-party QR service. The customer can save the QR image and copy the PromptPay identifier. An explicitly configured uploaded QR image may remain as a visual fallback when a valid PromptPay identifier is unavailable, but it must be labelled as not amount-specific.

QR generation does not confirm settlement. The panel continues to state that evidence is reviewed by staff.

## Staff cash experience

Outstanding document cards for owner/accountant users show `รับชำระเงินสด` when status is awaiting payment, overdue, or partially paid and the balance is positive. The action opens a short form with:

- Amount, defaulting to the full outstanding balance and allowing a smaller positive amount.
- Date received, defaulting to today in `Asia/Bangkok`.
- Note.

After success, the UI refreshes the record, shows the new balance and receipt number, and offers the receipt preview. It also makes clear that the customer confirmation was queued. If the server reports a concurrent settlement, the form refreshes the latest balance rather than submitting the stale amount again.

## Reminder safety and operations

The reminder worker re-reads the billing cycle immediately before delivery. It suppresses a reminder when the record is paid, cancelled, has no outstanding balance, or has transfer evidence pending verification. Partial-payment reminders use the latest remaining balance.

One day before a customer reminder is eligible, owner/accountant users receive an internal pre-reminder containing the outstanding records and a direct cash-recording action. Recording cash cancels any queued reminder rendered ineligible by the new balance. This reduces forgotten staff recording but does not claim that the system can detect an unrecorded physical payment.

A daily staff view lists cash payments recorded that day with amount, customer, billing cycle, receipt, recorder, received date, and recorded timestamp.

## Audit and notifications

Cash audit data includes actor, role, organization, billing cycle, amount, received date, recorded timestamp, note, idempotency key, resulting balance, and receipt reference. Transfer records retain their evidence and transfer-channel metadata.

Customer confirmation is enqueued only after the settlement transaction succeeds. Notification wording states that the payment was recorded and includes amount, remaining balance, and receipt reference. Failure to deliver a notification does not roll back an otherwise successful settlement; the outbox retries delivery.

## Financial document template v9

Introduce `sarabun-a4-v9`. Renderer changes must not continue under the v8 identifier.

V9 requirements:

- Use the neutral `border` token for all table edges and separators.
- Use Solar Gold only for the table's topmost rule.
- Expand line-item rows and table area to use the printable A4 region without distorting populated rows.
- Remove visible `SYNTHETIC LOCAL TEST` text while retaining non-visible test/audit metadata.
- Render exactly one signature block.
- Use `ผู้ออกใบวางบิล` for invoices/billing notes.
- Use `ผู้รับเงิน` for receipts and tax invoices.
- Show signature, signer name, title, and date only for that one role.

Existing v8 artifacts remain downloadable and unchanged. `INV261000001` receives revision 2 through the normal document approval flow. Only after revision 2 is approved does it become the current revision.

A template-version guard test must fail when renderer fixtures change without an intentional template-version change.

## Migration and compatibility

The database migration:

1. Adds `transfer_channel` with a nullable transitional state.
2. Backfills existing bank transfer and PromptPay rows.
3. Updates the `payment_method` constraint to `bank_transfer | cash`.
4. Adds the cross-column consistency constraint.
5. Adds idempotency and audit fields/indexes required by cash settlement.
6. Makes the steady-state constraints effective only after backfill validation succeeds.

API readers remain tolerant of legacy records during deployment. Rollout order is migration, API and workers, web application, then v9 document revision creation.

## Error handling

- Invalid PromptPay configuration prevents generated QR display and falls back to clear bank-transfer instructions; it does not block evidence submission.
- QR rendering failure shows bank account details and a retry action.
- Evidence upload failure preserves entered amount, date, and note.
- Receipt generation failure rolls back a cash settlement.
- Notification delivery failure remains in the outbox for retry.
- A stale balance or duplicate cash submission returns a specific recoverable error and the latest balance.
- V9 revision generation failure leaves the approved v8 document current.

## Verification

### Domain and API

- Migration tests cover every legacy payment classification and constraint.
- Integration tests cover full and partial transfer approval, full and partial cash settlement, overpayment, authorization, idempotent replay, key conflict, row-lock concurrency, and rollback on receipt failure.
- Reminder tests cover paid, cancelled, pending-evidence, partial, and concurrently settled records.

### PromptPay

- Payload tests use known fixtures for normalized Thai mobile and national/tax identifiers.
- Tests verify amount encoding, CRC, invalid identifiers, invalid amounts, and no external network dependency.
- UI tests confirm QR regeneration when the selected amount changes and image download behavior.

### Web UI

- Component tests cover the integrated progress header, transfer-only customer flow, uploader preview deletion, date-picker selected/today precedence, future-date disabling, staff cash form, and stale-balance recovery.
- Browser tests cover desktop modal and mobile full-screen/sheet behavior, keyboard focus, accessible names, and responsive layout.

### Documents and regression

- PDF/layout snapshots cover invoice, receipt, and tax-invoice v9 variants.
- Assertions cover neutral table borders, gold top rule, printable-area expansion, absence of the synthetic banner, and exactly one correctly labelled signature block.
- Regression tests confirm the saved v8 artifact remains byte-addressable and unchanged.
- Smoke tests use customer and owner/accountant accounts after deployment, then create and approve invoice revision 2.

## Acceptance criteria

- A customer can complete a bank-transfer evidence submission without seeing a cash option.
- A customer can generate and save an amount-specific PromptPay QR from configured data.
- An owner/accountant can record full or partial cash once without duplicate settlement.
- The balance, status, receipt, reminder eligibility, audit trail, and customer confirmation agree after settlement.
- The first-open date picker shows the selected current date in Solar Gold and future dates as disabled muted values.
- Payment progress appears in the main record card on desktop and mobile.
- V9 documents satisfy the approved table and signature layout while v8 remains immutable.

## V10 invoice-signature follow-up

The approved invoice footer no longer represents a staff profile identity. Template `sarabun-a4-v10` renders two equal neutral signature columns: `ผู้วางบิล` and `ผู้รับใบวางบิล`, each with an empty signature line and an empty date line. It must not render the approver display name, profile position, saved signature image, or approval timestamp in either column. Approver identity remains frozen in the document snapshot and audit trail for authorization evidence. Receipt and contract signature layouts remain unchanged. Existing v8 and v9 artifacts remain immutable and downloadable; the local review fixture creates v10 as the next linked revision through normal approval.

### V11 billing-receiver terminology follow-up

Template `sarabun-a4-v11` keeps the same paired blank signature layout while changing the customer-side role to the conventional Thai billing-form term `ผู้รับวางบิล`. The prior `ผู้รับใบวางบิล` wording must not appear in newly rendered invoices. Existing v8-v10 artifacts remain immutable and downloadable.
