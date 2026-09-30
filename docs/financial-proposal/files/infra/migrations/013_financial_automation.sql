-- Additive automation schema. No sample configuration or recipients are inserted.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_email text;
CREATE TABLE financial_scheduler_cursor (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 next_month date NOT NULL
);
-- Begin with the last closed month only; older historical periods require explicit reconciliation.
INSERT INTO financial_scheduler_cursor VALUES(true,(date_trunc('month',now() AT TIME ZONE 'Asia/Bangkok')-interval '1 month')::date);
CREATE TABLE financial_month_jobs (
 id uuid PRIMARY KEY, site_id uuid NOT NULL REFERENCES sites(id), period_start date NOT NULL,
 period_end date NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','blocked','done')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 last_error text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 UNIQUE(site_id,period_start)
);
CREATE TABLE document_artifacts (
 document_id uuid PRIMARY KEY REFERENCES documents(id), pdf_bytes bytea NOT NULL,
 sha256 text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(octet_length(pdf_bytes)>8), CHECK(length(sha256)=64)
);
CREATE FUNCTION preserve_document_artifact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Issued PDF artifacts are immutable'; END $$;
CREATE TRIGGER document_artifact_immutable BEFORE UPDATE OR DELETE ON document_artifacts
 FOR EACH ROW EXECUTE FUNCTION preserve_document_artifact();
CREATE TABLE financial_delivery_outbox (
 id uuid PRIMARY KEY, document_id uuid NOT NULL REFERENCES documents(id), purpose text NOT NULL DEFAULT 'issue',
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','retry','sent','failed','paused','uncertain','cancelled')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), last_error text,
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 UNIQUE(document_id,purpose)
);
CREATE TABLE financial_delivery_attempts (
 id uuid PRIMARY KEY, outbox_id uuid NOT NULL REFERENCES financial_delivery_outbox(id), attempt integer NOT NULL,
 user_id uuid REFERENCES users(id), email text, state text NOT NULL CHECK(state IN('sending','sent','failed','skipped','uncertain')),
 message_id text, artifact_sha256 text, error text, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE INDEX financial_delivery_ready ON financial_delivery_outbox(next_attempt_at) WHERE state IN('pending','retry','paused');
CREATE TABLE financial_staff_notices (
 id uuid PRIMARY KEY, dedupe_key text NOT NULL UNIQUE, site_id uuid REFERENCES sites(id), kind text NOT NULL,
 detail jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
