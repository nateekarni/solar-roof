# ADR 0030: Retire Contracts Workflow and Enable Direct Site Service Activation

## Status
Accepted

## Context
Originally, the platform modeled customer onboarding through formal contract records in a `contracts` table, requiring an independent contract lifecycle (`contracts_notification_feed` trigger, `/records/contracts/[id]`, `/contracts` page, and contract generation forms).

The platform requirements have evolved:
1. Adding a site now immediately activates the site and its solar service.
2. Service start date, payment terms, tax configuration, price inclusiveness, and automated payment reminders are managed directly in `site_billing_settings`.
3. Tariff rates are attached directly to `rate_versions(site_id)` rather than through a contract intermediary.
4. Document legal signatories and customer details on invoices and receipts resolve from `company_profile` (issuer) and `customers` / `site_billing_settings.recipient_user_ids` (customer).
5. Historical contract notification feeds created noise and confusion. Routes `/contracts` and `/records/contracts/[id]` must strictly return Next.js `404 Not Found`.
6. Owner permissions were previously blocked during site creation when submitting billing and identity configuration fields.
7. Site creation UI required an integrated 3-tab layout (Site Info, Customer Info, Billing & Service Settings) matching system pill tabs.
8. Non-authorized users must have creation and editing action triggers completely hidden.

## Decision
1. **Retire Contract Triggers and Feed**:
   - Migration `062_retire_contracts_trigger_and_feed.sql` dropped `contracts_notification_feed` on `contracts`, purged historical `contract:*` events from `notification_feed_events`, and adjusted `capture_notification_feed_event()` to omit contracts.
   - Removed `contracts` formatting from `notification-bell.tsx` and permitted notification paths.
2. **Strict 404 for Contract Routes**:
   - `/records/contracts/[id]` and `/contracts` immediately trigger Next.js `notFound()`.
   - `canCreateOperation` in `business-operation-options.ts` returns `false` for `contracts`.
   - `OperationsService.detail()` returns 404 for `contracts`.
3. **Direct Site Service Activation**:
   - `POST /v1/sites` atomically provisions `sites`, `site_billing_settings`, and `rate_versions(site_id)` within a single transaction.
   - Seed scripts (`scripts/seed-platform-realistic.ts`) populate `site_billing_settings` and `rate_versions(site_id)` directly without inserting into `contracts`.
4. **Owner Platform Access Permissions**:
   - `PlatformAccessGuard` permits owner access for all site business attributes: `name`, `capacityMwp`, `latitude`, `longitude`, `externalSiteId`, `newOrganization`, `serviceStartDate`, `ratePerKwh`, `paymentTermDays`, `taxRate`, `pricesIncludeTax`, `taxConfirmed`, `remindersEnabled`, `reminderStartDays`, `reminderIntervalDays`, and `recipientUserIds`.
5. **3-Tab Modal Experience (`SiteServiceDialog`)**:
   - Refactored `SiteServiceDialog` with 3 pill tabs:
     - Tab 1 `site`: Site Name *, Code, Capacity (MWp) *, Latitude, Longitude.
     - Tab 2 `customer`: Customer identity (`OrganizationIdentityFields`).
     - Tab 3 `billing`: Service Start Date, Tariff Rate (฿/kWh), Payment Terms, Tax Rate, Price Mode, Tax Confirmation, Payment Reminders.
   - Stepper footer with Cancel, Previous, and Next / Submit buttons with step validation.
6. **Strict Button Visibility**:
   - "+ เพิ่มไซต์งาน" is only visible to `owner`.
   - Row action buttons (Edit Site, Delete Site) and Manage Details header button are restricted to `owner`.
7. **Staff Site Scope Bounded Display**:
   - In `/settings/system` (Staff tab), the site scope column is clamped with `max-w-[220px] truncate`, `+N` count badge, and a tooltip listing all assigned sites on mouse hover.

## Consequences
- The platform eliminates redundant contract steps; creating a site immediately provisions operational and billing readiness.
- URLs and notifications related to contracts are cleanly extinguished without orphaned states or broken links.
- Consistent visual presentation and security posture across site creation and role-based permissions.
