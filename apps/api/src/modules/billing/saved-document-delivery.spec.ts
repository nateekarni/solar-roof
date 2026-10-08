import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import { LocalFinancialApplicationService } from './local-financial-application.service.js';
import { routeAllowed } from '../../common/auth/route-policy.js';
const bytes=Buffer.from('%PDF-1.7\nsaved original');
const hash=createHash('sha256').update(bytes).digest('hex');
const recipient={id:'recipient',email:'verified@example.invalid'};
function fixture(type='invoice', overrides:Record<string,unknown>={}) {
 const updates:string[]=[]; const messages:any[]=[];
 const job:any={id:'outbox',document_id:'document',document_type:type,document_number:'TEST-001',site_id:'site',contract_id:'contract',state:'pending',attempts:0,delivered_user_ids:[],artifact_sha256:hash,sha256:hash,content_hash:hash,pdf_bytes:bytes,snapshot:type==='contract'?{contractId:'contract',deliveryRecipients:[recipient]}:{customer:{id:'contract'},recipients:[recipient]},...overrides};
 const client={query:async(sql:string,params:any[]=[])=>{
  if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
  if(sql.includes('FROM contracts c JOIN sites'))return {rows:[{id:'contract',site_id:'site'}]};
  if(sql.includes('JOIN document_artifacts'))return {rows:[job]};
  if(sql.includes('FROM users'))return {rows:[{id:recipient.id}]};
  if(sql.startsWith('UPDATE financial_delivery_outbox'))updates.push(sql);
  return {rows:[]};
 },release:()=>{}};
 const db={pool:{connect:async()=>client}};
 const readiness={assertEnabled:async()=>{}};
 const service=new LocalFinancialApplicationService(db as any,readiness as any);
 const transport=nodemailer.createTransport;
 nodemailer.createTransport=(()=>({sendMail:async(message:any)=>{messages.push(message);return {accepted:[recipient.email]};},close:()=>{}})) as any;
 const saved={...process.env};Object.assign(process.env,{NODE_ENV:'test',LOCAL_FINANCIAL_FIXTURE_MARKER:'solar-financial-flow-review-v1',DATABASE_URL:'postgresql://test@127.0.0.1:15449/solar_financial_flow_review',SMTP_HOST:'127.0.0.1',SMTP_PORT:'11049'});
 return {service,job,updates,messages,restore:()=>{nodemailer.createTransport=transport;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}};
}
for(const type of ['invoice','receipt','contract'])test(`${type} attachment preserves original hash and never renders settings`,async()=>{
 const f=fixture(type);try{
  if(type==='contract')await (f.service as any).sendContract('contract',{role:'owner'});else await f.service.send('cycle');
  assert.equal(f.messages.length,1);
  assert.equal(createHash('sha256').update(f.messages[0].attachments[0].content).digest('hex'),hash);
  assert.equal(f.messages[0].attachments[0].contentType,'application/pdf');
 }finally{f.restore();}
});
for(const field of ['sha256','content_hash','artifact_sha256'])test(`changed ${field} blocks financial mail before any sending state`,async()=>{
 const f=fixture('invoice',{[field]:'0'.repeat(64)});try{await assert.rejects(f.service.send('cycle'),/integrity/i);assert.equal(f.messages.length,0);assert.equal(f.updates.length,0);}finally{f.restore();}
});
test('contract delivery requires author, frozen verified recipients and saved original integrity',async()=>{
 const f=fixture('contract',{snapshot:{contractId:'contract',deliveryRecipients:[]}});try{
  await assert.rejects((f.service as any).sendContract('contract',{role:'accountant'}),/author|permitted/i);
  await assert.rejects((f.service as any).sendContract('contract',{role:'owner'}),/recipient|ผู้รับ/i);
  assert.equal(f.messages.length,0);
 }finally{f.restore();}
});
test('contract mail route follows author policy',()=>{
 for(const role of ['owner','admin'])assert.equal(routeAllowed(role,'POST','/v1/contracts/id/send-email'),true);
 for(const role of ['accountant','operator','school_user'])assert.equal(routeAllowed(role,'POST','/v1/contracts/id/send-email'),false);
});
test('revoked or cross-organization frozen account prevents mail; no ad-hoc address is substituted',async()=>{
 const f=fixture('contract');const query=(f.service as any).db.pool.connect;
 (f.service as any).db.pool.connect=async()=>{const client=await query();const original=client.query;client.query=async(sql:string,params:any[])=>sql.includes('FROM users')?{rows:[]}:original(sql,params);return client;};
 try{await assert.rejects(f.service.sendContract('contract',{role:'owner'}),/verified or scoped/i);assert.equal(f.messages.length,0);}finally{f.restore();}
});
for(const overrides of [{state:'uncertain'},{state:'sending'},{attempts:5},{state:'sent'}])test(`saved delivery preserves ${JSON.stringify(overrides)} retry safety`,async()=>{
 const f=fixture('receipt',overrides);try{
  if(overrides.state==='sent')await f.service.send('cycle');else await assert.rejects(f.service.send('cycle'),/uncertain|budget/);
  assert.equal(f.messages.length,0);assert.equal(f.updates.length,0);
 }finally{f.restore();}
});
test('contract corruption cannot enqueue or send its saved original',async()=>{
 const f=fixture('contract',{content_hash:'0'.repeat(64)});try{await assert.rejects(f.service.sendContract('contract',{role:'owner'}),/integrity/);assert.equal(f.messages.length,0);assert.equal(f.updates.length,0);}finally{f.restore();}
});
test('contract address overrides fail at controller even before delivery',async()=>{
 const {BillingController}=await import('./billing.controller.js');const controller=new BillingController({} as any,{} as any,{sendContract:async()=>{throw new Error('Must not reach sender');}} as any,{} as any);
 await assert.rejects(controller.sendContractEmail('contract',{recipientEmail:'ad-hoc@example.invalid'},{user:{role:'owner'}}),/override/);
});
