import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthService} from './auth.service.js';
import {TwoFactorService, type FactorInput} from './two-factor.service.js';
import {decryptSecret,totpCode} from './totp.js';
import {AuthController} from './auth.controller.js';
const key='12'.repeat(32),password='correct-password-123';
const auth=new AuthService('test-access-secret','test-refresh-secret');

// Only the external PostgreSQL boundary is doubled; service crypto, state
// transitions and auth controller remain real. Serialized transactions model
// the users row lock. Real locking is additionally covered by the opt-in test.
function fixture(){
 let credential:any,revoked=0;const queries:string[]=[];
 const user={id:'user-a',email:'a@example.com',role:'admin',status:'active',password_hash:auth.hashPassword(password)};
 const query=async(sql:string,params:unknown[]=[])=>{
  queries.push(sql);
  if(sql.includes('FROM users'))return {rows:[user],rowCount:1};
  if(sql.startsWith('INSERT INTO user_authenticators')){credential??={enabled:false,secret_encrypted:null,pending_secret_encrypted:null,pending_expires_at:null,last_counter:-1,recovery_hashes:[],attempts:0,attempt_window_started_at:new Date(0)};return {rows:[],rowCount:1};}
  if(sql.includes('FROM user_authenticators'))return {rows:credential?[{...credential}]:[],rowCount:credential?1:0};
  if(sql.startsWith('UPDATE user_authenticators SET attempts')){credential.attempts=params[1];credential.attempt_window_started_at=params[2];}
  if(sql.startsWith('UPDATE user_authenticators SET pending_secret')){credential.pending_secret_encrypted=params[1];credential.pending_expires_at=params[2];}
  if(sql.startsWith('UPDATE user_authenticators SET enabled=true'))Object.assign(credential,{enabled:true,secret_encrypted:credential.pending_secret_encrypted,pending_secret_encrypted:null,pending_expires_at:null,last_counter:params[1],recovery_hashes:params[2]});
  if(sql.startsWith('UPDATE user_authenticators SET last_counter'))credential.last_counter=params[1];
  if(sql.startsWith('UPDATE user_authenticators SET recovery_hashes'))credential.recovery_hashes=params[1];
  if(sql.startsWith('UPDATE user_authenticators SET enabled=false'))Object.assign(credential,{enabled:false,secret_encrypted:null,pending_secret_encrypted:null,pending_expires_at:null,last_counter:-1,recovery_hashes:[]});
  if(sql.startsWith('UPDATE auth_sessions SET revoked_at'))revoked++;
  return {rows:[],rowCount:1};
 };
 let pending=Promise.resolve();
 const db={query,transaction:async(fn:any)=>{const before=pending;let release!:()=>void;pending=new Promise<void>(r=>release=r);await before;try{return await fn({query});}finally{release();}}};
 const service=new TwoFactorService(db as never,auth,()=>key);
 const factor=(userId:string,input:FactorInput)=>db.transaction(async (client:any)=>{await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);return service.loginFactorInTransaction(client,userId,input);});
 return {service,db,factor,get credential(){return credential;},get revoked(){return revoked;},queries};
}
test('own enrollment needs password, encrypts pending secret, and confirms once with recovery codes and session revocation',async()=>{
 const f=fixture();await assert.rejects(()=>f.service.enroll('user-a','wrong'),/password/);
 const pending=await f.service.enroll('user-a',password);
 assert.equal(pending.secret.length,32);assert.match(pending.otpauthUri,/otpauth:\/\/totp\//);
 assert.equal(decryptSecret(f.credential.pending_secret_encrypted,'user-a',key),pending.secret);
 assert.equal((await f.service.status('user-a')).enabled,false);
 const confirmed=await f.service.confirm('user-a',password,totpCode(pending.secret,Math.floor(Date.now()/30000)));
 assert.equal(confirmed.recoveryCodes.length,10);assert.equal(f.revoked,1);
 assert.ok(!f.credential.recovery_hashes.includes(confirmed.recoveryCodes[0]));
 await assert.rejects(()=>f.service.confirm('user-a',password,'000000'),/enrollment/);
});
test('expired enrollment cannot enable two-factor or revoke sessions',async()=>{
 const f=fixture();const pending=await f.service.enroll('user-a',password);f.credential.pending_expires_at=new Date(0);
 await assert.rejects(()=>f.service.confirm('user-a',password,totpCode(pending.secret,Math.floor(Date.now()/30000))),/enrollment/);
 assert.equal(f.credential.enabled,false);assert.equal(f.revoked,0);
});
test('TOTP and recovery codes are single use, including competing requests',async()=>{
 const f=fixture(),pending=await f.service.enroll('user-a',password);
 const codes=(await f.service.confirm('user-a',password,totpCode(pending.secret,Math.floor(Date.now()/30000)))).recoveryCodes;
 const current=totpCode(pending.secret,Math.floor(Date.now()/30000));
 assert.equal(await f.factor('user-a',{secondFactorCode:current}),'invalid');
 const results=await Promise.all([f.factor('user-a',{recoveryCode:codes[0]}),f.factor('user-a',{recoveryCode:codes[0]})]);
 assert.deepEqual(results.sort(),['invalid','verified']);
 assert.equal((await f.service.status('user-a')).recoveryCodesRemaining,9);
});
test('attempt lockout survives invalid factors and blocks correct recovery until the window expires',async()=>{
 const f=fixture(),pending=await f.service.enroll('user-a',password);
 const {recoveryCodes}=await f.service.confirm('user-a',password,totpCode(pending.secret,Math.floor(Date.now()/30000)));
 for(let n=0;n<5;n++)assert.equal(await f.factor('user-a',{secondFactorCode:'bad'}),'invalid');
 assert.equal(await f.factor('user-a',{recoveryCode:recoveryCodes[0]}),'limited');
 f.credential.attempt_window_started_at=new Date(0);
 assert.equal(await f.factor('user-a',{recoveryCode:recoveryCodes[0]}),'verified');
});
test('disable requires current password and an unused factor then revokes sessions',async()=>{
 const f=fixture(),pending=await f.service.enroll('user-a',password);
 const {recoveryCodes}=await f.service.confirm('user-a',password,totpCode(pending.secret,Math.floor(Date.now()/30000)));
 await assert.rejects(()=>f.service.disable('user-a','wrong',{recoveryCode:recoveryCodes[0]}),/password/);
 assert.equal(f.credential.enabled,true);
 await f.service.disable('user-a',password,{recoveryCode:recoveryCodes[0]});
 assert.equal(f.credential.enabled,false);assert.equal(f.revoked,2);
 assert.equal(f.credential.secret_encrypted,null);
});
test('login with valid password and missing/invalid factor issues no session, cookies, or tokens',async()=>{
 const f=fixture(),pending=await f.service.enroll('user-a',password);
 await f.service.confirm('user-a',password,totpCode(pending.secret,Math.floor(Date.now()/30000)));
 let tokens=0,cookies=0,sessions=0;
 const tracking=Object.create(auth);tracking.issueTokens=()=>{tokens++;throw Error('Unexpected token issuance');};
 const controller=Reflect.construct(AuthController,[tracking,f.db,{create:()=>{sessions++;throw Error('Unexpected session');}},{},f.service]) as AuthController;
 const res={cookie:()=>cookies++};
 assert.deepEqual(await controller.login({email:'a@example.com',password},res as never),{requiresTwoFactor:true,method:'totp'});
 await assert.rejects(()=>controller.login({email:'a@example.com',password,secondFactorCode:'bad'} as never,res as never),/factor/);
 assert.equal(tokens,0);assert.equal(cookies,0);assert.equal(sessions,0);
 assert.equal(f.queries.filter(sql=>sql.startsWith('INSERT INTO auth_sessions')).length,0);
});
test('verified recovery login preserves standard cookies and signed claims and cannot repeat the recovery code',async()=>{
 const f=fixture(),pending=await f.service.enroll('user-a',password);
 const {recoveryCodes}=await f.service.confirm('user-a',password,totpCode(pending.secret,Math.floor(Date.now()/30000)));
 const controller=new AuthController(auth,f.db as never,{} as never,{} as never,f.service);
 const cookies=new Map<string,{value:string;options:any}>();
 const response={cookie:(name:string,value:string,options:any)=>cookies.set(name,{value,options})};
 const result=await controller.login({email:'a@example.com',password,recoveryCode:recoveryCodes[0]!},response as never);
 assert.ok('accessToken' in result);
 const decoded=auth.verifyAccessToken(result.accessToken!);
 assert.equal(decoded.id,'user-a');assert.equal(decoded.role,'admin');
 assert.equal(cookies.get('access_token')?.value,result.accessToken);assert.equal(cookies.get('access_token')?.options.httpOnly,true);
 assert.equal(cookies.get('refresh_token')?.value,result.refreshToken);
 assert.equal(auth.verifyRefreshToken(result.refreshToken!).sessionId,decoded.sessionId);
 assert.equal(f.queries.filter(sql=>sql.startsWith('INSERT INTO auth_sessions')).length,1);
 await assert.rejects(()=>controller.login({email:'a@example.com',password,recoveryCode:recoveryCodes[0]!},response as never),/factor/);
 assert.equal(f.queries.filter(sql=>sql.startsWith('INSERT INTO auth_sessions')).length,1);
});
test('enabled TOTP consumes a fresh drift step once and rejects competing replay',async()=>{
 const f=fixture(),pending=await f.service.enroll('user-a',password);
 await f.service.confirm('user-a',password,totpCode(pending.secret,Math.floor(Date.now()/30000)));
 const code=totpCode(pending.secret,Math.floor(Date.now()/30000)+1);
 const results=await Promise.all([f.factor('user-a',{secondFactorCode:code}),f.factor('user-a',{secondFactorCode:code})]);
 assert.deepEqual(results.sort(),['invalid','verified']);
});
test('unconfigured encryption fails closed before returning enrollment material',async()=>{
 const f=fixture();const service=new TwoFactorService(f.db as never,auth,()=>undefined);
 await assert.rejects(()=>service.enroll('user-a',password),/encryption/);
 assert.equal(f.credential.pending_secret_encrypted,null);
});

test('status identifies authenticator method and masks only a currently verified email',async()=>{
 const f=fixture();const status=await f.service.status('user-a');assert.equal(status.method,null);assert.equal(status.emailAvailable,false);
 const pending=await f.service.enroll('user-a',password);await f.service.confirm('user-a',password,totpCode(pending.secret,Math.floor(Date.now()/30000)));
 assert.equal((await f.service.status('user-a')).method,'totp');
});

test('email enrollment is unavailable when SMTP delivery is unconfigured even for verified addresses',async()=>{
 const saved=process.env.SMTP_HOST;delete process.env.SMTP_HOST;
 try{const db={query:async(sql:string)=>({rows:sql.includes('FROM users')?[{email:'a@example.com',verified_email:'a@example.com',email_verified_at:new Date()}]:[]})};const service=new TwoFactorService(db as never,auth,()=>key);assert.equal((await service.status('user-a')).emailAvailable,false);}finally{if(saved!==undefined)process.env.SMTP_HOST=saved;}
});
