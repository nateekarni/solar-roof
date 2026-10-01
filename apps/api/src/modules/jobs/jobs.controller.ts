import { Controller,Get,Post,Param,Query,Req,Res,Inject,ConflictException,BadRequestException } from '@nestjs/common';
import { S3Client,GetObjectCommand } from '@aws-sdk/client-s3';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DatabaseService } from '../../database/database.service.js';
import { JobAccessService } from './job-access.service.js';
import { ReportJobService } from '../reports/report-job.service.js';
@Controller('v1/jobs')
export class JobsController {
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService,@Inject(JobAccessService) private readonly access:JobAccessService,@Inject(ReportJobService) private readonly reports:ReportJobService) {}
 @Get() async list(@Req() req:any,@Query('cursor') cursor?:string,@Query('limit') raw?:string) {
  const limit=raw===undefined?25:Number(raw);if(!Number.isInteger(limit)||limit<1||limit>100)throw new BadRequestException('Invalid limit');
  const {scope,user}=await this.access.current(req.user.id);let after:any=null;
  if(cursor){try{after=JSON.parse(Buffer.from(cursor,'base64url').toString());if(!Array.isArray(after)||after.length!==2||!Number.isFinite(Date.parse(after[0]))||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(after[1]))throw Error();}catch{throw new BadRequestException('Invalid cursor');}}
  const rows=(await this.db.query(`SELECT *,created_at::text AS cursor_created_at FROM platform_jobs WHERE created_by=$1 AND ($2::uuid[] IS NULL OR scope<@$2::uuid[]) AND (payload->>'type' IS DISTINCT FROM 'audit' OR $3) AND ($4::timestamptz IS NULL OR (created_at,id)<($4::timestamptz,$5::uuid)) ORDER BY created_at DESC,id DESC LIMIT $6`,[req.user.id,scope,['owner','admin'].includes(user.role),after?.[0]??null,after?.[1]??null,limit+1])).rows;
  const more=rows.length>limit;const items=rows.slice(0,limit);const last=items.at(-1);
  return {items:items.map(j=>this.access.record(j)),nextCursor:more?Buffer.from(JSON.stringify([last!.cursor_created_at,last!.id])).toString('base64url'):null};
 }
 @Get(':id') async get(@Req() req:any,@Param('id') id:string){return this.access.record(await this.access.get(req.user.id,id));}
 @Post(':id/cancel') async cancel(@Req() req:any,@Param('id') id:string){await this.access.get(req.user.id,id);await this.db.query("UPDATE platform_jobs SET status='cancelled',lease_until=NULL,worker_id=NULL,updated_at=now() WHERE id=$1 AND status IN ('queued','running')",[id]);return this.get(req,id);}
 @Post(':id/retry') retry(@Req() req:any,@Param('id') id:string){return this.reports.retry(req.user.id,id);}
 @Get(':id/download') async download(@Req() req:any,@Param('id') id:string,@Res() res:Response){
  const job=await this.access.get(req.user.id,id);if(job.status!=='ready'||!job.object_key)throw new ConflictException('Report is not ready');
  const manifest=job.manifest;
  const mismatch=()=>new ConflictException({code:'artifact_mismatch',message:'Report artifact does not match its verified manifest'});
  if(job.kind==='report'&&(!manifest || typeof manifest.execution!=='string'
   || manifest.key!==job.object_key || manifest.key!==`reports/${job.id}/${manifest.execution}.csv`
   || !/^[a-f0-9]{64}$/.test(manifest.checksum??'') || typeof manifest.etag!=='string' || !manifest.etag
   || !Number.isSafeInteger(manifest.bytes) || manifest.bytes<0 || !Number.isSafeInteger(manifest.rowCount) || manifest.rowCount<0
   || Number(job.row_count)!==manifest.rowCount || job.snapshot_at?.toISOString()!==manifest.snapshotAt))throw mismatch();
  const s3=new S3Client({endpoint:process.env.STORAGE_ENDPOINT!,region:process.env.STORAGE_REGION!,forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:process.env.STORAGE_ACCESS_KEY!,secretAccessKey:process.env.STORAGE_SECRET_KEY!}});
  try {
   // The worker hashes the full stored object before atomically publishing this ETag with its SHA256 manifest.
   // IfMatch binds this response to those verified bytes without buffering the report in the API.
   const signal=AbortSignal.timeout(120000);
   const object=await s3.send(new GetObjectCommand({Bucket:process.env.STORAGE_BUCKET,Key:job.object_key,...(job.kind==='report'?{IfMatch:manifest.etag}:{})}),{abortSignal:signal});
   if(job.kind==='report'&&(object.ETag!==manifest.etag || object.ContentLength!==manifest.bytes || object.Metadata?.execution!==manifest.execution)){
    (object.Body as Readable|undefined)?.destroy();throw mismatch();
   }
   res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="report-${job.id}.csv"`);
   await pipeline(object.Body as Readable,res,{signal});
  }catch(error:any){if(job.kind==='report'&&[404,412].includes(error.$metadata?.httpStatusCode))throw mismatch();throw error;}
  finally{s3.destroy();}
 }
}
