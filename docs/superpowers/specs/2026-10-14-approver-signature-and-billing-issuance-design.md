# Approver Identity, Staff Position, and Billing Issuance Design

**Date:** 2026-10-14  
**Status:** Approved in chat  
**Scope:** Company settings, staff positions, personal signatures, finance readiness, billing statement approval, bulk approval, billing filters, invoice/receipt snapshots, and monthly billing automation

## Goal

Make financial documents identify the person who actually approves them, remove company-level signer configuration, and place a human approval boundary before a billing statement becomes an official numbered document.

The billing list must make this workflow obvious: users can find bills by plain-language status tabs, select several pending bills, approve them in one action, and understand partial failures without seeing UUIDs or other internal identifiers.

## Confirmed Product Decisions

- The Company / Legal Entity card contains only company identity, contact details, and the company logo used by the application and generated documents.
- Company-level signer name, signer title, and signature controls are removed from the Company screen and from new-document readiness.
- Each user may upload their own signature under My Account. A signature is optional.
- A newly issued billing statement snapshots the approving user's display name, company position, and optional signature.
- A receipt keeps its current payment-review workflow and snapshots the payment reviewer's display name, company position, and optional signature when the approved payments settle the bill.
- The existing staff position selector becomes a searchable, creatable Combobox. Selecting an existing position loads its permission preset. Typing a new position creates a new preset, but the editor still requires its detailed permissions to be configured before saving.
- Billing statements are prepared first and receive an official number, immutable PDF, approver identity, and delivery job only after explicit approval.
- The billing table supports page-scoped multi-selection. Bulk approval is processed independently per bill: ready bills succeed, failed bills remain pending, and the result names the period, customer, and site instead of internal IDs.
- Status dropdowns on the billing page are replaced by status tabs on a row below the search controls.
- Completed readiness items are hidden from the setup flow; only a compact progress summary and missing setup steps remain visible.

## Domain Model

### Company position

A **company position** is the human-readable job title assigned to an internal user, such as “กรรมการบริษัท” or “ผู้จัดการฝ่ายบัญชี”. The same position record is also a reusable permission preset.

The staff editor has one position field:

- choosing an existing result assigns that position and loads its preset rules;
- typing a non-matching value starts a new position preset with that exact normalized label;
- a new position cannot be saved until the detailed permission rules and scope in the editor are valid;
- after selection or creation, permissions can still be customized through the existing detailed controls;
- a position label is displayed on documents, while its internal ID is never shown to users.

The canonical company position assignment must be available for every internal user who can approve a financial document, including an Owner. Built-in platform role remains the authorization boundary and is not printed as a legal/business title.

### Personal signature

A **personal signature** is an optional, user-owned image stored on the user's profile. It is not company configuration and cannot be edited by another staff member through Company Settings.

The image follows the same bounded-image safety pattern as avatars and company branding: client preview plus authoritative API validation of declared MIME type, decoded bytes, file signature, and size. New writes accept the supported PNG/JPEG formats only. Removing the image affects future documents only.

### Billing draft and issued billing statement

A **billing draft** contains the calculated or manually entered financial facts needed for review. It is not yet an official customer document and has no official document number, immutable artifact, delivery outbox item, or approver snapshot.

**Awaiting issuance approval** (`pending_issue_approval`) is a distinct billing lifecycle state. It means the draft facts are ready for an authorized user to issue as a billing statement.

An **issued billing statement** is created atomically at approval time. Approval:

1. locks and revalidates the billing cycle;
2. verifies the approver's current access, company position, and active account;
3. rechecks financial readiness and that the draft has not become stale;
4. allocates the official document number;
5. snapshots company, customer, billing facts, recipients, bank accounts, logo, and approver identity;
6. renders and saves the immutable PDF artifact;
7. writes the audit event and delivery outbox item;
8. moves the billing cycle to the existing issued/unpaid state.

The optional signature is included when present. If it is absent, the PDF shows the signature line plus the saved approver name and position. Missing signature alone never blocks approval.

