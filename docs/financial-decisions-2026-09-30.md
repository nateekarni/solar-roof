# Financial decision interview

Status: interview in progress. Accepted answers define the next proposal; no financial patch or database seed has been applied as part of this interview. Earlier proposal is not yet aligned with these answers.

## Accepted round 1

- Q1 C: missing readings block billing by default. Exceptional entry from external evidence is supported, with evidence, reason and approval history; never generated readings. Roles and approval separation remain open.
- Q2 B: the rate end date shown to users is inclusive. Internally normalize the boundary to the next day without overlapping rates. An absent end date means ongoing.
- Q3 A: split a billing cycle across different contracts into separate bills. Different rates within one contract are line segments of that bill.
- Q4 A: full-payment-only acceptance. Mismatched amounts await staff handling, not automatic partial-payment or credit creation.
- Q5 A: automatically prepare drafts; a person reviews and confirms issuance and email delivery.
- Q6 A: generate a downloadable PDF and attach the same document to the email. Requires additional implementation beyond the original proposal.
- Q7 user instruction: seed into the current database; a new deployment requires user-entered configuration, and absent values are not displayed. Exact seed payload/environment remain to be clarified. Existing migration009 embeds example identities/accounts and auto-inserts them on an empty database, which conflicts with the new-deployment requirement. Do not silently treat those examples as verified company data.

## Accepted round 2

- Q8 A: explicit sample seed is for development/test databases only. New deployments start with empty company/bank configuration; no automatic example data in normal migrations. No seed has been executed during this interview.
- Q9 A: actual boundary meter readings may differ from the target by at most5 minutes; outside that tolerance blocks billing. Actual reading timestamps remain auditable.
- Q10 C: Admin may enter and approve evidence-based readings themselves; evidence and reason are mandatory. This deliberately does not require a second approver.
- Q11 A: missing mandatory issuer configuration permits viewing and draft preparation, but blocks issuance. Optional absent fields remain hidden.
- Q12 A: tax invoices are in first-release scope; accounting must confirm tax treatment and document requirements before implementation is complete.
- Q13 B: support controlled cancellation, reissuance and accounting-defined adjustment documents. Preserve original issued documents and explicit links; exact workflows remain pending.
- Q14 A: historical records remain viewable with original attachments where available; never recreate historical PDFs from current mutable information. Missing originals are explicitly unavailable.

## Pending frontier

## Accepted round 3

- Q15 A: Owner and Accountant confirm issuance, payment approval and financial document corrections. Admin retains hardware/evidence duties, including the previously accepted evidence-reading self-approval; this does not grant financial approval.
- Q16: billing cutoff is the last day of each month. System settings hold a default payment-term day count; contract creation autofills it and permits a contract-specific override. Starting point/day-count convention, initial default value and subsequent default-change semantics remain pending.
- Q17 B: multiple transfers may evidence a single full settlement; approval requires their combined amount to equal the bill. No partial settlement or automatic credit.
- Q18 C: final review offers issue-and-email or issue-only, with recipient review.
- Q19 A: bounded automatic email retries, then staff notification; reuse the original document and preserve attempt history. Retry timing remains pending.
- Q20 A: retroactive meter corrections calculate impact and create a correction request; a financial approver confirms before adjustment issuance. Original issued documents remain unchanged.
- Q21 B: prepare an accounting requirements form for confirmation; do not infer tax policy or enable incomplete tax-document issuance.

## Remaining decisions after round 3

Payment day-count/start/default inheritance; monthly draft execution timing; payment approval receipt delivery; numbering/correction approval details; email retry policy and invoice recipient policy. Accounting-specific decisions are delegated to the form rather than assumed.

## Accepted round 4 — supersedes conflicting earlier answers

- Q22: normal monthly billing is automatically calculated, issued and emailed from actual meter data; no human issuance confirmation. Supersedes Q5 A and the normal monthly issue-choice in Q18 C. User requests end-of-month automatic issuance but also selects Q26 A (01:00 on day1); exact cutoff/execution/document-date relationship must be confirmed rather than silently chosen. Payment-term start remains unanswered.
- Q23 A: calendar days; due date is starting date plus term days, with no holiday adjustment.
- Q24 A: payment-term default starts empty on new installation; administrator or contract author must supply it before issuance.
- Q25 A: default settings autofill new contracts only; existing contract terms and issued due dates remain unchanged.
- Q26 A: selects01:00 Asia/Bangkok on day1 and automatic recheck for missing data. This now concerns automatic issuance, not merely a draft. Reconcile timing with Q22 before implementation.
- Q27 A: after full payment approval, automatically issue receipt and email its PDF. Human payment verification is not removed by this answer.
- Q28 A with clarification: recipient is the school user's email, and that user can sign in to view only their school's details/documents. Contract recipient identity/account synchronization and number of recipients remain to be resolved. Never infer account creation from a typed email alone.

