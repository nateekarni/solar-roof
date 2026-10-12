import { generationEnergy, generationDays, generationHours, GENERATION_SAMPLES_SQL } from './generation-energy.js';
import { energyCompleteness } from './energy-completeness.js';
import { dashboardRange } from './dashboard-range.js';
import { EnergyReadService } from './energy-read.service.js';
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { customerScope } from '../../common/auth/resource-scope.js';
import { DatabaseService } from '../../database/database.service.js';
import {hasPermission,siteScope,type Authorization} from '../../common/auth/authorization.js';
import {financialInsights,type InsightBill} from './financial-insights.js';
import type {DashboardSiteContext} from '@solar/api-contracts';

export interface DashboardPrincipal { id?:string; role?:string; customerId?:string; assignedCustomerIds?:readonly string[]; assignedSiteIds?:readonly string[];authorization?:Authorization }
interface SiteRow {external_site_id:string|null;external_gateway_id:string|null;id:string;name:string;customer_name:string;capacity_mwp:string;latitude:string|null;longitude:string|null;gateway_id:string|null;gateway_name:string|null;last_seen_at:string|null;polling_interval_seconds?:number}
const ENERGY_QUALITY_SEVERITY:Record<string,number>={complete:0,partial:1,missing:2,reset:3,preparing:4};
// Ingested aggregates are cumulative meter snapshots, not energy increments. Calculate
// consecutive per-device deltas once, with a bounded previous-day baseline. Never sum snapshots.
const ENERGY_CTE = `WITH samples AS (
 SELECT site_id, device_id, source_time, total_energy_kwh,
 lag(total_energy_kwh) OVER (PARTITION BY device_id ORDER BY source_time) previous,
 lag(source_time) OVER (PARTITION BY device_id ORDER BY source_time) previous_time
 FROM telemetry_raw r WHERE site_id = ANY($1::uuid[]) AND total_energy_kwh IS NOT NULL
 AND EXISTS (SELECT 1 FROM billing_meters bm WHERE bm.site_id=r.site_id AND bm.device_id=r.device_id AND bm.active)
 AND quality IN ('complete','partial')
 AND source_time >= ($2::date::timestamp AT TIME ZONE 'Asia/Bangkok') - interval '1 day'
 AND source_time < (($3::date + 1)::timestamp AT TIME ZONE 'Asia/Bangkok')
), increments AS (
 SELECT site_id, (source_time AT TIME ZONE 'Asia/Bangkok')::date::text AS day,
 total_energy_kwh-previous value FROM samples
 WHERE source_time >= ($2::date::timestamp AT TIME ZONE 'Asia/Bangkok')
 AND previous_time >= ($2::date::timestamp AT TIME ZONE 'Asia/Bangkok')
 AND previous IS NOT NULL AND total_energy_kwh >= previous
)`;

@Injectable()
export class DashboardService {
  constructor(@Inject(DatabaseService) private readonly db:DatabaseService, @Inject(EnergyReadService) private readonly energyRead:EnergyReadService = new EnergyReadService(db)) {}

