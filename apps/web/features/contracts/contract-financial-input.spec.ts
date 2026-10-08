import test from 'node:test';
import assert from 'node:assert/strict';
import {financialContractInput} from './contract-financial-input';
test('explicit payment term and recipient preserve user choices without defaults',()=>{
 assert.deepEqual(financialContractInput('30','00000000-0000-4000-8000-000000000001'),{paymentTermDays:30,recipientUserIds:['00000000-0000-4000-8000-000000000001']});
 assert.throws(()=>financialContractInput('',''));
 assert.throws(()=>financialContractInput('2.5','00000000-0000-4000-8000-000000000001'));
});
import {nextRateStart,contractRatePayload} from './contract-financial-input';
test('inclusive rate end advances one day and a missing end resolves before the next rate',()=>{
 assert.equal(nextRateStart('2026-09-15'),'2026-09-16');
 assert.deepEqual(contractRatePayload([{startDate:'2026-09-01',endDate:'',rate:3.5},{startDate:'2026-09-16',endDate:'',rate:4}]),[{startDate:'2026-09-01',endDate:'2026-09-15',rate:3.5},{startDate:'2026-09-16',endDate:null,rate:4}]);
 assert.throws(()=>contractRatePayload([{startDate:'2026-09-01',endDate:'2026-09-15',rate:3.5},{startDate:'2026-09-15',endDate:'',rate:4}]));
});
