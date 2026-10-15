import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {AuthService} from '../../src/modules/identity/auth.service.js';
import {assertIsolatedDatabase} from './fixtures.js';
import {BillingController} from '../../src/modules/billing/billing.controller.js';
import {FinancialReadinessService} from '../../src/modules/financial-readiness/financial-readiness.service.js';
import {FinancialApplicationService} from '../../src/modules/billing/financial-application.service.js';
import {routeAllowed} from '../../src/common/auth/route-policy.js';
import {DatabaseService} from '../../src/database/database.service.js';
import {createHash} from 'node:crypto';
const base=process.env.READINESS_API_URL!, web=process.env.READINESS_WEB_URL!;
assert.equal(base,'http://127.0.0.1:13001'); assert.equal(web,'http://localhost:13000');
test('financial HTTP entry points fail closed without creating or mutating rows, and capabilities respect current roles',async()=>{
 const db=new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!)});
 const id=randomUUID(),customer=randomUUID(),site=randomUUID(),cycle=randomUUID(),doc=randomUUID(),contract=randomUUID();
 const email=`financial-${id}@example.test`,password='Financial-fixture-password-123!';
 const auth=new AuthService('readiness-test-access-secret-000000000000','readiness-test-refresh-secret-000000000000');
 await db.query("INSERT INTO customers(id,name,code,region) VALUES($1,'Financial customer',$2,'fixture')",[customer,customer]);
 await db.query("INSERT INTO sites(id,customer_id,name,capacity_mwp) VALUES($1,$2,'Financial site',0.1)",[site,customer]);
 await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash,customer_id) VALUES($1,$2,'Financial','owner','active',$3,$4)",[id,email,auth.hashPassword(password),customer]);
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
   'PATCH /v1/billing-cycles/{id}/adjust','PATCH /v1/billing-cycles/{id}/rate','PATCH /v1/billing-cycles/{id}/status','PATCH /v1/billing-cycles/{id}/verify-payment',
   'POST /v1/billing-cycles','POST /v1/billing-cycles/approve-issuance','POST /v1/billing-cycles/{id}/approve-issuance','POST /v1/billing-cycles/{id}/generate-invoice','POST /v1/billing-cycles/{id}/pay','POST /v1/billing-cycles/{id}/send-email','POST /v1/contracts','POST /v1/contracts/{id}/send-email','POST /v1/documents',
  ],'Every exposed financial mutation is covered or explicitly retained as contract/evidence input');
  const before=await snapshot();
  assert.equal((await request('/v1/contracts','POST',{siteId:site})).status,403,'Retired contract authoring must remain inaccessible');
  assert.equal(Number((await db.query('SELECT count(*) FROM contracts WHERE site_id=$1',[site])).rows[0].count),1,'Invalid contract input must not add another contract');
  for(const [method,path,body] of [
   ['POST','/v1/billing-cycles',{siteId:site,periodStart:'2026-10-01',periodEnd:'2026-10-31'}],
   ['POST',`/v1/billing-cycles/${cycle}/generate-invoice`,{}],
   ['PATCH',`/v1/billing-cycles/${cycle}/verify-payment`,{status:'approved'}],
   ['PATCH',`/v1/billing-cycles/${cycle}/verify-payment`,{status:'rejected',rejectionReason:'test'}],
   ['PATCH',`/v1/billing-cycles/${cycle}/status`,{status:'approved'}],
   ['PATCH',`/v1/billing-cycles/${cycle}/adjust`,{amount:999}],
   ['PATCH',`/v1/billing-cycles/${cycle}/rate`,{rate:13,reason:'Readiness safety fixture'}],
   ['POST',`/v1/billing-cycles/${cycle}/send-email`,{}],
   ['POST','/v1/documents',{siteId:site,type:'invoice',amount:999}],
  ] as const){const response=await request(path,method,body);assert.equal(response.status,503,path);assert.equal((await response.json()).code,'FINANCIAL_NOT_READY');const after=await snapshot();const createdRows=after.cycles+after.documents+after.payments-before.cycles-before.documents-before.payments;assert.equal(createdRows,0);assert.deepEqual(after,before,path);}
  assert.equal((await request(`/v1/billing-cycles/${cycle}`)).status,200);
  for(const [role,want] of [['owner',['calculate','issue','approve_payment','adjust','send']],['accountant',['calculate','issue','approve_payment','adjust','send']],['admin',[]],['operator',[]],['customer_user',[]]] as const){
   await db.query('UPDATE users SET role=$1 WHERE id=$2',[role,id]);
   await db.query('DELETE FROM employee_domain_grants WHERE user_id=$1',[id]);
   if(role==='accountant')await db.query(`INSERT INTO employee_domain_grants(user_id,domain,overrides,scope_mode,site_ids) VALUES($1,'business',$2::jsonb,'selected',$3::uuid[])`,[id,JSON.stringify({'business.billing.view':true,'business.billing.edit':true,'business.billing.approve':true,'business.documents.edit':true}),[site]]);
   const response=await request('/v1/auth/capabilities');assert.equal(response.status,200);const capabilities=await response.json();assert.deepEqual(capabilities.actions,[]);assert.deepEqual(Object.keys(capabilities.unavailable),want);
   for(const [method,suffix] of [['POST','generate-invoice'],['PATCH','verify-payment'],['PATCH','status'],['PATCH','adjust'],['POST','send-email']] as const) {
    const allowed=['owner','accountant'].includes(role);
    assert.equal((await request(`/v1/billing-cycles/${cycle}/${suffix}`,method,{status:'approved'})).status,allowed?503:403,`${role} ${suffix}`);
   }
   const mail=await request(`/v1/contracts/${contract}/send-email`,'POST',{});
   assert.equal(mail.status,['owner','accountant'].includes(role)?409:403,`${role} requires a saved original before contract delivery`);
   assert.deepEqual(await snapshot(),before,`${role} contract mail must preserve financial rows and outbox`);
   if(['owner','admin'].includes(role)) {
    const override=await request(`/v1/contracts/${contract}/send-email`,'POST',{recipientEmail:'ad-hoc@example.invalid'});
    assert.equal(override.status,role==='owner'?400:403);
    assert.deepEqual(await snapshot(),before,`${role} rejected address override must preserve financial rows and outbox`);
   }
   assert.equal((await request('/v1/documents','POST',{siteId:site})).status,['owner','accountant'].includes(role)?503:403);
   assert.equal((await request('/v1/billing-cycles','POST',{siteId:site})).status,['owner','accountant'].includes(role)?400:403,'An incomplete period is invalid before finance readiness is evaluated');
   assert.equal((await request('/v1/contracts','POST',{siteId:site})).status,403,'Capability and retired contract author route agree');
  }
  await db.query("UPDATE users SET role='customer_user' WHERE id=$1",[id]);
  await db.query('INSERT INTO site_account_assignments(id,user_id,site_id) VALUES($1,$2,$3)',[randomUUID(),id,site]);
  assert.equal((await request(`/v1/billing-cycles/${cycle}/pay`,'POST',{})).status,400,'Payment submission requires transfer evidence');
  assert.equal((await request(`/v1/billing-cycles/${cycle}/pay`,'POST',{amount:123.45,evidenceKey:`financial-safety-${id}`,note:'Actual payment evidence'})).status,409,'Legacy cycle without a frozen policy cannot accept new transfers');
  assert.equal((await snapshot()).payments,0);
  assert.equal((await snapshot()).documents,1,'Evidence must not issue receipt');
  const records=await (await request('/v1/operations/documents')).json();assert.ok(records.rows.some((record:{id:string})=>record.id===doc),'Original document metadata remains readable in customer scope');
  await db.query('UPDATE users SET customer_id=NULL WHERE id=$1',[id]);
  assert.equal((await request(`/v1/billing-cycles/${cycle}`)).status,403);
  assert.equal((await request(`/v1/billing-cycles/${cycle}/pay`,'POST',{amount:123.45})).status,403);
 } finally {await db.query('DELETE FROM audit_events WHERE actor_id=$1 OR entity_id=$2',[id,cycle]);await db.query('DELETE FROM payments WHERE billing_cycle_id=$1',[cycle]);await db.query('DELETE FROM financial_delivery_outbox WHERE document_id IN (SELECT id FROM documents WHERE site_id=$1)',[site]);await db.query('DELETE FROM document_artifacts WHERE document_id IN (SELECT id FROM documents WHERE site_id=$1)',[site]);await db.query('DELETE FROM documents WHERE site_id=$1',[site]);await db.query('DELETE FROM billing_cycles WHERE site_id=$1',[site]);await db.query('DELETE FROM site_account_assignments WHERE user_id=$1',[id]);await db.query('DELETE FROM auth_sessions WHERE user_id=$1',[id]);await db.query('DELETE FROM users WHERE id=$1',[id]);await db.query('DELETE FROM rate_versions WHERE contract_id IN (SELECT id FROM contracts WHERE site_id=$1)',[site]);await db.query('DELETE FROM contracts WHERE site_id=$1',[site]);await db.query('DELETE FROM notification_feed_events WHERE site_id=$1',[site]);await db.query('DELETE FROM sites WHERE id=$1',[site]);await db.query('DELETE FROM customers WHERE id=$1',[customer]);await db.end();}
});

