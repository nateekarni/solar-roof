ALTER TABLE users ADD COLUMN permission_revision integer NOT NULL DEFAULT 0;
CREATE TABLE employee_positions (
 id uuid PRIMARY KEY, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE employee_position_domains (
 position_id uuid NOT NULL REFERENCES employee_positions(id) ON DELETE CASCADE,
 domain text NOT NULL CHECK(domain IN ('business','technical')),
 rules jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(rules)='object'),
 revision integer NOT NULL DEFAULT 0, PRIMARY KEY(position_id,domain)
);
CREATE TABLE employee_domain_grants (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 domain text NOT NULL CHECK(domain IN ('business','technical')),
 position_id uuid REFERENCES employee_positions(id), overrides jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(overrides)='object'),
 scope_mode text NOT NULL DEFAULT 'selected' CHECK(scope_mode IN ('all','selected')),
 site_ids uuid[] NOT NULL DEFAULT '{}',
 updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(scope_mode<>'all' OR cardinality(site_ids)=0), PRIMARY KEY(user_id,domain)
);
CREATE TABLE settings_domain_revisions(domain text PRIMARY KEY CHECK(domain IN ('business','technical')),revision integer NOT NULL DEFAULT 0);
INSERT INTO settings_domain_revisions(domain) VALUES('business'),('technical');
-- Preserve existing employee responsibilities explicitly; future accounts default to no grants.
INSERT INTO employee_domain_grants(user_id,domain,overrides,scope_mode)
 SELECT id,CASE WHEN role='accountant' THEN 'business' ELSE 'technical' END,
 CASE WHEN role='accountant' THEN '{"business.dashboard.view":true,"business.billing.view":true,"business.billing.edit":true,"business.billing.approve":true,"business.documents.view":true,"business.documents.download":true,"business.receipts.view":true}'::jsonb
 ELSE '{"technical.dashboard.view":true,"technical.gateways.view":true,"technical.devices.view":true,"technical.telemetry.view":true,"technical.alerts.view":true,"technical.alerts.edit":true}'::jsonb END,'all'
 FROM users WHERE role IN ('operator','accountant');

-- Background queues and delivery workers resolve the same live grants as HTTP.
CREATE FUNCTION employee_can_access(p_user uuid,p_domain text,p_permission text,p_site uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM users u WHERE u.id=p_user AND u.status='active' AND (
  (u.role='owner' AND p_domain='business') OR (u.role='admin' AND p_domain='technical') OR
  (u.role IN ('operator','accountant') AND EXISTS(
   SELECT 1 FROM employee_domain_grants g LEFT JOIN employee_position_domains p ON p.position_id=g.position_id AND p.domain=g.domain
   WHERE g.user_id=u.id AND g.domain=p_domain AND (g.scope_mode='all' OR p_site=ANY(g.site_ids))
   AND coalesce(nullif(g.overrides->p_permission,'null'::jsonb),p.rules->p_permission,'false'::jsonb)='true'::jsonb
  )) OR
  (u.role='customer_user' AND p_domain='business' AND p_permission IN ('business.billing.view','business.receipts.view','business.documents.view')
   AND (SELECT count(*) FROM site_account_assignments a WHERE a.user_id=u.id AND a.revoked_at IS NULL)=1
   AND EXISTS(SELECT 1 FROM site_account_assignments a WHERE a.user_id=u.id AND a.site_id=p_site AND a.revoked_at IS NULL))
  ));
$$;
