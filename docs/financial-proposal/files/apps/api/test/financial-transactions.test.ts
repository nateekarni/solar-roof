import test from 'node:test';
import assert from 'node:assert/strict';
import { inFinancialTransaction } from '../src/modules/billing/financial-persistence.js';
import { BillingController } from '../src/modules/billing/billing.controller.js';
import type { DatabaseService } from '../src/database/database.service.js';

// Driver boundary test: PostgreSQL itself is not simulated or claimed tested here.
// Detects a swallowed callback/commit failure or a transaction callback accidentally
// using the pool outside the acquired connection.
test('receipt/audit failure propagates and rolls back the acquired connection', async () => {
 const commands:string[]=[];
 let released=false;
 const client={query:async(sql:string)=>{commands.push(sql);return {rows:[]};},release:()=>{released=true;}};
 const db={pool:{connect:async()=>client}} as unknown as DatabaseService;
 await assert.rejects(inFinancialTransaction(db,async connection=>{
  assert.equal(connection,client);
  throw new Error('audit insert failed');
 }),/audit insert failed/);
 assert.deepEqual(commands,['BEGIN','ROLLBACK']);
 assert.equal(released,true);
});
test('commit failure cannot return a successful payment result', async()=>{
 let released=false;
 const commands:string[]=[];
 const client={query:async(sql:string)=>{commands.push(sql);if(sql==='COMMIT')throw new Error('connection lost');return {rows:[]};},release:()=>{released=true;}};
 const db={pool:{connect:async()=>client}} as unknown as DatabaseService;
 await assert.rejects(inFinancialTransaction(db,async()=>({success:true})),/connection lost/);
 assert.deepEqual(commands,['BEGIN','COMMIT','ROLLBACK']);
 assert.equal(released,true);
});
test('contract collection binds school ownership and never supplies a caller-selected scope',async()=>{
 let actualParams:unknown;
 let actualSql='';
 const db={query:async(sql:string,params:unknown)=>{actualSql=sql;actualParams=params;return {rows:[]};}} as unknown as DatabaseService;
 const controller=new BillingController(db);
 await controller.listContracts({user:{role:'school_user',schoolId:'school-a'},query:{schoolId:'school-b'}} as never);
 assert.deepEqual(actualParams,[['school-a']]);
 assert.match(actualSql,/s\.id=ANY\(\$1::uuid\[\]\)/);
});
