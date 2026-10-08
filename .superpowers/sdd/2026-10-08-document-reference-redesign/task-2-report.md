# Task 2 — Optional reviewed payer metadata

Date: 2026-10-08. Base HEAD: 0944e26. Implementation HEAD: 7e4cdc4ee3f6ff0f4bb59e14fb06be4c94116b76.

## Contract and changes

| POST /v1/billing-cycles/:id/pay and review field | payments column / raw frozen snapshot field | Validation |
| --- | --- | --- |
| payerName | payer_name | Optional string; trim; max 200 Unicode code points |
| paymentMethod | payment_method | Optional string; trim; bank_transfer or promptpay only |
| originBank | origin_bank | Optional string; trim; max 120 Unicode code points |
| originAccount | origin_account | Optional string; trim; max 80 Unicode code points; leading zeros retained |

Null, undefined and blank input mean unspecified. Non-string, overlong and unsupported method input produces HTTP 400 before persistence. No method is inferred for legacy/omitted rows. Enum describes the existing transfer evidence flow; cash/card settlement was not enabled.

Shared API contracts export PaymentMetadata, PaymentSubmission, PaymentTransferRow, TransferPaymentMethod and normalizePaymentMetadata. Existing amount, paidAt, slipUrl, evidenceKey and note request fields remain. TEST amount accepts exact decimal strings as before; the legacy flow keeps its prior numeric amount contract.

Scoped GET /v1/operations/billing/records/:id returns row.payments[] with camelCase payerName/paymentMethod/originBank/originAccount plus existing transferDate, amount, status and review fields. The scoped cycle lookup still occurs before payment history retrieval; a denied cycle never loads metadata. The table officer dialog now loads this scoped detail before approval, and both review surfaces show all individual transfers with Thai/English labels and dashes for unspecified values. Both existing submission surfaces share the optional fields and validation.

TEST submissions still append independent transfer records, including resubmissions after rejection; no earlier metadata is overwritten. The legacy single-record resubmission flow updates supplied metadata and preserves existing metadata for omitted/blank fields via coalesce. The approval PATCH payload remains {status:'approved'|'rejected',rejectionReason?}; approval still verifies all pending transfers and requires their exact total to match the invoice. Rejected history remains stored. Amount calculation, financial TEST policy/hash, approval roles, routing IDs, numbering and retry behavior are unchanged.

Receipt issuance still queries only status='paid' transfers and freezes raw snake_case metadata into snapshot.payments. Existing saved originals return before new snapshot construction. localTestDocumentSnapshot maps each approved transfer to exact optional renderer properties payerName, paymentMethod, originBank, originAccount. DocumentSnapshot.approvedTransfers[] adds these four properties; paymentMethod type is 'bank_transfer' | 'promptpay'. Absent/null metadata stays absent in the adapter. Receiving bank/account data remains separate under paymentAccounts. Pending/rejected transfers do not enter approvedTransfers. No renderer style or template-version change is included.

## Migration

New unused ordinal: infra/migrations/037_optional_payer_metadata.sql. Adds four nullable text columns with trimmed/non-empty length checks and the method enum check. No backfill, applied migration edit, policy edit or original artifact reset.

SHA256 of authored LF migration bytes: BC68712F269C3344F56C6775C1BDBE0EB6C0B6E3562597FEBB85F67BBD511387. Root should hash its checkout bytes before guarded fixture application because Git autocrlf may produce CRLF bytes. Migration was not applied by this agent.

## Red then green evidence

Initial API command (before implementation):

    pnpm exec tsx --tsconfig apps/api/tsconfig.json --test apps/api/src/modules/billing/local-financial-application.spec.ts apps/api/src/modules/documents/local-test-pdf.spec.ts apps/api/src/modules/dashboard/operations.service.spec.ts

Result: 18 tests, 13 pass, 5 fail, 0 skip. Failures were missing normalized persistence, missing malformed-value rejection, missing limit-boundary persistence, missing scoped review fields and missing snapshot metadata mapping. Existing omitted-field behavior passed as a compatibility characterization.

Initial bilingual history command:

    pnpm exec tsx --tsconfig apps/web/tsconfig.ui-tests.json --test apps/web/features/billing/payment-history.spec.tsx

