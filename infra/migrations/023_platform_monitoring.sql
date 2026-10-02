CREATE TABLE platform_monitoring_alerts (
 condition_key text PRIMARY KEY,
 episode_id uuid NOT NULL UNIQUE,
 active boolean NOT NULL,
 first_seen_at timestamptz NOT NULL DEFAULT now(),
 observed_at timestamptz NOT NULL DEFAULT now(),
 delivery_status text NOT NULL DEFAULT 'pending' CHECK(delivery_status IN ('pending','sending','delivered','uncertain','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 lease_until timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz
);
