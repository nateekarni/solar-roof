import test from 'node:test';
import assert from 'node:assert/strict';
import {loadContractSites,canCreateOperation} from './business-operation-options';
test('contract selector reads permitted scoped business options while technical sites access is denied',async()=>{
 const sites=await loadContractSites(async<T>(path:string):Promise<T>=>{
  if(path==='/v1/dashboard/summary')return JSON.parse('{"availableSites":[{"id":"site-a","name":"Customer A"}]}');
  throw new Error('Forbidden technical endpoint');
 });
 assert.deepEqual(sites,[{id:'site-a',name:'Customer A'}]);
});
test('Owner creates sites and financial creation remains capability gated',()=>{
 assert.equal(canCreateOperation('sites',{role:'admin',customerId:'customer-a'},[]),false);
 assert.equal(canCreateOperation('sites',{role:'owner'},[]),true);
 assert.equal(canCreateOperation('contracts',{role:'owner'},[]),false);
 assert.equal(canCreateOperation('contracts',{role:'owner'},['create_contract']),false);
 assert.equal(canCreateOperation('billing',{role:'customer_user'},[]),false);
});
