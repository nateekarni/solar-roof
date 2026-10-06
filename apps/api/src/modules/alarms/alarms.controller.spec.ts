import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {AlarmsController} from "./alarms.controller.js";
import type {DatabaseService} from "../../database/database.service.js";
test("acknowledging a detail affects only its scoped alert",async()=>{
 const id="00000000-0000-4000-8000-000000000001";
 const controller=new AlarmsController({query:async(sql:string,values:unknown[])=>{assert.ok(sql.includes('a.id=$1::uuid'));assert.ok(sql.includes('s.school_id=ANY($2::uuid[])'));assert.deepEqual(values,[id,['school-a']]);return {rows:[{id}]};}} as unknown as DatabaseService);
 assert.deepEqual(await controller.acknowledge(id,{user:{role:'operator',schoolId:'school-a'}}),{success:true});
});
test("acknowledging missing or malformed alerts fails",async()=>{
 const controller=new AlarmsController({query:async()=>({rows:[]})} as unknown as DatabaseService);
 await assert.rejects(()=>controller.acknowledge('invalid',{user:{role:'admin'}}));
 await assert.rejects(()=>controller.acknowledge('00000000-0000-4000-8000-000000000001',{user:{role:'school_user'}}));
});
