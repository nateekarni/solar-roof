import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { CustomerPortalBill } from '@solar/api-contracts';
import type { DatabaseService } from '../../database/database.service.js';
import type { DashboardService } from '../dashboard/dashboard.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { CustomerPortalService, parseCustomerPortalRange } from './customer-portal.service.js';

const siteId='11111111-1111-4111-8111-111111111111';
const user={id:'22222222-2222-4222-8222-222222222222',role:'customer_user',customerId:'33333333-3333-4333-8333-333333333333',assignedSiteIds:[siteId]};
function bill(id: string, recentRank: number, status: CustomerPortalBill['status']='paid'): Omit<CustomerPortalBill,'canPay'> & {recentRank:number;gatewayId:string;devices:string[]} {
 return {id,siteId,period:'2026-09',periodStart:'2026-09-01',periodEnd:'2026-09-30',dueDate:'2026-10-20',invoiceId:'invoice',invoiceNumber:'INV',status,consumedKwh:'20.25',rate:'5.00',subtotal:'100.00',tax:'7.00',billedAmount:'107.00',approvedAmount:status==='paid'?'107.00':'40.00',outstandingAmount:status==='paid'?'0.00':'67.00',pendingEvidenceCount:0,rejectedEvidenceCount:1,recentRank,gatewayId:'secret',devices:['secret']};
}
function fixture(rows: ReturnType<typeof bill>[] = [], assigned=true) {
 const queries:{sql:string;values:unknown[]}[]=[];
 const summaries:{principal:unknown;start:string;end:string;site:unknown}[]=[];
 const db={query:async(sql:string,values:unknown[]=[])=>{
  queries.push({sql,values});
  return {rows:sql.includes('FROM sites s JOIN customers')?(assigned?[{id:siteId,name:'Site A',customerName:'Customer A',gatewayId:'secret'}]:[]):rows};
 }};
 const dashboard={getSummary:async(principal:unknown,start:string,end:string,site:unknown)=>{
  summaries.push({principal,start,end,site});
  return {production:[{date:'2026-10-18',value:null,quality:'missing',gatewayId:'secret'}],sites:[{id:siteId,gatewayId:'secret'}]};
 }};
 return {service:new CustomerPortalService(db as unknown as DatabaseService,dashboard as unknown as DashboardService,new SettingsService(db as unknown as DatabaseService)),queries,summaries};
}

