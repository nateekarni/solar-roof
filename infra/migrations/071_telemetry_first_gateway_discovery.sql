-- Physical serials are authoritative; external IDs in MQTT topics are claims.
ALTER TABLE gateways
  ADD COLUMN IF NOT EXISTS gateway_serial text
    CHECK (gateway_serial IS NULL OR gateway_serial ~ '^[A-Za-z0-9_-]{1,128}$');

CREATE UNIQUE INDEX IF NOT EXISTS gateways_gateway_serial_unique
  ON gateways(gateway_serial) WHERE gateway_serial IS NOT NULL;

ALTER TABLE discovered_gateways
  ADD COLUMN IF NOT EXISTS gateway_serial text
    CHECK (gateway_serial IS NULL OR gateway_serial ~ '^[A-Za-z0-9_-]{1,128}$');

-- New schema 1.2 candidates may legitimately claim a gateway code that is
-- already used by a different physical serial. Keep legacy rows unique only
-- while they have no serial evidence.
DROP INDEX IF EXISTS discovered_gateways_broker_gateway_unique;

CREATE UNIQUE INDEX IF NOT EXISTS discovered_gateways_broker_serial_unique
  ON discovered_gateways ((coalesce(mqtt_broker_id::text, 'default')), gateway_serial)
  WHERE gateway_serial IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS discovered_gateways_legacy_broker_gateway_unique
  ON discovered_gateways ((coalesce(mqtt_broker_id::text, 'default')), external_gateway_id)
  WHERE gateway_serial IS NULL;

CREATE INDEX IF NOT EXISTS discovered_gateways_claimed_gateway_idx
  ON discovered_gateways(external_gateway_id, last_seen_at DESC);
