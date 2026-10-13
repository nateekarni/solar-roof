import assert from 'node:assert/strict';
import test from 'node:test';
import { FinancialReadinessService } from './financial-readiness.service.js';
import { FinancialReadinessController } from './financial-readiness.controller.js';
import { DatabaseService } from '../../database/database.service.js';
import { canonicalGlobalFinancialConfiguration } from '../settings/settings.service.js';
import { financialConfigurationHash } from './financial-configuration.js';
import { TEST_FINANCIAL_POLICY_HASH } from '../billing/local-financial-policy.js';

const owner = {id:'owner-a',role:'owner'};
const png = 'data:image/png;base64,iVBORw0KGgo=';
const company = {id:'company-a',companyName:'Issuer',taxId:'1234567890123',branch:'Head office',address:'Address',phone:'123',email:'billing@example.com',logoUrl:png,signatoryName:'Signer',signatoryTitle:'Director',signatureDataUri:png};
const bank = {id:'bank-a',bankName:'Bank',bankCode:'bank',accountName:'Issuer',accountNumber:'1234',branchName:'Branch',promptpayId:'',isDefault:true,isConfigured:true};
const site = {id:'site-a',status:'active',timezone:'Asia/Bangkok',customer_status:'active',legal_name:'Customer',tax_id:'1234567890123',tax_address:'Address',document_email:'customer@example.com',service_start_date:'2026-01-01',payment_term_days:30,tax_rate:'7.0000',prices_include_tax:false,tax_confirmed:true,recipient_user_ids:['recipient-a'],version:1};
const meter = {id:'meter-a',device_id:'device-a',semantic_field:'energy.active.import.total',binding_ready:true};
const cyclePolicyHash='02a3e86a9040eaf4840c3030c2b112e7929f6a039347d3d3824745e9caaa00f2';
type Approval = {id:string;config_hash:string;approved_by:string;approved_at:string;revoked_at:string|null};
function fixture() {
  const state = {company:{...company},banks:[{...bank}],sites:[{...site}],meters:[{...meter}],rates:[{starts:'2026-01-01',ends:null as string|null,rate:'4.2500',currency:'THB',rate_type:'fixed_kwh'}],recipients:[{id:'recipient-a',email:'customer@example.com'}],approval:null as Approval|null,audits:[] as string[],cycle:null as any,documents:[] as any[],payments:[] as any[],boundaryMissing:false,boundaryMissingDates:[] as string[],local:false,auditFails:false};
  const query = async (sql:string,values:unknown[] = []):Promise<any> => {
    if(sql.includes('pg_advisory_xact_lock')) return {rows:[]};
    if(sql.includes('FROM users WHERE id=$1')) return {rows:[{id:'owner-a',role:'owner',status:'active'}]};
    if(sql.includes('FROM company_profile')) return {rows:[state.company]};
    if(sql.includes('FROM company_bank_accounts')) return {rows:state.banks};
    if(sql.includes('UPDATE financial_readiness_approvals')) {const row=state.approval;if(!row||row.revoked_at)return {rows:[]};row.revoked_at='2026-10-13';return {rows:[{id:row.id}]};}
    if(sql.includes('INSERT INTO financial_readiness_approvals')) {state.approval={id:String(values[0]),config_hash:String(values[1]),approved_by:String(values[3]),approved_at:'2026-10-13T00:00:00.000Z',revoked_at:null};return {rows:[state.approval]};}
    if(sql.includes('FROM financial_readiness_approvals')) return {rows:state.approval&&!state.approval.revoked_at?[state.approval]:[]};
    if(sql.includes('INSERT INTO audit_events')) {if(state.auditFails)throw Error('audit unavailable');state.audits.push(String(values[2]));return {rows:[]};}
    if(sql.includes('FROM local_financial_test_policy')) return {rows:state.local?[{id:'test-policy',selected_by:'owner-a',workflow_state:'verified',workflow_evidence:{runId:'run-a',startedAt:'date',completedAt:'date',purpose:'real_api_workflow_verification'}}]:[]};
    if(sql.includes('FROM billing_cycles')) return {rows:state.cycle?[state.cycle]:[]};
    if(sql.includes('FROM sites s JOIN customers')) return {rows:state.sites.filter(s=>(!values[0]||s.id===values[0])&&(!values[1]||(values[1] as string[]).includes(s.id)))};
    if(sql.includes('FROM billing_meters')) return {rows:state.meters};
    if(sql.includes('FROM rate_versions')) return {rows:state.rates};
    if(sql.includes('FROM users u JOIN site_account_assignments')) return {rows:state.recipients};
    if(sql.includes('WITH candidates')) return {rows:state.boundaryMissing||state.boundaryMissingDates.includes(String(values[2]))?[]:[{id:'reading',value:'100.000',source_time:'2026-01-01',quality:'complete',unit:'kWh',payload_profile_revision_id:'profile-a',billing_source_binding_id:'binding-a',mapping_version_id:null,boundary_consistent:true}]};
    if(sql.includes('FROM telemetry_raw tr')) return {rows:[{value:'100.000',quality:'complete',unit:'kWh',payload_profile_revision_id:'profile-a',billing_source_binding_id:'binding-a',mapping_version_id:null}]};
    if(sql.includes('FROM documents')) return {rows:state.documents};
    if(sql.includes('FROM payments')) return {rows:state.payments};
    throw Error(`Unexpected query: ${sql}`);
  };
  let afterTransaction:(()=>void)|undefined;
  const db = {query,transaction:async (work:any)=>{const before=structuredClone(state);try{const result=await work({query});afterTransaction?.();return result;}catch(error){Object.assign(state,before);throw error;}}} as unknown as DatabaseService;
  const service = new FinancialReadinessService(db);
  const approve = ()=>{state.approval={id:'approval-a',config_hash:financialConfigurationHash(canonicalGlobalFinancialConfiguration(state.company,state.banks)),approved_by:'owner-a',approved_at:'2026-10-13T00:00:00.000Z',revoked_at:null};};
  return {state,service,approve,afterTransaction:(work:()=>void)=>{afterTransaction=work;}};
}
async function environment(work:()=>Promise<void>,patch:Record<string,string|undefined>={}) {
  const before={...process.env};
  Object.assign(process.env,{NODE_ENV:'production',FINANCIAL_WRITES_ENABLED:'true',FINANCIAL_SCHEDULER_ENABLED:'false'});
  for(const key of ['SMTP_HOST','SMTP_PORT','SMTP_FROM','SMTP_USER','SMTP_PASSWORD','SMTP_PASS','SMTP_SECURE','LOCAL_FINANCIAL_FIXTURE_MARKER'])delete process.env[key];
  for(const [key,value]of Object.entries(patch))if(value===undefined)delete process.env[key];else process.env[key]=value;
  try{await work();}finally{for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key];Object.assign(process.env,before);}
}

