import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReplacement,id,cutoffInstant} from './fixture.mjs';
import {sites} from './telemetry-fixture.mjs';
test('replacement refuses absent backup, unknown users and remote target',()=>{
 const input={databaseUrl:'postgresql://review:x@127.0.0.1:15449/solar_financial_flow_review',backupBytes:20000,oldUsers:[{email:'admin@example.test'}]};
 assert.doesNotThrow(()=>validateReplacement(input));
 for(const patch of [{backupBytes:0},{databaseUrl:'postgresql://review:x@remote:15449/solar_financial_flow_review'},{oldUsers:[{email:'real@company.com'}]}])assert.throws(()=>validateReplacement({...input,...patch}));
});
test('replacement identity generator creates stable canonical v4 UUIDs',()=>{
 const result=id('staff:legacy');assert.match(result,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/);
 assert.equal(result,id('staff:legacy'));assert.notEqual(result,id('staff:other'));
});
test('cutoff is the first instant after the selected Bangkok month',()=>{
 assert.equal(cutoffInstant('2026-09'),'2026-09-30T17:00:00.000Z');
 assert.equal(cutoffInstant('2026-12'),'2026-12-31T17:00:00.000Z');
 assert.throws(()=>cutoffInstant('2026-13'));assert.throws(()=>cutoffInstant('invalid'));
});

test('demo accounts provide realistic identities for every role and customer site',async()=>{
 let catalog;
 try{catalog=await import('./demo-accounts.mjs');}catch{}
 assert.equal(typeof catalog?.buildDemoAccounts,'function','demo account catalog must exist');
 const staffRoles=['owner','admin','operator','accountant'];
 const existing=[
  ...staffRoles.flatMap(role=>[1,2].map(index=>({id:`${role}-${index}`,email:`${role}${index===1?'':index}@example.test`,role,customer_id:null}))),
  ...sites.map((site,index)=>({id:`customer-${index+1}`,email:`customer${String(index+1).padStart(2,'0')}@example.test`,role:'customer_user',customer_id:site.customerId})),
 ];
 const accounts=catalog.buildDemoAccounts(existing,sites);
 assert.equal(accounts.length,18);
 assert.deepEqual(new Set(accounts.map(account=>account.role)),new Set([...staffRoles,'customer_user']));
 assert.equal(accounts.filter(account=>account.role==='customer_user').length,10);
 assert.equal(new Set(accounts.map(account=>account.email)).size,18);
 assert.ok(accounts.every(account=>account.email.endsWith('.test')));
 assert.ok(accounts.every(account=>/\p{Script=Thai}/u.test(account.name)));
 assert.equal(accounts.find(account=>account.role==='owner').email,'owner@demo.solar.test');
 const latKrabang=accounts.find(account=>account.siteCode==='BKK-LKB-001');
 assert.equal(latKrabang.email,'billing.bkk-lkb-001@customer.solar.test');
 assert.equal(latKrabang.customerName,'บริษัท รุ่งอรุณโลจิสติกส์ จำกัด');
 assert.equal(latKrabang.siteName,'ศูนย์กระจายสินค้า ลาดกระบัง');
});
