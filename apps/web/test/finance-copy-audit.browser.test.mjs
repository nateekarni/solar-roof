import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {openFixtureBrowser} from './platform/browser-transport.mjs';
const {build}=createRequire(import.meta.resolve('tsx'))('esbuild');
const id='b5ca6e69-688d-4d43-8b8f-99f2b0df26ca';
async function fixture(surface,locale){
 const bundle=await build({stdin:{contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import {Toaster} from 'sonner';
 import {ManualBillDialog} from './features/billing/manual-bill-dialog';
 import {UserDetailModal} from './features/shared/detail-modals/user-detail-modal';
 import {LocaleProvider} from './providers/locale-provider';
 import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
 const router={bfcacheId:'test',back(){},forward(){},refresh(){},push(){},replace(){},prefetch(){}};
 function Fixture(){const [open,setOpen]=React.useState(true);return <AppRouterContext.Provider value={router}><LocaleProvider initialLocale=${JSON.stringify(locale)}><Toaster/>${surface==='user'?`<UserDetailModal open={open} onOpenChange={setOpen} user={{id:'${id}',displayName:'สมชาย ใจดี',email:'person@example.test',role:'owner',status:'active'}}/>`:'<ManualBillDialog open={open} onOpenChange={setOpen}/>'}</LocaleProvider></AppRouterContext.Provider>;}
 createRoot(document.getElementById('root')).render(<Fixture/>);
 `,resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',tsconfig:fileURLToPath(new URL('../tsconfig.ui-tests.json',import.meta.url)),define:{'process.env':'{}','process.env.NEXT_PUBLIC_API_URL':'""','process.env.NODE_ENV':'"test"'}});
 const browser=await openFixtureBrowser(chromium,process.env);const page=await browser.newPage();page.setDefaultTimeout(5000);const posts=[],errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 // A loopback origin retains the browser's real secure-context crypto API used
 // by the production idempotency key, without replacing the implementation.
 await page.route('http://localhost:32199/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(route.request().method()==='POST'){
   posts.push({path,body:route.request().postDataJSON()});
   await route.fulfill({json:path.endsWith('/preview')?{subtotal:'100',tax:'7',total:'107',lines:[{description:'Consulting',quantity:'1',unitPrice:'100',amount:'100'}]}:{id,status:'pending_issue_approval'}});
  }else if(path==='/v1/sites')await route.fulfill({json:[{id,name:'สำนักงานใหญ่',customerId:id,customerName:'บริษัท ตัวอย่าง'}]});
  else if(path.endsWith('/billing-settings'))await route.fulfill({json:{paymentTermDays:30}});
  else await route.fulfill({contentType:'text/html',body:'<!doctype html><html><title>Finance copy audit</title><div id="root"></div></html>'});
 });
 await page.goto('http://localhost:32199/');await page.addScriptTag({type:'module',content:bundle.outputFiles[0].text});await page.getByRole('dialog').waitFor();
 return {browser,page,posts,errors};
}
for(const locale of ['th','en']){
 test(`${locale} user details identify the person without rendering their internal UUID`,async()=>{
  const {browser,page,errors}=await fixture('user',locale);try{
   const text=await page.getByRole('dialog').innerText();assert.match(text,/สมชาย ใจดี/);assert.match(text,/person@example.test/);assert.doesNotMatch(text,/[0-9a-f]{8}-[0-9a-f]{4}-/i);
   assert.match(text,locale==='th'?/อีเมล/:/Email/);assert.deepEqual(errors,[]);
  }finally{await browser.close();}
 });
 test(`${locale} manual billing previews and prepares approval without claiming official issuance`,async()=>{
  const {browser,page,posts,errors}=await fixture('manual',locale);try{
   const dialog=page.getByRole('dialog');
   assert.match(await dialog.innerText(),locale==='th'?/รออนุมัติออกเอกสาร/:/issuance approval/i);
   await dialog.getByRole('combobox').nth(1).click();await page.getByRole('option',{name:'สำนักงานใหญ่',exact:true}).click();
   await dialog.locator('tbody input').nth(0).fill('Consulting');await dialog.locator('tbody input').nth(2).fill('100');
   await dialog.getByRole('button',{name:locale==='th'?'ตรวจสอบยอดและภาษี':'Review amount and tax',exact:true}).click();
   await dialog.getByRole('button',{name:locale==='th'?'ยืนยันสร้างรายการรออนุมัติ':'Create bill for approval',exact:true}).waitFor();
   assert.doesNotMatch(await dialog.innerText(),/ออกและส่งใบวางบิลทันที|issue.*immediately/i);
   assert.doesNotMatch(await dialog.innerText(),/[0-9a-f]{8}-[0-9a-f]{4}-/i);
   await dialog.getByRole('button',{name:locale==='th'?'ยืนยันสร้างรายการรออนุมัติ':'Create bill for approval',exact:true}).click();
   await page.getByText(locale==='th'?'สร้างใบวางบิลรออนุมัติออกเอกสารแล้ว':'Bill created and awaiting issuance approval',{exact:true}).waitFor();
   assert.deepEqual(posts.map(p=>p.path),['/v1/manual-bills/preview','/v1/manual-bills']);assert.equal(posts[1].body.siteId,id);assert.ok(posts[1].body.idempotencyKey);assert.deepEqual(errors,[]);
  }finally{await browser.close();}
 });
}
