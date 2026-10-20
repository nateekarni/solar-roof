-- Add the control plane without changing existing gateway assignments or config JSON.
ALTER TABLE discovered_gateways
  ADD COLUMN IF NOT EXISTS mqtt_broker_id uuid REFERENCES mqtt_brokers(id),
  ADD COLUMN IF NOT EXISTS client_id text,
  ADD COLUMN IF NOT EXISTS firmware_version text,
  ADD COLUMN IF NOT EXISTS discovery_revision integer NOT NULL DEFAULT 1 CHECK (discovery_revision > 0),
  ADD COLUMN IF NOT EXISTS devices jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(devices) = 'array'),
  ADD COLUMN IF NOT EXISTS source_address text;

-- 063 used inline constraints. Resolve their catalog identity rather than assuming
-- generated names, including installations where an operator renamed them.
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'discovered_gateways'::regclass AND contype = 'u'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid = 'discovered_gateways'::regclass AND attname = 'external_gateway_id')]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE discovered_gateways DROP CONSTRAINT %I', constraint_name);
  END LOOP;
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'discovered_gateways'::regclass AND contype = 'c'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid = 'discovered_gateways'::regclass AND attname = 'status')]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE discovered_gateways DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE discovered_gateways ADD CONSTRAINT discovered_gateways_control_status_check
  CHECK (status IN ('unassigned', 'configuring', 'assigned', 'ignored'));
CREATE UNIQUE INDEX IF NOT EXISTS discovered_gateways_broker_gateway_unique
  ON discovered_gateways ((coalesce(mqtt_broker_id::text, 'default')), external_gateway_id);

CREATE TABLE IF NOT EXISTS gateway_discovery_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discovered_gateway_id uuid NOT NULL REFERENCES discovered_gateways(id),
  revision integer NOT NULL CHECK (revision > 0),
  message_id text NOT NULL CHECK (length(btrim(message_id)) > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  source_address text,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (discovered_gateway_id, revision),
  UNIQUE (discovered_gateway_id, message_id)
);

ALTER TABLE gateways
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'active'
    CHECK (lifecycle_state IN ('discovered', 'configuring', 'active', 'disabled')),
  ADD COLUMN IF NOT EXISTS config_state text NOT NULL DEFAULT 'applied'
    CHECK (config_state IN ('draft', 'pending_sync', 'applied', 'failed', 'drifted')),
  ADD COLUMN IF NOT EXISTS desired_config_hash text CHECK (desired_config_hash ~ '^[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS active_config_hash text CHECK (active_config_hash ~ '^[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS last_status_at timestamptz;

CREATE TABLE IF NOT EXISTS gateway_mqtt_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id uuid NOT NULL REFERENCES gateways(id),
  username text NOT NULL CHECK (length(btrim(username)) > 0),
  password_hash text NOT NULL CHECK (length(btrim(password_hash)) > 0),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS gateway_mqtt_credentials_active_gateway
  ON gateway_mqtt_credentials(gateway_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS gateway_mqtt_credentials_active_username
  ON gateway_mqtt_credentials(username) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS gateway_mqtt_credentials_gateway_history_idx
  ON gateway_mqtt_credentials(gateway_id, created_at DESC);

ALTER TABLE gateway_configuration_revisions
  ADD COLUMN IF NOT EXISTS config_hash text
    CHECK (config_hash ~ '^([0-9a-f]{64}|legacy:sha256:[0-9a-f]{64})$'),
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users(id);

-- Legacy JSONB text is not the application canonical encoding. Explicitly label
-- this one-time historical digest, with no default/trigger for new application data.
-- PostgreSQL's built-in sha256(bytea) avoids adding a pgcrypto dependency.
UPDATE gateway_configuration_revisions
SET config_hash = 'legacy:sha256:' || encode(sha256(convert_to(config::text, 'UTF8')), 'hex')
WHERE config_hash IS NULL;
ALTER TABLE gateway_configuration_revisions ALTER COLUMN config_hash SET NOT NULL;

CREATE OR REPLACE FUNCTION immutable_configuration_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.gateway_id IS DISTINCT FROM OLD.gateway_id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.config IS DISTINCT FROM OLD.config
    OR NEW.desired_at IS DISTINCT FROM OLD.desired_at
    OR NEW.config_hash IS DISTINCT FROM OLD.config_hash
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
  THEN RAISE EXCEPTION 'Gateway configuration snapshots are immutable'; END IF;
  RETURN NEW;
END $$;

CREATE TABLE IF NOT EXISTS gateway_config_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id uuid NOT NULL REFERENCES gateways(id),
  proposal_id text NOT NULL CHECK (length(btrim(proposal_id)) > 0),
  message_id text NOT NULL CHECK (length(btrim(message_id)) > 0),
  base_config_version integer NOT NULL CHECK (base_config_version >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'stale')),
  approval_mode text NOT NULL DEFAULT 'manual' CHECK (approval_mode = 'manual'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  received_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES users(id),
  rejection_reason text,
  approved_config_version integer,
  UNIQUE (gateway_id, proposal_id),
  UNIQUE (gateway_id, message_id),
  FOREIGN KEY (gateway_id, approved_config_version) REFERENCES gateway_configuration_revisions(gateway_id, version),
  CHECK (approved_config_version IS NULL OR approved_config_version > base_config_version),
  CHECK (status NOT IN ('approved', 'rejected') OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)),
  CHECK (status <> 'rejected' OR length(btrim(rejection_reason)) > 0),
  CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL),
  CHECK ((status = 'approved') = (approved_config_version IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS gateway_config_proposals_gateway_status_received_idx
  ON gateway_config_proposals(gateway_id, status, received_at DESC);

-- Keep mismatched/unknown versions as evidence too: an event deliberately has no
-- revision FK, so the application can record it without activating a revision.
CREATE TABLE IF NOT EXISTS gateway_config_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id uuid NOT NULL REFERENCES gateways(id),
  message_id text NOT NULL CHECK (length(btrim(message_id)) > 0),
  config_version integer NOT NULL CHECK (config_version > 0),
  config_hash text NOT NULL CHECK (config_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('received', 'applied', 'failed')),
  reported_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  error jsonb CHECK (jsonb_typeof(error) = 'object'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  UNIQUE (gateway_id, message_id)
);
CREATE INDEX IF NOT EXISTS gateway_config_status_events_gateway_received_idx
  ON gateway_config_status_events(gateway_id, received_at DESC);
CREATE INDEX IF NOT EXISTS gateway_config_status_events_revision_received_idx
  ON gateway_config_status_events(gateway_id, config_version, received_at DESC);

CREATE TABLE IF NOT EXISTS gateway_connection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id uuid NOT NULL REFERENCES gateways(id),
  message_id text NOT NULL CHECK (length(btrim(message_id)) > 0),
  session_id text NOT NULL CHECK (length(btrim(session_id)) > 0),
  firmware_version text NOT NULL CHECK (length(btrim(firmware_version)) > 0),
  status text NOT NULL CHECK (status IN ('online', 'offline')),
  applied_config_version integer CHECK (applied_config_version > 0),
  applied_config_hash text CHECK (applied_config_hash ~ '^[0-9a-f]{64}$'),
  reported_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  UNIQUE (gateway_id, message_id),
  CHECK ((applied_config_version IS NULL) = (applied_config_hash IS NULL))
);
CREATE INDEX IF NOT EXISTS gateway_connection_events_gateway_received_idx
  ON gateway_connection_events(gateway_id, received_at DESC);
CREATE INDEX IF NOT EXISTS gateway_connection_events_session_received_idx
  ON gateway_connection_events(gateway_id, session_id, received_at DESC);
