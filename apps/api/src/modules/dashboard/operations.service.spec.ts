import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { OperationsService } from "./operations.service.js";
import type { DatabaseService } from "../../database/database.service.js";
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { CustomerPortalService } from '../customer-portal/customer-portal.service.js';
import type { DashboardService } from './dashboard.service.js';
import { SettingsService } from '../settings/settings.service.js';

test('billing list and detail expose persisted tax for issuance review',async()=>{
 const id='00000000-0000-4000-8000-000000000001';
 const service=new OperationsService({query:async(sql:string)=>{
  if(sql.startsWith('SELECT id,amount'))return {rows:[]};
  if(sql.includes("p.payment_method='cash'"))return {rows:[]};
  if(sql.includes('GROUP BY q."billingStatusView"'))return {rows:[]};
  assert.match(sql,/b\.simulated_tax::text AS "simulatedTax"/);
  return {rows:[{id,simulatedTax:'70.00000000',amount:'1070.00000000'}]};
 }} as unknown as DatabaseService);
 assert.equal((await service.list('billing',{role:'owner'})).rows[0]?.simulatedTax,'70.00000000');
 assert.equal((await service.detail('billing',id,{role:'owner'})).row.simulatedTax,'70.00000000');
});

test('billing returns complete zero facets without querying an empty customer scope',async()=>{
 const service=new OperationsService({query:async()=>{assert.fail('empty scope must not query');}} as unknown as DatabaseService);
 const page=await service.list('billing',{role:'customer_user'},{billingStatusView:'paid'});
 assert.deepEqual(page.facets,{billingStatusCounts:{all:0,pending_issue_approval:0,awaiting_payment:0,pending_verification:0,partially_paid:0,overdue:0,paid:0,unsuccessful:0}});
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
   CREATE TABLE billing_cycles(id uuid PRIMARY KEY,site_id uuid,contract_id uuid,period_start date,period_end date,billing_kind text,due_date date,consumed_kwh numeric,rate numeric,amount numeric,subtotal numeric,simulated_tax numeric,status text,quality text,opening_energy numeric,closing_energy numeric);
   CREATE TABLE payments(id uuid PRIMARY KEY,billing_cycle_id uuid,amount numeric,verified_amount numeric,status text,paid_at timestamptz,slip_url text,rejection_reason text);
   CREATE TABLE documents(id uuid PRIMARY KEY,billing_cycle_id uuid,document_type text,is_current boolean,status text,revision int,document_number text,issue_date date);
   CREATE TABLE operational_delivery_outbox(billing_cycle_id uuid,state text,dedupe_key text);
   CREATE TABLE billing_replacement_drafts(billing_cycle_id uuid,status text,snapshot jsonb);
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
   INSERT INTO billing_cycles(id,site_id,period_start,period_end,due_date,amount,status)
    SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${id(101)}','2026-09-01','2026-09-30',
      (now() AT TIME ZONE 'Asia/Bangkok')::date+CASE WHEN n=12 THEN 10 ELSE -1 END,100,'issued' FROM generate_series(12,13) n;
   INSERT INTO documents(id,billing_cycle_id,document_type,is_current,status,revision,document_number,issue_date)
    SELECT ('00000000-0000-4000-8000-'||lpad((n+200)::text,12,'0'))::uuid,('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'invoice',true,'issued',1,'INV-'||n,'2026-10-01' FROM generate_series(12,13) n;
   UPDATE billing_cycles SET subtotal=90,simulated_tax=10;
  `);
  const service=new OperationsService({query:(sql:string,params:unknown[])=>client.query(sql,params)} as unknown as DatabaseService);
  const scope={siteId:id(101),from:'2026-09-01',to:'2026-09-30',search:'Selected site',sort:'amount',direction:'asc'};
  const owner={role:'owner'};
  const all=await service.list('billing',owner,{...scope,billingStatusView:'all'});
  assert.deepEqual(Object.fromEntries(all.rows.map(row=>[row.id,row.billingStatusView])),{
   // Cycles 2 and 4 have approved partial payments; partial takes precedence over the due date.
   [id(1)]:'pending_issue_approval',[id(2)]:'partially_paid',[id(3)]:'pending_verification',[id(4)]:'partially_paid',[id(5)]:'paid',[id(6)]:'unsuccessful',[id(7)]:'unsuccessful',[id(8)]:'unsuccessful',[id(9)]:'unsuccessful',[id(12)]:'awaiting_payment',[id(13)]:'overdue',
  });
  const partial=all.rows.find(row=>row.id===id(2))!;
  assert.equal(partial.subtotal,'90');assert.equal(partial.approvedAmount,'40');assert.equal(partial.outstandingAmount,'60');
  assert.equal(all.rows.find(row=>row.id===id(3))?.pendingEvidenceCount,1);
  assert.equal(all.rows.find(row=>row.id===id(4))?.rejectedEvidenceCount,1);
  assert.equal(all.rows.find(row=>row.id===id(5))?.approvedAmount,'100');
  assert.equal(all.rows.find(row=>row.id===id(5))?.outstandingAmount,'0');
  assert.deepEqual(all.facets,{billingStatusCounts:{all:11,pending_issue_approval:1,awaiting_payment:1,pending_verification:1,partially_paid:2,overdue:1,paid:1,unsuccessful:4}});
  const siteOnly=await service.list('billing',owner,{siteId:id(101),from:'2026-09-01',to:'2026-09-30'});
  const searchOnly=await service.list('billing',owner,{search:'Selected site',from:'2026-09-01',to:'2026-09-30'});
  assert.deepEqual(siteOnly.facets,all.facets);assert.deepEqual(searchOnly.facets,all.facets);
  for(const status of ['pending_issue_approval','awaiting_payment','pending_verification','partially_paid','overdue','paid','unsuccessful']) {
   const page=await service.list('billing',owner,{...scope,billingStatusView:status});
   assert.ok(page.rows.every(row=>row.billingStatusView===status));
   assert.equal(page.rows.length,status==='unsuccessful'?4:status==='partially_paid'?2:1);assert.deepEqual(page.facets,all.facets);
  }
  const first=await service.list('billing',owner,{...scope,billingStatusView:'unsuccessful',limit:'1'});
  assert.equal(first.page.hasMore,true);assert.ok(first.page.nextCursor);assert.deepEqual(first.facets,all.facets);
  const second=await service.list('billing',owner,{...scope,billingStatusView:'unsuccessful',limit:'1',cursor:first.page.nextCursor!});
  assert.notEqual(first.rows[0]?.id,second.rows[0]?.id);assert.deepEqual(second.facets,all.facets);
  const none=await service.list('billing',owner,{...scope,search:'no matches'});
  assert.equal(none.facets?.billingStatusCounts?.all,0);assert.equal(none.rows.length,0);
  const collection=await service.list('billing',owner,{...scope,billingStatusView:'paid',collectionStatus:'overdue'});
  assert.equal(collection.rows.length,1);assert.equal(collection.rows[0]?.billingStatusView,'paid');assert.deepEqual(collection.facets,all.facets);
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
  for(const [status,expectedCount,expectedView] of [['issued',11,'all'],['',11,'all'],['paid',1,'paid'],['pending_payment',1,'awaiting_payment'],['cancelled',4,'unsuccessful']] as const) {
   const requests=operationRequestQueries({status,siteId:id(101),from:'2026-09-01',to:'2026-09-30'});
   const page=await service.list('billing',owner,Object.fromEntries(new URLSearchParams(requests.rows)));
   const totals=await service.summary('billing',owner,Object.fromEntries(new URLSearchParams(requests.summary)));
   assert.equal(page.rows.length,expectedCount);assert.equal(Array.isArray(totals),true);assert.equal(totals.length,4);assert.equal(totals[0]?.value,expectedCount);
   if(expectedView!=='all')assert.ok(page.rows.every(row=>row.billingStatusView===expectedView));
   assert.deepEqual(page.facets,all.facets);
  }
  await client.query(`
   INSERT INTO billing_replacement_drafts VALUES('${id(2)}','pending_issue_approval','{"cycle":{"rate":"5.0000","subtotal":"5000.00","simulated_tax":"500.00","amount":"5500.00","due_date":"2026-11-15"}}');`);
  const replacements=await service.list('billing',owner,{...scope,billingStatusView:'pending_issue_approval'});
  assert.equal(replacements.facets?.billingStatusCounts?.pending_issue_approval,2);
  const proposal=replacements.rows.find(row=>row.id===id(2));assert.ok(proposal);
  assert.equal(proposal.status,'issued');assert.equal(proposal.invoiceNumber,'INV-2');assert.equal(Number(proposal.amount),100);
  assert.deepEqual(proposal.pendingReplacement,{rate:'5.0000',subtotal:'5000.00',tax:'500.00',amount:'5500.00',dueDate:'2026-11-15'});
  await client.query('UPDATE site_account_assignments SET revoked_at=NULL');
  const customerOriginal=await service.list('billing',{id:id(103),role:'customer_user',assignedSiteIds:[id(101)]},{...scope,billingStatusView:'partially_paid'});
  assert.equal(customerOriginal.rows[0]?.id,id(2));assert.equal(customerOriginal.rows[0]?.pendingReplacement,null);assert.equal(Number(customerOriginal.rows[0]?.amount),100);
  // Exercise both real SQL projections over the same nullable persisted row.
  await client.query(`
   CREATE TABLE users(id uuid,display_name text);
   ALTER TABLE documents ADD COLUMN site_id uuid;
   ALTER TABLE payments ADD COLUMN verified_transfer_at timestamptz,
    ADD COLUMN declared_amount numeric, ADD COLUMN declared_transfer_at timestamptz,
    ADD COLUMN note text, ADD COLUMN submitted_by uuid, ADD COLUMN transfer_reference text,
    ADD COLUMN submitted_at timestamptz, ADD COLUMN verified_at timestamptz,
    ADD COLUMN evidence_key text, ADD COLUMN payer_name text, ADD COLUMN payment_method text,
    ADD COLUMN origin_bank text, ADD COLUMN origin_account text;
  `);
  const db={query:(sql:string,params:unknown[])=>client.query(sql,params)} as unknown as DatabaseService;
  const portal=new CustomerPortalService(db,{getSummary:async()=>({production:[]})} as unknown as DashboardService,new SettingsService(db));
  const principal={id:id(103),role:'customer_user',customerId:id(100),assignedSiteIds:[id(101)]};
  for(const [subtotal,tax] of [[null,null],[null,'7.13'],['90.25',null],['0','0'],['12.34','5.67']]) {
   await client.query('UPDATE billing_cycles SET subtotal=$1::numeric,simulated_tax=$2::numeric WHERE id=$3::uuid',[subtotal,tax,id(13)]);
   const home=(await portal.home(principal,'7d')).focusedBill!;
   const detail=(await service.detail('billing',id(13),principal)).row;
   assert.equal(home.id,id(13));
   assert.deepEqual([home.subtotal,home.tax,home.billedAmount],[subtotal,tax,'100']);
   assert.deepEqual([detail.subtotal,detail.simulatedTax,detail.amount],[subtotal,tax,'100']);
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
 const db={query:async(sql:string,params:unknown[])=>{calls++;if(calls===1){assert.ok(sql.includes('si.id=ANY($1::uuid[])'));assert.deepEqual(params,[['00000000-0000-4000-8000-000000000001'],'00000000-0000-4000-8000-000000000002',id]);return {rows:[{id}]};}if(sql.includes("d.document_type='receipt'"))return {rows:[]};assert.ok(sql.includes('billing_cycle_id=$1'));assert.deepEqual(params,[id]);return {rows};}};
 const result=await new OperationsService(db as unknown as DatabaseService).detail('billing',id,{id:'00000000-0000-4000-8000-000000000002',role:'customer_user',customerId:'customer-a',assignedSiteIds:['00000000-0000-4000-8000-000000000001']});assert.deepEqual(result.row.payments,rows);assert.equal(calls,3);
 let deniedCalls=0;const denied=new OperationsService({query:async()=>{deniedCalls++;return {rows:[]};}} as unknown as DatabaseService);await assert.rejects(()=>denied.detail('billing',id,{role:'customer_user',customerId:'customer-b'}));assert.equal(deniedCalls,1);
});
test('customer billing detail returns every issued installment receipt with dates only after scoped access',async()=>{
 const id='00000000-0000-4000-8000-000000000001',userId='00000000-0000-4000-8000-000000000002',siteId='00000000-0000-4000-8000-000000000003';
 const receipts=[{id:'receipt-1',documentNumber:'REC-001',issueDate:'2026-10-03'},{id:'receipt-2',documentNumber:'REC-002',issueDate:'2026-10-06'}];
 const payments=[{id:'one',status:'paid',verifiedAmount:'300.00',submittedAt:'2026-10-02'},{id:'two',status:'paid',verifiedAmount:'200.00',submittedAt:'2026-10-05'},{id:'later',status:'pending_verification',submittedAt:'2026-10-08'}];
 const queries:string[]=[];
 const service=new OperationsService({query:async(sql:string,params:unknown[])=>{
  queries.push(sql);if(queries.length===1){assert.ok(sql.includes('si.id=ANY($1::uuid[])'));assert.deepEqual(params,[[siteId],userId,id]);return {rows:[{id,receiptId:'receipt-2',approvedAmount:'500.00',outstandingAmount:'500.00'}]};}
  if(sql.startsWith('SELECT id,amount'))return {rows:payments};
  assert.match(sql,/d\.document_type='receipt'/);assert.match(sql,/d\.status IN\('issued','finalized'\)/);assert.doesNotMatch(sql,/is_current/);assert.match(sql,/d\.site_id=ANY\(\$2::uuid\[\]\)/);assert.match(sql,/access\.user_id=\$3::uuid/);assert.match(sql,/ORDER BY d\.issue_date NULLS LAST,d\.id/);assert.deepEqual(params,[id,[siteId],userId]);return {rows:receipts};
 }} as unknown as DatabaseService);
 const result=await service.detail('billing',id,{id:userId,role:'customer_user',assignedSiteIds:[siteId]});
 assert.deepEqual(result.row.receipts,receipts);assert.deepEqual(result.row.payments,payments);assert.equal(result.row.receiptId,'receipt-2');assert.equal(result.row.approvedAmount,'500.00');assert.equal(queries.length,3);
});
test('customer receipt history SQL includes older installments and excludes drafts, foreign cycles/sites and revoked assignments', {skip:!process.env.FINANCIAL_READINESS_TEST_DATABASE_URL},async()=>{
 const connectionString=process.env.FINANCIAL_READINESS_TEST_DATABASE_URL!,url=new URL(connectionString);
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15449');assert.equal(url.pathname,'/solar_financial_flow_review');assert.equal(url.search,'');assert.equal(url.hash,'');
 const pool=new Pool({connectionString}),client=await pool.connect(),schema='customer_receipts_'+randomUUID().replaceAll('-','');
 const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 try {
  await client.query('BEGIN');await client.query(`CREATE SCHEMA "${schema}"`);await client.query(`SET LOCAL search_path TO "${schema}"`);
  await client.query(`CREATE TABLE documents(id uuid,site_id uuid,billing_cycle_id uuid,document_type text,document_number text,issue_date date,status text,is_current boolean);CREATE TABLE site_account_assignments(user_id uuid,site_id uuid,revoked_at timestamptz);
  INSERT INTO site_account_assignments VALUES('${id(1)}','${id(2)}',NULL);
  INSERT INTO documents VALUES('${id(10)}','${id(2)}','${id(3)}','receipt','REC-001','2026-10-03','issued',false),('${id(11)}','${id(2)}','${id(3)}','receipt','REC-002','2026-10-06','issued',true),('${id(12)}','${id(2)}','${id(3)}','receipt','DRAFT','2026-10-07','draft',true),('${id(13)}','${id(4)}','${id(3)}','receipt','FOREIGN-SITE','2026-10-07','issued',true),('${id(14)}','${id(2)}','${id(5)}','receipt','FOREIGN-BILL','2026-10-07','issued',true);`);
  const service=new OperationsService({query:async(sql:string,params:unknown[])=>{
   if(sql.startsWith('SELECT q.*'))return {rows:[{id:id(3),receiptId:id(11)}]};
   if(sql.startsWith('SELECT id,amount'))return {rows:[{id:'later',amount:null,status:'pending_verification',submittedAt:'2026-10-08'}]};
   return client.query(sql,params);
  }} as unknown as DatabaseService);
  const user={id:id(1),role:'customer_user',assignedSiteIds:[id(2)]};
  const result=await service.detail('billing',id(3),user);
  assert.deepEqual(result.row.receipts,[{id:id(10),documentNumber:'REC-001',issueDate:'2026-10-03'},{id:id(11),documentNumber:'REC-002',issueDate:'2026-10-06'}]);
  assert.equal(result.row.receiptId,id(11));assert.equal((result.row.payments as Array<{status:string}>)[0]?.status,'pending_verification');
  await client.query('UPDATE site_account_assignments SET revoked_at=now()');assert.deepEqual((await service.detail('billing',id(3),user)).row.receipts,[]);
  assert.equal(Object.hasOwn((await service.detail('billing',id(3),{role:'accountant'})).row,'receipts'),false);
 } finally {await client.query('ROLLBACK');client.release();await pool.end();}
});
test('scoped officer review exposes persisted payer metadata',async()=>{
 const id='00000000-0000-4000-8000-000000000001';let calls=0;
 const db={query:async(sql:string,params:unknown[])=>{calls++;if(calls===1)return {rows:[{id}]};assert.deepEqual(params,[id]);const row:Record<string,unknown>={id:'transfer',amount:'107.00',status:'pending_verification'};for(const [column,alias,value] of [['payer_name','payerName','Payer'],['payment_method','paymentMethod','bank_transfer'],['transfer_channel','transferChannel','promptpay'],['origin_bank','originBank','Origin bank'],['origin_account','originAccount','00123']])if(sql.includes(column+' AS "'+alias+'"'))row[alias!]=value;return {rows:[row]};}};
 const result=await new OperationsService(db as unknown as DatabaseService).detail('billing',id,{role:'accountant'});assert.equal((result.row.payments as any)[0].payerName,'Payer');assert.equal((result.row.payments as any)[0].paymentMethod,'bank_transfer');assert.equal((result.row.payments as any)[0].transferChannel,'promptpay');assert.equal((result.row.payments as any)[0].originBank,'Origin bank');assert.equal((result.row.payments as any)[0].originAccount,'00123');
});

test('owner billing detail includes scoped cash receipts received today without exposing them to customers',async()=>{
 const id='00000000-0000-4000-8000-000000000001',cash={id:'cash-1',amount:'200.00',customerName:'Acme',siteName:'Roof A',billingCycleId:id,receiptId:'receipt-1',receiptNumber:'REC-001',recordedBy:'Officer',receivedAt:'2026-10-19',recordedAt:'2026-10-19T10:30:00+07:00',note:null};
 const queries:string[]=[];
 const ownerDb={query:async(sql:string,params:unknown[])=>{queries.push(sql);if(queries.length===1)return {rows:[{id}]};if(queries.length===2)return {rows:[]};assert.match(sql,/p\.payment_method='cash'/);assert.match(sql,/p\.status='paid'/);assert.match(sql,/now\(\) AT TIME ZONE 'Asia\/Bangkok'/);assert.match(sql,/p\.receipt_document_id/);assert.deepEqual(params,[]);return {rows:[cash]};}};
 const owner=await new OperationsService(ownerDb as unknown as DatabaseService).detail('billing',id,{role:'owner'});
 assert.deepEqual(owner.row.cashPayments,[cash]);assert.equal(queries.length,3);
 const customerDb={query:async(sql:string)=>sql.startsWith('SELECT q.*')?{rows:[{id}]}:{rows:[]}};
 const customer=await new OperationsService(customerDb as unknown as DatabaseService).detail('billing',id,{id:'00000000-0000-4000-8000-000000000002',role:'customer_user',assignedSiteIds:['00000000-0000-4000-8000-000000000003']});
 assert.equal(Object.hasOwn(customer.row,'cashPayments'),false);
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
