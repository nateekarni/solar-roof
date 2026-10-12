import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { TeamService } from './team.service.js';
import type { DatabaseService } from '../../database/database.service.js';
const unreachable={transaction:()=>{throw new Error('Must reject before database write');}} as unknown as DatabaseService;
test('domain managers reject cross-domain and employee permission administration',async()=>{
 const service=new TeamService(unreachable);
 await assert.rejects(()=>service.updateGrant({id:'actor',role:'admin'},'user','business',{}),/own permission domain/);
 await assert.rejects(()=>service.updateGrant({id:'actor',role:'operator'},'user','technical',{}),/own permission domain/);
});
test('grant patches reject unknown fields, delegated management, and invalid scope before transaction',async()=>{
 const service=new TeamService(unreachable);
 await assert.rejects(()=>service.updateGrant({id:'actor',role:'owner'},'user','business',{revision:0,positionId:null,overrides:{'business.permissions.manage':true},scope:{mode:'all',siteIds:[]}}),/permission/);
 await assert.rejects(()=>service.updateGrant({id:'actor',role:'owner'},'user','business',{revision:0,positionId:null,overrides:{},scope:{mode:'selected',siteIds:['bad']}}),/scope/);
});
test('employee listing includes the stored avatar in read-only profile data',async()=>{
 let sql='';const avatarData='data:image/jpeg;base64,avatar';
 const service=new TeamService({query:async(statement:string)=>{sql=statement;return {rows:[{id:'employee',avatarData:statement.includes('u.avatar_data AS "avatarData"')?avatarData:undefined}]};}} as unknown as DatabaseService);
 const result=await service.employees({id:'owner',role:'owner'},'business');
 assert.equal(result.employees[0]?.avatarData,avatarData);
 assert.match(sql,/WHERE u.role IN \('operator','accountant'\)/);
});