## Current unresolved frontier

End-of-month cutoff versus day1 processing; due-date start; meaning of available meter data when boundary data is incomplete (earlier Q1/Q9 fail-closed rule); school-account selection and recipient changes. Tax/accounting form remains awaiting confirmation. No financial implementation or database seed has been performed during this interview.

## Accepted round 5

- Q29 A: close the calendar month at its end; process, issue and email at01:00 Asia/Bangkok on day1. Use the actual issuance date rather than backdating. Resolves the round4 timing ambiguity.
- Q30 A: payment terms start from actual issuance date; add the contract's calendar-day count without holiday shifting.
- Q31 A: insufficient actual boundary readings block issuance. Notify staff and automatically recheck; issue/send once complete. Preserve5-minute tolerance and evidence correction workflow. Do not fabricate or estimate missing data.
- Q32 B: contract recipient selection supports multiple school-user accounts belonging to that contract's school. Each sees only their school's records/documents. Unavailable recipients/account changes require explicit policy rather than silently substituting another address.

## Remaining frontier after round 5

Financial correction approval separation; overdue reminders; missing-data retry cutoff/notification; email-recipient account changes and delivery failures. Tax-document rules remain with the accounting confirmation form. Automatic workflow implementation and seed remain unapplied pending completion of the interview and shared-understanding confirmation.

## Accepted round 6

- Q33 A: recheck missing meter data hourly. Notify staff on first failure and send one daily outstanding-work summary until resolved. Prevent duplicate issuance per contract/billing period.
- Q34 A: resolve selected recipients to their current verified email and active school membership before sending. Skip inactive/ineligible accounts; notify staff if none remain. Preserve the actual recipients and delivery history for every attempt. Issued bills remain issued with explicit pending/failed delivery states when delivery is unavailable.
- Q35 B: cancellation/adjustment of an issued financial document requires approval by a different Owner or Accountant. Evidence-reading self-approval by Admin does not remove this separation. No bypass if only one financial approver is available.
- Q36 A: overdue email reminders are configurable and disabled by default. When enabled, stop on full payment/cancellation and suspend while payment evidence awaits review. Reminder schedule must be supplied before enabling; no implicit default schedule.

## Consolidated handoff status

Normal billing closes the calendar month and automatically issues/emails at01:00 Asia/Bangkok on day1 when real meter data and required settings are complete. No normal human issuance confirmation remains. Actual issue date starts the contract's calendar-day payment term. Company/bank settings and payment-term default start empty on new deployment; sample seed is opt-in for development/test only. System payment terms autofill new contracts without changing existing ones.

Real boundary readings use a5-minute tolerance. Missing data blocks issuance; Admin can supply and self-approve evidence-based readings with mandatory evidence/reason. Rate end dates shown to users are inclusive. Different contracts yield separate bills. Full settlement may combine multiple transfers; Owner/Accountant approve payment and receipt/PDF email follows automatically.

PDF downloads and email attachments use the same issued artifact. Multiple eligible school-user accounts can receive documents and access only their school. Preserve original issued documents and legacy attachments; do not reconstruct missing historical documents. Corrections require a separate financial approver. Email retries are bounded and audited, with unresolved failures surfaced to staff; technical retry timing remains an implementation detail to document in the revised proposal, not an approved business rule.

Q37 A confirmed shared understanding and authorized revising/testing the proposal only. The original20-file patch is superseded by proposal v2. Accounting form remains an explicit external prerequisite for tax calculation/document issuance and adjustment details; these are not considered settled. No financial code application, deployment or company/bank sample seed has occurred. Proposed migrations and generated regression fixtures were tested only in disposable local database `solar_financial_v2`.

Accounting authority and tax inputs; issuance/payment/correction permissions; cycle and due-date rules; treatment of multiple transfers; correction workflow details; email dispatch/retry rules and immutable PDF/numbering. These are design decisions, not permission to apply the financial patch yet.
