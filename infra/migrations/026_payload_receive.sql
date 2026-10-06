CREATE TABLE IF NOT EXISTS gateway_payload_receive_revisions (
  id uuid PRIMARY KEY,
  gateway_id uuid NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  config jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway_id, version)
);
CREATE INDEX IF NOT EXISTS gateway_payload_receive_latest ON gateway_payload_receive_revisions(gateway_id, version DESC);
ALTER TABLE payload_messages ADD COLUMN IF NOT EXISTS receive_revision_id uuid REFERENCES gateway_payload_receive_revisions(id);
ALTER TABLE payload_messages ADD COLUMN IF NOT EXISTS source_payload jsonb;
