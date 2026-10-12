// Browser plugin not available in this session; use installed Playwright.
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {password} from './fixture.mjs';
const require=createRequire(new URL('../../apps/web/package.json',import.meta.url));
const {chromium}=require('@playwright/test');
const browser=await chromium.launch({channel:'msedge',headless:true});
const evidence=[];
try{
 for(const [email,path,name] of [['owner@example.test','/?start_date=2026-09-01&end_date=2026-09-30','owner-dashboard'],['admin@example.test','/gateways','admin-gateways'],['customer01@example.test','/billing','customer-billing']]){
 const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=500)errors.push(`${r.status()} ${r.url()}`);});
 await page.goto('http://localhost:3000/login');await page.locator('input[type=email]').fill(email);await page.locator('input[type=password]').fill(password);await page.locator('button[type=submit]').click();await page.waitForURL(u=>!u.pathname.includes('login'),{timeout:30000});
 await page.goto('http://localhost:3000'+path);await page.locator('main').first().waitFor();await page.waitForTimeout(2500);
 const text=await page.locator('body').innerText();assert.ok(text.length>150);assert.ok(!/Application error|Internal Server Error|Runtime Error/.test(text));assert.deepEqual(errors,[]);
 await page.screenshot({path:`output/local-system/${name}.png`,fullPage:true});evidence.push({email,path,title:await page.title(),url:page.url(),bodyLength:text.length,errors});await context.close();
 }
 await writeFile('output/local-system/browser-results.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{await browser.close();}
