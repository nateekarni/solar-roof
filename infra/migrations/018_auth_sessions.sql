-- Sessions are independent per device. NULL refresh_hash denotes a pending,
-- unusable allocation; existing user password/refresh fields are preserved.
CREATE TABLE auth_sessions (
  sid uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_hash text NULL CHECK (refresh_hash IS NULL OR refresh_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);