# ADR 0039: Flat Content Card Architecture, Cross-Role Profile Modal, and Customer Popover Scoping

## Status
Accepted

## Context
1. **Profile Popover Route Leakage for Customer Users**:
   - In `apps/web/components/navigation/app-header.tsx`, the profile popover header rendered two links for all users: "การตั้งค่า" (`/settings`) and "บัญชีของฉัน" (`/settings/account`).
   - For `customer_user`, clicking "บัญชีของฉัน" navigated to the internal staff account page (`/settings/account`) exposing internal staff features (such as signature pad, internal position assignment, 2FA authenticator enrollment, etc.) which are not relevant or appropriate for customer organization users.
2. **Settings Page Double Card Nesting vs Flat Card Architecture**:
   - In `CustomerSettingsView`, each topic was initially wrapped in an outer `<Card className="rounded-xl border bg-card shadow-xs">`, and inside the card, content was redundantly wrapped in an inner card (`rounded-xl border bg-muted/20`).
   - The correct visual architecture requires 3 primary outer `<Card>` wrappers for the 3 main topics, while eliminating the inner nested boxes so that the content (contractual fields, account profile, and notification switches) sits directly on the card surface without nested border containers.
3. **Inconsistent Avatar Upload Workflow Across Roles**:
   - Previously, staff users on `/settings/account` had a separate `<OwnAvatar>` component on the card with its own "เปลี่ยนรูป" button outside the profile editing modal, while customer users lacked an avatar and edit affordance.
   - Profile management across all roles must be consistent: the profile card presents the user's avatar image, name, email, and position/role cleanly with a single "แก้ไขโปรไฟล์" (Edit Profile) button that opens a consolidated modal allowing both avatar image cropping/upload and profile metadata editing.
4. **Notification Settings Ergonomics**:
   - The notification preferences included a redundant email input field for invoice delivery, even though invoices and critical alerts are bound directly to the authenticated user's email.
   - Channel toggles used `<Checkbox>` instead of modern `<Switch>` controls, and required a manual "Save" button rather than immediate, seamless toggle persistence.
5. **Redundant Sign Out Button**:
   - A standalone red "ออกจากระบบ" (Sign Out) button was rendered at the bottom of `CustomerSettingsView`, duplicating the sign out option already permanently accessible from the top-right Profile Popover.

## Decision
1. **Scope Profile Popover for Customer Users**:
   - In `apps/web/components/navigation/app-header.tsx`, when `user.role === 'customer_user'`, replace the two internal links with a single navigation item labeled **"ข้อมูลองค์กรและบัญชี"** (`Organization & Account`), pointing to `/settings`.
   - Omit the `/settings/account` link completely for customer users, preventing accidental navigation to internal account configuration pages.
2. **Flat Content Architecture Inside 3 Outer Cards (`CustomerSettingsView`)**:
   - Wrap each section in an outer `<Card className="rounded-xl border bg-card shadow-xs">`:
     - **Card 1: ข้อมูลนิติบุคคลสำหรับเอกสาร (Legal Organization & Tax Info)**: Contains the prominent contractual info notice banner, followed directly by the `<dl>` detail grid on `CardContent` without an inner nested card.
     - **Card 2: บัญชีผู้ใช้งานของฉัน (My Account Profile)**: `<CardHeader>` contains title, description, and "แก้ไขโปรไฟล์" (Edit Profile) button. `<CardContent>` renders user avatar (`size-16`), name, email, and role badge directly on the card without an inner nested card.
     - **Card 3: การรับเอกสารและการแจ้งเตือน (Notifications & Document Delivery)**: `<CardHeader>` contains title, description, and auto-save feedback indicator. `<CardContent>` renders interactive `<Switch>` toggles separated by a clean `divide-y divide-border/60` list without individual nested boxes.
3. **Unified Avatar & Profile Edit Modal Across Roles**:
   - Standardize profile editing using `CustomerProfileModal` across customer settings and `/settings/account` (staff):
     - Displays avatar with camera overlay / upload trigger, with canvas-based cropping, zoom, and pan controls, persisting to `PUT /v1/me/avatar` and updating `authStore`.
     - Provides display name (`displayName`) input.
     - Supports optional company position (`companyPosition`) input for staff roles via `showPosition={true}`.
     - Displays login email as read-only with administrator contact guidance.
     - Replaces the separate card-level upload button on `/settings/account`.
4. **Modern Switch Toggles with Auto-Save**:
   - Convert alert channel checkboxes to `<Switch>` components.
   - Remove the custom notification recipient email input field.
   - Implement immediate auto-save on switch toggle via `PUT /v1/notifications/settings`, providing subtle real-time feedback and eliminating the manual form submission button.
5. **Eliminate Redundant Sign Out Button**:
   - Remove the bottom Sign Out button from `CustomerSettingsView`, relying solely on the persistent Profile Popover logout button.

## Consequences
- Customer users navigate exclusively to their designated "ข้อมูลองค์กรและบัญชี" view from both sidebar navigation and the top-right profile popover.
- The 3 main topics are consistently framed in clean outer cards without visually cluttered nested inner boxes.
- Both customer users and internal staff enjoy an identical, modern profile editing experience where photos and names/positions are managed within a single unified modal.
- Notification toggles behave intuitively with instant auto-save and zero redundant email input fields.
