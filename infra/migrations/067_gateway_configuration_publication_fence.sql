-- A completion from before a repair cannot certify the repaired retained state.
ALTER TABLE gateways ADD COLUMN IF NOT EXISTS config_publication_epoch bigint NOT NULL DEFAULT 0;
ALTER TABLE gateway_configuration_revisions ADD COLUMN IF NOT EXISTS published_mqtt_broker_id uuid;

-- Persist uncertainty before handing a packet to MQTT. A crash/timeout or failed
-- completion transaction must not hide a possibly delayed retained write from
-- another instance's scanner. Broker identity is historical, not a foreign key.
CREATE TABLE IF NOT EXISTS gateway_configuration_publications (
  id uuid PRIMARY KEY,
  gateway_id uuid NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  version integer NOT NULL,
  config_hash text NOT NULL,
  mqtt_broker_id uuid,
  publication_epoch bigint NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gateway_configuration_publications_gateway_idx
  ON gateway_configuration_publications(gateway_id);
