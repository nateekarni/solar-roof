-- Migration 009: Company Profile, Bank Accounts, Contract Tax Info and Gateway Hardware Parameters

-- 1. Company Profile
CREATE TABLE IF NOT EXISTS company_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT 'บริษัท โซลาร์ เอ็นเนอร์ยี โซลูชั่นส์ จำกัด',
  tax_id text NOT NULL DEFAULT '0105565012345',
  branch text NOT NULL DEFAULT 'สำนักงานใหญ่',
  address text NOT NULL DEFAULT '999 อาคารดิจิทัลการ์เดนท์ ชั้น 22 ถนนวิภาวดีรังสิต แขวงจตุจักร เขตจตุจักร กรุงเทพฯ 10900',
  phone text NOT NULL DEFAULT '02-999-8888',
  email text NOT NULL DEFAULT 'billing@solarenergy.co.th',
  logo_url text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Company Bank Accounts
CREATE TABLE IF NOT EXISTS company_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name text NOT NULL DEFAULT 'ธนาคารกสิกรไทย (Kasikornbank)',
  bank_code text NOT NULL DEFAULT 'kbank',
  account_name text NOT NULL DEFAULT 'บจก. โซลาร์ เอ็นเนอร์ยี โซลูชั่นส์',
  account_number text NOT NULL DEFAULT '095-2-88899-1',
  branch_name text NOT NULL DEFAULT 'สาขาอโศก',
  promptpay_id text NOT NULL DEFAULT '0105565012345',
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Default seeds if tables empty
INSERT INTO company_profile (id, company_name, tax_id, branch, address, phone, email)
SELECT '00000000-0000-0000-0000-000000000091'::uuid, 'บริษัท โซลาร์ เอ็นเนอร์ยี โซลูชั่นส์ จำกัด', '0105565012345', 'สำนักงานใหญ่', '999 อาคารดิจิทัลการ์เดนท์ ชั้น 22 ถนนวิภาวดีรังสิต แขวงจตุจักร เขตจตุจักร กรุงเทพฯ 10900', '02-999-8888', 'billing@solarenergy.co.th'
WHERE NOT EXISTS (SELECT 1 FROM company_profile);

INSERT INTO company_bank_accounts (id, bank_name, bank_code, account_name, account_number, branch_name, promptpay_id, is_default)
SELECT '00000000-0000-0000-0000-000000000092'::uuid, 'ธนาคารกสิกรไทย (Kasikornbank)', 'kbank', 'บจก. โซลาร์ เอ็นเนอร์ยี โซลูชั่นส์', '095-2-88899-1', 'สาขาอโศก', '0105565012345', true
WHERE NOT EXISTS (SELECT 1 FROM company_bank_accounts);

-- 3. Extend Contracts with Tax Invoice details
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS tax_id text NULL;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS company_name text NULL;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS branch text NULL DEFAULT 'สำนักงานใหญ่';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS tax_address text NULL;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS billing_email text NULL;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS billing_phone text NULL;

-- 4. Extend Gateways with Interval and Alert Rules
ALTER TABLE gateways ADD COLUMN IF NOT EXISTS polling_interval_seconds integer NOT NULL DEFAULT 10;
ALTER TABLE gateways ADD COLUMN IF NOT EXISTS alert_rules jsonb NOT NULL DEFAULT '{"voltageMin": 200, "voltageMax": 250, "frequencyMin": 48, "frequencyMax": 52, "offlineTimeoutSec": 120}'::jsonb;
