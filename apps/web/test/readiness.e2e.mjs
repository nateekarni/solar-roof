import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';

const base=process.env.READINESS_WEB_URL || 'http://localhost:13000';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error('Local readiness testing only');
const fixture=process.env.READINESS_ACCOUNTS_FILE?JSON.parse(await readFile(process.env.READINESS_ACCOUNTS_FILE,'utf8')):null;
const ownerEmail=fixture?.accounts.owner||process.env.READINESS_EMAIL;
if(!ownerEmail)throw new Error('Set READINESS_ACCOUNTS_FILE or READINESS_EMAIL to isolated test accounts');
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
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
 await page.goto(base+'/sites');await page.getByRole('main').first().waitFor(); await page.getByRole('heading',{level:1}).waitFor();
 assert.equal(await page.getByRole('button',{name:/เพิ่มไซต์/}).count(),0,'Owner must be view only');
 await page.getByRole('columnheader',{name:'อัปเดตล่าสุด'}).waitFor();
 await page.goto(base+'/reports');await page.getByRole('main').first().waitFor(); await page.getByRole('heading',{level:1}).waitFor();
 assert.equal((await page.locator('body').innerText()).includes('1.8 MB'),false);
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
   await rolePage.goto(base+'/sites');await rolePage.getByRole('heading',{level:1}).waitFor();
   if(role==='admin')await rolePage.getByRole('button',{name:/เพิ่มไซต์/}).waitFor();
   else assert.equal(await rolePage.getByRole('button',{name:/เพิ่มไซต์/}).count(),0);
   if(role==='school') {
    const denied=await rolePage.request.get(base+'/v1/sites/'+fixture.otherSiteId);
    assert.equal(denied.status(),403);
    const live=await rolePage.request.get(base+'/v1/sites/'+fixture.siteId+'/live-telemetry');
    assert.equal(live.status(),200);assert.equal((await live.json()).metrics.activePower,1200);
    await rolePage.getByText(fixture.siteName,{exact:true}).filter({visible:true}).first().waitFor();
   }
   await context.close();
  }
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: browser login, dashboard, hidden school/year controls, owner view-only sites, report catalogue, mobile width, zero page errors');
}finally{await browser.close();}


