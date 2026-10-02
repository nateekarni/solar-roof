import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash,randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { JobAccessService } from '../jobs/job-access.service.js';
import {validateRestoreWindow,restoreLimits} from '@solar/domain';
@Injectable()
export class ReportJobService {
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService,@Inject(JobAccessService) private readonly access:JobAccessService) {}
 async enqueue(userId:string,body:any,key?:string) {
  if(!body||typeof body!=='object'||Array.isArray(body))throw new BadRequestException('Invalid report payload');
  const type=body.type==='financial'?'billing':body.type==='device'?'device_health':body.type??'energy';
  const format=String(body.format??'csv').toLowerCase(),from=body.dateFrom,to=body.dateTo;
  const valid=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
  if(format!=='csv'||!['energy','device_health','billing','payment','audit'].includes(type)||!valid(from)||!valid(to)||from>to||Date.parse(to)-Date.parse(from)>366*86400000)throw new BadRequestException('Select a valid CSV report and date range of at most one year');
  if(key!==undefined&&(!key.trim()||key.length>200))throw new BadRequestException('Invalid Idempotency-Key');
  return this.db.transaction(async c=>{
   await c.query('SELECT pg_advisory_xact_lock(73501934)');
   const {user,scope}=await this.access.current(userId,undefined,c.query.bind(c));
   if(type==='audit'&&!['owner','admin'].includes(user.role))throw new ForbiddenException();
   const payload={type,format,dateFrom:from,dateTo:to};
   const hash=createHash('sha256').update(JSON.stringify({payload,scope})).digest('hex');
   if(key){const old=(await c.query('SELECT id,payload_hash,status FROM platform_jobs WHERE created_by=$1 AND idempotency_key=$2',[userId,key])).rows[0];if(old){if(old.payload_hash!==hash)throw new ConflictException('Idempotency key used for another request');return {jobId:old.id,status:old.status};}}
   await this.quota(c,userId);
   const id=randomUUID();await c.query("INSERT INTO platform_jobs(id,kind,payload,scope,created_by,idempotency_key,payload_hash) VALUES($1,'report',$2,$3,$4,$5,$6)",[id,payload,scope,userId,key??null,hash]);
   return {jobId:id,status:'queued'};
  });
 }
 async quota(c:any,userId:string) {
  const counts=(await c.query("SELECT count(*) FILTER(WHERE created_by=$1) mine,count(*) total FROM platform_jobs WHERE kind IN ('report','restore') AND status IN ('queued','running')",[userId])).rows[0];
  if(Number(counts.mine)>=1||Number(counts.total)>=1000)throw new HttpException('Report queue quota exceeded',429);
 }
 async retry(userId:string,id:string) {
  const existing=await this.access.get(userId,id);
  if(existing.kind==='restore'&&process.env.HISTORY_RESTORE_ENABLED!=='true')throw new ServiceUnavailableException('History restoration is currently unavailable');
  return this.db.transaction(async c=>{
   await c.query('SELECT pg_advisory_xact_lock(73501934)');
   const job=(await c.query('SELECT * FROM platform_jobs WHERE id::text=$1 FOR UPDATE',[id])).rows[0];
   await this.access.current(userId,job,c.query.bind(c));
   if(!['report','restore'].includes(job.kind))throw new ConflictException('This job cannot retry');
   if(job.kind==='restore'){
    if(process.env.HISTORY_RESTORE_ENABLED!=='true')throw new ServiceUnavailableException('History restoration is currently unavailable');
    try{validateRestoreWindow(job.payload.from,job.payload.to,restoreLimits());}catch{throw new BadRequestException('Invalid history window');}
    const site=(await c.query('SELECT school_id FROM sites WHERE id=$1',[job.payload.siteId])).rows[0];
    if(!site||!Array.isArray(job.scope)||job.scope.length!==1||job.scope[0]!==site.school_id)throw new ForbiddenException();
   }
   if(job.status!=='failed'||job.attempt>=4)throw new ConflictException('Only failed jobs with remaining attempts may retry');
   await this.quota(c,userId);
   await c.query("UPDATE platform_jobs SET status='queued',attempt=attempt+1,error_code=NULL,worker_id=NULL,lease_until=NULL,available_at=now()+make_interval(secs=>$2),updated_at=now() WHERE id=$1",[id,[10,60,300][job.attempt-1]]);
   return {jobId:id,status:'queued',attempt:job.attempt+1};
  });
 }
}
