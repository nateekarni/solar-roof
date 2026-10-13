import {test} from 'node:test';
import assert from 'node:assert/strict';
import {OperationalAutomationService} from './operational-automation.service.js';
import {DatabaseService} from '../../database/database.service.js';
import nodemailer from 'nodemailer';
function fromPartial<T>(value:unknown):T{return value as T;}
test('technical rule management denies business and customer roles before database access',async()=>{
 const service=new OperationalAutomationService(fromPartial<DatabaseService>({}));
 for(const role of ['owner','accountant','customer_user'])await assert.rejects(()=>service.list({id:'user',role}),/Forbidden/);
});
test('reminder queues stable per cycle slot recipient channel keys and ignores pending evidence',async()=>{
 const queued:unknown[][]=[];
 const row={id:'cycle',site_id:'site',status:'approved',due_date:'2026-10-10',reminders_enabled:true,reminder_start_days:2,reminder_interval_days:3,recipient_user_ids:['recipient'],pending_evidence:false};
 const query=async(sql:string,values:unknown[]=[])=>{
  if(sql.includes('FROM billing_cycles b JOIN site_billing_settings'))return {rows:[row],rowCount:1};
  if(sql.startsWith('SELECT u.id,u.email'))return {rows:[{id:'recipient',email:'verified@example.com'}],rowCount:1};
  if(sql.startsWith('INSERT INTO operational_delivery_outbox'))queued.push(values);
  return {rows:[],rowCount:0};
 };
 const db=fromPartial<DatabaseService>({transaction:async(work:any)=>work({query})});const service=new OperationalAutomationService(db);
 await service.queueReminders(new Date('2026-10-15T00:00:00Z'));
 assert.deepEqual(queued.map(v=>v[0]),['reminder:cycle:1:recipient:in_app','reminder:cycle:1:recipient:email']);
 row.pending_evidence=true;await service.queueReminders(new Date('2026-10-15T00:00:00Z'));assert.equal(queued.length,2);
 row.pending_evidence=false;row.status='cancelled';await service.queueReminders(new Date('2026-10-15T00:00:00Z'));assert.equal(queued.length,2);
});
test('missing offline observations never synthesize an alarm',async()=>{
 const sqls:string[]=[];const query=async(sql:string)=>{sqls.push(sql);if(sql.includes('SELECT * FROM operational_alert_rules'))return {rows:[{id:'rule',site_id:'site',kind:'offline',state:{},duration_seconds:0,cooldown_seconds:0,recovery:true}]};return {rows:[]};};
 const service=new OperationalAutomationService(fromPartial<DatabaseService>({transaction:async(work:any)=>work({query})}));
 await service.evaluateRules(new Date());assert.equal(sqls.some(sql=>sql.startsWith('INSERT INTO alerts')),false);
});
test('captured SMTP refusal persists bounded backoff while unknown acceptance stops retry',async()=>{
 const savedEnv={...process.env};const original=nodemailer.createTransport;
 Object.assign(process.env,{NODE_ENV:'test',LOCAL_FINANCIAL_FIXTURE_MARKER:'solar-financial-flow-review-v1',SMTP_HOST:'127.0.0.1',SMTP_PORT:'11049',DATABASE_URL:'postgres://local:local@127.0.0.1:15449/solar_financial_flow_review',FINANCIAL_WRITES_ENABLED:'true'});
 try{
  for(const code of ['ECONNREFUSED','ETIMEDOUT']){
   const updates:unknown[][]=[];let sends=0;
   nodemailer.createTransport=(()=>({sendMail:async()=>{sends++;throw Object.assign(new Error('mail failed'),{code});},close:()=>{}})) as typeof nodemailer.createTransport;
   const query=async(sql:string,values:unknown[]=[])=>{
    if(sql.startsWith('SELECT u.id,u.email'))return {rows:[{id:'user',email:'verified@example.com'}]};
    if(sql.startsWith('UPDATE operational_delivery_outbox SET state=$2'))updates.push(values);
    return {rows:[]};
   };
   const db=fromPartial<DatabaseService>({query,transaction:async(work:any)=>work({query:async(sql:string)=>({rows:sql.startsWith('UPDATE operational_delivery_outbox SET claimed_at=')?[{id:'outbox'}]:sql.includes('UPDATE operational_delivery_outbox SET state=')?[{id:'outbox',site_id:'site',user_id:'user',recipient:'verified@example.com',subject:'Reminder',body:'Due',channel:'email',attempts:4}]:[]})})});
   await new OperationalAutomationService(db).deliver();assert.equal(sends,1);assert.equal(updates[0]?.[1],code==='ECONNREFUSED'?'failed':'uncertain');assert.equal(updates[0]?.[3],16);
  }
 }finally{nodemailer.createTransport=original;for(const key of Object.keys(process.env))if(!(key in savedEnv))delete process.env[key];Object.assign(process.env,savedEnv);}
});
test('stale unattempted claims retry, inapp replays idempotently, and attempted email requires reconciliation',async()=>{
 const writes:Array<{sql:string;values:unknown[]}>=[];
 const query=async(sql:string,values:unknown[]=[])=>{
  if(sql.startsWith('SELECT o.*'))return {rows:values[0]==='operational_delivery_outbox'?
   [{id:'never-started',channel:'email',attempts:1,attempted:false},{id:'in-app',channel:'in_app',attempts:2,attempted:true},{id:'possibly-sent',channel:'email',attempts:3,attempted:true}]:[{id:'decision-mail',attempts:1,attempted:true,notification_id:'notice'}]};
  writes.push({sql,values});return {rows:[]};
 };
 const service=new OperationalAutomationService(fromPartial<DatabaseService>({transaction:async(work:any)=>work({query})}));
 await service.reconcileClaims();
 const jobs=writes.filter(v=>v.sql.includes('SET state=$2'));
 assert.deepEqual(jobs.map(v=>[v.values[0],v.values[1],v.values[2]]),[['never-started','pending',true],['in-app','pending',true],['possibly-sent','uncertain',false],['decision-mail','uncertain',false]]);
 assert.ok(writes.some(v=>v.sql.includes('UPDATE notification_deliveries')&&v.values[0]==='notice'));
});
test('attempt preparation requires ownership token before persisting send marker',async()=>{
 const queries:string[]=[];
 const db=fromPartial<DatabaseService>({transaction:async(work:any)=>work({query:async(sql:string)=>{queries.push(sql);return {rows:[]};}})});
 const service=new OperationalAutomationService(db);
 assert.equal(await service.prepareAttempt('operational_delivery_outbox',{id:'job',claim_token:'old-claim',attempts:1}),false);
 assert.equal(queries.length,1);assert.match(queries[0]!,/claim_token=\$2/);assert.match(queries[0]!,/state='sending'/);
});
