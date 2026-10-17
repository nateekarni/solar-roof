import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException, Optional, UnauthorizedException } from '@nestjs/common';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {DatabaseService} from '../../database/database.service.js';
import {AuthService} from './auth.service.js';
import {MailerService} from '../mailer/mailer.service.js';
import {customerScope, type ScopePrincipal} from '../../common/auth/route-policy.js';
import {validateDomainRules, validateScope} from '../../common/auth/authorization.js';
export type InvitationStatus='pending_delivery'|'sent'|'delivery_failed';
export interface InviteInput {
  email: string;
  displayName: string;
  phone?: string | null | undefined;
  role?: string;
  customerId?: string | null;
  siteId?: string;
  companyPosition?: string | null;
  permissions?: Record<string, boolean | null>;
  overrides?: Record<string, boolean | null>;
  scope?: {
    mode?: 'all' | 'selected';
    siteIds?: string[];
  };
}
export function canGrantInvitation(actor:ScopePrincipal & {status?:string}, role:string, customerId:string|null):boolean {
  if(actor.status!=='active'||!['owner','admin'].includes(actor.role??'')||!['operator','accountant','customer_user'].includes(role))return false;
  if(role==='customer_user')return actor.role==='owner'&&Boolean(customerId);
  return customerId===null;
}
const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
const invalid=()=>new UnauthorizedException('Invitation is invalid or expired');
@Injectable()
export class InvitationService {
  constructor(
    @Inject(DatabaseService) private readonly db:DatabaseService,
    @Inject(AuthService) private readonly auth:AuthService,
    @Optional() @Inject(MailerService) private readonly mailer?:MailerService
  ) {}
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
  private async actor(client:PoolClient | undefined,id:string) {
    const q = client ? (text:string,params:unknown[])=>client.query(text,params) : (text:string,params:unknown[])=>this.db.query(text,params);
    return (await q('SELECT id,role,status,customer_id AS "customerId" FROM users WHERE id=$1 FOR SHARE',[id])).rows[0];
  }
  private authorize(actor:any,role:string,customerId:string|null) {
    if(!actor||!canGrantInvitation(actor,role,customerId))throw new ForbiddenException('Cannot grant invitation role or customer scope');
  }
  async invite(input:InviteInput,actor:ScopePrincipal & {id:string}):Promise<{invitationId:string|null;status:InvitationStatus|'existing';userId:string}> {
    const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
    const displayName=typeof input.displayName==='string'?input.displayName.trim():'';
    const phone=typeof input.phone==='string'&&input.phone.trim()?input.phone.trim().slice(0,50):null;
    const role=input.role ?? (input.customerId ? 'customer_user' : 'operator');let customerId=input.customerId || null;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!displayName||displayName.length>200)throw new BadRequestException('Valid email and displayName are required');
    if(customerId&&!/^[a-f0-9-]{36}$/i.test(customerId))throw new BadRequestException('Invalid customerId');
    const token=randomBytes(32).toString('base64url'),invitationId=randomUUID();
    let userId=randomUUID();
    let existingUserId:string|undefined;
    await this.db.transaction(async client=>{
      const current=await this.actor(client,actor.id);
      if(!customerId&&current?.customerId&&role==='customer_user')customerId=current.customerId;
      this.authorize(current,role,customerId);
      let companyPositionId: string | null = null;
      if (typeof input.companyPosition === 'string' && input.companyPosition.trim()) {
        const posName = input.companyPosition.trim().slice(0, 120);
        const inserted = (await client.query(
          'INSERT INTO employee_positions(id,name) VALUES($1,$2) ON CONFLICT (employee_position_name_key(name)) DO NOTHING RETURNING id',
          [randomUUID(), posName]
        )).rows[0];
        const position = inserted ?? (await client.query(
          'SELECT id FROM employee_positions WHERE employee_position_name_key(name)=employee_position_name_key($1) FOR SHARE',
          [posName]
        )).rows[0];
        companyPositionId = position?.id ?? null;
      }
      const domain = current.role === 'owner' ? 'business' : 'technical';
      let overridesMap: Record<string, boolean | null> | undefined;
      if (input.permissions !== undefined || input.overrides !== undefined) {
        overridesMap = validateDomainRules(domain, input.permissions ?? input.overrides);
      }
      let validatedScope: { mode: 'all' | 'selected'; siteIds: string[] } | undefined;
      if (input.scope !== undefined) {
        validatedScope = validateScope(input.scope);
        if (validatedScope.siteIds.length > 0) {
          const sites = await client.query('SELECT id FROM sites WHERE id=ANY($1::uuid[]) FOR SHARE', [validatedScope.siteIds]);
          if (sites.rows.length !== validatedScope.siteIds.length) throw new BadRequestException('Unknown site scope');
        }
      }
      const existing=(await client.query('SELECT id,role,status,password_hash FROM users WHERE email=$1 FOR UPDATE',[email])).rows[0];
      if(existing&&['operator','accountant'].includes(role)&&['operator','accountant'].includes(existing.role)){
        if(companyPositionId){
          await client.query('UPDATE users SET company_position_id=$2 WHERE id=$1',[existing.id,companyPositionId]);
        }
        const hasCustomGrants = overridesMap !== undefined || validatedScope !== undefined;
        if(hasCustomGrants) {
          const overrides = JSON.stringify(overridesMap ?? {});
          const scopeMode = validatedScope?.mode ?? 'selected';
          const siteIds = scopeMode === 'all' ? [] : (validatedScope?.siteIds ?? []);
          await client.query(
            `INSERT INTO employee_domain_grants(user_id,domain,position_id,overrides,scope_mode,site_ids,updated_by)
             VALUES($1,$2,$3,$4::jsonb,$5,$6::uuid[],$7)
             ON CONFLICT(user_id,domain) DO UPDATE SET
               position_id=COALESCE(excluded.position_id, employee_domain_grants.position_id),
               overrides=CASE WHEN $8 THEN excluded.overrides ELSE employee_domain_grants.overrides END,
               scope_mode=CASE WHEN $9 THEN excluded.scope_mode ELSE employee_domain_grants.scope_mode END,
               site_ids=CASE WHEN $9 THEN excluded.site_ids ELSE employee_domain_grants.site_ids END,
               updated_by=excluded.updated_by,
               updated_at=now()`,
            [existing.id, domain, companyPositionId, overrides, scopeMode, siteIds, actor.id, overridesMap !== undefined, validatedScope !== undefined]
          );
        } else {
          await client.query(
            `INSERT INTO employee_domain_grants(user_id,domain,position_id,updated_by)
             VALUES($1,$2,$3,$4)
             ON CONFLICT(user_id,domain) DO UPDATE SET
               position_id=COALESCE(excluded.position_id, employee_domain_grants.position_id),
               updated_by=excluded.updated_by,
               updated_at=now()`,
            [existing.id, domain, companyPositionId, actor.id]
          );
        }
        await client.query('UPDATE users SET permission_revision=permission_revision+1, updated_at=now() WHERE id=$1',[existing.id]);
        if(existing.password_hash !== null) {
          existingUserId=existing.id;
          return;
        }
        // Account has no password (e.g. invite was cancelled or expired): re-issue fresh invitation!
        await client.query("UPDATE users SET status='invited', display_name=$2, phone=COALESCE($3, phone), updated_at=now() WHERE id=$1", [existing.id, displayName, phone]);
        await client.query("UPDATE user_invitations SET revoked_at=now(), consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL", [existing.id]);
        await client.query(`INSERT INTO user_invitations(id,user_id,issuer_id,email,role,customer_id,token_hash,expires_at,delivery_status)
          VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '24 hours','pending_delivery')`,[invitationId,existing.id,actor.id,email,role,customerId,digest(token)]);
        await client.query("INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,correlation_id,occurred_at) VALUES($1,$2,'user.reinvited','user',$3,$4,now())",[randomUUID(),actor.id,existing.id,invitationId]);
        userId = existing.id;
        return;
      }
      if(customerId&&!(await client.query('SELECT id FROM customers WHERE id=$1',[customerId])).rows[0])throw new BadRequestException('Customer not found');
      await this.limit(client,`delivery:${actor.id}:${email}`,3600);
      const inserted=await client.query(`INSERT INTO users(id,email,display_name,role,status,customer_id,password_hash,company_position_id,phone)
        VALUES($1,$2,$3,$4,'invited',$5,NULL,$6,$7) ON CONFLICT(email) DO NOTHING RETURNING id`,[userId,email,displayName,role,customerId,companyPositionId,phone]);
      if(!inserted.rows[0])throw new ConflictException('User already exists; use resend for an outstanding invitation');
      if(role!=='customer_user') {
        const overrides = JSON.stringify(overridesMap ?? {});
        const scopeMode = validatedScope?.mode ?? 'selected';
        const siteIds = scopeMode === 'all' ? [] : (validatedScope?.siteIds ?? []);
        await client.query(
          `INSERT INTO employee_domain_grants(user_id,domain,position_id,overrides,scope_mode,site_ids,updated_by)
           VALUES($1,$2,$3,$4::jsonb,$5,$6::uuid[],$7)
           ON CONFLICT (user_id,domain) DO UPDATE SET
             position_id=COALESCE(excluded.position_id, employee_domain_grants.position_id),
             overrides=excluded.overrides,
             scope_mode=excluded.scope_mode,
             site_ids=excluded.site_ids,
             updated_by=excluded.updated_by,
             updated_at=now()`,
          [userId, domain, companyPositionId, overrides, scopeMode, siteIds, actor.id]
        );
      }
      if(input.siteId) {
        const site=(await client.query('SELECT customer_id FROM sites WHERE id=$1 AND customer_id=$2 FOR SHARE',[input.siteId,customerId])).rows[0];
        if(role!=='customer_user'||!site)throw new BadRequestException('Invalid site assignment');
        await client.query('INSERT INTO site_account_assignments(id,user_id,site_id,assigned_by) VALUES($1,$2,$3,$4)',[randomUUID(),userId,input.siteId,actor.id]);
      }
      await client.query(`INSERT INTO user_invitations(id,user_id,issuer_id,email,role,customer_id,token_hash,expires_at,delivery_status)
        VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '24 hours','pending_delivery')`,[invitationId,userId,actor.id,email,role,customerId,digest(token)]);
      await client.query("INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,correlation_id,occurred_at,after_json) VALUES($1,$2,'user.invited','user',$3,$4,now(),$5::jsonb)",[randomUUID(),actor.id,userId,invitationId,JSON.stringify({email,role,customerId,siteId:input.siteId??null,domain,companyPositionId})]);
    });
    if(existingUserId)return {invitationId:null,status:'existing',userId:existingUserId};
    return {invitationId,status:await this.deliver(invitationId,email,token),userId};
  }
  async findOutstanding(email:string,actor:ScopePrincipal & {id:string}) {
    if(typeof email!=='string'||!email.trim())throw new BadRequestException('Email is required');
    const invitation=(await this.db.query(`SELECT i.* FROM user_invitations i JOIN users u ON u.id=i.user_id
      WHERE i.email=$1 AND i.consumed_at IS NULL AND u.status='invited'`,[email.trim().toLowerCase()])).rows[0];
    if(!invitation)throw new NotFoundException('Outstanding invitation not found');
    this.authorize(await this.actor(undefined,actor.id),invitation.role,invitation.customer_id);
    return {invitationId:invitation.id,status:invitation.delivery_status as InvitationStatus};
  }
  async resend(invitationId:string,actor:ScopePrincipal & {id:string}):Promise<{invitationId:string;status:InvitationStatus}> {
    if(!/^[a-f0-9-]{36}$/i.test(invitationId))throw new NotFoundException('Invitation not found');
    const token=randomBytes(32).toString('base64url');
    const email=await this.db.transaction(async client=>{
      const invitation=(await client.query('SELECT * FROM user_invitations WHERE id=$1 FOR UPDATE',[invitationId])).rows[0];
      if(!invitation)throw new NotFoundException('Invitation not found');
      this.authorize(await this.actor(client,actor.id),invitation.role,invitation.customer_id);
      const recipient=(await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[invitation.user_id])).rows[0];
      if(!recipient||recipient.status!=='invited'||recipient.role!==invitation.role||recipient.customer_id!==invitation.customer_id||recipient.email!==invitation.email||recipient.password_hash||invitation.consumed_at)throw new ConflictException('Invitation is no longer eligible for resend');
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
        const web=new URL(process.env.WEB_URL ?? '');
        if(!['http:','https:'].includes(web.protocol)||web.username||web.password||web.search||web.hash)throw new Error('Invalid web origin');
        const url=new URL('/activate',web);url.searchParams.set('token',token);
        
        const company=(await this.db.query('SELECT company_name, logo_data, logo_url FROM company_profile LIMIT 1')).rows[0];
        const companyName=company?.company_name||'Solar Roof';
        const logoSrc=company?.logo_url||company?.logo_data||'';
        const recipient=(await this.db.query('SELECT u.display_name, u.role FROM user_invitations i JOIN users u ON u.id = i.user_id WHERE i.id = $1',[id])).rows[0];
        const displayName=recipient?.display_name||'';
        const roleLabel=recipient?.role==='customer_user'?'ผู้ใช้งานลูกค้า (Customer User)':recipient?.role==='operator'?'เจ้าหน้าที่ปฏิบัติการ (Operator)':recipient?.role==='accountant'?'เจ้าหน้าที่บัญชี (Accountant)':recipient?.role==='admin'?'ผู้ดูแลระบบ (Admin)':'ผู้ดูแล (Owner)';

        const logoHtml=logoSrc?`<div style="text-align:center;margin-bottom:16px;"><img src="${logoSrc}" alt="${companyName}" style="max-height:56px;max-width:220px;object-fit:contain;" /></div>`:'';
        const htmlBody=`<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>หนังสือเชิญเปิดใช้งานบัญชีผู้ใช้ระบบ Solar Roof</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f8fafc;margin:0;padding:24px;color:#1e293b;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
    <div style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid #f1f5f9;background:#ffffff;">
      ${logoHtml}
      <h1 style="font-size:20px;font-weight:700;color:#0f172a;margin:0;">${companyName}</h1>
      <p style="font-size:13px;color:#64748b;margin:4px 0 0 0;">ระบบบริหารจัดการพลังงานแสงอาทิตย์ (Solar Roof Management System)</p>
    </div>
    <div style="padding:32px;line-height:1.6;font-size:15px;">
      <div style="font-weight:600;font-size:16px;margin-bottom:16px;color:#0f172a;">เรียน คุณ ${displayName || email} (Dear ${displayName || email}),</div>
      <p style="margin:0 0 16px 0;">ท่านได้รับคำเชิญให้เปิดใช้งานบัญชีผู้ใช้ในระบบ <strong>Solar Roof</strong> ภายใต้การกำกับดูแลของ <strong>${companyName}</strong></p>
      <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:24px 0;font-size:14px;">
        <div style="margin-bottom:8px;"><strong>บทบาทที่ได้รับมอบหมาย / Assigned Role:</strong> ${roleLabel}</div>
        <div><strong>ที่อยู่อีเมล / Account Email:</strong> ${email}</div>
      </div>
      <p style="margin:0 0 24px 0;">กรุณากดปุ่มด้านล่างเพื่อตั้งรหัสผ่านและเปิดใช้งานบัญชีของท่านภายใน 24 ชั่วโมง:</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${url.toString()}" style="display:inline-block;background-color:#f59e0b;color:#ffffff !important;font-weight:600;font-size:16px;padding:14px 32px;border-radius:8px;text-decoration:none;box-shadow:0 2px 4px rgba(245,158,11,0.25);" target="_blank">เปิดใช้งานบัญชีผู้ใช้ / Activate Account</a>
      </div>
      <p style="font-size:13px;color:#64748b;margin:24px 0 0 0;line-height:1.5;">หากปุ่มด้านบนไม่ทำงาน สามารถคัดลอกลิงก์ต่อไปนี้ไปวางในเบราว์เซอร์ของท่าน:<br>
        <a href="${url.toString()}" style="word-break:break-all;color:#3b82f6;">${url.toString()}</a>
      </p>
    </div>
    <div style="padding:24px 32px;background-color:#f8fafc;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8;text-align:center;line-height:1.5;">
      <p style="margin:0 0 8px 0;">คำชี้แจงความปลอดภัย: ลิงก์นี้สามารถใช้งานได้เพียงครั้งเดียวและจะหมดอายุภายใน 24 ชั่วโมง หากท่านไม่คาดคิดว่าจะได้รับอีเมลฉบับนี้ สามารถละเว้นหรือลบอีเมลฉบับนี้ได้</p>
      <p style="margin:0;">&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

        const plainText=`เรียน คุณ ${displayName || email} (Dear ${displayName || email}),\n\nท่านได้รับคำเชิญให้เปิดใช้งานบัญชีผู้ใช้ในระบบ Solar Roof ภายใต้การกำกับดูแลของ ${companyName}\nบทบาทที่ได้รับมอบหมาย: ${roleLabel} (${email})\n\nกรุณาเปิดลิงก์ด้านล่างภายใน 24 ชั่วโมงเพื่อตั้งรหัสผ่านและเปิดใช้งานบัญชี:\n${url.toString()}\n\nคำชี้แจงความปลอดภัย: ลิงก์นี้จะหมดอายุภายใน 24 ชั่วโมง หากท่านไม่ได้คาดคิดว่าจะได้รับคำเชิญนี้ โปรดเพิกเฉยต่ออีเมลฉบับนี้`;

        const mailer = this.mailer ?? new MailerService();
        const sent = await mailer.sendMail({
          from: mailer.getDefaultFrom(),
          to: email,
          subject: `หนังสือเชิญเปิดใช้งานบัญชีผู้ใช้ระบบ Solar Roof · ${companyName}`,
          text: plainText,
          html: htmlBody,
        });
        if(sent.accepted?.length)status='sent';
      } catch { /* Delivery failure is persisted; SMTP errors can contain token-bearing message data. */ }
    }
    const update=await this.db.query("UPDATE user_invitations SET delivery_status=$3,revoked_at=CASE WHEN $3='delivery_failed' THEN now() ELSE revoked_at END,updated_at=now() WHERE id=$1 AND token_hash=$2 RETURNING delivery_status",[id,digest(token),status]);
    return update.rows[0]?.delivery_status ?? (await this.db.query('SELECT delivery_status FROM user_invitations WHERE id=$1',[id])).rows[0]?.delivery_status ?? 'delivery_failed';
  }

  async getInvitationDetails(token:string):Promise<{email:string;displayName:string;role:string;companyName:string;logoUrl:string|null}> {
    if(typeof token!=='string'||!/^[\w-]{43}$/.test(token))throw invalid();
    const tokenHash=digest(token);
    const row=(await this.db.query(
      `SELECT i.email,i.role,i.expires_at,i.consumed_at,i.revoked_at,
              u.display_name AS "displayName",u.status AS "userStatus"
       FROM user_invitations i
       JOIN users u ON u.id = i.user_id
       WHERE i.token_hash = $1`,
      [tokenHash]
    )).rows[0];

    if(!row||row.consumed_at||row.revoked_at||new Date(row.expires_at).getTime()<=Date.now()||row.userStatus!=='invited'){
      throw invalid();
    }

    const company=(await this.db.query('SELECT company_name, logo_data, logo_url FROM company_profile LIMIT 1')).rows[0];
    return {
      email:row.email,
      displayName:row.displayName||'',
      role:row.role,
      companyName:company?.company_name||'Solar Roof',
      logoUrl:company?.logo_url||company?.logo_data||null,
    };
  }

  async activate(token:string,password:string,displayName?:string,avatarData?:string):Promise<void> {
    if(typeof token!=='string'||!/^[\w-]{43}$/.test(token))throw invalid();
    if(typeof password!=='string'||password.length<12||password.length>128)throw new BadRequestException('Password must be between 12 and 128 characters');
    const cleanName=typeof displayName==='string'&&displayName.trim().length>=2?displayName.trim().slice(0,200):null;
    let cleanAvatar:string|null=null;
    if(typeof avatarData==='string'&&avatarData.trim().startsWith('data:image/')){
      if(avatarData.length>2_800_000)throw new BadRequestException('Avatar image exceeds 2MB limit');
      cleanAvatar=avatarData.trim();
    }
    const passwordHash=this.auth.hashPassword(password);
    await this.db.transaction(async client=>{
      const invitation=(await client.query('SELECT * FROM user_invitations WHERE token_hash=$1 FOR UPDATE',[digest(token)])).rows[0];
      if(!invitation||invitation.consumed_at||invitation.revoked_at||invitation.delivery_status!=='sent'||new Date(invitation.expires_at).getTime()<=Date.now())throw invalid();
      const people=(await client.query('SELECT id,email,role,status,customer_id,password_hash FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[[invitation.user_id,invitation.issuer_id]])).rows;
      const recipient=people.find(person=>person.id===invitation.user_id),issuer=people.find(person=>person.id===invitation.issuer_id);
      if(!recipient||recipient.status!=='invited'||recipient.password_hash||recipient.role!==invitation.role||recipient.customer_id!==invitation.customer_id||recipient.email!==invitation.email||!issuer||!canGrantInvitation({...issuer,customerId:issuer.customer_id},invitation.role,invitation.customer_id))throw invalid();
      const consumed=await client.query('UPDATE user_invitations SET consumed_at=now(),updated_at=now() WHERE id=$1 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>clock_timestamp() RETURNING id',[invitation.id]);
      if(!consumed.rows[0])throw invalid();
      await client.query(
        "UPDATE users SET status='active',password_hash=$2,display_name=COALESCE($3,display_name),avatar_data=COALESCE($4,avatar_data),updated_at=now() WHERE id=$1",
        [recipient.id,passwordHash,cleanName,cleanAvatar]
      );
      await client.query("INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,correlation_id,occurred_at,before_json,after_json) VALUES($1,$2,'user.activated','user',$2,$3,now(),$4::jsonb,$5::jsonb)",[randomUUID(),recipient.id,invitation.id,JSON.stringify({status:'invited',email:recipient.email}),JSON.stringify({status:'active',email:recipient.email,displayName:cleanName??recipient.display_name})]);
    });
  }
  async activationAttempt(ip:string,token:string,password:string,displayName?:string,avatarData?:string):Promise<void> {
    const windowStarted=await this.db.transaction(client=>this.limit(client,`activation:${digest(ip)}`,60));
    await this.activate(token,password,displayName,avatarData);
    await this.db.query('UPDATE invitation_rate_limits SET attempts=greatest(attempts-1,0) WHERE key=$1 AND window_started_at=$2',[`activation:${digest(ip)}`,windowStarted]);
  }
}
