CREATE TABLE IF NOT EXISTS generated_reports (
 id uuid PRIMARY KEY, created_by uuid NOT NULL REFERENCES users(id), title text NOT NULL,
 report_type text NOT NULL, date_from date NOT NULL, date_to date NOT NULL,
 format text NOT NULL CHECK(format IN ('csv','xlsx','pdf')), status text NOT NULL CHECK(status IN ('ready')),
 content bytea NOT NULL, content_type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(date_from <= date_to)
);
CREATE INDEX IF NOT EXISTS generated_reports_owner_idx ON generated_reports(created_by,created_at DESC);
CREATE TABLE IF NOT EXISTS notification_deliveries (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), title text NOT NULL,
 channel text NOT NULL, recipient text NOT NULL, status text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
