import assert from 'node:assert/strict';
import test from 'node:test';
import {routeAllowed} from '../../common/auth/route-policy.js';
test('history restore retains operational roles while business roles cannot operate history',()=>{
 for(const role of ['admin','operator','accountant'])assert.equal(routeAllowed(role,'POST','/v1/history/restore'),true,role);
 for(const role of ['owner','school_user'])assert.equal(routeAllowed(role,'POST','/v1/history/restore'),false,role);
 assert.equal(routeAllowed('unknown','POST','/v1/history/restore'),false);
 assert.equal(routeAllowed('owner','DELETE','/v1/history/restore'),false);
 assert.equal(routeAllowed('owner','POST','/v1/history/archive'),false);
});
