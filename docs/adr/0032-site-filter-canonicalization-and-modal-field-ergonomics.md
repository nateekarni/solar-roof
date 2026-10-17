# ADR 0032: Site Status Filter Canonicalization, Column Alignment, and Modal Field Ergonomics

## Status
Accepted

## Context
Following real-world testing and UI feedback on the Sites management interface (`/sites`) and Add/Edit site modal (`SiteServiceDialog`):
1. **Duplicate / Redundant "ออฟไลน์" in Status Filter**:
   - The status filter in `operationFilters.sites` concatenated administrative lifecycle statuses (`active`, `inactive`, `archived`) with operational gateway connection statuses (`online`, `offline`).
   - This caused confusing redundancy ("ปิดใช้งาน" vs "ออฟไลน์") and broken filter behavior: filtering by "ใช้งาน" (`active`) returned 0 sites because active sites are dynamically computed to `online` or `offline` based on gateway heartbeats.
   - In `GatewayIndex`, dynamic option generation from row statuses without canonicalization risked producing duplicate "ออฟไลน์" options when Thai and English raw strings coexisted.
2. **Notification Popover Balance**:
   - The popover header only had a single-line title ("การแจ้งเตือน") on the left, making it vertically unbalanced against the action buttons (Mark all read + Close) on the right.
3. **Unused "ภูมิภาค" (Region) Column in Sites Table**:
   - The Sites table rendered a "ภูมิภาค" (Region) column, but region is not configured or modified during site creation/editing. It cluttered the business table without practical utility.
4. **Modal Form Spacing & Native Date Picker**:
   - In `SiteServiceDialog`, vertical spacing between `<Label>` and input elements varied, with "ที่อยู่สำหรับออกเอกสาร" appearing closer to its textarea due to Thai bottom descenders (`ู่` in "ที่อยู่") and `leading-none` line-height.
   - The service start date input used a raw browser `<input type="date">` instead of the project's standard Shadcn `DatePicker`.

## Decision
1. **Canonical Operational Status Filter for Sites**:
   - `operationFilters.sites` now contains only the real operational statuses supported and displayed by the system:
     `[online ("ออนไลน์"), offline ("ออฟไลน์"), inactive ("ปิดใช้งาน")]`.
   - `GatewayIndex` now normalizes status checks and defines explicit canonical status choices (`online`, `offline`), preventing duplicate options.
2. **Balanced Notification Popover Header**:
   - Added a subtitle description under "การแจ้งเตือน":
     Thai: `"รายการแจ้งเตือนและกิจกรรมล่าสุด"`
     English: `"Recent alerts and activity"`
     Structured in a clean `flex flex-col gap-0.5` container to achieve balanced vertical alignment with the icon buttons on the right.
3. **Streamlined Sites Table Columns**:
   - Removed `region` from `operation-columns.ts`, `operation-query.ts`, and `operations.service.ts`.
   - The Sites table now displays 6 purposeful columns that directly correspond to fields configured in the site dialog:
     1. `name` ("ชื่อไซต์งาน")
     2. `externalSiteId` ("รหัสไซต์")
     3. `customerName` ("ลูกค้า")
     4. `capacityMwp` ("กำลังติดตั้ง (MWp)")
     5. `status` ("สถานะ" — ออนไลน์ / ออฟไลน์)
     6. `serviceStartDate` ("วันที่เริ่มบริการ")
4. **Compact 4px Label Spacing, Dialog Margin Neutralization, and Grid Realignment**:
   - Identified root cause of uneven label-to-input distance: `DialogContent` injected `mt-2` (8px) on `div:not([data-slot=field]) > label + input` and `label + textarea`, while `DatePicker` (button) and `ChoiceSelect` (hidden select sibling) did not receive it, producing jarring 12px vs 4px discrepancies.
   - Standardized all form field containers across Tab 1 (Site), Tab 2 (Customer Identity), Tab 3 (Billing Setup), and standalone billing settings by equipping them with `data-slot="field"`, `[&_input]:mt-0`, and `[&_textarea]:mt-0` alongside `flex flex-col gap-1`. Every field now strictly maintains an identical 4px (0.25rem) vertical distance.
   - Standardized row grid gaps to `gap-4` (16px) across all tabs with `leading-snug` on `<Label>`.
   - Reorganized `OrganizationIdentityFields` (Tab 2) into a cohesive 5-row layout (`name`|`code`, `legalName`|`taxId`, `taxBranch`|`documentEmail`, `taxAddress` [span 2], `contactName`|`phone`), eliminating irregular empty grid holes.
   - Configured Tab 3's payment reminders layout dynamically: "การทวงชำระเงิน" occupies 1 column, and enabling reminders immediately populates "เริ่มทวงหลังครบกำหนด (วัน)" in the right column of the same row.
   - Replaced `<input type="date">` with the project's standard Shadcn `DatePicker` component in `SiteServiceDialog`.

## Consequences
- The Sites table and filter options reflect real data and eliminate confusing/broken options.
- Visual hierarchy and spacing across the modal tabs are strictly uniform, compact, and aligned at 4px (`gap-1`).
- Date picking aligns with the design system's calendar popover.
- All empty grid holes in Tab 2 and Tab 3 are resolved into a balanced 2-column layout.
- All 721 API tests and 537 Web tests pass, and full production build succeeds with 0 errors.
