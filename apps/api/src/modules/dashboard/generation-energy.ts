import type { DatabaseService } from '../../database/database.service.js';
import { createHash } from 'node:crypto';
interface GenerationSample {site_id:string;device_id:string;profile_revision_id?:string;polled_at:string;value:string}
export const GENERATION_SAMPLES_SQL=`SELECT d.site_id,d.id AS device_id,ps.profile_revision_id,ps.polled_at::text,(CASE WHEN ps.unit='kWh' THEN ps.value*1000 ELSE ps.value END)::text AS value
 FROM devices d JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id
 CROSS JOIN LATERAL (SELECT f->>'targetUnit' AS target_unit FROM jsonb_array_elements(p.config->'fields') f WHERE f->>'tag'='solar.total_yield' AND f->>'targetUnit' IN ('Wh','kWh')) yield_field
 LEFT JOIN payload_samples ps ON ps.device_id=d.id AND ps.site_id=d.site_id
 AND ps.profile_revision_id=d.payload_profile_revision_id AND ps.tag='solar.total_yield'
 AND ps.unit=yield_field.target_unit AND ps.quality='good' AND ps.communication='online'
 AND ps.value>=0 AND ps.value<'Infinity'::float8
 AND ps.polled_at>=($2::date::timestamp AT TIME ZONE 'Asia/Bangkok')
 AND ps.polled_at<=(($3::date+1)::timestamp AT TIME ZONE 'Asia/Bangkok') AND ps.polled_at<=now()
 WHERE d.site_id=ANY($1::uuid[]) AND ps.polled_at IS NOT NULL
 AND (EXISTS(SELECT 1 FROM gateway_dashboard_sources chosen WHERE chosen.gateway_id=d.gateway_id AND chosen.metric='energy' AND chosen.device_id=d.id AND chosen.tag='solar.total_yield')
 OR (NOT EXISTS(SELECT 1 FROM gateway_dashboard_sources chosen WHERE chosen.gateway_id=d.gateway_id AND chosen.metric='energy') AND p.config->>'deviceType'='solar-logger'))

 ORDER BY d.site_id,d.id,ps.polled_at,ps.received_at,ps.id`;
/** Counter differences use observed Bangkok day boundaries; no interpolated samples. */
export function generationDays(ids:string[],from:string,to:string,samples:GenerationSample[],now=Date.now()) {
 const first=Date.parse(`${from}T00:00:00+07:00`),last=Date.parse(`${to}T00:00:00+07:00`);
 const span=(last-first)/86400000;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!Number.isInteger(span)||span<0||span>366)throw new Error('Invalid bounded generation range');
 const buckets=new Map<string,Map<number,GenerationSample[]>>();
 for(const sample of samples){
  const time=Date.parse(sample.polled_at);
  if(time<first||time>Math.min(last+86400000,now))continue;
  const index=Math.floor((time-first)/86400000),site=buckets.get(sample.site_id)??new Map<number,GenerationSample[]>();
  for(const dayIndex of time===first+index*86400000?[index-1,index]:[index]){
   if(dayIndex<0||dayIndex>span)continue;
   const bucket=site.get(dayIndex)??[];bucket.push(sample);site.set(dayIndex,bucket);
  }
  buckets.set(sample.site_id,site);
 }
 return ids.flatMap(site_id=>{
  return Array.from({length:Math.max(0,Math.min(span+1,Math.floor((now-first)/86400000)+1))},(_,index)=>{
   const scoped=buckets.get(site_id)?.get(index)??[];
   const opening=first+index*86400000,closing=opening+86400000;
   const devices=new Set(scoped.filter(sample=>{const time=Date.parse(sample.polled_at);return time>=opening&&time<=Math.min(closing,now);}).map(sample=>sample.device_id));
   const observed=new Map<number,number>();
   for(const sample of scoped){const time=Date.parse(sample.polled_at),value=Number(sample.value);if(time>=opening&&time<=Math.min(closing,now)&&Number.isFinite(value)&&value>=0)observed.set(time,value);}
   const times=[...observed.keys()].sort((a,b)=>a-b),end=times.at(-1),day=new Date(opening+7*3600000).toISOString().slice(0,10);
   const reset=times.some((time,i)=>i>0&&observed.get(time)!<observed.get(times[i-1]!)!);
   const complete=end===closing,valid=devices.size===1&&observed.has(opening)&&end!==undefined&&end>opening&&(complete||now<closing)&&!reset;
   const observedValue=devices.size===1&&times.length>1&&!reset?String((observed.get(end!)!-observed.get(times[0]!)!)/1000):null;
   return {site_id,day,value:valid?String((observed.get(end!)!-observed.get(opening)!)/1000):null,observedValue,
    quality:reset?'reset':valid?(complete?'complete':'partial'):'missing',watermark:end===undefined?null:new Date(end).toISOString(),refreshedAt:null,
    reason:reset?'counter_reset':valid?(complete?null:'observed_partial_day'):(devices.size!==1?'solar_logger_unavailable_or_ambiguous':'missing_day_boundary')};
  });
 });
}
export async function generationEnergy(db:DatabaseService,ids:string[],from:string,to:string){
 const sourceFingerprints=new Map<string,string|null>();
 if(!ids.length)return {rows:[],sourceFingerprints};
 const result=await db.query<GenerationSample>(GENERATION_SAMPLES_SQL,[ids,from,to]);
 for(const siteId of ids){
  const samples=result.rows.filter(row=>row.site_id===siteId);
  const sources=new Set(samples.map(row=>JSON.stringify([row.site_id,row.device_id,row.profile_revision_id,'solar.total_yield'])));
  // Opaque identity proves the actual source, without disclosing internal device identifiers.
  sourceFingerprints.set(siteId,samples.length&&samples.every(row=>row.device_id&&row.profile_revision_id)&&sources.size===1?createHash('sha256').update([...sources][0]!).digest('hex'):null);
 }
 return {rows:generationDays(ids,from,to,result.rows),sourceFingerprints};
}

/** A point represents the following hour's energy; absent boundaries remain gaps. */
export function generationHours(siteId:string,day:string,samples:GenerationSample[],now=Date.now()) {
 const opening=Date.parse(`${day}T00:00:00+07:00`);
 return Array.from({length:Math.max(0,Math.min(24,Math.ceil((now-opening)/3600000)))},(_,hour)=>{
  const start=opening+hour*3600000,end=start+3600000;
  const scoped=samples.filter(row=>row.site_id===siteId&&Date.parse(row.polled_at)>=start&&Date.parse(row.polled_at)<=Math.min(end,now));
  const devices=new Set(scoped.map(row=>row.device_id)),observed=new Map<number,number>();
  for(const row of scoped){const value=Number(row.value);if(Number.isFinite(value)&&value>=0)observed.set(Date.parse(row.polled_at),value);}
  const times=[...observed.keys()].sort((a,b)=>a-b),last=times.at(-1);
  const reset=times.some((time,index)=>index>0&&observed.get(time)!<observed.get(times[index-1]!)!);
  const valid=devices.size===1&&observed.has(start)&&last!==undefined&&last>start&&(last===end||now<end)&&!reset;
  return {timestamp:new Date(start).toISOString(),value:valid?(observed.get(last!)!-observed.get(start)!)/1000:null,quality:reset?'reset':valid?(last===end?'complete':'partial'):'missing'};
 });
}
