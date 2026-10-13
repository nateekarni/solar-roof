# Production Finance, Document, and Branding Readiness Design

**Date:** 2026-10-13  
**Status:** Approved in chat  
**Scope:** Production financial writes, document issuance and delivery, Owner setup guidance, and tenant-controlled branding

## Goal

Allow the deployed Coolify application to run the real finance and document workflow only after its business data is complete and explicitly confirmed. Guide the Owner to finish every business-controlled prerequisite, keep infrastructure-controlled SMTP separate, use the uploaded company logo wherever the application currently uses its bundled logo, and remove the duplicate company name beside the logo in document headers.

## Current State

The repository already contains most of the business inputs and workflow mechanics:

- Company identity, tax address, billing contact, provider signatory, signature image, and bank accounts are editable under Company Settings.
- Site billing settings include service start, payment terms, recipients, tax rate, tax inclusion mode, tax confirmation, and reminder settings.
- Rates, billing meters, meter boundaries, payment evidence, immutable document artifacts, delivery outbox records, and idempotent monthly jobs exist.
- Invoice and receipt PDFs freeze company, customer, payment, policy, recipient, and logo data in their saved snapshots.
- The company screen already reads PNG/JPEG files in the browser, but the API does not validate `logoUrl`, the value is stored in the legacy `logo_url` field, contracts still use the bundled logo, and the application shell always uses the bundled mark.

Production financial actions remain unavailable because `FinancialReadinessService` only accepts the environment-bound local test fixture. The scheduler also starts only for that fixture. The financial application service, policy constants, PDF renderer, email subjects, and several error messages still describe the real implementation as local or synthetic.

## Chosen Approach

Use configuration-driven readiness backed by an explicit Owner approval and immutable audit evidence. An environment flag remains a deployment-level kill switch, but cannot enable a financial action by itself.

This approach was selected over two alternatives:

1. Enabling the existing implementation with `FINANCIAL_WRITES_ENABLED` alone would not prove that legal identity, payment, tax, recipient, document, or delivery settings are valid.
2. A multi-stage accounting approval workflow with separate reviewer queues would add roles and process that are not required for the current deployment. The existing Owner authority, per-site tax confirmation, and audit log provide a smaller complete boundary.

## Readiness Model

### Global business configuration

The Owner-controlled production checklist requires:

- an uploaded PNG or JPEG company logo, at most 1 MiB;
- company legal name;
- a 13-digit tax identifier;
- branch designation;
- registered tax address;
- contact phone;
- syntactically valid billing email;
- provider signatory name and title;
- PNG or JPEG signatory image, at most 1 MiB;
- at least one configured bank account with bank name, account name, and account number;
- exactly one default bank account.

The Company Settings screen presents these items as a checklist. When all are complete, the Owner can confirm that the information is accurate for production financial documents. Confirmation writes a canonical JSON snapshot, its SHA-256 hash, the Owner ID, and the confirmation timestamp to a new production financial approval record. The confirmation operation and all company or bank changes write audit events.

Changing any field included in the approved snapshot invalidates the active approval in the same database transaction. A change that does not affect financial documents does not revoke approval.

### Per-site business configuration

A site is ready for calculation and issuance only when it has:

- an active customer with legal name, tax identifier, tax address, and document email;
- service start date and payment term;
- an explicitly confirmed tax rate and explicit tax-included or tax-excluded mode;
- at least one active, verified, assigned document recipient;
- a complete effective THB rate schedule for the requested period;
- an active billing meter and confirmed billing-source binding;
- actual cumulative readings at every required billing boundary;
- an active contract when the document flow requires one.

These checks remain scoped to the site. An incomplete site cannot block an otherwise ready site. Missing meter bindings or boundary readings are shown as technical blockers rather than fields the Owner can fabricate.

### Deployment configuration

`FINANCIAL_WRITES_ENABLED=true` is the master switch for production financial mutations. It does not bypass global approval or site readiness.

