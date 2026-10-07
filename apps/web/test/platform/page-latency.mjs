import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {launchFixtureBrowser} from './fixture-browser.mjs';

// Capture readiness inside the browser. Driver round trips and the assertions
// below must not inflate the time at which the actual data became visible.
function captureCriticalPageReady() {
  let framePending=false;
  const visible=element=>element&&element.getClientRects().length>0&&getComputedStyle(element).visibility!=='hidden';
  const ready=()=>location.pathname==='/'
    ? [...document.querySelectorAll('.dashboard-content .stats-grid')].some(visible)
    : [...document.querySelectorAll('[role="status"]')].some(element=>visible(element)&&/[1-9]\d* rows on this page/.test(element.textContent??''))
      && [...document.querySelectorAll('[aria-busy="false"] tbody tr')].some(visible);
  const observer=new MutationObserver(check);
  function check() {
    if(Number.isFinite(globalThis.__criticalPageReadyMs)||framePending||!ready())return;
    framePending=true;
    requestAnimationFrame(()=>{
      framePending=false;
      if(!ready())return;
      globalThis.__criticalPageReadyMs=performance.now();
      observer.disconnect();
    });
  }
  observer.observe(document,{childList:true,subtree:true,attributes:true});
  addEventListener('DOMContentLoaded',check,{once:true});
  check();
}

export async function measurePages(tokens) {
  assert.equal(process.env.READINESS_WEB_URL,'http://localhost:13000');
  const browser=await launchFixtureBrowser();
  const samples=[];
  try {
    await Promise.all(tokens.map(async(token,user)=>{
      const context=await browser.newContext({viewport:{width:1440,height:900}});
      await context.addInitScript(captureCriticalPageReady);
      await context.addCookies([{name:'access_token',value:token,domain:'localhost',path:'/',httpOnly:true},{name:'locale',value:'en',domain:'localhost',path:'/'}]);
      try {
        for(const path of ['/','/sites','/billing','/settings/audit']) {
          const page=await context.newPage();
          for(const cache of ['browser-cold','browser-warm']) {
            const started=performance.now();let error=null,ms,timing;
            try {
              const response=await page.goto(process.env.READINESS_WEB_URL+path,{waitUntil:'domcontentloaded',timeout:30000});
              assert.ok(response?.ok(),'Page HTTP response');
              if(path==='/') await page.locator('.dashboard-content .stats-grid:visible').first().waitFor({state:'visible',timeout:30000});
              else {
                await page.getByRole('status').filter({hasText:/[1-9]\d* rows on this page/}).waitFor({timeout:30000});
                await page.locator('[aria-busy="false"] tbody tr').first().waitFor({state:'visible',timeout:30000});
              }
              await page.waitForFunction(()=>Number.isFinite(globalThis.__criticalPageReadyMs),{},{timeout:30000});
              ms=await page.evaluate(()=>globalThis.__criticalPageReadyMs);
              timing=await page.evaluate(()=>{
                const navigation=performance.getEntriesByType('navigation')[0];
                const scripts=performance.getEntriesByType('resource').filter(entry=>entry.initiatorType==='script');
                return {responseStartMs:navigation?.responseStart,domContentLoadedMs:navigation?.domContentLoadedEventEnd,
                  scriptBytes:scripts.reduce((sum,entry)=>sum+entry.encodedBodySize,0),
                  scripts:scripts.map(entry=>({path:new URL(entry.name).pathname,bytes:entry.encodedBodySize,durationMs:entry.duration})).sort((a,b)=>b.durationMs-a.durationMs).slice(0,5)};
              });
              assert.equal(new URL(page.url()).pathname,path,'Authenticated route remains selected');
              // Next's global route announcer is an ARIA live region, not an application error.
              const alerts=page.locator('main [role="alert"]:visible');
              assert.equal(await alerts.count(),0,`No rendered page error: ${(await alerts.allTextContents()).join('; ')}`);
            } catch(cause) {
              error=String(cause);
              timing={failureUrl:page.url(),visibleContent:await page.locator('main').innerText({timeout:1000}).catch(()=>''),statusMessages:await page.getByRole('status').allTextContents().catch(()=>[])};
            }
            samples.push({user,path,cache,ms:ms??performance.now()-started,driverElapsedMs:performance.now()-started,error,timing});
          }
          await page.close();
        }
      } finally {await context.close();}
    }));
  } finally {await browser.close();}
  return samples;
}
