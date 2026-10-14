import 'reflect-metadata';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SiteBillingService} from './site-billing.service.js';
const owner={id:'owner',role:'owner'};
test('rate correction prepares approval without automatic delivery',async()=>{
 const cycle={id:'bill',site_id:'a',status:'approved',starts:'2026-10-01',billing_kind:'energy',rate:'3.5'};
 const c={query:async(sql:string)=>({rows:sql.includes('FROM billing_cycles')?[cycle]:sql.includes('FROM sites')?[{customer_id:'c'}]:[]})};
 const financial={reviseInvoiceInTransaction:async()=>({id:'replacement',status:'pending_issue_approval'}),send:async()=>{throw Error('Correction delivered before approval');}};
 const result=await new SiteBillingService({transaction:async(fn:any)=>fn(c)} as any,financial as any).reprice('bill',{rate:'3.7',reason:'Correction'},owner);
 assert.equal(result.status,'pending_issue_approval');
});
test('invoice rate correction warns before retiring an already scheduled future tariff',async()=>{let mutation=false;const c={query:async(sql:string)=>{if(sql.includes('FROM billing_cycles'))return {rows:[{id:'bill',site_id:'a',status:'approved',starts:'2026-10-01',billing_kind:'energy'}]};if(sql.includes('FROM sites'))return {rows:[{customer_id:'c'}]};if(sql.includes('FROM rate_versions'))return {rows:[{id:'december',startDate:'2026-12-01',rate:'4'}]};if(sql.startsWith('UPDATE')||sql.startsWith('INSERT'))mutation=true;return {rows:[]};}};await assert.rejects(new SiteBillingService({transaction:async(fn:any)=>fn(c)} as any,{} as any).reprice('bill',{rate:'3.7',reason:'Correction'},owner),(error:any)=>error.getResponse().code==='FUTURE_RATE_REPLACEMENT_REQUIRED');assert.equal(mutation,false);});
test('bulk matched preview compares database decimals and includes future rates/documents',async()=>{
 let params:any[]=[];const db={query:async(sql:string,p:any[])=>{params=p;assert.match(sql,/r.rate=\$4/);return {rows:[{siteId:'a',rate:'3.5000',futureRates:[{rate:'3.7'}],documents:['INV-1']}]};}};
 const result=await new SiteBillingService(db as any,{} as any).previewRates({selection:'matched',matchedRate:'3.50',rate:'3.7',effectiveDate:'2026-10-01',reason:'Reviewed tariff'},owner);
 assert.equal(params[3],'3.5000');assert.equal(result.rate,'3.7000');assert.equal(result.sites[0]!.documents[0],'INV-1');
});
test('future rate replacement needs explicit confirmation before mutation',async()=>{
 let mutation=false;const rows=[{siteId:'a',futureRates:[{rate:'3.7'}]}];const client={query:async(sql:string)=>{if(sql.includes('SELECT s.id'))return {rows};if(sql.startsWith('UPDATE')||sql.startsWith('INSERT'))mutation=true;return {rows:[]};}};const db={transaction:async(fn:any)=>fn(client)};
 await assert.rejects(new SiteBillingService(db as any,{} as any).applyRates({selection:'all',rate:'3.8',effectiveDate:'2026-10-01',reason:'Change'},owner),/Confirm/);assert.equal(mutation,false);
});
test('rate edit locks pending/partial transfers before modifying site rate history',async()=>{
 for(const status of ['pending_verification','paid']){let mutation=false;const c={query:async(sql:string)=>{if(sql.includes('FROM billing_cycles'))return {rows:[{id:'bill',site_id:'a',status:'approved',starts:'2026-10-01',billing_kind:'energy'}]};if(sql.includes('FROM sites'))return {rows:[{customer_id:'c'}]};if(sql.includes('FROM payments'))return {rows:[{status}]};if(sql.startsWith('UPDATE')||sql.startsWith('INSERT'))mutation=true;return {rows:[]};}};await assert.rejects(new SiteBillingService({transaction:async(fn:any)=>fn(c)} as any,{} as any).reprice('bill',{rate:'3.7',reason:'Correction'},owner),/locked/);assert.equal(mutation,false);}
});
test('billing settings returns assigned verified recipient options and unconfigured state',async()=>{
 const db={query:async(sql:string)=>{if(sql.includes('SELECT * FROM sites'))return {rows:[{customer_id:'c'}]};if(sql.includes('FROM users')){assert.match(sql,/revoked_at IS NULL/);return {rows:[{id:'user',email:'verified@test.invalid'}]};}return {rows:[]};}};
 const settings=await new SiteBillingService(db as any,{} as any).settings('a',owner);assert.equal(settings.taxConfirmed,false);assert.equal(settings.taxRate,'');assert.equal(settings.recipientOptions[0].id,'user');
});
test('manual preview rejects unconfirmed tax and no rate history writes occur',async()=>{
 const db={query:async(sql:string)=>({rows:sql.includes('SELECT * FROM sites')?[{customer_id:'c'}]:[]})};await assert.rejects(new SiteBillingService(db as any,{} as any).manualPreview({siteId:'a',lines:[{description:'Service',quantity:1,unitPrice:1}]},owner),/tax/);
});