test('range parser defaults only missing input and rejects unsupported values',()=>{
 assert.equal(parseCustomerPortalRange(undefined),'7d');
 assert.equal(parseCustomerPortalRange('7d'),'7d');assert.equal(parseCustomerPortalRange('30d'),'30d');
 for(const value of ['1d','90d','','7D',['7d'],null])assert.throws(()=>parseCustomerPortalRange(value),/Invalid range/);
});
test('home rejects missing and noncustomer principals before reading data',async()=>{
 const {service,queries,summaries}=fixture();
 for(const principal of [undefined,{role:'owner'},{role:'customer_user',customerId:user.customerId,assignedSiteIds:[siteId]}])await assert.rejects(service.home(principal,'7d'),/Customer portal access denied/);
 assert.equal(queries.length,0);assert.equal(summaries.length,0);
});
test('missing, multiple and revoked assignments return no site, bills or dashboard data',async()=>{
 for(const principal of [{...user,assignedSiteIds:[]},{...user,assignedSiteIds:[siteId,'other']},{id:user.id,role:user.role,assignedSiteIds:[siteId]},user]){
  const {service,queries,summaries}=fixture([bill('hidden',1)],false);
  assert.deepEqual(await service.home(principal,'7d'),{range:'7d',site:null,focusedBill:null,additionalOpenBillCount:0,energySeries:[],recentFinancialRecords:[],capabilities:{canPay:false,canViewDocuments:false}});
  assert.equal(summaries.length,0);assert.ok(!queries.some(query=>query.sql.includes('FROM billing_cycles')));
 }
});
test('home binds server site, user and customer and projects only public fields',async()=>{
 const {service,queries,summaries}=fixture([bill('old-open',5,'partially_paid'),bill('recent3',3),bill('recent1',1),bill('recent2',2),bill('other-open',4,'awaiting_payment')]);
 const result=await service.home(user,'7d');
 assert.deepEqual(result.site,{id:siteId,name:'Site A',customerName:'Customer A'});
 assert.equal(result.focusedBill?.id,'old-open');assert.equal(result.focusedBill?.outstandingAmount,'67.00');
 assert.equal(result.focusedBill?.canPay,true);assert.equal(result.additionalOpenBillCount,1);
 assert.deepEqual(result.recentFinancialRecords.map(row=>row.id),['recent1','recent2','recent3']);
 assert.deepEqual(result.energySeries,[{date:'2026-10-18',value:null,quality:'missing'}]);
 assert.deepEqual(result.capabilities,{canPay:true,canViewDocuments:true});
 assert.ok(!/gateway|device|recentRank/i.test(JSON.stringify(result)));
 assert.equal(queries.filter(query=>query.sql.includes('FROM billing_cycles')).length,1);
 for(const query of queries){
  assert.deepEqual(query.values,[siteId,user.id,user.customerId]);
  assert.match(query.sql,/site_account_assignments/);assert.match(query.sql,/revoked_at IS NULL/);
 }
 assert.equal(summaries[0]?.site,siteId);assert.equal(summaries[0]?.principal,user);
 assert.equal((Date.parse(summaries[0]!.end)-Date.parse(summaries[0]!.start))/86400000,6);
});
test('30d uses Bangkok inclusive range and paid-only home is up to date',async()=>{
 const {service,summaries}=fixture([bill('paid',1)]);
 const result=await service.home(user,'30d');
 assert.equal((Date.parse(summaries[0]!.end)-Date.parse(summaries[0]!.start))/86400000,29);
 assert.equal(summaries[0]!.end,new Date(Date.now()+7*3600000).toISOString().slice(0,10));
 assert.equal(result.focusedBill,null);assert.equal(result.additionalOpenBillCount,0);assert.equal(result.capabilities.canPay,false);
});
test('pending verification stays visible without enabling another transfer',async()=>{
 const {service}=fixture([{...bill('review',1,'pending_verification'),pendingEvidenceCount:1}]);
 const result=await service.home(user,'7d');
 assert.equal(result.focusedBill?.id,'review');assert.equal(result.focusedBill?.canPay,false);assert.equal(result.capabilities.canPay,false);
});
test('public home mapping retains nullable persisted breakdown in focused and recent bills',async()=>{
 const {service}=fixture([{...bill('legacy',1,'awaiting_payment'),subtotal:null,tax:null,billedAmount:'107.13'}]);
 const result=JSON.parse(JSON.stringify(await service.home(user,'7d')));
 for(const projected of [result.focusedBill,result.recentFinancialRecords[0]]) {
  assert.deepEqual([projected.subtotal,projected.tax,projected.billedAmount],[null,null,'107.13']);
 }
});

