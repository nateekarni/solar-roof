import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {AuthService} from '../../src/modules/identity/auth.service.js';
import {assertIsolatedDatabase} from './fixtures.js';

test('billing document identities are scoped persisted IDs; direct preview never invents legacy evidence and forbidden mutations remain denied',async()=>{
 const db=new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!)});
 const base=process.env.READINESS_API_URL!,origin=process.env.READINESS_WEB_URL!;
 const school=randomUUID(),other=randomUUID(),site=randomUUID(),otherSite=randomUUID(),user=randomUUID(),cycle=randomUUID(),invoice=randomUUID(),receipt=randomUUID(),foreign=randomUUID();
 const email=`u1-${user}@example.test`,password='U1-contract-password-123!';
 const auth=new AuthService('readiness-test-access-secret-000000000000','readiness-test-refresh-secret-000000000000');
 try {
  await db.query("INSERT INTO schools(id,name,code,region) VALUES($1::uuid,'U1 School',$1::text,'fixture'),($2::uuid,'U1 Other',$2::text,'fixture')",[school,other]);
  await db.query("INSERT INTO sites(id,school_id,name,capacity_mwp) VALUES($1,$2,'U1 Site',0.1),($3,$4,'U1 Other',0.1)",[site,school,otherSite,other]);
  await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash,school_id) VALUES($1,$2,'U1 Actor','admin','active',$3,$4)",[user,email,auth.hashPassword(password),school]);
  await db.query("INSERT INTO billing_cycles(id,site_id,period_start,period_end,cutoff_time,status,quality,opening_energy,closing_energy,consumed_kwh,rate,amount) VALUES($1,$2,'2026-09-01','2026-09-30',now(),'approved','complete',100,110,10,1,10)",[cycle,site]);
  await db.query("INSERT INTO documents(id,site_id,billing_cycle_id,document_type,document_number,status,amount,issue_date,file_key) VALUES($1,$2,$3,'invoice','U1-INV','issued',10,'2020-01-01','legacy/original.pdf'),($4,$2,$3,'receipt','U1-RCT','issued',10,'2020-01-01','legacy/receipt.pdf'),($5,$6,NULL,'invoice','U1-FOREIGN','issued',10,'2020-01-01','legacy/foreign.pdf')",[invoice,site,cycle,receipt,foreign,otherSite]);
  await db.query("INSERT INTO documents(id,site_id,document_type,document_number,status,amount,issue_date) SELECT gen_random_uuid(),$1,'invoice',gen_random_uuid()::text,'draft',10,'2026-09-30' FROM generate_series(1,30)",[site]);
  const login=await fetch(base+'/v1/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(login.status,200);
  const token=(await login.json()).accessToken;
  const req=(path:string,method='GET',body?:unknown)=>fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,Origin:origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const page=await (await req('/v1/operations/billing')).json(),row=page.rows.find((r:{id:string})=>r.id===cycle);
  assert.equal(row.invoiceId,invoice);assert.equal(row.receiptId,receipt);assert.equal(row.invoiceNumber,'U1-INV');assert.equal(row.receiptNumber,'U1-RCT');
  assert.equal((await (await req('/v1/operations/documents')).json()).rows.some((r:{id:string})=>r.id===invoice),false,'ID lies beyond first page');
  // A database trigger widens the real race; disabling serialization creates multiple payment rows.
  await db.query(`CREATE FUNCTION u1_payment_race() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.billing_cycle_id='${cycle}'::uuid THEN PERFORM pg_sleep(0.1); END IF; RETURN NEW; END $$`);
  await db.query('CREATE TRIGGER u1_payment_race BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION u1_payment_race()');
  try {
   const replies=await Promise.all(Array.from({length:4},()=>req('/v1/billing-cycles/'+cycle+'/pay','POST',{amount:10,paidAt:'2026-09-30T10:00:00Z',slipUrl:'data:image/png;base64,aA=='})));
   const payloads=await Promise.all(replies.map(async response=>{assert.equal(response.status,201);return response.json();}));
   assert.equal(new Set(payloads.map(value=>value.paymentId)).size,1,'Concurrent evidence upserts retain one payment identity');
   assert.equal(Number((await db.query('SELECT count(*) FROM payments WHERE billing_cycle_id=$1',[cycle])).rows[0].count),1);
  } finally {await db.query('DROP TRIGGER u1_payment_race ON payments');await db.query('DROP FUNCTION u1_payment_race()');}
  await db.query(`CREATE FUNCTION u1_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.actor_id='${user}'::uuid AND NEW.action='billing_cycle.pay' THEN RAISE EXCEPTION 'U1 audit failure'; END IF; RETURN NEW; END $$`);
  await db.query('CREATE TRIGGER u1_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION u1_audit_failure()');
  try {
   assert.equal((await req('/v1/billing-cycles/'+cycle+'/pay','POST',{amount:20,slipUrl:'data:image/png;base64,aA=='})).status,500);
   assert.equal(Number((await db.query('SELECT amount FROM payments WHERE billing_cycle_id=$1',[cycle])).rows[0].amount),10,'Audit failure rolls back evidence update');
  } finally {await db.query('DROP TRIGGER u1_audit_failure ON audit_events');await db.query('DROP FUNCTION u1_audit_failure()');}
  for(const role of ['owner','admin','operator','accountant','school_user']) {
   await db.query('UPDATE users SET role=$1 WHERE id=$2',[role,user]);
   const response=await req('/v1/operations/documents/'+invoice);assert.equal(response.status,200);const doc=await response.json();assert.equal(doc.id,invoice);assert.equal(doc.documentNumber,'U1-INV');assert.equal(doc.snapshot,undefined);assert.ok(doc.previewUnavailableReason,'No invented persisted snapshot');
   assert.equal((await req('/v1/operations/documents/'+foreign)).status,['owner','admin'].includes(role)?200:404,'Tenant scope applies to direct ID');
   const caps=await (await req('/v1/auth/capabilities')).json();assert.equal(caps.operationsActions.includes('submit_payment'),role!=='operator');assert.equal(caps.actions.includes('approve_payment'),false);
   assert.equal((await req('/v1/billing-cycles/'+cycle+'/verify-payment','PATCH',{status:'approved'})).status,['owner','accountant'].includes(role)?503:403);
  }
 } finally {
  // Issued originals and their fixture dependencies remain until owned isolated-stack teardown.
  // scripts/ci/isolated-stack.sh removes the disposable database without bypassing immutability.
  await db.end();
 }
});
