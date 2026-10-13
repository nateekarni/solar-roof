import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {launchFixtureBrowser} from './platform/fixture-browser.mjs';

const base=process.env.READINESS_WEB_URL || 'http://localhost:13000';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error('Local readiness testing only');
const fixture=process.env.READINESS_ACCOUNTS_FILE?JSON.parse(await readFile(process.env.READINESS_ACCOUNTS_FILE,'utf8')):null;
const ownerEmail=fixture?.accounts.owner||process.env.READINESS_EMAIL;
if(!ownerEmail)throw new Error('Set READINESS_ACCOUNTS_FILE or READINESS_EMAIL to isolated test accounts');
const browser=await launchFixtureBrowser();
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
// Streamed Next.js notFound pages can retain HTTP 200; assert the rendered denial.
async function expectDeniedPage(target,path) {
 await target.goto(base+path);await target.getByRole('heading',{name:'404',exact:true}).waitFor();
}
try {
 const health=await page.request.get(base+'/health');
 assert.equal(health.status(),200,'Web liveness must work with only web runtime configuration');
 await page.goto(base+'/login');
 await page.getByLabel('อีเมล',{exact:true}).fill(ownerEmail);
 await page.getByLabel('รหัสผ่าน',{exact:true}).fill('Local-test-only-123!');
 await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();
 await page.waitForURL(base+'/',{timeout:15000});
 await page.getByRole('main').first().waitFor(); await page.getByRole('heading',{level:1}).waitFor();
 assert.equal(await page.getByRole('button',{name:'รายปี',exact:true}).count(),0);
 await mkdir('test/artifacts',{recursive:true});
 await page.screenshot({path:'test/artifacts/dashboard-desktop.png',fullPage:true});
 await page.goto(base+'/sites');await page.getByRole('heading',{level:1}).waitFor();
 assert.equal((await page.request.get(base+'/v1/sites')).status(),200);
 await expectDeniedPage(page,'/gateways');
 await expectDeniedPage(page,'/reports');
 await page.goto(base+'/billing');await page.getByRole('heading',{level:1}).waitFor();
 await page.setViewportSize({width:390,height:844});
 await page.goto(base+'/');await page.getByRole('main').first().waitFor(); await page.getByRole('heading',{level:1}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'Mobile horizontal overflow');
 await page.screenshot({path:'test/artifacts/dashboard-mobile.png',fullPage:true});
 if(fixture) {
  for(const role of ['admin','operator','accountant','customer']) {
   const context=await browser.newContext();const rolePage=await context.newPage();
   rolePage.on('pageerror',error=>errors.push(error.message));
   await rolePage.goto(base+'/login');
   await rolePage.getByLabel('อีเมล',{exact:true}).fill(fixture.accounts[role]);
   await rolePage.getByLabel('รหัสผ่าน',{exact:true}).fill(fixture.password);
   await rolePage.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();
   await rolePage.waitForURL(base+'/',{timeout:15000});
   await rolePage.getByRole('heading',{level:1}).waitFor();
   const identity=await rolePage.request.get(base+'/v1/auth/me');
   assert.equal(identity.status(),200);assert.equal((await identity.json()).role,role==='customer'?'customer_user':role);
   if(role==='customer') {
    await expectDeniedPage(rolePage,'/sites');
    await expectDeniedPage(rolePage,'/reports');
    const denied=await rolePage.request.get(base+'/v1/sites/'+fixture.otherSiteId);
    assert.equal(denied.status(),403);
    const live=await rolePage.request.get(base+'/v1/sites/'+fixture.siteId+'/live-telemetry');
    assert.equal(live.status(),403);
    const summary=await rolePage.request.get(base+'/v1/dashboard/summary');
    assert.equal(summary.status(),200);const data=await summary.json();assert.deepEqual(data.sites.map(site=>site.id),[fixture.siteId]);
    assert.equal((await rolePage.goto(base+'/production')).status(),200);await rolePage.getByRole('heading',{level:1}).waitFor();
   } else if(role==='admin'||role==='operator') {
    await expectDeniedPage(rolePage,'/sites');
    await rolePage.goto(base+'/gateways');await rolePage.getByRole('heading',{level:1}).waitFor();
    const gateways=await rolePage.request.get(base+'/v1/gateways');assert.equal(gateways.status(),200);
    if(role==='operator')assert.deepEqual((await gateways.json()).map(row=>row.siteId),[fixture.siteId]);
    await expectDeniedPage(rolePage,'/billing');
   } else {
    await rolePage.goto(base+'/billing');await rolePage.getByRole('heading',{level:1}).waitFor();
    await expectDeniedPage(rolePage,'/gateways');
   }
   await expectDeniedPage(rolePage,'/reports');
   const reports=await rolePage.request.post(base+'/v1/reports',{headers:{Origin:base},data:{type:'energy',format:'csv'}});
   assert.equal(reports.status(),403,`${role} legacy report creation stays disabled`);
   const jobs=await rolePage.request.get(base+'/v1/jobs/'+fixture.device);
   assert.equal(jobs.status(),403,`${role} legacy jobs stay disabled`);
   await context.close();
  }
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: browser role destinations, own-customer production, denied technical access for business roles, scoped technical grants and denied legacy reports, mobile width, zero page errors');
}finally{await browser.close();}


