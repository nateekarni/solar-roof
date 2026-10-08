# Reference document redesign grill — 2026-10-08

Status: user accepted all actual Q1–Q12 recommendations; shared design confirmed and implementation authorized.

## Explicit user requests

- Match supplied invoice, receipt and PPA visual references.
- Human document numbers (example INV261000001), not internal IDs.
- Empty footer, orderly font hierarchy.
- PPA signatures at bottom of final page for long content.

## References versus instructions

Reference images supply visual arrangement. Sample company/customer/bank/signatory facts, penalty/legal clauses, amounts and dates are not adopted facts or operating rules without explicit user decision. New visuals differ from previous black/gray-only, full-width customer and no-PPA-table decisions; this round must resolve those presentation overrides.

## Frontier

1. Yellow/gray palette and block styling versus previous monochrome direction.
2. Use new reference spatial arrangement rather than strict prior header percentages/full-width customer.
3. Human numbering format/prefix and period sequence.
4. All-channel/UI document-number display scope and historical originals.
5. Empty footer and continuation identity behavior.
6. Type hierarchy/readability.
7. PPA substantive clause scope and invoice remarks.
8. Rate-table exception in PPA.
9. Receipt payment information source and multi-transfer handling.
10. Signature roles and blank actual signing dates.
11. Bilingual amount-in-words choice.

Read-only agent is verifying actual numbering allocation, frozen fields and visible identifier surfaces. Only user decisions will be asked; factual questions will be resolved from code.

## Verified facts and proposed round1 recommendations

- Contract snapshot/document number currently uses contract UUID. Invoice/receipt allocator uses INV/RCT + four-digit Gregorian year + month + four-digit sequence.
- Issued originals/artifacts are protected by database immutability triggers; changing their displayed number in place would conflict with saved-byte guarantees.
- Existing PPA stores parties, rates, effective dates and payment days, not a substantive legal-clause body or actual signing date. Site capacity exists separately and needs prospective snapshot capture for factual PPA display.
- Current original document channels freeze and share bytes. Human numbering must be introduced during issuance and surfaced consistently in documents/UI/filenames/mail, leaving internal IDs for routing.

Round1 questions will cover: Q1 accent palette; Q2 layout override; Q3 document prefixes/YYMM+five-digit sequence; Q4 sequence/date basis; Q5 historical originals; Q6 empty footer/compact continuation header; Q7 typography; Q8 PPA legal clauses and invoice remarks as explicit draft content vs visual-only; Q9 rate-table exception/site capacity; Q10 receipt title/classification; Q11 receipt payment fields/multiple transfers; Q12 signature roles/dates; Q13 amount-in-words language. Answers not yet received.

## Actual round1 question numbering

Q1 yellow primary accent + light-gray cards + black text overrides monochrome.
Q2 reference arrangement overrides strict15/35/30+20gap and full-width customer: invoice customer/project pair, receipt customer/payment pair, PPA written sections.
Q3 INV/RCP/PPA + YYMM +five-digit sequence, human number used across PDF/UI/references/files/mail while internal IDs stay routing-only.
Q4 monthly separate-type sequence by Bangkok issue month, not bill/service period; allocation atomic/no reuse.
Q5 empty visible footer metadata, keep final-page signatures and compact continuation identity at top.
Q6 TH Sarabun New role sizes title26 / English16 / section18 / body16 / metadata14 / total22pt; long content may paginate, no tiny type.
Q7 adopt PPA image clauses1–10 as a synthetic local draft or visual structure only; substantive terms require explicit acceptance.
Q8 PPA dated rate table exception +actual capacity frozen, no guessed10kWp.
Q9 receipt heading only receipt vs previously combined test tax invoice; recommendation preserve combined TEST classification visibly.
Q10 receipt lacks real payer/method/origin bank/account fields; choose additional optional payment data or existing facts only; never substitute issuer receiving bank as payer bank; list all approved transfers.
Q11 invoice paired signatures/PPA paired parties/receipt issuer-only; actual signing date blank, no implied issued-date signature.
Q12 Thai vs bilingual amount in words and image invoice penalty remarks; recommendation Thai amount words consistent, only recorded remarks without new penalty.

Retained scope: all saved historical originals remain immutable and retain their old numbers/layout. New formats apply prospectively; no reissue/reset requested. This is already accepted and is not a new approval request.

## Accepted Q1–Q12 (binding consolidated spec)

User answered “เอาตามที่แนะนำทั้งหมด”. No unresolved design frontier remains. This confirmation authorizes execution without another confirmation menu.

1. Yellow primary accent from central brand source, frozen on issuance; gray cards, black text. New visual layout overrides earlier monochrome and strict header proportions.
2. Match invoice customer/project paired cards, receipt customer/payment paired cards, PPA numbered written sections; logo/company close together; right title/number/date metadata, invoice due date in its metadata box.
3. Human number families INV/RCP/PPA +Gregorian YYMM +five-digit sequence, e.g INV261000001. Human numbers in PDF/UI/references/filenames/mail; internal UUID only in routing/storage.
4. Sequence per type per Bangkok issue month, atomic/concurrent safe, unique, no reuse of issued numbers. Reject overflow rather than growing format; preserve financial policy/hash.
5. No visible footer number/page text; compact continuation identity at top allowed. Final-page bottom signatures remain with safe layout reservation.
6. Exact TH Sarabun New roles: title26pt, English16, section18, body16, metadata14, total22. Readable long content paginates instead of shrinking.
7. Image PPA clauses1–10 adopted as a SYNTHETIC LOCAL DRAFT. Substitute frozen actual parties/site/rates/paymentdays/capacity. This is not new production legal policy nor interest/penalty accounting. No automatic fee/interest computation added.
8. PPA rate table is an explicit exception to previous no-contract-table rule. Every frozen dated rate retained; actual capacity frozen from sites.capacity_mwp converted to kWp. No guessed10kWp. Missing capacity stays unspecified.
9. Receipt remains combined TEST receipt/tax invoice, clearly marked as synthetic test, despite image abbreviated RECEIPT title.
10. Optional payer name/payment method/origin bank/origin account captured on submission and available for officer review; missing values show dash; distinguish payer bank from frozen issuer receiving accounts; show all approved transfers.
11. Invoice paired prepared/received signatures, PPA paired parties, receipt issuer-only right signature. Actual signature date blank; do not infer issuance date as signed date.
12. Thai amount words consistent across documents, only stored/accepted remarks. No copied invoice late-payment fee claim.

Retain saved historical originals and old numbers unchanged, including existing UUID originals. New numbering applies to future originals only, and legacy list rows use existing stored numbers without inventing aliases.

## Reference PPA local draft wording boundaries

Numbered sections: 1 parties; 2 electricity-sale purpose; 3 site/capacity; 4 effective duration (recorded end or indefinite, no assumed cancellation rule substituted as date); 5 complete rates; 6 metering/monthly invoice/customer viewing; 7 recorded payment days/bank transfer and reference interest clause as local draft only; 8 seller maintenance/customer proper use; 9 written90-day cancellation draft; 10 Thai-law/dispute/copies draft. All clause text must be frozen and visible as local draft. No guessed signed dates, addresses, capacities, bank/payer data or signatory facts. Literal image-derived clauses may be transcribed into the test-only template; accounting algorithms untouched.