  private async sites(user:DashboardPrincipal, siteId?:string):Promise<SiteRow[]> {
    if (!user || !['owner','admin','operator','accountant','customer_user'].includes(user.role || '')) throw new ForbiddenException('Dashboard access denied');
    const customerIds = [...new Set([...(user.assignedCustomerIds || []), ...(user.customerId ? [user.customerId] : [])])];
    const global = user.role === 'owner' || user.role === 'admin';
    const customers = user.authorization&&user.role!=='customer_user'?null:!global && user.role !== 'customer_user' && customerIds.length ? customerIds : customerScope(user);
    const domains=(['business','technical'] as const).filter(domain=>hasPermission(user,`${domain}.dashboard.view`));
    const scopes=domains.map(domain=>siteScope(user,domain));
    const assignedSites = user.role === 'customer_user' ? [...(user.assignedSiteIds ?? [])] : user.authorization?(scopes.some(scope=>scope===null)?null:[...new Set(scopes.flatMap(scope=>scope??[]))]):!global && user.assignedSiteIds?.length ? [...user.assignedSiteIds] : null;
    if (siteId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId)) throw new BadRequestException('Invalid site_id');
    const result = await this.db.query<SiteRow>(`SELECT s.id,s.external_site_id,s.name,sc.name customer_name,s.capacity_mwp,s.latitude,s.longitude,
      g.id gateway_id,g.external_gateway_id,g.name gateway_name,g.last_seen_at::text,g.polling_interval_seconds
      FROM sites s JOIN customers sc ON sc.id=s.customer_id
      LEFT JOIN LATERAL (SELECT id,name,external_gateway_id,last_seen_at,polling_interval_seconds FROM gateways WHERE site_id=s.id AND retired_at IS NULL ORDER BY created_at,id LIMIT 1) g ON true
      WHERE ($1::uuid[] IS NULL OR s.customer_id=ANY($1::uuid[]))
      AND ($2::uuid[] IS NULL OR s.id=ANY($2::uuid[]))
      AND ($3::uuid IS NULL OR s.id=$3::uuid) ORDER BY s.name`,[customers,assignedSites,siteId || null]);
    if (siteId && !result.rows.length) throw new ForbiddenException('Site outside assigned scope');
    return result.rows;
  }

  private async energy(ids:string[],start:string,end:string) {
    if (process.env.ENERGY_READ_MODEL_ENABLED==='true') {
      const daily=await this.energyRead.daily(ids,start,end);
      return {rows:daily.map(r=>({site_id:r.siteId,day:r.day,value:r.kwh===null?null:String(r.kwh),quality:r.quality,watermark:r.watermark,refreshedAt:r.refreshedAt,reason:r.reason}))};
    }
    return this.db.query<{site_id:string;day:string;value:string|null;quality?:string;watermark?:string|null;refreshedAt?:string|null;reason?:string|null}>(`${ENERGY_CTE} SELECT site_id,day,sum(value)::text value FROM increments GROUP BY site_id,day ORDER BY day`,[ids,start,end]);
  }

  private async power(ids:string[]) {
    return this.db.query<{site_id:string;power_kw:string;source_time:string;received_time:string}>(`SELECT site_id,sum(active_power_w)/1000 power_kw,max(source_time)::text source_time,max(received_time)::text received_time
      FROM (SELECT DISTINCT ON (device_id) site_id,device_id,active_power_w,source_time,received_time FROM telemetry_raw r
        WHERE EXISTS (SELECT 1 FROM billing_meters bm WHERE bm.site_id=r.site_id AND bm.device_id=r.device_id AND bm.active) AND site_id=ANY($1::uuid[]) AND source_time >= now()-interval '120 seconds' AND source_time <= now()
        AND received_time >= now()-interval '120 seconds' AND active_power_w IS NOT NULL AND quality IN ('complete','partial')
        ORDER BY device_id,source_time DESC,received_time DESC) latest GROUP BY site_id`,[ids]);
  }

  private async generationPower(ids:string[]){
return await this.db.query<{site_id:string;generation_kw:string|null;generation_time:string|null}>(`WITH loggers AS (
 SELECT d.id,d.site_id,d.expected_interval_seconds,p.config FROM devices d JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id
 WHERE d.site_id=ANY($1::uuid[]) AND EXISTS(SELECT 1 FROM gateways g WHERE g.id=d.gateway_id AND g.retired_at IS NULL)
 AND (EXISTS(SELECT 1 FROM gateway_dashboard_sources chosen WHERE chosen.gateway_id=d.gateway_id AND chosen.metric='power' AND chosen.device_id=d.id AND chosen.tag='solar.active_power')
 OR (NOT EXISTS(SELECT 1 FROM gateway_dashboard_sources chosen WHERE chosen.gateway_id=d.gateway_id AND chosen.metric='power') AND p.config->>'deviceType'='solar-logger'))
), latest AS (
 SELECT l.site_id,l.id,l.expected_interval_seconds,ps.value,coalesce(ps.measured_at,ps.polled_at) AS polled_at,ps.received_at,ps.quality,ps.communication,ps.unit
 FROM loggers l LEFT JOIN LATERAL (SELECT * FROM payload_samples ps WHERE ps.device_id=l.id AND ps.site_id=l.site_id
 AND ps.profile_revision_id=(SELECT payload_profile_revision_id FROM devices WHERE id=l.id)
 AND ps.tag='solar.active_power' ORDER BY coalesce(ps.measured_at,ps.polled_at) DESC,ps.received_at DESC,ps.id DESC LIMIT 1) ps ON true
 WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(l.config->'fields') f WHERE f->>'tag'='solar.active_power' AND f->>'targetUnit' IN ('W','kW'))
) SELECT site_id,CASE WHEN (SELECT count(*) FROM loggers all_loggers WHERE all_loggers.site_id=latest.site_id)=1 AND bool_and(unit IN ('W','kW') AND quality='good' AND communication='online'
 AND polled_at BETWEEN now()-make_interval(secs=>greatest(120,expected_interval_seconds*2)) AND now() AND received_at BETWEEN now()-make_interval(secs=>greatest(120,expected_interval_seconds*2)) AND now()
 AND value>=0 AND value<'Infinity'::float8) THEN max(CASE WHEN unit='W' THEN value/1000 ELSE value END) ELSE NULL END generation_kw,max(polled_at)::text generation_time
 FROM latest GROUP BY site_id`,[ids]);
      }

  private async financial(user:DashboardPrincipal,ids:string[],start:string,end:string){
    if(user.role!=='customer_user'&&!hasPermission(user,'business.billing.view'))return null;
    const allowed=siteScope(user,'business');const scoped=user.role==='customer_user'?ids:allowed===null?ids:ids.filter(id=>allowed.includes(id));
    if(!scoped.length)return {...financialInsights([],{start,end,today:new Date(Date.now()+7*3600000).toISOString().slice(0,10),cashReceived:'0'}),cashReceivedDaily:[]};
    const [bills,cash]=await Promise.all([
      this.db.query<InsightBill>(`SELECT b.id,b.site_id AS "siteId",s.name AS "siteName",d.id AS "invoiceId",d.document_number AS "invoiceNumber",b.amount::text,
        coalesce(p.approved,0)::text AS approved,coalesce(p.pending,0)::int AS "pendingReview",to_char(b.due_date,'YYYY-MM-DD') AS "dueDate",to_char(b.period_start,'YYYY-MM-DD') AS "periodStart",b.status
        FROM billing_cycles b JOIN sites s ON s.id=b.site_id JOIN documents d ON d.billing_cycle_id=b.id AND d.document_type='invoice' AND d.is_current AND d.status IN('issued','finalized')
        LEFT JOIN LATERAL (SELECT sum(coalesce(verified_amount,amount)) FILTER(WHERE status='paid') AS approved,count(*) FILTER(WHERE status='pending_verification') AS pending FROM payments WHERE billing_cycle_id=b.id) p ON true
        WHERE b.site_id=ANY($1::uuid[]) AND b.status NOT IN('cancelled','draft','superseded') ORDER BY b.due_date NULLS LAST,b.id`,[scoped]),
      this.db.query<{day:string;amount:string;total:string}>(`SELECT (coalesce(p.verified_transfer_at,p.paid_at) AT TIME ZONE 'Asia/Bangkok')::date::text AS day,
        sum(coalesce(p.verified_amount,p.amount))::text AS amount,sum(sum(coalesce(p.verified_amount,p.amount))) OVER()::text AS total FROM payments p JOIN billing_cycles b ON b.id=p.billing_cycle_id
        WHERE b.site_id=ANY($1::uuid[]) AND p.status='paid' AND b.status<>'cancelled' AND coalesce(p.verified_transfer_at,p.paid_at)>=($2::date::timestamp AT TIME ZONE 'Asia/Bangkok') AND coalesce(p.verified_transfer_at,p.paid_at)<(($3::date+1)::timestamp AT TIME ZONE 'Asia/Bangkok') GROUP BY day ORDER BY day`,[scoped,start,end]),
    ]);
    return {...financialInsights(bills.rows,{start,end,today:new Date(Date.now()+7*3600000).toISOString().slice(0,10),cashReceived:cash.rows[0]?.total??'0'}),cashReceivedDaily:cash.rows.map(row=>({date:row.day,value:Number(row.amount)}))};
  }

  private async contexts(user:DashboardPrincipal,ids:string[]):Promise<DashboardSiteContext[]>{
    if(!ids.length)return [];
    const result=await this.db.query<DashboardSiteContext>(`SELECT s.id,s.name,s.external_site_id AS code,c.name AS "customerName",s.capacity_mwp::text AS "capacityMwp",s.status,c.region,
      CASE WHEN g.id IS NULL THEN NULL ELSE jsonb_build_object('id',g.id,'name',g.name,'code',g.external_gateway_id,'protocol',g.protocol,'topic',g.endpoint,'lastSeenAt',g.last_seen_at,'interval',g.polling_interval_seconds,'brokerName',mb.name,
      'configurationState',CASE WHEN g.desired_config_version=0 THEN 'unpublished' WHEN g.applied_config_version=g.desired_config_version THEN 'applied' WHEN g.acknowledged_config_version=g.desired_config_version THEN 'acknowledged' WHEN g.published_config_version=g.desired_config_version THEN 'published' ELSE 'pending' END) END AS gateway,
      coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'model',d.model,'code',d.external_device_id,'profileVersion',p.version,'interval',d.expected_interval_seconds,'lastReceivedAt',last.received_at,'lastMeasuredAt',last.polled_at,'billingSource',EXISTS(SELECT 1 FROM billing_meters bm WHERE bm.device_id=d.id AND bm.site_id=s.id AND bm.active)) ORDER BY d.name,d.id)
        FROM devices d LEFT JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id LEFT JOIN LATERAL (SELECT received_at,polled_at FROM payload_samples WHERE device_id=d.id ORDER BY polled_at DESC,received_at DESC LIMIT 1) last ON true WHERE d.gateway_id=g.id),'[]'::jsonb) AS devices
      FROM sites s JOIN customers c ON c.id=s.customer_id LEFT JOIN gateways g ON g.site_id=s.id AND g.retired_at IS NULL LEFT JOIN mqtt_brokers mb ON mb.id=g.mqtt_broker_id WHERE s.id=ANY($1::uuid[])`,[ids]);
    const business=(user.role==='customer_user'||hasPermission(user,'business.sites.view'))?await this.db.query<NonNullable<DashboardSiteContext['business']>&{siteId:string}>(`SELECT b.site_id AS "siteId",to_char(b.service_start_date,'YYYY-MM-DD') AS "serviceStartDate",b.payment_term_days AS "paymentTermDays",b.tax_rate::text AS "taxRate",b.reminders_enabled AS "remindersEnabled",b.reminder_start_days AS "reminderStartDays",b.reminder_interval_days AS "reminderIntervalDays",r.rate::text,to_char(r.effective_from,'YYYY-MM-DD') AS "rateFrom" FROM site_billing_settings b LEFT JOIN LATERAL (SELECT rate,effective_from FROM rate_versions WHERE site_id=b.site_id AND effective_from<=(now() AT TIME ZONE 'Asia/Bangkok')::date AND (effective_to IS NULL OR effective_to>=(now() AT TIME ZONE 'Asia/Bangkok')::date) ORDER BY effective_from DESC LIMIT 1) r ON true WHERE b.site_id=ANY($1::uuid[])`,[user.role==='customer_user'||siteScope(user,'business')===null?ids:ids.filter(id=>siteScope(user,'business')!.includes(id))]):{rows:[]};
    for(const context of result.rows){
    const scope=siteScope(user,'business');
    if((user.role==='customer_user'||hasPermission(user,'business.sites.view'))&&(scope===null||scope.includes(context.id))){
      const config=business.rows.find(row=>row.siteId===context.id || (ids.length===1&&!row.siteId));if(config)context.business=config;
    }
    const technicalScope=siteScope(user,'technical');
    // Owners can read inventory for their authorized sites; this grants no technical writes.
    if(user.role!=='owner'&&(user.role==='customer_user'||!hasPermission(user,'technical.dashboard.view')||(technicalScope!==null&&!technicalScope.includes(context.id)))){
      context.gateway=null;
      context.devices=[];
    }
    }
    return result.rows;
  }

  private async context(user:DashboardPrincipal,ids:string[]){return ids.length===1?(await this.contexts(user,ids))[0]??null:null;}

  private async maintenance(user:DashboardPrincipal,ids:string[]){
    if(!hasPermission(user,'technical.dashboard.view'))return null;
    const scope=siteScope(user,'technical');const scoped=scope===null?ids:ids.filter(id=>scope.includes(id));
    const rows=await this.db.query<{gatewayId:string;gatewayName:string;siteName:string;lastSeenAt:string|null;pendingConfiguration:boolean;devices:number;staleDevices:number;staleGateway:boolean}>(`SELECT g.id AS "gatewayId",g.name AS "gatewayName",s.name AS "siteName",g.last_seen_at::text AS "lastSeenAt",g.desired_config_version>g.applied_config_version AS "pendingConfiguration",
      (g.last_seen_at IS NULL OR g.last_seen_at<now()-make_interval(secs=>greatest(120,g.polling_interval_seconds*2))) AS "staleGateway",
      count(d.id)::int AS devices,count(d.id) FILTER(WHERE last.received_at IS NULL OR last.received_at<now()-make_interval(secs=>greatest(120,d.expected_interval_seconds*2)))::int AS "staleDevices"
      FROM gateways g JOIN sites s ON s.id=g.site_id LEFT JOIN devices d ON d.gateway_id=g.id LEFT JOIN LATERAL (SELECT received_at FROM payload_samples WHERE device_id=d.id ORDER BY polled_at DESC,received_at DESC LIMIT 1) last ON true
      WHERE g.site_id=ANY($1::uuid[]) AND g.retired_at IS NULL GROUP BY g.id,s.name ORDER BY g.name`,[scoped]);
    const counts=await this.db.query<{rejected:number;warnings:number}>(`SELECT (SELECT count(*) FROM payload_rejections WHERE site_id=ANY($1::uuid[]) AND received_at>=now()-interval '24 hours')::int AS rejected,
      (SELECT count(*) FROM measurement_comparison_pairs p JOIN gateways g ON g.id=p.gateway_id WHERE g.site_id=ANY($1::uuid[]) AND p.alert_enabled AND (SELECT count(*)=3 AND bool_and(state='mismatch') FROM (SELECT state FROM measurement_comparison_windows WHERE pair_id=p.id AND state IN ('ok','mismatch') ORDER BY window_start DESC LIMIT 3) w))::int AS warnings`,[scoped]);
    return {gateways:rows.rows.length,staleGateways:rows.rows.filter(row=>row.staleGateway).length,devices:rows.rows.reduce((n,row)=>n+row.devices,0),staleDevices:rows.rows.reduce((n,row)=>n+row.staleDevices,0),pendingConfigurations:rows.rows.filter(row=>row.pendingConfiguration).length,rejectedMessages:counts.rows[0]?.rejected??0,comparisonWarnings:counts.rows[0]?.warnings??0,attention:rows.rows.filter(row=>row.staleGateway||row.staleDevices||row.pendingConfiguration).slice(0,20).map(({staleGateway,devices,...row})=>row)};
  }
  async getSummary(user:DashboardPrincipal,start:string,end:string,siteId?:string) {
    dashboardRange({start_date:start,end_date:end});
    const availableSites=await this.sites(user);
    const sites=siteId ? await this.sites(user,siteId) : availableSites;
    const ids=sites.map(s=>s.id);
    const businessScope=siteScope(user,'business');const financialIds=user.role==='customer_user'||businessScope===null?ids:ids.filter(id=>businessScope.includes(id));
    const [energy,power,billing,alerts]=await Promise.all([
      generationEnergy(this.db,ids,start,end),this.generationPower(ids),
      (user.role!=='customer_user'&&!hasPermission(user,'business.billing.view') ? Promise.resolve({rows:[] as {site_id:string;day:string;amount:string;consumed_kwh:string;paid:boolean}[]}) : this.db.query<{site_id:string;day:string;amount:string;consumed_kwh:string;paid:boolean}>(`SELECT b.site_id,b.period_start::text AS day,b.amount::text,b.consumed_kwh::text,
        coalesce((SELECT sum(coalesce(p.verified_amount,p.amount)) FROM payments p WHERE p.billing_cycle_id=b.id AND p.status='paid'),0)>=b.amount paid
        FROM billing_cycles b WHERE b.site_id=ANY($1::uuid[]) AND b.status NOT IN('draft','cancelled','superseded') AND EXISTS(SELECT 1 FROM documents d WHERE d.billing_cycle_id=b.id AND d.document_type='invoice' AND d.is_current AND d.status IN('issued','finalized')) AND b.period_start >= $2::date AND b.period_start <= $3::date ORDER BY b.period_end`,[financialIds,start,end])),
      this.db.query<{id:string;title:string;detail:string;severity:string;status:string;occurred_at:string;active_count?:string}>(`SELECT id,title,detail,severity,status,occurred_at::text,
        count(*) FILTER (WHERE status <> 'acknowledged') OVER ()::text active_count FROM alerts WHERE site_id=ANY($1::uuid[])
        AND occurred_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Bangkok') AND occurred_at < (($3::date+1)::timestamp AT TIME ZONE 'Asia/Bangkok') ORDER BY occurred_at DESC LIMIT 5`,[ids,start,end]),
    ]);
    const production=new Map<string,number|null>(); const qualities=new Map<string,string>(); const watermarks=new Map<string,string>(); const reasons=new Map<string,Set<string>>(); const unknownSites=new Set<string>(); const revenue=new Map<string,number>(); const perSite=new Map<string,number>();
    for (const row of energy.rows) {
      if(row.value===null){production.set(row.day,null);unknownSites.add(row.site_id);} else {if(production.get(row.day)!==null)production.set(row.day,(production.get(row.day)||0)+Number(row.value));perSite.set(row.site_id,(perSite.get(row.site_id)||0)+Number(row.value));}
      if(row.quality && (!qualities.has(row.day)||(ENERGY_QUALITY_SEVERITY[row.quality]??2)>(ENERGY_QUALITY_SEVERITY[qualities.get(row.day)!]??2)))qualities.set(row.day,row.quality);
      if(row.watermark && (!watermarks.has(row.day)||row.watermark<watermarks.get(row.day)!))watermarks.set(row.day,row.watermark);
      if(row.reason){const all=reasons.get(row.day)??new Set<string>();for(const reason of row.reason.split(',').map(r=>r.trim()).filter(Boolean))all.add(reason);reasons.set(row.day,all);}
    }
    for (const row of billing.rows) revenue.set(row.day,(revenue.get(row.day)||0)+Number(row.amount));
    const insights=await this.financial(user,ids,start,end);
    const total=insights?Number(insights.cohortBilled):0;
    const paid=insights?Number(insights.cohortCollected):0;
    const online=(s:SiteRow)=>Boolean(s.last_seen_at && Date.now()-Date.parse(s.last_seen_at)>=0 && Date.now()-Date.parse(s.last_seen_at)<=Math.max(120,(s.polling_interval_seconds??60)*2)*1000);
    return {
      range:{start,end},maintenanceInsights:await this.maintenance(user,ids),selectedSite:await this.context(user,ids),financialInsights:insights,capabilities:{business:user.role==='customer_user'||hasPermission(user,'business.dashboard.view'),technical:hasPermission(user,'technical.dashboard.view')},availableSites:availableSites.map(s=>({id:s.id,externalSiteId:s.external_site_id??null,name:s.name})),
      // Navigation metadata only: do not expose measurements or gateway state for unselected sites.
      availableMapSites:availableSites.map(s=>({id:s.id,externalSiteId:s.external_site_id??null,name:s.name,customerName:s.customer_name,latitude:s.latitude===null?null:Number(s.latitude),longitude:s.longitude===null?null:Number(s.longitude)})),
      stats:{energy:energyCompleteness(ids,energy.rows),totalSites:sites.length,onlineSites:sites.filter(online).length,installedMwp:sites.reduce((n,s)=>n+Number(s.capacity_mwp),0),
        currentMw:power.rows.length ? power.rows.every(r=>r.generation_kw!==null)?power.rows.reduce((n,r)=>n+Number(r.generation_kw),0)/1000:null : null,
        periodKwh:energy.rows.length && ![...production.values()].includes(null) ? [...production.values()].reduce<number>((a,b)=>a+(b??0),0) : null,periodAmount:total,
        billCount:billing.rows.length,paidBillCount:billing.rows.filter(r=>r.paid).length},
      production:[...production].map(([date,value])=>{const allReasons=[...(reasons.get(date)??[])].sort();return {date,value,observedValue:energyCompleteness(ids,energy.rows.filter(row=>row.day===date)).observedKwh,quality:qualities.get(date)??'partial',watermark:watermarks.get(date)??null,reason:allReasons.length?allReasons.join(','):null,reasons:allReasons};}),
      energyReadModel:{enabled:process.env.ENERGY_READ_MODEL_ENABLED==='true',status:energy.rows.some(r=>r.quality==='preparing')?'preparing':'ready',watermark:energy.rows.map(r=>r.watermark).filter(Boolean).sort()[0]??null},
      revenue:[...revenue].map(([date,value])=>({date,value})),
      cashReceivedDaily:insights?.cashReceivedDaily??[],
      periodInvoices:insights?.periodInvoices??{items:[],total:0,hasMore:false},
      rankings:sites.filter(s=>perSite.has(s.id)&&!unknownSites.has(s.id)).map(s=>({name:s.name,productionKwh:perSite.get(s.id)!})).sort((a,b)=>b.productionKwh-a.productionKwh).slice(0,5),
      alerts:alerts.rows.map(({active_count,...alert})=>alert),alertActiveCount:Number(alerts.rows[0]?.active_count??0),collection:{total,paid,pending:total-paid,paidPercent:total ? paid/total*100 : 0,...(insights?{statuses:insights.collectionStatuses}:{})},
      sites:sites.map(s=>({id:s.id,externalSiteId:s.external_site_id??null,name:s.name,customerName:s.customer_name,latitude:s.latitude===null?null:Number(s.latitude),longitude:s.longitude===null?null:Number(s.longitude),
        sourceFingerprint:energy.sourceFingerprints.get(s.id)??null,energy:energyCompleteness([s.id],energy.rows),status:online(s)?'online':'offline',capacityMwp:Number(s.capacity_mwp),productionKwh:unknownSites.has(s.id)?null:perSite.get(s.id)??null,
        externalGatewayId:s.external_gateway_id??null,gatewayId:s.gateway_id,gatewayName:s.gateway_name,lastUpdated:s.last_seen_at})),
    };
  }

  async comparison(user:DashboardPrincipal,siteIds:string[],start:string,end:string):Promise<import('@solar/api-contracts').DashboardComparison>{
    dashboardRange({start_date:start,end_date:end});
    const allowed=await this.sites(user);
    if(siteIds.some(id=>!allowed.some(site=>site.id===id)))throw new ForbiddenException('Site outside assigned scope');
    const ids=siteIds.length?[...new Set(siteIds)]:allowed.map(site=>site.id);
    const scope=siteScope(user,'business');
    const financialIds=user.role==='customer_user'||hasPermission(user,'business.billing.view')?ids.filter(id=>user.role==='customer_user'||scope===null||scope.includes(id)):[];
    const [energy,contexts,bills]=await Promise.all([
      generationEnergy(this.db,ids,start,end),this.contexts(user,ids),
      financialIds.length?this.db.query<InsightBill>(`SELECT b.id,b.site_id AS "siteId",s.name AS "siteName",b.amount::text,
        coalesce(p.approved,0)::text AS approved,coalesce(p.pending,0)::int AS "pendingReview",to_char(b.due_date,'YYYY-MM-DD') AS "dueDate",to_char(b.period_start,'YYYY-MM-DD') AS "periodStart",b.status
        FROM billing_cycles b JOIN sites s ON s.id=b.site_id
        LEFT JOIN LATERAL (SELECT sum(coalesce(verified_amount,amount)) FILTER(WHERE status='paid') AS approved,count(*) FILTER(WHERE status='pending_verification') AS pending FROM payments WHERE billing_cycle_id=b.id) p ON true
        WHERE b.site_id=ANY($1::uuid[]) AND b.period_start BETWEEN $2::date AND $3::date AND b.status NOT IN('draft','cancelled','superseded')
        AND EXISTS(SELECT 1 FROM documents d WHERE d.billing_cycle_id=b.id AND d.document_type='invoice' AND d.is_current AND d.status IN('issued','finalized'))`,[financialIds,start,end]):Promise.resolve({rows:[] as InsightBill[]})
    ]);
    const today=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
    return {range:{start,end},sites:ids.map(id=>{
      const site=allowed.find(site=>site.id===id)!;
      const production=energy.rows.filter(row=>row.site_id===id).map(row=>({date:row.day,value:row.value===null?null:Number(row.value),quality:row.quality}));
      const siteBills=bills.rows.filter(bill=>bill.siteId===id),daily=new Map<string,number>();
      for(const bill of siteBills)daily.set(bill.periodStart,(daily.get(bill.periodStart)??0)+Number(bill.amount));
      const insight=financialInsights(siteBills,{start,end,today,cashReceived:'0'});
      return {siteId:id,site:site.name,installedMwp:Number(site.capacity_mwp),generatedKwh:production.length&&production.every(row=>row.value!==null)?production.reduce((sum,row)=>sum+row.value!,0):null,
        production,finance:financialIds.includes(id)?{cohortBilled:insight.cohortBilled,cohortCollected:insight.cohortCollected,cohortOutstanding:insight.cohortOutstanding,collectionStatuses:insight.collectionStatuses,asOf:insight.asOf}:null,financialDaily:[...daily].map(([date,value])=>({date,value})),context:contexts.find(context=>context.id===id)??null};
    })};
  }
  async compare(user:DashboardPrincipal,metric:string,siteIds:string[],start:string,end:string) {
    dashboardRange({start_date:start,end_date:end});
    if (!['installedMwp','onlineSites','currentMw','periodKwh','periodAmount'].includes(metric)) throw new BadRequestException('Invalid comparison metric');
    const allowed=await this.sites(user);
    if (siteIds.some(id=>!allowed.some(s=>s.id===id))) throw new ForbiddenException('Site outside assigned scope');
    const ids=(siteIds.length ? [...new Set(siteIds)] : allowed.map(s=>s.id));
    const selected=allowed.filter(site=>ids.includes(site.id));
    const values=new Map<string,number>();
    if (metric==='periodKwh') {
      const result=await generationEnergy(this.db,ids,start,end);
      const unknown=new Set(result.rows.filter(r=>r.value===null).map(r=>r.site_id));
      for (const row of result.rows) if(!unknown.has(row.site_id))values.set(row.site_id,(values.get(row.site_id)||0)+Number(row.value));
    } else if (metric==='currentMw') {
      const result=await this.generationPower(ids);
      for (const row of result.rows) if(row.generation_kw!==null)values.set(row.site_id,Number(row.generation_kw)/1000);
    } else if (metric==='periodAmount') {
      if(user.role!=='customer_user'&&!hasPermission(user,'business.billing.view'))throw new ForbiddenException('Billing access denied');
      const scope=siteScope(user,'business');if(scope!==null&&ids.some(id=>!scope.includes(id)))throw new ForbiddenException('Site outside business scope');
      const result=await this.db.query<{site_id:string;amount:string}>(`SELECT b.site_id,sum(b.amount)::text amount FROM billing_cycles b
        WHERE b.site_id=ANY($1::uuid[]) AND b.status NOT IN('draft','cancelled','superseded')
        AND EXISTS(SELECT 1 FROM documents d WHERE d.billing_cycle_id=b.id AND d.document_type='invoice' AND d.is_current AND d.status IN('issued','finalized'))
        AND b.period_start >= $2::date AND b.period_start <= $3::date GROUP BY b.site_id`,[ids,start,end]);
      for (const row of result.rows) values.set(row.site_id,Number(row.amount));
    }
    // Response identities are site IDs, including when display names are duplicated.
    return selected.map(site=>({siteId:site.id,externalSiteId:site.external_site_id??null,site:site.name,value:
      metric==='installedMwp'?Number(site.capacity_mwp):
      metric==='onlineSites'?(site.last_seen_at && Date.now()-Date.parse(site.last_seen_at)>=0 && Date.now()-Date.parse(site.last_seen_at)<=120000?1:0):
      values.get(site.id)??(metric==='periodAmount'?0:null)}));
  }
  async getDay(user:DashboardPrincipal,start:string,end:string,siteId?:string){
    dashboardRange({start_date:start,end_date:end});
    if(start!==end)throw new BadRequestException('Select a single day');
    const sites=await this.sites(user,siteId),ids=sites.map(site=>site.id);
    const samples=ids.length?await this.db.query<{site_id:string;device_id:string;polled_at:string;value:string}>(GENERATION_SAMPLES_SQL,[ids,start,end]):{rows:[]};
    const days=generationDays(ids,start,end,samples.rows);
    return {date:start,sites:sites.map(site=>({siteId:site.id,name:site.name,energy:energyCompleteness([site.id],days),watermark:days.find(day=>day.site_id===site.id)?.watermark??null,points:generationHours(site.id,start,samples.rows)}))};
  }
  async getPowerFlow(user:DashboardPrincipal,siteId?:string) {
    const sites=await this.sites(user,siteId);
    const values=await this.power(sites.map(s=>s.id));
        const pv=await this.generationPower(sites.map(site=>site.id));
return {sites:sites.map(s=>{
      const reading=values.rows.find(r=>r.site_id===s.id);
      return {siteId:s.id,externalSiteId:s.external_site_id??null,siteName:s.name,externalGatewayId:s.external_gateway_id??null,gatewayId:s.gateway_id,gatewayName:s.gateway_name,
        timestamp:reading?.source_time??null,serverReceivedAt:reading?.received_time??null,lastUpdated:s.last_seen_at,
        meterPowerKw:reading?Number(reading.power_kw):null,
        solarKw:reading?Number(reading.power_kw):null, // Legacy generic billing meter field; never use as PV.
        generationKw:pv.rows.find(row=>row.site_id===s.id)?.generation_kw==null?null:Number(pv.rows.find(row=>row.site_id===s.id)!.generation_kw),
        generationTimestamp:pv.rows.find(row=>row.site_id===s.id)?.generation_time??null,
        // A generation meter cannot establish building load, grid import or export.
        customerLoadKw:null,gridImportKw:null,gridExportKw:null};
    })};
  }
}
