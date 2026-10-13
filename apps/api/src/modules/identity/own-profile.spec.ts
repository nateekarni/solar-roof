import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import {MeController} from './me.controller.js';
import {routeAllowed} from '../../common/auth/route-policy.js';
import type {DatabaseService} from '../../database/database.service.js';
test('every current role can read and update only its own display name',async()=>{
 for(const role of ['owner','admin','operator','accountant','customer_user']){
  const calls:Array<{sql:string;params:unknown[]}>=[];
  const db={query:async(sql:string,params:unknown[])=>{calls.push({sql,params});return {rows:[{displayName:'New name'}]};}} as unknown as DatabaseService;
  const controller=new MeController(db),req={user:{id:'current',role}};
  assert.equal(routeAllowed(role,'GET','/v1/me/profile'),true);assert.equal(routeAllowed(role,'PUT','/v1/me/profile'),true);
  assert.deepEqual(await controller.getProfile(req as never),{displayName:'New name'});
  assert.deepEqual(await controller.updateProfile(req as never,{displayName:'  New name  '}),{displayName:'New name'});
  assert.deepEqual(calls[0]?.params,['current']);assert.deepEqual(calls[1]?.params,['New name','current']);
  await assert.rejects(()=>controller.updateProfile(req as never,{displayName:'Other',id:'other'}),/Invalid profile/);
  await assert.rejects(()=>controller.updateProfile(req as never,{displayName:' '.repeat(10)}),/Invalid display name/);
  await assert.rejects(()=>controller.updateProfile(req as never,{displayName:'x'.repeat(121)}),/Invalid display name/);
 }
});
test('preference changes reject unknown fields and unsupported language/theme before touching storage',async()=>{
 let writes=0;
 const controller=new MeController({query:async()=>{writes++;return {rows:[{}]};}} as unknown as DatabaseService);
 for(const body of [{preferredLanguage:'xx'},{preferredTheme:'purple'},{preferredLanguage:'en',id:'someone'},{role:'admin'},null,[]]){
  await assert.rejects(()=>controller.updatePreferences({user:{id:'current'}} as never,body as never,{cookie(){}} as never),/Invalid preferences/);
 }
 assert.equal(writes,0);
});
