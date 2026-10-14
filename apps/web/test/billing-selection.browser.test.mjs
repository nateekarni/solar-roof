import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {openFixtureBrowser} from './platform/browser-transport.mjs';

const {build}=createRequire(import.meta.resolve('tsx'))('esbuild');
const user={id:'test-admin',email:'admin@example.test',displayName:'Admin',role:'admin'};
const rows=[
 {id:'secret-a',period:'October',customerName:'School A',siteName:'Roof A',status:'draft',billingStatusView:'pending_issue_approval'},
 {id:'secret-b',period:'November',customerName:'School B',siteName:'Roof B',status:'approved',billingStatusView:'pending_issue_approval'},
 {id:'secret-paid',period:'September',customerName:'School C',siteName:'Roof C',status:'pending_issue_approval',billingStatusView:'paid'},
];
let bundlePromise;
async function fixture(){
 // Mount the production OperationTable, DataTable/flexRender and Radix Checkbox.
 // Only external capabilities/session reads and the Next router boundary are fixtures.
 bundlePromise??=build({stdin:{contents:`
  import React from 'react';
  import {createRoot} from 'react-dom/client';
  import {OperationTable} from './features/shared/operation-table';
  import {SessionUserProvider} from './providers/session-user-provider';
  import {LocaleProvider} from './providers/locale-provider';
  import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
  import {SearchParamsContext,PathnameContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
  const user=${JSON.stringify(user)},rows=${JSON.stringify(rows)};
  const router={bfcacheId:'test',back(){},forward(){},refresh(){},push(){},replace(){},prefetch(){}};
  createRoot(document.getElementById('root')).render(
   <AppRouterContext.Provider value={router}><SearchParamsContext.Provider value={new URLSearchParams()}><PathnameContext.Provider value="/billing">
    <SessionUserProvider user={user}><LocaleProvider initialLocale="en">
     <OperationTable resource="billing" title="Bills" columns={[]} rows={rows} summary={[]} serverManaged/>
    </LocaleProvider></SessionUserProvider>
   </PathnameContext.Provider></SearchParamsContext.Provider></AppRouterContext.Provider>
  );
 `,resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',tsconfig:fileURLToPath(new URL('../tsconfig.ui-tests.json',import.meta.url)),define:{'process.env':'{}','process.env.NEXT_PUBLIC_API_URL':'""','process.env.API_INTERNAL_URL':'""','process.env.NODE_ENV':'"test"'}});
 const bundle=await bundlePromise;
 const browser=await openFixtureBrowser(chromium,process.env);
 const errors=[];
 try{
  const page=await browser.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://billing-selection.test/**',async route=>{
   if(route.request().url().endsWith('/v1/auth/capabilities'))await route.fulfill({json:{actions:[],unavailable:{}}});
   else if(route.request().url().endsWith('/v1/auth/me'))await route.fulfill({json:user});
   else await route.fulfill({contentType:'text/html',body:'<!doctype html><html><title>Billing selection test</title><div id="root"></div></html>'});
  });
  await page.goto('http://billing-selection.test/billing');
  await page.addScriptTag({type:'module',content:bundle.outputFiles[0].text});
  await page.getByRole('checkbox',{name:'Select October School A Roof A',exact:true}).waitFor();
  return {browser,page,errors};
 }catch(error){await browser.close();throw new Error(errors.length?errors.join('\n'):error.message);}
}

for(const target of ['row','header']){
 test(`desktop billing ${target} checkbox retains keyboard focus after selection changes`,async()=>{
  const {browser,page,errors}=await fixture();
  try{
   const row=page.getByRole('checkbox',{name:'Select October School A Roof A',exact:true});
   const other=page.getByRole('checkbox',{name:'Select November School B Roof B',exact:true});
   const header=page.getByRole('checkbox',{name:'Select all eligible bills on this page',exact:true});
   const checkbox=target==='row'?row:header;
   await checkbox.focus();
   await checkbox.press('Space');
   await page.waitForFunction(()=>document.querySelector('tbody [role=checkbox]')?.getAttribute('aria-checked')==='true');
   assert.equal(await checkbox.evaluate(element=>document.activeElement===element),true,'keyboard toggle must keep focus on the same checkbox');
   assert.equal(await header.getAttribute('aria-checked'),target==='row'?'mixed':'true');
   assert.equal(await other.getAttribute('aria-checked'),target==='row'?'false':'true');
   assert.equal(await page.getByRole('checkbox').count(),3,'paid row must remain ineligible despite its raw status');
   await checkbox.press('Space');
   await page.waitForFunction(()=>document.querySelector('tbody [role=checkbox]')?.getAttribute('aria-checked')==='false');
   assert.equal(await checkbox.evaluate(element=>document.activeElement===element),true,'a second keyboard toggle must also retain focus');
   assert.equal(await header.getAttribute('aria-checked'),'false');
   assert.equal(await other.getAttribute('aria-checked'),'false');
   assert.doesNotMatch(await page.locator('body').innerHTML(),/secret-a|secret-b|secret-paid/);
   assert.deepEqual(errors,[]);
  }finally{await browser.close();}
 });
}
