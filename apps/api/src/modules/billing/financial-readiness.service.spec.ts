import assert from 'node:assert/strict';
import test from 'node:test';
import { FinancialReadinessService } from './financial-readiness.service.js';
test('admin financial permission preserves readiness denial for every financial action',async()=>{
 const service=new FinancialReadinessService();
 const result=await service.capabilities('admin',true);
 for(const action of ['calculate','issue','approve_payment','adjust','send'] as const){
  if(action!=='approve_payment')assert.ok(result.unavailable[action]);
  await assert.rejects(service.assertEnabled(action),/Financial workflows await/);
 }
 assert.deepEqual(result.actions,['create_contract']);
});

