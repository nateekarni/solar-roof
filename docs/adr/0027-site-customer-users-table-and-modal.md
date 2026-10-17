# ADR 0027: Site Customer Users Table and Invitation Modal Architecture

Status: Accepted, 2026-10-16.

## Context
On the site details page (`/records/sites/:id`), business managers (Owner) need to manage customer user accounts associated with the site (e.g., inviting representatives from the client organization to view solar generation, access invoices/receipts, and submit payment slips).

Previously:
- Customer user management was tucked away inside an administrative tab in `SiteCustomerUsers` with simple cards rather than an interactive tabular view.
- Customer users lacked explicit phone number tracking on the user entity.
- Lifecycle actions (cancel invitation, resend invite, suspend/reactivate, revoke site access) were not unified into a standard 3-dot action menu.
- The invitation dialog was basic and did not match the high-fidelity UI established by the staff permissions workspace (`StaffInvitation`).

## Decision
1. **Dedicated Site Users Section on Detail Page**:
   - The site details page includes a dedicated **"ผู้ใช้งานของไซต์งาน" (Site users)** section directly on the page for `owner` role.
   - Header contains title, subtitle ("ผู้ใช้งานเหล่านี้สามารถดูภาพรวม ตรวจสอบเอกสาร และส่งหลักฐานการชำระเงินของไซต์นี้"), and "+ เพิ่มผู้ใช้" (Add user) action button.
   - Data rendered in an interactive `<DataTable>` displaying:
     1. ชื่อผู้ใช้ (User name / Display name)
     2. อีเมล (Email)
     3. เบอร์โทรศัพท์ (Phone number)
     4. สถานะ (Status badge: ใช้งานอยู่ `active`, รอการตอบรับ `invited`, ถูกระงับ `disabled`)
     5. เมนูจัดการ (3-dot dropdown menu)

2. **3-Dot Action Menu Lifecycle Operations**:
   - For `invited` status:
     - `แก้ไขข้อมูล` (Edit Name & Phone)
     - `ส่งคำเชิญใหม่` (Resend Invitation Email)
     - `ยกเลิกการเชิญ` (Cancel / Revoke Invitation)
   - For `active` status:
     - `แก้ไขข้อมูล` (Edit Name & Phone)
     - `ระงับการใช้งาน` (Suspend / Deactivate User)
     - `ถอนสิทธิ์ออกจากไซต์นี้` (Revoke Site Access)
   - For `disabled` status:
     - `เปิดใช้งานอีกครั้ง` (Reactivate User)
     - `ถอนสิทธิ์ออกจากไซต์นี้` (Revoke Site Access)

3. **Single-Step Customer User Invitation Modal**:
   - Replicates the aesthetic of `StaffInvitation` (Avatar preview with initial letter, responsive grid, clear placeholder examples for all fields).
   - Fields: Name (ชื่อ-นามสกุล), Email (อีเมล), Phone (เบอร์โทรศัพท์).
   - Explicit scope notice: "ผู้ใช้งานนี้จะได้รับสิทธิ์เข้าถึงเฉพาะไซต์งานนี้ สำหรับดูภาพรวม ตรวจสอบเอกสาร และอัปโหลดหลักฐานการชำระเงิน".
   - No permissions tab (Customer user role is pre-bound to site view, billing documents, and payment evidence submission).
   - Form uses decoupled `type="button"` with `preventDefault()`.

4. **Database & API Extensions**:
   - Migration `061_user_phone_number.sql`: Adds `phone text` column to `users` table.
   - Updates `SiteCustomerUsersService` and endpoints:
     - Returns `phone` in `list()`.
     - Accepts and stores `phone` in `invite()` and `update()`.
     - Supports cancellation and reactivation endpoints/actions.
   - Strictly preserves Owner-only authorization boundary (`role === 'owner'`).

## Consequences
- Business owners have a comprehensive, tabular view of all client accounts tied to each solar roof site.
- Account lifecycle (inviting, canceling, resending, suspending) is clean, audited, and error-resilient.
- Database cleanly stores user contact phone numbers alongside customer organization phone records.
