-- Customer document defaults belong to the existing schools identity.
-- Contract tax columns and issued document snapshots are deliberately untouched.
ALTER TABLE schools
 ADD COLUMN legal_name text NOT NULL DEFAULT '',
 ADD COLUMN tax_id text NOT NULL DEFAULT '',
 ADD COLUMN tax_branch text NOT NULL DEFAULT '',
 ADD COLUMN tax_address text NOT NULL DEFAULT '',
 ADD COLUMN contact_name text NOT NULL DEFAULT '',
 ADD COLUMN phone text NOT NULL DEFAULT '',
 ADD COLUMN document_email text NOT NULL DEFAULT '';
-- Codes are trimmed and canonicalized by the API; enforce case-insensitive uniqueness too.
CREATE UNIQUE INDEX schools_code_normalized_unique ON schools (lower(btrim(code)));
ALTER TABLE schools ADD CONSTRAINT schools_tax_id_format CHECK (tax_id = '' OR tax_id ~ '^[0-9]{13}$');