## Data Design and Compatibility

The next forward-only migration adds:

- a bounded nullable personal signature image on `users`;
- a canonical company-position assignment for internal users that can be resolved independently of domain-specific permission grants;
- `pending_issue_approval` support in the billing lifecycle;
- approval metadata sufficient to audit who issued each document, while the complete printable identity remains in the immutable document snapshot.

Existing `company_profile.signatory_name`, `signatory_title`, and `signature_data_uri` columns remain as deprecated compatibility data during this change. They are not returned as editable Company Settings fields, are excluded from the new readiness hash, and are not used for newly issued invoices or receipts. Historical saved snapshots and PDF bytes remain unchanged.

Existing employee grant rows are migrated to the canonical position assignment where unambiguous. Conflicts fail migration validation rather than silently selecting a title. Internal users capable of approval but lacking a position must receive one before approving a document.

Position creation and employee assignment occur in one transaction. Position names are trimmed, length-bounded, and unique under the same case-insensitive normalization used by Combobox search. If another user creates the same normalized position concurrently, the editor reloads that preset instead of producing a duplicate.

## Company Settings Experience

The Company / Legal Entity card displays:

- company logo preview;
- legal company name;
- tax identifier;
- branch;
- registered tax address;
- billing phone and email.

It does not display or edit signer name, signer title, or signature. A compact badge explains that the logo and company data are used on documents generated by the system, for example billing statements and receipts.

Edit mode keeps the logo uploader together with company fields. View mode gives the logo a deliberate preview area rather than showing only a URL or placeholder text.

## My Account Experience

My Account gains a **Signature for documents** section beneath the user's profile identity:

- current display name;
- current company position as read-only text, with guidance that an authorized manager changes it under Staff and Permissions;
- optional signature preview;
- upload, replace, and remove actions;
- copy explaining that future documents approved by this user will snapshot these details.

The UI never implies that changing the profile can modify an already-issued document.

## Staff Position Combobox

The current position input in the employee editor becomes an accessible Combobox:

- typing filters position presets by visible name;
- keyboard navigation, focus state, empty state, and selected state are explicit;
- a non-matching value offers one action: `สร้างตำแหน่ง “…”`;
- selecting a preset populates its permission rules and scope for review;
- creating a position keeps the detailed permission editor visible and requires a valid configuration;
- saving clearly distinguishes “ใช้ Preset เดิม” from “สร้างตำแหน่งและกำหนดสิทธิ์”.

Search results and validation messages show names, scopes, and plain-language permission summaries. They never show position IDs or user IDs.

## Billing Issuance Workflow

### Automatic and calculated billing

Calculation and monthly automation prepare billing drafts and move complete drafts to `pending_issue_approval`. The scheduler no longer issues, numbers, signs, or sends invoices without a human approval action. It creates Owner/Accountant-visible workflow notifications for new drafts awaiting approval.

Repeated scheduler runs are idempotent: they reuse the same draft for a site and period and do not create duplicate approval work.

### Manual billing

The manual billing dialog continues to calculate and preview exact totals, but its final action becomes `สร้างและส่งขออนุมัติ`. It creates a draft in `pending_issue_approval`; it does not allocate a number, create a PDF, or send email.

### Corrections

Changing the rate or other bill facts after an invoice has been issued creates a replacement draft that awaits issuance approval. The current issued document stays immutable and current until the replacement is approved. Approval atomically supersedes the old invoice and creates the replacement. A failed or abandoned correction cannot remove the last valid issued invoice.

### Single approval

Opening a pending row shows a review view with the human-readable period, customer, site, totals, tax, due date, recipients, and approver identity preview. The final action is `อนุมัติและออกใบวางบิล`.

Approval is idempotent. Repeating the request after a lost response returns the already-issued document instead of allocating a second number.

### Bulk approval

The first desktop table column is a checkbox. The header checkbox selects or clears only eligible rows visible on the current page. Mobile cards expose the same selection control without shrinking the document facts.

