import assert from 'node:assert/strict';
import test from 'node:test';
import { canVisitPage, isBusinessRole } from '../src/index.js';
test('business roles visit only their permitted destinations including nested documents', () => {
 for (const path of ['/', '/contracts', '/billing', '/receipts', '/settings/account', '/settings/general', '/settings/security']) {
  assert.equal(canVisitPage('owner',path),true);assert.equal(canVisitPage('customer_user',path),true);
 }
 assert.equal(canVisitPage('owner','/settings/company'),true);
 assert.equal(canVisitPage('customer_user','/production'),true);
 for (const role of ['owner','customer_user']) for (const path of ['/alerts','/records/users/1']) assert.equal(canVisitPage(role,path),false);
 for(const path of ['/settings/users','/settings/system','/settings/audit']){assert.equal(canVisitPage('owner',path),true);assert.equal(canVisitPage('customer_user',path),false);}
 assert.equal(canVisitPage('customer_user','/settings/company'),false);
 assert.equal(canVisitPage('owner','/records/contracts/1'),true);
 assert.equal(canVisitPage('customer_user','/records/documents/1'),true);
 assert.equal(canVisitPage('unknown','/'),false);
 assert.equal(canVisitPage('admin','/settings/users'),true);
 assert.equal(canVisitPage('operator','/sites'),true);
 assert.equal(isBusinessRole('owner'),true);assert.equal(isBusinessRole('customer_user'),true);assert.equal(isBusinessRole('admin'),false);
});
test('business roles cannot visit operational notification pages',()=>{
 assert.equal(canVisitPage('owner','/notifications'),false);
 assert.equal(canVisitPage('customer_user','/notifications'),false);
 assert.equal(canVisitPage('admin','/notifications'),true);
});
