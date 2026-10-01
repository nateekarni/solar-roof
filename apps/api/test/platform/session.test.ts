import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash, randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Pool} from 'pg';
import {DatabaseService} from '../../src/database/database.service.js';
import {SessionService} from '../../src/modules/identity/session.service.js';
import {AuthService} from '../../src/modules/identity/auth.service.js';
import {assertIsolatedDatabase} from './fixtures.js';

const base=process.env.READINESS_API_URL;
assert.equal(base,'http://127.0.0.1:13001');
const auth=new AuthService('readiness-test-access-secret-000000000000','readiness-test-refresh-secret-000000000000');
const password='Local-session-fixture-123!';
const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
async function fixture(work:(db:Pool,user:{id:string;email:string},login:()=>Promise<any>)=>Promise<void>) {
  assert.match(process.env.COMPOSE_PROJECT_NAME ?? '',/^solar-ci-[a-f0-9-]{36}$/);
  execFileSync('docker',['compose','-f','infra/ci/compose.yml','restart','api'],{cwd:new URL('../../../../',import.meta.url),stdio:'pipe'});
  const deadline=Date.now()+30000;
  while(true) {try {if((await fetch(base+'/ready')).ok)break;}catch {} if(Date.now()>deadline)throw new Error('Fixture API restart timed out');await new Promise(resolve=>setTimeout(resolve,100));}
  const db=new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL ?? '')});
  const id=randomUUID(),email=`session-${id}@example.test`;
  await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash,refresh_token_hash) VALUES($1,$2,'Session fixture','admin','active',$3,'legacy-hash')",[id,email,auth.hashPassword(password)]);
  const login=async()=>{const response=await post('/login',{email,password});assert.equal(response.status,200);return response.json();};
  try {await work(db,{id,email},login);} finally {await db.query('DELETE FROM audit_events WHERE actor_id=$1',[id]);await db.query('DELETE FROM users WHERE id=$1',[id]);await db.end();}
}
function post(path:string,body?:unknown,headers:Record<string,string>={}) {return fetch(base+'/v1/auth'+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});}
function me(token:string,headers:Record<string,string>={}) {return fetch(base+'/v1/auth/me',{headers:{Authorization:`Bearer ${token}`,...headers}});}

test('same-second token issuance has a fresh cryptographic refresh nonce',()=>{
  const original=Date.now;Date.now=()=>1800000000000;
  try {const user={id:randomUUID(),email:'nonce@example.test',role:'admin' as const};const sid=randomUUID();const first=auth.issueTokens(user,sid),second=auth.issueTokens(user,sid);assert.notEqual(first.refreshToken,second.refreshToken);} finally {Date.now=original;}
});

test('two simultaneous real refresh requests have exactly one winner; replay cannot revoke it',async()=>fixture(async(db,user,login)=>{
  const initial=await login();
  // Hold the legacy user-row UPDATE until both HTTP requests have read its old
  // hash. The new session CAS is independent of this lock and still has one winner.
  const blocker=await db.connect();await blocker.query('BEGIN');await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);
  const pending=Promise.all([post('/refresh',{refreshToken:initial.refreshToken}),post('/refresh',{refreshToken:initial.refreshToken})]);
  await new Promise(resolve=>setTimeout(resolve,250));await blocker.query('COMMIT');blocker.release();const responses=await pending;
  assert.deepEqual(responses.map(response=>response.status).sort(),[200,401]);
  const winner=await responses.find(response=>response.status===200)!.json();
  assert.notEqual(winner.refreshToken,initial.refreshToken);
  assert.equal(auth.verifyRefreshToken(winner.refreshToken).sessionId,auth.verifyRefreshToken(initial.refreshToken).sessionId);
  assert.equal((await post('/refresh',{refreshToken:initial.refreshToken})).status,401);
  assert.equal((await me(winner.accessToken)).status,200);
  assert.equal((await post('/refresh',{refreshToken:winner.refreshToken})).status,200);
  const rows=(await db.query('SELECT refresh_hash,revoked_at FROM auth_sessions WHERE user_id=$1',[user.id])).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].revoked_at,null);
  const events=(await db.query("SELECT action FROM audit_events WHERE actor_id=$1 AND entity_type='auth_session'",[user.id])).rows.map(row=>row.action);
  assert.ok(events.includes('session.rotated'));assert.ok(events.includes('session.refresh_rejected'));
}));

test('logout revokes copied access despite a stale refresh cookie, keeping the other device active',async()=>fixture(async(db,user,login)=>{
  const first=await login(),other=await login();const rotated=await (await post('/refresh',{refreshToken:first.refreshToken})).json();
  assert.equal((await me(first.accessToken)).status,200);
  assert.equal((await post('/logout',undefined,{Authorization:`Bearer ${rotated.accessToken}`,Cookie:`refresh_token=${first.refreshToken}`})).status,200);
  assert.equal((await me(rotated.accessToken)).status,401);assert.equal((await me(first.accessToken)).status,401);
  assert.equal((await post('/refresh',{refreshToken:rotated.refreshToken})).status,401);
  assert.equal((await me(other.accessToken)).status,200);assert.equal((await post('/refresh',{refreshToken:other.refreshToken})).status,200);
  assert.equal((await db.query('SELECT refresh_token_hash,password_hash FROM users WHERE id=$1',[user.id])).rows[0].refresh_token_hash,'legacy-hash');
}));

