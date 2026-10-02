import assert from 'node:assert/strict';
import {randomUUID,randomBytes,scryptSync} from 'node:crypto';
import {createRequire} from 'node:module';
import {launchFixtureBrowser} from './fixture-browser.mjs';
const {Pool}=createRequire(new URL('../../../api/package.json',import.meta.url))('pg');
const api=process.env.READINESS_API_URL,web=process.env.READINESS_WEB_URL;
assert.equal(api,'http://127.0.0.1:13001');assert.equal(web,'http://localhost:13000');
assert.equal(process.env.READINESS_DATABASE_URL,'postgresql://solar:ci-only-password@127.0.0.1:15432/solar_readiness');
const db=new Pool({connectionString:process.env.READINESS_DATABASE_URL});
const user=randomUUID(),school=randomUUID(),site=randomUUID(),email=`q1-browser-${user}@example.test`,password='Q1-browser-password-123!';
const salt=randomBytes(16).toString('hex'),hash=`scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;
const browser=await launchFixtureBrowser();
try {
 await db.query("INSERT INTO schools(id,name,code,region) VALUES($1,'Q1 Browser School',$2,'fixture')",[school,school]);
 await db.query("INSERT INTO sites(id,school_id,name,capacity_mwp) VALUES($1,$2,'Q1 Browser Site',0.1)",[site,school]);
 await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash,school_id) VALUES($1,$2,'Q1 Browser','admin','active',$3,$4)",[user,email,hash,school]);
 await db.query("INSERT INTO billing_cycles(id,site_id,period_start,period_end,cutoff_time,status,quality,opening_energy,closing_energy,consumed_kwh,rate,amount) SELECT gen_random_uuid(),$1,date '2026-09-01'-n*interval '1 month',date '2026-09-30'-n*interval '1 month',now(),'pending_verification','complete',100,110,10,1,10 FROM generate_series(1,26) n",[site]);
 const oldest=(await db.query('SELECT id FROM billing_cycles WHERE site_id=$1 ORDER BY period_end ASC LIMIT 1',[site])).rows[0].id;
 const login=await fetch(api+'/v1/auth/login',{method:'POST',headers:{Origin:web,'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(login.status,200);const tokens=await login.json();
 const context=await browser.newContext();await context.addCookies([{name:'access_token',value:tokens.accessToken,domain:'localhost',path:'/',httpOnly:true},{name:'refresh_token',value:tokens.refreshToken,domain:'localhost',path:'/',httpOnly:true}]);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]) {
  await page.setViewportSize(viewport);await page.goto(web+'/billing');
  await page.getByRole('searchbox',{name:'Operations search'}).waitFor();
  await page.getByRole('button',{name:'Next operation page',exact:true}).click();
  await page.waitForFunction(()=>new URL(location.href).searchParams.has('cursor'));
  await page.getByText('Q1 Browser Site',{exact:true}).filter({visible:true}).first().waitFor();
  const detailResponse=page.waitForResponse(response=>response.url().includes('/v1/billing-cycles/'+oldest)&&response.status()===200);
  if(viewport.width>1000){await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('menuitem',{name:/ดูรายละเอียดรอบบิล|View Billing Details/}).click();}
  else await page.getByRole('button',{name:/รายละเอียดรอบบิล|Billing Details/}).click();
  await detailResponse;await page.getByRole('dialog').waitFor();await page.getByRole('dialog').getByText('Q1 Browser School').first().waitFor();
  await page.keyboard.press('Escape');
  // Hold a real HTTP result to reproduce a response arriving after a new
  // search. The payload still comes from the private PostgreSQL fixture.
  let delayed;
  const delayedSeen=new Promise(resolve=>{delayed=resolve;});
  let holdOnce=true;
  await page.route('**/v1/operations/billing?*',async route=>{
   if(holdOnce&&new URL(route.request().url()).searchParams.get('search')==='Q1 Browser'){
    holdOnce=false;const response=await route.fetch();delayed();
    await new Promise(resolve=>setTimeout(resolve,900));
    await route.fulfill({response}).catch(()=>{});
   }else await route.continue();
  });
  await page.getByRole('searchbox',{name:'Operations search'}).fill('Q1 Browser');
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('search')==='Q1 Browser');assert.equal(new URL(page.url()).searchParams.has('cursor'),false,'Search resets server cursor');
  await delayedSeen;
  await page.getByRole('searchbox',{name:'Operations search'}).fill('no');
  await page.getByRole('searchbox',{name:'Operations search'}).fill('no-such');
  await page.getByRole('searchbox',{name:'Operations search'}).fill('no-such-row');
  await page.getByRole('status').filter({hasText:'0 rows on this page'}).waitFor();
  await new Promise(resolve=>setTimeout(resolve,1000));
  assert.equal(await page.getByRole('status').filter({hasText:'0 rows on this page'}).count(),1,'Delayed prior HTTP result cannot overwrite current search');
  await page.unroute('**/v1/operations/billing?*');
  await page.reload();await page.getByRole('searchbox',{name:'Operations search'}).waitFor();assert.equal(await page.getByRole('searchbox',{name:'Operations search'}).inputValue(),'no-such-row','URL query survives reload');
 }
 assert.deepEqual(errors,[]);console.log('PASS: Q1 desktop/mobile keyset next page, later-page actual detail, URL search reset and reload');
} finally {await browser.close();await db.query('DELETE FROM audit_events WHERE actor_id=$1',[user]);await db.query('DELETE FROM users WHERE id=$1',[user]);await db.query('DELETE FROM billing_cycles WHERE site_id=$1',[site]);await db.query('DELETE FROM sites WHERE id=$1',[site]);await db.query('DELETE FROM schools WHERE id=$1',[school]);await db.end();}