// Removing any individual global field guard must expose the corresponding missing ID.
test('missing uploaded logo, signatory and default bank produces safe Owner checklist IDs',()=>environment(async()=>{
  const f=fixture();f.state.company.logoUrl='/brand/legacy.png';f.state.company.signatoryTitle='';f.state.banks=[];
  const result=await f.service.status(owner);
  assert.deepEqual(result.items.filter(i=>i.responsibility==='owner'&&!i.ready&&!i.siteId).map(i=>i.id),['company.logo','company.signatory','company.default_bank','approval.confirmation']);
  assert.ok(result.items.every(i=>Object.keys(i).every(key=>['id','ready','responsibility','destination','siteId'].includes(key))));
  assert.ok(!JSON.stringify(result).includes('1234567890123'));
}));
test('complete global data still requires matching persisted approval',()=>environment(async()=>{
  const f=fixture();const pending=await f.service.status(owner,{siteId:'site-a'});
  assert.deepEqual(pending.actions.calculate.missing,['approval.confirmation']);assert.equal(pending.scope,null);
  f.approve();assert.equal((await f.service.status(owner,{siteId:'site-a'})).actions.calculate.enabled,true);
  f.state.company.taxId='9876543210123';const stale=await f.service.status(owner,{siteId:'site-a'});
  assert.equal(stale.approval,null);assert.ok(stale.actions.issue.missing.includes('approval.confirmation'));
}));
test('SMTP blocks send and scheduler only; master flag disables every write',()=>environment(async()=>{
  const f=fixture();f.approve();const ready=await f.service.status(owner,{siteId:'site-a'});
  for(const action of ['calculate','issue','approve_payment'] as const)assert.equal(ready.actions[action].enabled,true);
  assert.ok(ready.actions.send.missing.includes('environment.smtp'));assert.equal(ready.items.find(i=>i.id==='environment.scheduler')?.ready,false);
  process.env.FINANCIAL_WRITES_ENABLED='false';const disabled=await f.service.status(owner,{siteId:'site-a'});
  for(const action of Object.values(disabled.actions)){assert.equal(action.enabled,false);assert.ok(action.missing.includes('environment.financial_writes'));}
}));
test('missing site configuration does not block a different ready site',()=>environment(async()=>{
  const f=fixture();f.approve();f.state.sites.push({...site,id:'site-b',tax_confirmed:false});
  assert.equal((await f.service.status(owner,{siteId:'site-a'})).actions.issue.enabled,true);
  assert.ok((await f.service.status(owner,{siteId:'site-b'})).actions.issue.missing.includes('site.tax'));
  for(const [change,id] of [[()=>{f.state.rates=[];},'site.rate'],[()=>{f.state.meters=[];},'site.meter'],[()=>{f.state.recipients=[];},'site.recipient']] as const){change();assert.ok((await f.service.status(owner,{siteId:'site-a'})).actions.calculate.missing.includes(id));}
}));
test('period gate requires exact rate coverage and actual verified boundaries',()=>environment(async()=>{
  const f=fixture();f.approve();const ctx={siteId:'site-a',periodStart:'2026-01-01',periodEnd:'2026-01-31'};
  assert.equal((await f.service.assertEnabled('calculate',ctx)).scope,'PRODUCTION');
  f.state.rates[0]!.starts='2026-01-02';await assert.rejects(f.service.assertEnabled('calculate',ctx),e=>(e as any).getResponse().missing.includes('site.rate'));
  f.state.rates[0]!.starts='2026-01-01';f.state.boundaryMissing=true;
  await assert.rejects(f.service.assertEnabled('calculate',ctx),e=>(e as any).getResponse().missing.includes('site.boundary_readings'));
  assert.equal((await f.service.status(owner,{siteId:'site-a'})).actions.calculate.enabled,true);
  await assert.rejects(f.service.assertEnabled('calculate',{siteId:'site-a'}),e=>(e as any).getResponse().missing.includes('context.period'));
  await assert.rejects(f.service.assertEnabled('issue'),e=>(e as any).getResponse().missing.includes('context.site'));
}));
test('snapshot, locked correction, artifact integrity and frozen recipients gate cycle actions',()=>environment(async()=>{
  const f=fixture();f.approve();f.state.cycle={id:'cycle-a',site_id:'site-a',starts:'2026-01-01',ends:'2026-01-31',status:'pending_review',quality:'complete',meter_snapshot:[{meterId:'meter-a'}],financial_scope:'PRODUCTION',policy_hash:cyclePolicyHash,policy_snapshot:{scope:'PRODUCTION'},billing_settings_version:1,billing_kind:'energy'};
  const context={billingCycleId:'cycle-a'};
  assert.equal((await f.service.status(owner,context)).actions.issue.enabled,true);
  f.state.cycle.policy_snapshot=null;assert.ok((await f.service.status(owner,context)).actions.issue.missing.includes('cycle.snapshot'));
  f.state.cycle.policy_snapshot={scope:'PRODUCTION'};assert.ok((await f.service.status(owner,context)).actions.adjust.missing.includes('cycle.invoice'));
  f.state.documents=[{id:'invoice-a',document_type:'invoice',status:'issued',is_current:true,snapshot:{policy:{},recipients:[{id:'recipient-a',email:'customer@example.com'}]},pdf_bytes:Buffer.from('%PDF-bad'),sha256:'bad',content_hash:'bad'}];
  const invalid=await f.service.status(owner,context);assert.ok(invalid.actions.send.missing.includes('document.artifact'));
  f.state.cycle.status='paid';assert.ok((await f.service.status(owner,context)).actions.adjust.missing.includes('cycle.correction'));
}));
test('only active Owner can confirm; same hash reuses approval and failed audit rolls back',()=>environment(async()=>{
  const f=fixture();await assert.rejects(f.service.confirm({id:'owner-a',role:'accountant'}),/Owner/);
  f.state.company.logoUrl='';await assert.rejects(f.service.confirm(owner),e=>(e as any).getResponse().missing.includes('company.logo'));assert.equal(f.state.approval,null);
  f.state.company.logoUrl=png;f.state.auditFails=true;await assert.rejects(f.service.confirm(owner),/audit unavailable/);assert.equal(f.state.approval,null);
  f.state.auditFails=false;const first=await f.service.confirm(owner);const second=await f.service.confirm(owner);
  assert.ok(first.approval);assert.equal(first.approval.id,second.approval?.id);assert.deepEqual(f.state.audits,['finance.approval.confirmed']);
  f.state.company.companyName='Changed issuer';const next=await f.service.confirm(owner);
  assert.notEqual(first.approval.id,next.approval?.id);assert.deepEqual(f.state.audits,['finance.approval.confirmed','finance.approval.revoked','finance.approval.confirmed']);
}));
test('local fixture keeps TEST scope without pretending to satisfy production approval',()=>environment(async()=>{
  const f=fixture();f.state.local=true;f.state.company.logoUrl='';
  const result=await f.service.status(owner);assert.equal(result.scope,'TEST');assert.equal(result.approval,null);
  assert.equal(result.items.find(i=>i.id==='approval.confirmation')?.ready,false);
  assert.deepEqual(await f.service.assertEnabled('calculate'),{scope:'TEST',approvalId:'test-policy',policyHash:TEST_FINANCIAL_POLICY_HASH});
},{NODE_ENV:'test',LOCAL_FINANCIAL_FIXTURE_MARKER:'solar-financial-flow-review-v1',DATABASE_URL:'postgresql://test@127.0.0.1:15449/solar_financial_flow_review',SMTP_HOST:'127.0.0.1',SMTP_PORT:'11049'}));
test('Owner API passes authenticated actor and requested context through real readiness service',()=>environment(async()=>{
  const f=fixture();const controller=new FinancialReadinessController(f.service);
  const confirmed=await controller.confirm({user:owner});assert.ok(confirmed.approval);
  assert.equal((await controller.status({user:owner},{siteId:'site-a'})).scope,'PRODUCTION');
  await assert.rejects(controller.confirm({user:{id:'owner-a',role:'admin'}}),/Owner/);
}));
test('gate returns the hash verified with its approval even if configuration changes immediately afterward',()=>environment(async()=>{
  const f=fixture();f.approve();const approvedHash=f.state.approval!.config_hash;
  f.afterTransaction(()=>{f.state.company.companyName='Concurrent issuer change';});
  const result=await f.service.assertEnabled('calculate',{siteId:'site-a',periodStart:'2026-01-01',periodEnd:'2026-01-31'});
  assert.equal(result.approvalId,'approval-a');assert.equal(result.policyHash,approvedHash);
}));
test('manual cycle issuance needs business readiness but does not fabricate energy readings or rates',()=>environment(async()=>{
  const f=fixture();f.approve();f.state.meters=[];f.state.rates=[];
  f.state.cycle={id:'cycle-a',site_id:'site-a',starts:'2026-01-01',ends:'2026-01-01',status:'approved',quality:'complete',meter_snapshot:[],financial_scope:'PRODUCTION',policy_hash:cyclePolicyHash,policy_snapshot:{scope:'PRODUCTION'},billing_settings_version:1,billing_kind:'manual',manual_lines:[{description:'Work',quantity:'1.000',unitPrice:'100.0000'}]};
  const result=await f.service.status(owner,{billingCycleId:'cycle-a'});
  assert.equal(result.actions.issue.enabled,true);assert.equal(result.actions.calculate.enabled,false);
  assert.equal((await f.service.assertEnabled('issue',{billingCycleId:'cycle-a'})).scope,'PRODUCTION');
}));
test('tampered cycle policy cannot pass issuance with an old stored hash',()=>environment(async()=>{
  const f=fixture();f.approve();f.state.cycle={id:'cycle-a',site_id:'site-a',starts:'2026-01-01',ends:'2026-01-31',status:'pending_review',quality:'complete',meter_snapshot:[{meterId:'meter-a'}],financial_scope:'PRODUCTION',policy_hash:cyclePolicyHash,policy_snapshot:{scope:'PRODUCTION',taxRate:'99.0000'},billing_settings_version:1,billing_kind:'energy'};
  const result=await f.service.status(owner,{billingCycleId:'cycle-a'});
  assert.ok(result.actions.issue.missing.includes('cycle.snapshot'));
}));
test('financial capabilities honor the employee assigned site scope',()=>environment(async()=>{
  const f=fixture();f.approve();
  const employee={role:'accountant',authorization:{revision:0,permissions:['business.billing.edit'],scopes:{business:{mode:'selected' as const,siteIds:['site-a']},technical:{mode:'selected' as const,siteIds:[]}}}};
  assert.ok((await f.service.capabilities('accountant',true,employee)).actions.includes('calculate'));
  employee.authorization.scopes.business.siteIds=['site-b'];assert.ok(!(await f.service.capabilities('accountant',true,employee)).actions.includes('calculate'));
}));

