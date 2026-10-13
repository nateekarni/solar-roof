-- Complete durable reconciliation after the immutable initial gateway schema.
INSERT INTO device_profile_assignments(device_id,profile_revision_id) SELECT DISTINCT device_id,profile_revision_id FROM payload_messages ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION immutable_configuration_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.gateway_id IS DISTINCT FROM OLD.gateway_id OR NEW.version IS DISTINCT FROM OLD.version OR NEW.config IS DISTINCT FROM OLD.config OR NEW.desired_at IS DISTINCT FROM OLD.desired_at THEN RAISE EXCEPTION 'Gateway configuration snapshots are immutable'; END IF;RETURN NEW;END $$;
DROP TRIGGER IF EXISTS gateway_config_identity_immutable ON gateway_configuration_revisions;
CREATE TRIGGER gateway_config_identity_immutable BEFORE UPDATE ON gateway_configuration_revisions FOR EACH ROW EXECUTE FUNCTION immutable_configuration_identity();
DROP INDEX IF EXISTS gateways_one_per_site;
CREATE UNIQUE INDEX IF NOT EXISTS gateways_one_active_site ON gateways(site_id) WHERE retired_at IS NULL;
CREATE OR REPLACE FUNCTION record_gateway_installation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' THEN INSERT INTO gateway_installation_history(id,gateway_id,site_id,installed_at) VALUES(gen_random_uuid(),NEW.id,NEW.site_id,NEW.created_at);
 ELSIF NEW.retired_at IS DISTINCT FROM OLD.retired_at AND NEW.retired_at IS NOT NULL THEN UPDATE gateway_installation_history SET removed_at=NEW.retired_at WHERE gateway_id=NEW.id AND removed_at IS NULL;
 END IF;RETURN NEW;END $$;
DROP TRIGGER IF EXISTS gateway_installation_event ON gateways;
CREATE TRIGGER gateway_installation_event AFTER INSERT OR UPDATE OF retired_at ON gateways FOR EACH ROW EXECUTE FUNCTION record_gateway_installation();
CREATE TABLE IF NOT EXISTS measurement_comparison_dirty(pair_id uuid PRIMARY KEY REFERENCES measurement_comparison_pairs(id),from_time timestamptz NOT NULL);
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS comparison_pair_id uuid REFERENCES measurement_comparison_pairs(id);
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS comparison_window_start timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS alerts_open_comparison ON alerts(comparison_pair_id) WHERE comparison_pair_id IS NOT NULL AND status='open';
CREATE UNIQUE INDEX IF NOT EXISTS alerts_comparison_window ON alerts(comparison_pair_id,comparison_window_start) WHERE comparison_pair_id IS NOT NULL;
CREATE OR REPLACE FUNCTION mark_measurement_comparison_dirty() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO measurement_comparison_dirty(pair_id,from_time) SELECT id,coalesce(NEW.measured_at,NEW.polled_at) FROM measurement_comparison_pairs WHERE (left_device_id=NEW.device_id AND left_tag=NEW.tag) OR (right_device_id=NEW.device_id AND right_tag=NEW.tag) ON CONFLICT(pair_id) DO UPDATE SET from_time=LEAST(measurement_comparison_dirty.from_time,EXCLUDED.from_time);RETURN NEW;END $$;
DROP TRIGGER IF EXISTS comparison_sample_dirty ON payload_samples;
CREATE TRIGGER comparison_sample_dirty AFTER INSERT ON payload_samples FOR EACH ROW EXECUTE FUNCTION mark_measurement_comparison_dirty();

