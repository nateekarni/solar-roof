import test from 'node:test';
import assert from 'node:assert/strict';

test('identity reconciliation maps every active fixture user exactly once and rejects duplicate email',async()=>{
 let reconciliation;
 try{reconciliation=await import('./reconcile-demo-identities.mjs');}catch{}
 assert.equal(typeof reconciliation?.buildIdentityUpdates,'function','identity reconciliation planner must exist');
 const current=[
  {id:'owner-id',email:'owner@example.test',display_name:'Old Owner'},
  {id:'customer-id',email:'customer01@example.test',display_name:'Old Customer'},
 ];
 const desired=[
  {id:'owner-id',email:'owner@demo.solar.test',name:'ธนกฤต วัฒนาภิรมย์'},
  {id:'customer-id',email:'billing.bkk-lkb-001@customer.solar.test',name:'สิริพร วัฒนกิจ'},
 ];
 assert.deepEqual(reconciliation.buildIdentityUpdates(current,desired),desired);
 assert.throws(()=>reconciliation.buildIdentityUpdates(current,desired.slice(0,1)),/exactly once/);
 assert.throws(()=>reconciliation.buildIdentityUpdates(current,desired.map(account=>({...account,email:'duplicate@demo.solar.test'}))),/unique/);
});