Selection is limited to `pending_issue_approval` rows and resets when the status tab, search, date range, sort, or page changes. The bulk action bar shows the selected count and the action `อนุมัติและออกเอกสาร`.

The confirmation dialog summarizes bills using period, customer, site, and total amount. It previews the current approver name, position, and whether a signature image will be included.

The API validates each selected bill and processes each in its own transaction. The response preserves request order and returns a human-readable label plus either success data or a stable failure reason. One stale or incomplete bill does not roll back successful bills. The result view groups:

- issued successfully;
- still awaiting approval, with the exact corrective action;
- already issued by another request.

No result screen, toast, badge, empty state, or error message displays a UUID.

## Billing Search and Status Tabs

The billing toolbar becomes two rows:

1. Search and date range controls.
2. A horizontally scrollable, keyboard-accessible tab list for billing workflow states.

The two existing status dropdowns are removed from the billing page. Tabs use one user-facing status query whose server mapping can combine stored billing status with derived collection status. Initial tabs are:

- ทั้งหมด;
- รออนุมัติออกเอกสาร;
- รอชำระ;
- รอตรวจหลักฐาน;
- ค้างชำระ;
- ชำระแล้ว;
- ยกเลิก/ไม่สำเร็จ.

Each tab shows a count for the current search/date/site scope. Tabs do not expose internal status keys. The selected tab is encoded in the URL so refresh, back/forward navigation, dashboard links, and shared URLs preserve the view.

Status rendering across tables, cards, detail panels, dashboards, exports, and notifications uses the same presentation mapping. `pending_issue_approval` must never fall through as raw English text.

## Approver Snapshots

Invoice and receipt snapshots add a dedicated approver/signatory object containing:

- user ID for audit and internal traceability only;
- display name;
- company position label;
- optional validated signature data URI;
- approval timestamp.

Only the human-readable fields and signature image are rendered. Internal IDs stay in the saved snapshot/audit boundary and are not exposed in user-facing API payloads unless required for an internal action.

Receipt issuance does not inherit the invoice approver. When payment approval settles a bill, the receipt snapshots the current payment reviewer. Existing frozen invoice company, customer, bank, policy, and logo identity may still be reused where appropriate, but its signer object is replaced with the receipt approver snapshot.

Later changes to a user's display name, position, status, or signature never alter saved documents.

## Finance Readiness Cards

The readiness area becomes a compact missing-steps flow rather than the current raw checklist:

- header: overall state and `completed / total` progress;
- one expanded card for the next actionable missing group;
- compact future-step cards for the remaining missing groups;
- completed items hidden from the list;
- infrastructure-owned blockers clearly separated from user actions.

Related missing items that share a destination are grouped. Expected groups are company identity/logo, bank account, per-site billing setup, Owner confirmation, and deployment infrastructure.

Company signer and company signature are removed from readiness. Personal signature remains optional and is therefore never a readiness blocker. At invoice or receipt approval time, the approving user must be active and have a company position; the UI links a missing position to Staff and Permissions using the user's display name, not an ID.

## Authorization and Audit

- Existing business billing permissions continue to control who can prepare and review drafts.
- The existing `business.billing.approve` permission controls both single and bulk issuance approval. This avoids a second, overlapping approval concept and does not expand technical-role access.
- The server rechecks live role, detailed permission, site scope, account state, position assignment, draft state, and readiness inside each approval transaction.
- Users can edit only their own personal signature.
- Staff managers can assign positions and configure permission presets according to the existing business/technical management boundaries.
- Audit events record draft creation, approval success, partial bulk failures at the batch boundary, signer snapshot hash, document number, and delivery intent.
- User-facing audit views describe the person, customer, site, period, action, and document number; raw entity IDs remain internal.

## API Changes

The implementation introduces or extends:

