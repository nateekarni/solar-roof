import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service.js';
import { PERMISSION_CATALOG, validateDomainRules, validateScope, type PermissionDomain } from '../../common/auth/authorization.js';
export interface TeamActor {id:string;role:string}
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
   CASE WHEN g.user_id IS NULL THEN NULL ELSE jsonb_build_object('positionId',g.position_id,'overrides',g.overrides,'scope',jsonb_build_object('mode',g.scope_mode,'siteIds',g.site_ids)) END AS grant
   FROM users u LEFT JOIN employee_domain_grants g ON g.user_id=u.id AND g.domain=$1
   WHERE u.role IN ('operator','accountant') ORDER BY u.display_name,u.id`,[domain]);
  return {domain,employees:result.rows};
 }
 async positions(actor:TeamActor,rawDomain:unknown){
  const domain=domainFor(actor,rawDomain);
  return {domain,positions:(await this.db.query(`SELECT p.id,p.name,d.rules,d.revision FROM employee_positions p JOIN employee_position_domains d ON d.position_id=p.id WHERE d.domain=$1 ORDER BY p.name,p.id`,[domain])).rows};
 }
 private async authorizeCurrent(client:PoolClient,actor:TeamActor,domain:PermissionDomain){
  const current=(await client.query('SELECT role,status FROM users WHERE id=$1 FOR SHARE',[actor.id])).rows[0];
  if(!current||current.status!=='active')throw new ForbiddenException('Manager is inactive');
  domainFor({...actor,role:current.role},domain);
 }
 private async audit(client:PoolClient,actor:TeamActor,domain:PermissionDomain,id:string,action:string){
  await client.query(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,correlation_id) VALUES($1,$2,$3,$4,$5,$6)`,[randomUUID(),actor.id,`${domain}.${action}`,'employee_permission',id,randomUUID()]);
 }
 async updateGrant(actor:TeamActor,userId:string,rawDomain:unknown,input:unknown){
  const domain=domainFor(actor,rawDomain),body=object(input,['revision','positionId','overrides','scope']);
  const expected=revision(body.revision),rules=validateDomainRules(domain,body.overrides),scope=validateScope(body.scope);
  const positionId=body.positionId===null?null:uuid(body.positionId);
  return this.db.transaction(async client=>{
   await this.authorizeCurrent(client,actor,domain);
   const user=(await client.query('SELECT role,permission_revision FROM users WHERE id=$1 FOR UPDATE',[uuid(userId)])).rows[0];
   if(!user)throw new NotFoundException('Employee not found');
   if(!['operator','accountant'].includes(user.role))throw new ForbiddenException('Platform manager and customer rights cannot be changed through employee grants');
   if(user.permission_revision!==expected)throw new ConflictException('Permissions changed; reload before saving');
   if(positionId&&!(await client.query('SELECT position_id FROM employee_position_domains WHERE position_id=$1 AND domain=$2 FOR SHARE',[positionId,domain])).rows[0])throw new BadRequestException('Position has no rules in this domain');
   if(scope.siteIds.length){const sites=await client.query('SELECT id FROM sites WHERE id=ANY($1::uuid[]) FOR SHARE',[scope.siteIds]);if(sites.rows.length!==scope.siteIds.length)throw new BadRequestException('Unknown site scope');}
   await client.query(`INSERT INTO employee_domain_grants(user_id,domain,position_id,overrides,scope_mode,site_ids,updated_by)
    VALUES($1,$2,$3,$4::jsonb,$5,$6::uuid[],$7) ON CONFLICT(user_id,domain) DO UPDATE SET position_id=excluded.position_id,overrides=excluded.overrides,scope_mode=excluded.scope_mode,site_ids=excluded.site_ids,updated_by=excluded.updated_by,updated_at=now()`,[userId,domain,positionId,JSON.stringify(rules),scope.mode,scope.siteIds,actor.id]);
   await client.query('UPDATE users SET permission_revision=permission_revision+1,updated_at=now() WHERE id=$1',[userId]);
   await this.audit(client,actor,domain,userId,'permissions.updated');
   return {success:true,revision:expected+1};
  });
 }
 async revokeGrant(actor:TeamActor,userId:string,rawDomain:unknown,input:unknown){
  const domain=domainFor(actor,rawDomain),body=object(input,['revision']);const expected=revision(body.revision);
  return this.db.transaction(async client=>{
   await this.authorizeCurrent(client,actor,domain);
   const user=(await client.query('SELECT role,permission_revision FROM users WHERE id=$1 FOR UPDATE',[uuid(userId)])).rows[0];
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
   await this.authorizeCurrent(client,actor,domain);
   const id=positionId?uuid(positionId):randomUUID();
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
    await client.query('INSERT INTO employee_positions(id,name) VALUES($1,$2)',[id,body.name.trim()]);
    await client.query('INSERT INTO employee_position_domains(position_id,domain,rules) VALUES($1,$2,$3::jsonb)',[id,domain,JSON.stringify(rules)]);
   }
   await this.audit(client,actor,domain,id,'position.updated');return {id,name:body.name.trim(),rules,revision:positionId?expected+1:0};
  });
 }
 async positionImpact(actor:TeamActor,positionId:string,rawDomain:unknown,input:unknown){
  const domain=domainFor(actor,rawDomain),body=object(input,['rules']);const rules=validateDomainRules(domain,body.rules);
  const result=await this.db.query(`SELECT u.id,u.display_name AS "displayName",g.overrides,p.rules AS previous FROM employee_domain_grants g JOIN users u ON u.id=g.user_id JOIN employee_position_domains p ON p.position_id=g.position_id AND p.domain=g.domain WHERE g.position_id=$1 AND g.domain=$2`,[uuid(positionId),domain]);
  return {domain,employees:result.rows.map(row=>({id:row.id,displayName:row.displayName,changes:PERMISSION_CATALOG.filter(key=>key.startsWith(`${domain}.`)&&row.overrides[key]==null&&Boolean(row.previous[key])!==Boolean(rules[key])).map(permission=>({permission,before:row.previous[permission]===true,after:rules[permission]===true}))}))};
 }
 async deactivationImpact(actor:TeamActor,userId:string){
  domainFor(actor,'business');
  const user=(await this.db.query('SELECT id,email,display_name AS "displayName",role,status,permission_revision AS revision FROM users WHERE id=$1',[uuid(userId)])).rows[0];
  if(!user)throw new NotFoundException('Employee not found');
  if(!['operator','accountant'].includes(user.role))throw new ForbiddenException('Only employee accounts can be globally deactivated');
  const grants=(await this.db.query('SELECT domain,scope_mode AS "scopeMode",site_ids AS "siteIds" FROM employee_domain_grants WHERE user_id=$1',[userId])).rows;
  return {user,domains:grants,activeSessions:Number((await this.db.query('SELECT count(*) AS count FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',[userId])).rows[0]?.count??0)};
 }
 async deactivate(actor:TeamActor,userId:string,input:unknown){
  domainFor(actor,'business');const body=object(input,['revision','impactConfirmed']);const expected=revision(body.revision);
  if(body.impactConfirmed!==true)throw new BadRequestException('Review and confirm account-wide impact');
  return this.db.transaction(async client=>{
   await this.authorizeCurrent(client,actor,'business');
   const user=(await client.query('SELECT role,permission_revision FROM users WHERE id=$1 FOR UPDATE',[uuid(userId)])).rows[0];
   if(!user)throw new NotFoundException('Employee not found');
   if(!['operator','accountant'].includes(user.role))throw new ForbiddenException('Only employee accounts can be globally deactivated');
   if(user.permission_revision!==expected)throw new ConflictException('Permissions changed; preview again');
   await client.query("UPDATE users SET status='inactive',permission_revision=permission_revision+1,updated_at=now() WHERE id=$1",[userId]);
   await client.query('UPDATE auth_sessions SET revoked_at=now(),refresh_hash=NULL WHERE user_id=$1 AND revoked_at IS NULL',[userId]);
   await this.audit(client,actor,'business',userId,'employee.deactivated');return {success:true,revision:expected+1};
  });
 }
}
