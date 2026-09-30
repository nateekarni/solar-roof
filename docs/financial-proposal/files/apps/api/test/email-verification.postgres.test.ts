import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DatabaseService} from '../src/database/database.service.js';
import {EmailVerificationController,emailCodeHash} from '../src/modules/identity/email-verification.controller.js';

const url=process.env.FINANCIAL_TEST_DATABASE_URL;
test('verification binds current email, persists failed attempts and prevents replay on PostgreSQL',{skip:!url},async()=>{
 const parsed=new URL(url!);
 assert.ok(['127.0.0.1','localhost'].includes(parsed.hostname)&&parsed.pathname==='/solar_financial_v2','Disposable local database required');
 process.env.DATABASE_URL=url;
 const db=new DatabaseService(),id=randomUUID(),email=`${id}@example.test`,code='12345678';
 const controller=new EmailVerificationController(db),req={user:{id}};
 try {
  await db.query(`INSERT INTO users(id,email,display_name,role,status) VALUES($1,$2,'Verification fixture','owner','active')`,[id,email]);
  const put=()=>db.query(`INSERT INTO email_verification_challenges(user_id,email,code_hash,expires_at) VALUES($1,$2,$3,now()+interval '15 minutes') ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0`,[id,email,emailCodeHash(id,email,code)]);
  await put();
  await assert.rejects(controller.confirm(req,{code:'00000000'}));
  assert.equal((await db.query('SELECT attempts FROM email_verification_challenges WHERE user_id=$1',[id])).rows[0].attempts,1);
  assert.equal((await controller.status(req)).verified,false);
  assert.deepEqual(await controller.confirm(req,{code}),{verified:true});
  await assert.rejects(controller.confirm(req,{code}));
  assert.equal((await controller.status(req)).verified,true);
  await put();
  await db.query('UPDATE users SET email=$2 WHERE id=$1',[id,`changed-${email}`]);
  assert.equal((await controller.status(req)).verified,false);
  await assert.rejects(controller.confirm(req,{code}));
  await db.query('UPDATE users SET email=$2 WHERE id=$1',[id,email]);
  await put();
  for(let n=0;n<5;n++)await assert.rejects(controller.confirm(req,{code:'00000000'}));
  await assert.rejects(controller.confirm(req,{code}));
 }finally{await db.query('DELETE FROM users WHERE id=$1',[id]);await db.onModuleDestroy();}
});
