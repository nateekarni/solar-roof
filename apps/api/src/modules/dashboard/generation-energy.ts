import type { DatabaseService } from '../../database/database.service.js';
interface GenerationSample {site_id:string;device_id:string;polled_at:string;value:string}
export const GENERATION_SAMPLES_SQL=`SELECT d.site_id,d.id AS device_id,ps.polled_at::text,ps.value::text
 FROM devices d JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id
 LEFT JOIN payload_samples ps ON ps.device_id=d.id AND ps.site_id=d.site_id
 AND ps.profile_revision_id=d.payload_profile_revision_id AND ps.tag='solar.total_yield'
 AND ps.unit='Wh' AND ps.quality='good' AND ps.communication='online'
 AND ps.value>=0 AND ps.value<'Infinity'::float8
 AND ps.polled_at>=($2::date::timestamp AT TIME ZONE 'Asia/Bangkok')
 AND ps.polled_at<=(($3::date+1)::timestamp AT TIME ZONE 'Asia/Bangkok') AND ps.polled_at<=now()
 WHERE d.site_id=ANY($1::uuid[]) AND p.config->>'deviceType'='solar-logger'
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(p.config->'fields') f WHERE f->>'tag'='solar.total_yield' AND f->>'targetUnit'='Wh')
 ORDER BY d.site_id,d.id,ps.polled_at,ps.received_at,ps.id`;
/** Counter differences use observed Bangkok day boundaries; no interpolated samples. */
export function generationDays(ids:string[],from:string,to:string,samples:GenerationSample[],now=Date.now()) {
 const first=Date.parse(`${from}T00:00:00+07:00`),last=Date.parse(`${to}T00:00:00+07:00`);
 const span=(last-first)/86400000;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!Number.isInteger(span)||span<0||span>366)throw new Error('Invalid bounded generation range');
 return ids.flatMap(site_id=>{
  const scoped=samples.filter(s=>s.site_id===site_id),devices=new Set(scoped.map(s=>s.device_id));
  return Array.from({length:span+1},(_,index)=>{
   const opening=first+index*86400000,closing=opening+86400000;
   const observed=new Map<number,number>();
   for(const sample of scoped){const time=Date.parse(sample.polled_at),value=Number(sample.value);if(time>=opening&&time<=Math.min(closing,now)&&Number.isFinite(value)&&value>=0)observed.set(time,value);}
   const times=[...observed.keys()].sort((a,b)=>a-b),end=times.at(-1),day=new Date(opening+7*3600000).toISOString().slice(0,10);
   const reset=times.some((time,i)=>i>0&&observed.get(time)!<observed.get(times[i-1]!)!);
   const complete=end===closing,valid=devices.size===1&&observed.has(opening)&&end!==undefined&&end>opening&&(complete||now<closing)&&!reset;
   return {site_id,day,value:valid?String((observed.get(end!)!-observed.get(opening)!)/1000):null,
    quality:reset?'reset':valid?(complete?'complete':'partial'):'missing',watermark:end===undefined?null:new Date(end).toISOString(),refreshedAt:null,
    reason:reset?'counter_reset':valid?(complete?null:'observed_partial_day'):(devices.size!==1?'solar_logger_unavailable_or_ambiguous':'missing_day_boundary')};
  });
 });
}
export async function generationEnergy(db:DatabaseService,ids:string[],from:string,to:string){
 if(!ids.length)return {rows:[]};
 const result=await db.query<GenerationSample>(GENERATION_SAMPLES_SQL,[ids,from,to]);
 return {rows:generationDays(ids,from,to,result.rows)};
}
