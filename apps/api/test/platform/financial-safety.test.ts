import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {AuthService} from '../../src/modules/identity/auth.service.js';
import {assertIsolatedDatabase} from './fixtures.js';
import {BillingController} from '../../src/modules/billing/billing.controller.js';
import {FinancialReadinessService} from '../../src/modules/billing/financial-readiness.service.js';
import {LocalFinancialApplicationService} from '../../src/modules/billing/local-financial-application.service.js';
import {routeAllowed} from '../../src/common/auth/route-policy.js';
const base=process.env.READINESS_API_URL!, web=process.env.READINESS_WEB_URL!;
assert.equal(base,'http://127.0.0.1:13001'); assert.equal(web,'http://localhost:13000');
test('financial HTTP entry points fail closed without creating or mutating rows, and capabilities respect current roles',async()=>{
 const db=new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!)});
 const id=randomUUID(),school=randomUUID(),site=randomUUID(),cycle=randomUUID(),doc=randomUUID(),contract=randomUUID();
 const email=`financial-${id}@example.test`,password='Financial-fixture-password-123!';
 const auth=new AuthService('readiness-test-access-secret-000000000000','readiness-test-refresh-secret-000000000000');
 await db.query("INSERT INTO schools(id,name,code,region) VALUES($1,'Financial school',$2,'fixture')",[school,school]);
 await db.query("INSERT INTO sites(id,school_id,name,capacity_mwp) VALUES($1,$2,'Financial site',0.1)",[site,school]);
 await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash,school_id) VALUES($1,$2,'Financial','owner','active',$3,$4)",[id,email,auth.hashPassword(password),school]);
 await db.query("INSERT INTO billing_cycles(id,site_id,period_start,period_end,cutoff_time,status,quality,opening_energy,closing_energy,consumed_kwh,rate,amount) VALUES($1,$2,'2026-09-01','2026-09-30',now(),'pending_verification','complete',100,110,10,12.345,123.45)",[cycle,site]);
 await db.query("INSERT INTO documents(id,site_id,billing_cycle_id,document_type,document_number,amount,file_key) VALUES($1,$2,$3,'invoice',$4,123.45,'original/fixture.pdf')",[doc,site,cycle,doc]);
 await db.query("INSERT INTO contracts(id,site_id,version,start_date,payment_terms,signer_name) VALUES($1,$2,1,'2026-09-01','Explicit fixture payment terms','Fixture provider signatory')",[contract,site]);
 try {
  const login=await fetch(base+'/v1/auth/login',{method:'POST',headers:{Origin:web,'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(login.status,200);
  const token=(await login.json()).accessToken;
  const request=(path:string,method='GET',body?:unknown)=>fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,Origin:web,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const snapshot=async()=> (await db.query('SELECT (SELECT count(*) FROM billing_cycles WHERE site_id=$1)::int AS cycles,(SELECT count(*) FROM documents WHERE site_id=$1)::int AS documents,(SELECT count(*) FROM payments WHERE billing_cycle_id=$2)::int AS payments,(SELECT amount FROM billing_cycles WHERE id=$2) AS amount,(SELECT status FROM billing_cycles WHERE id=$2) AS status,(SELECT amount FROM documents WHERE id=$3) AS document_amount,(SELECT count(*) FROM contracts WHERE site_id=$1)::int AS contracts,(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM contracts c WHERE c.site_id=$1) AS contract_rows,(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM documents d WHERE d.site_id=$1) AS document_rows,(SELECT count(*) FROM rate_versions WHERE contract_id IN (SELECT id FROM contracts WHERE site_id=$1))::int AS rates,(SELECT count(*) FROM document_artifacts WHERE document_id IN (SELECT id FROM documents WHERE site_id=$1))::int AS artifacts,(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.id),jsonb_build_array()) FROM financial_delivery_outbox o JOIN documents d ON d.id=o.document_id WHERE d.site_id=$1) AS outbox,(SELECT count(*) FROM audit_events WHERE entity_id::text=ANY(ARRAY[$1::text,$2::text,$3::text]))::int AS financial_audits',[site,cycle,doc])).rows[0];
  const schema=await (await fetch(base+'/docs-json')).json();
  const writes=Object.entries(schema.paths).flatMap(([path,methods])=>Object.keys(methods as object).filter(method=>['post','patch','put','delete'].includes(method)).map(method=>`${method.toUpperCase()} ${path}`)).filter(route=>/\/v1\/(billing-cycles|contracts|documents)(\/|$)/.test(route)).sort();
  assert.deepEqual(writes,[
   'PATCH /v1/billing-cycles/{id}/adjust','PATCH /v1/billing-cycles/{id}/status','PATCH /v1/billing-cycles/{id}/verify-payment',
   'POST /v1/billing-cycles','POST /v1/billing-cycles/{id}/generate-invoice','POST /v1/billing-cycles/{id}/pay','POST /v1/billing-cycles/{id}/send-email','POST /v1/contracts','POST /v1/contracts/{id}/send-email','POST /v1/documents',
  ],'Every exposed financial mutation is covered or explicitly retained as contract/evidence input');
  const before=await snapshot();
  assert.equal((await request('/v1/contracts','POST',{siteId:site})).status,400,'Contract cannot invent rates, terms or signatory');
  assert.equal(Number((await db.query('SELECT count(*) FROM contracts WHERE site_id=$1',[site])).rows[0].count),1,'Invalid contract input must not add another contract');
  for(const [method,path,body] of [
   ['POST','/v1/billing-cycles',{siteId:site,periodStart:'2026-10-01',periodEnd:'2026-10-31'}],
   ['POST',`/v1/billing-cycles/${cycle}/generate-invoice`,{}],
   ['PATCH',`/v1/billing-cycles/${cycle}/verify-payment`,{status:'approved'}],
   ['PATCH',`/v1/billing-cycles/${cycle}/verify-payment`,{status:'rejected',rejectionReason:'test'}],
   ['PATCH',`/v1/billing-cycles/${cycle}/status`,{status:'approved'}],
   ['PATCH',`/v1/billing-cycles/${cycle}/adjust`,{amount:999}],
   ['POST',`/v1/billing-cycles/${cycle}/send-email`,{}],
   ['POST',`/v1/contracts/${contract}/send-email`,{}],
   ['POST','/v1/documents',{siteId:site,type:'invoice',amount:999}],
  ] as const){const response=await request(path,method,body);assert.equal(response.status,503,path);assert.equal((await response.json()).code,'FINANCIAL_NOT_READY');const after=await snapshot();const createdRows=after.cycles+after.documents+after.payments-before.cycles-before.documents-before.payments;assert.equal(createdRows,0);assert.deepEqual(after,before,path);}
  assert.equal((await request(`/v1/billing-cycles/${cycle}`)).status,200);
  for(const [role,want] of [['owner',['calculate','issue','approve_payment','adjust','send']],['accountant',['calculate','issue','approve_payment','adjust','send']],['admin',['calculate','issue','adjust','send']],['operator',[]],['school_user',[]]] as const){
   await db.query('UPDATE users SET role=$1 WHERE id=$2',[role,id]);
   const response=await request('/v1/auth/capabilities');assert.equal(response.status,200);const capabilities=await response.json();assert.deepEqual(capabilities.actions,role === 'owner' || role === 'admin' ? ['create_contract'] : []);assert.deepEqual(Object.keys(capabilities.unavailable),want);
   for(const [method,suffix] of [['POST','generate-invoice'],['PATCH','verify-payment'],['PATCH','status'],['PATCH','adjust'],['POST','send-email']] as const) {
    const allowed=suffix==='verify-payment'?['owner','accountant'].includes(role):['owner','admin','accountant'].includes(role);
    assert.equal((await request(`/v1/billing-cycles/${cycle}/${suffix}`,method,{status:'approved'})).status,allowed?503:403,`${role} ${suffix}`);
   }
   const mail=await request(`/v1/contracts/${contract}/send-email`,'POST',{});
   assert.equal(mail.status,['owner','admin'].includes(role)?503:403,`${role} contract send-email`);
   if(['owner','admin'].includes(role))assert.equal((await mail.json()).code,'FINANCIAL_NOT_READY');
   assert.deepEqual(await snapshot(),before,`${role} contract mail must preserve financial rows and outbox`);
   if(['owner','admin'].includes(role)) {
    const override=await request(`/v1/contracts/${contract}/send-email`,'POST',{recipientEmail:'ad-hoc@example.invalid'});
    assert.equal(override.status,400);assert.match((await override.json()).message,/override/i);
    assert.deepEqual(await snapshot(),before,`${role} rejected address override must preserve financial rows and outbox`);
   }
   assert.equal((await request('/v1/documents','POST',{siteId:site})).status,['owner','admin','accountant'].includes(role)?503:403);
   assert.equal((await request('/v1/billing-cycles','POST',{siteId:site})).status,['owner','accountant','admin'].includes(role)?503:403);
   assert.equal((await request('/v1/contracts','POST',{siteId:site})).status,['owner','admin'].includes(role)?400:403,'Capability and retained contract author route agree');
  }
  await db.query("UPDATE users SET role='school_user' WHERE id=$1",[id]);
  assert.equal((await request(`/v1/billing-cycles/${cycle}/pay`,'POST',{})).status,400,'Payment evidence requires an explicit real amount');
  assert.equal((await request(`/v1/billing-cycles/${cycle}/pay`,'POST',{amount:123.45,note:'Actual payment evidence'})).status,201);
  assert.equal((await snapshot()).documents,1,'Evidence must not issue receipt');
  const records=await (await request('/v1/operations/documents')).json();assert.ok(records.rows.some((record:{id:string})=>record.id===doc),'Original document metadata remains readable in school scope');
  await db.query('UPDATE users SET school_id=NULL WHERE id=$1',[id]);
  assert.equal((await request(`/v1/billing-cycles/${cycle}`)).status,403);
  assert.equal((await request(`/v1/billing-cycles/${cycle}/pay`,'POST',{amount:123.45})).status,403);
 } finally {await db.query('DELETE FROM audit_events WHERE actor_id=$1 OR entity_id=$2',[id,cycle]);await db.query('DELETE FROM payments WHERE billing_cycle_id=$1',[cycle]);await db.query('DELETE FROM financial_delivery_outbox WHERE document_id IN (SELECT id FROM documents WHERE site_id=$1)',[site]);await db.query('DELETE FROM document_artifacts WHERE document_id IN (SELECT id FROM documents WHERE site_id=$1)',[site]);await db.query('DELETE FROM documents WHERE site_id=$1',[site]);await db.query('DELETE FROM billing_cycles WHERE site_id=$1',[site]);await db.query('DELETE FROM users WHERE id=$1',[id]);await db.query('DELETE FROM rate_versions WHERE contract_id IN (SELECT id FROM contracts WHERE site_id=$1)',[site]);await db.query('DELETE FROM contracts WHERE site_id=$1',[site]);await db.query('DELETE FROM sites WHERE id=$1',[site]);await db.query('DELETE FROM schools WHERE id=$1',[school]);await db.end();}
});

test('contract email production gate blocks flag bypass before database or SMTP access for every role',async()=>{
 const saved={NODE_ENV:process.env.NODE_ENV,FINANCIAL_WRITES_ENABLED:process.env.FINANCIAL_WRITES_ENABLED};
 const accesses:string[]=[];
 const db={query:async()=>{accesses.push('query');throw new Error('Unexpected database query');},pool:{connect:async()=>{accesses.push('connect');throw new Error('Unexpected database connection');}}};
 process.env.NODE_ENV='production';process.env.FINANCIAL_WRITES_ENABLED='true';
 const readiness=new FinancialReadinessService(db as any);
 const financial=new LocalFinancialApplicationService(db as any,readiness);
 const controller=new BillingController(db as any,readiness,financial,{} as any);
 const nodemailer=(await import('nodemailer')).default;
 const originalTransport=nodemailer.createTransport;
 nodemailer.createTransport=(()=>{accesses.push('smtp');throw new Error('Unexpected SMTP access');}) as typeof originalTransport;
 try {
  for(const role of ['owner','admin','accountant','operator','school_user']) {
   const author=['owner','admin'].includes(role);
   assert.equal(routeAllowed(role,'POST','/v1/contracts/fixture/send-email'),author);
   await assert.rejects(controller.sendContractEmail('fixture',{}, {user:{role}}),(error:any)=>{
    assert.equal(error.getStatus(),author?503:403);
    if(author)assert.equal(error.getResponse().code,'FINANCIAL_NOT_READY');
    return true;
   });
   assert.deepEqual(accesses,[],`${role} must not query, enqueue or send`);
  }
  for(const role of ['owner','admin']) {
   await assert.rejects(controller.sendContractEmail('fixture',{recipientEmail:'ad-hoc@example.invalid'},{user:{role}}),/override/i);
   assert.deepEqual(accesses,[],`${role} override must not query, enqueue or send`);
  }
  assert.deepEqual(Object.keys((await readiness.capabilities('admin',true)).unavailable),['calculate','issue','adjust','send']);
  assert.equal(routeAllowed('admin','PATCH','/v1/billing-cycles/fixture/verify-payment'),false);
  for(const role of ['owner','accountant'])assert.equal(routeAllowed(role,'PATCH','/v1/billing-cycles/fixture/verify-payment'),true);
 } finally {
  nodemailer.createTransport=originalTransport;
  for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
});