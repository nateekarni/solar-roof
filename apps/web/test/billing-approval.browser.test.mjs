import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {openFixtureBrowser} from './platform/browser-transport.mjs';
const {build}=createRequire(import.meta.resolve('tsx'))('esbuild');
const ids=['b5ca6e69-688d-4d43-8b8f-99f2b0df26ca','b5ca6e69-688d-4d43-8b8f-99f2b0df26cb'];
const rows=ids.map((id,index)=>({id,period:'2026-09',customerName:'บริษัท ตัวอย่าง',siteName:`Roof ${index+1}`,amount:'1070',simulatedTax:'70',dueDate:'2026-10-15',status:'draft',billingStatusView:'pending_issue_approval'}));
const results=[{label:{period:'2026-09',customer:'Server customer',site:'Server roof'},status:'issued',documentNumber:'INV-01',message:'ออกใบวางบิลแล้ว'},{label:{period:'2026-09',customer:'Server customer',site:'Server failed roof'},status:'failed',message:'กรุณาคำนวณใบวางบิลใหม่ตามการตั้งค่าปัจจุบันก่อนอนุมัติ'}];
async function fixture(position='กรรมการบริษัท',{denyApproval=false,rejectAfterFirst=false,surface='table',legacySeed=false,previewUnavailableSecond=false}={}){
 const user={id:'actor',email:'actor@example.test',displayName:'สมชาย ใจดี',role:'accountant',companyPosition:position,hasSignature:false};
 const legacyUser={id:user.id,email:user.email,displayName:user.displayName,role:user.role};
 const initial={columns:[],rows,idKey:'id',page:{limit:25,nextCursor:null,hasMore:false},facets:{billingStatusCounts:{all:2,pending_issue_approval:2,awaiting_payment:0,pending_verification:0,overdue:0,paid:0,unsuccessful:0}}};
 const bundle=await build({stdin:{contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {OperationQueryTable} from './features/shared/operation-query-table';
 import {BillingRecordActions} from './features/billing/billing-record-actions';
 import {BillingDetailModal} from './features/billing/billing-detail-modal';
 import {SessionUserProvider} from './providers/session-user-provider';import {LocaleProvider} from './providers/locale-provider';
 import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
 import {SearchParamsContext,PathnameContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
 function Fixture(){
  const [record,setRecord]=React.useState(${JSON.stringify(rows[0])});
  const router={bfcacheId:'test',back(){},forward(){},refresh(){setRecord({...record,status:'issued',billingStatusView:'awaiting_payment'});},push(){},replace(){},prefetch(){}};
  return <AppRouterContext.Provider value={router}><SearchParamsContext.Provider value={new URLSearchParams()}><PathnameContext.Provider value="/billing"><SessionUserProvider user={${JSON.stringify(legacySeed?legacyUser:user)}}><LocaleProvider initialLocale="en">{${JSON.stringify(surface)}==='record'?<BillingRecordActions row={record}/>:${JSON.stringify(surface)}==='modal'?<BillingDetailModal open billingId={record.id} initialData={record} onOpenChange={()=>{}} onUpdated={()=>router.refresh()}/>:<OperationQueryTable initial={${JSON.stringify(initial)}} resource="billing" title="Bills" summary={[]}/>}</LocaleProvider></SessionUserProvider></PathnameContext.Provider></SearchParamsContext.Provider></AppRouterContext.Provider>;
 }
 createRoot(document.getElementById('root')).render(<Fixture/>);
 `,resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',tsconfig:fileURLToPath(new URL('../tsconfig.ui-tests.json',import.meta.url)),define:{'process.env':'{}','process.env.NEXT_PUBLIC_API_URL':'""','process.env.API_INTERNAL_URL':'""','process.env.NODE_ENV':'"test"'}});
 const browser=await openFixtureBrowser(chromium,process.env);const page=await browser.newPage();page.setDefaultTimeout(5000);
 const posts=[],gets=[],errors=[];let submitted=false;
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('http://approval.test/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()==='POST'){posts.push({path,body:request.postDataJSON()});if(rejectAfterFirst&&submitted){await route.fulfill({status:500,json:{message:'Internal failure b5ca6e69-688d-4d43-8b8f-99f2b0df26ca'}});return;}submitted=true;await route.fulfill({json:path=== '/v1/billing-cycles/approve-issuance'?{results:previewUnavailableSecond?[results[0]]:results}:results[0]});}
  else if(path.endsWith('/issuance-preview')){gets.push(path);const row=rows.find(row=>path.includes(row.id));await route.fulfill({json:previewUnavailableSecond&&row.id===ids[1]?{failure:results[1]}:{...row,rate:'4',subtotal:'1000',tax:'70',dueDate:'2026-11-15',recipients:[{name:'Review Recipient',email:'recipient@example.test'}],approver:{displayName:user.displayName,position:user.companyPosition,hasSignature:user.hasSignature},reviewToken:'a'.repeat(64)}});}
  else if(path==='/v1/auth/me')await route.fulfill({json:legacyUser});
  else if(path==='/v1/me'){gets.push(path);await route.fulfill({json:user});}
  else if(path==='/v1/auth/capabilities')await route.fulfill({json:{actions:[],unavailable:{},operationsActions:denyApproval?[]:['approve_invoice']}});
  else if(path.includes('/v1/operations/billing/records/'))await route.fulfill({json:{row:submitted?{...rows[0],status:'issued',billingStatusView:'awaiting_payment'}:rows[0]}});
  else if(path.startsWith('/v1/operations/billing')){gets.push(path);await route.fulfill({json:path.endsWith('summary')?[]:submitted?{...initial,rows:[rows[1]],facets:{billingStatusCounts:{...initial.facets.billingStatusCounts,pending_issue_approval:1,awaiting_payment:1}}}:initial});}
  else await route.fulfill({contentType:'text/html',body:'<!doctype html><html><title>Approval fixture</title><div id="root"></div></html>'});
 });
 await page.goto('http://approval.test/billing');await page.addScriptTag({type:'module',content:bundle.outputFiles[0].text});
 if(surface==='table')await page.getByRole('checkbox',{name:'Select all eligible bills on this page',exact:true}).waitFor();
 else await page.getByRole('button',{name:'Approve and issue',exact:true}).waitFor();
 return {browser,page,posts,gets,errors};
}
test('partial bulk completion refreshes counts, clears selection and keeps failures visible',async()=>{
 const {browser,page,posts,gets,errors}=await fixture();try{
  await page.getByRole('checkbox',{name:'Select all eligible bills on this page',exact:true}).click();
  await page.getByRole('button',{name:'Approve and issue',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();assert.match(await dialog.innerText(),/สมชาย ใจดี.*กรรมการบริษัท/s);
  assert.doesNotMatch(await dialog.innerHTML(),/b5ca6e69/);
  await dialog.getByRole('button',{name:'Approve and issue',exact:true}).click();
  await page.getByText('1 still awaiting approval',{exact:true}).waitFor();
  await page.getByRole('tab',{name:/Awaiting issuance approval.*1/}).waitFor();
  assert.deepEqual(posts,[{path:'/v1/billing-cycles/approve-issuance',body:{billingCycleIds:ids,reviewTokens:Object.fromEntries(ids.map(id=>[id,'a'.repeat(64)]))}}]);
  assert.ok(gets.includes('/v1/operations/billing/summary'));
  const pending=page.getByRole('checkbox',{name:'Select 2026-09 บริษัท ตัวอย่าง Roof 2',exact:true});assert.equal(await pending.getAttribute('aria-checked'),'false');
  await pending.click();assert.equal(await pending.getAttribute('aria-checked'),'true');
  assert.match(await page.locator('body').innerText(),/Server failed roof.*Recalculate/s);
  assert.doesNotMatch(await page.locator('body').innerHTML(),/b5ca6e69/);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('row approval reviews actual recipients and effective date before submitting its token',async()=>{
 const {browser,page,posts,errors}=await fixture();try{
  await page.getByRole('button',{name:'Open actions menu',exact:true}).first().click();
  await page.getByRole('menuitem',{name:'Approve and issue',exact:true}).click();
  await page.getByText('Review Recipient · recipient@example.test',{exact:true}).waitFor();
  assert.match(await page.getByRole('dialog').innerText(),/15 November 2026/);
  await page.getByRole('dialog').getByRole('button',{name:'Approve and issue',exact:true}).click();
  await page.getByText('1 document issued',{exact:true}).waitFor();
  assert.deepEqual(posts,[{path:`/v1/billing-cycles/${ids[0]}/approve-issuance`,body:{reviewToken:'a'.repeat(64)}}]);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('an unavailable preview stays pending while other reviewed bills can be approved',async()=>{
 const {browser,page,posts}=await fixture('Director',{previewUnavailableSecond:true});try{
  await page.getByRole('checkbox',{name:'Select all eligible bills on this page',exact:true}).check();await page.getByRole('button',{name:'Approve and issue',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByText(/Server failed roof/).waitFor();
  await dialog.getByRole('button',{name:'Approve and issue',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('[role=dialog]'));
  assert.deepEqual(posts[0],{path:'/v1/billing-cycles/approve-issuance',body:{billingCycleIds:[ids[0]],reviewTokens:{[ids[0]]:'a'.repeat(64)}}});
  assert.match(await page.locator('body').innerText(),/Server failed roof.*Recalculate/s);
 }finally{await browser.close();}
});
test('missing position prevents submission and provides account navigation',async()=>{
 const {browser,page,posts}=await fixture(null);try{
  await page.getByRole('button',{name:'Open actions menu',exact:true}).first().click();await page.getByRole('menuitem',{name:'Approve and issue',exact:true}).click();
  const dialog=page.getByRole('dialog');assert.equal(await dialog.getByRole('button',{name:'Approve and issue',exact:true}).isDisabled(),true);
  assert.equal(await dialog.getByRole('link',{name:'My Account',exact:true}).getAttribute('href'),'/settings/account');assert.deepEqual(posts,[]);
 }finally{await browser.close();}
});
test('capability denial hides both row and bulk approval',async()=>{
 const {browser,page,posts}=await fixture('Director',{denyApproval:true});try{
  await page.getByRole('checkbox',{name:'Select all eligible bills on this page',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Approve and issue',exact:true}).count(),0);
  await page.getByRole('button',{name:'Open actions menu',exact:true}).first().click();
  assert.equal(await page.getByRole('menuitem',{name:'Approve and issue',exact:true}).count(),0);assert.deepEqual(posts,[]);
 }finally{await browser.close();}
});
test('transport failure preserves pending selection and prior results without exposing raw error',async()=>{
 const {browser,page,errors}=await fixture('Director',{rejectAfterFirst:true});try{
  await page.getByRole('checkbox',{name:'Select all eligible bills on this page',exact:true}).click();
  await page.getByRole('button',{name:'Approve and issue',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Approve and issue',exact:true}).click();
  await page.getByText('1 still awaiting approval',{exact:true}).waitFor();
  const pending=page.getByRole('checkbox',{name:'Select 2026-09 บริษัท ตัวอย่าง Roof 2',exact:true});await pending.click();
  await page.getByRole('button',{name:'Approve and issue',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Approve and issue',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Unable to issue documents'}).waitFor();
  await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await pending.getAttribute('aria-checked'),'true');assert.match(await page.locator('body').innerText(),/Server failed roof/);
  assert.doesNotMatch(await page.locator('body').innerHTML(),/Internal failure|b5ca6e69/);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
for(const surface of ['record','modal']){
 test(`${surface} detail approval retains server result after refreshed status hides the action`,async()=>{
  const {browser,page,posts,errors}=await fixture('Director',{surface});try{
   await page.getByRole('button',{name:'Approve and issue',exact:true}).click();
   await page.getByRole('dialog').last().getByRole('button',{name:'Approve and issue',exact:true}).click();
   await page.getByText('1 document issued',{exact:true}).waitFor();
   await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Approve and issue'));
   assert.match(await page.locator('body').innerText(),/Server customer.*Server roof/s);assert.deepEqual(posts,[{path:`/v1/billing-cycles/${ids[0]}/approve-issuance`,body:{reviewToken:'a'.repeat(64)}}]);assert.deepEqual(errors,[]);
  }finally{await browser.close();}
 });
}
for(const surface of ['record','table']){
 test(`${surface} approval refreshes missing legacy identity from the canonical session contract`,async()=>{
  const {browser,page,gets,errors}=await fixture('Live Director',{surface,legacySeed:true});try{
   if(surface==='table')await page.getByRole('checkbox',{name:'Select all eligible bills on this page',exact:true}).click();
   await page.getByRole('button',{name:'Approve and issue',exact:true}).click();
   const dialog=page.getByRole('dialog');await dialog.waitFor();
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await page.getByText('Company position: Live Director',{exact:true}).waitFor();
   await page.waitForFunction(()=>Array.from(document.querySelectorAll('[role=dialog] button')).some(button=>button.textContent==='Approve and issue'&&!button.disabled));assert.ok(gets.some(path=>path.endsWith('/issuance-preview')));assert.ok(gets.includes('/v1/me'));assert.deepEqual(errors,[]);
  }finally{await browser.close();}
 });
}
