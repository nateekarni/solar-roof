# ADR 0029: Dedicated Setup Checklist Page and Interactive Company Logo Box

## Status
Accepted

## Context
In previous iterations, the production financial readiness checklist (`FinanceReadinessCard`) was rendered directly on `/settings/company` above the Company Profile and Bank Accounts cards. As the system scaled to multiple sites and settings, hosting this large checklist on the company profile page cluttered the view and created an excessively wide, repetitive list. Furthermore, the company logo field used browser-default `<input type="file">` ("Choose file No file chosen") with redundant badges that degraded visual polish.

The Owner requires:
1. Decoupling the setup checklist from `/settings/company` into a dedicated route `/settings/readiness` titled "รายการข้อมูลที่ต้องตั้งค่าก่อนเริ่มใช้งาน (Setup Checklist Before Go-Live)".
2. Pinning an un-dismissable notification at the top of the notification bell feed linking to `/settings/readiness` until 100% of owner configuration requirements are satisfied.
3. Compact site readiness format displaying `(X/Y) [Site Name]` with an immediate `[ตั้งค่า]` navigation button directly beside the site name, saving horizontal and vertical space.
4. Redesigning the company logo component into an elegant framed box:
   - In view mode: displays the uploaded logo or a `CameraOff` placeholder indicating no logo is set.
   - In edit mode: transforms into an interactive drop/click-to-upload box with an upload icon, eliminating default file input chrome.
   - Removing the duplicate document usage badge already explained in the card description.

## Decision
1. **API Schema Enhancement**:
   - Update `FinancialReadinessItem` in `@solar/api-contracts` and `FinancialReadinessService` in `@solar/api` to optionally provide `siteName?: string` alongside `siteId`.
2. **Dedicated Route `/settings/readiness`**:
   - Create `/settings/readiness` under the settings module, accessible to `owner`.
   - Render the Go-Live Setup Checklist, overall progress bar, company profile setup status, compact site readiness rows formatted as `(X/Y) [Site Name]`, and the Owner Confirmation button.
3. **Notification Feed Pinning**:
   - In `NotificationFeedService` and `notification-bell.tsx`, pin the setup checklist item at index 0 of the feed with an "Action Required" badge, destination `/settings/readiness`, remaining active until all owner requirements are fulfilled.
4. **Company Settings Streamlining**:
   - Remove `FinanceReadinessCard` from `/settings/company/page.tsx`.
   - In `CompanyProfileCard`:
     - Remove the secondary badge `"ใช้ในเอกสารที่ออกจากระบบ เช่น ใบวางบิล"`.
     - Replace the raw file input with an interactive `CompanyLogoField` box displaying `CameraOff` when empty and `Upload` with click-to-browse affordance during editing.

## Consequences
- `/settings/company` becomes a focused, clean corporate profile and bank account management page.
- Onboarding and setup debt are surfaced prominently in the notification bell and managed in a dedicated, distraction-free checklist page.
- Visual consistency and user experience for logo uploads match modern design standards without browser-native file picker clutter.