test('production issuance and payment approval require an authoritative persisted cycle',()=>environment(async()=>{
  const f=fixture();f.approve();
  for(const action of ['issue','approve_payment'] as const) {
    await assert.rejects(f.service.assertEnabled(action,{siteId:'site-a'}),error=>(error as any).getStatus()===503&&(error as any).getResponse().missing.includes('context.cycle'));
    await assert.rejects(f.service.assertEnabled(action,{siteId:'site-a',billingCycleId:'missing'}),error=>(error as any).getResponse().missing.includes('context.cycle'));
  }
  f.state.cycle={id:'cycle-a',site_id:'site-a',starts:'2026-01-01',ends:'2026-01-31',status:'pending_review',quality:'complete',meter_snapshot:[{meterId:'meter-a'}],financial_scope:'PRODUCTION',policy_hash:cyclePolicyHash,policy_snapshot:{scope:'PRODUCTION'},billing_settings_version:1,billing_kind:'energy'};
  for(const action of ['issue','approve_payment'] as const) {
    assert.equal((await f.service.assertEnabled(action,{billingCycleId:'cycle-a'})).scope,'PRODUCTION');
    for(const field of ['policy_snapshot','financial_scope']) {
      const previous=f.state.cycle[field];f.state.cycle[field]=null;
      await assert.rejects(f.service.assertEnabled(action,{billingCycleId:'cycle-a'}),error=>(error as any).getResponse().missing.includes('cycle.snapshot'));
      f.state.cycle[field]=previous;
    }
  }
}));

