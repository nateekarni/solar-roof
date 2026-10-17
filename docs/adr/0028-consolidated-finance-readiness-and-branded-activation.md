# ADR 0028: Consolidated Financial Readiness Card and Branded Account Activation

Status: Accepted, 2026-10-16.

## Context
1. **Financial Readiness Card Sprawl**:
   - On `/settings/company`, the `FinanceReadinessCard` ("ความพร้อมสำหรับการเงินจริง") dynamically created a separate accordion item for each solar roof site in the system (`site:${item.siteId}`).
   - In installations with many sites (e.g., 11+ sites), this resulted in 11+ repetitive rows all titled "ความพร้อมของไซต์งาน 6 รายการ", pushing other settings far below the fold and overwhelming the operator.
   - The user requested a concise, readable single-card design ("อ่านได้ในใบเดียว") that groups related items into fewer high-level steps.

2. **Invitation Email and Activation Flow**:
   - The current invitation email was plain text, lacked company branding/logo, and sent an English-only notice.
   - When users clicked `/activate?token=...`, the activation form only had password inputs; it lacked auto-filled recipient name, editable name fields, and avatar image configuration.
   - Furthermore, avatar images must not consume storage space until the user actually confirms and activates the account ("ถ้ายังไม่ยืนยันการส่งข้อมูลจะถือว่าข้อมูลไม่ถูกเก็บในระบบเพื่อประหยัดพื้นที่ storage").

## Decision

1. **Consolidated Financial Readiness Card (`FinanceReadinessCard`)**:
   - Group all checklist items into 3 high-level categories plus the final Owner confirmation:
     1. **ข้อมูลบริษัทและบัญชีหลัก (Company & Bank Profile)**: Missing corporate information (e.g., Logo, Tax ID, Default Bank Account) with direct `[ตั้งค่า]` links.
     2. **ความพร้อมของไซต์งาน (Sites Readiness)**: Consolidated summary of all sites (e.g., "พร้อมแล้ว X จาก Y ไซต์งาน") with an expandable compact table / dialog revealing individual site deficiencies, rather than repeating an accordion item per site.
     3. **ระบบบริการและส่งเอกสาร (System & Delivery Services)**: Environment and technical checks (SMTP, billing scheduler, financial writes).
     4. **การยืนยันโดยเจ้าของ (Owner Confirmation)**: Explicit confirmation button once required prerequisites are met.
   - Preserves high-level progress bar and keeps the entire card readable in a single viewport.

2. **Branded Formal Invitation Email**:
   - Uses a professional HTML template with corporate header embedding the company's uploaded logo (`company_profile.logo_data` or `logo_url`) and official company name.
   - Bilingual (Thai / English) copy detailing the user's invited role and responsibilities.
   - Prominent Call-to-Action button `[เปิดใช้งานบัญชีผู้ใช้ / Activate Account]` linking to `/activate?token=...`, along with an explicit 24-hour expiration security notice and alternative text version.

3. **Invitation Metadata Endpoint**:
   - Introduce public endpoint `GET /v1/auth/invitation-details?token=...`.
   - Validates the token hash and returns the recipient's `email`, pre-filled `displayName`, invited `role`, and the inviting organization's `companyName` and `logoUrl`.

4. **Zero-Storage In-Memory Avatar Upload & Account Activation**:
   - On the `/activate` page:
     - Automatically displays company branding (name and logo).
     - Pre-fills `displayName` from invitation details, allowing the user to adjust their name.
     - Provides an Avatar image selector with real-time in-browser preview (Object URL / Data URL).
     - **No server uploads or temporary files** are created during selection; image data is held purely in browser client state.
     - On form submission, `POST /v1/auth/activate` sends `{ token, password, displayName, avatarData }`.
     - The backend activates the user, updates `display_name`, and stores `avatar_data` (under the 2MB data limit) in a single atomic transaction.
   - Displays a congratulatory welcome card summarizing the user's role and grants, with an immediate `[เข้าสู่ระบบเพื่อเริ่มใช้งาน]` button to facilitate direct permission testing.

## Consequences
- The financial readiness card is compact, elegant, and scales gracefully to dozens of sites without UI clutter.
- Invited staff and customer users receive a trustworthy, branded invitation matching enterprise standards.
- Activation flow captures custom avatars and updated names seamlessly without generating orphaned storage files.
- The invited staff can immediately sign in and verify their individual domain permissions.
