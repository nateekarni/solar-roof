# ADR 0017: Position Unification and Permission Preset Decoupling

Status: Accepted, 2026-10-15.

## Context
In the My Account settings, users previously had redundant fields: "บทบาท (Role)" in the profile card and read-only "ตำแหน่งในบริษัท (Company position)" in the document card. Users could not edit their official company position themselves, creating friction when issuing documents with the correct official signatory title. Furthermore, when inviting staff or creating users, the role selection implicitly suggested a rigid job title rather than a permission preset.

## Decision
1. **Unify Position into Personal Profile**:
   - In "บัญชีของฉัน (My Account)", Card 1 ("โปรไฟล์ของคุณ / Your profile") replaces the "บทบาท (Role)" row with "ตำแหน่ง (Position / Company Position)".
   - In the "แก้ไขโปรไฟล์ (Edit profile)" dialog, users can edit both their "ชื่อที่แสดง (Display name)" and "ตำแหน่ง (Position / Company Position)".
   - Card 2 ("ลายเซ็นสำหรับเอกสาร / Document signature") is dedicated purely to the user's document signature, removing the redundant read-only company position display.
2. **Endpoint Enhancement**:
   - `PUT /v1/me/profile` is expanded to accept optional `companyPosition` alongside `displayName`.
   - Modifying `companyPosition` inserts or matches existing positions in `employee_positions` via `employee_position_name_key(name)` and updates `users.company_position_id`.
   - Updating position updates future document snapshots immediately without modifying the user's infrastructure security role or permission scopes.
3. **Decouple Role from Official Title in Invitation Dialogs**:
   - In user invitation and staff dialogs, the role dropdown is presented as "ชุดสิทธิ์เริ่มต้น (Permission Preset)" / "Permission Preset".
   - An explicit input for "ตำแหน่ง (Position / Company Position)" is provided so the user's actual official title can be set independently of the permission template selected.
