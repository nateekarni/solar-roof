import assert from 'node:assert/strict';
import test from 'node:test';
import { BillingController } from './billing.controller.js';
import { routeAllowed } from '../../common/auth/route-policy.js';
import type { DatabaseService } from '../../database/database.service.js';
import type { FinancialReadinessService } from './financial-readiness.service.js';
import type { LocalFinancialApplicationService } from './local-financial-application.service.js';
function fixture(){
 let current={legalName:'Current legal',taxId:'1234567890123',taxBranch:'00000',taxAddress:'Bangkok',documentEmail:'bill@example.com',phone:'02'};
 const saved:unknown[][]=[]; const oldSnapshot={companyName:'Historical legal',taxId:'9999999999999',taxAddress:'Historical address'};
 const query=async(sql:string,values:unknown[]=[])=>{
  if(sql.includes('FROM sites')&&sql.includes('JOIN schools'))return {rows:values[0]==='site-a'?[{id:'school-a',name:'Customer',code:'ORG-A',schoolId:'school-a',...current}]:[]};
  if(sql.includes('INSERT INTO contracts')){saved.push(values);return {rows:[{id:values[0],companyName:values[7],taxId:values[6],taxAddress:values[9]}]};}
  return {rows:[]};
 };
 const db={query,pool:{connect:async()=>({query,release(){}})}};
 const c=new BillingController(db as unknown as DatabaseService,{isLocalTestReady:async()=>false} as unknown as FinancialReadinessService,{} as LocalFinancialApplicationService);
 return {c,saved,oldSnapshot,setCurrent:(v:typeof current)=>{current=v;},current};
}
const input={siteId:'site-a',ratePerKwh:4,paymentTerms:'30 days',signerName:'Authorized signer'};
test('new contracts snapshot current organization defaults while explicit billing overrides remain editable',async()=>{
 const f=fixture(); const a=await f.c.createContract(input);
 assert.equal(a.companyName,'Current legal'); assert.equal(a.taxId,'1234567890123');
 f.setCurrent({...f.current,legalName:'Changed master'});
 const b=await f.c.createContract({...input,companyName:'Contract override',taxAddress:'Override address'});
 assert.equal(b.companyName,'Contract override'); assert.equal(b.taxAddress,'Override address');
 assert.equal(a.companyName,'Current legal'); assert.equal(f.oldSnapshot.companyName,'Historical legal');
});
test('incomplete customer identity blocks new contracts but does not rewrite existing snapshots',async()=>{
 const f=fixture(); f.setCurrent({...f.current,taxId:''});
 await assert.rejects(f.c.createContract(input),/tax identity/i); assert.equal(f.saved.length,0);
 await assert.rejects(f.c.createContract({...input,taxId:'',companyName:'Override',taxAddress:'Address'}),/tax identity/i);
});
test('organization defaults endpoint permits only contract authors and rejects other roles',()=>{
 for(const role of ['owner','admin'])assert.equal(routeAllowed(role,'GET','/v1/operations/contracts/organization-defaults'),true);
 for(const role of ['school_user','operator','accountant','unknown'])assert.equal(routeAllowed(role,'GET','/v1/operations/contracts/organization-defaults'),false);
 assert.equal(routeAllowed('admin','POST','/v1/operations/contracts/organization-defaults'),false);
});


test('contract preparation reads current defaults only for authors and rejects nonexistent sites',async()=>{
 const f=fixture();const defaults=await f.c.contractOrganizationDefaults('site-a',{user:{role:'admin',schoolId:'legacy-other'}});
 assert.deepEqual(defaults,{organization:{id:'school-a',name:'Customer',code:'ORG-A'},companyName:'Current legal',taxId:'1234567890123',branch:'00000',taxAddress:'Bangkok',billingEmail:'bill@example.com',billingPhone:'02'});
 for(const role of ['school_user','operator','accountant','unknown'])await assert.rejects(f.c.contractOrganizationDefaults('site-a',{user:{role,schoolId:'school-a'}}),/not permitted/i);
 await assert.rejects(f.c.contractOrganizationDefaults('',{user:{role:'owner'}}),/siteId is required/);
 await assert.rejects(f.c.contractOrganizationDefaults('missing-site',{user:{role:'owner'}}),/not found/i);
});

