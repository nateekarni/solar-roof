import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {openFixtureBrowser} from './browser-transport.mjs';

const positions=[{id:'preset-finance',name:'บัญชี',rules:{'business.billing.view':true},revision:1},{id:'preset-director',name:'กรรมการบริษัท',rules:{'business.billing.view':true,'business.billing.approve':true},revision:1}];
const permissions=['business.billing.view','business.billing.approve'];
const employee={id:'employee-a',email:'employee@example.test',displayName:'พนักงาน',role:'accountant',status:'active',revision:7,companyPositionId:'preset-finance',companyPosition:'บัญชี',grant:{positionId:'preset-finance',overrides:{'business.billing.approve':false},scope:{mode:'selected',siteIds:['site-a']}}};

async function fixture(role='accountant'){
 const target=role==='accountant'?employee:{...employee,role,companyPositionId:'preset-director',companyPosition:'กรรมการบริษัท',grant:null};
 const require=createRequire(import.meta.url);
 const {build}=createRequire(require.resolve('tsx'))('esbuild');
 const bundle=await build({stdin:{contents:`
  import React from 'react';import {createRoot} from 'react-dom/client';
  import {EmployeeEditor} from './staff-permissions-workspace';
  window.saved=0;window.staffClosed=0;
  createRoot(document.getElementById('root')).render(<EmployeeEditor employee={${JSON.stringify(target)}} domain="business" positions={${JSON.stringify(positions)}} permissions={${JSON.stringify(permissions)}} sites={[{id:'site-a',name:'โรงเรียนตัวอย่าง'}]} onSaved={()=>window.saved++} onClose={()=>window.staffClosed++} canDeactivate={false}/>);
 `,resolveDir:fileURLToPath(new URL('../../features/settings/',import.meta.url)),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',tsconfig:fileURLToPath(new URL('../../tsconfig.ui-tests.json',import.meta.url)),define:{'process.env.NEXT_PUBLIC_API_URL':'""','process.env.API_INTERNAL_URL':'""','process.env.NODE_ENV':'"test"'}});
 const browser=await openFixtureBrowser(chromium,process.env);
 const page=await browser.newPage();
 page.setDefaultTimeout(5000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const bodies=[];let failNext=false,duplicateNext=false,transientNext=false;const latest=structuredClone(target),latestPositions=structuredClone(positions);
 await page.route('http://staff.test/**',async route=>{
  if(route.request().method()==='PATCH'){
   bodies.push(route.request().postDataJSON());
   const draft=bodies.at(-1);
   if(failNext){failNext=false;latest.revision++;latest.grant.overrides={'business.billing.view':false};}
   if(transientNext){transientNext=false;await route.fulfill({status:503,json:{message:'Temporarily unavailable'}});}
   else if(draft.revision!==latest.revision)await route.fulfill({status:409,json:{code:'EMPLOYEE_REVISION_CONFLICT',message:'Permissions changed; reload before saving'}});
   else if(duplicateNext){duplicateNext=false;latestPositions.push({id:'concurrent-preset',name:'หัวหน้าฝ่ายขาย',rules:{'business.billing.view':false,'business.billing.approve':false},revision:0});await route.fulfill({status:409,json:{code:'POSITION_NAME_EXISTS',message:'Position already exists; review existing preset',position:{id:'concurrent-preset',name:'หัวหน้าฝ่ายขาย'}}});}
   else{latest.revision++;await route.fulfill({json:{success:true,revision:latest.revision,position:{id:'created-preset',name:'หัวหน้าฝ่ายขาย'}}});}
  }else if(route.request().url().includes('/v1/team/employees'))await route.fulfill({json:{employees:[latest]}});
  else if(route.request().url().includes('/v1/team/positions'))await route.fulfill({json:{positions:latestPositions}});
  else await route.fulfill({contentType:'text/html',body:'<!doctype html><html><title>Staff position test</title><div id="root"></div></html>'});
 });
 try{await page.goto('http://staff.test/');await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.getByRole('dialog',{name:'จัดการพนักงาน'}).waitFor();}
 catch(error){await browser.close();throw new Error(errors.length?errors.join('\n'):error.message);}
 return {browser,page,bodies,errors,fail:()=>{failNext=true;},duplicate:()=>{duplicateNext=true;},transient:()=>{transientNext=true;}};
}

test('staff combobox keyboard selection, explicit creation, permission confirmation and atomic retry',async()=>{
 const {browser,page,bodies,errors,fail}=await fixture();
 try{
  const trigger=page.getByRole('combobox',{name:'ตำแหน่ง',exact:true});
  await trigger.focus();await trigger.press('ArrowDown');
  const search=page.getByRole('combobox',{name:'ค้นหาหรือพิมพ์ตำแหน่ง…',exact:true});
  await search.fill('  กรรม  ');await page.getByRole('option',{name:'สร้างตำแหน่ง “กรรม”',exact:true}).waitFor();
  await search.fill('กรรมการบริษัท');await search.press('ArrowDown');await search.press('Enter');
  await page.waitForFunction(()=>document.querySelector('#staff-position')?.textContent.includes('กรรมการบริษัท'));
  await page.getByRole('tab',{name:'สิทธิ์',exact:true}).click();
  await page.getByRole('combobox',{name:'ใบวางบิล อนุมัติ',exact:true}).click();
  await page.getByRole('option',{name:'อนุญาต',exact:true}).click();
  await page.getByRole('tab',{name:'โปรไฟล์',exact:true}).click();
  await trigger.click();await search.fill('  บัญชี  ');
  assert.equal(await page.getByRole('option',{name:/สร้างตำแหน่ง/}).count(),0);
  await search.press('Escape');assert.equal(await trigger.getAttribute('aria-expanded'),'false');
  await trigger.click();await search.fill('   ');
  assert.equal(await page.getByRole('option',{name:/สร้างตำแหน่ง/}).count(),0);
  await search.fill('หัวหน้าฝ่ายขาย');
  const create=page.getByRole('option',{name:'สร้างตำแหน่ง “หัวหน้าฝ่ายขาย”',exact:true});await create.waitFor();
  await search.press('Escape');assert.match(await trigger.innerText(),/กรรมการบริษัท/);
  await trigger.click();await search.fill('  หัวหน้าฝ่ายขาย  ');await search.press('ArrowDown');await search.press('Enter');
  await page.waitForFunction(()=>document.querySelector('#staff-position')?.textContent.includes('หัวหน้าฝ่ายขาย'));
  await page.getByRole('button',{name:'บันทึกสิทธิ์',exact:true}).click();
  assert.equal(bodies.length,0);await page.getByRole('alert').waitFor();
  await page.getByRole('tab',{name:'สิทธิ์',exact:true}).click();
  await page.getByRole('checkbox',{name:'ยืนยันสิทธิ์สำหรับตำแหน่งใหม่',exact:true}).check();
  fail();await page.getByRole('button',{name:'บันทึกสิทธิ์',exact:true}).click();
  await page.getByRole('alert').filter({hasText:/เปลี่ยน|changed|โหลด/}).waitFor();
  assert.equal(await page.evaluate(()=>window.saved),0);
  assert.deepEqual(bodies[0],{revision:7,position:{name:'หัวหน้าฝ่ายขาย',rules:{'business.billing.view':true,'business.billing.approve':true}},overrides:{'business.billing.approve':true},scope:{mode:'selected',siteIds:['site-a']}});
  assert.equal(await page.getByRole('button',{name:'บันทึกสิทธิ์',exact:true}).isDisabled(),true);
  // Even a programmatic submit cannot blindly resend the known-stale revision.
  await page.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(bodies.length,1);
  // Prove the server fixture will keep rejecting the same stale request.
  const repeatStatus=await page.evaluate(draft=>fetch('/v1/team/employees/employee-a/business',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)}).then(response=>response.status),bodies[0]);
  assert.equal(repeatStatus,409);assert.equal(bodies.length,2);
  await page.getByRole('button',{name:'โหลดข้อมูลล่าสุดเพื่อตรวจสอบ',exact:true}).click();
  await page.getByRole('region',{name:'ตรวจสอบข้อมูลล่าสุด',exact:true}).waitFor();
  assert.equal(bodies.length,2);assert.equal(await page.evaluate(()=>window.saved),0);
  await page.getByRole('button',{name:'ยืนยันว่าได้ตรวจสอบข้อมูลล่าสุด',exact:true}).click();
  assert.equal(bodies.length,2);
  await page.getByRole('button',{name:'บันทึกสิทธิ์',exact:true}).click();
  await page.waitForFunction(()=>window.saved===1);assert.deepEqual(bodies[2],{...bodies[0],revision:8});assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('a transient non-conflict failure keeps ordinary explicit retry without changing the base revision',async()=>{
 const {browser,page,bodies,errors,transient}=await fixture();
 try{
  transient();await page.getByRole('button',{name:'บันทึกสิทธิ์',exact:true}).click();await page.getByRole('alert').waitFor();
  assert.equal(await page.getByRole('button',{name:'โหลดข้อมูลล่าสุดเพื่อตรวจสอบ',exact:true}).count(),0);
  await page.getByRole('button',{name:'บันทึกสิทธิ์',exact:true}).click();await page.waitForFunction(()=>window.saved===1);
  assert.deepEqual(bodies[1],bodies[0]);assert.equal(bodies[1].revision,7);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('concurrent duplicate title reloads the existing preset and requires review before explicit assignment',async()=>{
 const {browser,page,bodies,errors,duplicate}=await fixture();
 try{
  await page.getByRole('combobox',{name:'ตำแหน่ง',exact:true}).click();
  const search=page.getByRole('combobox',{name:'ค้นหาหรือพิมพ์ตำแหน่ง…',exact:true});await search.fill('หัวหน้าฝ่ายขาย');await search.press('Enter');
  await page.getByRole('tab',{name:'สิทธิ์',exact:true}).click();await page.getByRole('checkbox',{name:'ยืนยันสิทธิ์สำหรับตำแหน่งใหม่',exact:true}).check();
  duplicate();await page.getByRole('button',{name:'บันทึกสิทธิ์',exact:true}).click();
  await page.getByRole('button',{name:'โหลดข้อมูลล่าสุดเพื่อตรวจสอบ',exact:true}).click();
  const review=page.getByRole('region',{name:'ตรวจสอบข้อมูลล่าสุด',exact:true});await review.waitFor();assert.match(await review.innerText(),/หัวหน้าฝ่ายขาย/);assert.doesNotMatch(await review.innerText(),/concurrent-preset/);
  assert.equal(bodies.length,1);assert.equal(await page.getByRole('button',{name:'บันทึกสิทธิ์',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'ยืนยันว่าได้ตรวจสอบข้อมูลล่าสุด',exact:true}).click();assert.equal(bodies.length,1);
  await page.getByRole('button',{name:'บันทึกสิทธิ์',exact:true}).click();await page.waitForFunction(()=>window.saved===1);
  assert.deepEqual(bodies[1],{revision:7,position:{id:'concurrent-preset'},overrides:{'business.billing.approve':false},scope:{mode:'selected',siteIds:['site-a']}});assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('built-in manager assigns a canonical title without editable grants or destructive domain controls',async()=>{
 const {browser,page,bodies,errors}=await fixture('owner');
 try{
  assert.match(await page.getByRole('combobox',{name:'ตำแหน่ง',exact:true}).innerText(),/กรรมการบริษัท/);
  assert.equal(await page.getByRole('button',{name:'ถอนสิทธิ์เขตนี้',exact:true}).count(),0);
  await page.getByRole('tab',{name:'สิทธิ์',exact:true}).click();
  assert.equal(await page.getByRole('combobox').count(),0);
  await page.getByText('สิทธิ์และขอบเขตไซต์กำหนดตามบทบาทเจ้าของหรือผู้ดูแลระบบ', {exact:true}).waitFor();
  await page.getByRole('button',{name:'บันทึกสิทธิ์',exact:true}).click();await page.waitForFunction(()=>window.saved===1);
  assert.deepEqual(bodies[0],{revision:7,position:{id:'preset-director'},overrides:{},scope:{mode:'all',siteIds:[]}});assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
