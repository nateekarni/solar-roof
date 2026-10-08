import assert from 'node:assert/strict';
import test from 'node:test';
import { routeAllowed } from './route-policy.js';
test('billing source configuration permits only exact admin GET/POST routes',()=>{
 for(const role of ['owner','operator','accountant','school_user','unknown'])for(const method of ['GET','POST'])assert.equal(routeAllowed(role,method,'/v1/sites/s/billing-source'),false);
 for(const method of ['GET','POST'])assert.equal(routeAllowed('admin',method,'/v1/sites/s/billing-source'),true);
 for(const method of ['PATCH','DELETE','PUT'])assert.equal(routeAllowed('admin',method,'/v1/sites/s/billing-source'),false);
 assert.equal(routeAllowed('admin','POST','/v1/sites/s/billing-source/unknown'),false);
});
