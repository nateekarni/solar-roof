import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { effectiveAuthorization, type DomainGrant, type Authorization } from '../../common/auth/authorization.js';
@Injectable()
export class AuthorizationService {
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService){}
 async load(userId:string,role:string):Promise<Authorization>{
  const result=await this.db.query(`SELECT u.permission_revision,g.domain,g.overrides,g.scope_mode,g.site_ids,COALESCE(p.rules,'{}'::jsonb) AS preset
   FROM users u LEFT JOIN employee_domain_grants g ON g.user_id=u.id
   LEFT JOIN employee_position_domains p ON p.position_id=g.position_id AND p.domain=g.domain WHERE u.id=$1`,[userId]);
  const grants:DomainGrant[]=result.rows.filter(row=>row.domain).map(row=>({domain:row.domain,preset:row.preset,overrides:row.overrides,scope:{mode:row.scope_mode,siteIds:row.site_ids}}));
  return effectiveAuthorization(role,result.rows[0]?.permission_revision??0,grants);
 }
}
