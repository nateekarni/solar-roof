CREATE TABLE IF NOT EXISTS critical_alarm_rule_versions (
 id uuid PRIMARY KEY, version integer NOT NULL CHECK(version>0), provider text NOT NULL,
 provenance jsonb NOT NULL, rules jsonb NOT NULL, content_hash text NOT NULL UNIQUE,
 imported_by uuid NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,version), CHECK(provider='huawei'), CHECK(jsonb_typeof(rules)='array')
);

CREATE TABLE IF NOT EXISTS late_fee_policy_versions (
 id uuid PRIMARY KEY, version integer NOT NULL UNIQUE CHECK(version>0), enabled boolean NOT NULL DEFAULT false,
 config jsonb NOT NULL, created_by uuid NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(enabled=false)
);
