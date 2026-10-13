import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import {Pool} from 'pg';
import {execFileSync} from 'node:child_process';
import {AuthService} from '../../src/modules/identity/auth.service.js';
import {assertIsolatedDatabase} from './fixtures.js';
const base=process.env.READINESS_API_URL;
assert.equal(base,'http://127.0.0.1:13001');
const capture='http://127.0.0.1:18025';
const password='Local-invitation-password-123!';
const auth=new AuthService('readiness-test-access-secret-000000000000','readiness-test-refresh-secret-000000000000');
const post=(path:string,body:unknown,token?:string,ip?:string)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:13000',...(token?{Authorization:`Bearer ${token}`} : {}),...(ip?{'X-Forwarded-For':ip}:{})},body:JSON.stringify(body)});

test('persistent invitation lifecycle uses local SMTP, atomic activation and current policy',async t=>{
  const db=new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL ?? '')});
  t.beforeEach(async()=>{await db.query("DELETE FROM invitation_rate_limits WHERE key LIKE 'activation:%'");});
  const owner=randomUUID(),admin=randomUUID(),customer=randomUUID(),otherCustomer=randomUUID();
  const tokens:string[]=[];const emails:string[]=[];let tokenSequence=0; const ipPrefix=`2001:db8:${owner.slice(0,4)}:${owner.slice(4,8)}`;
  const sites:string[]=[];
  await db.query("INSERT INTO customers(id,name,code,region) VALUES($1::uuid,'Invite customer',$1::text,'fixture'),($2::uuid,'Other invite customer',$2::text,'fixture')",[customer,otherCustomer]);
  await db.query("INSERT INTO users(id,email,display_name,role,status,customer_id,password_hash) VALUES($1,$2,'Owner','owner','active',NULL,$3),($4,$5,'Admin','admin','active',$6,$3)",[owner,`owner-${owner}@example.test`,auth.hashPassword(password),admin,`admin-${admin}@example.test`,customer]);
  const login=async(email:string)=>{const r=await post('/v1/auth/login',{email,password});assert.equal(r.status,200);return (await r.json()).accessToken;};
  const ownerToken=await login(`owner-${owner}@example.test`),adminToken=await login(`admin-${admin}@example.test`);
  const activate=(token:string,extras={})=>post('/v1/auth/activate',{token,password,...extras},undefined,`${ipPrefix}::${++tokenSequence}`);
  const newSite=async(customerId:string)=>{const id=randomUUID();sites.push(id);await db.query("INSERT INTO sites(id,customer_id,name,capacity_mwp) VALUES($1,$2,'Invitation fixture',0.1)",[id,customerId]);return id;};
  const invite=async(role='customer_user',issuer=ownerToken,customerId:string|null=customer)=>{
    await fetch(capture+'/ok',{method:'POST'});
    const email=`invite-${randomUUID()}@example.test`;emails.push(email);
    const siteId=role==='customer_user'?await newSite(customerId!):undefined;
    const r=await post('/v1/users/invite',{email,displayName:'Recipient',role,customerId,siteId},issuer);assert.equal(r.status,201);
    const result=await r.json();assert.equal(result.status,'sent');assert.ok(result.invitationId);assert.equal('token' in result,false);assert.equal('tempPassword' in result,false);
    const messages=(await (await fetch(capture)).json()).map((message:string)=>message.replace(/=\r\n/g,'').replace(/=3D/g,'='));assert.equal(messages.length,1);
    assert.equal(/password|Solar#/i.test(messages[0]),false);
    const match=messages[0].match(/http:\/\/localhost:13000\/activate\?token=([\w-]+)/);assert.ok(match,'email has configured WEB_URL activation URL');
    const token=match[1];tokens.push(token);assert.equal(Buffer.from(token,'base64url').length,32);
    assert.equal((await db.query('SELECT token_hash FROM user_invitations WHERE id=$1',[result.invitationId])).rows[0].token_hash,createHash('sha256').update(token).digest('hex'));
    if(siteId)assert.equal((await db.query('SELECT site_id FROM site_account_assignments WHERE user_id=$1 AND revoked_at IS NULL',[result.userId])).rows[0]?.site_id,siteId);
    return {...result,email,token,siteId};
  };
  try {
    await t.test('no login before activation; two HTTP activations have exactly one winner; reuse denied',async()=>{
      const i=await invite();assert.equal((await post('/v1/auth/login',{email:i.email,password})).status,401);
      const rows=(await db.query('SELECT status,password_hash FROM users WHERE email=$1',[i.email])).rows[0];assert.equal(rows.status,'invited');assert.equal(rows.password_hash,null);
      const responses=await Promise.all([activate(i.token,{role:'owner'}),activate(i.token)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,401]);
      assert.equal((await activate(i.token)).status,401);assert.equal((await db.query('SELECT role FROM users WHERE email=$1',[i.email])).rows[0].role,'customer_user');assert.ok(await login(i.email));
    });
    await t.test('expired token rejected and resend revokes original token',async()=>{
      const i=await invite();await db.query("UPDATE user_invitations SET expires_at=now()-interval '1 second' WHERE id=$1",[i.invitationId]);assert.equal((await activate(i.token)).status,401);
      await fetch(capture+'/ok',{method:'POST'});const r=await post(`/v1/users/invitations/${i.invitationId}/resend`,{},ownerToken);assert.equal(r.status,201);assert.equal((await r.json()).status,'sent');
      const message=(await (await fetch(capture)).json())[0].replace(/=\r\n/g,'').replace(/=3D/g,'=');const next=message.match(/token=([\w-]+)/)[1];assert.notEqual(next,i.token);assert.equal((await activate(i.token)).status,401);assert.equal((await activate(next)).status,200);
    });
    await t.test('SMTP rejection returns truthful delivery_failed and invalidates undelivered token',async()=>{
      await fetch(capture+'/fail',{method:'POST'});const email=`failed-${randomUUID()}@example.test`;emails.push(email);
      const r=await post('/v1/users/invite',{email,displayName:'Fail',role:'customer_user',customerId:customer,siteId:await newSite(customer)},ownerToken);assert.equal(r.status,201);const i=await r.json();assert.equal(i.status,'delivery_failed');
      const row=(await db.query('SELECT delivery_status,revoked_at FROM user_invitations WHERE id=$1',[i.invitationId])).rows[0];assert.equal(row.delivery_status,'delivery_failed');assert.ok(row.revoked_at);
    });
    await t.test('business manager owns customer invitations; managers cannot create manager roles',async()=>{
      assert.equal((await post('/v1/users/invite',{email:`deny-${randomUUID()}@example.test`,displayName:'Denied',customerId:customer,role:'customer_user'},adminToken)).status,403);
      for(const issuer of [ownerToken,adminToken])for(const role of ['owner','admin'])assert.equal((await post('/v1/users/invite',{email:`deny-${randomUUID()}@example.test`,displayName:'Denied',role},issuer)).status,403);
      const i=await invite('customer_user',ownerToken,otherCustomer);assert.equal((await post(`/v1/users/invitations/${i.invitationId}/resend`,{},adminToken)).status,403);
      const employee=await invite('operator',adminToken,null);assert.equal((await activate(employee.token)).status,200);
    });
    await t.test('activation rejects changed recipient role/status/customer and revoked issuer authority',async()=>{
      for(const mutation of ["role='admin'","status='disabled'",`customer_id='${otherCustomer}'`]){const i=await invite();await db.query(`UPDATE users SET ${mutation} WHERE email=$1`,[i.email]);assert.equal((await activate(i.token)).status,401);}
      const i=await invite();await db.query("UPDATE users SET role='admin' WHERE id=$1",[owner]);try{assert.equal((await activate(i.token)).status,401);}finally{await db.query("UPDATE users SET role='owner' WHERE id=$1",[owner]);}
    });
    await t.test('outstanding invitation can be found after reload only within current grant scope',async()=>{
      const i=await invite('customer_user',ownerToken,otherCustomer);
      const path=`/v1/users/invitations?email=${encodeURIComponent(i.email)}`;
      const found=await fetch(base+path,{headers:{Authorization:`Bearer ${ownerToken}`}});assert.equal(found.status,200);const value=await found.json();assert.equal(value.invitationId,i.invitationId);assert.equal(value.status,'sent');assert.equal('token' in value,false);
      assert.equal((await fetch(base+path,{headers:{Authorization:`Bearer ${adminToken}`}})).status,403);
      assert.equal((await fetch(base+path)).status,401);
    });
    await t.test('active account invitation cannot replace credentials',async()=>{
      const before=(await db.query('SELECT password_hash FROM users WHERE id=$1',[owner])).rows[0];const r=await post('/v1/users/invite',{email:`owner-${owner}@example.test`,displayName:'Overwrite',role:'operator'},adminToken);assert.equal(r.status,409);assert.deepEqual((await db.query('SELECT password_hash FROM users WHERE id=$1',[owner])).rows[0],before);
    });
    await t.test('shared per recipient and actor delivery limit rejects sixth resend',async()=>{
      const i=await invite();for(let n=0;n<4;n++)assert.equal((await post(`/v1/users/invitations/${i.invitationId}/resend`,{},ownerToken)).status,201);assert.equal((await post(`/v1/users/invitations/${i.invitationId}/resend`,{},ownerToken)).status,429);
    });
    await t.test('successful activations do not consume the invalid-attempt budget',async()=>{
      for(let n=0;n<6;n++){const i=await invite();assert.equal((await post('/v1/auth/activate',{token:i.token,password},undefined,`${ipPrefix}::eeee`)).status,200);}
    });
    await t.test('activation rejects sixth wrong attempt per IP with shared limiter',async()=>{
      for(let n=0;n<5;n++)assert.equal((await post('/v1/auth/activate',{token:'wrong',password},undefined,`${ipPrefix}::ffff`)).status,401);assert.equal((await post('/v1/auth/activate',{token:'wrong',password},undefined,`${ipPrefix}::ffff`)).status,429);
    });
    await t.test('rotating caller X-Forwarded-For cannot bypass invalid activation budget at API or web ingress',async()=>{
      const results:number[][]=[];
      for(const ingress of [base,'http://localhost:13000']) {
        const statuses:number[]=[];
        await db.query("DELETE FROM invitation_rate_limits WHERE key LIKE 'activation:%'");
        for(let n=0;n<6;n++) {
          const response=await fetch(ingress+'/v1/auth/activate',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:13000','X-Forwarded-For':`${ipPrefix}::${100+n}`},body:JSON.stringify({token:'wrong',password})});
          statuses.push(response.status);
        }
        results.push(statuses);
      }
      assert.deepEqual(results,[[401,401,401,401,401,429],[401,401,401,401,401,429]],'Both ingresses retain one budget despite rotating forwarded headers');
    });
    await t.test('issued activation tokens and token hashes are absent from API logs',async()=>{
      const logs=execFileSync('docker',['compose','-f','infra/ci/compose.yml','logs','--no-color','api'],{cwd:new URL('../../../../',import.meta.url),encoding:'utf8'});
      for(const token of tokens){assert.equal(logs.includes(token),false);assert.equal(logs.includes(createHash('sha256').update(token).digest('hex')),false);}
    });
  } finally {
    // This isolated suite intentionally exhausts the real ingress budget. Leave
    // the following independent browser suite fresh after all security assertions.
    await db.query("DELETE FROM invitation_rate_limits WHERE key LIKE 'activation:%'");
    await db.query('DELETE FROM audit_events WHERE actor_id IN (SELECT id FROM users WHERE email=ANY($1::text[]) OR id=ANY($2::uuid[]))',[emails,[owner,admin]]);
    await db.query('DELETE FROM user_invitations WHERE issuer_id=ANY($1::uuid[])',[[owner,admin]]);
    await db.query('DELETE FROM site_account_assignments WHERE site_id=ANY($1::uuid[])',[sites]);
    await db.query('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE email=ANY($1::text[]) OR id=ANY($2::uuid[]))',[emails,[owner,admin]]);
    await db.query('DELETE FROM employee_domain_grants WHERE updated_by=ANY($1::uuid[])',[[owner,admin]]);
    await db.query('DELETE FROM users WHERE email=ANY($1::text[]) OR id=ANY($2::uuid[])',[emails,[owner,admin]]);
    await db.query('DELETE FROM sites WHERE id=ANY($1::uuid[])',[sites]);
    await db.query('DELETE FROM customers WHERE id=ANY($1::uuid[])',[[customer,otherCustomer]]);await db.end();
  }
});
