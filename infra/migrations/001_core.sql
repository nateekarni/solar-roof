CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE TABLE IF NOT EXISTS audit_events (id uuid NOT NULL, actor_id uuid NULL, action text NOT NULL, entity_type text NOT NULL, entity_id uuid NOT NULL, before_json jsonb NULL, after_json jsonb NULL, reason text NULL, correlation_id text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (id, occurred_at));
CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON audit_events(entity_type, entity_id, occurred_at);
CREATE TABLE IF NOT EXISTS telemetry_raw (id uuid NOT NULL, device_id uuid NOT NULL, mapping_version_id uuid NOT NULL, source_time timestamptz NOT NULL, received_time timestamptz NOT NULL, raw_payload jsonb NOT NULL, normalized_value numeric(24,8), unit text, quality text NOT NULL, ingestion_id text NOT NULL, PRIMARY KEY (id, source_time));
CREATE UNIQUE INDEX IF NOT EXISTS telemetry_raw_ingestion_idx ON telemetry_raw(ingestion_id, source_time);
SELECT create_hypertable('telemetry_raw', by_range('source_time'), if_not_exists => TRUE);
