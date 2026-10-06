import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformAccessGuard } from './platform-access.guard.js';
import type { DatabaseService } from '../../database/database.service.js';
function fixture(role:string,schoolId?:string){
 const request={path:'/v1/billing-cycles/bill/pay',method:'POST',body:{},user:{role,schoolId}};
 const db={query:async()=>({rows:[{school_id:'school-b'}]})};
 const context={getHandler:()=>()=>{},getClass:()=>class {},switchToHttp:()=>({getRequest:()=>request})} as unknown as ExecutionContext;
 return {guard:new PlatformAccessGuard(db as unknown as DatabaseService,new Reflector()),context,request};
}
test('payment evidence and direct document URLs enforce school ownership',async()=>{
 const own=fixture('school_user','school-b');assert.equal(await own.guard.canActivate(own.context),true);
 const other=fixture('school_user','school-a');await assert.rejects(other.guard.canActivate(other.context),/outside assigned school/);
 other.request.path='/v1/documents/document-b';other.request.method='GET';await assert.rejects(other.guard.canActivate(other.context),/outside assigned school/);
 const unassigned=fixture('school_user');await assert.rejects(unassigned.guard.canActivate(unassigned.context),/outside assigned school/);
 const admin=fixture('admin','school-a');assert.equal(await admin.guard.canActivate(admin.context),true);
});
