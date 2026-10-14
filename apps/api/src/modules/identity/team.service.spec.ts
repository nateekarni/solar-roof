import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { TeamService } from './team.service.js';
import type { DatabaseService } from '../../database/database.service.js';
import type { PoolClient } from 'pg';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
const owner={id:'00000000-0000-0000-0000-000000000001',role:'owner'};
const employee='00000000-0000-0000-0000-000000000002';
const positionId='00000000-0000-0000-0000-000000000003';
const scope={mode:'all',siteIds:[]};
const rules={'business.billing.view':true,'business.billing.approve':false};
const overrides={'business.billing.view':null,'business.billing.approve':true};
const unreachable={transaction:()=>{throw new Error('Must reject before database write');}} as unknown as DatabaseService;
test('domain managers reject cross-domain and employee permission administration',async()=>{
 const service=new TeamService(unreachable);
 await assert.rejects(()=>service.updateGrant({id:'actor',role:'admin'},'user','business',{}),/own permission domain/);
 await assert.rejects(()=>service.updateGrant({id:'actor',role:'operator'},'user','technical',{}),/own permission domain/);
});
test('grant patches reject unknown fields, delegated management, and invalid scope before transaction',async()=>{
 const service=new TeamService(unreachable);
 await assert.rejects(()=>service.updateGrant(owner,'user','business',{revision:0,position:{id:positionId},overrides:{'business.permissions.manage':true},scope}),/permission/);
 await assert.rejects(()=>service.updateGrant(owner,'user','business',{revision:0,position:{id:positionId},overrides:{},scope:{mode:'selected',siteIds:['bad']}}),/scope/);
});

function grantFixture(options:{role?:string;revision?:number;presetExists?:boolean;actorRole?:string;actorStatus?:string}={}){
 const statements:{sql:string;values:unknown[]}[]=[];
 let transactions=0;
 const client={query:async(sql:string,values:unknown[]=[])=>{
  statements.push({sql,values});
  if(sql.startsWith('SELECT id,role,status,permission_revision')){
   const manager={id:owner.id,role:options.actorRole??'owner',status:options.actorStatus??'active',permission_revision:options.revision??0};
   return {rows:values[1]===undefined||values[1]===owner.id?[manager]:[manager,{id:values[1],role:options.role??'operator',status:'active',permission_revision:options.revision??0}]};
  }
  if(sql.startsWith('SELECT p.name'))return {rows:options.presetExists===false?[]:[{name:'กรรมการบริษัท'}]};
  return {rows:[]};
 }} as unknown as PoolClient;
 const db={transaction:async<T>(work:(client:PoolClient)=>Promise<T>)=>{transactions++;return work(client);}} as unknown as DatabaseService;
 return {service:new TeamService(db),statements,transactionCount:()=>transactions};
}

test('typed position creates explicit preset and assigns canonical position in one transaction',async()=>{
 const {service,statements,transactionCount}=grantFixture();
 const result=await service.updateGrant(owner,employee,'business',{revision:0,position:{name:'  กรรมการบริษัท  ',rules},overrides,scope});
 assert.equal(result.success,true);assert.equal(result.revision,1);
 assert.deepEqual(result.position,{id:result.position.id,name:'กรรมการบริษัท'});
 assert.match(result.position.id,/^[a-f0-9-]{36}$/);
 assert.equal(transactionCount(),1);
 assert.deepEqual(statements.find(({sql})=>sql.startsWith('INSERT INTO employee_positions'))?.values,[result.position.id,'กรรมการบริษัท']);
 assert.deepEqual(statements.find(({sql})=>sql.startsWith('INSERT INTO employee_position_domains'))?.values,[result.position.id,'business',JSON.stringify(rules)]);
 assert.deepEqual(statements.find(({sql})=>sql.includes('company_position_id'))?.values,[employee,result.position.id]);
 assert.deepEqual(statements.find(({sql})=>sql.startsWith('INSERT INTO employee_domain_grants'))?.values,[employee,'business',result.position.id,JSON.stringify(overrides),'all',[],owner.id]);
 const audit=statements.find(({sql})=>sql.startsWith('INSERT INTO audit_events'))!;
 assert.match(audit.sql,/after_json/);
 assert.ok(audit.values.some(value=>typeof value==='string'&&value.includes('กรรมการบริษัท')));
});

test('existing preset remains selectable with detailed overrides and returns its display name',async()=>{
 const {service,statements}=grantFixture();
 const result=await service.updateGrant(owner,employee,'business',{revision:0,position:{id:positionId},overrides,scope});
 assert.deepEqual(result.position,{id:positionId,name:'กรรมการบริษัท'});
 assert.deepEqual(statements.find(({sql})=>sql.startsWith('SELECT p.name'))?.values,[positionId,'business']);
 assert.match(statements.find(({sql})=>sql.startsWith('SELECT p.name'))!.sql,/FOR SHARE/);
 assert.deepEqual(statements.find(({sql})=>sql.includes('company_position_id'))?.values,[employee,positionId]);
 assert.equal(statements.some(({sql})=>sql.startsWith('INSERT INTO employee_positions')),false);
 assert.equal(statements.find(({sql})=>sql.startsWith('INSERT INTO employee_domain_grants'))?.values[3],JSON.stringify(overrides));
});

test('owner position assignment does not rewrite role-derived permissions',async()=>{
 const {service,statements}=grantFixture({role:'owner'});
 const result=await service.updateGrant(owner,owner.id,'business',{revision:0,position:{id:positionId},overrides:{},scope});
 assert.deepEqual(result.position,{id:positionId,name:'กรรมการบริษัท'});
 assert.deepEqual(statements.find(({sql})=>sql.includes('company_position_id'))?.values,[owner.id,positionId]);
 assert.equal(statements.some(({sql})=>sql.includes('employee_domain_grants')),false);
 assert.equal(result.revision,1);
});

