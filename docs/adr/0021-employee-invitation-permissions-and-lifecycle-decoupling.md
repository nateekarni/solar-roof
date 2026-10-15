# ADR 0021: Employee Invitation Permissions and Lifecycle Decoupling

Status: Accepted, 2026-10-16.

## Context
Previously, inviting an employee only captured basic info (name, email, and optional raw position string). Permissions and site scope had to be separately configured in a subsequent "จัดการสิทธิ์ (Manage permissions)" modal, which was prone to omissions. Furthermore, position selection in the employee editor forced a tight link between master presets and employee titles, potentially polluting the master preset list when unique company titles were typed. Additionally, employee deactivation was restricted to Owner accounts without direct row-level actions or reactivation options, and display names were read-only in the editor.

## Decision
1. **Integrated Add Employee Flow (`StaffInvitation`)**:
   - The "เพิ่มพนักงาน (Add employee)" dialog is expanded to a 2-tab modal matching the editor:
     - **ข้อมูลทั่วไป (General Details)**: Name, Email, and Position.
     - **สิทธิ์การใช้งานและไซต์ (Permissions & Site Scope)**: Permission matrix (`RuleMatrix`) and Site scope selector (`SiteScopeTable`).
   - Position selection uses a freeform combobox:
     - Users can type any custom company position string.
     - Users can search and pick an existing preset from the list, which auto-populates the permission matrix checkboxes.
     - Editing the position text afterward retains the selected permissions intact without clearing them.
   - `POST /v1/users/invite` accepts `companyPosition`, `permissions`, and `scope`, inserting both the user record and `employee_domain_grants` atomically in a single transaction.

2. **Renaming to "แก้ไขข้อมูล (Edit details)"**:
   - Action menu options and dialog titles are renamed from "จัดการสิทธิ์ (Manage permissions)" to "แก้ไขข้อมูล (Edit details)" and "แก้ไขข้อมูลพนักงาน (Edit employee details)".
   - In "แก้ไขข้อมูลพนักงาน", display name (`displayName`) is converted to an editable input, enabling admins to correct spelling errors and update position titles alongside permissions and site scopes.

3. **Unified Employee Lifecycle Management**:
   - Both **Owner** and **Admin** can manage employee lifecycle for `operator` and `accountant` roles.
   - Row-level 3-dot dropdowns provide direct access to:
     - "แก้ไขข้อมูล (Edit details)"
     - "ยกเลิกใช้งาน (Deactivate)" with a confirmation dialog and session revocation.
     - "เปิดใช้งานอีกครั้ง (Reactivate)" for employees currently in `inactive` status.
     - "ยกเลิกคำเชิญ (Cancel invitation)" for employees in `invited` status.
