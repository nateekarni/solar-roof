import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { deriveIncrement } from '@solar/domain';
interface Sample {at:string;kwh:string;quality:string;mapping:string|null;conflict:boolean}
@Injectable()
export class RefreshEnergySummaryJob implements OnModuleInit,OnModuleDestroy {
 private readonly pool:Pool;
 private readonly ownsPool:boolean;
 private timer:ReturnType<typeof setTimeout>|undefined;
 private pending:Promise<unknown>|undefined;
 private stopping=false;
 private readonly logger=new Logger(RefreshEnergySummaryJob.name);
 constructor(pool?:Pool) {
  this.ownsPool=!pool;
  this.pool=pool??new Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:3000,idleTimeoutMillis:30000,statement_timeout:5000,application_name:'solar-worker-energy'});
  if(this.ownsPool)this.pool.on('error',()=>this.logger.warn('Energy database connection lost; retrying'));
 }
 onModuleInit() {if(process.env.ENERGY_SUMMARY_WORKER_ENABLED==='true')this.schedule();}
 private schedule() {
  if(this.stopping)return;
  this.timer=setTimeout(()=>{
   this.pending=this.runBatch(32).catch(()=>this.logger.warn('Energy refresh failed; dirty days retained')).finally(()=>{this.pending=undefined;this.schedule();});
  },1000);this.timer.unref();
 }
 async onModuleDestroy() {this.stopping=true;clearTimeout(this.timer);await this.pending;if(this.ownsPool)await this.pool.end();}
 async runBatch(limit=32):Promise<number> {
  if(!Number.isInteger(limit)||limit<1||limit>64)throw new Error('Invalid energy batch limit');
  const client=await this.pool.connect();
  try {
   await client.query('BEGIN');
   await client.query("SET LOCAL statement_timeout='5000ms'");
   await client.query("INSERT INTO energy_dirty_days(device_id,day) SELECT device_id,day FROM energy_daily WHERE quality='partial' AND day<(now() AT TIME ZONE 'Asia/Bangkok')::date ON CONFLICT(device_id,day) DO NOTHING");
   const dirty=await client.query<{device_id:string;day:string;version:string}>(`SELECT device_id,day::text,version::text FROM energy_dirty_days ORDER BY day,device_id FOR UPDATE SKIP LOCKED LIMIT $1`,[limit]);
   let processed=0;const deadline=Date.now()+10000;
   for(const row of dirty.rows) {
    if(Date.now()>=deadline)break;
    const start=new Date(row.day+'T00:00:00+07:00'),end=new Date(start.getTime()+86400000);
    const site=await client.query('SELECT site_id FROM devices WHERE id=$1',[row.device_id]);
    if(!site.rows[0])continue;
    const baseline=await client.query<Sample>(`SELECT source_time::text at,max(total_energy_kwh)::text kwh,
     CASE WHEN bool_and(quality IN ('complete','partial')) THEN 'complete' ELSE 'invalid' END quality,
     min(mapping_version_id::text) mapping,count(DISTINCT total_energy_kwh)>1 OR count(DISTINCT COALESCE(mapping_version_id::text,'unmapped'))>1 conflict
     FROM telemetry_raw WHERE device_id=$1 AND total_energy_kwh IS NOT NULL AND source_time=(
      SELECT max(source_time) FROM telemetry_raw WHERE device_id=$1 AND source_time<=$2 AND total_energy_kwh IS NOT NULL)
     GROUP BY source_time`,[row.device_id,start]);
    const samples=await client.query<Sample>(`SELECT source_time::text at,max(total_energy_kwh)::text kwh,
     CASE WHEN bool_and(quality IN ('complete','partial')) THEN 'complete' ELSE 'invalid' END quality,
     min(mapping_version_id::text) mapping,count(DISTINCT total_energy_kwh)>1 OR count(DISTINCT COALESCE(mapping_version_id::text,'unmapped'))>1 conflict
     FROM telemetry_raw WHERE device_id=$1 AND source_time>$2 AND source_time<=$3 AND total_energy_kwh IS NOT NULL
     GROUP BY source_time ORDER BY source_time LIMIT 4097`,[row.device_id,start,end]);
    const today=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
    const currentDay=row.day===today;
    let previous=baseline.rows[0],total=0,quality=currentDay?'partial':'complete',reason:string|null=null;
    if(!previous || previous.conflict || !['complete','partial'].includes(previous.quality) || Date.parse(previous.at)!==start.getTime() || (!currentDay && (!samples.rows.length || Date.parse(samples.rows.at(-1)!.at)!==end.getTime()))) {quality='missing';reason='boundary_missing';}
    if(samples.rows.length>4096){quality='missing';reason='sample_limit';}
    for(const current of samples.rows) {
     const delta=deriveIncrement(previous?{at:previous.at,kwh:Number(previous.kwh)}:null,{at:current.at,kwh:Number(current.kwh)});
     if(delta.quality==='reset'){quality='reset';if(reason!=='sample_limit')reason='reset';}
     else if(delta.kwh===null && quality!=='reset'){quality='missing';reason??='invalid_sample';}
     if(current.conflict || current.quality==='invalid' || (previous && previous.mapping!==current.mapping)) {if(quality!=='reset'){quality='missing';reason??='invalid_sample';}}
     if(delta.kwh!==null)total+=delta.kwh;
     previous=current;
    }
    const closing=samples.rows.at(-1)??(currentDay?baseline.rows[0]:undefined);
    await client.query(`INSERT INTO energy_daily(device_id,site_id,day,opening_kwh,closing_kwh,opening_at,closing_at,sample_count,kwh,quality,version,reason)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(device_id,day) DO UPDATE SET
      site_id=EXCLUDED.site_id,opening_kwh=EXCLUDED.opening_kwh,closing_kwh=EXCLUDED.closing_kwh,opening_at=EXCLUDED.opening_at,
      closing_at=EXCLUDED.closing_at,sample_count=EXCLUDED.sample_count,kwh=EXCLUDED.kwh,quality=EXCLUDED.quality,reason=EXCLUDED.reason,version=EXCLUDED.version,refreshed_at=now()`,
     [row.device_id,site.rows[0].site_id,row.day,baseline.rows[0]?.kwh??null,closing?.kwh??null,baseline.rows[0]?.at??null,closing?.at??null,samples.rows.length,['complete','partial'].includes(quality)?total:null,quality,row.version,reason]);
    await client.query('DELETE FROM energy_dirty_days WHERE device_id=$1 AND day=$2 AND version=$3',[row.device_id,row.day,row.version]);
    processed++;
   }
   await client.query('COMMIT');return processed;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 // Durable cursor traverses a device/day matrix, including days with no raw data.
 // A retry enqueues exactly the next bounded page; refreshing never reads a broad raw range.
 async backfill(name:string,from:string,to:string,limit=32):Promise<{queued:number;complete:boolean}> {
  if(!name || name.length>100 || !Number.isInteger(limit)||limit<1||limit>64 || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to))
    || Date.parse(to)<Date.parse(from) || Date.parse(to)-Date.parse(from)>366*86400000)throw new Error('Invalid backfill range');
  const client=await this.pool.connect();
  try {
   await client.query('BEGIN');
   await client.query('INSERT INTO energy_backfill_checkpoints(name,from_day,to_day) VALUES($1,$2,$3) ON CONFLICT(name) DO NOTHING',[name,from,to]);
   const checkpoint=(await client.query('SELECT *,from_day::text from_text,to_day::text to_text,cursor_day::text cursor_text FROM energy_backfill_checkpoints WHERE name=$1 FOR UPDATE',[name])).rows[0];
   if(checkpoint.from_text!==from || checkpoint.to_text!==to)throw new Error('Backfill checkpoint range mismatch');
   if(checkpoint.completed){await client.query('COMMIT');return {queued:0,complete:true};}
   const page=await client.query(`SELECT DISTINCT device_id,day::date::text AS day FROM billing_meters
    CROSS JOIN generate_series($1::date::timestamp,$2::date::timestamp,interval '1 day') day WHERE active AND semantic_field='total_energy'
    AND ($3::uuid IS NULL OR (device_id,day::date)>($3::uuid,$4::date)) ORDER BY device_id,day LIMIT $5`,[from,to,checkpoint.cursor_device,checkpoint.cursor_text,limit]);
   for(const row of page.rows)await client.query(`INSERT INTO energy_dirty_days(device_id,day) VALUES($1,$2) ON CONFLICT(device_id,day) DO UPDATE SET version=energy_dirty_days.version+1,dirtied_at=now()`,[row.device_id,row.day]);
   const last=page.rows.at(-1);const complete=page.rows.length<limit;
   await client.query('UPDATE energy_backfill_checkpoints SET cursor_device=COALESCE($2,cursor_device),cursor_day=COALESCE($3,cursor_day),completed=$4,updated_at=now() WHERE name=$1',[name,last?.device_id??null,last?.day??null,complete]);
   await client.query('COMMIT');return {queued:page.rows.length,complete};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
}
