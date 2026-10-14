import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { OperationsService } from "./operations.service.js";
import type { DatabaseService } from "../../database/database.service.js";
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

test('billing returns complete zero facets without querying an empty customer scope',async()=>{
 const service=new OperationsService({query:async()=>{assert.fail('empty scope must not query');}} as unknown as DatabaseService);
 const page=await service.list('billing',{role:'customer_user'},{billingStatusView:'paid'});
 assert.deepEqual(page.facets,{billingStatusCounts:{all:0,pending_issue_approval:0,awaiting_payment:0,pending_verification:0,overdue:0,paid:0,unsuccessful:0}});
});

test('billing status mapping and scoped facet counts execute against isolated PostgreSQL',{
 skip:!process.env.FINANCIAL_READINESS_TEST_DATABASE_URL,
},async()=>{
 const connectionString=process.env.FINANCIAL_READINESS_TEST_DATABASE_URL!;
 const url=new URL(connectionString);
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15449');assert.equal(url.pathname,'/solar_financial_flow_review');
 assert.equal(url.search,'');assert.equal(url.hash,'');
 const pool=new Pool({connectionString});const client=await pool.connect();
 const schema='billing_views_'+randomUUID().replaceAll('-','');
 const id=(number:number)=>'00000000-0000-4000-8000-'+String(number).padStart(12,'0');
 try {
  await client.query('BEGIN');
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}"`);
  await client.query(`
   CREATE TABLE customers(id uuid PRIMARY KEY,name text);
   CREATE TABLE sites(id uuid PRIMARY KEY,customer_id uuid,name text,external_site_id text);
   CREATE TABLE site_account_assignments(user_id uuid,site_id uuid,revoked_at timestamptz);
   CREATE TABLE billing_cycles(id uuid PRIMARY KEY,site_id uuid,contract_id uuid,period_start date,period_end date,billing_kind text,due_date date,consumed_kwh numeric,rate numeric,amount numeric,status text,quality text,opening_energy numeric,closing_energy numeric);
   CREATE TABLE payments(id uuid PRIMARY KEY,billing_cycle_id uuid,amount numeric,verified_amount numeric,status text,paid_at timestamptz,slip_url text,rejection_reason text);
   CREATE TABLE documents(id uuid PRIMARY KEY,billing_cycle_id uuid,document_type text,is_current boolean,status text,revision int,document_number text,issue_date date);
   CREATE TABLE operational_delivery_outbox(billing_cycle_id uuid,state text,dedupe_key text);
   INSERT INTO customers VALUES('${id(100)}','Customer');
   INSERT INTO sites VALUES('${id(101)}','${id(100)}','Selected site','SITE-A'),('${id(102)}','${id(100)}','Other site','SITE-B');
   INSERT INTO site_account_assignments VALUES('${id(103)}','${id(101)}',NULL);
   INSERT INTO billing_cycles(id,site_id,period_start,period_end,due_date,amount,status)
    SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${id(101)}','2026-09-01','2026-09-30',
      (now() AT TIME ZONE 'Asia/Bangkok')::date+CASE WHEN n IN(1,3,4,5) THEN -1 ELSE 10 END,100,
      CASE n WHEN 1 THEN 'pending_issue_approval' WHEN 6 THEN 'draft' WHEN 7 THEN 'cancelled' WHEN 8 THEN 'superseded' ELSE 'issued' END FROM generate_series(1,9) n;
   INSERT INTO documents(id,billing_cycle_id,document_type,is_current,status,revision,document_number,issue_date)
    SELECT ('00000000-0000-4000-8000-'||lpad((n+200)::text,12,'0'))::uuid,('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'invoice',true,'issued',1,'INV-'||n,'2026-10-01' FROM generate_series(1,8) n;
   INSERT INTO payments(id,billing_cycle_id,amount,status) VALUES('${id(301)}','${id(1)}',100,'pending_verification'),('${id(303)}','${id(3)}',100,'pending_verification'),('${id(304)}','${id(4)}',100,'pending_verification'),('${id(305)}','${id(5)}',100,'paid'),('${id(306)}','${id(5)}',20,'pending_verification');
   UPDATE payments SET status='rejected' WHERE id='${id(304)}';
   UPDATE payments SET amount=10,verified_amount=100 WHERE id='${id(305)}';
   INSERT INTO payments(id,billing_cycle_id,amount,status) VALUES('${id(302)}','${id(2)}',40,'paid'),('${id(307)}','${id(4)}',20,'paid'),('${id(309)}','${id(9)}',100,'paid');
   INSERT INTO documents VALUES('${id(209)}','${id(9)}','invoice',false,'issued',1,'OLD-INVOICE','2026-10-01');
   INSERT INTO billing_cycles(id,site_id,period_start,period_end,due_date,amount,status) VALUES('${id(10)}','${id(102)}','2026-09-01','2026-09-30',current_date+10,100,'pending_issue_approval'),('${id(11)}','${id(101)}','2026-08-01','2026-08-31',current_date+10,100,'pending_issue_approval');
  `);
  const service=new OperationsService({query:(sql:string,params:unknown[])=>client.query(sql,params)} as unknown as DatabaseService);
  const scope={siteId:id(101),from:'2026-09-01',to:'2026-09-30',search:'Selected site',sort:'amount',direction:'asc'};
  const owner={role:'owner'};
  const all=await service.list('billing',owner,{...scope,billingStatusView:'all'});
  assert.deepEqual(Object.fromEntries(all.rows.map(row=>[row.id,row.billingStatusView])),{
   [id(1)]:'pending_issue_approval',[id(2)]:'awaiting_payment',[id(3)]:'pending_verification',[id(4)]:'overdue',[id(5)]:'paid',[id(6)]:'unsuccessful',[id(7)]:'unsuccessful',[id(8)]:'unsuccessful',[id(9)]:'unsuccessful',
  });
  assert.deepEqual(all.facets,{billingStatusCounts:{all:9,pending_issue_approval:1,awaiting_payment:1,pending_verification:1,overdue:1,paid:1,unsuccessful:4}});
  const siteOnly=await service.list('billing',owner,{siteId:id(101),from:'2026-09-01',to:'2026-09-30'});
  const searchOnly=await service.list('billing',owner,{search:'Selected site',from:'2026-09-01',to:'2026-09-30'});
  assert.deepEqual(siteOnly.facets,all.facets);assert.deepEqual(searchOnly.facets,all.facets);
  for(const status of ['pending_issue_approval','awaiting_payment','pending_verification','overdue','paid','unsuccessful']) {
   const page=await service.list('billing',owner,{...scope,billingStatusView:status});
   assert.ok(page.rows.every(row=>row.billingStatusView===status));
   assert.equal(page.rows.length,status==='unsuccessful'?4:1);assert.deepEqual(page.facets,all.facets);
  }
  const first=await service.list('billing',owner,{...scope,billingStatusView:'unsuccessful',limit:'1'});
  assert.equal(first.page.hasMore,true);assert.ok(first.page.nextCursor);assert.deepEqual(first.facets,all.facets);
  const second=await service.list('billing',owner,{...scope,billingStatusView:'unsuccessful',limit:'1',cursor:first.page.nextCursor!});
  assert.notEqual(first.rows[0]?.id,second.rows[0]?.id);assert.deepEqual(second.facets,all.facets);
  const none=await service.list('billing',owner,{...scope,search:'no matches'});
  assert.equal(none.facets?.billingStatusCounts?.all,0);assert.equal(none.rows.length,0);
  const collection=await service.list('billing',owner,{...scope,billingStatusView:'paid',collectionStatus:'overdue'});
  assert.equal(collection.rows.length,0);assert.equal(collection.facets?.billingStatusCounts?.all,1);assert.equal(collection.facets?.billingStatusCounts?.overdue,1);
  const customer=await service.list('billing',{id:id(103),role:'customer_user',assignedSiteIds:[id(101)]},{from:'2026-09-01',to:'2026-09-30'});
  assert.deepEqual(customer.facets,all.facets);
  await client.query('UPDATE site_account_assignments SET revoked_at=now()');
  const revoked=await service.list('billing',{id:id(103),role:'customer_user',assignedSiteIds:[id(101)]});
  assert.equal(revoked.facets?.billingStatusCounts?.all,0);
  const summary=await service.summary('billing',owner,{...scope,billingStatusView:'paid'});
  assert.equal(Array.isArray(summary),true);assert.equal(summary.length,4);assert.equal(summary[0]?.value,1);assert.equal(summary[1]?.value,1);assert.equal(summary[2]?.value,100);assert.equal(summary[3]?.value,100);
  // Exercise the existing browser request helper without extending API compilation into the web source tree.
  const requestHelperPath='../../../../web/features/shared/operation-request-query.ts';
  const {operationRequestQueries}=await import(requestHelperPath);
  for(const [status,expectedCount,expectedView] of [['issued',9,'all'],['',9,'all'],['paid',1,'paid'],['pending_payment',1,'awaiting_payment'],['cancelled',4,'unsuccessful']] as const) {
   const requests=operationRequestQueries({status,siteId:id(101),from:'2026-09-01',to:'2026-09-30'});
   const page=await service.list('billing',owner,Object.fromEntries(new URLSearchParams(requests.rows)));
   const totals=await service.summary('billing',owner,Object.fromEntries(new URLSearchParams(requests.summary)));
   assert.equal(page.rows.length,expectedCount);assert.equal(Array.isArray(totals),true);assert.equal(totals.length,4);assert.equal(totals[0]?.value,expectedCount);
   if(expectedView!=='all')assert.ok(page.rows.every(row=>row.billingStatusView===expectedView));
   assert.deepEqual(page.facets,all.facets);
  }
 } finally {await client.query('ROLLBACK');client.release();await pool.end();}
});

