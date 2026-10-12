ALTER TABLE gateways ADD COLUMN retired_at timestamptz;
ALTER TABLE gateways ADD COLUMN desired_config_version integer NOT NULL DEFAULT 0;
ALTER TABLE gateways ADD COLUMN published_config_version integer NOT NULL DEFAULT 0;
ALTER TABLE gateways ADD COLUMN acknowledged_config_version integer NOT NULL DEFAULT 0;
ALTER TABLE gateways ADD COLUMN applied_config_version integer NOT NULL DEFAULT 0;
ALTER TABLE devices ADD COLUMN expected_interval_seconds integer NOT NULL DEFAULT 60 CHECK(expected_interval_seconds BETWEEN 1 AND 86400);
ALTER TABLE devices ADD COLUMN poll_group_cadence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(poll_group_cadence)='object');
CREATE TABLE gateway_configuration_revisions (
 id uuid PRIMARY KEY,gateway_id uuid NOT NULL REFERENCES gateways(id),version integer NOT NULL CHECK(version>0),config jsonb NOT NULL,
 desired_at timestamptz NOT NULL DEFAULT now(),published_at timestamptz,acknowledged_at timestamptz,applied_at timestamptz,
 UNIQUE(gateway_id,version)
);
CREATE TABLE device_profile_assignments (
 device_id uuid NOT NULL REFERENCES devices(id),profile_revision_id uuid NOT NULL REFERENCES payload_profile_revisions(id),assigned_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(device_id,profile_revision_id)
);
INSERT INTO device_profile_assignments(device_id,profile_revision_id) SELECT id,payload_profile_revision_id FROM devices WHERE payload_profile_revision_id IS NOT NULL;
CREATE FUNCTION retain_device_profile_assignment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.payload_profile_revision_id IS NOT NULL THEN INSERT INTO device_profile_assignments(device_id,profile_revision_id) VALUES(NEW.id,NEW.payload_profile_revision_id) ON CONFLICT DO NOTHING; END IF;RETURN NEW;END $$;
CREATE TRIGGER device_profile_assignment AFTER INSERT OR UPDATE OF payload_profile_revision_id ON devices FOR EACH ROW EXECUTE FUNCTION retain_device_profile_assignment();
CREATE TABLE gateway_installation_history (
 id uuid PRIMARY KEY,gateway_id uuid NOT NULL REFERENCES gateways(id),site_id uuid NOT NULL REFERENCES sites(id),installed_at timestamptz NOT NULL DEFAULT now(),removed_at timestamptz,replaced_by_gateway_id uuid REFERENCES gateways(id)
);
INSERT INTO gateway_installation_history(id,gateway_id,site_id,installed_at) SELECT gen_random_uuid(),id,site_id,created_at FROM gateways;
CREATE TABLE measurement_comparison_pairs (
 id uuid PRIMARY KEY,gateway_id uuid NOT NULL REFERENCES gateways(id),left_device_id uuid NOT NULL REFERENCES devices(id),right_device_id uuid NOT NULL REFERENCES devices(id),left_tag text NOT NULL,right_tag text NOT NULL,kind text NOT NULL CHECK(kind IN ('energy','power')),
 relative_tolerance double precision NOT NULL DEFAULT 0.05 CHECK(relative_tolerance>=0 AND relative_tolerance<=1),absolute_floor double precision NOT NULL DEFAULT 0.1 CHECK(absolute_floor>=0),window_seconds integer NOT NULL DEFAULT 900 CHECK(window_seconds>=900),alert_enabled boolean NOT NULL DEFAULT false,commissioned_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),CHECK(left_device_id<>right_device_id),CHECK(NOT alert_enabled OR commissioned_at IS NOT NULL)
);
CREATE TABLE measurement_comparison_windows (
 pair_id uuid NOT NULL REFERENCES measurement_comparison_pairs(id),window_start timestamptz NOT NULL,window_end timestamptz NOT NULL,state text NOT NULL CHECK(state IN ('ok','mismatch','insufficient','invalid')),result jsonb NOT NULL,computed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(pair_id,window_start)
);
