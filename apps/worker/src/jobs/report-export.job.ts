import { addAbortSignal, type Readable } from 'node:stream';
import { Injectable,Logger,type OnModuleInit,type OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { createHash,randomUUID } from 'node:crypto';
import { S3Client,GetObjectCommand,CreateMultipartUploadCommand,UploadPartCommand,CompleteMultipartUploadCommand,AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { JobStore } from './job-store.js';
const scoped='($3::uuid[] IS NULL OR s.school_id=ANY($3::uuid[]))';
// Each source has a stable composite key; both timestamps are text to retain microseconds.
const sources:Record<string,{select:string;from:string;where:string;time:string;id:string}>={
 energy:{select:'s.name AS site,d.serial_number AS meter,t.source_time,t.received_time,t.normalized_value AS cumulative_kwh,t.quality',from:'telemetry_raw t JOIN sites s ON s.id=t.site_id JOIN devices d ON d.id=t.device_id',where:`t.semantic_field='total_energy' AND t.source_time>=$1::date AND t.source_time<$2::date+interval '1 day' AND ${scoped}`,time:'t.source_time',id:'t.id'},
 billing:{select:'s.name AS site,b.period_start,b.period_end,b.consumed_kwh,b.rate,b.amount,b.status,b.quality',from:'billing_cycles b JOIN sites s ON s.id=b.site_id',where:`b.period_start>=$1::date AND b.period_end<=$2::date AND ${scoped}`,time:'b.period_start::timestamptz',id:'b.id'},
 payment:{select:'s.name AS site,b.period_start,b.amount,p.status,p.paid_at',from:'payments p JOIN billing_cycles b ON b.id=p.billing_cycle_id JOIN sites s ON s.id=b.site_id',where:`p.paid_at>=$1::date AND p.paid_at<$2::date+interval '1 day' AND ${scoped}`,time:'p.paid_at',id:'p.id'},
 audit:{select:'a.occurred_at,a.action,a.entity_type,a.entity_id,u.email AS actor,a.reason',from:'audit_events a LEFT JOIN users u ON u.id=a.actor_id',where:"a.occurred_at>=$1::date AND a.occurred_at<$2::date+interval '1 day' AND ($3::uuid[] IS NULL OR u.school_id=ANY($3::uuid[]))",time:'a.occurred_at',id:'a.id'},
 device_health:{select:'s.name AS site,g.name AS gateway,d.name AS device,d.serial_number,t.source_time AS last_sample,t.received_time,t.quality',from:"devices d JOIN gateways g ON g.id=d.gateway_id JOIN sites s ON s.id=d.site_id LEFT JOIN LATERAL (SELECT source_time,received_time,quality FROM telemetry_raw WHERE device_id=d.id AND source_time>=($1::date::timestamp AT TIME ZONE 'Asia/Bangkok') AND source_time<(($2::date+1)::timestamp AT TIME ZONE 'Asia/Bangkok') ORDER BY source_time DESC,id DESC LIMIT 1) t ON true",where:scoped,time:"'2000-01-01'::timestamptz",id:'d.id'}
};
function csv(value:unknown):string{let text=value instanceof Date?value.toISOString():String(value??'');if(typeof value==='string'&&/^\s*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
@Injectable()
export class ReportExportJob implements OnModuleInit,OnModuleDestroy {
 readonly store:JobStore;readonly pool:Pool;readonly storage:S3Client;private readonly ownsPool:boolean;
 private timer:ReturnType<typeof setTimeout>|undefined;private pending:Promise<unknown>|undefined;private stopping=false;private activeAbort:AbortController|undefined;
 private readonly logger=new Logger(ReportExportJob.name);
 constructor(pool?:Pool,storage?:S3Client,private readonly bucket=process.env.STORAGE_BUCKET!) {
  this.ownsPool=!pool;this.pool=pool??new Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:3000,statement_timeout:15000,application_name:'solar-worker-reports'});
  if(this.ownsPool)this.pool.on('error',()=>this.logger.warn('Report database connection lost'));
  this.store=new JobStore(this.pool);this.storage=storage??new S3Client({endpoint:process.env.STORAGE_ENDPOINT!,region:process.env.STORAGE_REGION!,forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:process.env.STORAGE_ACCESS_KEY!,secretAccessKey:process.env.STORAGE_SECRET_KEY!}});
 }
 onModuleInit(){if(process.env.REPORT_WORKER_ENABLED==='true')this.schedule();}
 private schedule(){if(this.stopping)return;this.timer=setTimeout(()=>{this.pending=this.runOnce().catch(()=>this.logger.warn('Report polling failed')).finally(()=>{this.pending=undefined;this.schedule();});},500);this.timer.unref();}
 async onModuleDestroy(){this.stopping=true;this.activeAbort?.abort();clearTimeout(this.timer);await this.pending;if(this.ownsPool)await this.pool.end();this.storage.destroy();}
 async allowed(job:any){const user=(await this.pool.query('SELECT role,status,school_id FROM users WHERE id=$1',[job.created_by])).rows[0];return !!user&&user.status==='active'&&['owner','admin','operator','accountant','school_user'].includes(user.role)&&(job.payload.type!=='audit'||['owner','admin'].includes(user.role))&&(user.role==='owner'||(!user.school_id&&user.role!=='school_user')||Array.isArray(job.scope)&&job.scope.every((s:string)=>s===user.school_id));}
 async runOnce(){const owner=randomUUID(),job=await this.store.claim('report',owner);if(!job)return false;await this.execute(job,owner);return true;}
 /** SHA256 is computed over the actual complete byte stream; ETag is only an opaque identity for conditional reads. */
 private async verifyArtifact(jobId:string,manifest:any,signal:AbortSignal):Promise<string> {
  if(!manifest || typeof manifest.execution!=='string' || manifest.key!==`reports/${jobId}/${manifest.execution}.csv`
   || !/^[a-f0-9]{64}$/.test(manifest.checksum??'') || !Number.isSafeInteger(manifest.bytes) || manifest.bytes<0
   || !Number.isSafeInteger(manifest.rowCount) || manifest.rowCount<0 || !Number.isFinite(Date.parse(manifest.snapshotAt)))throw Error('artifact_mismatch');
  const object=await this.storage.send(new GetObjectCommand({Bucket:this.bucket,Key:manifest.key}),{abortSignal:signal});
  const body=object.Body as Readable|undefined;
  if(!body || !object.ETag || object.Metadata?.execution!==manifest.execution || object.ContentLength!==manifest.bytes){body?.destroy();throw Error('artifact_mismatch');}
  const hash=createHash('sha256');let bytes=0;
  for await(const chunk of addAbortSignal(signal,body)){hash.update(chunk);bytes+=chunk.length;}
  if(bytes!==manifest.bytes || hash.digest('hex')!==manifest.checksum)throw Error('artifact_mismatch');
  return object.ETag;
 }
 /** Cleanup has an independent budget, including when execution/shutdown already aborted. */
 private async abortMultipart(key:string,uploadId:string):Promise<void> {
  for(let attempt=0;attempt<2;attempt++){
   try{await this.storage.send(new AbortMultipartUploadCommand({Bucket:this.bucket,Key:key,UploadId:uploadId}),{abortSignal:AbortSignal.timeout(1000)});return;}
   catch(error:any){if(error.$metadata?.httpStatusCode===404)return;}
  }
  this.logger.warn({event:'report_cleanup_incomplete',reason:'cleanup_budget_exhausted'});
 }
 async execute(job:any,owner:string){
  const abort=new AbortController();this.activeAbort=abort;const timeout=setTimeout(()=>abort.abort(),120000);timeout.unref();
  let lost=false,heartbeatPending=Promise.resolve();const heartbeat=setInterval(()=>{heartbeatPending=heartbeatPending.then(async()=>{if(abort.signal.aborted)return;if(!await this.store.heartbeat(job.id,owner)){lost=true;abort.abort();}}).catch(()=>{lost=true;abort.abort();});},15000);heartbeat.unref();
  let uploadId:string|undefined,key:string|undefined;let c:import('pg').PoolClient|undefined;
  const check=async()=>{if(this.stopping||lost||abort.signal.aborted||!await this.store.heartbeat(job.id,owner))throw Error('lease_lost');};
  const send=(command:any)=>this.storage.send(command,{abortSignal:abort.signal}) as Promise<any>;
  try {
   if(!await this.allowed(job))throw Error('permission_revoked');
   if(job.manifest?.checksum){
    try{const etag=await this.verifyArtifact(job.id,job.manifest,abort.signal);
     await check();if(!await this.store.manifest(job.id,owner,{...job.manifest,etag}))throw Error('lease_lost');
     await this.store.complete(job.id,owner,job.manifest.key);return;
    }catch(error:any){if(error.$metadata?.httpStatusCode!==404)throw error;}
   }
   if(job.manifest?.uploadId){await this.abortMultipart(job.manifest.key,job.manifest.uploadId);}
   const execution=randomUUID();key=`reports/${job.id}/${execution}.csv`;
   c=await this.pool.connect();await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SET LOCAL statement_timeout='15000ms'");
   const snapshotAt=(await c.query('SELECT transaction_timestamp() AS at')).rows[0].at.toISOString();
   const manifest:any={execution,key,snapshotAt,rowCount:null,checksum:null,bytes:null};
   if(!await this.store.manifest(job.id,owner,manifest))throw Error('lease_lost');
   const created=await send(new CreateMultipartUploadCommand({Bucket:this.bucket,Key:key,ContentType:'text/csv; charset=utf-8',Metadata:{execution}}));uploadId=created.UploadId;manifest.uploadId=uploadId;
   if(!await this.store.manifest(job.id,owner,manifest))throw Error('lease_lost');
   const source=sources[job.payload.type];if(!source)throw Error('invalid_report');
   let cursorTime:string|null=null,cursorId:string|null=null,rowCount=0,bytes=0,chunks:Buffer[]=[Buffer.from('\uFEFF')],bufferBytes=3,part=0;const parts:any[]=[];const hash=createHash('sha256');
   const flush=async()=>{await check();const buffer=Buffer.concat(chunks,bufferBytes);hash.update(buffer);bytes+=buffer.length;const result=await send(new UploadPartCommand({Bucket:this.bucket,Key:key,UploadId:uploadId,PartNumber:++part,Body:buffer}));parts.push({PartNumber:part,ETag:result.ETag});chunks=[];bufferBytes=0;};
   let header=false;
   for(;;){await check();const page:import('pg').QueryResult<any>=await c.query(`SELECT ${source.select},${source.time}::text AS _cursor_time,${source.id} AS _cursor_id FROM ${source.from} WHERE ${source.where} AND ($4::timestamptz IS NULL OR (${source.time},${source.id})>($4::timestamptz,$5::uuid)) ORDER BY ${source.time},${source.id} LIMIT 10000`,[job.payload.dateFrom,job.payload.dateTo,job.scope,cursorTime,cursorId]);
    if(!page.rows.length)break;
    for(const row of page.rows){const {_cursor_time,_cursor_id,...data}=row;if(!header){const h=Buffer.from(Object.keys(data).map(csv).join(',')+'\r\n');chunks.push(h);bufferBytes+=h.length;header=true;}const line=Buffer.from(Object.values(data).map(csv).join(',')+'\r\n');chunks.push(line);bufferBytes+=line.length;rowCount++;cursorTime=_cursor_time;cursorId=_cursor_id;if(bufferBytes>=5*1024*1024)await flush();}
   }
   await flush();await c.query('COMMIT');c.release();c=undefined;
   Object.assign(manifest,{rowCount,checksum:hash.digest('hex'),bytes});
   if(!await this.store.manifest(job.id,owner,manifest))throw Error('lease_lost');await check();
   await send(new CompleteMultipartUploadCommand({Bucket:this.bucket,Key:key,UploadId:uploadId,MultipartUpload:{Parts:parts},IfNoneMatch:'*'}));uploadId=undefined;
   const etag=await this.verifyArtifact(job.id,manifest,abort.signal);await check();
   if(!await this.store.manifest(job.id,owner,{...manifest,etag}))throw Error('lease_lost');
   await this.store.complete(job.id,owner,key);
  }catch(error:any){
   clearInterval(heartbeat);
   await heartbeatPending;
   this.logger.warn({event:'report_execution_failed',jobId:job.id,errorType:error.name,code:error.code??error.$metadata?.httpStatusCode??'unknown'});
   if(c){await c.query('ROLLBACK').catch(()=>undefined);c.release();}
   if(uploadId&&key)await this.abortMultipart(key,uploadId);
   const errorCode=['permission_revoked','lease_lost','invalid_report','artifact_mismatch'].includes(error.message)
    ?error.message:abort.signal.aborted?'extract_timeout':'storage_or_extract_failed';
   await this.store.fail(job.id,owner,errorCode);
  }finally{
   this.activeAbort=undefined;
   clearTimeout(timeout);
   clearInterval(heartbeat);
   await heartbeatPending;
  }
 }
}
