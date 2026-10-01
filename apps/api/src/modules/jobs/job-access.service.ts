import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { schoolScope } from '../../common/auth/resource-scope.js';
@Injectable()
export class JobAccessService {
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService) {}
 async current(userId:string,job?:any,query=this.db.query.bind(this.db)) {
  const user=(await query('SELECT id,role,status,school_id AS "schoolId" FROM users WHERE id=$1',[userId])).rows[0];
  if(!user || user.status!=='active')throw new ForbiddenException();
  const scope=schoolScope(user);
  if(scope?.length===0)throw new ForbiddenException();
  if(job && (job.created_by!==userId || (job.payload.type==='audit'&&!['owner','admin'].includes(user.role)) || (scope!==null&&(job.scope===null||job.scope.some((id:string)=>!scope.includes(id))))))throw new ForbiddenException();
  return {user,scope};
 }
 async get(userId:string,id:string) {
  const job=(await this.db.query('SELECT * FROM platform_jobs WHERE id::text=$1',[id])).rows[0];
  if(!job)throw new NotFoundException('Job not found');
  await this.current(userId,job);return job;
 }
 record(job:any) {
  const payload=job.payload;
  const validDate=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
  const report=job.kind==='report'&&payload&&['energy','device_health','billing','payment','audit'].includes(payload.type)&&payload.format==='csv'&&validDate(payload.dateFrom)&&validDate(payload.dateTo)&&payload.dateFrom<=payload.dateTo
   ?{type:payload.type,format:'csv',dateFrom:payload.dateFrom,dateTo:payload.dateTo,dataKind:['energy','device_health'].includes(payload.type)?'raw':'operational'}:null;
  return {id:job.id,kind:job.kind,status:job.status,progress:job.progress,rowCount:job.row_count===null?null:Number(job.row_count),snapshotAt:job.snapshot_at?.toISOString()??null,createdBy:job.created_by,attempt:job.attempt,errorCode:job.error_code,objectKey:job.object_key,report,
   retryPolicy:{canRetry:job.kind==='report'&&job.status==='failed'&&Number.isInteger(job.attempt)&&job.attempt>=1&&job.attempt<4,canCancel:['queued','running'].includes(job.status),attemptLimit:4,retryDelaySeconds:job.attempt>=1&&job.attempt<4?[10,60,300][job.attempt-1]:null,availableAt:job.available_at?.toISOString()??null}};
 }
}
