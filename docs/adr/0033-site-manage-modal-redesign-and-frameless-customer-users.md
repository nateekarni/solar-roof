# ADR 0033: Site Manage Modal 3-Tab Architecture and Frameless Customer Users Table

## Status
Accepted

## Context
Following the refinement of the Add Site modal (`SiteServiceDialog`) and feedback on the Site Details view (`/sites/[id]`):
1. **Discrepancy Between Site Creation and Site Management Modals**:
   - The Add Site modal (`SiteServiceDialog`) had been updated to a modern 3-tab layout (`Building2` - ข้อมูลไซต์งาน, `FileText` - ข้อมูลลูกค้า, `Receipt` - ตั้งค่าบริการ) with uniform 4px label spacing, dynamic payment reminders, Shadcn `DatePicker`, and stepper navigation.
   - In contrast, the Manage Site Details modal (`SiteManageModal`) was still using an older design with inconsistent component patterns, missing the customer identity fields and service billing tabs in a unified stepper experience.
2. **Heavy Container Styling on "ผู้ใช้งานของไซต์งาน" (Site Customer Users)**:
   - The `SiteCustomerUsers` section in `/sites/[id]` was rendered inside a full `<Card>` with standard borders, rounded corners, card header, and a card description paragraph.
   - Within the site management context, this heavy card container created visual clutter, excessive padding, and redundant descriptive text alongside the site overview information.

## Decision
1. **Unified 3-Tab Architecture for `SiteManageModal`**:
   - Replaced legacy modal structure in `SiteManageModal` with a 3-tab architecture identical to `SiteServiceDialog`:
     1. **Tab 1: ข้อมูลไซต์งาน (`Building2`)**: Site Name, Site Code (read-only/disabled), Capacity (MWp), Latitude, Longitude.
     2. **Tab 2: ข้อมูลลูกค้า (`FileText`)**: Full customer organization fields powered by the shared `OrganizationIdentityFields` component (`name`, `code`, `legalName`, `taxId`, `taxBranch`, `documentEmail`, `taxAddress`, `contactName`, `phone`).
     3. **Tab 3: ตั้งค่าบริการ (`Receipt`)**: Service start date with Shadcn `DatePicker`, payment term days, tax rate, prices include tax checkbox, accounting tax confirmation dropdown, dynamic payment reminders slotting (toggleable start days and interval), and multi-select document recipient buttons.
   - **Form Field Ergonomics**: Applied `data-slot="field"` and `[&_input]:mt-0` with `flex flex-col gap-1` across all tabs to ensure an exact 4px distance between labels and inputs.
   - **Decoupled Form Validation & Stepper Navigation**:
     - Removed `<form onSubmit>` wrappers in tabs to eliminate unintended form triggers.
     - Implemented hybrid stepper buttons at the bottom: Left button displays [ยกเลิก] on Tab 1 and [ย้อนกลับ] on Tabs 2 & 3; Right button displays [ถัดไป] on Tabs 1 & 2 (with validation) and [บันทึกข้อมูล] on Tab 3. Users can also freely click between tabs at the top.
2. **Frameless Table Layout for `SiteCustomerUsers`**:
   - Stripped `<Card>`, `<CardHeader>`, `<CardDescription>`, and `<CardContent>` from `SiteCustomerUsers`.
   - Replaced with a lightweight, frameless container (`<div className="w-full space-y-4">`) featuring a clean header flexbox with the title (`Users` icon + "ผู้ใช้งานของไซต์งาน") and the "+ เพิ่มผู้ใช้" button on the top right, followed immediately by the user list / empty state table.

## Consequences
- Complete visual and behavioral parity between creating a site (`SiteServiceDialog`) and managing an existing site (`SiteManageModal`).
- Clean, unencumbered presentation of customer users without nested card frames, redundant padding, or extraneous descriptions.
- All 537 web tests and API tests pass with full static type verification.
