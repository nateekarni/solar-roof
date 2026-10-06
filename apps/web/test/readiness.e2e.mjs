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
 assert.equal(await page.getByRole('link',{name:'โรงเรียน',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'รายปี',exact:true}).count(),0);
 await mkdir('test/artifacts',{recursive:true});
 await page.screenshot({path:'test/artifacts/dashboard-desktop.png',fullPage:true});
 await expectDeniedPage(page,'/sites');
 assert.equal((await page.request.get(base+'/v1/sites')).status(),403);
 await expectDeniedPage(page,'/reports');
 await page.goto(base+'/billing');await page.getByRole('heading',{level:1}).waitFor();
 await page.setViewportSize({width:390,height:844});
 await page.goto(base+'/');await page.getByRole('main').first().waitFor(); await page.getByRole('heading',{level:1}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'Mobile horizontal overflow');
 await page.screenshot({path:'test/artifacts/dashboard-mobile.png',fullPage:true});
 if(fixture) {
  for(const role of ['admin','operator','accountant','school']) {
   const context=await browser.newContext();const rolePage=await context.newPage();
   rolePage.on('pageerror',error=>errors.push(error.message));
   await rolePage.goto(base+'/login');
   await rolePage.getByLabel('อีเมล',{exact:true}).fill(fixture.accounts[role]);
   await rolePage.getByLabel('รหัสผ่าน',{exact:true}).fill(fixture.password);
   await rolePage.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();
   await rolePage.waitForURL(base+'/',{timeout:15000});
   await rolePage.getByRole('heading',{level:1}).waitFor();
   const identity=await rolePage.request.get(base+'/v1/auth/me');
   assert.equal(identity.status(),200);assert.equal((await identity.json()).role,role==='school'?'school_user':role);
   if(role==='school') {
    await expectDeniedPage(rolePage,'/sites');
    await expectDeniedPage(rolePage,'/reports');
    const denied=await rolePage.request.get(base+'/v1/sites/'+fixture.otherSiteId);
    assert.equal(denied.status(),403);
    const live=await rolePage.request.get(base+'/v1/sites/'+fixture.siteId+'/live-telemetry');
    assert.equal(live.status(),403);
    const summary=await rolePage.request.get(base+'/v1/dashboard/summary');
    assert.equal(summary.status(),200);const data=await summary.json();assert.deepEqual(data.sites.map(site=>site.id),[fixture.siteId]);
    assert.equal((await rolePage.goto(base+'/production')).status(),200);await rolePage.getByRole('heading',{level:1}).waitFor();
   } else {
    await rolePage.goto(base+'/sites');await rolePage.getByRole('heading',{level:1}).waitFor();
    if(role==='admin')await rolePage.getByRole('button',{name:/เพิ่มไซต์/}).waitFor();
    else assert.equal(await rolePage.getByRole('button',{name:/เพิ่มไซต์/}).count(),0);
   }
   if(role==='operator') {
    await rolePage.goto(base+'/reports');await rolePage.getByRole('button',{name:/สร้างรายงาน|Generate Report/}).first().click();
    await rolePage.locator('#r-type').click();await rolePage.getByRole('option',{name:/รายงานสถานะอุปกรณ์|Device & Gateway/}).click();
    for(const id of ['date-from','date-to']) {
     await rolePage.locator('#'+id).click();await rolePage.locator('[data-slot=calendar] .rdp-today button').filter({visible:true}).last().click();await rolePage.locator('#'+id).getAttribute('aria-expanded').then(value=>assert.equal(value,'false'));
    }
    await rolePage.locator('#r-format').click();await rolePage.getByRole('option',{name:'CSV (.csv)',exact:true}).click();
    const accepted=rolePage.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/v1/reports'));
    await rolePage.getByRole('dialog').locator('form').evaluate(form=>form.requestSubmit());const response=await accepted;assert.equal(response.status(),202);const queued=await response.json();assert.equal(queued.status,'queued');
    const card=rolePage.locator(`[data-job-id="${queued.jobId}"]`);await card.getByRole('status').filter({hasText:/^พร้อมใช้งาน —|^Ready —/}).waitFor({timeout:45000});
    const record=await rolePage.request.get(base+`/v1/jobs/${queued.jobId}`);assert.equal(record.status(),200);const completed=await record.json();assert.equal(completed.report.type,'device_health');assert.equal(completed.rowCount,1);
    const downloaded=rolePage.waitForEvent('download');await card.getByRole('button',{name:/ดาวน์โหลด|Download/,exact:true}).click();const artifact=await downloaded;assert.equal(artifact.suggestedFilename(),`report-${queued.jobId}.csv`);
    const csv=await readFile(await artifact.path(),'utf8');assert.ok(csv.includes(fixture.siteName),'Real worker exports the authorized site');assert.ok(csv.includes('meter-'),'Device report contains the fixture meter');assert.equal(csv.includes('Other '),false,'Other school data is absent');
   }
   await context.close();
  }
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: browser role destinations, own-school production, denied technical access for business roles, scoped operator reports, mobile width, zero page errors');
}finally{await browser.close();}