test('sessions enforce expiry and user binding; current account status and role apply immediately',async()=>fixture(async(db,user,login)=>{
  const tokens=await login(),sid=auth.verifyAccessToken(tokens.accessToken).sessionId;
  await db.query("UPDATE users SET role='operator' WHERE id=$1",[user.id]);assert.equal((await (await me(tokens.accessToken)).json()).role,'operator');
  await db.query("UPDATE users SET status='disabled' WHERE id=$1",[user.id]);assert.equal((await me(tokens.accessToken)).status,401);assert.equal((await post('/refresh',{refreshToken:tokens.refreshToken})).status,401);
  await db.query("UPDATE users SET status='active' WHERE id=$1",[user.id]);
  await db.query("UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE sid=$1",[sid]);assert.equal((await me(tokens.accessToken)).status,401);assert.equal((await post('/refresh',{refreshToken:tokens.refreshToken})).status,401);
  const expired=new AuthService('readiness-test-access-secret-000000000000','readiness-test-refresh-secret-000000000000',-1,-1).issueTokens({...user,role:'admin'},sid);
  assert.equal((await me(expired.accessToken)).status,401);assert.equal((await post('/refresh',{refreshToken:expired.refreshToken})).status,401);
  const unbound=auth.issueTokens({...user,role:'admin'},randomUUID());assert.equal((await me(unbound.accessToken)).status,401);assert.equal((await post('/refresh',{refreshToken:unbound.refreshToken})).status,401);
  await db.query('UPDATE auth_sessions SET user_id=(SELECT id FROM users WHERE email=$2),expires_at=now()+interval \'1 day\' WHERE sid=$1',[sid,'bootstrap@example.test']);
  assert.equal((await me(tokens.accessToken)).status,401);assert.equal((await post('/refresh',{refreshToken:tokens.refreshToken})).status,401);
  await db.query('DELETE FROM auth_sessions WHERE sid=$1',[sid]);
}));

test('malformed cookies reject authentication without 500 or bearer fallback',async()=>fixture(async(_db,_user,login)=>{
  const tokens=await login();const denied=await me(tokens.accessToken,{Cookie:'access_token=%ZZ',Origin:'http://localhost:13000'});assert.equal(denied.status,401);
  assert.equal(denied.headers.get('X-Auth-Retry-Safe'),'1');
  assert.equal(denied.headers.get('Access-Control-Expose-Headers'),'X-Auth-Retry-Safe');
  assert.equal((await post('/refresh',{refreshToken:tokens.refreshToken},{Cookie:'refresh_token=%ZZ'})).status,401);
  assert.equal((await post('/logout',undefined,{Cookie:'refresh_token=%ZZ'})).status,200);
}));

test('session database failure closes access and refresh without returning credentials',async()=>fixture(async(db,_user,login)=>{
  const tokens=await login();await db.query('ALTER TABLE auth_sessions RENAME TO auth_sessions_fixture_unavailable');
  try {assert.equal((await me(tokens.accessToken)).status,401);const response=await post('/refresh',{refreshToken:tokens.refreshToken});assert.ok(response.status>=400);assert.equal((await response.text()).includes('accessToken'),false);} finally {await db.query('ALTER TABLE auth_sessions_fixture_unavailable RENAME TO auth_sessions');}
}));

test('authentication logs contain no issued token or stored refresh hash',async()=>fixture(async(_db,_user,login)=>{
  const tokens=await login();await post('/refresh',{refreshToken:tokens.refreshToken});const logs=execFileSync('docker',['compose','-f','infra/ci/compose.yml','logs','--no-color','api'],{cwd:new URL('../../../../',import.meta.url),encoding:'utf8'});
  for(const secret of [tokens.accessToken,tokens.refreshToken,hash(tokens.refreshToken)])assert.equal(logs.includes(secret),false);
}));

test('pending sessions stay unusable and fixed-clock CAS rotation persists a distinct hash',async()=>fixture(async(db,user)=>{
  const previous=process.env.DATABASE_URL;process.env.DATABASE_URL=process.env.READINESS_DATABASE_URL;
  const database=new DatabaseService(),sessions=new SessionService(database);
  const original=Date.now;
  try {
    const {sid}=await sessions.create(user.id);
    Date.now=()=>1800000000000;
    const first=auth.issueTokens({...user,role:'admin'},sid),next=auth.issueTokens({...user,role:'admin'},sid);
    Date.now=original;
    assert.equal(await sessions.isActive(sid,user.id),false);
    assert.equal((await me(first.accessToken)).status,401);
    assert.equal(await sessions.rotate(sid,hash(first.refreshToken),hash(next.refreshToken)),false);
    await sessions.initialize(sid,user.id,hash(first.refreshToken),auth.verifyRefreshToken(first.refreshToken).expiresAt);
    assert.equal(await sessions.isActive(sid,user.id),true);
    assert.notEqual(hash(first.refreshToken),hash(next.refreshToken));
    assert.equal(await sessions.rotate(sid,hash(first.refreshToken),hash(next.refreshToken)),true);
    assert.equal(await sessions.rotate(sid,hash(first.refreshToken),hash(next.refreshToken)),false);
    assert.equal((await post('/refresh',{refreshToken:first.refreshToken})).status,401);
    assert.equal((await post('/refresh',{refreshToken:next.refreshToken})).status,200);
    assert.equal((await db.query('SELECT password_hash,refresh_token_hash FROM users WHERE id=$1',[user.id])).rows[0].refresh_token_hash,'legacy-hash');
    await sessions.revoke(sid);assert.equal(await sessions.isActive(sid,user.id),false);
  } finally {Date.now=original;await database.onModuleDestroy();if(previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previous;}
}));
