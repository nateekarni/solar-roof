import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard as LegacyGuard } from '../roles.guard.js';
import { RolesGuard, RequireRoles } from './roles.guard.js';
import { Roles } from '../roles.decorator.js';
function context(handler:()=>void, role:string):ExecutionContext {
 return {getHandler:()=>handler,getClass:()=>class {},switchToHttp:()=>({getRequest:()=>({user:{role}})})} as unknown as ExecutionContext;
}
test('admin can invoke actions protected by either legacy role decorator',()=>{
 const handler=()=>{};
 Roles('owner','accountant')({},'handler',{value:handler});
 RequireRoles('owner','accountant')({},'handler',{value:handler});
 assert.equal(new LegacyGuard(new Reflector()).canActivate(context(handler,'admin')),true);
 assert.equal(new RolesGuard().canActivate(context(handler,'admin')),true);
 assert.throws(()=>new RolesGuard().canActivate(context(handler,'school_user')),/Insufficient role/);
});
