-- TOTP secrets use AES-256-GCM with user-bound AAD; plaintext is never persisted.
CREATE TABLE user_authenticators (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 secret_encrypted text,
 pending_secret_encrypted text,
 pending_expires_at timestamptz,
 last_counter bigint NOT NULL DEFAULT -1,
 recovery_hashes text[] NOT NULL DEFAULT '{}',
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 attempt_window_started_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (enabled = (secret_encrypted IS NOT NULL)),
 CHECK ((pending_secret_encrypted IS NULL) = (pending_expires_at IS NULL)),
 CHECK (NOT enabled OR pending_secret_encrypted IS NULL)
);
