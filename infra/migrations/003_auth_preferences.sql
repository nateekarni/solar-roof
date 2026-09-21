-- Migration 003: Auth and Preferences
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS refresh_token_hash text,
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'th',
  ADD COLUMN IF NOT EXISTS preferred_theme text NOT NULL DEFAULT 'system';
