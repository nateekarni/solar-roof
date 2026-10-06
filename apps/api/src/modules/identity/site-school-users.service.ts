import {BadRequestException,ConflictException,ForbiddenException,Inject,Injectable,NotFoundException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {DatabaseService} from '../../database/database.service.js';
import {InvitationService} from './invitation.service.js';
const editSchema=z.object({displayName:z.string().trim().min(2).max(200).optional(),email:z.string().trim().toLowerCase().email().max(254).optional(),status:z.enum(['active','disabled']).optional()}).strict();
@Injectable()
export class SiteSchoolUsersService {
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService,@Inject(InvitationService) private readonly invitations:InvitationService){}
 private async scope(client:PoolClient,siteId:string,actorId:string){
  const actor=(await client.query('SELECT role,status FROM users WHERE id=$1 FOR SHARE',[actorId])).rows[0];
  if(actor?.role!=='admin'||actor.status!=='active')throw new ForbiddenException('Administrator required');
  const site=(await client.query("SELECT school_id FROM sites WHERE id::text=$1 AND status<>'archived' FOR SHARE",[siteId])).rows[0];
  if(!site)throw new NotFoundException('Site not found');return site.school_id as string;
 }
 async list(siteId:string,actorId:string){return this.db.transaction(async client=>{
  const schoolId=await this.scope(client,siteId,actorId);
  return {schoolId,users:(await client.query('SELECT id,email,display_name AS "displayName",status,(password_hash IS NOT NULL) AS "canActivate",created_at AS "createdAt" FROM users WHERE school_id=$1 AND role=\'school_user\' ORDER BY created_at,id LIMIT 500',[schoolId])).rows};
 });}
 async invite(siteId:string,input:{email:string;displayName:string},actorId:string){
  const schoolId=await this.db.transaction(client=>this.scope(client,siteId,actorId));
  return this.invitations.invite({email:input.email,displayName:input.displayName,schoolId,role:'school_user'},{id:actorId,role:'admin'});
 }
 async update(siteId:string,userId:string,input:unknown,actorId:string){
  const parsed=editSchema.safeParse(input);if(!parsed.success)throw new BadRequestException('Invalid user fields');
  return this.db.transaction(async client=>{
   const schoolId=await this.scope(client,siteId,actorId);
   const user=(await client.query('SELECT id,email,display_name,status,role,school_id,password_hash FROM users WHERE id=$1 FOR UPDATE',[userId])).rows[0];
   if(!user||user.role!=='school_user'||user.school_id!==schoolId)throw new NotFoundException('School user not found');
   const email=parsed.data.email??user.email,status=parsed.data.status??user.status,displayName=parsed.data.displayName??user.display_name;
   if(!user.password_hash&&(status==='active'||email!==user.email))throw new ConflictException('Invited users must activate through their original email; revoke and invite again to change email');
   if(email!==user.email&&(await client.query('SELECT id FROM users WHERE lower(email)=$1 AND id<>$2',[email,userId])).rows.length)throw new ConflictException('Email already exists');
   await client.query('UPDATE users SET display_name=$2,email=$3,status=$4,updated_at=now() WHERE id=$1',[userId,displayName,email,status]);
   if(status==='disabled'||email!==user.email)await client.query('UPDATE auth_sessions SET revoked_at=now(),refresh_hash=NULL WHERE user_id=$1 AND revoked_at IS NULL',[userId]);
   if(status==='disabled')await client.query('UPDATE user_invitations SET revoked_at=now(),updated_at=now() WHERE user_id=$1 AND consumed_at IS NULL',[userId]);
   await client.query("INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,before_json,after_json,correlation_id) VALUES($1,$2,'site.school_user.updated','user',$3,$4::jsonb,$5::jsonb,$6)",[randomUUID(),actorId,userId,JSON.stringify({email:user.email,displayName:user.display_name,status:user.status}),JSON.stringify({email,displayName,status,schoolId}),randomUUID()]);
   return {id:userId,email,displayName,status};
  });
 }
 async remove(siteId:string,userId:string,actorId:string){
  // Preserve user foreign keys and audit history; deny all future authentication.
  return this.update(siteId,userId,{status:'disabled'},actorId);
 }
}
