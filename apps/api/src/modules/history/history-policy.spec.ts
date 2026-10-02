import assert from 'node:assert/strict';
import test from 'node:test';
import {routeAllowed} from '../../common/auth/route-policy.js';
test('scoped history restore is available to known roles without adding archive mutations',()=>{
 for(const role of ['owner','admin','operator','accountant','school_user'])assert.equal(routeAllowed(role,'POST','/v1/history/restore'),true,role);
 assert.equal(routeAllowed('unknown','POST','/v1/history/restore'),false);
 assert.equal(routeAllowed('owner','DELETE','/v1/history/restore'),false);
 assert.equal(routeAllowed('owner','POST','/v1/history/archive'),false);
});
