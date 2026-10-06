import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { OperationsController } from "./operations.controller.js";
import { OperationsService } from "./operations.service.js";
import { operationPredicate, parseOperationQuery } from "./operation-query.js";
import type { Response } from "express";

test("export includes every cursor page and preserves date filters and principal", async () => {
  const calls: Record<string, unknown>[] = [];
  const user = {role:"admin",id:"export-user"};
  const service = Object.create(OperationsService.prototype);
  service.list = async (_resource: string, principal: unknown, query: Record<string, unknown>) => {
    assert.equal(principal, user);
    calls.push(query);
    const offset = Number(query.cursor ?? 0);
    const count = offset < 200 ? 100 : 5;
    return {columns:["name"],rows:Array.from({length:count},(_,i)=>({id:String(offset+i),name:`row-${offset+i}`})),page:{hasMore:offset<200,nextCursor:offset<200?String(offset+100):null}};
  };
  const headers = new Map(); let output="";
  const response = {setHeader:(name:string,value:string)=>headers.set(name,value),send:(body:string)=>{output=body;}};
  await new OperationsController(service).exportCsv("sites",response as unknown as Response,{user,query:{from:"2026-10-01",to:"2026-10-06",search:"solar",cursor:"discard-me"}});
  assert.equal(calls.length,3);
  for (const query of calls) {assert.equal(query.from,"2026-10-01");assert.equal(query.to,"2026-10-06");assert.equal(query.search,"solar");assert.equal(query.limit,"100");}
  assert.equal(output.split("\r\n").length,206);
  assert.ok(output.includes('"row-204"'));
  assert.equal(headers.get("X-Export-Truncated"),"false");
});

test("date filters work for all catalogues and use Bangkok calendar days for timestamps", () => {
  for (const resource of ["sites","schools","users"]) {
    const query=parseOperationQuery(resource,{from:"2026-10-01",to:"2026-10-06"});
    const params:unknown[]=[];
    assert.ok(operationPredicate(resource,query,params).join(" ").includes('q."createdAt"'));
    assert.deepEqual(params,["2026-10-01","2026-10-07"]);
  }
  const params:unknown[]=[];
  assert.ok(operationPredicate("alerts",parseOperationQuery("alerts",{from:"2026-10-06",to:"2026-10-06"}),params).join(" ").includes("AT TIME ZONE 'Asia/Bangkok'"));
  assert.deepEqual(params,["2026-10-06","2026-10-07"]);
  assert.throws(()=>parseOperationQuery("sites",{from:"2026-10-07",to:"2026-10-06"}));
});
