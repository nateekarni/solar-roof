import { Inject, Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { createMeasuredCycle, inFinancialTransaction, issueCycleDocument } from './financial-persistence.js';
import { dueMonth, settingValue } from './automation-policy.js';
import { dispatchFinancialDelivery, staffNotice } from './financial-delivery.js';

@Injectable()
export class FinancialAutomationService implements OnModuleInit,OnModuleDestroy {
 private timer:ReturnType<typeof setInterval>|undefined;
 private running=false;
 private readonly logger=new Logger(FinancialAutomationService.name);
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService){}
 onModuleInit(){this.timer=setInterval(()=>void this.tick().catch(error=>this.logger.error((error as Error).message)),60_000);this.timer.unref();void this.tick().catch(error=>this.logger.error((error as Error).message));}
 onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
 async tick(now=new Date()) {
  if(this.running)return;
  this.running=true;
  try {
   const month=dueMonth(now);
   if(month)await inFinancialTransaction(this.db,async client=>{
    const cursor=(await client.query('SELECT next_month FROM financial_scheduler_cursor WHERE singleton=true FOR UPDATE')).rows[0];
    if(!cursor)return;
    // Durable cursor catches every monthly tick missed while all API processes were down.
    await client.query(`INSERT INTO financial_month_jobs(id,site_id,period_start,period_end)
      SELECT gen_random_uuid(),s.id,m::date,(m+interval '1 month'-interval '1 day')::date
      FROM generate_series($1::date,$2::date,interval '1 month') m CROSS JOIN sites s
      WHERE EXISTS(SELECT 1 FROM contracts c WHERE c.site_id=s.id AND c.start_date<(m+interval '1 month') AND (c.end_date IS NULL OR c.end_date>=m))
      ON CONFLICT(site_id,period_start) DO NOTHING`,[cursor.next_month,month.start]);
    await client.query("UPDATE financial_scheduler_cursor SET next_month=($1::date+interval '1 month')::date WHERE singleton=true AND next_month<=$1::date",[month.start]);
   });
   const jobs=(await this.db.query("SELECT id FROM financial_month_jobs WHERE state IN('pending','blocked') AND next_attempt_at<=$1 ORDER BY next_attempt_at LIMIT 50",[now])).rows;
   for(const job of jobs)await this.processMonth(job.id);
   await this.queueReminders();
   await this.dailySummary();
   const deliveries=(await this.db.query("SELECT id FROM financial_delivery_outbox WHERE state IN('pending','retry','paused') AND next_attempt_at<=now() ORDER BY next_attempt_at LIMIT 50")).rows;
   for(const delivery of deliveries)await dispatchFinancialDelivery(this.db,delivery.id);
  }finally{this.running=false;}
 }
 async processMonth(id:string) {
  const lock=await this.db.pool.connect();
  try {
   if(!(await lock.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[`month:${id}`])).rows[0].locked)return;
   const job=(await lock.query("SELECT *,to_char(period_start,'YYYY-MM-DD') AS starts,to_char(period_end,'YYYY-MM-DD') AS ends FROM financial_month_jobs WHERE id=$1 AND state IN('pending','blocked') AND next_attempt_at<=now()",[id])).rows[0];
   if(!job)return;
   try {
    let cycles=(await lock.query('SELECT id FROM billing_cycles WHERE site_id=$1 AND period_start >= $2::date AND period_end <= $3::date',[job.site_id,job.starts,job.ends])).rows;
    if(!cycles.length) {
     const result=await createMeasuredCycle(this.db,job.site_id,job.starts,job.ends);
     cycles=result.cycles;
    }
    const missing=(await lock.query(`SELECT c.id FROM contracts c WHERE c.site_id=$1 AND c.status='active' AND c.start_date<=$3::date AND (c.end_date IS NULL OR c.end_date>=$2::date)
      AND NOT EXISTS(SELECT 1 FROM billing_cycles b WHERE b.contract_id=c.id AND b.period_start=greatest(c.start_date,$2::date) AND b.period_end=least(coalesce(c.end_date,$3::date),$3::date))`,[job.site_id,job.starts,job.ends])).rows;
    if(!cycles.length || missing.length)throw new Error('Incomplete contract cycle coverage requires reconciliation before automatic issue');
    for(const ref of cycles)await inFinancialTransaction(this.db,async client=>{
     const cycle=(await client.query('SELECT * FROM billing_cycles WHERE id=$1 FOR UPDATE',[ref.id])).rows[0];
     if(cycle.status==='cancelled')throw new Error('Cancelled cycle requires financial correction workflow');
     await issueCycleDocument(client,cycle,'invoice');
     await client.query("UPDATE billing_cycles SET status=CASE WHEN status IN('paid','pending_verification') THEN status ELSE 'finalized' END WHERE id=$1",[cycle.id]);
    });
    await lock.query("UPDATE financial_month_jobs SET state='done',completed_at=now(),last_error=NULL WHERE id=$1",[id]);
   }catch(error){
    const message=(error as Error).message;
    await lock.query("UPDATE financial_month_jobs SET state='blocked',attempts=attempts+1,next_attempt_at=now()+interval '1 hour',last_error=$2 WHERE id=$1",[id,message]);
    await staffNotice(lock,`month-first:${id}`,job.site_id,'monthly_billing_blocked',{jobId:id,error:message});
   }
  }finally{await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[`month:${id}`]);lock.release();}
 }
 private async dailySummary(){
  await inFinancialTransaction(this.db,async client=>{
   const rows=(await client.query("SELECT site_id,jsonb_agg(jsonb_build_object('id',id,'period',period_start,'error',last_error)) AS outstanding FROM financial_month_jobs WHERE state='blocked' GROUP BY site_id")).rows;
   const day=(await client.query("SELECT to_char(now() AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS day")).rows[0].day;
   for(const row of rows)await staffNotice(client,`daily:${day}:${row.site_id}`,row.site_id,'daily_billing_summary',{outstanding:row.outstanding});
  });
 }
 private async queueReminders(){
  const settings=(await this.db.query("SELECT key,value FROM system_settings WHERE key IN('financialRemindersEnabled','financialReminderDays')")).rows;
  const enabled=settingValue(settings.find(row=>row.key==='financialRemindersEnabled')?.value)===true;
  const days=settingValue(settings.find(row=>row.key==='financialReminderDays')?.value);
  if(!enabled || !Array.isArray(days) || !days.length || days.some(day=>!Number.isInteger(day)||day<1))return;
  await this.db.query(`INSERT INTO financial_delivery_outbox(id,document_id,purpose)
   SELECT gen_random_uuid(),d.id,'reminder:'||schedule.days::text
   FROM documents d JOIN billing_cycles b ON b.id=d.billing_cycle_id
   CROSS JOIN unnest($1::int[]) AS schedule(days)
   WHERE d.document_type='invoice' AND d.status IN('issued','finalized') AND b.status NOT IN('paid','cancelled')
   AND d.snapshot->>'dueDate' IS NOT NULL
   AND (now() AT TIME ZONE 'Asia/Bangkok')::date >= (d.snapshot->>'dueDate')::date + schedule.days
   AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.billing_cycle_id=b.id AND p.status IN('pending','pending_review','pending_verification'))
   ON CONFLICT(document_id,purpose) DO NOTHING`,[days]);
 }
}




