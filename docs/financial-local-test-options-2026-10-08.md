# Local financial test policy options

Status: prepared for later selection; none of these options are approved accounting rules. All identities, accounts, evidence and example rates are synthetic local test data. This document does not state real-world tax obligations.

## Fixed workflow decisions

Monthly periods close at month end; normal issue/email processing runs at 01:00 Asia/Bangkok on day 1. Actual issue date starts the contract calendar-day payment term. Missing required actual boundary readings block issuance (5-minute tolerance); hourly recheck and staff notification. No estimated missing measurements. Owner/Accountant approve full payment; a receipt and captured local email follow automatically. Multiple transfers can settle one complete bill. Preserve issued snapshots/artifacts and prohibit duplicate issuance. Corrections need another financial approver.

## Choice A: synthetic calculation and precision

Recommended local fixture: tax-exclusive price, synthetic 7% test tax, no withholding; energy 3 decimals, rates 4 decimals, currency 2 decimals; decimal arithmetic, round-half-up energy charge to 2 decimals then tax to 2 decimals. A 1,234.567 kWh reading × 3.5000 THB/kWh gives 4,320.9845 THB, rounded charge 4,320.98 THB; test tax 302.47 THB; total 4,623.45 THB. These values test rounding only and do not confirm any actual tax rate.

Alternative: tax disabled for the initial local run, same charge 4,320.98 THB; defer tax-invoice pipeline verification explicitly. This cannot count as full tax-invoice flow acceptance.

## Choice B: issued document timing

Recommended local fixture: issue invoice at monthly processing; after full verified payment issue a combined receipt/test tax document dated at approval. Original transfer dates remain in the payment history. Alternative: separate tax document at invoice issuance, with receipt on payment. This decision affects tax-document tests and must be selected before implementation.

## Choice C: numbering

Recommended fixture: INV2026100001 for invoices and RCT2026100001 for combined receipts; Gregorian year, monthly sequence, unique transactionally allocated per document type and issuer. Do not change existing issued numbers. If separate tax documents are selected, add TAX2026100001 with an independent sequence.

## Choice D: corrections

Recommended initial local acceptance: normal issuance, missing-data block/recheck, payment reject/resubmit, multiple transfers to full settlement, duplicate protection, immutable issued documents. Include cancellation/correction request and separate approver checks; keep actual replacement/adjustment document issuance disabled until its selected type and financial impact are specified. Alternative: include complete cancellation/reissue and adjustment issuance in the same financial phase after explicit rules are selected.

## Synthetic issuer data

Use screenshot reference name/address/registration number; use test branch 00000, signer ผู้ลงนามทดสอบ, email billing@solar-roof.example.test, phone 02-000-0000. Bank accounts and test organization tax identities are synthetic, not verified. Store provenance in fixture metadata and visibly mark generated test artifacts.

## Implementation readiness checkpoint

After selecting these fixture policies: inspect/reconcile proposal v2 against current interfaces; persist test-policy provenance and workflow verification; limit local readiness to identified test environment. Real readiness still requires reviewed accounting evidence. Never accept a general environment flag alone as evidence. Financial implementation supplies persisted contract association so Documents can group bills by exact contract rather than site inference.

## Verification matrix

1. Organization staff creates a contract through permitted staff workflow; organization user can view only assigned records.
2. Real canonical boundary readings produce a persisted calculation and invoice artifact; downloads and captured email attachments match its bytes.
3. Missing/stale/invalid readings and required issuer configuration block issuance.
4. Replaying monthly jobs and approval requests never duplicates numbers, documents or receipts.
5. Organization user submits evidence; rejection permits resubmission; full approval produces receipt and captured email.
6. Multiple transfers exactly settle total; under/overpayment cannot silently approve.
7. Profile/logo changes do not alter historical issued artifacts; language is fixed at issuance.
8. Cross-organization reads, documents and payment actions are denied; UI filtering is not the security boundary.
