-- Migration 006: Missing Indexes and Constraints for Performance and Integrity

CREATE INDEX IF NOT EXISTS users_school_id_idx ON users(school_id) WHERE school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS billing_cycles_site_period_idx ON billing_cycles(site_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS documents_site_type_idx ON documents(site_id, document_type);
CREATE INDEX IF NOT EXISTS contracts_site_id_idx ON contracts(site_id, status);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events(actor_id, occurred_at DESC);

-- Ensure 1 invoice / document per billing cycle & document type for idempotent worker generation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_billing_cycle_type_unique'
  ) THEN
    ALTER TABLE documents ADD CONSTRAINT documents_billing_cycle_type_unique UNIQUE (billing_cycle_id, document_type);
  END IF;
END $$;
