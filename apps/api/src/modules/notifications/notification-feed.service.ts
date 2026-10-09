import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { canVisitPage } from '@solar/domain';
import { DatabaseService } from '../../database/database.service.js';
import { schoolScope, type ScopePrincipal } from '../../common/auth/route-policy.js';
export function notificationScope(user: ScopePrincipal) {
 if(!user.id || !['owner','admin','operator','accountant','school_user'].includes(user.role??''))throw new UnauthorizedException();
 return {userId:user.id,schools:schoolScope(user),alerts:canVisitPage(user.role!,'/alerts'),workflows:canVisitPage(user.role!,'/notifications')};
}
export function parseNotificationIds(ids:unknown):string[]{
 if(!Array.isArray(ids)||ids.length>500||ids.some(id=>typeof id!=='string'||! /^(alert|workflow|contract|document|payment):[a-zA-Z0-9:_-]{1,150}$/.test(id)))throw new BadRequestException('Invalid notification identities');
 return [...new Set<string>(ids)];
}
export function parseNotificationSite(site:unknown):string|null {
 if(site===undefined||site===null||site==='')return null;
 if(typeof site!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(site))throw new BadRequestException('Invalid site');
 return site;
}
// Every consumer (rows, count and read writes) uses this same accessible relation.
export const notificationVisibleSql=`WITH visible AS (
 SELECT e.id,e.title,e.detail,e.destination,e.created_at,'workflow'::text AS kind,NULL::text AS severity
 FROM notification_feed_events e JOIN sites s ON s.id=e.site_id
 WHERE ($2::uuid[] IS NULL OR s.school_id=ANY($2::uuid[])) AND ($3::uuid IS NULL OR s.id=$3)
 AND EXISTS(SELECT 1 FROM unnest($7::text[]) permitted(root) WHERE e.destination=permitted.root OR starts_with(e.destination,permitted.root||'/'))
 UNION ALL
 SELECT 'alert:'||a.id::text,a.title,a.detail,'/alerts',a.occurred_at,'alert',a.severity
 FROM alerts a JOIN sites s ON s.id=a.site_id
 WHERE $4::boolean AND ($2::uuid[] IS NULL OR s.school_id=ANY($2::uuid[])) AND ($3::uuid IS NULL OR s.id=$3)
 UNION ALL
 SELECT 'workflow:'||n.id::text,n.title,n.status,'/notifications',n.created_at,'workflow',NULL
 FROM notification_deliveries n JOIN platform_jobs j ON j.id=n.job_id
 WHERE $5::boolean AND ($2::uuid[] IS NULL OR cardinality($2::uuid[])>0) AND n.user_id=$1::uuid AND j.created_by=$1::uuid
 AND ($2::uuid[] IS NULL OR (j.scope IS NOT NULL AND j.scope<@$2::uuid[]))
 AND (j.payload->>'type' IS DISTINCT FROM 'audit' OR $6::boolean)
 AND ($3::uuid IS NULL OR j.payload->>'siteId'=$3::text)
), accessible AS (
 SELECT v.*,r.read_at FROM visible v LEFT JOIN notification_feed_reads r ON r.user_id=$1::uuid AND r.notification_id=v.id
)`;
@Injectable()
export class NotificationFeedService {
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService){}
 private parameters(user:ScopePrincipal,site:unknown){const scope=notificationScope(user);return [scope.userId,scope.schools,parseNotificationSite(site),scope.alerts,scope.workflows,['owner','admin'].includes(user.role??''),['/records/contracts','/records/documents','/records/receipts','/records/billing'].filter(path=>canVisitPage(user.role??'',path))];}
 // The bell is an activity feed across dates; dashboard date filters do not
 // change its scope. Return the latest 100 rows but count/read all visible rows.
 async feed(user:ScopePrincipal,site?:unknown){
  const result=await this.db.query(notificationVisibleSql+` SELECT
   (SELECT count(*)::int FROM accessible WHERE read_at IS NULL) AS "unreadCount",
   coalesce((SELECT jsonb_agg(CASE WHEN row.severity IS NULL THEN to_jsonb(row)-'severity' ELSE to_jsonb(row) END ORDER BY row."createdAt" DESC,row.id) FROM (
    SELECT id,title,detail,destination,created_at AS "createdAt",read_at AS "readAt",kind,severity FROM accessible ORDER BY created_at DESC,id LIMIT 100
   ) row),'[]'::jsonb) AS rows`,this.parameters(user,site));
  return result.rows[0]??{rows:[],unreadCount:0};
 }
 async read(user:ScopePrincipal,ids:unknown,site?:unknown){return this.mark(user,parseNotificationIds(ids),site);}
 async readAll(user:ScopePrincipal,site?:unknown){return this.mark(user,null,site);}
 private async mark(user:ScopePrincipal,ids:string[]|null,site:unknown){
  const params=this.parameters(user,site);params.push(ids);
  await this.db.query(notificationVisibleSql+`, marked AS (
   INSERT INTO notification_feed_reads(user_id,notification_id,read_at)
   SELECT $1::uuid,id,now() FROM accessible WHERE read_at IS NULL AND ($8::text[] IS NULL OR id=ANY($8::text[]))
   ON CONFLICT(user_id,notification_id) DO NOTHING RETURNING notification_id
  ) SELECT count(*)::int AS "unreadCount" FROM accessible WHERE read_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM marked WHERE notification_id=accessible.id)`,params);
  const count=await this.db.query(notificationVisibleSql+` SELECT count(*)::int AS "unreadCount" FROM accessible WHERE read_at IS NULL`,params.slice(0,7));
  return count.rows[0]??{unreadCount:0};
 }
}
