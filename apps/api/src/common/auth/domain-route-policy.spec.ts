import assert from 'node:assert/strict';
import test from 'node:test';
import { permissionForRoute, authorizedRoute } from './domain-route-policy.js';
import { effectiveAuthorization } from './authorization.js';

test('operation customer and alert routes enforce the same permissions as their direct endpoints',()=>{
 for(const [resource,permission,manager] of [['customers','business.customers.view','owner'],['alerts','technical.alerts.view','admin']]){
  assert.equal(permissionForRoute('GET',`/v1/operations/${resource}`),permission);
  assert.equal(authorizedRoute({role:manager},'GET',`/v1/operations/${resource}`),true);
  assert.equal(authorizedRoute({role:'operator'},'GET',`/v1/operations/${resource}`),false);
 }
});
test('technical managers cannot access site registry or financial company settings',()=>{
 assert.equal(authorizedRoute({role:'admin'},'GET','/v1/sites'),false);
 assert.equal(authorizedRoute({role:'admin'},'PUT','/v1/settings/company'),false);
 assert.equal(authorizedRoute({role:'owner'},'GET','/v1/gateways'),false);
 assert.equal(authorizedRoute({role:'admin'},'GET','/v1/gateways/site-options'),true);
});
test('legacy reports jobs and history fail closed for every identity and action',()=>{
 for(const role of ['owner','admin','operator','accountant','customer_user'])for(const method of ['GET','POST','PUT','PATCH','DELETE'])for(const path of ['/v1/reports','/v1/reports/old/download','/v1/jobs/old/download','/v1/jobs/old/retry','/v1/history/restore','/v1/history/options'])assert.equal(authorizedRoute({role},method,path),false,`${role} ${method} ${path}`);
});
test('retired contract writes stay disabled even with business billing permissions',()=>{
 for(const role of ['owner','admin','operator','accountant','customer_user'])for(const method of ['POST','PUT','PATCH','DELETE'])for(const path of ['/v1/contracts','/v1/contracts/old/send-email'])assert.equal(authorizedRoute({role,authorization:effectiveAuthorization('owner',0,[])},method,path),false);
});
test('action matrix distinguishes view download edit and approval',()=>{
 assert.equal(permissionForRoute('PATCH','/v1/billing-cycles/a/verify-payment'),'business.billing.approve');
 assert.equal(permissionForRoute('GET','/v1/documents/a/download'),'business.documents.download');
 const authorization=effectiveAuthorization('operator',0,[{domain:'business',preset:{'business.billing.view':true},overrides:{},scope:{mode:'all',siteIds:[]}}]);
 assert.equal(authorizedRoute({role:'operator',authorization},'GET','/v1/billing-cycles'),true);
 assert.equal(authorizedRoute({role:'operator',authorization},'PATCH','/v1/billing-cycles/a/verify-payment'),false);
});
