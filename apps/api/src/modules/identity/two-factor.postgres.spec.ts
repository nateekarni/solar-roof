import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {DatabaseService} from '../../database/database.service.js';
import {AuthService} from './auth.service.js';
import {AuthController} from './auth.controller.js';
import {SessionService} from './session.service.js';
import {TwoFactorService} from './two-factor.service.js';
import {PasswordResetController} from './password-reset.controller.js';
import {totpCode} from './totp.js';

// Explicit opt-in only; never defaults to the application's DATABASE_URL.
test('PostgreSQL atomically consumes factors, commits invalid attempts, and revokes pre-enrollment sessions',{skip:!process.env.TWO_FACTOR_TEST_DATABASE_URL},async()=>{
 const connectionString=process.env.TWO_FACTOR_TEST_DATABASE_URL!;
 const target=new URL(connectionString);
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(target.hostname),'Use a dedicated local PostgreSQL test database');
 const schema='totp_test_'+randomUUID().replace(/-/g,''),admin=new Pool({connectionString});
 await admin.query(`CREATE SCHEMA ${schema}`);
 const pool=new Pool({connectionString,options:`-c search_path=${schema}`,max:6});
 try{
  await pool.query(`CREATE TABLE users(id uuid PRIMARY KEY,email text UNIQUE,password_hash text,role text,status text,customer_id uuid,display_name text,preferred_language text,preferred_theme text,avatar_data text,updated_at timestamptz DEFAULT now(),email_verified_at timestamptz,verified_email text);
   CREATE TABLE site_account_assignments(user_id uuid,site_id uuid,revoked_at timestamptz);
   CREATE TABLE auth_sessions(sid uuid PRIMARY KEY,user_id uuid REFERENCES users(id),refresh_hash text,expires_at timestamptz,revoked_at timestamptz);
   CREATE TABLE audit_events(id uuid PRIMARY KEY,actor_id uuid,action text,entity_type text,entity_id uuid,correlation_id text,occurred_at timestamptz DEFAULT now());`);
  await pool.query(await readFile(new URL('../../../../../infra/migrations/053_user_authenticators.sql',import.meta.url),'utf8'));
  await pool.query(await readFile(new URL('../../../../../infra/migrations/055_email_factor_password_reset.sql',import.meta.url),'utf8'));
  const db={pool,query:pool.query.bind(pool),transaction:DatabaseService.prototype.transaction} as unknown as DatabaseService;
  const auth=new AuthService('totp-test-access-secret','totp-test-refresh-secret'),sessions=new SessionService(db);
  const service=new TwoFactorService(db,auth,()=> 'ab'.repeat(32));
  const controller=new AuthController(auth,db,sessions,{} as never,service);
  const id=randomUUID(),sid=randomUUID(),password='correct-password-123';
  await pool.query("INSERT INTO users(id,email,password_hash,role,status) VALUES($1,'totp@example.com',$2,'admin','active')",[id,auth.hashPassword(password)]);
  await pool.query("INSERT INTO auth_sessions(sid,user_id,refresh_hash,expires_at) VALUES($1,$2,'old',now()+interval '1 day')",[sid,id]);
  assert.equal(await sessions.isActive(sid,id),true);
  const pending=await service.enroll(id,password);
  const {recoveryCodes}=await service.confirm(id,password,totpCode(pending.secret,Math.floor(Date.now()/30000)));
  assert.equal(await sessions.isActive(sid,id),false);
  const response={cookie(){throw Error('Unexpected cookie on incomplete login');}};
  assert.deepEqual(await controller.login({email:'totp@example.com',password},response as never),{requiresTwoFactor:true,method:'totp'});
  await assert.rejects(()=>controller.login({email:'totp@example.com',password,secondFactorCode:'0000000'},response as never),/factor/);
  assert.equal((await pool.query('SELECT attempts FROM user_authenticators WHERE user_id=$1',[id])).rows[0].attempts,1);
  const cookies={cookie(){}};
  const results=await Promise.allSettled([0,1].map(()=>controller.login({email:'totp@example.com',password,recoveryCode:recoveryCodes[0]!},cookies as never)));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(results.filter(result=>result.status==='rejected').length,1);
  assert.equal((await pool.query('SELECT cardinality(recovery_hashes) AS remaining FROM user_authenticators WHERE user_id=$1',[id])).rows[0].remaining,9);
  assert.equal(Number((await pool.query('SELECT count(*) AS total FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',[id])).rows[0].total),1);
  const future=totpCode(pending.secret,Math.floor(Date.now()/30000)+1);
  const totpResults=await Promise.allSettled([0,1].map(()=>controller.login({email:'totp@example.com',password,secondFactorCode:future},cookies as never)));
  assert.equal(totpResults.filter(result=>result.status==='fulfilled').length,1);
  await service.disable(id,password,{recoveryCode:recoveryCodes[1]!});
  assert.equal(Number((await pool.query('SELECT count(*) AS total FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',[id])).rows[0].total),0);

  if(process.env.SMTP_HOST==='127.0.0.1'&&process.env.IDENTITY_MAILPIT_URL){
   const email=`security-${id}@solar-platform.invalid`;await pool.query('UPDATE users SET email=$2,verified_email=$2,email_verified_at=now() WHERE id=$1',[id,email]);
   const latest=async(subject:string)=>{const response=await fetch(process.env.IDENTITY_MAILPIT_URL+'/api/v1/messages');const messages=await response.json() as any;const item=messages.messages.find((m:any)=>m.Subject===subject&&m.To.some((t:any)=>t.Address===email));assert.ok(item,'Local Mailpit message received');const detail=await fetch(process.env.IDENTITY_MAILPIT_URL+'/api/v1/message/'+item.ID);return (await detail.json() as any).Text as string;};
   const pendingEmail=await service.enroll(id,password,'email');assert.equal(pendingEmail.method,'email');assert.ok(!('secret' in pendingEmail));
   const enrollmentCode=(await latest('Solar Roof security code')).match(/code is (\d{6})/)![1]!;
   const emailEnabled=await service.confirm(id,password,enrollmentCode);assert.equal(emailEnabled.recoveryCodes.length,10);
   assert.equal((await service.status(id)).method,'email');
   const challenge=await controller.login({email,password},response as never);assert.ok('method' in challenge);assert.equal(challenge.method,'email');assert.ok(!('accessToken' in challenge));
   const loginCode=(await latest('Solar Roof security code')).match(/code is (\d{6})/)![1]!;
   const emailLogin=await controller.login({email,password,secondFactorCode:loginCode},cookies as never);assert.ok('accessToken' in emailLogin);
   await assert.rejects(()=>controller.login({email,password,secondFactorCode:loginCode},cookies as never),/factor/);
   const reset=new PasswordResetController(db,auth,service);assert.deepEqual(await reset.request({email}),{success:true});
   const link=(await latest('Solar Roof password reset')).match(/https?:\/\/[^\s]+/)![0];const token=new URL(link).searchParams.get('token')!;
   assert.ok(!(await pool.query('SELECT token_hash FROM user_password_resets WHERE user_id=$1',[id])).rows[0].token_hash.includes(token));
   await assert.rejects(()=>reset.confirm({token,newPassword:'replacement-password-123'}),/factor/);
   await reset.emailCode({token});const resetCode=(await latest('Solar Roof security code')).match(/code is (\d{6})/)![1]!;
   // Purpose isolation prevents login codes authorizing a reset.
   await assert.rejects(()=>reset.confirm({token,newPassword:'replacement-password-123',secondFactorCode:loginCode}),/factor/);
   const concurrent=await Promise.allSettled([0,1].map(()=>reset.confirm({token,newPassword:'replacement-password-123',secondFactorCode:resetCode})));
   assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);assert.equal(concurrent.filter(r=>r.status==='rejected').length,1);
   assert.ok(auth.verifyPassword('replacement-password-123',(await pool.query('SELECT password_hash FROM users WHERE id=$1',[id])).rows[0].password_hash));
   assert.equal(Number((await pool.query('SELECT count(*) AS total FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',[id])).rows[0].total),0);
   await assert.rejects(()=>reset.inspect({token}),/expired/);
   const replacement='replacement-password-123';
   const recoveryLogin=await controller.login({email,password:replacement,recoveryCode:emailEnabled.recoveryCodes[0]!},cookies as never);assert.ok('accessToken' in recoveryLogin);
   await service.disable(id,replacement,{recoveryCode:emailEnabled.recoveryCodes[1]!});assert.equal((await service.status(id)).enabled,false);
   await pool.query("UPDATE user_password_resets SET requested_at=now()-interval '61 seconds' WHERE user_id=$1",[id]);
   await reset.request({email});
   const pendingLink=(await latest('Solar Roof password reset')).match(/https?:\/\/[^\s]+/)![0];const oldToken=new URL(pendingLink).searchParams.get('token')!;
   assert.equal((await reset.inspect({token:oldToken})).valid,true);
   await service.enroll(id,replacement,'email');
   assert.equal(Number((await pool.query('SELECT count(*) AS total FROM user_email_otp WHERE user_id=$1',[id])).rows[0].total),1);
   await controller.changePassword({user:{id}} as never,{currentPassword:replacement,newPassword:'rotated-password-123'},{clearCookie(){}} as never);
   await assert.rejects(()=>reset.inspect({token:oldToken}),/expired/);
   await assert.rejects(()=>reset.confirm({token:oldToken,newPassword:'stolen-link-password-123'}),/expired/);
   assert.equal(Number((await pool.query('SELECT count(*) AS total FROM user_email_otp WHERE user_id=$1',[id])).rows[0].total),0);
   assert.ok(auth.verifyPassword('rotated-password-123',(await pool.query('SELECT password_hash FROM users WHERE id=$1',[id])).rows[0].password_hash));

   assert.equal(Number((await pool.query('SELECT count(*) AS total FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',[id])).rows[0].total),0);
  }
 }finally{
  await pool.end();
  // schema is a locally generated identifier whose only contents are this test.
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();
 }
});
