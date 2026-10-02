import assert from 'node:assert/strict';
import {setDefaultResultOrder} from 'node:dns';
setDefaultResultOrder('ipv4first');
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {execFileSync} from 'node:child_process';
import {AuthService} from '../../src/modules/identity/auth.service.js';
import {assertIsolatedDatabase} from './fixtures.js';
const base=process.env.READINESS_API_URL!, web=process.env.READINESS_WEB_URL!;
assert.equal(base,'http://127.0.0.1:13001');assert.equal(web,'http://localhost:13000');
const post=(url:string,body:unknown,headers:Record<string,string>={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('HTTP mutations enforce origin before public and authenticated controllers',async()=>{
 const db=new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!)});
 const id=randomUUID(),email=`csrf-${id}@example.test`,password='Csrf-fixture-password-123!';
 const auth=new AuthService('readiness-test-access-secret-000000000000','readiness-test-refresh-secret-000000000000');
 await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash) VALUES($1,$2,'CSRF','owner','active',$3)",[id,email,auth.hashPassword(password)]);
 try {
  const before=Number((await db.query('SELECT count(*) FROM auth_sessions WHERE user_id=$1',[id])).rows[0].count);
  for(const origin of ['http://sibling.localhost:13000','http://attacker.test']) {
   assert.equal((await post(base+'/v1/auth/login',{email,password},{Origin:origin})).status,403);
  }
  for(let n=0;n<12;n++) assert.equal((await post(base+'/v1/auth/login',{email,password},{Origin:'http://attacker.test'})).status,403,'Rejected CSRF cannot exhaust the valid-origin login budget');
  const after=Number((await db.query('SELECT count(*) FROM auth_sessions WHERE user_id=$1',[id])).rows[0].count);assert.equal(after,before);
  assert.equal((await post(base+'/v1/auth/login',{email,password})).status,403,'Public login requires Origin');
  for(const route of ['LOGIN','LoGiN','LoGiN/']) {
   const before=Number((await db.query('SELECT count(*) FROM auth_sessions WHERE user_id=$1',[id])).rows[0].count);
   assert.equal((await post(base+'/v1/auth/'+route,{email,password},{Authorization:'Bearer forged'})).status,403,'Case-insensitive public login still requires Origin');
   const after=Number((await db.query('SELECT count(*) FROM auth_sessions WHERE user_id=$1',[id])).rows[0].count);assert.equal(after,before);
  }
  for(const route of ['ACTIVATE','AcTiVaTe','AcTiVaTe/','REFRESH','ReFrEsH','ReFrEsH/']) assert.equal((await post(base+'/v1/auth/'+route,{token:'wrong',password},{Authorization:'Bearer forged'})).status,403,'Public credential endpoints cannot use bearer origin exemption under case variants');
  const login=await post(base+'/v1/auth/login',{email,password},{Origin:web});assert.equal(login.status,200);const tokens=await login.json();
  const cookie=`access_token=${tokens.accessToken}; refresh_token=${tokens.refreshToken}`;
  for(const path of ['refresh','logout']) {
   const before=(await db.query('SELECT refresh_hash,revoked_at FROM auth_sessions WHERE user_id=$1',[id])).rows;
   for(const headers of [{Cookie:cookie},{Cookie:cookie,Origin:'http://sibling.localhost:13000'},{Cookie:cookie,Authorization:`Bearer ${tokens.accessToken}`}]) assert.equal((await post(base+'/v1/auth/'+path,{},headers)).status,403);
   const after=(await db.query('SELECT refresh_hash,revoked_at FROM auth_sessions WHERE user_id=$1',[id])).rows;assert.deepEqual(after,before);
  }
  assert.equal((await post(base+'/v1/auth/logout',{}, {Cookie:cookie,Origin:'null'})).status,403);
  assert.equal((await post(base+'/v1/auth/activate',{token:'wrong',password})).status,403,'Public activation requires Origin');
  assert.equal((await fetch(base+'/v1/auth/me',{headers:{Cookie:cookie}})).status,200,'Server-side GET needs no Origin');
  assert.equal((await post(base+'/v1/users/invite',{email:`scope-${id}@example.test`,displayName:'Scope',role:'owner'},{Authorization:'Bearer forged'})).status,401,'Bearer exemption still checks JWT');
  await db.query("UPDATE users SET role='school_user' WHERE id=$1",[id]);
  assert.equal((await post(base+'/v1/users/invite',{email:`scope-${id}@example.test`,displayName:'Scope',role:'owner'},{Authorization:`Bearer ${tokens.accessToken}`})).status,403,'Verified nonbrowser bearer still checks current role/scope');
  assert.equal(Number((await db.query('SELECT count(*) FROM users WHERE email=$1',[`scope-${id}@example.test`])).rows[0].count),0);
  await db.query("UPDATE users SET role='owner' WHERE id=$1",[id]);
  assert.equal((await post(base+'/v1/auth/logout',{}, {Authorization:'Bearer forged'})).status,401);
  assert.equal((await post(base+'/v1/auth/logout',{}, {Authorization:`Bearer ${tokens.accessToken}`})).status,200,'Verified nonbrowser bearer allowed');
  const directWebPort=process.env.PLATFORM_CI_DIRECT_WEB_PORT??'13002';
  assert.ok(['13002','13003'].includes(directWebPort),'Only an approved fixture direct web port is allowed');
  for(const ingress of [base,web,...(process.env.S3_EDGE==='true'||process.env.PLATFORM_EDGE_FIXTURE==='true'?[`http://127.0.0.1:${directWebPort}`]:[])]) {
   await db.query("DELETE FROM invitation_rate_limits WHERE key LIKE 'activation:%'");
   const statuses=[];
   for(let n=0;n<6;n++) statuses.push((await post(ingress+'/v1/auth/activate',{token:'wrong',password},{Origin:web,'X-Forwarded-For':`203.0.113.${n+1}`,'X-Real-IP':`203.0.113.${n+1}`,Forwarded:`for=203.0.113.${n+1}`})).status);
   assert.deepEqual(statuses,[401,401,401,401,401,429],'Forged headers cannot split activation budget');
  }
 } finally {await db.query('DELETE FROM audit_events WHERE actor_id=$1',[id]);await db.query('DELETE FROM users WHERE id=$1',[id]);await db.end();}
});

