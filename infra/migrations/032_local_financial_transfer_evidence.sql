-- Only new transfer submissions participate; legacy evidence remains untouched.
CREATE UNIQUE INDEX payments_new_active_evidence ON payments(evidence_key) WHERE submitted_by IS NOT NULL AND evidence_key IS NOT NULL AND status IN('pending_verification','paid');
CREATE UNIQUE INDEX payments_new_active_slip ON payments(slip_url) WHERE submitted_by IS NOT NULL AND slip_url IS NOT NULL AND status IN('pending_verification','paid');
ALTER TABLE financial_delivery_outbox ADD COLUMN delivered_user_ids uuid[] NOT NULL DEFAULT '{}';