test('receipt detail includes the related billing period rather than the receipt issue month',async()=>{
 const id='00000000-0000-4000-8000-000000000001';
 const db={query:async(sql:string)=>({rows:[{id,...(sql.includes("SELECT to_char(period_end,'YYYY-MM') FROM billing_cycles WHERE id=d.billing_cycle_id")?{period:'2026-09'}:{})}]})};
 const result=await new OperationsService(db as unknown as DatabaseService).detail('receipts',id,{role:'accountant'});
 assert.equal(result.row.period,'2026-09');
});
test("unassigned customer user receives no operations data", async () => {
  let called=false;
  const db={query:async()=>{called=true;return {rows:[{id:"other-customer"}]};}};
  const service=new OperationsService(db as unknown as DatabaseService);
  assert.deepEqual((await service.list("sites",{role:"customer_user"})).rows,[]);
  assert.equal(called,false);
});
test("site list binds scope and removes generated gateway values", async () => {
  const db={query:async(sql:string,params:unknown[])=>{
    assert.ok(sql.includes("$1"));
    assert.deepEqual(params,[["00000000-0000-4000-8000-000000000001"],"00000000-0000-4000-8000-000000000002",26]);
    assert.equal(sql.includes("GW-01"),false);
    return {rows:[]};
  }};
  assert.deepEqual((await new OperationsService(db as unknown as DatabaseService).list("sites",{id:'00000000-0000-4000-8000-000000000002',role:"customer_user",customerId:"customer-a",assignedSiteIds:['00000000-0000-4000-8000-000000000001']})).rows,[]);
});
test("report catalogue is empty when no persisted reports exist", async () => {
  const db={query:async()=>({rows:[]})};
  assert.deepEqual((await new OperationsService(db as unknown as DatabaseService).list("reports",{id:"u",role:"owner"})).rows,[]);
});

