import assert from 'node:assert/strict';
import test from 'node:test';
import {routeAllowed} from './route-policy.js';
test('Organization Home can read scoped power but cannot mutate or compare it',()=>{
 assert.equal(routeAllowed('school_user','GET','/v1/dashboard/power-flow'),true);
 for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal(routeAllowed('school_user',method,'/v1/dashboard/power-flow'),false);
 assert.equal(routeAllowed('school_user','GET','/v1/dashboard/compare'),false);
});
test('profile route permits own profile PUT only',()=>{
 assert.equal(routeAllowed('school_user','PUT','/v1/me/profile'),true);
 assert.equal(routeAllowed('school_user','PUT','/v1/me/other/profile'),false);
 assert.equal(routeAllowed('unknown','PUT','/v1/me/profile'),false);
 assert.equal(routeAllowed('school_user','DELETE','/v1/me/profile'),false);
});
