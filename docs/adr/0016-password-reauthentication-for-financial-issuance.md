# ADR 0016: Password re-authentication for financial issuance

Status: Accepted, 2026-10-15.

## Context

When issuing billing statements (`ใบวางบิล`) to customers, the system binds the approving user's identity (display name, company position, and signature image) into an immutable snapshot and assigns an official document number before delivering the document to the customer.

Previously, anyone with an active session holding the `business.billing.approve` permission could approve document issuance or bulk issuance with a single click without re-confirming their account password. If an unattended workstation or hijacked browser session approved issuance, legally binding documents would be sealed and delivered under that person's name and position.

## Decision

Require mandatory password re-authentication every time an approver executes document issuance (`อนุมัติและออกเอกสาร`), both for single billing statement approval and bulk issuance.

1. The approval confirmation modal includes a password verification input (`รหัสผ่านเพื่อยืนยันการลงนามและออกเอกสาร`) alongside the review summary and legal disclaimer.
2. The user's account password must be transmitted atomically with the approval payload (`password` field in `ApproveIssuanceRequest` and `BulkApproveIssuanceRequest`).
3. The backend validates the password against the user's password hash (`AuthService.verifyPassword`) within the approval endpoint before allocating document numbers or rendering artifacts.
4. If password verification fails:
   - The API returns HTTP 401 Unauthorized with a clear message (`รหัสผ่านไม่ถูกต้อง กรุณาระบุรหัสผ่านใหม่อีกครั้ง`).
   - The UI displays an inline red error in the modal without closing the modal or discarding review tokens and preview facts, allowing the approver to re-enter their password immediately.
5. In the billing table UI (`/billing`), row selection checkboxes are enabled across all tabs, and the sticky bottom action bar dynamically displays actions appropriate for the selected items (e.g. `อนุมัติและออกเอกสาร (X รายการ)` for pending items).
6. The status badge for `pending_issue_approval` ("รออนุมัติออกเอกสาร") is visually differentiated from `awaiting_payment` ("รอชำระเงิน") by using Info/Sky blue styling (`bg-info/15 text-info border-info/30`), reserving Warning/Amber for `awaiting_payment`.

## Consequences

- Prevents accidental, unintended, or session-hijacked signing and issuing of financial documents.
- API consumers and tests for issuance approval must supply the approver's password.
- No session caching of the approval credential is used; every issuance action explicitly requires password entry to enforce conscious legal confirmation.
