ALTER TABLE user_authenticators DROP CONSTRAINT user_authenticators_check;
ALTER TABLE user_authenticators ADD COLUMN method text NOT NULL DEFAULT 'totp' CHECK(method IN ('totp','email'));
ALTER TABLE user_authenticators ADD COLUMN pending_method text CHECK(pending_method IN ('totp','email'));
ALTER TABLE user_authenticators ADD CONSTRAINT enabled_factor CHECK (NOT enabled OR (method='email' OR secret_encrypted IS NOT NULL));
CREATE TABLE user_email_otp (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 purpose text NOT NULL CHECK(purpose IN ('login','enroll','disable','reset')),
 code_hash text NOT NULL,target text NOT NULL,expires_at timestamptz NOT NULL,
 sent_at timestamptz NOT NULL DEFAULT now(), consumed_at timestamptz,
 PRIMARY KEY(user_id,purpose)
);
CREATE TABLE user_password_resets (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,target text NOT NULL,expires_at timestamptz NOT NULL,
 requested_at timestamptz NOT NULL DEFAULT now(), consumed_at timestamptz
);
