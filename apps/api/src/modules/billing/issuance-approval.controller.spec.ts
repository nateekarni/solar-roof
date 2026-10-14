import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants.js';
import { BillingController } from './billing.controller.js';
import { effectiveAuthorization } from '../../common/auth/authorization.js';
import { DatabaseService } from '../../database/database.service.js';
import { FinancialApplicationService } from './financial-application.service.js';
import { FinancialReadinessService } from '../financial-readiness/financial-readiness.service.js';
import { ContractPdfService } from '../documents/contract-pdf.service.js';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { PlatformAccessGuard } from '../../common/auth/platform-access.guard.js';
import { RolesGuard } from '../../common/roles.guard.js';

const first='11111111-1111-4111-8111-111111111111';
const second='22222222-2222-4222-8222-222222222222';
const third='33333333-3333-4333-8333-333333333333';
const missing='44444444-4444-4444-8444-444444444444';
const actorId='55555555-5555-4555-8555-555555555555';
const siteId='66666666-6666-4666-8666-666666666666';
const otherSite='77777777-7777-4777-8777-777777777777';
const actor={id:actorId,role:'operator',authorization:effectiveAuthorization('operator',1,[{domain:'business',preset:{'business.billing.approve':true},overrides:{},scope:{mode:'selected',siteIds:[siteId]}}])};
const unavailable={label:{period:'—',customer:'รายการที่ไม่สามารถเข้าถึงได้',site:'—'},status:'failed',message:'ไม่สามารถออกเอกสารได้'};

// Database/issuance doubles stand at the external boundary. Controller validation,
// scope filtering, orchestration, and display projection all remain real.
function harness(){
 const records=new Map([
  [first,{siteId,label:{period:'2026-09',customer:'บริษัท ก',site:'โรงงาน ก'}}],
  [second,{siteId,label:{period:'2026-08',customer:'บริษัท ข',site:'โรงงาน ข'}}],
  [third,{siteId:otherSite,label:{period:'2026-07',customer:'ลับ',site:'ไซต์ลับ'}}],
 ]);
 const issued=new Map<string,string>([[second,'INV260800001']]);
 const attempts:string[]=[];let failFirst=false;let failLookup=false;
 const db={query:async(sql:string,params:unknown[])=>{
  if(failLookup)throw new Error(`database failure ${first}`);
  assert.match(sql,/s\.id\s*=\s*ANY\(\$2::uuid\[\]\)/i);
  const row=records.get(String(params[0]));const scope=params[1] as string[]|null;
  return {rows:row&&(scope===null||scope.includes(row.siteId))?[{...row.label,id:params[0],siteId:row.siteId}]:[]};
 }};
 const financial={approveInvoice:async(id:string,idOfActor:string)=>{
  assert.equal(idOfActor,actorId);attempts.push(id);
  if(failFirst&&id===first)throw new Error(`SQL secret and internal ${id}`);
  const prior=issued.get(id);
  const number=prior??'INV260900001';issued.set(id,number);
  return {created:!prior,document:{id:'internal-document',documentNumber:number,snapshot:{secret:true}}};
 }};
 const controller=new BillingController(db as unknown as DatabaseService,{} as FinancialReadinessService,financial as unknown as FinancialApplicationService,{} as ContractPdfService);
 return {controller,attempts,issued,setFail:()=>{failFirst=true;},setLookupFail:()=>{failLookup=true;}};
}

test('approval routes register the static batch action before every billing-cycle parameter route',()=>{
 const routes=Object.getOwnPropertyNames(BillingController.prototype).map(name=>({name,path:Reflect.getMetadata(PATH_METADATA,(BillingController.prototype as any)[name]),method:Reflect.getMetadata(METHOD_METADATA,(BillingController.prototype as any)[name])}));
 const batch=routes.findIndex(route=>route.path==='billing-cycles/approve-issuance');
 const single=routes.findIndex(route=>route.path==='billing-cycles/:id/approve-issuance');
 assert.ok(batch>=0);assert.ok(single>batch);
 assert.equal(routes[batch]!.method,1);assert.equal(routes[single]!.method,1);
 for(const [index,route] of routes.entries())if(route.path?.startsWith('billing-cycles/:'))assert.ok(index>batch);
});

test('single approval returns only authorized labels and saved number on issue and replay',async()=>{
 const {controller}=harness();
 const expected={label:{period:'2026-09',customer:'บริษัท ก',site:'โรงงาน ก'},status:'issued',documentNumber:'INV260900001',message:'ออกใบวางบิลแล้ว'};
 assert.deepEqual(await (controller as any).approveIssuance(first,{}, {user:actor}),expected);
 assert.deepEqual(await (controller as any).approveIssuance(first,{}, {user:actor}),{...expected,status:'already_issued',message:'ออกใบวางบิลแล้วก่อนหน้านี้'});
});

test('both controller entry points reject missing actors, role-only staff, and edit-only grants before accessing records',async()=>{
 const editOnly={...actor,authorization:effectiveAuthorization('operator',1,[{domain:'business',preset:{'business.billing.edit':true},overrides:{},scope:{mode:'all',siteIds:[]}}])};
 for(const user of [undefined,{role:'owner'},{id:actorId,role:'accountant'},editOnly]){
  const {controller,attempts}=harness();
  await assert.rejects(()=>(controller as any).approveMany({billingCycleIds:[first]},{user}),ForbiddenException);
  await assert.rejects(()=>(controller as any).approveIssuance(first,{}, {user}),ForbiddenException);
  assert.deepEqual(attempts,[]);
 }
});

