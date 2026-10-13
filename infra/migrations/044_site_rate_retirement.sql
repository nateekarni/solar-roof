-- Preserve replaced future tariffs rather than deleting their original rows.
ALTER TABLE rate_versions ADD COLUMN retired_at timestamptz,ADD COLUMN retired_by uuid REFERENCES users(id);
CREATE OR REPLACE FUNCTION validate_site_rate_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.site_id IS NOT NULL AND NEW.retired_at IS NULL THEN
  PERFORM id FROM sites WHERE id=NEW.site_id FOR UPDATE;
  IF NEW.effective_to IS NOT NULL AND NEW.effective_to<NEW.effective_from THEN RAISE EXCEPTION 'Invalid site rate date range'; END IF;
  IF EXISTS(SELECT 1 FROM rate_versions r WHERE r.site_id=NEW.site_id AND r.retired_at IS NULL AND r.id<>NEW.id AND r.effective_from<=coalesce(NEW.effective_to,'infinity'::date) AND coalesce(r.effective_to,'infinity'::date)>=NEW.effective_from) THEN RAISE EXCEPTION 'Site rate periods overlap'; END IF;
 END IF;
 RETURN NEW;
END $$;
