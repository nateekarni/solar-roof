CREATE TABLE IF NOT EXISTS discovered_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_gateway_id text NOT NULL UNIQUE,
  reported_site_id text NULL,
  reported_device_id text NULL,
  manufacturer text NULL,
  model text NULL,
  profile_id text NULL,
  protocol text NULL,
  status text NOT NULL DEFAULT 'unassigned' CHECK (status IN ('unassigned', 'assigned', 'ignored')),
  assigned_site_id uuid NULL REFERENCES sites(id),
  assigned_gateway_id uuid NULL REFERENCES gateways(id),
  assigned_at timestamptz NULL,
  raw_payload jsonb NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS discovered_gateways_status_last_seen_idx
  ON discovered_gateways(status, last_seen_at DESC);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_document_id uuid REFERENCES documents(id);

DROP INDEX IF EXISTS documents_new_cycle_current;
CREATE UNIQUE INDEX IF NOT EXISTS documents_new_cycle_current ON documents(billing_cycle_id, document_type)
  WHERE snapshot IS NOT NULL AND is_current AND document_type = 'invoice';

