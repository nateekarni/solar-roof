-- Non-destructive preflight: reconcile these legacy conflicts before retrying.
DO $$
DECLARE conflicts text;
BEGIN
  SELECT string_agg(school_id::text, ', ') INTO conflicts FROM (SELECT school_id FROM sites GROUP BY school_id HAVING count(*) > 1) s;
  IF conflicts IS NOT NULL THEN RAISE EXCEPTION '010: Multiple sites per school; reconcile school IDs: %', conflicts; END IF;
  SELECT string_agg(site_id::text, ', ') INTO conflicts FROM (SELECT site_id FROM gateways GROUP BY site_id HAVING count(*) > 1) g;
  IF conflicts IS NOT NULL THEN RAISE EXCEPTION '010: Multiple gateways per site; reconcile site IDs: %', conflicts; END IF;
  SELECT string_agg(id::text, ', ') INTO conflicts FROM gateways WHERE protocol <> 'mqtt' OR name ~ '[/+#]' OR lower(name) IN ('response','config','ack') OR endpoint NOT IN ('energy/' || name || '/#', '/' || name || '/#');
  IF conflicts IS NOT NULL THEN RAISE EXCEPTION '010: Configure MQTT topics energy/{name}/# or /{name}/# for gateway IDs: %', conflicts; END IF;
  SELECT string_agg(name, ', ') INTO conflicts FROM (SELECT name FROM gateways GROUP BY name HAVING count(*) > 1) g;
  IF conflicts IS NOT NULL THEN RAISE EXCEPTION '010: Duplicate gateway names; reconcile: %', conflicts; END IF;
  SELECT string_agg(device_id::text || ':' || semantic_field, ', ') INTO conflicts FROM (SELECT device_id, semantic_field FROM register_mapping_versions WHERE effective_to IS NULL GROUP BY device_id, semantic_field HAVING count(*) > 1) m;
  IF conflicts IS NOT NULL THEN RAISE EXCEPTION '010: Multiple active mappings; close previous versions for: %', conflicts; END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS sites_one_per_school_idx ON sites(school_id);
CREATE UNIQUE INDEX IF NOT EXISTS gateways_one_per_site_idx ON gateways(site_id);
CREATE UNIQUE INDEX IF NOT EXISTS gateways_name_unique_idx ON gateways(name);
ALTER TABLE gateways ADD CONSTRAINT gateways_mqtt_only CHECK (protocol = 'mqtt');
ALTER TABLE gateways ADD CONSTRAINT gateways_topic_matches_name CHECK (name !~ '[/+#]' AND lower(name) NOT IN ('response','config','ack') AND endpoint IN ('energy/' || name || '/#', '/' || name || '/#'));
ALTER TABLE gateways ADD CONSTRAINT gateways_interval_valid CHECK (polling_interval_seconds BETWEEN 1 AND 86400);
ALTER TABLE gateways ADD CONSTRAINT gateways_site_pair UNIQUE (id, site_id);
ALTER TABLE devices ADD CONSTRAINT devices_gateway_site_match FOREIGN KEY (gateway_id, site_id) REFERENCES gateways(id, site_id);
CREATE UNIQUE INDEX IF NOT EXISTS register_mapping_one_active_field_idx ON register_mapping_versions(device_id, semantic_field) WHERE effective_to IS NULL;
ALTER TABLE telemetry_raw ADD COLUMN IF NOT EXISTS mapping_version_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE telemetry_aggregate ADD COLUMN IF NOT EXISTS last_source_time timestamptz;