test('a writes flag cannot bypass readiness for a stored contract original',async()=>{
 const target=assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!);
 const admin=new Pool({connectionString:target}),schema='financial_safety_'+randomUUID().replaceAll('-','');
 await admin.query(`CREATE SCHEMA ${schema}`);
 const pool=new Pool({connectionString:target,options:`-c search_path=${schema},public`});
 const saved={NODE_ENV:process.env.NODE_ENV,FINANCIAL_WRITES_ENABLED:process.env.FINANCIAL_WRITES_ENABLED};
 process.env.NODE_ENV='production';process.env.FINANCIAL_WRITES_ENABLED='true';
 try {
  for(const {tablename}of (await admin.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows){assert.match(tablename,/^[a-z_0-9]+$/);await pool.query(`CREATE TABLE ${schema}.${tablename} (LIKE public.${tablename} INCLUDING ALL)`);}
  const owner=randomUUID(),customer=randomUUID(),site=randomUUID(),contract=randomUUID(),document=randomUUID();
  await pool.query("INSERT INTO users(id,email,display_name,role,status) VALUES($1,'contract-owner@example.test','Owner','owner','active')",[owner]);
  await pool.query("INSERT INTO customers(id,name,code,region) VALUES($1,'Contract customer',$2,'fixture')",[customer,customer]);
  await pool.query("INSERT INTO sites(id,customer_id,name,capacity_mwp) VALUES($1,$2,'Contract site',0.1)",[site,customer]);
  await pool.query("INSERT INTO contracts(id,site_id,version,start_date,payment_terms,signer_name) VALUES($1,$2,1,'2026-09-01','30 days','Authorized signer')",[contract,site]);
  const bytes=Buffer.from('%PDF-frozen-approval-gate-fixture'),sha=createHash('sha256').update(bytes).digest('hex');
  await pool.query("INSERT INTO documents(id,site_id,contract_id,document_type,document_number,status,snapshot,content_hash,file_key,template_version,issue_date) VALUES($1::uuid,$2,$3,'contract',$1::text,'issued',$4,$5,'local-artifact:approval-gate','ppa-th-sarabun-new-v5','2026-09-01')",[document,site,contract,JSON.stringify({policy:{scope:'PRODUCTION'},recipients:[{id:owner,email:'contract-owner@example.test'}]}),sha]);
  await pool.query('INSERT INTO document_artifacts(document_id,pdf_bytes,sha256) VALUES($1,$2,$3)',[document,bytes,sha]);
  const db={pool,query:pool.query.bind(pool),transaction:DatabaseService.prototype.transaction} as unknown as DatabaseService;
  const readiness=new FinancialReadinessService(db),financial=new FinancialApplicationService(db,readiness),controller=new BillingController(db,readiness,financial,{} as any);
  await assert.rejects(controller.sendContractEmail(contract,{}, {user:{id:owner,role:'owner'}}),(error:any)=>error.getStatus()===503&&error.getResponse().code==='FINANCIAL_NOT_READY');
  assert.equal((await pool.query('SELECT count(*)::int n FROM financial_delivery_outbox')).rows[0].n,0);
  assert.equal((await pool.query('SELECT count(*)::int n FROM financial_readiness_approvals')).rows[0].n,0);
  assert.equal(createHash('sha256').update((await pool.query('SELECT pdf_bytes FROM document_artifacts WHERE document_id=$1',[document])).rows[0].pdf_bytes).digest('hex'),sha);
  await assert.rejects(controller.sendContractEmail(contract,{recipientEmail:'ad-hoc@example.invalid'},{user:{id:owner,role:'owner'}}),/override/i);
  for(const role of ['owner','accountant','admin','operator','customer_user'])assert.equal(routeAllowed(role,'POST','/v1/contracts/fixture/send-email'),['owner','accountant'].includes(role));
 }finally{
  for(const [key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();
 }
});
