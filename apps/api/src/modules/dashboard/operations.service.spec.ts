import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { OperationsService } from "./operations.service.js";
import type { DatabaseService } from "../../database/database.service.js";
test("unassigned school user receives no operations data", async () => {
  let called=false;
  const db={query:async()=>{called=true;return {rows:[{id:"other-school"}]};}};
  const service=new OperationsService(db as unknown as DatabaseService);
  assert.deepEqual((await service.list("sites",{role:"school_user"})).rows,[]);
  assert.equal(called,false);
});
test("site list binds scope and removes generated gateway values", async () => {
  const db={query:async(sql:string,params:unknown[])=>{
    assert.ok(sql.includes("$1"));
    assert.deepEqual(params,[["school-a"],26]);
    assert.equal(sql.includes("GW-01"),false);
    return {rows:[]};
  }};
  assert.deepEqual((await new OperationsService(db as unknown as DatabaseService).list("sites",{role:"school_user",schoolId:"school-a"})).rows,[]);
});
test("report catalogue is empty when no persisted reports exist", async () => {
  const db={query:async()=>({rows:[]})};
  assert.deepEqual((await new OperationsService(db as unknown as DatabaseService).list("reports",{id:"u",role:"owner"})).rows,[]);
});

test("record detail binds ID and retains school scope", async () => {
 const id="00000000-0000-4000-8000-000000000001";
 const db={query:async(sql:string,params:unknown[])=>{assert.ok(sql.includes('s.id=ANY($1::uuid[])'));assert.ok(sql.includes('q.id=$2::uuid'));assert.deepEqual(params,[["school-a"],id]);return {rows:[{id,name:"Site A"}]};}};
 const result=await new OperationsService(db as unknown as DatabaseService).detail("sites",id,{role:"school_user",schoolId:"school-a"});
 assert.equal(result.row.id,id);
});
test("record detail rejects missing records and admin-only resources", async () => {
 const service=new OperationsService({query:async()=>({rows:[]})} as unknown as DatabaseService);
 await assert.rejects(()=>service.detail("sites","invalid",{role:"admin"}));
 await assert.rejects(()=>service.detail("sites","00000000-0000-4000-8000-000000000001",{role:"school_user"}));
 await assert.rejects(()=>service.detail("users","00000000-0000-4000-8000-000000000001",{role:"school_user"}));
});

test('billing history is read only after scoped cycle lookup succeeds',async()=>{
 const id='00000000-0000-4000-8000-000000000001';let calls=0;
 const rows=[{id:'payment-a',amount:'2000.00000000',status:'pending_verification',transferDate:'2026-10-08T01:00:00Z'},{id:'payment-b',amount:'2623.45000000',status:'pending_verification'}];
 const db={query:async(sql:string,params:unknown[])=>{calls++;if(calls===1){assert.ok(sql.includes('s.id=ANY($1::uuid[])'));assert.deepEqual(params,[['school-a'],id]);return {rows:[{id}]};}assert.ok(sql.includes('billing_cycle_id=$1'));assert.deepEqual(params,[id]);return {rows};}};
 const result=await new OperationsService(db as unknown as DatabaseService).detail('billing',id,{role:'school_user',schoolId:'school-a'});assert.deepEqual(result.row.payments,rows);assert.equal(calls,2);
 let deniedCalls=0;const denied=new OperationsService({query:async()=>{deniedCalls++;return {rows:[]};}} as unknown as DatabaseService);await assert.rejects(()=>denied.detail('billing',id,{role:'school_user',schoolId:'school-b'}));assert.equal(deniedCalls,1);
});
test('scoped officer review exposes persisted payer metadata',async()=>{
 const id='00000000-0000-4000-8000-000000000001';let calls=0;
 const db={query:async(sql:string,params:unknown[])=>{calls++;if(calls===1)return {rows:[{id}]};assert.deepEqual(params,[id]);const row:Record<string,unknown>={id:'transfer',amount:'107.00',status:'pending_verification'};for(const [column,alias,value] of [['payer_name','payerName','Payer'],['payment_method','paymentMethod','bank_transfer'],['origin_bank','originBank','Origin bank'],['origin_account','originAccount','00123']])if(sql.includes(column+' AS "'+alias+'"'))row[alias!]=value;return {rows:[row]};}};
 const result=await new OperationsService(db as unknown as DatabaseService).detail('billing',id,{role:'accountant'});assert.equal((result.row.payments as any)[0].payerName,'Payer');assert.equal((result.row.payments as any)[0].paymentMethod,'bank_transfer');assert.equal((result.row.payments as any)[0].originBank,'Origin bank');assert.equal((result.row.payments as any)[0].originAccount,'00123');
});
