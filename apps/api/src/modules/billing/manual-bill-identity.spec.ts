import assert from 'node:assert/strict';
import test from 'node:test';
import {manualBillIds} from './manual-bill-identity.js';
import {validateIssuanceBatch} from './issuance-approval.js';
const site='11111111-1111-4111-8111-111111111111';
test('manual operation IDs retain stable legacy lookup and produce RFC version/variant bits accepted for approval',()=>{
 const value=manualBillIds(site,'stable-operation');
 assert.equal(value.legacyId,'f66f9f59-d471-35ad-bf97-3c11349b0bc7');
 assert.match(value.id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.deepEqual(manualBillIds(site,'stable-operation'),value);
 assert.deepEqual(validateIssuanceBatch({billingCycleIds:[value.id,value.legacyId]}),[value.id,value.legacyId]);
 assert.notEqual(manualBillIds(site,'other-operation').id,value.id);assert.notEqual(manualBillIds('22222222-2222-4222-8222-222222222222','stable-operation').id,value.id);
});
