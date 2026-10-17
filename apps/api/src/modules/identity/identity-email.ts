import {ServiceUnavailableException} from '@nestjs/common';
import {createHash,randomInt} from 'node:crypto';
import type {PoolClient} from 'pg';
import {MailerService} from '../mailer/mailer.service.js';

const mailer = new MailerService();

export type EmailPurpose='login'|'enroll'|'disable'|'reset';
export const tokenDigest=(value:string)=>createHash('sha256').update(value).digest('hex');
export const maskEmail=(email:string)=>email.replace(/^(.).*(@.*)$/,'$1***$2');
export async function verifiedEmail(client:PoolClient,userId:string):Promise<string|null>{
 const row=(await client.query('SELECT email,verified_email,email_verified_at FROM users WHERE id=$1',[userId])).rows[0];
 return row?.email_verified_at&&row.verified_email===row.email?row.email:null;
}
export async function sendIdentityMail(to:string,subject:string,text:string){
 if(!mailer.isConfigured())throw new ServiceUnavailableException('Email delivery is not configured');
 try{
  const sent=await mailer.sendMail({from:mailer.getDefaultFrom(),to,subject,text});
  if(!sent.accepted?.length)throw Error('rejected');
 }catch{
  throw new ServiceUnavailableException('Email delivery failed');
 }
}
/** Caller holds users row lock. Target is revalidated on both issue and consume. */
export async function issueEmailOtp(client:PoolClient,userId:string,purpose:EmailPurpose){
 const target=await verifiedEmail(client,userId);if(!target)throw new ServiceUnavailableException('A current verified email is required');
 const old=(await client.query('SELECT * FROM user_email_otp WHERE user_id=$1 AND purpose=$2 FOR UPDATE',[userId,purpose])).rows[0];
 if(old&&old.target===target&&!old.consumed_at&&new Date(old.expires_at).getTime()>Date.now()&&Date.now()-new Date(old.sent_at).getTime()<60000)return {method:'email' as const,maskedTarget:maskEmail(target),expiresAt:new Date(old.expires_at).toISOString()};
 const code=randomInt(0,1000000).toString().padStart(6,'0'),expiresAt=new Date(Date.now()+300000);
 await sendIdentityMail(target,'Solar Roof security code',`Your Solar Roof ${purpose} security code is ${code}. It expires in 5 minutes. If you did not request this, ignore this email.`);
 await client.query('INSERT INTO user_email_otp(user_id,purpose,code_hash,target,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,purpose) DO UPDATE SET code_hash=$3,target=$4,expires_at=$5,sent_at=now(),consumed_at=NULL',[userId,purpose,tokenDigest(`${userId}:${purpose}:${code}`),target,expiresAt]);
 return {method:'email' as const,maskedTarget:maskEmail(target),expiresAt:expiresAt.toISOString()};
}
export async function consumeEmailOtp(client:PoolClient,userId:string,purpose:EmailPurpose,code:string){
 if(!/^\d{6}$/.test(code))return false;
 const target=await verifiedEmail(client,userId);if(!target)return false;
 return (await client.query('UPDATE user_email_otp SET consumed_at=now() WHERE user_id=$1 AND purpose=$2 AND code_hash=$3 AND target=$4 AND consumed_at IS NULL AND expires_at>now() RETURNING user_id',[userId,purpose,tokenDigest(`${userId}:${purpose}:${code}`),target])).rowCount===1;
}
