# ADR 0025: Step-by-Step Staff Modal Navigation (Next / Back / Action Flow)

Status: Accepted, 2026-10-16.

## Context
In the staff management and permissions workspace (`/settings/staff-permissions`), the Add Employee (`StaffInvitation`) and Edit Employee (`EmployeeEditor`) dialogs organize onboarding details across two distinct tabs:
1. **ข้อมูลทั่วไป (General details)**: Name, email address, and company position.
2. **สิทธิ์การใช้งานและไซต์ (Permissions & site scope)**: Granular permission overrides matrix and site assignment scope.

Previously, even while on the first tab ("ข้อมูลทั่วไป"), the bottom-right primary action button displayed "ส่งคำเชิญ" (Send invitation) or "บันทึกข้อมูล" (Save details). This caused two usability problems:
- Users frequently submitted invitations or updates prematurely before navigating to the second tab to configure domain permissions and site scopes.
- Lack of guided progression made multi-tab onboarding feel unguided rather than a structured workflow.

## Decision
1. **Guided Stepper Action Flow on Tab 1 (`general`)**:
   - The primary action button at the bottom-right is labeled **"ถัดไป" (Next)** instead of "ส่งคำเชิญ" or "บันทึกข้อมูล".
   - Clicking "ถัดไป" performs step validation:
     - In `StaffInvitation`: Validates that `name` is non-empty and `email` matches standard email format (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`).
     - In `EmployeeEditor`: Validates that `name` is non-empty.
     - If validation fails, an inline error is displayed and the user remains on the first tab.
     - If validation passes, the active tab advances to `permissions`.
   - Pressing the `Enter` key within text inputs on Tab 1 triggers the "ถัดไป" step advancement rather than prematurely submitting the form.

2. **Final Action & "ย้อนกลับ" (Back) on Tab 2 (`permissions`)**:
   - The footer displays three actions:
     - **"ยกเลิก" (Cancel)** (secondary outline on the left)
     - **"ย้อนกลับ" (Back)** (secondary outline) — returns the view to Tab 1 (`general`)
     - **"ส่งคำเชิญ" (Send invitation)** in `StaffInvitation` / **"บันทึกข้อมูล" (Save details)** in `EmployeeEditor` (primary button).

3. **Decoupled Button Architecture & Chromium Re-render Protection**:
   - In Chromium and WebKit browsers, when a `<Button type="button">` ("ถัดไป") and `<Button type="submit">` ("ส่งคำเชิญ" / "บันทึกข้อมูล") are rendered conditionally at the same DOM slot without unique React `key`s, the browser completes the pending click event after reconciling the DOM element into a submit button. This immediately fired the parent `<form>`'s native `submit` event, causing premature submission of Tab 1.
   - To make step progression 100% immune to browser button mutation quirks:
     - The parent `<form>` sets `onSubmit={(e) => e.preventDefault()}` so native form submission is inert.
     - All footer buttons explicitly specify `type="button"` and execute their actions strictly through `onClick`.
     - Distinct React `key`s are assigned (`key="invite-cancel"`, `key="invite-back"`, `key="invite-next"`, `key="invite-submit"`, etc.).
     - Submitting functions (`submitInvitation` and `submitSave`) enforce hard step guards (`if (activeTab !== 'permissions') return;`).

4. **Non-Linear Tab Header Freedom**:
   - Users remain free to click the top tab buttons ("ข้อมูลทั่วไป" and "สิทธิ์การใช้งานและไซต์") directly at any point to inspect tabs out of order. The footer buttons act as a guided primary flow.

## Consequences
- Prevents premature submission of staff records with default or unintended access rights.
- Eliminates browser form submission races across DOM reconciliation.
- Provides a clear, intuitive 2-step onboarding experience matching user expectations across both create and edit dialogs.

