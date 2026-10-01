CREATE TABLE platform_jobs (
 id uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('report','archive','restore')),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','ready','failed','cancelled')),
 payload jsonb NOT NULL, scope uuid[], created_by uuid REFERENCES users(id),
 idempotency_key text, payload_hash text NOT NULL, attempt integer NOT NULL DEFAULT 1 CHECK(attempt BETWEEN 1 AND 4),
 progress integer CHECK(progress BETWEEN 0 AND 100), row_count bigint, snapshot_at timestamptz,
 error_code text, object_key text, manifest jsonb,
 worker_id text, lease_until timestamptz, lease_seconds integer NOT NULL DEFAULT 60,
 available_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(created_by,idempotency_key)
);
CREATE INDEX platform_jobs_queue ON platform_jobs(kind,available_at,created_at,id) WHERE status IN ('queued','running');
CREATE INDEX platform_jobs_owner ON platform_jobs(created_by,created_at DESC,id DESC);
CREATE UNIQUE INDEX platform_jobs_one_active_report ON platform_jobs(created_by) WHERE kind='report' AND status IN ('queued','running');
ALTER TABLE notification_deliveries ADD COLUMN job_id uuid REFERENCES platform_jobs(id);
ALTER TABLE notification_deliveries ADD COLUMN dedupe_key text;
CREATE UNIQUE INDEX notification_job_recipient ON notification_deliveries(job_id,recipient);
CREATE UNIQUE INDEX notification_dedupe ON notification_deliveries(dedupe_key);
CREATE TABLE job_outbox(id uuid PRIMARY KEY,job_id uuid NOT NULL REFERENCES platform_jobs(id),recipient uuid NOT NULL REFERENCES users(id),event text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),delivered_at timestamptz,UNIQUE(job_id,recipient));