test('home billing projection executes with scoped lifecycle and exact decimal arithmetic', {skip:!process.env.FINANCIAL_READINESS_TEST_DATABASE_URL}, async()=>{
 const connectionString=process.env.FINANCIAL_READINESS_TEST_DATABASE_URL!;
 const url=new URL(connectionString);
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15449');assert.equal(url.pathname,'/solar_financial_flow_review');assert.equal(url.search,'');assert.equal(url.hash,'');
 const pool=new Pool({connectionString});const client=await pool.connect();
 const schema='customer_home_'+randomUUID().replaceAll('-','');
 const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 try {
  await client.query('BEGIN');await client.query(`CREATE SCHEMA "${schema}"`);await client.query(`SET LOCAL search_path TO "${schema}"`);
  await client.query(`
   CREATE TABLE customers(id uuid PRIMARY KEY,name text);
   CREATE TABLE sites(id uuid PRIMARY KEY,customer_id uuid,name text);
   CREATE TABLE site_account_assignments(user_id uuid,site_id uuid,revoked_at timestamptz);
   CREATE TABLE billing_cycles(id uuid PRIMARY KEY,site_id uuid,period_start date,period_end date,due_date date,consumed_kwh numeric,rate numeric,subtotal numeric,simulated_tax numeric,amount numeric,status text);
   CREATE TABLE payments(billing_cycle_id uuid,amount numeric,verified_amount numeric,status text);
   CREATE TABLE documents(id uuid PRIMARY KEY,billing_cycle_id uuid,document_type text,is_current boolean,status text,revision int,document_number text);
   INSERT INTO customers VALUES('${user.customerId}','Customer A');
   INSERT INTO sites VALUES('${siteId}','${user.customerId}','Site A'),('${id(100)}','${user.customerId}','Other site');
   INSERT INTO site_account_assignments VALUES('${user.id}','${siteId}',NULL);
   INSERT INTO billing_cycles
   SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
    CASE WHEN n=9 THEN '${id(100)}'::uuid ELSE '${siteId}'::uuid END,
    '2026-01-01'::date+make_interval(months=>n-1),'2026-01-28'::date+make_interval(months=>n-1),
    (now() AT TIME ZONE 'Asia/Bangkok')::date+CASE WHEN n IN(1,2,3,4) THEN -n ELSE 10 END,
    20.25,5.00,100.00,7.00,107.00,
    CASE WHEN n=6 THEN 'draft' WHEN n=7 THEN 'cancelled' WHEN n=8 THEN 'superseded' WHEN n=10 THEN 'pending_issue_approval' ELSE 'approved' END
   FROM generate_series(1,12) n;
   INSERT INTO documents SELECT gen_random_uuid(),id,'invoice',true,'issued',1,'INV' FROM billing_cycles WHERE id<>'${id(11)}';
   UPDATE documents SET is_current=false WHERE billing_cycle_id='${id(12)}';
   INSERT INTO payments VALUES('${id(2)}',20,40,'paid'),('${id(3)}',107,NULL,'pending_verification'),('${id(3)}',20,10,'paid'),('${id(4)}',107,NULL,'paid'),('${id(1)}',107,NULL,'rejected');
   UPDATE billing_cycles SET subtotal=NULL,simulated_tax=NULL WHERE id='${id(5)}';
  `);
  const {summaries}=fixture();
  const dashboard={getSummary:async(principal:unknown,start:string,end:string,site:unknown)=>{summaries.push({principal,start,end,site});return {production:[]};}};
  const db = {query:(sql:string,values:unknown[])=>client.query(sql,values)} as unknown as DatabaseService;
  const service=new CustomerPortalService(db,dashboard as unknown as DashboardService,new SettingsService(db));
  const result=await service.home(user,'7d');
  assert.equal(result.focusedBill?.id,id(1));assert.equal(result.focusedBill?.status,'overdue');assert.equal(result.focusedBill?.rejectedEvidenceCount,1);
  assert.equal(result.additionalOpenBillCount,3);
  assert.deepEqual(result.recentFinancialRecords.map(row=>row.id),[id(5),id(4),id(3)]);
  assert.equal(result.recentFinancialRecords[0]?.subtotal,null);
  assert.equal(result.recentFinancialRecords[0]?.tax,null);
  assert.equal(result.recentFinancialRecords[0]?.billedAmount,'107.00');
  assert.equal(result.recentFinancialRecords[1]?.status,'paid');assert.equal(result.recentFinancialRecords[1]?.outstandingAmount,'0.00');
  assert.equal(result.recentFinancialRecords[2]?.status,'pending_verification');assert.equal(result.recentFinancialRecords[2]?.approvedAmount,'10');assert.equal(result.recentFinancialRecords[2]?.outstandingAmount,'97.00');
  // Once the oldest overdue is settled, the partial cycle wins ahead of the upcoming cycle.
  await client.query(`INSERT INTO payments VALUES('${id(1)}',107,NULL,'paid')`);
  const partial=await service.home(user,'7d');
  assert.equal(partial.focusedBill?.id,id(2));assert.equal(partial.focusedBill?.approvedAmount,'40');assert.equal(partial.focusedBill?.outstandingAmount,'67.00');
  assert.equal(partial.focusedBill?.billedAmount,'107.00');assert.equal(partial.focusedBill?.subtotal,'100.00');assert.equal(partial.focusedBill?.tax,'7.00');
  await client.query('UPDATE site_account_assignments SET revoked_at=now()');
  const revoked=await service.home(user,'7d');assert.equal(revoked.site,null);assert.deepEqual(revoked.recentFinancialRecords,[]);assert.equal(summaries.length,2);
 } finally {await client.query('ROLLBACK');client.release();await pool.end();}
});
