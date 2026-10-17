import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { DatabaseService } from '../../database/database.service.js';
import { customerScope, type ScopePrincipal } from '../../common/auth/route-policy.js';
import { hasPermission,siteScope } from '../../common/auth/authorization.js';
import { localFinancialBinding } from '../billing/local-financial-policy.js';
import { reminderSlot, transitionAlert } from './automation-policy.js';
const ruleSchema=z.object({siteId:z.uuid().optional(),siteIds:z.array(z.uuid()).min(1).max(100).optional(),kind:z.enum(['offline','stale','threshold']),semanticField:z.enum(['total_energy','active_power','voltage','current','frequency','power_factor']).optional(),operator:z.enum(['gt','gte','lt','lte']).optional(),threshold:z.coerce.number().finite().optional(),durationSeconds:z.number().int().min(0).max(604800),cooldownSeconds:z.number().int().min(0).max(2592000),recovery:z.boolean(),recipientUserIds:z.array(z.uuid()).min(1).max(100),channels:z.array(z.enum(['in_app','email'])).min(1)}).refine(r=>Boolean(r.siteId||(r.siteIds&&r.siteIds.length>0)),'At least one site is required').refine(r=>r.kind!=='threshold'||(r.semanticField&&r.operator&&r.threshold!==undefined),'Threshold requires field, operator and value');
const updateRuleSchema=z.object({siteId:z.uuid().optional(),siteIds:z.array(z.uuid()).min(1).max(100).optional(),enabled:z.boolean().optional(),kind:z.enum(['offline','stale','threshold']).optional(),semanticField:z.enum(['total_energy','active_power','voltage','current','frequency','power_factor']).optional(),operator:z.enum(['gt','gte','lt','lte']).optional(),threshold:z.coerce.number().finite().optional(),durationSeconds:z.number().int().min(0).max(604800).optional(),cooldownSeconds:z.number().int().min(0).max(2592000).optional(),recovery:z.boolean().optional(),recipientUserIds:z.array(z.uuid()).min(1).max(100).optional(),channels:z.array(z.enum(['in_app','email'])).min(1).optional()}).refine(r=>r.kind!=='threshold'||(r.semanticField&&r.operator&&r.threshold!==undefined),'Threshold requires field, operator and value');
function normalizeRuleRow(row:Record<string,any>){
 const stateSiteIds=Array.isArray(row?.state?.site_ids)?row.state.site_ids.filter((id:unknown):id is string=>typeof id==='string'&&id.length>0):[];
 const rowSiteIds=Array.isArray(row?.site_ids)?row.site_ids.filter((id:unknown):id is string=>typeof id==='string'&&id.length>0):[];
 const siteIds=rowSiteIds.length?Array.from(new Set(rowSiteIds)):stateSiteIds.length?Array.from(new Set(stateSiteIds)):row?.site_id?[row.site_id]:[];
 return {...row,site_ids:siteIds};
}
// Called before queueing and again before delivery. Customer permissions are live assignments.
export const eligibleRecipientSql=`SELECT u.id,u.email FROM users u JOIN sites s ON s.id=$1 JOIN customers c ON c.id=s.customer_id
 WHERE u.id=$2 AND u.status='active' AND c.status='active' AND u.email_verified_at IS NOT NULL AND u.verified_email=u.email
 AND employee_can_access(u.id,CASE WHEN $3::boolean THEN 'business' ELSE 'technical' END,CASE WHEN $3::boolean THEN 'business.billing.view' ELSE 'technical.alerts.view' END,s.id)`;