test('position selection requires a preset in the managed domain',async()=>{
 const {service,statements}=grantFixture({presetExists:false});
 await assert.rejects(()=>service.updateGrant(owner,employee,'business',{revision:0,position:{id:positionId},overrides:{},scope}),BadRequestException);
 assert.equal(statements.some(({sql})=>sql.startsWith('INSERT')||sql.startsWith('UPDATE')),false);
});

test('stale revisions reject typed positions before creating any preset',async()=>{
 const {service,statements}=grantFixture({revision:1});
 await assert.rejects(()=>service.updateGrant(owner,employee,'business',{revision:0,position:{name:'Finance',rules},overrides,scope}),ConflictException);
 assert.equal(statements.some(({sql})=>sql.startsWith('INSERT')||sql.startsWith('UPDATE')),false);
});

test('customer and opposite-domain manager accounts cannot receive employee assignments',async()=>{
 for(const role of ['customer_user','admin']){
  const {service,statements}=grantFixture({role});
  await assert.rejects(()=>service.updateGrant(owner,employee,'business',{revision:0,position:{id:positionId},overrides:{},scope}),ForbiddenException);
  assert.equal(statements.some(({sql})=>sql.startsWith('INSERT')||sql.startsWith('UPDATE')),false);
 }
});

test('all team mutations recheck current manager status and role before writes',async()=>{
 for(const options of [{actorRole:'operator'},{actorStatus:'inactive'}]){
  for(const operation of ['assign','revoke','deactivate','preset']){
   const {service,statements}=grantFixture(options);
   const save=()=>operation==='assign'?service.updateGrant(owner,employee,'business',{revision:0,position:{id:positionId},overrides:{},scope})
    :operation==='revoke'?service.revokeGrant(owner,employee,'business',{revision:0})
    :operation==='deactivate'?service.deactivate(owner,employee,{revision:0,impactConfirmed:true})
    :service.savePosition(owner,'business',{revision:0,name:'Original',rules:{}},positionId);
   await assert.rejects(save,ForbiddenException);
   assert.equal(statements.some(({sql})=>sql.startsWith('INSERT')||sql.startsWith('UPDATE')),false);
  }
 }
});

test('stale target revisions reject revocation and deactivation before writes',async()=>{
 for(const operation of ['revoke','deactivate']){
  const {service,statements}=grantFixture({revision:1});
  await assert.rejects(()=>operation==='revoke'?service.revokeGrant(owner,employee,'business',{revision:0}):service.deactivate(owner,employee,{revision:0,impactConfirmed:true}),ConflictException);
  assert.equal(statements.some(({sql})=>sql.startsWith('INSERT')||sql.startsWith('UPDATE')||sql.startsWith('DELETE')),false);
 }
});

test('position drafts require exactly one valid selector or explicit named preset',async()=>{
 const service=new TeamService(unreachable);
 for(const position of [undefined,null,{},[],{id:positionId,name:'Finance',rules},{id:positionId,rules},{id:'bad'},
  {name:'' ,rules},{name:'   ',rules},{name:'x'.repeat(121),rules},{name:'Finance'},
  {name:'Finance',rules:{'technical.gateways.view':true}},{name:'Finance',rules:{'business.billing.view':'yes'}}]){
  await assert.rejects(()=>service.updateGrant(owner,employee,'business',{revision:0,position,overrides:{},scope}),BadRequestException);
 }
 await assert.rejects(()=>service.updateGrant(owner,employee,'business',{revision:0,position:{id:positionId},scope}),BadRequestException);
 await assert.rejects(()=>service.updateGrant(owner,employee,'business',{revision:0,positionId,overrides:{},scope}),BadRequestException);
});
test('employee listing includes the stored avatar in read-only profile data',async()=>{
 let sql='';const avatarData='data:image/jpeg;base64,avatar';
 const service=new TeamService({query:async(statement:string)=>{sql=statement;return {rows:[{id:'employee',avatarData:statement.includes('u.avatar_data AS "avatarData"')?avatarData:undefined}]};}} as unknown as DatabaseService);
 const result=await service.employees({id:'owner',role:'owner'},'business');
 assert.equal(result.employees[0]?.avatarData,avatarData);
 assert.match(sql,/WHERE u.role IN \('operator','accountant',\$2\)/);
});

test('employee listing includes its domain manager and canonical position fields',async()=>{
 for(const [domain,role] of [['business','owner'],['technical','admin']]){
  let statement='';let params:unknown[]=[];
  const service=new TeamService({query:async(sql:string,values:unknown[])=>{
   statement=sql;params=values;
   return {rows:[{id:owner.id,role,companyPosition:sql.includes('p.name AS "companyPosition"')?'กรรมการบริษัท':undefined,companyPositionId:sql.includes('u.company_position_id AS "companyPositionId"')?positionId:undefined}]};
  }} as unknown as DatabaseService);
  const result=await service.employees({id:owner.id,role:role!},domain);
  assert.deepEqual(params,[domain,role]);
  assert.equal(result.employees[0]?.companyPosition,'กรรมการบริษัท');
  assert.equal(result.employees[0]?.companyPositionId,positionId);
  assert.match(statement,/p.id=u.company_position_id/);
  assert.match(statement,/WHERE u.role IN \('operator','accountant',\$2\)/);
 }
});
