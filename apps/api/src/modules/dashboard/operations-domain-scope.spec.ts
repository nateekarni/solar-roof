import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { OperationsService } from './operations.service.js';
import type { DatabaseService } from '../../database/database.service.js';
import { effectiveAuthorization } from '../../common/auth/authorization.js';
const site='00000000-0000-4000-8000-000000000001';
test('business site scopes bind before page and aggregate; site projection omits telemetry',async()=>{
 const authorization=effectiveAuthorization('operator',1,[{domain:'business',preset:{'business.sites.view':true},overrides:{},scope:{mode:'selected',siteIds:[site]}}]);
 const queries:string[]=[];
 const db={query:async(sql:string,params:unknown[])=>{queries.push(sql);assert.ok(sql.includes('si.id=ANY($1::uuid[])'));assert.deepEqual(params[0],[site]);assert.equal(sql.includes('telemetry_raw'),false);assert.equal(sql.includes('AS "lastSeenAt"'),false);assert.ok(sql.includes('END AS status'));return {rows:sql.startsWith('SELECT count')?[{count:0,active:0,capacity:0}]:[]};}} as unknown as DatabaseService;
 const service=new OperationsService(db);
 await service.list('sites',{role:'operator',authorization});await service.summary('sites',{role:'operator',authorization});assert.equal(queries.length,2);
});
test('documents bind domain site scope for direct artifact lookup',async()=>{
 const authorization=effectiveAuthorization('accountant',0,[{domain:'business',preset:{'business.documents.view':true},overrides:{},scope:{mode:'selected',siteIds:[site]}}]);
 const db={query:async(sql:string,params:unknown[])=>{assert.ok(sql.includes('si.id=ANY($2::uuid[])'));assert.deepEqual(params[1],[site]);return {rows:[]};}} as unknown as DatabaseService;
 await assert.rejects(()=>new OperationsService(db).document(site,{role:'accountant',authorization}),/not found/);
});
