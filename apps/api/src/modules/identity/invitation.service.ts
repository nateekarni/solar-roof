import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import nodemailer from 'nodemailer';
import {DatabaseService} from '../../database/database.service.js';
import {AuthService} from './auth.service.js';
import {schoolScope, type ScopePrincipal} from '../../common/auth/route-policy.js';
export type InvitationStatus='pending_delivery'|'sent'|'delivery_failed';
export interface InviteInput {email:string;displayName:string;role:string;schoolId?:string|null}
export function canGrantInvitation(actor:ScopePrincipal & {status?:string}, role:string, schoolId:string|null):boolean {
  if(actor.status!=='active' || actor.role !== 'admin' || !['owner','admin','operator','accountant','school_user'].includes(role))return false;
  if(role==='school_user'&&!schoolId)return false;
  const scope=schoolScope(actor);return scope===null || (!!schoolId&&scope.includes(schoolId));
}
const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
const invalid=()=>new UnauthorizedException('Invitation is invalid or expired');
@Injectable()
export class InvitationService {
  constructor(@Inject(DatabaseService) private readonly db:DatabaseService,@Inject(AuthService) private readonly auth:AuthService) {}
  private async limit(client:PoolClient,key:string,seconds:number):Promise<string> {
    // Both budgets expire within one hour. Bound each cleanup and avoid contention
    // with another request's limiter row. Current active windows are never removed.
    await client.query(`DELETE FROM invitation_rate_limits WHERE key IN (
      SELECT key FROM invitation_rate_limits WHERE window_started_at<now()-interval '1 hour'
      ORDER BY window_started_at LIMIT 100 FOR UPDATE SKIP LOCKED)`);
    const result=await client.query(`INSERT INTO invitation_rate_limits(key,attempts) VALUES($1,1)
      ON CONFLICT(key) DO UPDATE SET
       attempts=CASE WHEN invitation_rate_limits.window_started_at<=now()-$2*interval '1 second' THEN 1 ELSE invitation_rate_limits.attempts+1 END,
       window_started_at=CASE WHEN invitation_rate_limits.window_started_at<=now()-$2*interval '1 second' THEN now() ELSE invitation_rate_limits.window_started_at END
      RETURNING attempts,window_started_at::text AS window_started_at`,[key,seconds]);
    if(result.rows[0].attempts>5)throw new HttpException('Too many invitation attempts; try again later',429);
    return result.rows[0].window_started_at;
  }
  private async actor(client:PoolClient,id:string) {
    return (await client.query('SELECT id,role,status,school_id AS "schoolId" FROM users WHERE id=$1 FOR SHARE',[id])).rows[0];
  }
  private authorize(actor:any,role:string,schoolId:string|null) {
    if(!actor||!canGrantInvitation(actor,role,schoolId))throw new ForbiddenException('Cannot grant invitation role or school scope');
  }
  async invite(input:InviteInput,actor:ScopePrincipal & {id:string}):Promise<{invitationId:string;status:InvitationStatus}> {
    const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
    const displayName=typeof input.displayName==='string'?input.displayName.trim():'';
    const role=input.role ?? 'school_user';let schoolId=input.schoolId || null;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!displayName||displayName.length>200)throw new BadRequestException('Valid email and displayName are required');
    if(schoolId&&!/^[a-f0-9-]{36}$/i.test(schoolId))throw new BadRequestException('Invalid schoolId');
    const token=randomBytes(32).toString('base64url'),invitationId=randomUUID(),userId=randomUUID();
    await this.db.transaction(async client=>{
      const current=await this.actor(client,actor.id);
      if(!schoolId&&current?.schoolId&&role==='school_user')schoolId=current.schoolId;
      this.authorize(current,role,schoolId);
      if(schoolId&&!(await client.query('SELECT id FROM schools WHERE id=$1',[schoolId])).rows[0])throw new BadRequestException('School not found');
      await this.limit(client,`delivery:${actor.id}:${email}`,3600);
      const inserted=await client.query(`INSERT INTO users(id,email,display_name,role,status,school_id,password_hash)
        VALUES($1,$2,$3,$4,'invited',$5,NULL) ON CONFLICT(email) DO NOTHING RETURNING id`,[userId,email,displayName,role,schoolId]);
      if(!inserted.rows[0])throw new ConflictException('User already exists; use resend for an outstanding invitation');
      await client.query(`INSERT INTO user_invitations(id,user_id,issuer_id,email,role,school_id,token_hash,expires_at,delivery_status)
        VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '24 hours','pending_delivery')`,[invitationId,userId,actor.id,email,role,schoolId,digest(token)]);
      await client.query("INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,correlation_id,occurred_at) VALUES($1,$2,'user.invited','user',$3,$4,now())",[randomUUID(),actor.id,userId,invitationId]);
    });
    return {invitationId,status:await this.deliver(invitationId,email,token)};
  }
  async findOutstanding(email:string,actor:ScopePrincipal & {id:string}) {
    if(typeof email!=='string'||!email.trim())throw new BadRequestException('Email is required');
    return this.db.transaction(async client=>{
      const invitation=(await client.query(`SELECT i.* FROM user_invitations i JOIN users u ON u.id=i.user_id
        WHERE i.email=$1 AND i.consumed_at IS NULL AND u.status='invited'`,[email.trim().toLowerCase()])).rows[0];
      if(!invitation)throw new NotFoundException('Outstanding invitation not found');
      this.authorize(await this.actor(client,actor.id),invitation.role,invitation.school_id);
      return {invitationId:invitation.id,status:invitation.delivery_status as InvitationStatus};
    });
  }
  async resend(invitationId:string,actor:ScopePrincipal & {id:string}):Promise<{invitationId:string;status:InvitationStatus}> {
    if(!/^[a-f0-9-]{36}$/i.test(invitationId))throw new NotFoundException('Invitation not found');
    const token=randomBytes(32).toString('base64url');
    const email=await this.db.transaction(async client=>{
      const invitation=(await client.query('SELECT * FROM user_invitations WHERE id=$1 FOR UPDATE',[invitationId])).rows[0];
      if(!invitation)throw new NotFoundException('Invitation not found');
      this.authorize(await this.actor(client,actor.id),invitation.role,invitation.school_id);
      const recipient=(await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[invitation.user_id])).rows[0];
      if(!recipient||recipient.status!=='invited'||recipient.role!==invitation.role||recipient.school_id!==invitation.school_id||recipient.email!==invitation.email||recipient.password_hash||invitation.consumed_at)throw new ConflictException('Invitation is no longer eligible for resend');
      await this.limit(client,`delivery:${actor.id}:${invitation.email}`,3600);
      // Replacing the hash immediately revokes the previous link, including on SMTP failure.
      await client.query("UPDATE user_invitations SET issuer_id=$2,token_hash=$3,expires_at=now()+interval '24 hours',revoked_at=NULL,delivery_status='pending_delivery',updated_at=now() WHERE id=$1",[invitationId,actor.id,digest(token)]);
      return invitation.email as string;
    });
    return {invitationId,status:await this.deliver(invitationId,email,token)};
  }
  private async deliver(id:string,email:string,token:string):Promise<InvitationStatus> {
    let status:InvitationStatus='pending_delivery';
    if(process.env.SMTP_HOST) {
      status='delivery_failed';
      try {
        // No caller-supplied URL, Host header or redirect can select where the token goes.
        const web=new URL(process.env.WEB_URL ?? '');
        if(!['http:','https:'].includes(web.protocol)||web.username||web.password||web.search||web.hash)throw new Error('Invalid web origin');
        const url=new URL('/activate',web);url.searchParams.set('token',token);
        const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT || 587),secure:process.env.SMTP_SECURE==='true',...(process.env.SMTP_USER?{auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}}:{}),connectionTimeout:10000,greetingTimeout:10000,socketTimeout:10000});
        const sent=await transport.sendMail({from:process.env.SMTP_FROM || process.env.SMTP_USER,to:email,subject:'Solar Roof account invitation',text:`You have been invited to Solar Roof. Open this link within 24 hours to activate your account:\n${url.toString()}\nIf you did not expect this invitation, ignore this email.`});
        if(sent.accepted?.length)status='sent';
      } catch { /* Delivery failure is persisted; SMTP errors can contain token-bearing message data. */ }
    }
    const update=await this.db.query("UPDATE user_invitations SET delivery_status=$3,revoked_at=CASE WHEN $3='delivery_failed' THEN now() ELSE revoked_at END,updated_at=now() WHERE id=$1 AND token_hash=$2 RETURNING delivery_status",[id,digest(token),status]);
    // A concurrent resend supersedes this operation. Never report a stale delivery result.
    return update.rows[0]?.delivery_status ?? (await this.db.query('SELECT delivery_status FROM user_invitations WHERE id=$1',[id])).rows[0]?.delivery_status ?? 'delivery_failed';
  }
  async activate(token:string,password:string):Promise<void> {
    if(typeof token!=='string'||!/^[\w-]{43}$/.test(token))throw invalid();
    if(typeof password!=='string'||password.length<12||password.length>128)throw new BadRequestException('Password must be between 12 and 128 characters');
    const passwordHash=this.auth.hashPassword(password);
    await this.db.transaction(async client=>{
      const invitation=(await client.query('SELECT * FROM user_invitations WHERE token_hash=$1 FOR UPDATE',[digest(token)])).rows[0];
      if(!invitation||invitation.consumed_at||invitation.revoked_at||invitation.delivery_status!=='sent'||new Date(invitation.expires_at).getTime()<=Date.now())throw invalid();
      const people=(await client.query('SELECT id,email,role,status,school_id,password_hash FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[[invitation.user_id,invitation.issuer_id]])).rows;
      const recipient=people.find(person=>person.id===invitation.user_id),issuer=people.find(person=>person.id===invitation.issuer_id);
      if(!recipient||recipient.status!=='invited'||recipient.password_hash||recipient.role!==invitation.role||recipient.school_id!==invitation.school_id||recipient.email!==invitation.email||!issuer||!canGrantInvitation({...issuer,schoolId:issuer.school_id},invitation.role,invitation.school_id))throw invalid();
      const consumed=await client.query('UPDATE user_invitations SET consumed_at=now(),updated_at=now() WHERE id=$1 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>clock_timestamp() RETURNING id',[invitation.id]);
      if(!consumed.rows[0])throw invalid();
      await client.query("UPDATE users SET status='active',password_hash=$2,updated_at=now() WHERE id=$1",[recipient.id,passwordHash]);
      await client.query("INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,correlation_id,occurred_at) VALUES($1,$2,'user.activated','user',$2,$3,now())",[randomUUID(),recipient.id,invitation.id]);
    });
  }
  async activationAttempt(ip:string,token:string,password:string):Promise<void> {
    // Reserve a slot before validating, so parallel failures cannot bypass the shared budget.
    // Success releases its slot; invalid attempts remain counted even when activation rolls back.
    const windowStarted=await this.db.transaction(client=>this.limit(client,`activation:${digest(ip)}`,60));
    await this.activate(token,password);
    await this.db.query('UPDATE invitation_rate_limits SET attempts=greatest(attempts-1,0) WHERE key=$1 AND window_started_at=$2',[`activation:${digest(ip)}`,windowStarted]);
  }
}
