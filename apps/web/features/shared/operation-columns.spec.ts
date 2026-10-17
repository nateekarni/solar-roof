import assert from 'node:assert/strict';
import test from 'node:test';
import { operationKeys, isTemporalColumn } from './operation-columns';
test('site metadata and duplicate timestamps never shift displayed columns',()=>{
 assert.deepEqual(operationKeys('sites',{id:'s',gatewayId:'g',lastSeenAt:'x',lastUpdated:'y'}),['name','externalSiteId','customerName','capacityMwp','status','serviceStartDate']);
});
test('billing columns exclude document and site IDs while retaining them in rows',()=>{
 assert.deepEqual(operationKeys('billing',{id:'b',siteId:'s',invoiceNumber:'i'}),['period','customerName','siteName','consumedKwh','rate','amount','daysOverdue','status']);
});

test("identifiers and names are text while timestamp columns are dates", () => {
 for (const key of ["gateway", "gatewayName", "format", "category", "name", "siteName"]) assert.equal(isTemporalColumn(key), false, key);
 for (const key of ["issueDate", "startDate", "occurredAt", "received_at", "time", "timestamp"]) assert.equal(isTemporalColumn(key), true, key);
});

test('audit columns contain expected ordering without private identifiers', () => {
  assert.deepEqual(operationKeys('audit', { id: 'a', correlationId: 'c' }), ['time', 'action', 'entityType', 'entityId', 'actor', 'reason']);
});
