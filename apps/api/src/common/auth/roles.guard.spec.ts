import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard as LegacyGuard } from '../roles.guard.js';
import { RolesGuard, RequireRoles } from './roles.guard.js';
import { Roles } from '../roles.decorator.js';
import { effectiveAuthorization } from './authorization.js';
function context(handler:()=>void, role:string):ExecutionContext {
 return {getHandler:()=>handler,getClass:()=>class {},switchToHttp:()=>({getRequest:()=>({user:{role}})})} as unknown as ExecutionContext;
}
test('admin cannot invoke business actions protected by either legacy role decorator',()=>{
 const handler=()=>{};
 Roles('owner','accountant')({},'handler',{value:handler});
 RequireRoles('owner','accountant')({},'handler',{value:handler});
 assert.throws(()=>new LegacyGuard(new Reflector()).canActivate(context(handler,'admin')),/Access denied/);
 assert.throws(()=>new RolesGuard().canActivate(context(handler,'admin')),/Insufficient role/);
 assert.throws(()=>new RolesGuard().canActivate(context(handler,'customer_user')),/Insufficient role/);
});
test('employee action grants authorize across legacy job-title decorators',()=>{
 const handler=()=>{};Roles('owner','accountant')({},'handler',{value:handler});RequireRoles('owner','accountant')({},'handler',{value:handler});
 const authorization=effectiveAuthorization('operator',0,[{domain:'business',preset:{'business.billing.edit':true},overrides:{},scope:{mode:'all',siteIds:[]}}]);
 const ctx={getHandler:()=>handler,getClass:()=>class {},switchToHttp:()=>({getRequest:()=>({user:{role:'operator',authorization},method:'POST',path:'/v1/billing-cycles'})})} as unknown as ExecutionContext;
 assert.equal(new LegacyGuard(new Reflector()).canActivate(ctx),true);assert.equal(new RolesGuard().canActivate(ctx),true);
});