test("record detail binds ID and retains customer scope", async () => {
 const id="00000000-0000-4000-8000-000000000001";
 const db={query:async(sql:string,params:unknown[])=>{assert.ok(sql.includes('si.id=ANY($1::uuid[])'));assert.ok(sql.includes('q.id=$3::uuid'));assert.deepEqual(params,[["00000000-0000-4000-8000-000000000001"],"00000000-0000-4000-8000-000000000002",id]);return {rows:[{id,name:"Site A"}]};}};
 const result=await new OperationsService(db as unknown as DatabaseService).detail("sites",id,{id:'00000000-0000-4000-8000-000000000002',role:"customer_user",customerId:"customer-a",assignedSiteIds:['00000000-0000-4000-8000-000000000001']});
 assert.equal(result.row.id,id);
});
test("record detail rejects missing records and admin-only resources", async () => {
 const service=new OperationsService({query:async()=>({rows:[]})} as unknown as DatabaseService);
 await assert.rejects(()=>service.detail("sites","invalid",{role:"admin"}));
 await assert.rejects(()=>service.detail("sites","00000000-0000-4000-8000-000000000001",{role:"customer_user"}));
 await assert.rejects(()=>service.detail("users","00000000-0000-4000-8000-000000000001",{role:"customer_user"}));
});

