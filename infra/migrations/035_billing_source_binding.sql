CREATE TABLE billing_source_bindings (
 id uuid PRIMARY KEY,
 meter_id uuid NOT NULL REFERENCES billing_meters(id),
 site_id uuid NOT NULL REFERENCES sites(id),
 device_id uuid NOT NULL REFERENCES devices(id),
 profile_revision_id uuid NOT NULL REFERENCES payload_profile_revisions(id),
 source_tag text NOT NULL,
 canonical_tag text NOT NULL CHECK(canonical_tag='energy.active.import.total'),
 source_unit text NOT NULL,
 target_unit text NOT NULL CHECK(target_unit='kWh'),
 conversion text NOT NULL,
 measurement_purpose text NOT NULL CHECK(measurement_purpose IN ('solar-delivered','grid-import','facility-consumption','other')),
 purpose_description text,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(measurement_purpose<>'other' OR coalesce(length(trim(purpose_description)),0)>0)
);
CREATE TRIGGER billing_source_immutable BEFORE UPDATE OR DELETE ON billing_source_bindings FOR EACH ROW EXECUTE FUNCTION immutable_payload_revision();
ALTER TABLE billing_meters ADD COLUMN billing_source_binding_id uuid REFERENCES billing_source_bindings(id);
ALTER TABLE telemetry_raw ADD COLUMN billing_source_binding_id uuid REFERENCES billing_source_bindings(id);
CREATE INDEX telemetry_billing_source ON telemetry_raw(billing_source_binding_id,source_time) WHERE billing_source_binding_id IS NOT NULL;

