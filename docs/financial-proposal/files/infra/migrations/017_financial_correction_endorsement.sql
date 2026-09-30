-- Separate automatic evidence impacts from two-person financial authorization.
ALTER TABLE financial_corrections ADD COLUMN financial_requested_by uuid REFERENCES users(id);
ALTER TABLE financial_corrections ADD COLUMN financial_requested_at timestamptz;
-- Existing pending requests have not been financially endorsed; never infer role from old actor IDs.
UPDATE financial_corrections SET status='pending_financial_request' WHERE status='pending_approval';
ALTER TABLE financial_corrections ADD CONSTRAINT correction_financial_separation CHECK(approved_by IS NULL OR (financial_requested_by IS NOT NULL AND approved_by<>financial_requested_by)) NOT VALID;
-- Existing approved rows remain unchanged for explicit reconciliation; new writes enforce separation.
