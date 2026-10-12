CREATE TABLE site_account_assignments (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id),
 site_id uuid NOT NULL REFERENCES sites(id),
 assigned_by uuid REFERENCES users(id),
 assigned_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 revoked_by uuid REFERENCES users(id)
);
CREATE UNIQUE INDEX site_account_one_active_site ON site_account_assignments(user_id) WHERE revoked_at IS NULL;
CREATE INDEX site_account_active_site ON site_account_assignments(site_id) WHERE revoked_at IS NULL;
-- Backfill only unambiguous legacy memberships. Multi-site customers require explicit assignment.
INSERT INTO site_account_assignments(id,user_id,site_id)
SELECT gen_random_uuid(),u.id,min(s.id::text)::uuid FROM users u JOIN sites s ON s.customer_id=u.customer_id AND s.status<>'archived'
WHERE u.role='customer_user' GROUP BY u.id HAVING count(s.id)=1;
