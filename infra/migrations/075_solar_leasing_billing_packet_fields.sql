ALTER TABLE site_billing_settings
  ADD COLUMN IF NOT EXISTS contract_number text,
  ADD COLUMN IF NOT EXISTS contract_signed_date date,
  ADD COLUMN IF NOT EXISTS total_installments integer NOT NULL DEFAULT 300 CHECK(total_installments > 0),
  ADD COLUMN IF NOT EXISTS recipient_title text NOT NULL DEFAULT 'ผู้อำนวยการ';

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS province text NOT NULL DEFAULT '';

ALTER TABLE company_profile
  ADD COLUMN IF NOT EXISTS letter_prefix text NOT NULL DEFAULT 'สฟ';

ALTER TABLE company_bank_accounts
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'ออมทรัพย์';
