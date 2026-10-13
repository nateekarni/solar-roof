import {BadRequestException,ConflictException,HttpException,Inject,Injectable,ServiceUnavailableException,UnauthorizedException} from '@nestjs/common';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {consumeEmailOtp,issueEmailOtp,maskEmail,verifiedEmail,type EmailPurpose} from './identity-email.js';
import type {PoolClient} from 'pg';
import {DatabaseService} from '../../database/database.service.js';
import {AuthService} from './auth.service.js';
import {decryptSecret,encryptSecret,encodeBase32,matchTotpCounter} from './totp.js';

export interface FactorInput {secondFactorCode?:string|undefined;recoveryCode?:string|undefined;}
type FactorResult='required'|'verified'|'invalid'|'limited';
interface Credential {enabled:boolean;method?:'totp'|'email';pending_method?:'totp'|'email'|null;secret_encrypted:string|null;pending_secret_encrypted:string|null;pending_expires_at:Date|null;last_counter:string|number;recovery_hashes:string[];attempts:number;attempt_window_started_at:Date;}
const digest=(code:string)=>createHash('sha256').update(code.toUpperCase().replace(/-/g,'')).digest('hex');

@Injectable()
export class TwoFactorService {
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService,@Inject(AuthService) private readonly auth:AuthService,private readonly key:()=>string|undefined=()=>process.env.TOTP_ENCRYPTION_KEY){}

 async status(userId:string){
  const row=(await this.db.query<Credential>('SELECT * FROM user_authenticators WHERE user_id=$1',[userId])).rows[0];
  const user=(await this.db.query('SELECT email,verified_email,email_verified_at FROM users WHERE id=$1',[userId])).rows[0];const emailAvailable=!!process.env.SMTP_HOST&&!!user?.email_verified_at&&user.verified_email===user.email;
  const emailPending=row?.pending_method==='email'?(await this.db.query("SELECT expires_at FROM user_email_otp WHERE user_id=$1 AND purpose='enroll' AND consumed_at IS NULL AND expires_at>now() AND target=$2",[userId,user?.email])).rows[0]:null;
  return {method:row?.enabled?(row.method??'totp'):null,emailAvailable,maskedTarget:emailAvailable?maskEmail(user.email):null,enabled:row?.enabled??false,pending:!!emailPending||(!!row?.pending_expires_at&&new Date(row.pending_expires_at).getTime()>Date.now()),recoveryCodesRemaining:row?.enabled?row.recovery_hashes.length:0};
 }
 private async credential(client:PoolClient,userId:string):Promise<Credential>{
  await client.query('INSERT INTO user_authenticators(user_id) VALUES($1) ON CONFLICT DO NOTHING',[userId]);
  return (await client.query<Credential>('SELECT * FROM user_authenticators WHERE user_id=$1 FOR UPDATE',[userId])).rows[0]!;
 }
 private async reserve(client:PoolClient,userId:string,row:Credential):Promise<boolean>{
  const now=new Date(),expired=now.getTime()-new Date(row.attempt_window_started_at).getTime()>=300000;
  const attempts=expired?0:row.attempts;
  if(attempts>=5)return false;
  await client.query('UPDATE user_authenticators SET attempts=$2,attempt_window_started_at=$3,updated_at=NOW() WHERE user_id=$1',[userId,attempts+1,expired?now:row.attempt_window_started_at]);
  return true;
 }
 private async resetAttempts(client:PoolClient,userId:string){await client.query('UPDATE user_authenticators SET attempts=$2,attempt_window_started_at=$3,updated_at=NOW() WHERE user_id=$1',[userId,0,new Date()]);}
 private async verify(client:PoolClient,userId:string,row:Credential,input:FactorInput,purpose:EmailPurpose='login'):Promise<boolean>{
  if(!!input.secondFactorCode===!!input.recoveryCode)return false;
  if(input.recoveryCode){
   if(!/^[a-fA-F0-9]{8}-?[a-fA-F0-9]{8}$/.test(input.recoveryCode))return false;
   const hash=digest(input.recoveryCode),index=row.recovery_hashes.indexOf(hash);if(index<0)return false;
   const remaining=row.recovery_hashes.filter((_,i)=>i!==index);
   await client.query('UPDATE user_authenticators SET recovery_hashes=$2,updated_at=NOW() WHERE user_id=$1',[userId,remaining]);
  }else if(row.method==='email'){if(!await consumeEmailOtp(client,userId,purpose,input.secondFactorCode!))return false;
  }else{
   const secret=decryptSecret(row.secret_encrypted!,userId,this.key());
   const counter=matchTotpCounter(secret,input.secondFactorCode!,Date.now(),Number(row.last_counter));if(counter===null)return false;
   await client.query('UPDATE user_authenticators SET last_counter=$2,updated_at=NOW() WHERE user_id=$1',[userId,counter]);
  }
  await this.resetAttempts(client,userId);return true;
 }
 /** Caller holds the users row lock through session insertion; enrollment uses
  * the same lock order, so enabling 2FA cannot race a password-only login. */
 async loginFactorInTransaction(client:PoolClient,userId:string,input:FactorInput,purpose:EmailPurpose='login'):Promise<FactorResult>{
  const row=(await client.query<Credential>('SELECT * FROM user_authenticators WHERE user_id=$1 FOR UPDATE',[userId])).rows[0];
  if(!row?.enabled)return 'verified';
  if(!input.secondFactorCode&&!input.recoveryCode){if(row.method==='email'&&purpose==='login')await issueEmailOtp(client,userId,'login');return 'required';}
  if(!await this.reserve(client,userId,row))return 'limited';
  return await this.verify(client,userId,row,input,purpose)?'verified':'invalid';
 }
 private async sensitive<T>(userId:string,password:string,work:(client:PoolClient,row:Credential,email:string)=>Promise<T>):Promise<T>{
  if(typeof password!=='string'||password.length<1||password.length>128)throw new BadRequestException('Current password is required');
  // Return credential failures from the transaction, then throw after commit.
  // Throwing within it would roll back the persisted failed-attempt counter.
  const result=await this.db.transaction(async client=>{
   const user=(await client.query('SELECT id,email,password_hash FROM users WHERE id=$1 AND status=\'active\' FOR UPDATE',[userId])).rows[0];
   if(!user)return {error:new UnauthorizedException('Account is inactive')};
   const row=await this.credential(client,userId);
   if(!await this.reserve(client,userId,row))return {error:new HttpException('Too many second-factor attempts; retry in 5 minutes',429)};
   if(!user.password_hash||!this.auth.verifyPassword(password,user.password_hash))return {error:new UnauthorizedException('Current password is incorrect')};
   try{return {value:await work(client,row,user.email)};}catch(error){if(error instanceof HttpException)return {error};throw error;}
  });
  if(result.error)throw result.error;return result.value!;
 }
 async enroll(userId:string,password:string):Promise<{secret:string;otpauthUri:string;expiresAt:string}>;
 async enroll(userId:string,password:string,method:'totp'|'email'|undefined):Promise<{secret?:string;otpauthUri?:string;method?:'email';maskedTarget?:string;expiresAt:string}>;
 async enroll(userId:string,password:string,method:'totp'|'email'='totp'){
  return this.sensitive(userId,password,async(client,row,email)=>{
   if(row.enabled)throw new ConflictException('Authenticator is already enabled');
   if(method==='email'){const result=await issueEmailOtp(client,userId,'enroll');await client.query("UPDATE user_authenticators SET pending_method='email',pending_secret_encrypted=NULL,pending_expires_at=NULL WHERE user_id=$1",[userId]);return result;}
   await client.query("UPDATE user_authenticators SET pending_method='totp' WHERE user_id=$1",[userId]);
   const secret=encodeBase32(randomBytes(20)),expiresAt=new Date(Date.now()+600000);
   let encrypted:string;try{encrypted=encryptSecret(secret,userId,this.key());}catch{throw new ServiceUnavailableException('Authenticator encryption is not configured');}
   await client.query('UPDATE user_authenticators SET pending_secret_encrypted=$2,pending_expires_at=$3,updated_at=NOW() WHERE user_id=$1',[userId,encrypted,expiresAt]);
   await this.audit(client,userId,'user.authenticator_enrollment');
   return {secret,otpauthUri:`otpauth://totp/${encodeURIComponent('Solar Roof:'+email)}?secret=${secret}&issuer=Solar%20Roof&algorithm=SHA1&digits=6&period=30`,expiresAt:expiresAt.toISOString()};
  });
 }
 async confirm(userId:string,password:string,code:string){
  return this.sensitive(userId,password,async(client,row)=>{
   if(row.pending_method==='email'&&!row.enabled){if(!await consumeEmailOtp(client,userId,'enroll',code))throw new UnauthorizedException('Invalid second factor');const recoveryCodes=Array.from({length:10},()=>{const v=randomBytes(8).toString('hex');return v.slice(0,8)+'-'+v.slice(8);});await client.query("UPDATE user_authenticators SET enabled=true,method='email',pending_method=NULL,recovery_hashes=$2 WHERE user_id=$1",[userId,recoveryCodes.map(digest)]);await this.resetAttempts(client,userId);await this.revoke(client,userId);await this.audit(client,userId,'user.email_factor_enabled');return {enabled:true as const,recoveryCodes};}
   if(row.enabled||!row.pending_secret_encrypted||!row.pending_expires_at||new Date(row.pending_expires_at).getTime()<=Date.now())throw new BadRequestException('Pending enrollment is missing or expired');
   const secret=decryptSecret(row.pending_secret_encrypted,userId,this.key());
   const counter=matchTotpCounter(secret,code,Date.now(),-1);if(counter===null)throw new UnauthorizedException('Invalid second factor');
   const recoveryCodes=Array.from({length:10},()=>{const value=randomBytes(8).toString('hex');return value.slice(0,8)+'-'+value.slice(8);});
   await client.query('UPDATE user_authenticators SET enabled=true,method=\'totp\',pending_method=NULL,secret_encrypted=pending_secret_encrypted,pending_secret_encrypted=NULL,pending_expires_at=NULL,last_counter=$2,recovery_hashes=$3,updated_at=NOW() WHERE user_id=$1',[userId,counter,recoveryCodes.map(digest)]);
   await this.resetAttempts(client,userId);await this.revoke(client,userId);await this.audit(client,userId,'user.authenticator_enabled');
   return {enabled:true as const,recoveryCodes};
  });
 }
 async disable(userId:string,password:string,input:FactorInput){
  return this.sensitive(userId,password,async(client,row)=>{
   if(!row.enabled)throw new BadRequestException('Authenticator is not enabled');
   if(!await this.verify(client,userId,row,input,'disable'))throw new UnauthorizedException('Invalid second factor');
   await client.query('UPDATE user_authenticators SET enabled=false,secret_encrypted=NULL,pending_secret_encrypted=NULL,pending_expires_at=NULL,last_counter=-1,recovery_hashes=\'{}\',updated_at=NOW() WHERE user_id=$1',[userId]);
   await this.revoke(client,userId);await this.audit(client,userId,'user.authenticator_disabled');return {success:true};
  });
 }
 async emailCode(userId:string,password:string){return this.sensitive(userId,password,async(client,row)=>{if(!row.enabled||row.method!=='email')throw new BadRequestException('Email factor is not enabled');return issueEmailOtp(client,userId,'disable');});}
 async challengeInTransaction(client:PoolClient,userId:string){const row=(await client.query<Credential>('SELECT * FROM user_authenticators WHERE user_id=$1',[userId])).rows[0];const target=row?.method==='email'?await verifiedEmail(client,userId):null;return {method:row?.method??'totp',...(target?{maskedTarget:maskEmail(target)}:{})};}
 private async revoke(client:PoolClient,userId:string){await client.query('DELETE FROM user_email_otp WHERE user_id=$1',[userId]);await client.query('UPDATE auth_sessions SET revoked_at=NOW(),refresh_hash=NULL WHERE user_id=$1 AND revoked_at IS NULL',[userId]);}
 private async audit(client:PoolClient,userId:string,action:string){await client.query('INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,correlation_id) VALUES($1,$2,$3,\'user\',$2,$4)',[randomUUID(),userId,action,randomUUID()]);}
}
