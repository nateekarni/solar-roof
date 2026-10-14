import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import {BillingController} from './billing.controller.js';
import {FinancialApplicationService} from './financial-application.service.js';
import {DocumentsController} from '../documents/documents.controller.js';
import {DocumentService,NumberSeriesService} from '../documents/document.service.js';
import {routeAllowed} from '../../common/auth/route-policy.js';
import {authorizedRoute} from '../../common/auth/domain-route-policy.js';

test('explicit contract issuance is writable only by Owner or Accountant with billing edit permission',()=>{
 const path='/v1/operations/contracts/contract-a/original';
 for(const [role,allowed]of [['owner',true],['accountant',true],['admin',false],['operator',false],['customer_user',false]] as const){
  const user={role,authorization:{revision:1,permissions:['business.billing.edit'],scopes:{business:{mode:'all' as const,siteIds:[]},technical:{mode:'selected' as const,siteIds:[]}}}};
  assert.equal(routeAllowed(role,'POST',path),allowed,role);assert.equal(authorizedRoute(user,'POST',path),allowed,role);
 }
 assert.equal(routeAllowed('admin','GET',path),false);
 assert.equal(authorizedRoute({role:'accountant',authorization:{revision:1,permissions:['business.billing.view'],scopes:{business:{mode:'all',siteIds:[]},technical:{mode:'selected',siteIds:[]}}}},'POST',path),false);
});

// Catches a production endpoint falling back to legacy SQL that omits snapshots/PDF artifacts.
test('production invoice endpoint fails closed for a legacy calculation without frozen policy',async()=>{
 const db={transaction:async(run:any)=>run({query:async(sql:string)=>({rows:sql.includes('FROM billing_cycles')?[{id:'cycle',status:'pending_review',quality:'complete',meter_snapshot:[{consumedKwh:'25.000'}]}]:sql.includes(' AS day')?[{day:'2026-10-14'}]:sql.includes('document_number_series')?[{last_value:1}]:sql.includes('INSERT INTO documents')?[{id:'legacy'}]:[]})})};
 const readiness={assertEnabled:async()=>({scope:'PRODUCTION'}),isLocalTestReady:async()=>false};
 const controller=new BillingController(db as any,readiness as any,new FinancialApplicationService(db as any,readiness as any),{} as any);
 await assert.rejects(controller.generateInvoiceForBillingCycle('cycle'),/policy/i);
});
test('internal legacy finalization cannot create a receipt without audited snapshot and PDF',async()=>{
 let writes=0;const client={query:async(sql:string)=>{if(sql.includes('INSERT INTO documents'))writes++;return {rows:sql.includes(' AS day')?[{day:'2026-10-14'}]:[{last_value:1}]};}};
 const db={transaction:async(run:any)=>run(client)};
 const service=new DocumentService(new NumberSeriesService(db as any),db as any);
 await assert.rejects(service.finalize({siteId:'site',billingCycleId:'cycle',type:'receipt',year:2026,snapshot:{amount:0}}),/audited|workflow/i);assert.equal(writes,0);
});
test('standalone invoice upload cannot allocate an unaudited financial document',async()=>{
 let writes=0;const db={transaction:async(run:any)=>run({query:async()=>{writes++;return {rows:[{day:'2026-10-14',last_value:1}]};}})};
 const controller=new DocumentsController(db as any,{assertEnabled:async()=>({scope:'PRODUCTION'})} as any);
 await assert.rejects(controller.uploadDocument({siteId:'site',type:'invoice'}),/billing cycle|workflow/i);
 assert.equal(writes,0);
});
