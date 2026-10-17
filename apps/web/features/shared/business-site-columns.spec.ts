import assert from 'node:assert/strict';
import test from 'node:test';
import {operationKeys,operationColumnLabel} from './operation-columns';
test('site register contains business identity and service fields without technical measurements',()=>{
 assert.deepEqual(operationKeys('sites',{}),['name','externalSiteId','customerName','capacityMwp','status','serviceStartDate']);
});
test('a keyed site header is independent of stale server label positions',()=>{assert.equal(operationColumnLabel('sites','customerName','en','Gateway'),'Customer');assert.equal(operationColumnLabel('sites','serviceStartDate','th','ผลิตสะสม (kWh)'),'วันที่เริ่มบริการ');});
