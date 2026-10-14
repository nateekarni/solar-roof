import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformAccessGuard } from './platform-access.guard.js';
import type { DatabaseService } from '../../database/database.service.js';
import { effectiveAuthorization } from './authorization.js';
function fixture(role:string,customerId?:string){
 const request={path:'/v1/billing-cycles/bill/pay',method:'POST',body:{},user:{role,customerId,assignedSiteIds:customerId?["site-b"]:[]}};
 const db={query:async()=>({rows:[{customer_id:'customer-b',site_id:'site-b'}]})};
 const context={getHandler:()=>()=>{},getClass:()=>class {},switchToHttp:()=>({getRequest:()=>request})} as unknown as ExecutionContext;
 return {guard:new PlatformAccessGuard(db as unknown as DatabaseService,new Reflector()),context,request};
}
test('payment evidence and direct document URLs enforce customer ownership',async()=>{
 const own=fixture('customer_user','customer-b');assert.equal(await own.guard.canActivate(own.context),true);
 const other=fixture('customer_user','customer-a');await assert.rejects(other.guard.canActivate(other.context),/outside assigned/);
 other.request.path='/v1/documents/document-b';other.request.method='GET';await assert.rejects(other.guard.canActivate(other.context),/outside assigned/);
 const unassigned=fixture('customer_user');await assert.rejects(unassigned.guard.canActivate(unassigned.context),/outside assigned/);
 const admin=fixture('admin','customer-a');await assert.rejects(admin.guard.canActivate(admin.context),/not permitted/);
});

test('same customer membership cannot cross site or retain revoked access',async()=>{
 const scoped=fixture('customer_user','customer-b');scoped.request.user.assignedSiteIds=['site-a'];await assert.rejects(scoped.guard.canActivate(scoped.context),/outside assigned site/);
 scoped.request.user.assignedSiteIds=[];await assert.rejects(scoped.guard.canActivate(scoped.context),/outside assigned site/);
});


test('Owner site creation rejects hardware configuration before any database write',async()=>{
 const own=fixture('owner');own.request.path='/v1/sites';own.request.body={gatewayName:'gateway'};await assert.rejects(own.guard.canActivate(own.context),/technical site fields/);
 own.request.path='/v1/sites/site';own.request.method='PATCH';own.request.body={endpoint:'mqtt://host'};await assert.rejects(own.guard.canActivate(own.context),/technical site fields/);
});

test('exact POST issuance actions defer resource checks until the scoped controller result',async()=>{
 const authorization=effectiveAuthorization('operator',1,[{domain:'business',preset:{'business.billing.approve':true},overrides:{},scope:{mode:'selected',siteIds:['assigned-site']}}]);
 for(const path of ['/v1/billing-cycles/approve-issuance','/v1/billing-cycles/missing/approve-issuance','/v1/billing-cycles/inaccessible/approve-issuance']){
  const request={path,method:'POST',body:{},user:{id:'actor',role:'operator',authorization}};
  const db={query:async()=>{throw new Error('Premature lookup exposes a resource oracle');}} as unknown as DatabaseService;
  const context={getHandler:()=>()=>{},getClass:()=>class {},switchToHttp:()=>({getRequest:()=>request})} as unknown as ExecutionContext;
  assert.equal(await new PlatformAccessGuard(db,new Reflector()).canActivate(context),true);
 }
});

test('issuance guard delegation still denies absent, role-only and edit-only actors',async()=>{
 const editing=effectiveAuthorization('operator',1,[{domain:'business',preset:{'business.billing.edit':true},overrides:{},scope:{mode:'all',siteIds:[]}}]);
 for(const user of [undefined,{id:'actor',role:'accountant'},{id:'actor',role:'operator',authorization:editing}])for(const path of ['/v1/billing-cycles/approve-issuance','/v1/billing-cycles/id/approve-issuance']){
  const request={path,method:'POST',body:{},user};
  const context={getHandler:()=>()=>{},getClass:()=>class {},switchToHttp:()=>({getRequest:()=>request})} as unknown as ExecutionContext;
  const db={query:async()=>{throw new Error('Permission denied before lookup');}} as unknown as DatabaseService;
  await assert.rejects(new PlatformAccessGuard(db,new Reflector()).canActivate(context),/not permitted/);
 }
});

test('neighbor routes and non-POST issuance paths retain ordinary resource scope enforcement',async()=>{
 for(const [method,path] of [['GET','/v1/billing-cycles/approve-issuance'],['PATCH','/v1/billing-cycles/id/approve-issuance'],['POST','/v1/billing-cycles/id/approve-issuance/extra'],['POST','/v1/billing-cycles/id/send-email']]){
  const request={path,method,body:{},user:{id:'actor',role:'owner'}};
  const db={query:async()=>({rows:[]})} as unknown as DatabaseService;
  const context={getHandler:()=>()=>{},getClass:()=>class {},switchToHttp:()=>({getRequest:()=>request})} as unknown as ExecutionContext;
  await assert.rejects(new PlatformAccessGuard(db,new Reflector()).canActivate(context),/Resource not found/);
 }
});
