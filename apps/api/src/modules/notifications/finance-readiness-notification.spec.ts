import assert from 'node:assert/strict';
import test from 'node:test';
import type { FinancialReadinessStatus } from '@solar/api-contracts';
import { financeReadinessNotification } from './finance-readiness-notification.js';

function status(items:FinancialReadinessStatus['items'],fingerprint='a'.repeat(64)):FinancialReadinessStatus {
 return {scope:null,fingerprint,approval:null,items,actions:{calculate:{enabled:false,missing:[]},issue:{enabled:false,missing:[]},approve_payment:{enabled:false,missing:[]},adjust:{enabled:false,missing:[]},send:{enabled:false,missing:[]}}};
}
const missing=status([{id:'company.logo',ready:false,responsibility:'owner'},{id:'approval.confirmation',ready:false,responsibility:'owner'},{id:'environment.smtp',ready:false,responsibility:'environment'}]);

test('only an authenticated Owner receives a finance workflow pointing to Company Settings',()=>{
 const row=financeReadinessNotification({id:'owner',role:'owner'},missing)!;
 assert.equal(row.id,'workflow:finance-readiness:aaaaaaaaaaaaaaaaaaaaaaaa');
 assert.equal(row.kind,'workflow');assert.equal(row.destination,'/settings/company');
 for(const role of ['admin','operator','accountant','customer_user'])assert.equal(financeReadinessNotification({id:role,role},missing),null);
 assert.equal(financeReadinessNotification({role:'owner'},missing),null);
});

test('the reminder exposes only an Owner missing count, without configuration or environment values',()=>{
 const row=financeReadinessNotification({id:'owner',role:'owner'},missing)!;
 assert.deepEqual(row.metadata,{type:'finance-readiness',missingCount:2});
 assert.match(row.detail,/2/);
 assert.doesNotMatch(JSON.stringify(row),/company\.logo|approval\.confirmation|environment\.smtp|smtp|password|accountNumber/i);
});

test('a changed readiness fingerprint renews identity while unchanged polling preserves identity',()=>{
 const owner={id:'owner',role:'owner'};
 const first=financeReadinessNotification(owner,missing)!;
 assert.equal(financeReadinessNotification(owner,missing)!.id,first.id);
 const changed=status([{id:'approval.confirmation',ready:false,responsibility:'owner'}],'b'.repeat(64));
 assert.equal(financeReadinessNotification(owner,changed)!.id,'workflow:finance-readiness:bbbbbbbbbbbbbbbbbbbbbbbb');
});

test('completed Owner setup removes the reminder even with environment and technical blockers',()=>{
 const complete=status([{id:'approval.confirmation',ready:true,responsibility:'owner'},{id:'environment.smtp',ready:false,responsibility:'environment'},{id:'site.meter',ready:false,responsibility:'technical'}]);
 assert.equal(financeReadinessNotification({id:'owner',role:'owner'},complete),null);
 assert.equal(financeReadinessNotification({id:'owner',role:'owner'},complete),null);
});
