-- Additive local TEST workflow. Existing historical cycles are never assigned contracts.
ALTER TABLE billing_cycles ADD COLUMN contract_id uuid REFERENCES contracts(id), ADD COLUMN meter_snapshot jsonb, ADD COLUMN subtotal numeric(24,2), ADD COLUMN simulated_tax numeric(24,2), ADD COLUMN policy_hash text;
ALTER TABLE documents ADD COLUMN snapshot jsonb, ADD COLUMN content_hash text;
ALTER TABLE contracts ADD COLUMN payment_term_days integer CHECK(payment_term_days BETWEEN 0 AND 3650), ADD COLUMN recipient_user_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN email_verified_at timestamptz, ADD COLUMN verified_email text;
ALTER TABLE company_profile ADD COLUMN is_configured boolean NOT NULL DEFAULT true;
ALTER TABLE company_bank_accounts ADD COLUMN is_configured boolean NOT NULL DEFAULT true;
ALTER TABLE payments ADD COLUMN submitted_by uuid REFERENCES users(id), ADD COLUMN submitted_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX payments_cycle_status ON payments(billing_cycle_id,status);
CREATE TABLE local_financial_test_policy (id uuid PRIMARY KEY, fixture_marker text NOT NULL, environment_binding text NOT NULL, policy_hash text NOT NULL, policy jsonb NOT NULL, selected_by text NOT NULL, selected_at timestamptz NOT NULL DEFAULT now(), workflow_state text NOT NULL CHECK(workflow_state IN('verification_in_progress','verified')), workflow_evidence jsonb NOT NULL);
CREATE TABLE document_number_series (prefix text PRIMARY KEY, last_value bigint NOT NULL);
CREATE TABLE document_artifacts (document_id uuid PRIMARY KEY REFERENCES documents(id),pdf_bytes bytea NOT NULL,sha256 text NOT NULL CHECK(length(sha256)=64),created_at timestamptz NOT NULL DEFAULT now(),CHECK(octet_length(pdf_bytes)>8));
CREATE TABLE financial_month_jobs (id uuid PRIMARY KEY, site_id uuid NOT NULL REFERENCES sites(id), period_start date NOT NULL, period_end date NOT NULL,state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','blocked','done')),attempts integer NOT NULL DEFAULT 0,last_error text,completed_at timestamptz,UNIQUE(site_id,period_start));
CREATE TABLE financial_delivery_outbox (id uuid PRIMARY KEY,document_id uuid NOT NULL REFERENCES documents(id),state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','sending','sent','failed','uncertain')),attempts integer NOT NULL DEFAULT 0,last_error text,message_id text,artifact_sha256 text,completed_at timestamptz,UNIQUE(document_id));
CREATE FUNCTION preserve_local_issued_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN('issued','finalized','cancelled') AND (TG_OP='DELETE' OR (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') OR NEW.status NOT IN(OLD.status,'cancelled')) THEN RAISE EXCEPTION 'Issued documents are immutable'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER documents_immutable BEFORE UPDATE OR DELETE ON documents FOR EACH ROW EXECUTE FUNCTION preserve_local_issued_document();
CREATE FUNCTION preserve_local_artifact() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Issued PDF artifacts are immutable'; END $$;
CREATE TRIGGER document_artifact_immutable BEFORE UPDATE OR DELETE ON document_artifacts FOR EACH ROW EXECUTE FUNCTION preserve_local_artifact();
-- Unique issuance is scoped to new policy snapshots; legacy duplicates require explicit reconciliation.
CREATE UNIQUE INDEX documents_new_cycle_type ON documents(billing_cycle_id,document_type) WHERE snapshot IS NOT NULL;
