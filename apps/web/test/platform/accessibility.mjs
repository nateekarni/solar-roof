import assert from 'node:assert/strict';
import {randomUUID,randomBytes,scryptSync} from 'node:crypto';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {launchFixtureBrowser} from './fixture-browser.mjs';
import AxeBuilder from '@axe-core/playwright';

const {Pool}=createRequire(new URL('../../../api/package.json',import.meta.url))('pg');
const api=process.env.READINESS_API_URL,web=process.env.READINESS_WEB_URL;
assert.equal(api,'http://127.0.0.1:13001');
assert.equal(web,'http://localhost:13000');
assert.equal(process.env.READINESS_DATABASE_URL,'postgresql://solar:ci-only-password@127.0.0.1:15432/solar_readiness');
const db=new Pool({connectionString:process.env.READINESS_DATABASE_URL});
const schools=Array.from({length:100},()=>randomUUID());
const school=schools[0],user=randomUUID(),device=randomUUID(),job=randomUUID();
const sites=Array.from({length:100},()=>randomUUID()),gateways=sites.map(()=>randomUUID());
const email=`u3-${user}@example.test`,password='U3-isolated-password-123!';
const salt=randomBytes(16).toString('hex'),hash=`scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;
// Docker publishes the fixture on IPv4; localhost IPv6 may belong to another project.
const browser=await launchFixtureBrowser(),checks=[];
try {
  await db.query("INSERT INTO schools(id,name,code,region) SELECT id,'U3 School '||n,id::text,'fixture' FROM unnest($1::uuid[]) WITH ORDINALITY AS x(id,n)",[schools]);
  await db.query("INSERT INTO sites(id,school_id,name,capacity_mwp) SELECT id,school,'U3 Site '||n,0.1 FROM unnest($1::uuid[],$2::uuid[]) WITH ORDINALITY AS x(id,school,n)",[sites,schools]);
  await db.query("INSERT INTO gateways(id,site_id,name,protocol,endpoint,last_seen_at) SELECT id,site,id::text,'mqtt','energy/'||id||'/#',CASE WHEN n=1 THEN now() ELSE now()-interval '1 day' END FROM unnest($1::uuid[],$2::uuid[]) WITH ORDINALITY AS x(id,site,n)",[gateways,sites]);
  await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash,school_id,preferred_language) VALUES($1,$2,'U3 User','admin','active',$3,$4,'en')",[user,email,hash,school]);
  await db.query("INSERT INTO devices(id,gateway_id,site_id,name,device_type,model,serial_number) VALUES($1::uuid,$2,$3,'U3 meter','meter','fixture',$1::text)",[device,gateways[0],sites[0]]);
  await db.query("INSERT INTO billing_meters(id,site_id,device_id) VALUES(gen_random_uuid(),$1,$2)",[sites[0],device]);
  await db.query("INSERT INTO telemetry_raw(id,device_id,site_id,source_time,received_time,raw_payload,normalized_value,unit,quality,ingestion_id,total_energy_kwh,active_power_w) VALUES(gen_random_uuid(),$1,$2,now(),now(),'{}',100,'kWh','complete',gen_random_uuid(),100,1200)",[device,sites[0]]);
  await db.query("INSERT INTO alerts(id,site_id,severity,title,detail,status,occurred_at) VALUES(gen_random_uuid(),$1,'critical','U3 Critical alert','Investigate gateway','open',now())",[sites[0]]);
  const login=await fetch(api+'/v1/auth/login',{method:'POST',headers:{Origin:web,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  assert.equal(login.status,200);const tokens=await login.json();
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Bangkok'});
  await context.addCookies([{name:'access_token',value:tokens.accessToken,domain:'localhost',path:'/',httpOnly:true},{name:'locale',value:'en',domain:'localhost',path:'/'}]);
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  const dashboardResponse=await page.goto(web+'/');
  assert.equal(dashboardResponse.status(),200,`Dashboard HTTP: ${page.url()} ${(await page.locator('body').innerText()).slice(0,800)}`);
  try {await page.locator('.dashboard-content .stats-grid:visible').waitFor();}
  catch(error){console.error('Dashboard diagnostic',page.url(),(await page.locator('body').innerText()).slice(0,1200),errors);throw error;}
  const statsBox=await page.locator('.dashboard-content .stats-grid:visible').boundingBox();
  assert.ok(statsBox.y<844,'Important KPIs precede the full site collection on mobile');
  const summary=page.getByRole('region',{name:'Gateway status summary',exact:true});
  await summary.waitFor();
  assert.ok(await summary.locator('li').count()<=5,'At most five actionable sites');
  assert.ok(await summary.locator('a[href^="/records/sites/"]').count()>0,'Site links point to their actual record details');
  assert.equal(await page.locator('.stat-value').filter({hasText:'1.2kW'}).count(),1,'1200W is visible instead of rounded 0MW');
  assert.ok((await page.getByText('U3 Critical alert',{exact:true}).boundingBox()).y<(await page.locator('.dashboard-3col').boundingBox()).y,'Critical alert precedes trends and map');
  const details=page.getByRole('button',{name:'Show details',exact:true});
  let powerRequests=0;page.on('request',request=>{if(request.url().includes('/v1/dashboard/power-flow'))powerRequests++;});
  await details.focus();await page.keyboard.press('Enter');
  await page.getByRole('heading',{name:'U3 Site 100',exact:true}).waitFor();
  const expandedAxe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
  assert.deepEqual(expandedAxe.violations.filter(item=>['serious','critical'].includes(item.impact)).map(item=>({id:item.id,targets:item.nodes.map(node=>node.target)})),[],'Expanded power details accessibility');
  await page.getByRole('button',{name:'Hide details',exact:true}).click();
  await page.waitForTimeout(500);const stoppedPowerRequests=powerRequests;
  await page.waitForTimeout(10500);assert.equal(powerRequests,stoppedPowerRequests,'Closed power details stop polling');
  for(const role of ['owner','admin','operator','accountant','school_user']) {
    await db.query('UPDATE users SET role=$1 WHERE id=$2',[role,user]);
    for(const width of [390,1440]) {
      await page.setViewportSize({width,height:844});await page.goto(web+'/');
      await page.getByRole('heading',{level:1}).waitFor();
      const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
      const serious=result.violations.filter(item=>['serious','critical'].includes(item.impact));
      if(serious.length)console.error(JSON.stringify(serious.map(({id,nodes})=>({id,nodes:nodes.map(({html,failureSummary})=>({html,failureSummary}))})),null,2));
      checks.push({role,width,violations:result.violations.map(({id,impact,nodes})=>({id,impact,targets:nodes.map(node=>node.target)})),incomplete:result.incomplete.map(({id})=>id)});
      assert.deepEqual(serious.map(item=>({id:item.id,targets:item.nodes.map(node=>node.target)})),[],`${role}/${width} accessibility`);
      if(role==='owner') {
        for(const region of await page.locator('[role="region"].overflow-y-auto').all()) {
          await region.focus();
          assert.equal(await region.evaluate(element=>element===document.activeElement),true,'Owner trend lists accept keyboard focus');
          const scrollable=await region.evaluate(element=>element.scrollHeight>element.clientHeight);
          if(scrollable){await page.keyboard.press('End');await page.waitForTimeout(150);assert.ok(await region.evaluate(element=>element.scrollTop>0),'Keyboard can scroll long trend lists');}
        }
      }
      const compare=page.getByRole('button',{name:'Compare sites',exact:true});
      if(['owner','school_user'].includes(role)){assert.equal(await compare.count(),0,'Business home has no technical comparison');}
      else {await compare.focus();await page.keyboard.press('Enter');await page.getByRole('dialog').waitFor();
       await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
       assert.equal(await compare.evaluate(element=>element===document.activeElement),true,'Dialog returns keyboard focus');}
    }
  }
  await db.query("UPDATE users SET role='admin' WHERE id=$1",[user]);
  await page.setViewportSize({width:720,height:422});await page.goto(web+'/');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'200% effective viewport reflows without page-level horizontal scrolling');
  await page.setViewportSize({width:1440,height:844});
  await page.goto(web+'/sites');
  const row=page.locator('tbody tr').filter({hasText:'U3 Site'}).first();
  await row.focus();await page.keyboard.press('Enter');await page.waitForURL('**/records/sites/*');await page.getByRole('heading',{name:'Site details',exact:true}).waitFor();
  await page.getByRole('link',{name:'Back to list',exact:true}).focus();await page.keyboard.press('Enter');await page.waitForURL(web+'/sites');
  // U2 carry: terminal jobs clear connectivity notices without restarting polling.
  await db.query("INSERT INTO platform_jobs(id,kind,status,created_by,scope,payload,payload_hash) VALUES($1,'report','cancelled',$2,$3,'{}','fixture')",[job,user,[school]]);
  await page.goto(web+`/reports?job=${job}`);const card=page.locator(`[data-job-id="${job}"]`);
  await card.getByRole('status').filter({hasText:/^Cancelled/}).waitFor();
  let statusRequests=0;page.on('request',request=>{if(request.url()===web+`/v1/jobs/${job}`)statusRequests++;});
  await context.setOffline(true);await card.getByRole('alert').waitFor();
  await context.setOffline(false);await card.getByRole('alert').waitFor({state:'hidden',timeout:5000});
  await page.waitForTimeout(3500);assert.equal(statusRequests,0,'Terminal job does not resume polling');
  assert.deepEqual(errors,[],'No page/console/hydration errors');
  await context.close();
  console.log('PASS U3: power precision, 100-site hierarchy, five roles, responsive axe/keyboard and terminal reconnect');
} finally {
  writeFileSync(new URL('../../../../test/artifacts/u3-accessibility-results.json',import.meta.url),JSON.stringify(checks,null,2));
  await browser.close();
  await db.query('DELETE FROM platform_jobs WHERE created_by=$1',[user]);
  await db.query('DELETE FROM audit_events WHERE actor_id=$1',[user]);
  await db.query('DELETE FROM users WHERE id=$1',[user]);
  await db.query('DELETE FROM alerts WHERE site_id=ANY($1::uuid[])',[sites]);
  await db.query('DELETE FROM telemetry_raw WHERE site_id=ANY($1::uuid[])',[sites]);
  await db.query('DELETE FROM telemetry_archive_dirty WHERE site_id=ANY($1::uuid[])',[sites]);
  await db.query('DELETE FROM telemetry_archive_scan WHERE site_id=ANY($1::uuid[])',[sites]);
  await db.query('DELETE FROM billing_meters WHERE device_id=$1',[device]);
  await db.query('DELETE FROM devices WHERE id=$1',[device]);
  await db.query('DELETE FROM gateways WHERE id=ANY($1::uuid[])',[gateways]);
  await db.query('DELETE FROM sites WHERE id=ANY($1::uuid[])',[sites]);
  await db.query('DELETE FROM schools WHERE id=ANY($1::uuid[])',[schools]);await db.end();
}
