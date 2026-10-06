# UI consistency: approved scope and verification

## Delivered

- Dashboard Gateway summary has three status counters, issue links and an empty-state site setup link. The separate live meter card is named for measured active power.
- Removed the bill/paid-count line. Map overview reports mapped sites; energy and capacity appear only for a selected site.
- Settings root is a category hub for administrators and owners. School users retain their existing school settings view.
- Company profile uses two display columns with a full-width address. Edit controls sit in card headers.
- Bank accounts use a shadcn table inside the card, without an outer table border or a separate header divider. Existing stored bank names are localized for display without changing records.
- System setting cards share the same header edit button, including notifications.
- Meter presets now have a single page heading first, distinct payload profile and register preset sections, responsive filters, header edit actions and locale-specific UI labels. Revision publishing and device pinning are unchanged. Editing a profile brings its draft into the main section.
- Table empty states retain headers, remove the dashed outline and use a 4px title/description gap. Pagination wraps on narrow screens and its controls follow the locale.
- Removed six unused resource-detail modal mounts; operation rows and action menus use the existing record detail route. Document, billing, payment and telemetry interactions remain separate.
- Mobile bottom navigation follows the selected language.

## Verification

- Web TypeScript check passes.
- Twelve focused Web tests pass, including empty resource table headers, column mapping, timestamp hydration, telemetry freshness, measured power formatting, summary readiness and blank site form metadata.
- Browser desktop audit: dashboard, sites, alerts, contracts, billing, receipts, company, system defaults, meter presets, users, audit, schools, reports, notifications, account, security and settings hub.
- Browser 390px audit of the same route families: no document-level horizontal overflow. Wide data tables scroll within their containers; pagination controls wrap and remain within the viewport.
- Confirmed all four system setting Edit buttons are 32px high and located in the card header.
- Tested company Edit/Cancel, profile Edit/Cancel and search, meter power expand/load, and user action-menu navigation to a record detail page.
- Tested Thai/English profile tables, register labels, bank headings and mobile navigation; restored Thai and the default viewport.
- Review caught and corrected school-user settings availability, shared-table localization and missing profile select labels.

## Limits

No financial/company/preset records were changed during this task. No new telemetry test records were created. Dashboard measurement states were verified against the current empty site dataset; populated data freshness and selected-map-site behavior retain their existing data paths. Financial save/payment workflows and physical Gateway ingestion were not re-executed for this presentation-only change.

## Meter tabs and modal follow-up

- Payload profiles and register presets are separate tabs because their input formats and responsibilities differ; neither data source was removed.
- Both profile editing and register creation/editing use shadcn dialogs, 80vw on desktop and a screen-fitting width on mobile. Measured desktop width: 1024px at a 1280px viewport; mobile width: about 358px at 390px, without document overflow.
- Removed the meter page configuration eyebrow and decorative page/card heading icons. Browser checked 16 principal route headings: zero heading SVG icons.
- Profile editor keeps background cards mounted, uses an internally scrolling field area and fixed action footer, and prevents dismissal while publishing. Revisions update functionally and existing immutable publishing/pinning behavior is retained.
- Verified tab switching and Edit/Cancel for both formats at desktop and mobile widths. No preset revisions were published during visual testing.
- Web TypeScript passes and 12 focused Web tests pass.

## Date controls and loading follow-up
Migrated visible native date/datetime fields and raw feature/navigation buttons to shared shadcn components. DatePicker preserves API date strings, local payment times, required and dynamic min/max validation. Fixed Calendar intrinsic width in Popover. Added shared centered brand loading for routes, settings, profiles and detail dialogs. TypeScript passed; 8 UI tests passed. Browser verified alerts from=2026-10-01 and clear removing query; screenshot shadcn-date-picker.png. Hidden file and validation inputs remain intentional.