test('caller periods cannot substitute complete alternate boundaries for an incomplete cycle period',()=>environment(async()=>{
  const f=fixture();f.approve();f.state.boundaryMissingDates=['2026-01-01'];
  f.state.cycle={id:'cycle-a',site_id:'site-a',starts:'2026-01-01',ends:'2026-01-31',status:'pending_review',quality:'complete',meter_snapshot:[{meterId:'meter-a'}],financial_scope:'PRODUCTION',policy_hash:cyclePolicyHash,policy_snapshot:{scope:'PRODUCTION'},billing_settings_version:1,billing_kind:'energy'};
  for(const action of ['calculate','issue','approve_payment','adjust','send'] as const) {
    for(const period of [{periodStart:'2026-03-01',periodEnd:'2026-03-31'},{periodStart:'2026-03-01'},{periodEnd:'2026-03-31'}]) {
      await assert.rejects(f.service.assertEnabled(action,{billingCycleId:'cycle-a',...period}),error=>(error as any).getStatus()===400);
    }
  }
  for(const period of [{},{periodStart:'2026-01-01',periodEnd:'2026-01-31'}]) {
    await assert.rejects(f.service.assertEnabled('issue',{billingCycleId:'cycle-a',...period}),error=>(error as any).getResponse().missing.includes('site.boundary_readings'));
  }
}));
