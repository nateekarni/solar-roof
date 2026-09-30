CREATE TABLE IF NOT EXISTS email_verification_challenges (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 email text NOT NULL,
 code_hash text NOT NULL,
 requested_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5)
);
