ALTER TABLE company_bank_accounts ADD COLUMN IF NOT EXISTS qr_code_url text NULL;

DROP TRIGGER IF EXISTS billing_source_immutable ON billing_source_bindings;
CREATE TRIGGER billing_source_immutable BEFORE UPDATE ON billing_source_bindings FOR EACH ROW EXECUTE FUNCTION immutable_payload_revision();
