import type {Pool} from 'pg';
import {randomUUID} from 'node:crypto';

/** At most one Bangkok site-day per poll. Existing history uses a durable keyset cursor. */
export class ArchiveProducer {
 constructor(readonly pool:Pool){}
 async enqueueOne(){
  if(process.env.TELEMETRY_ARCHIVE_ENABLED!=='true'||process.env.TELEMETRY_ARCHIVE_SCHEDULER_ENABLED!=='true')return false;
  const c=await this.pool.connect();
  try{
   await c.query('BEGIN');await c.query("SET LOCAL statement_timeout='5s'");
   if(!(await c.query('SELECT pg_try_advisory_xact_lock(73501936) AS locked')).rows[0].locked){await c.query('COMMIT');return false;}
   // Failed requests retry with their durable object checkpoint; four attempts maximum.
   const retry=(await c.query("SELECT id FROM platform_jobs WHERE kind='archive' AND status='failed' AND attempt<4 AND updated_at<now()-interval '5 minutes' ORDER BY updated_at,id LIMIT 1 FOR UPDATE")).rows[0];
   if(retry){await c.query("UPDATE platform_jobs SET status='queued',attempt=attempt+1,error_code=NULL,available_at=now(),updated_at=now() WHERE id=$1",[retry.id]);await c.query('COMMIT');return true;}
   if(Number((await c.query("SELECT count(*) FROM platform_jobs WHERE kind='archive' AND status IN ('queued','running')")).rows[0].count)>=1){await c.query('COMMIT');return false;}
   const cutoff=(await c.query("SELECT (date_trunc('day',now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')-interval '90 days' AS cutoff")).rows[0].cutoff;
   let row=(await c.query('SELECT site_id,day FROM telemetry_archive_dirty WHERE day+interval \'1 day\'<=$1 ORDER BY day,site_id LIMIT 1 FOR UPDATE',[cutoff])).rows[0];
   let scan=false;
   if(!row){
    await c.query('INSERT INTO telemetry_archive_scan(site_id) SELECT id FROM sites WHERE NOT EXISTS(SELECT 1 FROM telemetry_archive_scan a WHERE a.site_id=sites.id) ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING');
    const cursor=(await c.query('SELECT * FROM telemetry_archive_scan WHERE NOT completed ORDER BY site_id LIMIT 1 FOR UPDATE')).rows[0];
    if(cursor){
     const sample=(await c.query('SELECT source_time FROM telemetry_raw WHERE site_id=$1 AND source_time>=$2 AND source_time<$3 ORDER BY source_time LIMIT 1',[cursor.site_id,cursor.next_from??'1970-01-01',cutoff])).rows[0];
     if(sample){row={site_id:cursor.site_id,day:new Date(new Date(sample.source_time.getTime()+25200000).toISOString().slice(0,10)+'T00:00:00+07:00')};scan=true;}
     else await c.query('UPDATE telemetry_archive_scan SET completed=true WHERE site_id=$1',[cursor.site_id]);
    }
   }
   if(!row){await c.query('COMMIT');return false;}
   const site=(await c.query('SELECT school_id FROM sites WHERE id=$1',[row.site_id])).rows[0];
   const from=new Date(row.day.getTime()+25200000).toISOString().slice(0,10),to=new Date(row.day.getTime()+25200000+86400000).toISOString().slice(0,10),id=randomUUID();
   await c.query("INSERT INTO platform_jobs(id,kind,payload,scope,payload_hash) VALUES($1::uuid,'archive',$2,$3,$1::text)",[id,{siteId:row.site_id,from,to,format:'jsonl.gz'},[site.school_id]]);
   await c.query('DELETE FROM telemetry_archive_dirty WHERE site_id=$1 AND day=$2',[row.site_id,row.day]);
   if(scan)await c.query('UPDATE telemetry_archive_scan SET next_from=$2 WHERE site_id=$1',[row.site_id,to+'T00:00:00+07:00']);
   await c.query('COMMIT');return true;
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 }
}
