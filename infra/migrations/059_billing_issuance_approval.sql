-- Replacement proposals do not mutate the currently issued original.
CREATE TABLE billing_replacement_drafts (
  id uuid PRIMARY KEY,
  billing_cycle_id uuid NOT NULL REFERENCES billing_cycles(id),
  supersedes_document_id uuid NOT NULL REFERENCES documents(id),
  rate numeric(20,8) NOT NULL,
  amount numeric(24,8) NOT NULL,
  snapshot jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('pending_issue_approval','issued','cancelled')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX billing_replacement_one_pending
  ON billing_replacement_drafts(billing_cycle_id)
  WHERE status='pending_issue_approval';
