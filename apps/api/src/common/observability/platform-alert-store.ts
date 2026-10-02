import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';

/** A durable episode per condition. Repeated observations do not resend an episode. */
export class PlatformAlertStore {
  constructor(readonly pool:Pool){}
  async observe(conditions:string[]):Promise<void>{
    const client=await this.pool.connect();
    try{
      // Separate from archive scheduling (73501936): monitoring must not wait on history scans.
      await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(73501937)');
      await client.query('UPDATE platform_monitoring_alerts SET active=false,observed_at=now() WHERE active AND NOT(condition_key=ANY($1::text[]))',[conditions]);
      for(const key of new Set(conditions))await client.query(`INSERT INTO platform_monitoring_alerts(condition_key,episode_id,active) VALUES($1,$2,true)
        ON CONFLICT(condition_key) DO UPDATE SET active=true,observed_at=now(),
        episode_id=CASE WHEN platform_monitoring_alerts.active THEN platform_monitoring_alerts.episode_id ELSE EXCLUDED.episode_id END,
        first_seen_at=CASE WHEN platform_monitoring_alerts.active THEN platform_monitoring_alerts.first_seen_at ELSE now() END,
        delivery_status=CASE WHEN platform_monitoring_alerts.active THEN platform_monitoring_alerts.delivery_status ELSE 'pending' END,
        attempts=CASE WHEN platform_monitoring_alerts.active THEN platform_monitoring_alerts.attempts ELSE 0 END,
        lease_until=CASE WHEN platform_monitoring_alerts.active THEN platform_monitoring_alerts.lease_until ELSE NULL END,
        next_attempt_at=CASE WHEN platform_monitoring_alerts.active THEN platform_monitoring_alerts.next_attempt_at ELSE now() END,
        delivered_at=CASE WHEN platform_monitoring_alerts.active THEN platform_monitoring_alerts.delivered_at ELSE NULL END`,[key,randomUUID()]);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async deliverOne(url:string,token?:string):Promise<boolean>{
    // A crashed/ambiguous transmission requires reconciliation; never silently replay it.
    await this.pool.query("UPDATE platform_monitoring_alerts SET delivery_status='uncertain',lease_until=NULL WHERE delivery_status='sending' AND lease_until<=now()");
    const row=(await this.pool.query(`UPDATE platform_monitoring_alerts SET delivery_status='sending',attempts=attempts+1,lease_until=now()+interval '15 seconds'
      WHERE condition_key=(SELECT condition_key FROM platform_monitoring_alerts WHERE active AND delivery_status='pending' AND attempts<3 AND next_attempt_at<=now() ORDER BY first_seen_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`)).rows[0];
    if(!row)return false;
    let status='uncertain';
    try{
      const result=await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','Idempotency-Key':row.episode_id,...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({eventId:row.episode_id,condition:row.condition_key,occurredAt:row.first_seen_at.toISOString()}),signal:AbortSignal.timeout(5000)});
      await result.body?.cancel();
      status=result.ok?'delivered':row.attempts<3?'pending':'failed';
    }catch{/* Unknown acceptance remains visible for operator reconciliation. */}
    await this.pool.query("UPDATE platform_monitoring_alerts SET delivery_status=$2,lease_until=NULL,next_attempt_at=now()+interval '60 seconds',delivered_at=CASE WHEN $2='delivered' THEN now() ELSE NULL END WHERE episode_id=$1 AND delivery_status='sending'",[row.episode_id,status]);
    return true;
  }
}
