import {BadRequestException,Body,Controller,HttpCode,HttpException,Inject,Post,Res,UnauthorizedException} from '@nestjs/common';
import {randomBytes,randomUUID} from 'node:crypto';
import {DatabaseService} from '../../database/database.service.js';
import {AuthService} from './auth.service.js';
import {TwoFactorService,type FactorInput} from './two-factor.service.js';
import {issueEmailOtp,sendIdentityMail,tokenDigest,verifiedEmail} from './identity-email.js';
import {Public} from './public.decorator.js';
import type {Response} from 'express';
import type {PoolClient} from 'pg';
@Controller('v1/auth/password-reset')
export class PasswordResetController {
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService,@Inject(AuthService) private readonly auth:AuthService,@Inject(TwoFactorService) private readonly factors:TwoFactorService){}
 @Public() @Post('request') @HttpCode(200)
 async request(@Body() body:{email?:string}){
  if(typeof body?.email!=='string'||body.email.length>320)throw new BadRequestException('Invalid email');
  await this.db.transaction(async client=>{
   const user=(await client.query("SELECT id FROM users WHERE email=$1 AND status='active' FOR UPDATE",[body.email!.trim().toLowerCase()])).rows[0];if(!user)return;
   const target=await verifiedEmail(client,user.id);if(!target)return;
   const old=(await client.query('SELECT requested_at FROM user_password_resets WHERE user_id=$1',[user.id])).rows[0];if(old&&Date.now()-new Date(old.requested_at).getTime()<60000)return;
   const token=randomBytes(32).toString('base64url'),expires=new Date(Date.now()+1800000);
   // Persist throttle even when SMTP is unavailable. Never expose delivery state.
   await client.query('INSERT INTO user_password_resets(user_id,token_hash,target,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET token_hash=$2,target=$3,expires_at=$4,requested_at=now(),consumed_at=NULL',[user.id,tokenDigest(token),target,expires]);
   try{const base=new URL(process.env.WEB_URL??'');if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash)throw Error('Invalid origin');const url=new URL('/reset-password',base);url.searchParams.set('token',token);await sendIdentityMail(target,'Solar Roof password reset',`Open this link within 30 minutes to reset your password:\n${url.toString()}\nIf you did not request this, ignore this email.`);}catch{await client.query('UPDATE user_password_resets SET consumed_at=now() WHERE user_id=$1',[user.id]);}
  });return {success:true};
 }
 private async token(client:PoolClient,token:unknown){
  if(typeof token!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(token))throw new UnauthorizedException('Invalid or expired reset link');
  const peek=(await client.query('SELECT user_id FROM user_password_resets WHERE token_hash=$1',[tokenDigest(token)])).rows[0];if(!peek)throw new UnauthorizedException('Invalid or expired reset link');
  // All identity changes acquire users before factor/token rows.
  const user=(await client.query("SELECT id FROM users WHERE id=$1 AND status='active' FOR UPDATE",[peek.user_id])).rows[0];
  const row=(await client.query('SELECT * FROM user_password_resets WHERE user_id=$1 AND token_hash=$2 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE',[peek.user_id,tokenDigest(token)])).rows[0];
  if(!user||!row||row.target!==await verifiedEmail(client,user.id))throw new UnauthorizedException('Invalid or expired reset link');return user.id as string;
 }
 @Public() @Post('inspect') @HttpCode(200)
 async inspect(@Body() body:{token?:string}){return this.db.transaction(async client=>{const id=await this.token(client,body?.token);const row=(await client.query('SELECT enabled FROM user_authenticators WHERE user_id=$1',[id])).rows[0];return {valid:true,requiresTwoFactor:!!row?.enabled,...await this.factors.challengeInTransaction(client,id)};});}
 @Public() @Post('email-code') @HttpCode(200)
 async emailCode(@Body() body:{token?:string}){return this.db.transaction(async client=>{const id=await this.token(client,body?.token);const row=(await client.query('SELECT enabled,method FROM user_authenticators WHERE user_id=$1',[id])).rows[0];if(!row?.enabled||row.method!=='email')throw new BadRequestException('Email factor is not enabled');return issueEmailOtp(client,id,'reset');});}
 @Public() @Post('confirm') @HttpCode(200)
 async confirm(@Body() body:{token?:string;newPassword?:string}&FactorInput,@Res({passthrough:true}) res?:Response){
  if(typeof body?.newPassword!=='string'||body.newPassword.length<12||body.newPassword.length>128||(body.secondFactorCode!==undefined&&(typeof body.secondFactorCode!=='string'||body.secondFactorCode.length>16))||(body.recoveryCode!==undefined&&(typeof body.recoveryCode!=='string'||body.recoveryCode.length>32)))throw new BadRequestException('Invalid reset fields');
  const result=await this.db.transaction(async client=>{const id=await this.token(client,body.token);const factor=await this.factors.loginFactorInTransaction(client,id,body,'reset');if(factor!=='verified')return factor;
   await client.query('UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1',[id,this.auth.hashPassword(body.newPassword!)]);
   await client.query('UPDATE auth_sessions SET revoked_at=now(),refresh_hash=NULL WHERE user_id=$1 AND revoked_at IS NULL',[id]);
   await client.query('UPDATE user_password_resets SET consumed_at=now() WHERE user_id=$1',[id]);
   await client.query('DELETE FROM user_email_otp WHERE user_id=$1',[id]);
   await client.query("INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,correlation_id) VALUES($1,$2,'user.password_reset','user',$2,$3)",[randomUUID(),id,randomUUID()]);return 'verified';});
  if(result==='limited')throw new HttpException('Too many second-factor attempts; retry in 5 minutes',429);
  if(result!=='verified')throw new UnauthorizedException('Valid second factor is required');
  res?.clearCookie('access_token',{path:'/'});res?.clearCookie('refresh_token',{path:'/'});
  return {success:true};
 }
}
