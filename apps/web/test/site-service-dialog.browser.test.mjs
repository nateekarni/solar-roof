import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {openFixtureBrowser} from './platform/browser-transport.mjs';

const {build}=createRequire(import.meta.resolve('tsx'))('esbuild');
let bundlePromise;

async function fixture(){
  bundlePromise??=build({
    stdin:{
      contents:`
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {SiteServiceDialog} from './features/sites/site-service-dialog';
        import {LocaleProvider} from './providers/locale-provider';
        createRoot(document.getElementById('root')).render(
          <LocaleProvider initialLocale="en">
            <SiteServiceDialog open onOpenChange={()=>{}} />
          </LocaleProvider>
        );
      `,
      resolveDir:fileURLToPath(new URL('../',import.meta.url)),
      loader:'tsx',
    },
    bundle:true,
    write:false,
    platform:'browser',
    format:'esm',
    jsx:'automatic',
    tsconfig:fileURLToPath(new URL('../tsconfig.ui-tests.json',import.meta.url)),
    define:{
      'process.env':'{}',
      'process.env.NEXT_PUBLIC_API_URL':'""',
      'process.env.API_INTERNAL_URL':'""',
      'process.env.NODE_ENV':'"test"',
    },
  });
  const bundle=await bundlePromise;
  const browser=await openFixtureBrowser(chromium,process.env);
  const posts=[];
  const errors=[];
  try{
    const page=await browser.newPage({reducedMotion:'reduce'});
    page.setDefaultTimeout(5000);
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('http://site-service-dialog.test/**',async route=>{
      const request=route.request();
      if(request.url().endsWith('/v1/sites')&&request.method()==='POST'){
        posts.push(request.postDataJSON());
        await route.fulfill({status:201,json:{id:'site-created-too-early'}});
        return;
      }
      await route.fulfill({contentType:'text/html',body:'<!doctype html><html><title>Site service dialog test</title><div id="root"></div></html>'});
    });
    await page.goto('http://site-service-dialog.test/');
    await page.addScriptTag({type:'module',content:bundle.outputFiles[0].text});
    await page.getByRole('dialog').waitFor();
    return {browser,page,posts,errors};
  }catch(error){
    await browser.close();
    throw new Error(errors.length?errors.join('\n'):error.message);
  }
}

test('customer Next opens service settings without creating the site',async()=>{
  const {browser,page,posts,errors}=await fixture();
  try{
    await page.getByLabel('Site name').fill('Office roof');
    await page.getByLabel('Installed capacity (MWp)').fill('0.25');
    await page.getByRole('button',{name:'Next',exact:true}).click();

    await page.getByLabel('Display name').fill('Sunshine customer');
    await page.getByLabel('Organization code').fill('CUSTOMER-001');
    await page.getByRole('button',{name:'Next',exact:true}).click();

    await page.waitForTimeout(100);
    assert.equal(posts.length,0,'advancing from customer details must not POST /v1/sites');
    await page.getByRole('tab',{name:'Service & Billing',exact:true}).waitFor();
    assert.equal(await page.getByRole('tab',{name:'Service & Billing',exact:true}).getAttribute('data-state'),'active');
    assert.deepEqual(errors,[]);
  }finally{
    await browser.close();
  }
});
