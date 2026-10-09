import { generationEnergy } from './generation-energy.js';
import { EnergyReadService } from './energy-read.service.js';
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { schoolScope } from '../../common/auth/resource-scope.js';
import { DatabaseService } from '../../database/database.service.js';

export interface DashboardPrincipal { id?:string; role?:string; schoolId?:string; assignedSchoolIds?:readonly string[]; assignedSiteIds?:readonly string[] }
interface SiteRow {external_site_id:string|null;external_gateway_id:string|null;id:string;name:string;school_name:string;capacity_mwp:string;latitude:string|null;longitude:string|null;gateway_id:string|null;gateway_name:string|null;last_seen_at:string|null}
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
    if (!user || !['owner','admin','operator','accountant','school_user'].includes(user.role || '')) throw new ForbiddenException('Dashboard access denied');
    const schoolIds = [...new Set([...(user.assignedSchoolIds || []), ...(user.schoolId ? [user.schoolId] : [])])];
    const global = user.role === 'owner' || user.role === 'admin';
    const schools = !global && user.role !== 'school_user' && schoolIds.length ? schoolIds : schoolScope(user);
    const assignedSites = !global && user.assignedSiteIds?.length ? [...user.assignedSiteIds] : null;
    if (siteId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId)) throw new BadRequestException('Invalid site_id');
    const result = await this.db.query<SiteRow>(`SELECT s.id,s.external_site_id,s.name,sc.name school_name,s.capacity_mwp,s.latitude,s.longitude,
      g.id gateway_id,g.external_gateway_id,g.name gateway_name,g.last_seen_at::text
      FROM sites s JOIN schools sc ON sc.id=s.school_id
      LEFT JOIN LATERAL (SELECT id,name,external_gateway_id,last_seen_at FROM gateways WHERE site_id=s.id ORDER BY created_at,id LIMIT 1) g ON true
      WHERE ($1::uuid[] IS NULL OR s.school_id=ANY($1::uuid[]))
      AND ($2::uuid[] IS NULL OR s.id=ANY($2::uuid[]))
      AND ($3::uuid IS NULL OR s.id=$3::uuid) ORDER BY s.name`,[schools,assignedSites,siteId || null]);
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

  async getSummary(user:DashboardPrincipal,start:string,end:string,siteId?:string) {
    const availableSites=await this.sites(user);
    const sites=siteId ? await this.sites(user,siteId) : availableSites;
    const ids=sites.map(s=>s.id);
    const [energy,power,billing,alerts]=await Promise.all([
      (user.role==='school_user'?generationEnergy(this.db,ids,start,end):this.energy(ids,start,end)),this.power(ids),
      this.db.query<{site_id:string;day:string;amount:string;consumed_kwh:string;paid:boolean}>(`SELECT b.site_id,b.period_end::text AS day,b.amount::text,b.consumed_kwh::text,
        EXISTS(SELECT 1 FROM payments p WHERE p.billing_cycle_id=b.id AND p.status='paid') paid
        FROM billing_cycles b WHERE b.site_id=ANY($1::uuid[]) AND b.period_start >= $2::date AND b.period_start <= $3::date ORDER BY b.period_end`,[ids,start,end]),
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
    const total=billing.rows.reduce((sum,r)=>sum+Number(r.amount),0);
    const paid=billing.rows.filter(r=>r.paid).reduce((sum,r)=>sum+Number(r.amount),0);
    const online=(s:SiteRow)=>Boolean(s.last_seen_at && Date.now()-Date.parse(s.last_seen_at)>=0 && Date.now()-Date.parse(s.last_seen_at)<=120000);
    return {
      range:{start,end},availableSites:availableSites.map(s=>({id:s.id,externalSiteId:s.external_site_id??null,name:s.name})),
      // Navigation metadata only: do not expose measurements or gateway state for unselected sites.
      availableMapSites:availableSites.map(s=>({id:s.id,externalSiteId:s.external_site_id??null,name:s.name,schoolName:s.school_name,latitude:s.latitude===null?null:Number(s.latitude),longitude:s.longitude===null?null:Number(s.longitude)})),
      stats:{totalSites:sites.length,onlineSites:sites.filter(online).length,installedMwp:sites.reduce((n,s)=>n+Number(s.capacity_mwp),0),
        currentMw:power.rows.length ? power.rows.reduce((n,r)=>n+Number(r.power_kw),0)/1000 : null,
        periodKwh:energy.rows.length && ![...production.values()].includes(null) ? [...production.values()].reduce<number>((a,b)=>a+(b??0),0) : null,periodAmount:total,
        billCount:billing.rows.length,paidBillCount:billing.rows.filter(r=>r.paid).length},
      production:[...production].map(([date,value])=>{const allReasons=[...(reasons.get(date)??[])].sort();return {date,value,quality:qualities.get(date)??'partial',watermark:watermarks.get(date)??null,reason:allReasons.length?allReasons.join(','):null,reasons:allReasons};}),
      energyReadModel:{enabled:process.env.ENERGY_READ_MODEL_ENABLED==='true',status:energy.rows.some(r=>r.quality==='preparing')?'preparing':'ready',watermark:energy.rows.map(r=>r.watermark).filter(Boolean).sort()[0]??null},
      revenue:[...revenue].map(([date,value])=>({date,value})),
      rankings:sites.filter(s=>perSite.has(s.id)&&!unknownSites.has(s.id)).map(s=>({name:s.name,productionKwh:perSite.get(s.id)!})).sort((a,b)=>b.productionKwh-a.productionKwh).slice(0,5),
      alerts:alerts.rows.map(({active_count,...alert})=>alert),alertActiveCount:Number(alerts.rows[0]?.active_count??0),collection:{total,paid,pending:total-paid,paidPercent:total ? paid/total*100 : 0},
      sites:sites.map(s=>({id:s.id,externalSiteId:s.external_site_id??null,name:s.name,schoolName:s.school_name,latitude:s.latitude===null?null:Number(s.latitude),longitude:s.longitude===null?null:Number(s.longitude),
        status:online(s)?'online':'offline',capacityMwp:Number(s.capacity_mwp),productionKwh:unknownSites.has(s.id)?null:perSite.get(s.id)??null,
        externalGatewayId:s.external_gateway_id??null,gatewayId:s.gateway_id,gatewayName:s.gateway_name,lastUpdated:s.last_seen_at})),
    };
  }

  async compare(user:DashboardPrincipal,metric:string,siteIds:string[],start:string,end:string) {
    if (!['installedMwp','onlineSites','currentMw','periodKwh','periodAmount'].includes(metric)) throw new BadRequestException('Invalid comparison metric');
    const allowed=await this.sites(user);
    if (siteIds.some(id=>!allowed.some(s=>s.id===id))) throw new ForbiddenException('Site outside assigned scope');
    const ids=(siteIds.length ? siteIds : allowed.map(s=>s.id)).slice(0,10);
    const selected=allowed.filter(site=>ids.includes(site.id));
    const values=new Map<string,number>();
    if (metric==='periodKwh') {
      const result=await (user.role==='school_user'?generationEnergy(this.db,ids,start,end):this.energy(ids,start,end));
      const unknown=new Set(result.rows.filter(r=>r.value===null).map(r=>r.site_id));
      for (const row of result.rows) if(!unknown.has(row.site_id))values.set(row.site_id,(values.get(row.site_id)||0)+Number(row.value));
    } else if (metric==='currentMw') {
      const result=await this.power(ids);
      for (const row of result.rows) values.set(row.site_id,Number(row.power_kw)/1000);
    } else if (metric==='periodAmount') {
      const result=await this.db.query<{site_id:string;amount:string}>(`SELECT site_id,sum(amount)::text amount FROM billing_cycles
        WHERE site_id=ANY($1::uuid[]) AND period_start >= $2::date AND period_start <= $3::date GROUP BY site_id`,[ids,start,end]);
      for (const row of result.rows) values.set(row.site_id,Number(row.amount));
    }
    // Response identities are site IDs, including when display names are duplicated.
    return selected.map(site=>({siteId:site.id,externalSiteId:site.external_site_id??null,site:site.name,value:
      metric==='installedMwp'?Number(site.capacity_mwp):
      metric==='onlineSites'?(site.last_seen_at && Date.now()-Date.parse(site.last_seen_at)>=0 && Date.now()-Date.parse(site.last_seen_at)<=120000?1:0):
      values.get(site.id)??(metric==='periodAmount'?0:null)}));
  }
  async getPowerFlow(user:DashboardPrincipal,siteId?:string) {
    const sites=await this.sites(user,siteId);
    const values=await this.power(sites.map(s=>s.id));
    const pv=await this.db.query<{site_id:string;generation_kw:string|null;generation_time:string|null}>(`WITH loggers AS (
 SELECT d.id,d.site_id,p.config FROM devices d JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id
 WHERE d.site_id=ANY($1::uuid[]) AND p.config->>'deviceType'='solar-logger'
), latest AS (
 SELECT l.site_id,l.id,ps.value,ps.polled_at,ps.received_at,ps.quality,ps.communication,ps.unit
 FROM loggers l LEFT JOIN LATERAL (SELECT * FROM payload_samples ps WHERE ps.device_id=l.id AND ps.site_id=l.site_id
 AND ps.profile_revision_id=(SELECT payload_profile_revision_id FROM devices WHERE id=l.id)
 AND ps.tag='solar.active_power' ORDER BY ps.polled_at DESC,ps.received_at DESC,ps.id DESC LIMIT 1) ps ON true
 WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(l.config->'fields') f WHERE f->>'tag'='solar.active_power' AND f->>'targetUnit'='W')
) SELECT site_id,CASE WHEN (SELECT count(*) FROM loggers all_loggers WHERE all_loggers.site_id=latest.site_id)=1 AND bool_and(unit='W' AND quality='good' AND communication='online'
 AND polled_at BETWEEN now()-interval '120 seconds' AND now() AND received_at BETWEEN now()-interval '120 seconds' AND now()
 AND value>=0 AND value<'Infinity'::float8) THEN max(value)/1000 ELSE NULL END generation_kw,max(polled_at)::text generation_time
 FROM latest GROUP BY site_id`,[sites.map(site=>site.id)]);
    return {sites:sites.map(s=>{
      const reading=values.rows.find(r=>r.site_id===s.id);
      return {siteId:s.id,externalSiteId:s.external_site_id??null,siteName:s.name,externalGatewayId:s.external_gateway_id??null,gatewayId:s.gateway_id,gatewayName:s.gateway_name,
        timestamp:reading?.source_time??null,serverReceivedAt:reading?.received_time??null,lastUpdated:s.last_seen_at,
        meterPowerKw:reading?Number(reading.power_kw):null,
        solarKw:reading?Number(reading.power_kw):null, // Legacy generic billing meter field; never use as PV.
        generationKw:pv.rows.find(row=>row.site_id===s.id)?.generation_kw==null?null:Number(pv.rows.find(row=>row.site_id===s.id)!.generation_kw),
        generationTimestamp:pv.rows.find(row=>row.site_id===s.id)?.generation_time??null,
        // A generation meter cannot establish building load, grid import or export.
        schoolLoadKw:null,gridImportKw:null,gridExportKw:null};
    })};
  }
}
