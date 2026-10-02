import {Inject,Injectable,BadRequestException,ForbiddenException,ConflictException,HttpException,ServiceUnavailableException} from '@nestjs/common';
import {createHash,randomUUID} from 'node:crypto';
import {validateRestoreWindow,restoreLimits} from '@solar/domain';
import {DatabaseService} from '../../database/database.service.js';
import {JobAccessService} from '../jobs/job-access.service.js';

@Injectable()
export class HistoryService {
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService,@Inject(JobAccessService) private readonly access:JobAccessService){}
 options(){return {available:process.env.HISTORY_RESTORE_ENABLED==='true',maxDays:restoreLimits().maxDays,format:'jsonl.gz',endExclusive:true};}
 async requestRestore(actorId:string,siteId:string,from:string,to:string,key?:string){
  if(!this.options().available)throw new ServiceUnavailableException('History restoration is currently unavailable');
  try{validateRestoreWindow(from,to,restoreLimits());}catch{throw new BadRequestException('Invalid history window or restore limit');}
  if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(siteId)||key!==undefined&&(!key.trim()||key.length>200))throw new BadRequestException('Invalid site or Idempotency-Key');
  return this.db.transaction(async c=>{
   await c.query('SELECT pg_advisory_xact_lock(73501934)');
   const {scope}=await this.access.current(actorId,undefined,c.query.bind(c));
   const site=(await c.query('SELECT school_id FROM sites WHERE id=$1',[siteId])).rows[0];
   if(!site||scope!==null&&!scope.includes(site.school_id))throw new ForbiddenException();
   const payload={siteId,from,to,format:'jsonl.gz'},jobScope=[site.school_id];
   const hash=createHash('sha256').update(JSON.stringify({kind:'restore',payload,scope:jobScope})).digest('hex');
   if(key){const old=(await c.query('SELECT id,payload_hash,status FROM platform_jobs WHERE created_by=$1 AND idempotency_key=$2',[actorId,key])).rows[0];if(old){if(old.payload_hash!==hash)throw new ConflictException('Idempotency key used for another request');return {jobId:old.id,status:old.status};}}
   const count=(await c.query("SELECT count(*) FILTER(WHERE created_by=$1) mine,count(*) total FROM platform_jobs WHERE kind IN ('report','restore') AND status IN ('queued','running')",[actorId])).rows[0];
   if(Number(count.mine)>=1||Number(count.total)>=1000)throw new HttpException('Export queue quota exceeded',429);
   const id=randomUUID();await c.query("INSERT INTO platform_jobs(id,kind,payload,scope,created_by,idempotency_key,payload_hash) VALUES($1,'restore',$2,$3,$4,$5,$6)",[id,payload,jobScope,actorId,key??null,hash]);
   return {jobId:id,status:'queued' as const};
  });
 }
}
