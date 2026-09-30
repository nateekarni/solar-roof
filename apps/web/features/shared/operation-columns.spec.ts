import assert from 'node:assert/strict';
import test from 'node:test';
import { operationKeys } from './operation-columns';
test('site metadata and duplicate timestamps never shift displayed columns',()=>{
 assert.deepEqual(operationKeys('sites',{id:'s',gatewayId:'g',lastSeenAt:'x',lastUpdated:'y'}),['name','schoolName','capacityMwp','gateway','protocol','productionKwh','lastUpdated','status']);
});
test('billing columns exclude document and site IDs while retaining them in rows',()=>{
 assert.deepEqual(operationKeys('billing',{id:'b',siteId:'s',invoiceNumber:'i'}),['period','schoolName','siteName','consumedKwh','rate','amount','slipUrl','status']);
});
