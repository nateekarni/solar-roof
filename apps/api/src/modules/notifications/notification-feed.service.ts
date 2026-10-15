import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { canVisitPage } from '@solar/domain';
import { DatabaseService } from '../../database/database.service.js';
import { customerScope, type ScopePrincipal } from '../../common/auth/route-policy.js';
import { FinancialReadinessService } from '../financial-readiness/financial-readiness.service.js';
import { financeReadinessNotification } from './finance-readiness-notification.js';
export function notificationScope(user: ScopePrincipal) {
 if(!user.id || !['owner','admin','operator','accountant','customer_user'].includes(user.role??''))throw new UnauthorizedException();
 return {userId:user.id,customers:customerScope(user),alerts:canVisitPage(user.role!,'/alerts'),workflows:canVisitPage(user.role!,'/notifications')};
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
 SELECT e.id,e.title,e.detail,e.destination,e.created_at,'workflow'::text AS kind,NULL::text AS severity,s.name AS site_name
 FROM notification_feed_events e JOIN sites s ON s.id=e.site_id
 WHERE ($2::uuid[] IS NULL OR s.customer_id=ANY($2::uuid[])) AND (NOT EXISTS(SELECT 1 FROM users scope_user WHERE scope_user.id=$1::uuid AND scope_user.role='customer_user') OR EXISTS(SELECT 1 FROM site_account_assignments assignment WHERE assignment.user_id=$1::uuid AND assignment.site_id=s.id AND assignment.revoked_at IS NULL)) AND ($3::uuid IS NULL OR s.id=$3)
 AND (NOT EXISTS(SELECT 1 FROM operational_event_recipients er WHERE er.notification_id=e.id) OR EXISTS(SELECT 1 FROM operational_event_recipients er WHERE er.notification_id=e.id AND er.user_id=$1))
 AND EXISTS(SELECT 1 FROM unnest($7::text[]) permitted(root) WHERE e.destination=permitted.root OR starts_with(e.destination,permitted.root||'/'))
 AND employee_can_access($1::uuid,'business',CASE WHEN starts_with(e.destination,'/records/receipts') THEN 'business.receipts.view' WHEN starts_with(e.destination,'/records/documents') THEN 'business.documents.view' ELSE 'business.billing.view' END,s.id)
 UNION ALL
 SELECT 'alert:'||a.id::text,a.title,a.detail,'/alerts',a.occurred_at,'alert',a.severity,s.name AS site_name
 FROM alerts a JOIN sites s ON s.id=a.site_id
 WHERE $4::boolean AND (NOT EXISTS(SELECT 1 FROM users scope_user WHERE scope_user.id=$1::uuid AND scope_user.role='customer_user') OR EXISTS(SELECT 1 FROM site_account_assignments assignment WHERE assignment.user_id=$1::uuid AND assignment.site_id=s.id AND assignment.revoked_at IS NULL)) AND ($2::uuid[] IS NULL OR s.customer_id=ANY($2::uuid[])) AND ($3::uuid IS NULL OR s.id=$3)
 AND (NOT EXISTS(SELECT 1 FROM operational_delivery_outbox o WHERE o.alert_id=a.id) OR EXISTS(SELECT 1 FROM operational_event_recipients er WHERE er.notification_id='alert:'||a.id::text AND er.user_id=$1))
 AND employee_can_access($1::uuid,'technical','technical.alerts.view',s.id)
 UNION ALL
 SELECT 'workflow:'||n.id::text,n.title,n.status,'/notifications',n.created_at,'workflow',NULL,s.name AS site_name
 FROM notification_deliveries n JOIN platform_jobs j ON j.id=n.job_id
 LEFT JOIN sites s ON (j.payload->>'siteId' IS NOT NULL AND s.id::text=j.payload->>'siteId')
 WHERE $5::boolean AND ($2::uuid[] IS NULL OR cardinality($2::uuid[])>0) AND n.user_id=$1::uuid AND j.created_by=$1::uuid
 AND ($2::uuid[] IS NULL OR (j.scope IS NOT NULL AND j.scope<@$2::uuid[]))
 AND (j.payload->>'type' IS DISTINCT FROM 'audit' OR $6::boolean)
 AND ($3::uuid IS NULL OR j.payload->>'siteId'=$3::text)
), accessible AS (
 SELECT v.*,r.read_at FROM visible v LEFT JOIN notification_feed_reads r ON r.user_id=$1::uuid AND r.notification_id=v.id
)`;
@Injectable()
export class NotificationFeedService {
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService,@Inject(FinancialReadinessService) private readonly readiness:Pick<FinancialReadinessService,'status'>){}
 private parameters(user:ScopePrincipal,site:unknown){const scope=notificationScope(user);return [scope.userId,scope.customers,parseNotificationSite(site),scope.alerts,scope.workflows,['owner','admin'].includes(user.role??''),['/records/contracts','/records/documents','/records/receipts','/records/billing'].filter(path=>canVisitPage(user.role??'',path))];}
 private async financeItem(user:ScopePrincipal){return user.role==='owner'?financeReadinessNotification(user,await this.readiness.status(user)):null;}
 private async financeReadAt(user:ScopePrincipal,id:string):Promise<string|null>{
  const result=await this.db.query<{readAt:string|Date}>(`SELECT read_at AS "readAt" FROM notification_feed_reads WHERE user_id=$1::uuid AND notification_id=$2`,[user.id,id]);
  const value=result.rows[0]?.readAt;return value?new Date(value).toISOString():null;
 }
 // The bell is an activity feed across dates; dashboard date filters do not
 // change its scope. Return the latest 100 rows but count/read all visible rows.
 async feed(user:ScopePrincipal,site?:unknown){
  const params=this.parameters(user,site);
  const [result,finance]=await Promise.all([this.db.query(notificationVisibleSql+` SELECT
   (SELECT count(*)::int FROM accessible WHERE read_at IS NULL) AS "unreadCount",
   coalesce((SELECT jsonb_agg(CASE WHEN row.severity IS NULL THEN to_jsonb(row)-'severity' ELSE to_jsonb(row) END ORDER BY row."createdAt" DESC,row.id) FROM (
    SELECT id,title,detail,destination,created_at AS "createdAt",read_at AS "readAt",kind,severity,site_name AS "siteName" FROM accessible ORDER BY created_at DESC,id LIMIT 100
   ) row),'[]'::jsonb) AS rows`,params),this.financeItem(user)]);
  const feed=result.rows[0]??{rows:[],unreadCount:0};
  if(!finance)return feed;
  finance.readAt=await this.financeReadAt(user,finance.id);
  // The setup reminder is global and remains actionable in a site-filtered bell.
  return {rows:[finance,...feed.rows].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||a.id.localeCompare(b.id)).slice(0,100),unreadCount:feed.unreadCount+(finance.readAt?0:1)};
 }
 async read(user:ScopePrincipal,ids:unknown,site?:unknown){return this.mark(user,parseNotificationIds(ids),site);}
 async readAll(user:ScopePrincipal,site?:unknown){return this.mark(user,null,site);}
 private async mark(user:ScopePrincipal,ids:string[]|null,site:unknown){
  const params=this.parameters(user,site);params.push(ids);
  const finance=await this.financeItem(user);
  await this.db.query(notificationVisibleSql+`, marked AS (
   INSERT INTO notification_feed_reads(user_id,notification_id,read_at)
   SELECT $1::uuid,id,now() FROM accessible WHERE read_at IS NULL AND ($8::text[] IS NULL OR id=ANY($8::text[]))
   ON CONFLICT(user_id,notification_id) DO NOTHING RETURNING notification_id
  ) SELECT count(*)::int AS "unreadCount" FROM accessible WHERE read_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM marked WHERE notification_id=accessible.id)`,params);
  if(finance&&(ids===null||ids.includes(finance.id)))await this.db.query(`INSERT INTO notification_feed_reads(user_id,notification_id,read_at) VALUES($1::uuid,$2,now()) ON CONFLICT(user_id,notification_id) DO NOTHING`,[user.id,finance.id]);
  const [count,readAt]=await Promise.all([this.db.query(notificationVisibleSql+` SELECT count(*)::int AS "unreadCount" FROM accessible WHERE read_at IS NULL`,params.slice(0,7)),finance?this.financeReadAt(user,finance.id):Promise.resolve(null)]);
  return {unreadCount:(count.rows[0]?.unreadCount??0)+(finance&&!readAt?1:0)};
 }
}
