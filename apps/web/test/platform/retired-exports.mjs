import assert from 'node:assert/strict';
import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import { createRequire } from 'node:module';
import { launchFixtureBrowser } from './fixture-browser.mjs';

// Retired exports must stay inaccessible even to managers and existing creators.
export async function assertRetiredExports(paths) {
 const { Pool } = createRequire(new URL('../../../api/package.json', import.meta.url))('pg');
 const api=process.env.READINESS_API_URL,web=process.env.READINESS_WEB_URL;
 assert.equal(api,'http://127.0.0.1:13001');assert.equal(web,'http://localhost:13000');
 assert.equal(process.env.READINESS_DATABASE_URL,'postgresql://solar:ci-only-password@127.0.0.1:15432/solar_readiness');
 const db=new Pool({connectionString:process.env.READINESS_DATABASE_URL}),browser=await launchFixtureBrowser();
 const user=randomUUID(),job=randomUUID(),email=`retired-${user}@example.test`,password='Retired-fixture-password-123!';
 const salt=randomBytes(16).toString('hex'),hash=`scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;
 try {
  await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash) VALUES($1,$2,'Retired exports','admin','active',$3)",[user,email,hash]);
  await db.query("INSERT INTO platform_jobs(id,kind,status,created_by,payload,payload_hash) VALUES($1,'report','failed',$2,'{}','retired-browser')",[job,user]);
  const login=await fetch(api+'/v1/auth/login',{method:'POST',headers:{Origin:web,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  assert.equal(login.status,200);const tokens=await login.json();
  const headers={Origin:web,'Content-Type':'application/json',Authorization:`Bearer ${tokens.accessToken}`};
  const context=await browser.newContext();
  await context.addCookies([{name:'access_token',value:tokens.accessToken,domain:'localhost',path:'/',httpOnly:true},{name:'locale',value:'en',domain:'localhost',path:'/'}]);
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const role of ['owner','admin','operator','accountant','customer_user']) {
   await db.query('UPDATE users SET role=$1 WHERE id=$2',[role,user]);
   for(const [method,path] of paths) {
    const response=await fetch(api+path.replaceAll(':id',job),{method,headers,...(method==='POST'?{body:'{}'}:{})});
    assert.equal(response.status,403,`${role}: ${method} ${path} is retired`);
   }
   for(const width of [390,1440]) {
    await page.setViewportSize({width,height:900});await page.goto(web+`/reports?job=${job}`);
    await page.getByRole('heading',{name:'404',exact:true}).waitFor();
    assert.equal(await page.locator('[data-job-id]').count(),0,'Retired routes must not expose job cards');
   }
  }
  assert.deepEqual((await db.query('SELECT status,attempt FROM platform_jobs WHERE id=$1',[job])).rows,[{status:'failed',attempt:1}],'Denied requests cannot mutate existing jobs');
  assert.equal(Number((await db.query('SELECT count(*) FROM platform_jobs WHERE created_by=$1',[user])).rows[0].count),1,'Denied requests cannot enqueue exports');
  assert.deepEqual(errors,[]);await context.close();
 } finally {
  await browser.close();await db.query('DELETE FROM platform_jobs WHERE created_by=$1',[user]);
  await db.query('DELETE FROM audit_events WHERE actor_id=$1',[user]);await db.query('DELETE FROM users WHERE id=$1',[user]);await db.end();
 }
}
