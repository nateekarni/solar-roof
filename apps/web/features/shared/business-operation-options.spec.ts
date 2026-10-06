import test from 'node:test';
import assert from 'node:assert/strict';
import {loadContractSites,canCreateOperation} from './business-operation-options';
test('contract selector reads permitted scoped business options while technical sites access is denied',async()=>{
 const sites=await loadContractSites(async<T>(path:string):Promise<T>=>{
  if(path==='/v1/dashboard/summary')return JSON.parse('{"availableSites":[{"id":"site-a","name":"School A"}]}');
  throw new Error('Forbidden technical endpoint');
 });
 assert.deepEqual(sites,[{id:'site-a',name:'School A'}]);
});
test('legacy assigned admin retains global site creation while business financial capability gates remain',()=>{
 assert.equal(canCreateOperation('sites',{role:'admin',schoolId:'school-a'},[]),true);
 assert.equal(canCreateOperation('sites',{role:'owner'},[]),false);
 assert.equal(canCreateOperation('contracts',{role:'owner'},[]),false);
 assert.equal(canCreateOperation('contracts',{role:'owner'},['create_contract']),true);
 assert.equal(canCreateOperation('billing',{role:'school_user'},[]),false);
});