Result: 2 tests, 1 pass, 1 fail, 0 skip; actual payer data missing from rendered history.

Optional form red command:

    pnpm exec tsx --tsconfig apps/web/tsconfig.ui-tests.json --test apps/web/features/billing/payment-metadata-fields.spec.tsx

Result: 1 fail, 0 skip; optional inputs were not yet available. Green assertions render both locales, entered fields, limits, optional semantics and the two supported transfer methods.

Legacy controller red command against unchanged HEAD controller:

    pnpm exec tsx --tsconfig apps/api/tsconfig.json --test apps/api/src/modules/billing/payment-metadata-controller.spec.ts

Result: 3 fail, 0 skip; missing metadata insertion, resubmission update and malformed metadata rejection. Reapplied scoped implementation: 3 pass, 0 fail, 0 skip.

Final focused API command:

    pnpm exec tsx --tsconfig apps/api/tsconfig.json --test apps/api/src/modules/billing/local-financial-application.spec.ts apps/api/src/modules/billing/payment-metadata-controller.spec.ts apps/api/src/modules/documents/local-test-pdf.spec.ts apps/api/src/modules/dashboard/operations.service.spec.ts

Result: 23 pass, 0 fail, 0 skip. Includes real receipt rendering/persisted frozen JSON after approval; excludes rejected history, retains all approved transfers and exact metadata, and reuses the original on retry after mutable source changes. Independent additional TEST transfers retain their own metadata. Database doubles assert the application query/persistence boundary; no real database was mutated.

Final focused web command:

    pnpm exec tsx --tsconfig apps/web/tsconfig.ui-tests.json --test apps/web/features/billing/payment-history.spec.tsx apps/web/features/billing/payment-metadata-fields.spec.tsx apps/web/features/billing/payment-input.spec.ts apps/web/features/billing/billing-record-panel.spec.tsx apps/web/features/billing/billing-detail-request.spec.ts

Result: 11 pass, 0 fail, 0 skip. Covers bilingual optional inputs/history, exact existing transfer amount/date behavior, persisted totals/action visibility and scoped detail request unwrapping.

Additional final checks: pnpm --filter @solar/api lint, pnpm --filter @solar/web lint, pnpm --filter @solar/api-contracts build all exit 0. git diff --check passed. No whole-suite rerun.

## Remaining validation and risks

Root owns guarded migration application, actual PostgreSQL/HTTP/browser/channel verification and all runtime/SMTP activity. This commit requires migration 037 before payment submission/review paths use the new columns; rebuild api-contracts before running consumers. The root's existing 19-artifact/hash baseline remains untouched. No database, SMTP, runtime, production, push or merge action was performed here. No outstanding focused test/type errors. Final independent review and guarded end-to-end validation remain with root.

## Review fix round 1 — normal migration registration

Reviewer P1 confirmed against the normal db-migrate.ts explicit registry: it ended at 036 and omitted the new schema migration. Added exactly one registry entry for infra/migrations/037_optional_payer_metadata.sql after 036. Existing SQL files, checksums, transaction handling and migration side effects are unchanged. Registration fix HEAD: 973dad7d3659c3d61f95fb73481ebf0c452bcd0b.

Focused checks: pnpm --filter @solar/api lint exits 0; git diff --check passes; git diff --name-only 4369743 -- infra/migrations returns no paths, confirming all migration bytes preserved.

No existing registration-test pattern was found. A focused node --input-type=module stdin check exercised the actual db-migrate.ts loop in vm.Script with the imports/environment boundary replaced and an in-memory Pool/client. All preceding migrations were represented as applied; migration 037 was represented as unapplied. The check asserts the actual loop records exactly ['infra/migrations/037_optional_payer_metadata.sql'] and transaction sequence ['BEGIN','COMMIT']. Result: pass. Real registered SQL files were read; no database connection, SQL execution against a database, runtime service or SMTP activity occurred. An initial attempt to inspect the registry through TypeScript's compiler API could not run because the installed native TypeScript package does not expose ScriptTarget; replaced that check with this executed migration-loop boundary check.

Only normal registration and this report changed in this fix round. No whole suite rerun or migration application. Root retains guarded application and scoped re-review ownership.
