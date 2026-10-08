# Compact three-column document header grill — 2026-10-08

Status: consolidated design confirmed by user; implementation authorized.

## Reference interpretation

User requests the spatial layout shown in the image: logo at far left, issuer company identity beside it in the center, compact document metadata at right; document title below the company block. The image is layout reference only. Its company facts, green brand color, customer-copy/original/tax classification wording are not instructions or data for Solar Roof.

## Retained decisions

Exact TH Sarabun New, approved Solar Roof logo, black/light-gray document palette, full-width customer below header, factual prose PPA, content-sized financial columns, final-page signatures, saved-byte channel parity and immutable historical originals remain accepted.

## Frontier and recommendations

Q1: Three-column header approximately 20% logo / 50% issuer / 30% metadata, top-aligned.
Q2: Existing approved document logo with Solar Roof wordmark at left, rather than platform icon-only asset.
Q3: Document title on a separate line below the upper block, centered, Thai prominent and existing English secondary; actual type remains PPA/invoice/receipt rather than copying reference tax wording.
Q4: Right block contains actual document number/date and existing relevant due date; no customer-copy/original badge or extra tax-branch claim inferred from image.
Q5: Wrap issuer by logical data lines and expand header for long address/identity, preserving readable text and full content; ordinary target one page remains, arbitrary long content may paginate.

Issuer data availability is being checked read-only before any question about additional identity fields.

## User answers and consolidated design

- Q1: Header widths 15% logo / 35% issuer / 30% document metadata / 20% whitespace. Proposed whitespace distribution: two 10% inter-column gaps, keeping metadata against the right edge.
- Q2: Generate a new transparent document logo using the approved existing symbol, with Solar Roof underneath. Wordmark width approximately matches symbol width. Preserve symbol and brand colors; platform icon unchanged.
- Q3: Keep document type title top-right, above its number/date. No centered title row.
- Q4: No copy/original badge. Right block contains title, document number and issue date only. Existing invoice due date remains in its relevant body location.
- Q5: Logical company/address/tax/contact line breaks; long content may increase header height. Preserve readability/full data; ordinary financial documents target one page.
- Apply shared header to future contract/invoice/receipt originals. Existing full-width customer identity, prose PPA, final-page signatures, exact font, black/light-gray body and immutable-original channel parity remain accepted.

## Confirmation

The user confirmed the consolidated design, including equal 10% gaps; implementation is authorized. No new company fact or legal-document classification is taken from the reference image.

