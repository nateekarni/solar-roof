# ADR 0026: Site Details Display Card and Two-Tab Stepper Modal Architecture

Status: Accepted, 2026-10-16.

## Context
On the site details page (`/records/sites/:id`), several UX and architectural issues were identified:
1. **Interactive Form Clutter on Detail Page**: The billing settings section previously rendered interactive form inputs and an inline submit button directly on the page, rather than serving as a clean read-only display view.
2. **Stretched Single Tab Bar**: In `SiteDetailTabs`, when non-admin users (such as `owner` or `accountant`) visited the page, only a single tab ("จัดการข้อมูล") was rendered inside `<TabsList>`, stretching across the full screen as a large orange button.
3. **Inconsistent Header & Navigation Controls**:
   - The "จัดการข้อมูล" (Manage details) button was not aligned with the main title row.
   - The page lacked a descriptive subtitle below `<h1>`.
   - The "กลับไปหน้ารายการ" (Back to list) navigation link lacked borders, card background, and visual consistency with other control buttons across the platform.
4. **Modal Form Stepper and Field Consistency**: Editing customer, site, and billing parameters required a unified 2-step modal replicating the robust stepper pattern established in ADR 0025 (`StaffInvitation` / `EmployeeEditor`), complete with explicit placeholder text across every input.

## Decision
1. **Read-Only Display Value Page Layout**:
   - The main site details page is now 100% read-only Display Value mode.
   - Top card: Site and customer metadata rendered via `<RecordDetails>`.
   - Bottom card: `<SiteBillingDisplayCard>` displays all billing configurations (service start date, payment term days, tax rate %, price inclusion, reminder intervals, accounting confirmation status, and document recipient tags) in a clean, responsive description list (`dl/dt/dd`) grid without form inputs or submit buttons.
   - Single tab bar eliminated: When `canManageUsers` is false, `SiteDetailTabs` renders children directly without a `<Tabs>` or `<TabsList>` container. When true, it renders compact tabs between "ข้อมูลไซต์งาน" (Site overview) and "จัดการผู้ใช้งาน" (Manage users).

2. **Standardized Header and "กลับไปหน้ารายการ" Button**:
   - Header title is placed alongside a descriptive subtitle:
     - `th`: "จัดการข้อมูลไซต์งานและการตั้งค่าบริการ" / `en`: "Manage site information and service settings".
   - The "จัดการข้อมูล" action button is placed at the top-right inline with the title (`flex items-center justify-between`) for `owner`, `admin`, and `accountant` roles.
   - The "กลับไปหน้ารายการ" button across all record detail pages and financial navigation controls (`RecordNavigationControls`) is styled with visible border and card background (`inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50`).

3. **Two-Tab Stepper Modal (`SiteManageModal`)**:
   - Replicates the segmented tab styling from ADR 0025:
     - `flex-1 rounded-lg border border-border bg-card px-3.5 py-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-neutral-950 data-[state=active]:font-bold shadow-none`
   - **Tab 1: ข้อมูลลูกค้า (Customer & Site Details)**:
     - Site name, code, installed capacity (MWp), coordinates (latitude, longitude).
     - Customer details: display name, org code, legal name, tax ID (13 digits), branch, billing address, contact name, phone, document email.
     - Footer: `[ยกเลิก (Cancel)]` and `[ถัดไป (Next)]`. Pressing Enter in text fields or clicking "ถัดไป" validates Tab 1 and advances to Tab 2 without submitting.
   - **Tab 2: การตั้งค่าไซต์งาน (Site Configuration & Billing)**:
     - Service start date, payment term (days), tax rate (%), price mode (excluded/included), reminder start (days), reminder interval (days), payment reminders (on/off), tax confirmation (unconfirmed/confirmed), and recipient toggle buttons.
     - Footer: `[ยกเลิก (Cancel)]`, `[ย้อนกลับ (Back)]`, and `[บันทึกข้อมูล (Save)]`.
   - **Decoupled Button Safety**: Form uses `onSubmit={(e) => e.preventDefault()}` and all buttons use `type="button"` with distinct keys to prevent browser reconciliation submit firing.
   - **Comprehensive Placeholders**: Every input field includes clear, localized placeholder text (e.g., `เช่น อาคารสำนักงาน A`, `เช่น 0.25`, `เช่น 13.7563`, `เลขประจำตัวผู้เสียภาษี 13 หลัก`, `เช่น 30`, `เช่น 7.00`).

## Consequences
- Site detail views now present high-fidelity, read-only display values without accidental editing or unaligned buttons.
- Editing customer and billing settings follows an intuitive, guided two-step stepper modal matching staff onboarding conventions.
- Eliminates the single full-width orange tab anomaly for non-admin roles.
- Back navigation buttons are visually coherent with bordered card styling across all record pages.