- `GET /v1/me` and `GET /v1/me/profile` to return the user's company-position label and signature availability;
- `PUT /v1/me/profile` or a dedicated personal-signature endpoint for validated signature upload/removal;
- staff position search/create behavior through the existing team-management boundary;
- a single issuance approval endpoint for one billing cycle;
- a batch issuance approval endpoint accepting a bounded, deduplicated array of billing-cycle IDs;
- billing operation queries and summary counts for the new user-facing status tab;
- company settings responses that omit deprecated signer/signature edit fields.

Batch size is bounded to the largest supported page size. The server does not trust the client-provided display labels; it derives all result labels from authorized records.

## Failure and Concurrency Behavior

- Missing or stale company/site configuration leaves the bill awaiting approval and returns a corrective, localized reason.
- Missing approver position blocks only that approver's issuance action and links to Staff and Permissions.
- Missing optional signature does not block issuance.
- Concurrent approval of the same bill produces one official document and returns it to both callers.
- Number allocation occurs only in the winning approval transaction.
- PDF render or artifact persistence failure rolls back number allocation, document creation, state transition, audit success, and delivery outbox insertion for that bill.
- Email delivery failure does not invalidate an already-issued document; it remains visible with a retryable delivery status.
- Batch requests continue after item-level failures and return a complete result summary.

## Accessibility and UX Standards

- Checkbox hit areas and all actions meet the existing minimum interactive size.
- The bulk selection count is announced through a live status region.
- Tabs expose tab semantics, keyboard navigation, visible focus, and do not rely on color alone.
- Combobox results are keyboard operable and announce the create-new option.
- Signature preview has a text alternative and explicit remove control.
- Empty states tell the user what is missing and where to fix it.
- Long labels wrap; internal IDs, raw hashes, and database status values never appear as fallback copy.

## Test and Acceptance Plan

Implementation follows test-first development and covers:

- company view/edit omitting signer and signature while showing the logo and document-use badge;
- My Account signature upload, replacement, removal, validation, ownership, and future-document-only copy;
- position Combobox search, keyboard use, existing preset selection, new preset creation, mandatory permission configuration, duplicate-name concurrency, and custom permission overrides;
- Owner and Accountant position resolution for issuance;
- calculated, scheduled, and manual bills stopping at `pending_issue_approval` without a document number, artifact, or delivery;
- single approval atomicity, authorization, readiness, idempotency, numbering, PDF persistence, audit, and delivery intent;
- bulk approval page selection, deduplication, bounded input, request-order results, partial success, concurrent approval, and human-readable errors without UUIDs;
- status-tab URL behavior, query mapping, scoped counts, search/date interaction, pagination reset, dashboard links, localization, and mobile horizontal overflow;
- invoice snapshot using its issuance approver and receipt snapshot using its payment reviewer;
- documents with and without optional signatures;
- immutable historical bytes after profile/position/signature changes;
- replacement invoices awaiting approval while the prior invoice remains valid;
- simplified readiness step cards, missing-only grouping, company signer removal, progress, and infrastructure separation;
- desktop table, mobile cards, keyboard navigation, screen-reader labels, and no raw internal identifiers in user-visible output;
- existing exact-decimal, tax, payment, receipt, document delivery, scheduler idempotency, and PDF layout regression suites.

## Rollout

1. Deploy the forward migration and compatibility reads without changing historical documents.
2. Backfill unambiguous employee position assignments and report internal approvers who still lack a position.
3. Enable the new staff position editor and personal signature settings.
4. Enable pending issuance approval for newly calculated/manual bills and stop automatic invoice issuance.
5. Enable single approval, then bounded bulk approval and status tabs.
6. Run controlled acceptance for one invoice with signature, one without signature, one partial-failure batch, and one payment approval that issues a receipt.
7. Verify saved PDF hashes, actor/position snapshots, audit records, numbering continuity, delivery retries, and historical document downloads.

Rollback uses a compatible prior application image without dropping the new columns or position assignments. Already-issued documents and artifacts remain authoritative. Drafts in `pending_issue_approval` remain unissued and can be resumed after restoring the compatible release.
