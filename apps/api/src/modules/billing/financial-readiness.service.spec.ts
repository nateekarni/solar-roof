import assert from 'node:assert/strict';
import test from 'node:test';
import { FinancialReadinessService } from './financial-readiness.service.js';
test('Admin exposes no financial capabilities and workflow readiness remains required',async()=>{
 const service=new FinancialReadinessService();
 const result=await service.capabilities('admin',true);
 for(const action of ['calculate','issue','approve_payment','adjust','send'] as const){
  assert.equal(result.unavailable[action],undefined);
  await assert.rejects(service.assertEnabled(action),/Financial workflows await/);
 }
 assert.deepEqual(result.actions,[]);
});

