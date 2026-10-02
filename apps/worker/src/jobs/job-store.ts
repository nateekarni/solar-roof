import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
export class JobStore {
 constructor(readonly pool:Pool) {}
 async claim(kind:'report'|'archive'|'restore',workerId:string,leaseSeconds=60):Promise<any|null> {
  if(!workerId||!Number.isInteger(leaseSeconds)||leaseSeconds<1||leaseSeconds>300)throw Error('Invalid lease');
  const c=await this.pool.connect();
  try {
   await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(73501935)');
   if(kind==='report'&&Number((await c.query("SELECT count(*) FROM platform_jobs WHERE kind='report' AND status='running' AND lease_until>now()")).rows[0].count)>=2){await c.query('COMMIT');return null;}
   if(kind!=='report'&&Number((await c.query("SELECT count(*) FROM platform_jobs WHERE kind IN ('archive','restore') AND status='running' AND lease_until>now()")).rows[0].count)>=1){await c.query('COMMIT');return null;}
   const row=(await c.query(`SELECT * FROM platform_jobs WHERE kind=$1 AND ((status='queued' AND available_at<=now()) OR (status='running' AND lease_until<=now())) ORDER BY CASE WHEN status='running' THEN 0 ELSE 1 END,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`,[kind])).rows[0];
   if(!row){await c.query('COMMIT');return null;}
   const claimed=(await c.query("UPDATE platform_jobs SET status='running',worker_id=$2,lease_until=now()+make_interval(secs=>$3),lease_seconds=$3,updated_at=now() WHERE id=$1 RETURNING *",[row.id,workerId,leaseSeconds])).rows[0];
   await c.query('COMMIT');return claimed;
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 }
 async heartbeat(id:string,workerId:string):Promise<boolean>{return (await this.pool.query("UPDATE platform_jobs SET lease_until=now()+make_interval(secs=>lease_seconds),updated_at=now() WHERE id=$1 AND worker_id=$2 AND status='running' AND lease_until>now()",[id,workerId])).rowCount===1;}
 async manifest(id:string,workerId:string,manifest:any):Promise<boolean>{return (await this.pool.query("UPDATE platform_jobs SET manifest=$3,snapshot_at=$4,row_count=$5,updated_at=now() WHERE id=$1 AND worker_id=$2 AND status='running' AND lease_until>now()",[id,workerId,manifest,manifest.snapshotAt??null,manifest.rowCount??null])).rowCount===1;}
 async complete(id:string,workerId:string,objectKey:string):Promise<boolean>{
  const c=await this.pool.connect();try{await c.query('BEGIN');
   const job=(await c.query("UPDATE platform_jobs SET status='ready',object_key=$3,progress=100,worker_id=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND worker_id=$2 AND status='running' AND lease_until>now() RETURNING *",[id,workerId,objectKey])).rows[0];
   if(job?.created_by){await c.query("INSERT INTO notification_deliveries(id,user_id,title,channel,recipient,status,job_id,dedupe_key) VALUES($1,$2::uuid,'งานพร้อมใช้งาน','in_app',$2::text,'ready',$3,$4) ON CONFLICT(job_id,recipient) DO NOTHING",[randomUUID(),job.created_by,id,`job:${id}:${job.created_by}`]);await c.query("INSERT INTO job_outbox(id,job_id,recipient,event) VALUES($1,$2,$3,'job.ready') ON CONFLICT(job_id,recipient) DO NOTHING",[randomUUID(),id,job.created_by]);}
   await c.query('COMMIT');return !!job;
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 }
 async fail(id:string,workerId:string,errorCode:string):Promise<boolean>{return (await this.pool.query("UPDATE platform_jobs SET status='failed',error_code=$3,worker_id=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND worker_id=$2 AND status='running' AND lease_until>now()",[id,workerId,errorCode])).rowCount===1;}
}
