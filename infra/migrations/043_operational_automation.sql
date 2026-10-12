CREATE TABLE operational_alert_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid NOT NULL REFERENCES sites(id),
 kind text NOT NULL CHECK(kind IN('offline','stale','threshold')), semantic_field text,
 operator text CHECK(operator IN('gt','gte','lt','lte')), threshold numeric(24,8),
 duration_seconds integer NOT NULL CHECK(duration_seconds BETWEEN 0 AND 604800),
 cooldown_seconds integer NOT NULL CHECK(cooldown_seconds BETWEEN 0 AND 2592000),
 recovery boolean NOT NULL DEFAULT false, recipient_user_ids uuid[] NOT NULL,
 channels text[] NOT NULL CHECK(channels <@ ARRAY['in_app','email']::text[] AND cardinality(channels)>0),
 enabled boolean NOT NULL DEFAULT true, state jsonb NOT NULL DEFAULT '{}',
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(cardinality(recipient_user_ids)>0), CHECK(kind<>'threshold' OR (semantic_field IS NOT NULL AND operator IS NOT NULL AND threshold IS NOT NULL))
);
CREATE TABLE operational_delivery_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dedupe_key text NOT NULL UNIQUE,
 site_id uuid NOT NULL REFERENCES sites(id), user_id uuid NOT NULL REFERENCES users(id),
 rule_id uuid REFERENCES operational_alert_rules(id), billing_cycle_id uuid REFERENCES billing_cycles(id),
 alert_id uuid REFERENCES alerts(id), channel text NOT NULL CHECK(channel IN('in_app','email')),
 recipient text NOT NULL, subject text NOT NULL, body text NOT NULL, destination text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','sending','sent','failed','uncertain','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5), next_attempt_at timestamptz NOT NULL DEFAULT now(),
 last_error text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX operational_delivery_pending ON operational_delivery_outbox(next_attempt_at) WHERE state IN('pending','failed');
CREATE TABLE operational_event_recipients (
 notification_id text NOT NULL,user_id uuid NOT NULL REFERENCES users(id),PRIMARY KEY(notification_id,user_id)
);
ALTER TABLE payment_decision_outbox ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE operational_delivery_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), outbox_id uuid NOT NULL,
 source text NOT NULL CHECK(source IN('operational_delivery_outbox','payment_decision_outbox')),
 attempt integer NOT NULL, status text NOT NULL CHECK(status IN('sending','sent','failed','uncertain','cancelled','paused')),
 error text, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 UNIQUE(source,outbox_id,attempt)
);