test('bulk approval preserves ordered partial success and deduplicates calls',async()=>{
 const {controller,attempts,setFail}=harness();setFail();
 const result=await (controller as any).approveMany({billingCycleIds:[second,first,third,missing,second]},{user:actor});
 assert.deepEqual(result,{results:[
  {label:{period:'2026-08',customer:'บริษัท ข',site:'โรงงาน ข'},status:'already_issued',documentNumber:'INV260800001',message:'ออกใบวางบิลแล้วก่อนหน้านี้'},
  {label:{period:'2026-09',customer:'บริษัท ก',site:'โรงงาน ก'},status:'failed',message:'ไม่สามารถออกเอกสารได้'},unavailable,unavailable,
 ]});
 assert.deepEqual(attempts,[second,first]);
 const serialized=JSON.stringify(result);for(const secret of [first,second,third,missing,'SQL','internal-document','ลับ'])assert.equal(serialized.includes(secret),false);
});

test('a failed item does not prevent a later independent issuance',async()=>{
 const {controller,setFail,issued}=harness();setFail();issued.delete(second);
 const {results}=await (controller as any).approveMany({billingCycleIds:[first,second]},{user:actor});
 assert.deepEqual(results.map((result:any)=>result.status),['failed','issued']);assert.equal(issued.get(second),'INV260900001');
});

test('missing and inaccessible single rows produce identical generic results without issuing',async()=>{
 const {controller,attempts}=harness();
 assert.deepEqual(await (controller as any).approveIssuance(third,{}, {user:actor}),unavailable);
 assert.deepEqual(await (controller as any).approveIssuance(missing,{}, {user:actor}),unavailable);
 assert.deepEqual(attempts,[]);
});

test('an empty business scope hides every row and owner scope permits all sites',async()=>{
 const {controller,attempts}=harness();
 const noSites={...actor,authorization:{...actor.authorization,scopes:{...actor.authorization.scopes,business:{mode:'selected' as const,siteIds:[]}}}};
 assert.deepEqual(await (controller as any).approveIssuance(first,{}, {user:noSites}),unavailable);
 assert.equal((await (controller as any).approveIssuance(third,{}, {user:{id:actorId,role:'owner'}})).status,'issued');
 assert.deepEqual(attempts,[third]);
});

test('malformed single IDs or payload overrides and invalid batches fail before issuance',async()=>{
 const {controller,attempts}=harness();
 for(const body of [{billingCycleIds:[]},{billingCycleIds:Array(101).fill(first)},{billingCycleIds:['not-uuid']},{billingCycleIds:[first],actorId:'spoofed'}])await assert.rejects(()=>(controller as any).approveMany(body,{user:actor}),BadRequestException);
 await assert.rejects(()=>(controller as any).approveIssuance('not-uuid',{}, {user:actor}),BadRequestException);
 await assert.rejects(()=>(controller as any).approveIssuance(first,{actorId:'spoofed'}, {user:actor}),BadRequestException);
 assert.deepEqual(attempts,[]);
});

test('label lookup failures never expose database errors or authorize issuance',async()=>{
 const {controller,attempts,setLookupFail}=harness();setLookupFail();
 assert.deepEqual(await (controller as any).approveMany({billingCycleIds:[first]},{user:actor}),{results:[unavailable]});
 assert.deepEqual(attempts,[]);
});

test('simultaneous batch and single replay retain one saved number per cycle',async()=>{
 const {controller,issued}=harness();
 const [batch,single]=await Promise.all([(controller as any).approveMany({billingCycleIds:[first,second]},{user:actor}),(controller as any).approveIssuance(first,{}, {user:actor})]);
 assert.deepEqual([batch.results[0].status,single.status].sort(),['already_issued','issued']);
 assert.equal(batch.results[0].documentNumber,single.documentNumber);assert.equal(issued.size,2);
});

test('one bulk response includes issued, already issued and failed results in request order',async()=>{
 const {controller}=harness();
 const batch=await controller.approveMany({billingCycleIds:[first,second,third,missing]},{user:actor});
 assert.deepEqual(batch.results.map(result=>result.status),['issued','already_issued','failed','failed']);
 assert.deepEqual(batch.results[2],batch.results[3]);
 assert.equal(batch.results[0]!.documentNumber,'INV260900001');
 assert.equal(batch.results[1]!.documentNumber,'INV260800001');
});

test('registered guard chain permits granted staff and preserves identical inaccessible and missing single results',async()=>{
 const {controller}=harness();
 const outputs=[];
 for(const id of [third,missing]){
  const request={path:`/v1/billing-cycles/${id}/approve-issuance`,method:'POST',body:{},user:actor};
  const context={getHandler:()=>BillingController.prototype.approveIssuance,getClass:()=>BillingController,switchToHttp:()=>({getRequest:()=>request})} as unknown as ExecutionContext;
  const db={query:async()=>{throw new Error('Premature lookup');}} as unknown as DatabaseService;
  assert.equal(new RolesGuard(new Reflector()).canActivate(context),true);
  assert.equal(await new PlatformAccessGuard(db,new Reflector()).canActivate(context),true);
  outputs.push(await controller.approveIssuance(id,{}, {user:actor}));
 }
 assert.deepEqual(outputs,[unavailable,unavailable]);
});
