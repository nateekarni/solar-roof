-- Site service configuration is independent of contract originals. No implicit tax default.
ALTER TABLE company_profile ADD COLUMN signature_data_uri text;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM gateways GROUP BY site_id HAVING count(*)>1) THEN RAISE EXCEPTION 'Multiple gateways share a site; reconcile gateway ownership before migration 042'; END IF;
END $$;
CREATE UNIQUE INDEX gateways_one_per_site ON gateways(site_id);
CREATE TABLE site_billing_settings (
 site_id uuid PRIMARY KEY REFERENCES sites(id),version integer NOT NULL DEFAULT 1,
 service_start_date date NOT NULL,payment_term_days integer NOT NULL CHECK(payment_term_days BETWEEN 0 AND 3650),
 recipient_user_ids uuid[] NOT NULL DEFAULT '{}',tax_rate numeric(8,4) CHECK(tax_rate BETWEEN 0 AND 100),
 prices_include_tax boolean NOT NULL DEFAULT false,tax_confirmed boolean NOT NULL DEFAULT false,
 reminder_start_days integer CHECK(reminder_start_days>=0),reminder_interval_days integer CHECK(reminder_interval_days>0),reminders_enabled boolean NOT NULL DEFAULT false,
 updated_by uuid REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(NOT tax_confirmed OR tax_rate IS NOT NULL),
 CHECK(NOT reminders_enabled OR (reminder_start_days IS NOT NULL AND reminder_interval_days IS NOT NULL))
);
ALTER TABLE rate_versions ALTER COLUMN contract_id DROP NOT NULL;
ALTER TABLE rate_versions ADD COLUMN site_id uuid REFERENCES sites(id), ADD COLUMN changed_by uuid REFERENCES users(id), ADD COLUMN change_reason text;
-- Only migrate an unambiguous active legacy contract; preserve all original contracts/documents.
UPDATE rate_versions r SET site_id=c.site_id FROM contracts c WHERE c.id=r.contract_id AND c.status='active' AND (SELECT count(*) FROM contracts a WHERE a.site_id=c.site_id AND a.status='active')=1;
CREATE INDEX rate_versions_site_dates ON rate_versions(site_id,effective_from);
CREATE FUNCTION validate_site_rate_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.site_id IS NOT NULL THEN
  PERFORM id FROM sites WHERE id=NEW.site_id FOR UPDATE;
  IF NEW.effective_to IS NOT NULL AND NEW.effective_to<NEW.effective_from THEN RAISE EXCEPTION 'Invalid site rate date range'; END IF;
  IF EXISTS(SELECT 1 FROM rate_versions r WHERE r.site_id=NEW.site_id AND r.id<>NEW.id AND r.effective_from<=coalesce(NEW.effective_to,'infinity'::date) AND coalesce(r.effective_to,'infinity'::date)>=NEW.effective_from) THEN RAISE EXCEPTION 'Site rate periods overlap'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER site_rate_period_valid BEFORE INSERT OR UPDATE ON rate_versions FOR EACH ROW EXECUTE FUNCTION validate_site_rate_period();
CREATE TABLE tariff_catalog(id uuid PRIMARY KEY,name text NOT NULL,rate numeric(16,4) NOT NULL CHECK(rate>=0),created_by uuid REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE billing_cycles ADD COLUMN billing_settings_version integer,ADD COLUMN billing_kind text NOT NULL DEFAULT 'energy' CHECK(billing_kind IN('energy','manual')),ADD COLUMN manual_lines jsonb,ADD COLUMN billing_note text,ADD COLUMN due_date date;
ALTER TABLE billing_cycles DROP CONSTRAINT IF EXISTS billing_cycles_site_id_period_start_period_end_key;
CREATE UNIQUE INDEX billing_cycles_energy_period ON billing_cycles(site_id,period_start,period_end) WHERE billing_kind='energy';
ALTER TABLE documents ADD COLUMN revision integer NOT NULL DEFAULT 1,ADD COLUMN is_current boolean NOT NULL DEFAULT true,ADD COLUMN supersedes_document_id uuid REFERENCES documents(id);
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_billing_cycle_type_unique;
CREATE UNIQUE INDEX documents_legacy_cycle_type ON documents(billing_cycle_id,document_type) WHERE snapshot IS NULL;
DROP INDEX documents_new_cycle_type;
CREATE UNIQUE INDEX documents_new_cycle_revision ON documents(billing_cycle_id,document_type,revision) WHERE snapshot IS NOT NULL;
CREATE UNIQUE INDEX documents_new_cycle_current ON documents(billing_cycle_id,document_type) WHERE snapshot IS NOT NULL AND is_current;
CREATE OR REPLACE FUNCTION preserve_local_issued_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN('issued','finalized','cancelled','superseded') AND (TG_OP='DELETE' OR (to_jsonb(NEW)-'status'-'is_current') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'is_current') OR NEW.status NOT IN(OLD.status,'cancelled','superseded') OR (NOT OLD.is_current AND NEW.is_current)) THEN RAISE EXCEPTION 'Issued documents are immutable'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
