import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {transformSync}=createRequire(import.meta.resolve('tsx'))('esbuild');

test('failed validation reveals a collapsed field, focuses in DOM order, and preserves values',async()=>{
 const browser=await chromium.launch({headless:true,channel:process.platform==="win32"?"msedge":undefined});
 try{
 const page=await browser.newPage({reducedMotion:'reduce'});
 await page.setContent('<div role="dialog" style="height:200px;overflow:auto"><div style="height:400px"></div><details><summary>More</summary><input name="first" value="kept"><input name="second"></details></div>');
 const source=readFileSync(new URL('../lib/form-feedback.ts',import.meta.url),'utf8');
 await page.addScriptTag({content:transformSync(source,{loader:'ts',format:'esm',target:'es2022'}).code.replace(/export\s*\{[^}]+\};?/g,'')});
 await page.evaluate(()=>{
  const first=document.querySelector('[name=first]');
  const second=document.querySelector('[name=second]');
  window.focusInvalidFields({second:{ref:second,message:'Second error'},first:{ref:first,message:'First error'}});
 });
 await page.waitForFunction(()=>document.activeElement?.getAttribute('name')==='first');
 assert.equal(await page.locator('details').getAttribute('open'),'');
 assert.equal(await page.locator('[name=first]').inputValue(),'kept');
 assert.equal(await page.locator('[name=first]').getAttribute('aria-invalid'),'true');
 assert.ok(await page.locator('[role=dialog]').evaluate(el=>el.scrollTop)>0);
 }finally{await browser.close();}
});


test('new server errors focus a persistent summary and retry can focus the same message again',async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 try{
  const page=await browser.newPage({reducedMotion:'reduce'});
  await page.setContent('<div role="dialog" style="height:200px;overflow:auto"><form><input name="email" value="retained"><div style="height:500px"></div><button>Save</button></form></div>');
  const source=readFileSync(new URL('../lib/form-feedback.ts',import.meta.url),'utf8');
  await page.addScriptTag({content:transformSync(source,{loader:'ts',format:'esm',target:'es2022'}).code.replace(/export\s*\{[^}]+\};?/g,'')});
  await page.evaluate(()=>{
   const root=document.querySelector('[role=dialog]');window.observeFormErrors(root);
   const error=document.createElement('p');error.setAttribute('role','alert');error.textContent='Unable to save. Try again.';root.append(error);
  });
  await page.waitForFunction(()=>document.activeElement?.getAttribute('role')==='alert');
  assert.equal(await page.locator('[name=email]').inputValue(),'retained');
  assert.ok(await page.locator('[role=dialog]').evaluate(el=>el.scrollTop)>0);
  await page.locator('input').focus();
  await page.evaluate(()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await page.waitForFunction(()=>document.activeElement?.getAttribute('role')==='alert');
 }finally{await browser.close();}
});

test('native validation focuses the first invalid control, not the final invalid event',async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 try{
  const page=await browser.newPage({reducedMotion:'reduce'});
  await page.setContent('<div role="dialog" style="height:180px;overflow:auto"><form><input name="first" required><div style="height:400px"></div><input name="last" required><button>Save</button></form></div>');
  const source=readFileSync(new URL('../lib/form-feedback.ts',import.meta.url),'utf8');
  await page.addScriptTag({content:transformSync(source,{loader:'ts',format:'esm',target:'es2022'}).code.replace(/export\s*\{[^}]+\};?/g,'')});
  await page.evaluate(()=>window.observeFormErrors(document.querySelector('[role=dialog]')));
  await page.getByRole('button',{name:'Save'}).click();
  await page.waitForFunction(()=>document.activeElement?.getAttribute('name')==='first');
  await page.locator('[name=first]').fill('kept');
  await page.getByRole('button',{name:'Save'}).click();
  await page.waitForFunction(()=>document.activeElement?.getAttribute('name')==='last');
  assert.equal(await page.locator('[name=first]').inputValue(),'kept');
 }finally{await browser.close();}
});
