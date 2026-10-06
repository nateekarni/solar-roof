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
