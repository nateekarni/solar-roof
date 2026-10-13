-- Background queues and delivery workers resolve the same live grants as HTTP.
CREATE OR REPLACE FUNCTION employee_can_access(p_user uuid,p_domain text,p_permission text,p_site uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
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
