# Site modal manual field corrections — 2026-10-09

Confirmed by user Q1: allow fields to be configured without a preset; keep cumulative energy validation at the test/save boundary. Place the additional-device description beneath its heading inside the text group beside the icon. Fill remaining modal placeholders.

## Diagnosis
- Field editor applied complete billing-meter validation to every intermediate field save. A valid voltage field could not be saved first.
- Local PostgreSQL had migrations only through 028. Current customer/preset/notification queries required later schema additions.

## Implementation
- Intermediate field updates validate field structure and units without requiring cumulative billing energy. Last-field removal returns to the empty state. Final site validation still requires a valid main meter.
- Preserve existing poll groups while including groups required by edited fields.
- Group heading and description beside the icon; keep the add action responsive.
- Add customer, metadata, field and edit-form input hints; generated-code hints remain exclusive to generated identifiers.
- Applied pending migrations 029–038 to localhost without resetting existing data.

## Verification
- Web TypeScript check passed.
- 12 targeted tests passed, including manual voltage first / required billing energy at completion.
- Actual localhost browser: saved voltage field without selecting a preset; customer, preset and notification endpoints returned HTTP 200; no Internal server error appeared.
- Desktop/mobile screenshots: .superpowers/manual-field-desktop.png and manual-field-mobile.png.
- Independent targeted review found no actionable issues.
