-- Local revisions remain immutable and may only be attached to their owning device.
ALTER TABLE payload_profile_revisions ADD COLUMN owner_device_id uuid REFERENCES devices(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE payload_profile_revisions ADD COLUMN source_preset_revision_id uuid REFERENCES payload_profile_revisions(id);
ALTER TABLE payload_profile_revisions ADD CONSTRAINT local_profile_lineage CHECK(source_preset_revision_id IS NULL OR owner_device_id IS NOT NULL);
CREATE INDEX payload_profile_owner ON payload_profile_revisions(owner_device_id) WHERE owner_device_id IS NOT NULL;
CREATE FUNCTION validate_device_local_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM payload_profile_revisions p WHERE p.id=NEW.payload_profile_revision_id AND p.owner_device_id IS NOT NULL AND p.owner_device_id<>NEW.id) THEN RAISE EXCEPTION 'Local profile belongs to another device'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER device_local_profile_owner BEFORE INSERT OR UPDATE OF payload_profile_revision_id ON devices FOR EACH ROW EXECUTE FUNCTION validate_device_local_profile();
