# Solar Leasing Five-Page Billing Document Packet

## Status

Accepted

## Context

Previously, issuing an invoice (`document_type = 'invoice'`) rendered a single-page modern card-style billing statement (`sarabun-a4-v12`) and left an unfulfilled `production_form` (`awaiting_file`) attachment slot. However, official solar rooftop leasing customers (such as public hospitals and government agencies) require a standardized 5-page Thai formal billing packet matching government/utility transmittal conventions.

## Decision

Upgrade the invoice PDF renderer (`FINANCIAL_TEMPLATE_VERSION = 'solar-leasing-packet-v13'`) to emit a single immutable 5-page A4 PDF packet (`THSarabunNew`) per issued billing cycle:

1. **Page 1 — Billing Transmittal Letter (`หนังสือนำส่งแจ้งหนี้`)**: Formal Thai cover letter with company letterhead, outgoing letter reference (`ที่`), Buddhist date, subject, recipient (`เรียน ผู้อำนวยการ... จังหวัด...`), lease contract reference (`อ้างถึง สัญญาเช่าเลขที่... ลงวันที่...`), 3 enclosures (`สิ่งที่ส่งมาด้วย`), installment calculation (`งวดที่ X/Y`), billed amount in figures and Thai words (including 7% VAT), company bank transfer details (including account type and branch), company contact email, and the frozen approver signature block.
2. **Page 2 — Electricity Invoice (`ใบแจ้งหนี้ค่ากระแสไฟฟ้า`)**: Formal invoice with company letterhead, issuer tax ID, customer block (`กรุณาส่ง`), issue date, invoice number, 4-column detail table (`รายการ`, `จำนวนหน่วย (kwh)`, `ราคาต่อหน่วย (บาทต่อ kwh)`, `จำนวนเงิน (บาท)`), summary rows (`รวมเงิน (บาท)`, `ภาษีมูลค่าเพิ่ม 7%`, `รวมเงินทั้งสิ้น (บาท)`, `รวมเงินเป็นตัวอักษร`), and bank payment instructions.
3. **Pages 3–4 — Monthly Energy Report (`รายงานผลค่าไฟฟ้าจากพลังงานทดแทน`)**: Two-page report with company letterhead, summary table (`Total Energy Production`, `Energy Production On Peak`, `Energy Production Off Peak`), and fixed 31-day table (`Day 1–24` on Page 3; `Day 25–31` plus `Total` row on Page 4). Daily `On Peak` (Mon–Fri 09:00–22:00) and `Off Peak` values are frozen into the document snapshot so that `On Peak + Off Peak = Total Energy Production`.
4. **Page 5 — Payment Confirmation Form (`แบบฟอร์ม ยืนยันการชำระค่ากระแสไฟฟ้า จากพลังงานทดแทน`)**: Pre-filled with customer organization name, installment/period, VAT-inclusive amount (figures and Thai words), company bank account details, and company email, while leaving payer signature, position, phone, email, and submission date lines blank for the customer to complete.

Receipts (`document_type = 'receipt'`) retain their existing layout, and previously issued historical artifacts remain immutable under their original `template_version`. New `v13` invoices no longer emit pending `production_form` (`awaiting_file`) attachment slots because the energy report and confirmation form are embedded directly in the 5-page PDF artifact.

## Consequences

Every newly approved invoice produces a complete, self-contained 5-page official billing packet ready for preview, printing, download, and email delivery without manual attachment uploads. Site billing settings, customer identity, and company bank accounts gain optional lease/letter metadata fields (`contract_number`, `contract_signed_date`, `total_installments`, `province`, `recipient_title`, `letter_prefix`, `account_type`) with deterministic fallbacks so existing sites can issue `v13` packets seamlessly.