Email delivery additionally requires valid `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, and the configured authentication and TLS values. SMTP is managed in the Coolify environment and is displayed as an infrastructure blocker; it is never editable through the Owner UI.

Add `FINANCIAL_SCHEDULER_ENABLED=false` as a separate default-off flag. The production monthly scheduler starts only when both financial flags are true, global production approval is current, and SMTP delivery is configured. Manual readiness and document preview remain inspectable while the scheduler is disabled.

### Action gates

`FinancialReadinessService.assertEnabled` becomes context-aware and returns structured missing prerequisites. Gates are evaluated as follows:

- `calculate`: master switch, current global approval, and requested site calculation prerequisites;
- `issue`: calculation prerequisites plus complete issuer, customer, bank, recipient, signatory, logo, and cycle snapshot inputs;
- `approve_payment`: issue readiness because full approval can create a receipt;
- `adjust`: issue readiness plus an immutable current invoice and the existing correction rules;
- `send`: issue readiness, saved artifact integrity, frozen verified recipients, and SMTP readiness.

Failures retain HTTP 503 and code `FINANCIAL_NOT_READY`, with safe category identifiers and destinations that the UI can render. Responses must not expose environment secrets.

## Production Financial Workflow

Rename the production path away from `LocalFinancialApplicationService` and `LocalFinancialScheduler`. Preserve the local fixture as a test adapter, but do not use local host, Mailpit, fixture markers, or `TEST_FINANCIAL_POLICY_HASH` as production evidence.

Production calculations continue to use exact decimal arithmetic, actual meter boundaries, site-specific rates, the confirmed tax rate, and the explicit tax inclusion mode. Each cycle stores a canonical policy snapshot and hash derived from the settings used for that cycle. Invoice and receipt generation freezes:

- issuer and customer legal identity;
- tax and rounding policy;
- site, rate, meter, and period evidence;
- payment accounts and verified recipients;
- signatory and signature image;
- uploaded company logo bytes;
- document numbering, issue date, due date, and template version.

Production output does not contain synthetic test labels or `TEST` email subjects. The local fixture retains visible synthetic marking.

The monthly scheduler keeps the existing Asia/Bangkok 01:00 cutoff, durable `financial_month_jobs`, retry timing, row locking, unique constraints, and idempotent document/outbox behavior. A blocked site records its missing prerequisites and produces an Owner-visible setup notification without preventing other sites from completing.

SMTP uncertainty continues to fail closed. A delivery that may have been accepted is reconciled before retry so redeployment or scheduler retries cannot duplicate an email.

## Owner Readiness Experience

Company Settings gains a Finance Readiness card above the editable sections. It shows:

- overall state: incomplete, awaiting confirmation, ready except for infrastructure, or ready;
- completed and total Owner-controlled items;
- direct actions for company identity, logo, signatory, signature, and bank account items;
- per-site summaries linking to the relevant site billing settings;
- separate infrastructure status for the master flag, scheduler flag, storage, and SMTP;
- the current confirmation actor and timestamp;
- a final confirmation action enabled only when all Owner-controlled global items are complete.

The normal notification bell receives an Owner-only derived finance readiness item. Its destination is `/settings/company`. Its identity includes the readiness fingerprint, so marking one reminder as read does not suppress a later reminder after the missing set changes or an approval becomes stale. The item disappears when the Owner-controlled checklist and confirmation are complete. Infrastructure and technical blockers remain visible on the readiness card without asking the Owner to enter secrets or manufacture telemetry.

The notification is composed by `NotificationFeedService` from the same readiness result used by the settings page and action gates. Read state continues to use `notification_feed_reads`; no second notification inbox is introduced.

## Branding and Logo Upload

Keep the `CompanyProfile.logoUrl` API field for compatibility, but accept only an empty value or a valid PNG/JPEG data URI up to 1 MiB for new writes. The API validates decoded bytes, declared MIME type, and actual file signature. Existing bundled `/brand/...` values remain readable only as migration fallback and do not satisfy production readiness.

Add a public, read-only branding logo endpoint that returns the configured image bytes with the correct content type, ETag, and bounded cache headers. It returns the current bundled mark when no valid custom logo exists. No legal, tax, contact, or bank data is exposed by this endpoint.

The shared `BrandMark` component uses this endpoint, so one change covers the desktop sidebar, mobile menu, login page, application header, loading state, and every other current use of the bundled mark. Existing product text labels remain unchanged. Saving or removing a logo refreshes the branding revision so the current browser does not retain stale bytes.

Draft previews use the current uploaded logo. At issuance, contracts, invoices, and receipts embed the logo bytes into the immutable saved snapshot. Historical documents never acquire a later logo.

## Document Layout

Every PDF and browser preview header removes the issuer company name from the column beside the logo. The first-page header contains the logo on the left and document title/number/date metadata on the right. The legal issuer name remains in the dedicated Company Information block below with address, tax ID, branch, phone, and email.

Continuation headers keep only the small frozen logo and document identity. Contract, invoice, receipt, and handover previews follow the same duplication rule. Template versions are incremented for newly issued documents; saved historical artifacts and snapshots remain unchanged.

## Authorization and Security

- Owner retains edit authority for company profile, bank accounts, site billing settings, and production confirmation.
- Accountant retains existing site tax and financial workflow permissions but cannot replace global Owner confirmation.
- Admin and technical roles cannot edit business financial identity through the production routes.
- The public branding endpoint exposes image bytes only.
- Image validation occurs on both client and API; the API is authoritative.
- Readiness responses contain field identifiers and human-readable guidance, never credentials or SMTP values.
- Every readiness-relevant mutation and confirmation is audited with before/after data and actor identity.

## Database and Compatibility

The next migration adds a production financial approval table with immutable approval snapshots and revocation metadata. It also adds any constraint needed to guarantee at most one active production approval. Existing company, bank, site, cycle, document, artifact, job, notification-read, and outbox data are retained.

No seed or migration creates an approved production state. Existing deployments start with financial writes and the scheduler disabled, no active approval, and an Owner readiness notification. Existing issued document bytes remain valid and downloadable.

## API Shape

The implementation exposes:

- `GET /v1/settings/finance-readiness` for Owner-visible global, site, infrastructure, and action readiness;
- `POST /v1/settings/finance-readiness/confirm` to record the Owner production confirmation after a server-side recheck;
- `GET /v1/public/branding/logo` for the effective custom or fallback logo;
- the existing company and bank endpoints with stricter validation, transactionality, approval invalidation, and audit events.

The readiness response has stable identifiers for each prerequisite, its state, responsible party (`owner`, `technical`, or `environment`), and an optional internal destination. Web copy is localized client-side.

## Testing and Acceptance

Implementation follows test-first development and must cover:

- API validation of PNG/JPEG bytes, MIME mismatches, oversize uploads, removal, fallback, ETag, and unauthenticated logo access;
- Owner-only company, bank, and confirmation mutations with audit records;
- approval hash stability and atomic invalidation after every relevant mutation;
- global and per-site readiness matrices for every financial action;
- isolation proving one incomplete site does not block another;
- derived Owner notification creation, read behavior, fingerprint renewal, and disappearance when complete;
- production exact-decimal calculation, policy hashing, invoice, receipt, correction, payment approval, saved artifact integrity, and idempotency;
- scheduler disabled/enabled behavior, Bangkok cutoff, retry, partial-site failure, and replay;
- SMTP missing, success, rejection, and uncertain-delivery behavior;
- shared application branding with default fallback and immediate refresh after upload;
- contract, invoice, receipt, and browser previews using the uploaded frozen logo;
- document headers containing the issuer name only in the Company Information section;
- historical documents preserving their original bytes and logo after configuration changes;
- route and page authorization for Owner, Accountant, Admin, Operator, and Customer User;
- full lint, unit, integration, browser E2E, PDF layout/reference, staging Compose, recovery, and capacity CI gates.

## Rollout

1. Deploy the migration and application images with `FINANCIAL_WRITES_ENABLED=false` and `FINANCIAL_SCHEDULER_ENABLED=false`.
2. Owner uploads the logo and completes company, signatory, bank, and site financial settings.
3. Technical staff resolve billing-source and meter-boundary blockers.
4. Configure and verify SMTP in Coolify without exposing credentials to the UI.
5. Owner reviews and confirms the production financial configuration.
6. Enable `FINANCIAL_WRITES_ENABLED=true`, redeploy, and run a controlled manual calculation, issue, payment, receipt, PDF, and delivery acceptance test for one designated site.
7. After the controlled flow and idempotent replay pass, enable `FINANCIAL_SCHEDULER_ENABLED=true` and redeploy.
8. Record the release SHA, immutable image digests, approval ID, test evidence, and activation time in the release evidence.

Rollback uses the prior compatible image digests without dropping volumes or deleting approvals, cycles, documents, artifacts, jobs, or outbox records. Financial flags can be turned off immediately while read-only document access remains available.
