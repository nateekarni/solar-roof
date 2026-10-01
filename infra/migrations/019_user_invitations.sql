CREATE TABLE user_invitations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  issuer_id uuid NOT NULL REFERENCES users(id),
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','admin','operator','accountant','school_user')),
  school_id uuid REFERENCES schools(id),
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash)=64),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  delivery_status text NOT NULL CHECK (delivery_status IN ('pending_delivery','sent','delivery_failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_invitations_expiry_idx ON user_invitations(expires_at) WHERE consumed_at IS NULL;
-- Atomic shared limits survive process restarts and apply across API replicas.
CREATE TABLE invitation_rate_limits (
  key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL CHECK (attempts >= 0)
);