type DeliveryScope='all'|'technical';
function financialAutomationEnabled(){return Boolean(localFinancialBinding())&&process.env.FINANCIAL_WRITES_ENABLED==='true';}
function technicalAutomationEnabled(){return process.env.TECHNICAL_ALERTS_ENABLED!=='false';}
function technicalTransport(){
 const port=Number(process.env.SMTP_PORT??587);
 if(!process.env.SMTP_HOST||!Number.isInteger(port)||port<1||port>65535)return null;
 return {host:process.env.SMTP_HOST,port,secure:process.env.SMTP_SECURE==='true'||port===465,connectionTimeout:5000,socketTimeout:10000,...(process.env.SMTP_USER?{auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD??process.env.SMTP_PASS??''}}:{})};
}
function deliveryScopePredicate(scope:DeliveryScope){return scope==='technical'?" AND rule_id IS NOT NULL AND billing_cycle_id IS NULL" : '';}
@Injectable()
export class OperationalAutomationService implements OnModuleInit,OnModuleDestroy {
 private timer?:ReturnType<typeof setInterval>;private running=false;private logger=new Logger(OperationalAutomationService.name);
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService){}
 onModuleInit(){if(!technicalAutomationEnabled()&&!financialAutomationEnabled())return;this.timer=setInterval(()=>void this.tick(),60000);this.timer.unref();}
 onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
 private authorize(user:ScopePrincipal){if(!user.id||!hasPermission(user,'technical.alerts.view'))throw new ForbiddenException();}
 async list(user:ScopePrincipal){this.authorize(user);const rows=(await this.db.query(`SELECT r.* FROM operational_alert_rules r JOIN sites s ON s.id=r.site_id WHERE ($1::uuid[] IS NULL OR s.id=ANY($1::uuid[])) ORDER BY r.created_at DESC`,[siteScope(user,'technical')])).rows;return rows.map(normalizeRuleRow);}
 async sites(user:ScopePrincipal){this.authorize(user);return (await this.db.query(`SELECT s.id,s.name,s.external_site_id AS code FROM sites s WHERE ($1::uuid[] IS NULL OR s.id=ANY($1::uuid[])) ORDER BY s.name`,[siteScope(user,'technical')])).rows;}
 async recipients(user:ScopePrincipal,siteIdOrIds:string){
  this.authorize(user);
  const ids=(siteIdOrIds??'').split(',').map(s=>s.trim()).filter(Boolean);
  if(!ids.length||ids.some(id=>!z.uuid().safeParse(id).success))throw new BadRequestException('Invalid site');
  if(ids.length===1){
   return (await this.db.query(`SELECT u.id,u.display_name AS name,u.email FROM users u JOIN sites s ON s.id=$1 JOIN customers c ON c.id=s.customer_id WHERE ($2::uuid[] IS NULL OR s.id=ANY($2::uuid[])) AND c.status='active' AND u.status='active' AND u.email_verified_at IS NOT NULL AND u.verified_email=u.email AND employee_can_access(u.id,'technical','technical.alerts.view',s.id) ORDER BY u.display_name`,[ids[0],siteScope(user,'technical')])).rows;
  }
  return (await this.db.query(`SELECT u.id,u.display_name AS name,u.email FROM users u WHERE u.status='active' AND u.email_verified_at IS NOT NULL AND u.verified_email=u.email AND NOT EXISTS (SELECT 1 FROM unnest($1::uuid[]) AS req_site(id) LEFT JOIN sites s ON s.id=req_site.id LEFT JOIN customers c ON c.id=s.customer_id WHERE s.id IS NULL OR c.status<>'active' OR ($2::uuid[] IS NOT NULL AND NOT (s.id=ANY($2::uuid[]))) OR NOT employee_can_access(u.id,'technical','technical.alerts.view',s.id)) ORDER BY u.display_name`,[ids,siteScope(user,'technical')])).rows;
 }
 async save(user:ScopePrincipal,body:unknown){this.authorize(user);if(!hasPermission(user,'technical.alerts.edit'))throw new ForbiddenException();const parsed=ruleSchema.safeParse(body);if(!parsed.success)throw new BadRequestException(parsed.error.message);const r=parsed.data;
 const targetSiteIds=Array.from(new Set(r.siteIds?.length?r.siteIds:r.siteId?[r.siteId]:[]));
 const primarySiteId=targetSiteIds[0]!;
 return this.db.transaction(async client=>{
  for(const sId of targetSiteIds){
   if(!(await client.query(`SELECT id FROM sites WHERE id=$1 AND ($2::uuid[] IS NULL OR id=ANY($2::uuid[])) FOR SHARE`,[sId,siteScope(user,'technical')])).rowCount)throw new ForbiddenException();
   for(const id of r.recipientUserIds)if(!(await client.query(eligibleRecipientSql,[sId,id,false])).rowCount)throw new BadRequestException('Recipient must have live site access and verified email');
  }
  const initialState=JSON.stringify({site_ids:targetSiteIds});
  const created=(await client.query(`INSERT INTO operational_alert_rules(site_id,kind,semantic_field,operator,threshold,duration_seconds,cooldown_seconds,recovery,recipient_user_ids,channels,state,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12) RETURNING *`,[primarySiteId,r.kind,r.semanticField??null,r.operator??null,r.threshold??null,r.durationSeconds,r.cooldownSeconds,r.recovery,[...new Set(r.recipientUserIds)],[...new Set(r.channels)],initialState,user.id])).rows[0];
  return normalizeRuleRow(created);
 });}
 async update(user:ScopePrincipal,id:string,body:unknown){
  this.authorize(user);
  if(!hasPermission(user,'technical.alerts.edit'))throw new ForbiddenException();
  if(!z.uuid().safeParse(id).success)throw new BadRequestException('Invalid rule');
  const parsed=updateRuleSchema.safeParse(body);
  if(!parsed.success)throw new BadRequestException(parsed.error.message);
  const patch=parsed.data;
  return this.db.transaction(async client=>{
   const existing=(await client.query(`SELECT r.* FROM operational_alert_rules r JOIN sites s ON s.id=r.site_id WHERE r.id=$1 AND ($2::uuid[] IS NULL OR s.id=ANY($2::uuid[])) FOR UPDATE`,[id,siteScope(user,'technical')])).rows[0];
   if(!existing)throw new ForbiddenException();
   const existingNormalized=normalizeRuleRow(existing);
   const nextSiteIds=patch.siteIds?.length?Array.from(new Set(patch.siteIds)):patch.siteId?[patch.siteId]:existingNormalized.site_ids;
   const nextPrimarySiteId=nextSiteIds[0]??existing.site_id;
   if(patch.siteIds||patch.siteId){
    for(const sId of nextSiteIds){
     if(!(await client.query(`SELECT id FROM sites WHERE id=$1 AND ($2::uuid[] IS NULL OR id=ANY($2::uuid[])) FOR SHARE`,[sId,siteScope(user,'technical')])).rowCount)throw new ForbiddenException();
    }
   }
   const nextRecipients=patch.recipientUserIds?[...new Set(patch.recipientUserIds)]:existing.recipient_user_ids;
   if(patch.recipientUserIds||patch.siteIds||patch.siteId){
    for(const sId of nextSiteIds){
     for(const recipientId of nextRecipients){
      if(!(await client.query(eligibleRecipientSql,[sId,recipientId,false])).rowCount){
       throw new BadRequestException('Recipient must have live site access and verified email');
      }
     }
    }
   }
   const nextKind=patch.kind??existing.kind;
   const nextField=nextKind==='threshold'?(patch.semanticField??existing.semantic_field):null;
   const nextOperator=nextKind==='threshold'?(patch.operator??existing.operator):null;
   const nextThreshold=nextKind==='threshold'?(patch.threshold!==undefined?patch.threshold:existing.threshold):null;
   const nextDuration=patch.durationSeconds??existing.duration_seconds;
   const nextCooldown=patch.cooldownSeconds??existing.cooldown_seconds;
   const nextRecovery=patch.recovery!==undefined?patch.recovery:existing.recovery;
   const nextChannels=patch.channels?[...new Set(patch.channels)]:existing.channels;
   const nextEnabled=patch.enabled!==undefined?patch.enabled:existing.enabled;
   const nextState={...(existing.state&&typeof existing.state==='object'?existing.state:{}),site_ids:nextSiteIds};
   const updated=(await client.query(`UPDATE operational_alert_rules SET site_id=$1,kind=$2,semantic_field=$3,operator=$4,threshold=$5,duration_seconds=$6,cooldown_seconds=$7,recovery=$8,recipient_user_ids=$9,channels=$10,enabled=$11,state=$12::jsonb WHERE id=$13 RETURNING *`,[nextPrimarySiteId,nextKind,nextField,nextOperator,nextThreshold,nextDuration,nextCooldown,nextRecovery,nextRecipients,nextChannels,nextEnabled,JSON.stringify(nextState),id])).rows[0];
   return normalizeRuleRow(updated);
  });
 }
 async remove(user:ScopePrincipal,id:string){this.authorize(user);if(!hasPermission(user,'technical.alerts.edit'))throw new ForbiddenException();if(!z.uuid().safeParse(id).success)throw new BadRequestException('Invalid rule');await this.db.query(`UPDATE operational_alert_rules r SET enabled=false FROM sites s WHERE r.id=$1 AND s.id=r.site_id AND ($2::uuid[] IS NULL OR s.id=ANY($2::uuid[]))`,[id,siteScope(user,'technical')]);return {disabled:true};}
 async tick(now=new Date()){
  if(this.running||(!technicalAutomationEnabled()&&!financialAutomationEnabled()))return;
  this.running=true;
  try{
   // Separate failure boundaries: a finance error cannot stop technical monitoring.
   if(financialAutomationEnabled())try{await this.queueReminders(now);}catch(error){this.logger.warn((error as Error).message);}
   if(technicalAutomationEnabled())try{await this.evaluateRules(now);}catch(error){this.logger.warn((error as Error).message);}
   await this.deliver();
  }catch(error){this.logger.warn((error as Error).message);}finally{this.running=false;}
 }
 async queueReminders(now:Date){return this.db.transaction(async client=>{
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('operational-reminders'))`);
  const rows=(await client.query(`SELECT b.id,b.site_id,b.status,b.due_date::text AS due_date,c.reminders_enabled,c.reminder_start_days,c.reminder_interval_days,c.recipient_user_ids,
  EXISTS(SELECT 1 FROM payments p WHERE p.billing_cycle_id=b.id AND p.status='pending_verification') AS pending_evidence
  FROM billing_cycles b JOIN site_billing_settings c ON c.site_id=b.site_id WHERE c.reminders_enabled AND b.due_date IS NOT NULL AND b.status NOT IN('paid','cancelled') AND EXISTS(SELECT 1 FROM documents d WHERE d.billing_cycle_id=b.id AND d.document_type='invoice' AND d.is_current AND d.status IN('issued','finalized')) FOR UPDATE OF b`)).rows;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  for(const r of rows){const slot=reminderSlot({dueDate:r.due_date,startDays:r.reminder_start_days,intervalDays:r.reminder_interval_days,enabled:r.reminders_enabled,status:r.status,pendingEvidence:r.pending_evidence},today);if(slot===null)continue;
   for(const id of r.recipient_user_ids){const recipient=(await client.query(eligibleRecipientSql,[r.site_id,id,true])).rows[0];if(!recipient)continue;
    for(const channel of ['in_app','email'])await client.query(`INSERT INTO operational_delivery_outbox(dedupe_key,site_id,user_id,billing_cycle_id,channel,recipient,subject,body,destination) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(dedupe_key) DO NOTHING`,[`reminder:${r.id}:${slot}:${id}:${channel}`,r.site_id,id,r.id,channel,recipient.email,'แจ้งเตือนชำระเงิน / Payment reminder',`ครบกำหนด / Due: ${r.due_date}`,'/records/billing/'+r.id]);
   }
  }
 });}
 async evaluateRules(now:Date){return this.db.transaction(async client=>{
  const rules=(await client.query(`SELECT * FROM operational_alert_rules WHERE enabled ORDER BY id FOR UPDATE SKIP LOCKED`)).rows;
  const columns:Record<string,string>={total_energy:'total_energy_kwh',active_power:'active_power_w',voltage:'voltage_v',current:'current_a',frequency:'frequency_hz',power_factor:'power_factor'};
  for(const r of rules){let condition:boolean|null=null;
   if(r.kind==='offline'){const g=(await client.query(`SELECT last_seen_at FROM gateways WHERE site_id=$1`,[r.site_id])).rows[0];if(g?.last_seen_at)condition=now.getTime()-new Date(g.last_seen_at).getTime()>120000;}
   else {const column=columns[r.semantic_field]??'normalized_value';const reading=(await client.query(`SELECT source_time,${column} AS value FROM telemetry_raw WHERE site_id=$1 AND quality NOT IN('invalid','estimated') ORDER BY source_time DESC LIMIT 1`,[r.site_id])).rows[0];
    if(reading){const age=now.getTime()-new Date(reading.source_time).getTime();if(r.kind==='stale')condition=age>120000;else if(age<=120000&&age>=0&&reading.value!==null){const a=Number(reading.value),b=Number(r.threshold);condition=r.operator==='gt'?a>b:r.operator==='gte'?a>=b:r.operator==='lt'?a<b:a<=b;}}
   }
   const result=transitionAlert({durationSeconds:r.duration_seconds,cooldownSeconds:r.cooldown_seconds,recovery:r.recovery},r.state,condition,now.getTime());
   await client.query('UPDATE operational_alert_rules SET state=$2 WHERE id=$1',[r.id,JSON.stringify(result.state)]);
   if(!result.event)continue;const alertId=randomUUID(),subject=result.event==='recovery'?'กลับสู่ปกติ / Recovered':'แจ้งเตือน / Alert',body=r.kind+(r.semantic_field?' '+r.semantic_field:'');
   if(result.event==='recovery')await client.query(`UPDATE alerts SET status='resolved' WHERE status='open' AND id IN(SELECT alert_id FROM operational_delivery_outbox WHERE rule_id=$1)`,[r.id]);
   await client.query(`INSERT INTO alerts(id,site_id,severity,title,detail,status,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7)`,[alertId,r.site_id,result.event==='recovery'?'info':'warning',subject,body,result.event==='recovery'?'resolved':'open',now]);
   for(const id of r.recipient_user_ids){const recipient=(await client.query(eligibleRecipientSql,[r.site_id,id,false])).rows[0];if(!recipient)continue;
    for(const channel of r.channels)await client.query(`INSERT INTO operational_delivery_outbox(dedupe_key,site_id,user_id,rule_id,alert_id,channel,recipient,subject,body,destination) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(dedupe_key) DO NOTHING`,[`alert:${alertId}:${id}:${channel}`,r.site_id,id,r.id,alertId,channel,recipient.email,subject,body,'/alerts']);
    if(r.channels.includes('in_app'))await client.query('INSERT INTO operational_event_recipients(notification_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',['alert:'+alertId,id]);
   }
  }
 });}
 async deliver(){
  const financial=financialAutomationEnabled();
  if(!financial&&!technicalAutomationEnabled())return;
  const scope:DeliveryScope=financial?'all':'technical';
  await this.reconcileClaims(scope);
  for(const table of financial?['operational_delivery_outbox','payment_decision_outbox']:['operational_delivery_outbox']){
   const jobs=await this.claimDeliveries(table,scope);
   for(const job of jobs){
    const recipient=(await this.db.query(eligibleRecipientSql,[job.site_id,job.user_id,Boolean(job.billing_cycle_id)||table==='payment_decision_outbox'])).rows[0];
    if(!recipient||recipient.email!==job.recipient){await this.fail(table,job,'Recipient access or verified email changed',false);continue;}
    if(job.billing_cycle_id){const bill=(await this.db.query(`SELECT b.status,EXISTS(SELECT 1 FROM payments p WHERE p.billing_cycle_id=b.id AND p.status='pending_verification') AS pending FROM billing_cycles b WHERE b.id=$1`,[job.billing_cycle_id])).rows[0];
     if(!bill||['paid','cancelled'].includes(bill.status)){await this.db.query(`UPDATE operational_delivery_outbox SET state='cancelled' WHERE id=$1 AND claim_token=$2`,[job.id,job.claim_token]);continue;}
     if(bill.pending){await this.db.query(`UPDATE operational_delivery_outbox SET state='pending',attempts=attempts-1,next_attempt_at=now()+interval '1 minute',claim_token=NULL,claimed_at=NULL WHERE id=$1 AND claim_token=$2`,[job.id,job.claim_token]);continue;}
    }
    // Lease refresh and marker share a transaction. A recovered/reclaimed row
    // invalidates the old worker's token before it can begin an external send.
    if(!await this.prepareAttempt(table,job))continue;
    if(job.channel==='in_app'){
     if(job.alert_id){await this.db.query(`UPDATE operational_delivery_outbox SET state='sent',completed_at=now() WHERE id=$1 AND claim_token=$2`,[job.id,job.claim_token]);await this.finishAttempt(table,job,'sent');continue;}
     await this.db.transaction(async client=>{const id='workflow:'+job.id;await client.query(`INSERT INTO notification_feed_events(id,site_id,title,detail,destination) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[id,job.site_id,job.subject,job.body,job.destination]);await client.query(`INSERT INTO operational_event_recipients(notification_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[id,job.user_id]);await client.query(`UPDATE operational_delivery_outbox SET state='sent',completed_at=now() WHERE id=$1 AND claim_token=$2`,[job.id,job.claim_token]);});await this.finishAttempt(table,job,'sent');continue;
    }
    // Financial transport remains bound to the verified local capture. Technical
    // mail uses the configured SMTP transport independently of financial writes.
    const config=job.billing_cycle_id||table==='payment_decision_outbox'?{host:'127.0.0.1',port:11049,secure:false,connectionTimeout:5000,socketTimeout:10000}:technicalTransport();
    if(!config){await this.fail(table,job,'SMTP transport is not configured',true);continue;}
    const transport=nodemailer.createTransport(config);
    try{const result=await transport.sendMail({from:process.env.SMTP_FROM??'local-financial@solar-platform.invalid',to:job.recipient,subject:job.subject,text:job.body,messageId:`<automation-${job.id}@solar-platform.invalid>`});if(!result.accepted?.map((e:string)=>e.toLowerCase()).includes(job.recipient.toLowerCase()))throw Object.assign(new Error('SMTP recipient rejected'),{code:'ERECIPIENT'});
     await this.db.query(`UPDATE ${table} SET state='sent',completed_at=now(),last_error=NULL WHERE id=$1 AND claim_token=$2`,[job.id,job.claim_token]);
     await this.finishAttempt(table,job,'sent');
     if(table==='payment_decision_outbox')await this.db.query(`UPDATE notification_deliveries SET status='sent' WHERE id=$1`,[job.notification_id]);
    }catch(error){const e=error as Error&{code?:string;responseCode?:number};const safe=['ECONNREFUSED','EDNS','EAUTH','ERECIPIENT'].includes(e.code??'')||Boolean(e.responseCode&&e.responseCode>=400);await this.fail(table,job,e.message,safe);}finally{transport.close();}
   }
  }
 }
 async claimDeliveries(table:string,scope:DeliveryScope='all'){
  if(!['operational_delivery_outbox','payment_decision_outbox'].includes(table))throw new Error('Unknown outbox');
  if(scope==='technical'&&table!=='operational_delivery_outbox')return [];
  const transport=technicalTransport();
  const available=!transport&&table==='operational_delivery_outbox'?" AND (channel='in_app' OR billing_cycle_id IS NOT NULL)":'';
  return this.db.transaction(async client=>(await client.query(`UPDATE ${table} SET state='sending',attempts=attempts+1,claimed_at=now(),claim_token=gen_random_uuid() WHERE id IN(SELECT id FROM ${table} WHERE state IN('pending','failed') AND attempts<5 AND next_attempt_at<=now()${deliveryScopePredicate(scope)}${available} ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 25) RETURNING *`)).rows);
 }
 async reconcileClaims(scope:DeliveryScope='all'){
  for(const table of scope==='technical'?['operational_delivery_outbox']:['operational_delivery_outbox','payment_decision_outbox'])await this.db.transaction(async client=>{
   const jobs=(await client.query(`SELECT o.*,EXISTS(SELECT 1 FROM operational_delivery_attempts a WHERE a.source=$1 AND a.outbox_id=o.id AND a.attempt=o.attempts) AS attempted FROM ${table} o WHERE o.state='sending'${deliveryScopePredicate(scope)} AND (o.claimed_at IS NULL OR o.claimed_at<now()-interval '2 minutes') FOR UPDATE OF o SKIP LOCKED`,[table])).rows;
   for(const job of jobs){const retry=job.channel==='in_app'||!job.attempted;
    await client.query(`UPDATE ${table} SET state=$2,attempts=CASE WHEN $3 THEN greatest(0,attempts-1) ELSE attempts END,claim_token=CASE WHEN $3 THEN NULL ELSE claim_token END,claimed_at=NULL,next_attempt_at=now(),last_error=$4 WHERE id=$1`,[job.id,retry?'pending':'uncertain',retry,retry?'Recovered abandoned claim; safe to retry':'Abandoned SMTP attempt; reconcile capture before retry']);
    if(job.attempted)await client.query(`UPDATE operational_delivery_attempts SET status=$4,error=$5,completed_at=now() WHERE outbox_id=$1 AND source=$2 AND attempt=$3`,[job.id,table,job.attempts,retry?'paused':'uncertain',retry?'Recovered idempotent in-app delivery':'SMTP outcome unknown after abandoned claim']);
    if(!retry&&table==='payment_decision_outbox')await client.query(`UPDATE notification_deliveries SET status='failed' WHERE id=$1`,[job.notification_id]);
   }
   // A crash can also occur after the durable outbox outcome but before the
   // public delivery row is updated. Repair that projection without resending.
   if(table==='payment_decision_outbox')await client.query(`UPDATE notification_deliveries n SET status=CASE WHEN o.state='sent' THEN 'sent' ELSE 'failed' END FROM payment_decision_outbox o WHERE o.notification_id=n.id AND o.state IN('sent','failed','uncertain') AND n.status IS DISTINCT FROM CASE WHEN o.state='sent' THEN 'sent' ELSE 'failed' END`);
  });
 }
 async prepareAttempt(table:string,job:any):Promise<boolean>{
  if(!['operational_delivery_outbox','payment_decision_outbox'].includes(table))throw new Error('Unknown outbox');
  return this.db.transaction(async client=>{
   if(!(await client.query(`UPDATE ${table} SET claimed_at=now() WHERE id=$1 AND claim_token=$2 AND state='sending' RETURNING id`,[job.id,job.claim_token])).rows.length)return false;
   await client.query(`INSERT INTO operational_delivery_attempts(outbox_id,source,attempt,status) VALUES($1,$2,$3,'sending') ON CONFLICT(source,outbox_id,attempt) DO UPDATE SET status='sending',started_at=now(),completed_at=NULL,error=NULL`,[job.id,table,job.attempts]);
   return true;
  });
 }
 private async finishAttempt(table:string,job:any,status:string,error?:string){await this.db.query(`UPDATE operational_delivery_attempts SET status=$4,error=$5,completed_at=now() WHERE outbox_id=$1 AND source=$2 AND attempt=$3`,[job.id,table,job.attempts,status,error??null]);}
 private async fail(table:string,job:any,message:string,retry:boolean){const state=retry?'failed':'uncertain';const changed=await this.db.query(`UPDATE ${table} SET state=$2,last_error=$3,next_attempt_at=now()+($4::integer*interval '1 minute') WHERE id=$1 AND claim_token=$5 RETURNING id`,[job.id,state,message,Math.min(60,2**job.attempts),job.claim_token]);if(!changed.rows.length)return;await this.finishAttempt(table,job,state,message);if(table==='payment_decision_outbox')await this.db.query(`UPDATE notification_deliveries SET status='failed' WHERE id=$1`,[job.notification_id]);}
}