test('expired shared limiter storage cleanup is bounded and preserves active windows',async()=>{
 const db=new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!)});
 const prefix=`expired-${randomUUID()}`;
 try {
  await db.query('INSERT INTO invitation_rate_limits(key,window_started_at,attempts) SELECT $1||n,now()-interval \'2 hours\',1 FROM generate_series(1,110) n',[prefix]);
  await db.query("DELETE FROM invitation_rate_limits WHERE key LIKE 'activation:%'");
  assert.equal((await post(base+'/v1/auth/activate',{token:'wrong',password:'Expired-fixture-password!'},{Origin:web})).status,401);
  assert.equal(Number((await db.query('SELECT count(*) FROM invitation_rate_limits WHERE key LIKE $1',[prefix+'%'])).rows[0].count),10);
  assert.equal(Number((await db.query("SELECT count(*) FROM invitation_rate_limits WHERE key LIKE 'activation:%'")).rows[0].count),1);
 } finally {await db.query('DELETE FROM invitation_rate_limits WHERE key LIKE $1',[prefix+'%']);await db.end();}
});

test('actual trusted edge socket identities have separate budgets; supplied forwarding headers cannot select them',{skip:!(process.env.S3_EDGE==='true'||process.env.PLATFORM_EDGE_FIXTURE==='true')},async()=>{
 const db=new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!)});
 assert.match(process.env.COMPOSE_PROJECT_NAME ?? '',/^solar-ci-[a-f0-9-]{36}$/);
 try {
  await db.query("DELETE FROM invitation_rate_limits WHERE key LIKE 'activation:%'");
  const invoke=(client:string,count:number)=>JSON.parse(execFileSync('docker',['compose','-f','infra/ci/compose.yml','-f','infra/ci/request-edge.yml','exec','-T',client,'node','--input-type=module','-e',`const statuses=[];for(let n=0;n<${count};n++)statuses.push((await fetch('http://request-edge:3000/v1/auth/activate',{method:'POST',headers:{Origin:'http://localhost:13000','Content-Type':'application/json','X-Forwarded-For':'203.0.113.'+n},body:JSON.stringify({token:'wrong',password:'Socket-fixture-password!'})})).status);console.log(JSON.stringify(statuses));`],{encoding:'utf8'}));
  assert.deepEqual(invoke('edge-client-a',6),[401,401,401,401,401,429]);
  assert.deepEqual(invoke('edge-client-b',1),[401]);
  assert.equal(Number((await db.query("SELECT count(*) FROM invitation_rate_limits WHERE key LIKE 'activation:%'")).rows[0].count),2);
 } finally {await db.end();}
});
