CREATE TABLE financial_readiness_approvals (
  id uuid PRIMARY KEY,
  scope text NOT NULL CHECK (scope = 'PRODUCTION'),
  config_hash text NOT NULL CHECK (config_hash ~ '^[a-f0-9]{64}$'),
  snapshot jsonb NOT NULL,
  approved_by uuid NOT NULL REFERENCES users(id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES users(id),
  revoke_reason text,
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);

CREATE UNIQUE INDEX financial_readiness_one_active_production
  ON financial_readiness_approvals(scope) WHERE revoked_at IS NULL;

ALTER TABLE billing_cycles ADD COLUMN policy_snapshot jsonb;
ALTER TABLE billing_cycles ADD COLUMN financial_scope text
  CHECK (financial_scope IN ('TEST', 'PRODUCTION'));
