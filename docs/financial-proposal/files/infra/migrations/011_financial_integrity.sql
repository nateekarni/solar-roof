-- Financial provenance, durable numbering and immutable issued snapshots.
CREATE TABLE IF NOT EXISTS document_number_series (prefix text PRIMARY KEY, last_value bigint NOT NULL);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS snapshot jsonb;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE billing_cycles ADD COLUMN IF NOT EXISTS meter_snapshot jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS documents_cycle_type_unique ON documents(billing_cycle_id, document_type) WHERE billing_cycle_id IS NOT NULL;
ALTER TABLE company_profile ALTER COLUMN company_name DROP DEFAULT, ALTER COLUMN tax_id DROP DEFAULT, ALTER COLUMN branch DROP DEFAULT, ALTER COLUMN address DROP DEFAULT, ALTER COLUMN phone DROP DEFAULT, ALTER COLUMN email DROP DEFAULT;
ALTER TABLE company_bank_accounts ALTER COLUMN bank_name DROP DEFAULT, ALTER COLUMN bank_code DROP DEFAULT, ALTER COLUMN account_name DROP DEFAULT, ALTER COLUMN account_number DROP DEFAULT, ALTER COLUMN branch_name DROP DEFAULT, ALTER COLUMN promptpay_id DROP DEFAULT;
-- Keep every stored record. Only hide an untouched, exactly identified migration009
-- sample from active configuration. User-modified values (including optional logo,
-- bank label, branch, default flag and any extra columns) are never changed.
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS is_configured boolean NOT NULL DEFAULT true;
ALTER TABLE company_bank_accounts ADD COLUMN IF NOT EXISTS is_configured boolean NOT NULL DEFAULT true;
UPDATE company_profile p SET is_configured=false
WHERE (to_jsonb(p)-'updated_at'-'is_configured') = jsonb_build_object(
 'id','00000000-0000-0000-0000-000000000091',
 'company_name','บริษัท โซลาร์ เอ็นเนอร์ยี โซลูชั่นส์ จำกัด',
 'tax_id','0105565012345','branch','สำนักงานใหญ่',
 'address','999 อาคารดิจิทัลการ์เดนท์ ชั้น 22 ถนนวิภาวดีรังสิต แขวงจตุจักร เขตจตุจักร กรุงเทพฯ 10900',
 'phone','02-999-8888','email','billing@solarenergy.co.th','logo_url',NULL);
UPDATE company_bank_accounts b SET is_configured=false
WHERE (to_jsonb(b)-'created_at'-'updated_at'-'is_configured') = jsonb_build_object(
 'id','00000000-0000-0000-0000-000000000092',
 'bank_name','ธนาคารกสิกรไทย (Kasikornbank)','bank_code','kbank',
 'account_name','บจก. โซลาร์ เอ็นเนอร์ยี โซลูชั่นส์','account_number','095-2-88899-1',
 'branch_name','สาขาอโศก','promptpay_id','0105565012345','is_default',true);
CREATE OR REPLACE FUNCTION preserve_issued_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('issued','finalized','cancelled') AND (TG_OP='DELETE' OR (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') OR NEW.status NOT IN (OLD.status,'cancelled')) THEN
  RAISE EXCEPTION 'Issued documents are immutable; cancel and issue a correction';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS documents_immutable ON documents;
CREATE TRIGGER documents_immutable BEFORE UPDATE OR DELETE ON documents FOR EACH ROW EXECUTE FUNCTION preserve_issued_document();

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_term_days integer CHECK(payment_term_days BETWEEN 0 AND 3650);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS recipient_user_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE billing_cycles ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES contracts(id);
CREATE UNIQUE INDEX IF NOT EXISTS billing_contract_period_unique ON billing_cycles(contract_id,period_start,period_end) WHERE contract_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS evidence_readings (
 id uuid PRIMARY KEY, billing_meter_id uuid NOT NULL REFERENCES billing_meters(id), source_time timestamptz NOT NULL,
 value numeric NOT NULL CHECK(value>=0), evidence text NOT NULL CHECK(length(trim(evidence))>0), reason text NOT NULL CHECK(length(trim(reason))>0),
 entered_by uuid NOT NULL REFERENCES users(id), approved_by uuid NOT NULL REFERENCES users(id), approved_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS financial_corrections (
 id uuid PRIMARY KEY, billing_cycle_id uuid NOT NULL REFERENCES billing_cycles(id), evidence_reading_id uuid NOT NULL REFERENCES evidence_readings(id),
 requested_by uuid NOT NULL REFERENCES users(id), approved_by uuid REFERENCES users(id), reason text NOT NULL,
 original_amount numeric NOT NULL, proposed_amount numeric NOT NULL, impact_amount numeric NOT NULL,
 status text NOT NULL DEFAULT 'pending_approval', requested_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz,
 CHECK(approved_by IS NULL OR approved_by<>requested_by));
