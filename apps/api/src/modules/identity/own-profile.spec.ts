import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import {MeController} from './me.controller.js';
import {routeAllowed} from '../../common/auth/route-policy.js';
import type {DatabaseService} from '../../database/database.service.js';
test('every current role can read and update only its own display name',async()=>{
 for(const role of ['owner','admin','operator','accountant','customer_user']){
  const calls:Array<{sql:string;params:unknown[]}>=[];
  const db={query:async(sql:string,params:unknown[])=>{calls.push({sql,params});return {rows:[sql.includes('UPDATE')?{displayName:'New name'}:{displayName:'New name',companyPosition:'Director',hasSignature:false,signatureDataUri:null}]};}} as unknown as DatabaseService;
  const controller=new MeController(db),req={user:{id:'current',role}};
  assert.equal(routeAllowed(role,'GET','/v1/me/profile'),true);assert.equal(routeAllowed(role,'PUT','/v1/me/profile'),true);
  assert.deepEqual(await controller.getProfile(req as never),{displayName:'New name',companyPosition:'Director',hasSignature:false,signatureDataUri:null});
  assert.deepEqual(await controller.updateProfile(req as never,{displayName:'  New name  '}),{displayName:'New name'});
  assert.deepEqual(calls[0]?.params,['current']);assert.deepEqual(calls[1]?.params,['New name','current']);
  await assert.rejects(()=>controller.updateProfile(req as never,{displayName:'Other',id:'other'}),/Invalid profile/);
  await assert.rejects(()=>controller.updateProfile(req as never,{displayName:' '.repeat(10)}),/Invalid display name/);
  await assert.rejects(()=>controller.updateProfile(req as never,{displayName:'x'.repeat(121)}),/Invalid display name/);
 }
});

test('session-facing me exposes position and signature presence without signature bytes',async()=>{
 const calls:Array<{sql:string;params:unknown[]}>=[];
 const controller=new MeController({query:async(sql:string,params:unknown[])=>{
  calls.push({sql,params});
  return {rows:[{id:'current',displayName:'Current',companyPosition:'Director',hasSignature:true}]};
 }} as unknown as DatabaseService);
 const result=await controller.getMe({user:{id:'current',authorization:{domains:[]}}} as never);
 assert.equal(result.companyPosition,'Director');assert.equal(result.hasSignature,true);
 assert.equal('signatureDataUri' in result,false);assert.equal('signature_data' in result,false);
 assert.deepEqual(calls[0]?.params,['current']);
 assert.match(calls[0]!.sql,/p\.name AS "companyPosition"/);
 assert.match(calls[0]!.sql,/signature_data IS NOT NULL/);
 assert.doesNotMatch(calls[0]!.sql,/signature_data AS/);
});

test('own profile returns the authenticated user signature and never accepts another identity',async()=>{
 const calls:Array<{sql:string;params:unknown[]}>=[];
 const controller=new MeController({query:async(sql:string,params:unknown[])=>{
  calls.push({sql,params});
  return {rows:[{displayName:'Current',companyPosition:'Director',hasSignature:true,signatureDataUri:'data:image/png;base64,AA=='}]};
 }} as unknown as DatabaseService);
 const result=await controller.getProfile({user:{id:'current'},query:{userId:'other'}} as never);
 assert.deepEqual(result,{displayName:'Current',companyPosition:'Director',hasSignature:true,signatureDataUri:'data:image/png;base64,AA=='});
 assert.deepEqual(calls[0]?.params,['current']);assert.match(calls[0]!.sql,/signature_data AS "signatureDataUri"/);
 await assert.rejects(()=>controller.getProfile({} as never),/Not authenticated/);
});

test('own profile rejects a missing user',async()=>{
 const controller=new MeController({query:async()=>({rows:[]})} as unknown as DatabaseService);
 await assert.rejects(()=>controller.getProfile({user:{id:'missing'}} as never),/User not found/);
});
test('preference changes reject unknown fields and unsupported language/theme before touching storage',async()=>{
 let writes=0;
 const controller=new MeController({query:async()=>{writes++;return {rows:[{}]};}} as unknown as DatabaseService);
 for(const body of [{preferredLanguage:'xx'},{preferredTheme:'purple'},{preferredLanguage:'en',id:'someone'},{role:'admin'},null,[]]){
  await assert.rejects(()=>controller.updatePreferences({user:{id:'current'}} as never,body as never,{cookie(){}} as never),/Invalid preferences/);
 }
 assert.equal(writes,0);
});
