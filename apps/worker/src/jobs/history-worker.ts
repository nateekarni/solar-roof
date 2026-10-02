import {Injectable,Logger,type OnModuleInit,type OnModuleDestroy} from '@nestjs/common';
import {Pool} from 'pg';
import {S3Client} from '@aws-sdk/client-s3';
import {randomUUID} from 'node:crypto';
import {JobStore} from './job-store.js';
import {ArchiveObjectStore} from './archive-object-store.js';
import {ArchiveTelemetryJob} from './archive-telemetry.job.js';
import {RestoreHistoryJob} from './restore-history.job.js';
import {restoreLimits,validateRestoreWindow} from './archive-policy.js';
import {ArchiveProducer} from './archive-producer.js';

@Injectable()
export class HistoryJobsWorker implements OnModuleInit,OnModuleDestroy {
 readonly store:JobStore;readonly objects:ArchiveObjectStore;
 private readonly ownsPool:boolean;private readonly ownsStorage:boolean;
 private timer:ReturnType<typeof setTimeout>|undefined;private pending:Promise<unknown>|undefined;private stopping=false;private abort:AbortController|undefined;
 private readonly logger=new Logger(HistoryJobsWorker.name);
 constructor(readonly pool:Pool,readonly storage:S3Client,bucket=process.env.STORAGE_BUCKET!,ownership={pool:false,storage:false}){
  this.ownsPool=ownership.pool;this.ownsStorage=ownership.storage;this.store=new JobStore(pool);this.objects=new ArchiveObjectStore(storage,bucket);
 }
 onModuleInit(){if(process.env.HISTORY_RESTORE_WORKER_ENABLED==='true'||process.env.TELEMETRY_ARCHIVE_ENABLED==='true')this.schedule();}
 private schedule(){if(this.stopping)return;this.timer=setTimeout(()=>{this.pending=this.runOnce().catch(()=>this.logger.warn('History polling failed')).finally(()=>{this.pending=undefined;this.schedule();});},1000);this.timer.unref();}
 async onModuleDestroy(){this.stopping=true;clearTimeout(this.timer);this.abort?.abort();await this.pending;if(this.ownsPool)await this.pool.end();if(this.ownsStorage)this.storage.destroy();}
 async allowed(job:any){
  const site=(await this.pool.query('SELECT school_id FROM sites WHERE id=$1',[job.payload.siteId])).rows[0];
  if(!site||!Array.isArray(job.scope)||job.scope.length!==1||job.scope[0]!==site.school_id)return false;
  if(job.kind==='archive'&&job.created_by===null)return true;
  const user=(await this.pool.query('SELECT role,status,school_id FROM users WHERE id=$1',[job.created_by])).rows[0];
  return !!user&&user.status==='active'&&['owner','admin','operator','accountant','school_user'].includes(user.role)&&(user.role==='owner'||!user.school_id&&user.role!=='school_user'||user.school_id===site.school_id);
 }
 async runOnce(){
  const owner=randomUUID();let job:any=null;
  if(process.env.HISTORY_RESTORE_WORKER_ENABLED==='true')job=await this.store.claim('restore',owner);
  if(!job&&process.env.TELEMETRY_ARCHIVE_ENABLED==='true'){await new ArchiveProducer(this.pool).enqueueOne();job=await this.store.claim('archive',owner);}
  if(!job)return false;await this.execute(job,owner);return true;
 }
 async execute(job:any,owner:string){
  const limits=restoreLimits(),abort=new AbortController();this.abort=abort;
  const deadline=setTimeout(()=>abort.abort(),limits.timeoutMs);deadline.unref();
  let heartbeatPending=Promise.resolve();
  const check=async()=>{if(this.stopping||abort.signal.aborted||!await this.store.heartbeat(job.id,owner))throw Error('lease_lost');if(!await this.allowed(job))throw Error('permission_revoked');};
  const heartbeat=setInterval(()=>{heartbeatPending=heartbeatPending.then(check).catch(()=>abort.abort());},15000);heartbeat.unref();
  const save=async(value:any)=>{await check();if(!await this.store.manifest(job.id,owner,value))throw Error('lease_lost');};
  try{
   validateRestoreWindow(job.payload.from,job.payload.to,limits);await check();
   let manifest=job.manifest;
   if(manifest?.checksum){
    try{
     if(manifest.siteId!==job.payload.siteId||manifest.from!==job.payload.from||manifest.to!==job.payload.to)throw Error('archive_mismatch');
     manifest={...manifest,etag:await this.objects.verify(manifest,abort.signal)};
    }catch(error:any){if(error.$metadata?.httpStatusCode!==404)throw error;manifest=null;}
   }else{if(manifest?.uploadId)await this.objects.abortPending(manifest);manifest=null;}
   if(job.kind==='archive'){
    const archiver=new ArchiveTelemetryJob(this.pool,this.objects);
    if(manifest)await archiver.publish(manifest,abort.signal);
    else{
     await archiver.archive(job.payload.siteId,job.payload.from,job.payload.to,{signal:abort.signal,checkpoint:async value=>{manifest=value;await save(value);}});
     manifest={...manifest,etag:await this.objects.verify(manifest,abort.signal)};
    }
   }else if(job.kind==='restore'){
    if(manifest&&!/^restores\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jsonl\.gz$/.test(manifest.key)||manifest&&!manifest.key.startsWith(`restores/${job.id}/`))throw Error('archive_mismatch');
    if(!manifest)manifest=await new RestoreHistoryJob(this.pool,this.objects,this.objects).restore(job.payload.siteId,job.payload.from,job.payload.to,job.id,abort.signal,save);
   }else throw Error('invalid_history_job');
   await save(manifest);await check();if(!await this.store.complete(job.id,owner,manifest.key))throw Error('lease_lost');
  }catch(error:any){
   clearInterval(heartbeat);await heartbeatPending;
   const known=['permission_revoked','lease_lost','invalid_history_job','archive_mismatch','archive_coverage_missing','archive_manifest_limit','archive_compressed_limit','archive_uncompressed_limit','archive_row_limit','archive_record_too_large','archive_scope_mismatch','restore_window_limit'];
   await this.store.fail(job.id,owner,known.includes(error.message)?error.message:abort.signal.aborted?'history_timeout':'history_storage_or_extract_failed');
   this.logger.warn({event:'history_execution_failed',jobId:job.id,reason:known.includes(error.message)?error.message:'history_storage_or_extract_failed'});
  }finally{clearInterval(heartbeat);clearTimeout(deadline);await heartbeatPending;this.abort=undefined;}
 }
}
