import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PasswordResetController} from './password-reset.controller.js';
import {AuthService} from './auth.service.js';
import {TwoFactorService} from './two-factor.service.js';
import {tokenDigest,consumeEmailOtp,issueEmailOtp} from './identity-email.js';
const auth=new AuthService('test-access','test-refresh');
test('reset requests use identical generic results for unknown and unverified accounts without delivery',async()=>{
 for(const rows of [[],[{id:'a'}]]){
  const db={transaction:async(fn:any)=>fn({query:async(sql:string)=>({rows:sql.includes('SELECT id')?rows:[{email:'a@example.com',verified_email:null,email_verified_at:null}]})})};
  const controller=new PasswordResetController(db as never,auth,{} as never);assert.deepEqual(await controller.request({email:'a@example.com'}),{success:true});
 }
});
test('reset missing/invalid second factor never changes password or consumes reset token',async()=>{
 const queries:string[]=[],id='user-a',token='a'.repeat(43);
 const query=async(sql:string)=>{queries.push(sql);if(sql.includes('FROM user_password_resets'))return {rows:[{user_id:id,target:'a@example.com'}]};if(sql.includes('FROM users'))return {rows:[{id,email:'a@example.com',verified_email:'a@example.com',email_verified_at:new Date()}]};if(sql.includes('FROM user_authenticators'))return {rows:[{enabled:true,method:'email',attempts:0,attempt_window_started_at:new Date(0),recovery_hashes:[]}]};return {rows:[],rowCount:0};};
 const db={query,transaction:async(fn:any)=>fn({query})};const factors=new TwoFactorService(db as never,auth);const controller=new PasswordResetController(db as never,auth,factors);
 await assert.rejects(()=>controller.confirm({token,newPassword:'new-correct-password-123'}),/second factor/);
 await assert.rejects(()=>controller.confirm({token,newPassword:'new-correct-password-123',secondFactorCode:'000000'}),/second factor/);
 assert.equal(queries.some(sql=>sql.startsWith('UPDATE users SET password')),false);assert.equal(queries.some(sql=>sql.startsWith('UPDATE user_password_resets SET consumed')),false);
 assert.ok(queries.some(sql=>sql.startsWith('UPDATE user_authenticators SET attempts')));
});
test('email OTP consumption binds purpose and currently verified target and hashes the code',async()=>{
 let parameters:unknown[]=[];const client={query:async(sql:string,values:unknown[])=>{if(sql.includes('FROM users'))return {rows:[{email:'a@example.com',verified_email:'a@example.com',email_verified_at:new Date()}]};parameters=values;return {rowCount:1};}};
 assert.equal(await consumeEmailOtp(client as never,'user-a','reset','123456'),true);
 assert.deepEqual(parameters,['user-a','reset',tokenDigest('user-a:reset:123456'),'a@example.com']);assert.ok(!parameters.includes('123456'));
});
test('expired or consumed email challenges must be replaced even inside resend cooldown',async()=>{
 const saved=process.env.SMTP_HOST;delete process.env.SMTP_HOST;
 try{for(const old of [{sent_at:new Date(),expires_at:new Date(0),consumed_at:null,target:'a@example.com'},{sent_at:new Date(),expires_at:new Date(Date.now()+300000),consumed_at:new Date(),target:'a@example.com'}]){
 const client={query:async(sql:string)=>({rows:sql.includes('FROM users')?[{email:'a@example.com',verified_email:'a@example.com',email_verified_at:new Date()}]:[old]})};
 await assert.rejects(()=>issueEmailOtp(client as never,'user-a','login'),/configured/);
 }}finally{if(saved!==undefined)process.env.SMTP_HOST=saved;}
});

test('successful password reset clears both authentication cookies while failure preserves them',async()=>{
 const userId='user-a',token='a'.repeat(43);let clears:string[]=[];
 const query=async(sql:string)=>({rows:sql.includes('FROM user_password_resets')?[{user_id:userId,target:'a@example.com'}]:sql.includes('FROM users')?[{id:userId,email:'a@example.com',verified_email:'a@example.com',email_verified_at:new Date()}]:[],rowCount:1});
 const db={query,transaction:async(fn:any)=>fn({query})};let factor='verified';const factors={loginFactorInTransaction:async()=>factor};const controller=new PasswordResetController(db as never,auth,factors as never);const response={clearCookie:(name:string,options:unknown)=>{assert.deepEqual(options,{path:'/'});clears.push(name);}};
 await controller.confirm({token,newPassword:'replacement-password-123'},response as never);assert.deepEqual(clears,['access_token','refresh_token']);
 clears=[];factor='invalid';await assert.rejects(()=>controller.confirm({token,newPassword:'replacement-password-123'},response as never),/factor/);assert.deepEqual(clears,[]);
});
