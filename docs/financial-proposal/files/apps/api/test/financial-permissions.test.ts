import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAllowed} from '../src/common/auth/route-policy.js';

test('hardware administrator can submit evidence but cannot approve payments or corrections',()=>{
 assert.equal(routeAllowed('admin','POST','/v1/billing-meters/meter/evidence-readings'),true);
 assert.equal(routeAllowed('admin','PATCH','/v1/billing-cycles/cycle/verify-payment'),false);
 assert.equal(routeAllowed('admin','PATCH','/v1/financial-corrections/request/approve'),false);
 assert.equal(routeAllowed('admin','POST','/v1/billing-cycles/cycle/pay'),true);
});
test('owner and accountant can approve finances without hardware write permission',()=>{
 for(const role of ['owner','accountant']) {
  assert.equal(routeAllowed(role,'PATCH','/v1/billing-cycles/cycle/verify-payment'),true);
  assert.equal(routeAllowed(role,'PATCH','/v1/financial-corrections/request/approve'),true);
  assert.equal(routeAllowed(role,'PATCH','/v1/gateways/gateway'),false);
 }
});
test('school users can verify own email but cannot manage financial configuration',()=>{
 assert.equal(routeAllowed('school_user','POST','/v1/me/email-verification/confirm'),true);
 assert.equal(routeAllowed('school_user','PATCH','/v1/settings/financial'),false);
 assert.equal(routeAllowed('school_user','POST','/v1/billing-meters/meter/evidence-readings'),false);
});
