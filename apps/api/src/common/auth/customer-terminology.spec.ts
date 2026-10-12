import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAllowed} from './route-policy.js';
test('customer_user can update own profile and cannot use administrative customer routes',()=>{
 assert.equal(routeAllowed('customer_user','PUT','/v1/me/profile'),true);
 assert.equal(routeAllowed('customer_user','GET','/v1/customers'),false);
 assert.equal(routeAllowed('customer_user','PUT','/v1/sites/site/customer-users/user'),false);
});
