# Integrated UI and local financial review — 2026-10-08

The approved work is split into five draft PRs in nateekarni/solar-roof: #1 copy/layout/locale, #2 branding, #3 isolated local fixtures, #4 Organization Portal, #5 local TEST financial implementation. None is merged or deployed. The managed `codex/ui-financial-integration` checkout reconciles their overlapping shared components for actual local review.

## Verified behavior

- Contract headings use consistent icon typography without section numbers, separators or redundant English parentheticals. Four settings cards have localized descriptions.
- Solar Roof transparent wordmark is used for documents; the roof/sun symbol is used on the platform. Primary UI color comes from a central token. Historical issued originals remain unchanged.
- Customer navigation is Home, Documents and Settings; organization scope is enforced by the API. Documents bind invoices/receipts to persisted contract IDs and translate months/statuses. Missing measured power stays unavailable.
- The actual September Organization A dashboard displays 3,126 kWh from independent pinned canonical solar logger counters. Wh/kWh conversion and unopened future-day omission are tested.
- The real local financial harness passed all 18 checks; persisted evidence is in local-financial-verification-2026-10-08.json. PDF downloads and captured SMTP attachment hashes match; invoice and receipt were rendered and visually inspected.
- Customer record pages expose explicit exact-decimal transfer entry and retained individual history. Staff verification remains limited to Owner/Accountant and exact full settlement.

## Local review

Use scripts/local-financial-review/README.md for loopback services, launch and synthetic credentials. Current completed fixture is retained for manual review. A fresh reset/reseed is required before repeating the mutating full acceptance runner. No external email is sent.

## Deferred decisions

Full adjustment/cancellation issuance and production accounting rules remain a later selection. The approved simulated 7% policy applies only to this persisted environment-bound TEST fixture. Shared-file merges should preserve the reconciled behavior in this checkout; production writes remain blocked.

## Final combined checks

API: 164 passed, 2 existing skips; type checking passed. UI: 161 passed with type checking. Fixture guards: 9 passed. Actual Edge customer record submissions retained exact string amounts 1.00, 2.00 and an additional 0.01; pending total was 3.01. The final additional transfer retained the actual current Bangkok instant. Earlier synthetic submissions from the diagnosed initial-time issue remain as historical evidence. Customer has no verification action; Owner opens the scoped modal and sees the persisted individual history. Actual record contrast has no violations at desktop size; mobile390px has no horizontal overflow.

Screenshots and verified invoice/receipt renderings are retained in D:/Dev/solar-roof/.superpowers. Draft PR heads contain the final source fixes; the combined checkout is retained for manual local use.