test('billing history is read only after scoped cycle lookup succeeds',async()=>{
 const id='00000000-0000-4000-8000-000000000001';let calls=0;
 const rows=[{id:'payment-a',amount:'2000.00000000',status:'pending_verification',transferDate:'2026-10-08T01:00:00Z'},{id:'payment-b',amount:'2623.45000000',status:'pending_verification'}];
 const db={query:async(sql:string,params:unknown[])=>{calls++;if(calls===1){assert.ok(sql.includes('si.id=ANY($1::uuid[])'));assert.deepEqual(params,[['00000000-0000-4000-8000-000000000001'],'00000000-0000-4000-8000-000000000002',id]);return {rows:[{id}]};}assert.ok(sql.includes('billing_cycle_id=$1'));assert.deepEqual(params,[id]);return {rows};}};
 const result=await new OperationsService(db as unknown as DatabaseService).detail('billing',id,{id:'00000000-0000-4000-8000-000000000002',role:'customer_user',customerId:'customer-a',assignedSiteIds:['00000000-0000-4000-8000-000000000001']});assert.deepEqual(result.row.payments,rows);assert.equal(calls,2);
 let deniedCalls=0;const denied=new OperationsService({query:async()=>{deniedCalls++;return {rows:[]};}} as unknown as DatabaseService);await assert.rejects(()=>denied.detail('billing',id,{role:'customer_user',customerId:'customer-b'}));assert.equal(deniedCalls,1);
});
test('scoped officer review exposes persisted payer metadata',async()=>{
 const id='00000000-0000-4000-8000-000000000001';let calls=0;
 const db={query:async(sql:string,params:unknown[])=>{calls++;if(calls===1)return {rows:[{id}]};assert.deepEqual(params,[id]);const row:Record<string,unknown>={id:'transfer',amount:'107.00',status:'pending_verification'};for(const [column,alias,value] of [['payer_name','payerName','Payer'],['payment_method','paymentMethod','bank_transfer'],['origin_bank','originBank','Origin bank'],['origin_account','originAccount','00123']])if(sql.includes(column+' AS "'+alias+'"'))row[alias!]=value;return {rows:[row]};}};
 const result=await new OperationsService(db as unknown as DatabaseService).detail('billing',id,{role:'accountant'});assert.equal((result.row.payments as any)[0].payerName,'Payer');assert.equal((result.row.payments as any)[0].paymentMethod,'bank_transfer');assert.equal((result.row.payments as any)[0].originBank,'Origin bank');assert.equal((result.row.payments as any)[0].originAccount,'00123');
});




test('site connection status uses fresh non-retired gateway telemetry in lists and summaries',async()=>{
 const queries:string[]=[];
 const service=new OperationsService({query:async(sql:string)=>{queries.push(sql);return {rows:sql.startsWith('SELECT count')?[{count:0,active:0,capacity:0}]:[]};}} as unknown as DatabaseService);
 await service.list('sites',{role:'owner'});
 await service.summary('sites',{role:'owner'});
 for(const sql of queries){
  assert.match(sql,/g\.last_seen_at/);
  assert.match(sql,/g\.retired_at IS NULL/);
  assert.match(sql,/greatest\(120,g\.polling_interval_seconds\*2\)/);
  assert.match(sql,/WHEN si\.status IN \('inactive','archived'\) THEN si\.status/);
 }
});
