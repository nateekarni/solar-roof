-- Keep 043 immutable: a lease and ownership token distinguish abandoned claims
-- from a send that may already have reached SMTP. Existing sending rows are
-- immediately eligible for reconciliation; attempt markers remain authoritative.
ALTER TABLE operational_delivery_outbox ADD COLUMN claimed_at timestamptz,ADD COLUMN claim_token uuid;
ALTER TABLE payment_decision_outbox ADD COLUMN claimed_at timestamptz,ADD COLUMN claim_token uuid;
