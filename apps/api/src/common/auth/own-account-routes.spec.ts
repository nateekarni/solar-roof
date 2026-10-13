import assert from 'node:assert/strict';
import test from 'node:test';
import {routeAllowed} from './route-policy.js';
test('all valid roles can manage only the specific own authenticator routes',()=>{
 for(const role of ['owner','admin','operator','accountant','customer_user']){
  assert.equal(routeAllowed(role,'GET','/v1/auth/two-factor'),true);
  for(const action of ['enroll','confirm','disable','email-code'])assert.equal(routeAllowed(role,'POST',`/v1/auth/two-factor/${action}`),true);
  assert.equal(routeAllowed(role,'POST','/v1/auth/two-factor/other'),false);
  assert.equal(routeAllowed(role,'DELETE','/v1/auth/two-factor'),false);
 }
 assert.equal(routeAllowed('unknown','POST','/v1/auth/two-factor/enroll'),false);
});
