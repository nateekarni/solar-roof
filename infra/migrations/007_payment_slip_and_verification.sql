ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount numeric(24,8) NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS slip_url text NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_at timestamptz NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_by uuid NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS rejection_reason text NULL;
