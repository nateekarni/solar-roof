import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {launchFixtureBrowser} from './fixture-browser.mjs';

export async function measurePages(tokens) {
  assert.equal(process.env.READINESS_WEB_URL,'http://localhost:13000');
  const browser=await launchFixtureBrowser();
  const samples=[];
  try {
    await Promise.all(tokens.map(async(token,user)=>{
      const context=await browser.newContext({viewport:{width:1440,height:900}});
      await context.addCookies([{name:'access_token',value:token,domain:'localhost',path:'/',httpOnly:true},{name:'locale',value:'en',domain:'localhost',path:'/'}]);
      try {
        for(const path of ['/','/sites','/billing','/settings/audit']) {
          const page=await context.newPage();
          for(const cache of ['browser-cold','browser-warm']) {
            const started=performance.now();let error=null;
            try {
              const response=await page.goto(process.env.READINESS_WEB_URL+path,{waitUntil:'domcontentloaded',timeout:30000});
              assert.ok(response?.ok(),'Page HTTP response');
              if(path==='/') await page.locator('.dashboard-content .stats-grid:visible').first().waitFor({state:'visible',timeout:30000});
              else {
                await page.getByRole('status').filter({hasText:/[1-9]\d* rows on this page/}).waitFor({timeout:30000});
                await page.locator('[aria-busy="false"] tbody tr').first().waitFor({state:'visible',timeout:30000});
              }
              assert.equal(new URL(page.url()).pathname,path,'Authenticated route remains selected');
              // Next's global route announcer is an ARIA live region, not an application error.
              const alerts=page.locator('main [role="alert"]:visible');
              assert.equal(await alerts.count(),0,`No rendered page error: ${(await alerts.allTextContents()).join('; ')}`);
            } catch(cause) {error=String(cause);}
            samples.push({user,path,cache,ms:performance.now()-started,error});
          }
          await page.close();
        }
      } finally {await context.close();}
    }));
  } finally {await browser.close();}
  return samples;
}
