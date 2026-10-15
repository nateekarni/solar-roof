import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service.js';
import { PERMISSION_CATALOG, validateDomainRules, validateScope, type PermissionDomain, type SiteAccessScope } from '../../common/auth/authorization.js';
export interface TeamActor {id:string;role:string}
export interface TeamGrantDraft {
 revision:number;
 position:{id:string}|{name:string;rules:Record<string,boolean|null>};
 overrides:Record<string,boolean|null>;
 scope:SiteAccessScope;
 displayName?:string;
}
export interface TeamGrantResult {success:true;revision:number;position:{id:string;name:string};positionReused?:true}
function domainFor(actor:TeamActor,domain:unknown):PermissionDomain {
 if((domain!=='business'&&domain!=='technical')||actor.role!==(domain==='business'?'owner':'admin'))throw new ForbiddenException('Managers may administer only their own permission domain');
 return domain;
}
function object(value:unknown,keys:string[]):Record<string,any>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw new BadRequestException('Invalid fields');
 return value as Record<string,any>;
}
function revision(value:unknown):number{if(!Number.isSafeInteger(value)||Number(value)<0)throw new BadRequestException('Revision is required');return Number(value);}
function uuid(value:unknown):string{if(typeof value!=='string'||!/^[a-f0-9-]{36}$/i.test(value))throw new BadRequestException('Invalid identifier');return value;}
@Injectable()
export class TeamService {
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService){}
 catalog(actor:TeamActor,rawDomain:unknown){const domain=domainFor(actor,rawDomain);return {domain,permissions:PERMISSION_CATALOG.filter(key=>key.startsWith(`${domain}.`))};}
 async employees(actor:TeamActor,rawDomain:unknown){
  const domain=domainFor(actor,rawDomain);
  const result=await this.db.query(`SELECT u.id,u.email,u.display_name AS "displayName",u.avatar_data AS "avatarData",u.role,u.status,u.permission_revision AS revision,
   u.company_position_id AS "companyPositionId",p.name AS "companyPosition",
   CASE WHEN g.user_id IS NULL THEN NULL ELSE jsonb_build_object('positionId',g.position_id,'overrides',g.overrides,'scope',jsonb_build_object('mode',g.scope_mode,'siteIds',g.site_ids)) END AS grant
   FROM users u LEFT JOIN employee_domain_grants g ON g.user_id=u.id AND g.domain=$1
   LEFT JOIN employee_positions p ON p.id=u.company_position_id
   WHERE u.role IN ('operator','accountant',$2) ORDER BY u.display_name,u.id`,[domain,domain==='business'?'owner':'admin']);
  return {domain,employees:result.rows};
 }
 async positions(actor:TeamActor,rawDomain:unknown){
  const domain=domainFor(actor,rawDomain);
  return {domain,positions:(await this.db.query(`SELECT p.id,p.name,d.rules,d.revision FROM employee_positions p JOIN employee_position_domains d ON d.position_id=p.id WHERE d.domain=$1 ORDER BY p.name,p.id`,[domain])).rows};
 }
 private async authorizeCurrent(client:PoolClient,actor:TeamActor,domain:PermissionDomain,target?:{userId:string}|{positionId:string}){
  // All team mutations in one domain enter this transaction-scoped gate before
  // row locks, including preset edits that change a dynamic set of user revisions.
  await client.query("SELECT pg_advisory_xact_lock(hashtext('solar.team.permissions'),hashtext($1))",[domain]);
  const targetId=target&&'userId' in target?uuid(target.userId).toLowerCase():undefined;
  // Use one ID order for every actor/target set, even when a stale actor role
  // selects a different domain gate. Preset membership is stable under its gate.
  const users=targetId!==undefined
   ?(await client.query('SELECT id,role,status,permission_revision FROM users WHERE id IN ($1,$2) ORDER BY id FOR UPDATE',[actor.id,targetId])).rows
   :target&&'positionId' in target
    ?(await client.query('SELECT id,role,status,permission_revision FROM users WHERE id=$1 OR id IN (SELECT user_id FROM employee_domain_grants WHERE position_id=$2 AND domain=$3) ORDER BY id FOR UPDATE',[actor.id,uuid(target.positionId),domain])).rows
    :(await client.query('SELECT id,role,status,permission_revision FROM users WHERE id=$1 FOR UPDATE',[actor.id])).rows;
  const current=users.find(row=>row.id===actor.id.toLowerCase());
  if(!current||current.status!=='active')throw new ForbiddenException('Manager is inactive');
  domainFor({...actor,role:current.role},domain);
  return targetId===undefined?undefined:users.find(row=>row.id===targetId);
 }
 private async audit(client:PoolClient,actor:TeamActor,domain:PermissionDomain,id:string,action:string,after?:unknown){
  await client.query(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,correlation_id,after_json) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,[randomUUID(),actor.id,`${domain}.${action}`,'employee_permission',id,randomUUID(),after===undefined?null:JSON.stringify(after)]);
 }
 private async createPosition(client:PoolClient,domain:PermissionDomain,name:string,rules:Record<string,boolean|null>){
  const inserted=(await client.query('INSERT INTO employee_positions(id,name) VALUES($1,$2) ON CONFLICT (employee_position_name_key(name)) DO NOTHING RETURNING id,name',[randomUUID(),name])).rows[0];
  // Unique-index arbitration waits for competing creators, including other domains.
  // Reuse only the shared identity; an existing domain preset is never overwritten.
  const position=inserted??(await client.query('SELECT id,name FROM employee_positions WHERE employee_position_name_key(name)=employee_position_name_key($1) FOR SHARE',[name])).rows[0];
  const preset=(await client.query('INSERT INTO employee_position_domains(position_id,domain,rules) VALUES($1,$2,$3::jsonb) ON CONFLICT (position_id,domain) DO NOTHING RETURNING position_id',[position.id,domain,JSON.stringify(rules)])).rows[0];
  if(!preset)throw new ConflictException({code:'POSITION_NAME_EXISTS',message:'Position already exists; review existing preset',position:{id:position.id,name:position.name}});
  return {id:position.id as string,name:position.name as string,reused:!inserted};
 }
 async updateGrant(actor:TeamActor,userId:string,rawDomain:unknown,input:unknown):Promise<TeamGrantResult>{
  const domain=domainFor(actor,rawDomain),body=object(input,['revision','position','overrides','scope','displayName']);
  const expected=revision(body.revision),overrides=validateDomainRules(domain,body.overrides),scope=validateScope(body.scope);
  const draft=object(body.position,['id','name','rules']);
  let selectedId:string|undefined,positionName:string|undefined,presetRules:Record<string,boolean|null>|undefined;
  if(Object.hasOwn(draft,'id')){
   if(Object.keys(draft).length!==1)throw new BadRequestException('Select a position or create a named preset');
   selectedId=uuid(draft.id);
  }else{
   if(typeof draft.name!=='string'||!draft.name.trim()||draft.name.trim().length>120)throw new BadRequestException('Position name required');
   positionName=draft.name.trim().normalize('NFC');presetRules=validateDomainRules(domain,draft.rules);
  }
  return this.db.transaction(async client=>{
   const user=await this.authorizeCurrent(client,actor,domain,{userId});
   if(!user)throw new NotFoundException('Employee not found');
   const employee=['operator','accountant'].includes(user.role);
   if(!employee&&user.role!==(domain==='business'?'owner':'admin'))throw new ForbiddenException('Only employees and this domain manager may receive a company position');
   if(user.permission_revision!==expected)throw new ConflictException({code:'EMPLOYEE_REVISION_CONFLICT',message:'Permissions changed; reload before saving'});
   if(scope.siteIds.length){const sites=await client.query('SELECT id FROM sites WHERE id=ANY($1::uuid[]) FOR SHARE',[scope.siteIds]);if(sites.rows.length!==scope.siteIds.length)throw new BadRequestException('Unknown site scope');}
   let positionId=selectedId!,positionReused=false;
   let name:string;
   if(selectedId){
    const preset=(await client.query('SELECT p.name FROM employee_positions p JOIN employee_position_domains d ON d.position_id=p.id AND d.domain=$2 WHERE p.id=$1 FOR SHARE',[positionId,domain])).rows[0];
    if(!preset)throw new BadRequestException('Position has no permission preset in this domain');
    name=preset.name;
   }else{
    const created=await this.createPosition(client,domain,positionName!,presetRules!);positionId=created.id;name=created.name;positionReused=created.reused;
   }
   if(typeof body.displayName==='string'&&body.displayName.trim()){
    await client.query('UPDATE users SET display_name=$2,updated_at=now() WHERE id=$1',[userId,body.displayName.trim().slice(0, 200)]);
   }
   await client.query('UPDATE users SET company_position_id=$2,updated_at=now() WHERE id=$1',[userId,positionId]);
   // Manager authority remains role-derived; presets and overrides apply only to employees.
   if(employee)await client.query(`INSERT INTO employee_domain_grants(user_id,domain,position_id,overrides,scope_mode,site_ids,updated_by)
    VALUES($1,$2,$3,$4::jsonb,$5,$6::uuid[],$7) ON CONFLICT(user_id,domain) DO UPDATE SET position_id=excluded.position_id,overrides=excluded.overrides,scope_mode=excluded.scope_mode,site_ids=excluded.site_ids,updated_by=excluded.updated_by,updated_at=now()`,[userId,domain,positionId,JSON.stringify(overrides),scope.mode,scope.siteIds,actor.id]);
   await client.query('UPDATE users SET permission_revision=permission_revision+1,updated_at=now() WHERE id=$1',[userId]);
   const position={id:positionId,name};
   await this.audit(client,actor,domain,userId,'permissions.updated',{position});
   return {success:true,revision:expected+1,position,...(positionReused?{positionReused:true as const}:{})};
  });
 }
 async saveEmployee(actor:TeamActor,userId:string,rawDomain:unknown,input:unknown):Promise<TeamGrantResult>{
  return this.updateGrant(actor,userId,rawDomain,input);
 }
 async revokeGrant(actor:TeamActor,userId:string,rawDomain:unknown,input:unknown){
  const domain=domainFor(actor,rawDomain),body=object(input,['revision']);const expected=revision(body.revision);
  return this.db.transaction(async client=>{
   const user=await this.authorizeCurrent(client,actor,domain,{userId});
   if(!user)throw new NotFoundException('Employee not found');
   if(!['operator','accountant'].includes(user.role))throw new ForbiddenException('Only employee grants can be revoked');
   if(user.permission_revision!==expected)throw new ConflictException('Permissions changed; reload');
   await client.query('DELETE FROM employee_domain_grants WHERE user_id=$1 AND domain=$2',[userId,domain]);
   await client.query('UPDATE users SET permission_revision=permission_revision+1,updated_at=now() WHERE id=$1',[userId]);
   await this.audit(client,actor,domain,userId,'permissions.revoked');return {success:true,revision:expected+1};
  });
 }
 async savePosition(actor:TeamActor,rawDomain:unknown,input:unknown,positionId?:string){
  const domain=domainFor(actor,rawDomain),body=object(input,['name','rules','revision']);
  if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>120)throw new BadRequestException('Position name required');
  const rules=validateDomainRules(domain,body.rules),expected=positionId?revision(body.revision):0;
  return this.db.transaction(async client=>{
   await this.authorizeCurrent(client,actor,domain,positionId?{positionId}:undefined);
   let id=positionId?uuid(positionId):'';let name=body.name.trim().normalize('NFC'),positionReused=false;
   if(positionId){
    const current=(await client.query('SELECT revision FROM employee_position_domains WHERE position_id=$1 AND domain=$2 FOR UPDATE',[id,domain])).rows[0];
    if(!current)throw new NotFoundException('Position not found');
    if(current.revision!==expected)throw new ConflictException('Position changed; reload');
    // Name is shared account metadata: names are immutable after creation so changing one domain cannot change another.
    const position=(await client.query('SELECT name FROM employee_positions WHERE id=$1',[id])).rows[0];
    if(position.name!==body.name.trim())throw new BadRequestException('Create a new position to change its name');
    await client.query('UPDATE employee_position_domains SET rules=$3::jsonb,revision=revision+1 WHERE position_id=$1 AND domain=$2',[id,domain,JSON.stringify(rules)]);
    await client.query('UPDATE users SET permission_revision=permission_revision+1 WHERE id IN (SELECT user_id FROM employee_domain_grants WHERE position_id=$1 AND domain=$2)',[id,domain]);
   }else{
    const created=await this.createPosition(client,domain,name,rules);id=created.id;name=created.name;positionReused=created.reused;
   }
   await this.audit(client,actor,domain,id,'position.updated');return {id,name,rules,revision:positionId?expected+1:0,...(positionReused?{positionReused:true as const}:{})};
  });
 }
 async positionImpact(actor:TeamActor,positionId:string,rawDomain:unknown,input:unknown){
  const domain=domainFor(actor,rawDomain),body=object(input,['rules']);const rules=validateDomainRules(domain,body.rules);
  const result=await this.db.query(`SELECT u.id,u.display_name AS "displayName",g.overrides,p.rules AS previous FROM employee_domain_grants g JOIN users u ON u.id=g.user_id JOIN employee_position_domains p ON p.position_id=g.position_id AND p.domain=g.domain WHERE g.position_id=$1 AND g.domain=$2`,[uuid(positionId),domain]);
  return {domain,employees:result.rows.map(row=>({id:row.id,displayName:row.displayName,changes:PERMISSION_CATALOG.filter(key=>key.startsWith(`${domain}.`)&&row.overrides[key]==null&&Boolean(row.previous[key])!==Boolean(rules[key])).map(permission=>({permission,before:row.previous[permission]===true,after:rules[permission]===true}))}))};
 }
 async deactivationImpact(actor:TeamActor,userId:string){
  if(!['owner','admin'].includes(actor.role))throw new ForbiddenException('Only managers may view deactivation impact');
  const user=(await this.db.query('SELECT id,email,display_name AS "displayName",role,status,permission_revision AS revision FROM users WHERE id=$1',[uuid(userId)])).rows[0];
  if(!user)throw new NotFoundException('Employee not found');
  if(!['operator','accountant'].includes(user.role))throw new ForbiddenException('Only employee accounts can be globally deactivated');
  const grants=(await this.db.query('SELECT domain,scope_mode AS "scopeMode",site_ids AS "siteIds" FROM employee_domain_grants WHERE user_id=$1',[userId])).rows;
  return {user,domains:grants,activeSessions:Number((await this.db.query('SELECT count(*) AS count FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',[userId])).rows[0]?.count??0)};
 }
 async deactivate(actor:TeamActor,userId:string,input:unknown){
  if(!['owner','admin'].includes(actor.role))throw new ForbiddenException('Only managers may deactivate employee accounts');
  const domain:PermissionDomain=actor.role==='owner'?'business':'technical';
  const body=object(input,['revision','impactConfirmed']);const expected=revision(body.revision);
  if(body.impactConfirmed!==true)throw new BadRequestException('Review and confirm account-wide impact');
  return this.db.transaction(async client=>{
   const user=await this.authorizeCurrent(client,actor,domain,{userId});
   if(!user)throw new NotFoundException('Employee not found');
   if(!['operator','accountant'].includes(user.role))throw new ForbiddenException('Only employee accounts can be globally deactivated');
   if(user.permission_revision!==expected)throw new ConflictException('Permissions changed; preview again');
   await client.query("UPDATE users SET status='inactive',permission_revision=permission_revision+1,updated_at=now() WHERE id=$1",[userId]);
   await client.query('UPDATE auth_sessions SET revoked_at=now(),refresh_hash=NULL WHERE user_id=$1 AND revoked_at IS NULL',[userId]);
   await client.query("UPDATE user_invitations SET revoked_at=now(), consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL",[userId]);
   await this.audit(client,actor,domain,userId,'employee.deactivated');return {success:true,revision:expected+1};
  });
 }
 async reactivate(actor:TeamActor,userId:string,_input?:unknown){
  if(!['owner','admin'].includes(actor.role))throw new ForbiddenException('Only managers may reactivate employee accounts');
  const domain:PermissionDomain=actor.role==='owner'?'business':'technical';
  return this.db.transaction(async client=>{
   const user=await this.authorizeCurrent(client,actor,domain,{userId});
   if(!user)throw new NotFoundException('Employee not found');
   if(!['operator','accountant'].includes(user.role))throw new ForbiddenException('Only employee accounts can be reactivated');
   await client.query("UPDATE users SET status='active',permission_revision=permission_revision+1,updated_at=now() WHERE id=$1",[userId]);
   await this.audit(client,actor,domain,userId,'employee.reactivated');return {success:true,revision:user.permission_revision+1};
  });
 }
}
