-- Only newly issued documents in the audited path may create their first PDF.
-- Existing legacy snapshots never acquire regeneration permission implicitly.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS render_eligible boolean NOT NULL DEFAULT false;
