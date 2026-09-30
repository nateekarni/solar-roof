# Financial settings and UI proposal review

Review-only source overlay; not applied, migrated, seeded or deployed.

## Implemented

- Nullable `defaultPaymentTermDays` with explicit zero support, integer validation (0–3650, aligned with contract validation) and transactional settings mutation. New contracts fetch the default once when opened; user edits win over delayed responses. Submitted `paymentTermDays` is an explicit contract snapshot. Settings never update contracts.
- Explicit `financialRemindersEnabled` and `financialReminderDays` settings; disabled/empty by default. Distinct positive day offsets are required before enabling. Atomic schedule validation and writes share an advisory transaction lock.
- Contract form selects multiple eligible school account IDs through the server's school-scoped endpoint; no typed billing email substitutes a recipient. End dates are labelled inclusive, including optional contract end. Subsequent rate rows begin the day after an inclusive end.
- Settlement form submits one or more actual transfer amounts, timestamps and evidence attachments. Mismatches may be submitted for review; the financial approval button requires the full total. Rejected transfers do not count toward that total.
- Billing details fetch server state, show each transfer, restrict financial review to Owner/Accountant and use authenticated stored-PDF downloads. Legacy sheet and verification entry points share this flow. No client-generated historical PDFs or claims of successful email delivery.
- Admin evidence entry requires meter, actual timestamp/value, reference and reason. Correction requests show calculated impact; an Owner/Accountant must endorse an automatic Admin impact request before a different financial approver confirms it; self-approval is disabled and backend approval remains authoritative. Accounting-blocked results remain visible.
- Owner/Admin system settings; Owner/Accountant company and bank mutations. Accountant added to the client role type.
- Separate `seed-financial-sample.ts` requires `NODE_ENV=development|test`, `FINANCIAL_SAMPLE_SEED=yes`, and explicit `DATABASE_URL`. It refuses to overwrite configured records and writes obvious nonproduction examples only. It is not wired into installation or migrations.

## Migration009 compatibility

Do not edit applied migration009 or its checksum. Proposal011 already drops company/bank example defaults and hides only the exact untouched migration009 examples through `is_configured=false`; user-modified rows are preserved. The application therefore returns empty configuration after the complete migration chain, although exact legacy seed rows remain in storage for provenance. No separate migration014 duplicates that work. This compatibility choice must be retained in the final migration review.

## Verified

- Proposed web TypeScript check: pass.
- Proposed API TypeScript check: pass.
- Six isolated settings policy/service tests: pass (missing vs zero, invalid terms, no contract writes, reminder schedule validation, atomic rollback, seed opt-in environment guards).
- Used disposable `validate-overlay.py` output; no live database connection or seed invocation for these checks.

## Limits

No browser interaction/accessibility run, real PostgreSQL settings-lock concurrency test, real file download or SMTP verification was performed by this workstream. Service transaction rollback tests use a transactional in-memory database double. Contract UI autofocus/autofill races are implemented defensively but not covered by a browser test. Some new explanatory controls use English or bilingual text; full Thai translation remains incomplete. Accounting rules are still an external prerequisite, and adjustment issuance remains blocked. The form currently creates contract end dates; a dedicated later contract-termination editor is not included.

## Follow-up integration

The blocked monthly-work list now includes Admin-only site meter evidence entry through `GET sites/:id/billing-meters`, so a missing baseline can be resolved before any billing cycle exists. The form records actual timestamps, values, evidence reference and reason and explicitly reports that hourly rechecking still determines readiness. The correction panel uses `pending_financial_request` then `pending_approval`, with `financialRequestedBy` for separate approval. Proposed web typecheck passed again after these integrations.
