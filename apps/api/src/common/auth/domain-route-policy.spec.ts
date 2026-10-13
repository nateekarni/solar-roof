import assert from 'node:assert/strict';
import test from 'node:test';
import { permissionForRoute, authorizedRoute } from './domain-route-policy.js';
import { effectiveAuthorization } from './authorization.js';
import { routeAllowed } from './route-policy.js';

test('only Owner can inspect and confirm production finance readiness through both route policies',()=>{
 for(const role of ['owner','admin','operator','accountant','customer_user'])for(const [method,path] of [['GET','/v1/settings/finance-readiness'],['POST','/v1/settings/finance-readiness/confirm']]){
  const actor={role,authorization:effectiveAuthorization('owner',0,[])};
  assert.equal(routeAllowed(role,method!,path!),role==='owner',`${role} ${method} legacy policy`);
  assert.equal(authorizedRoute(actor,method!,path!),role==='owner',`${role} ${method} domain policy`);
 }
 assert.equal(authorizedRoute({role:'owner'},'DELETE','/v1/settings/finance-readiness/confirm'),false);
});

test('operation customer and alert routes enforce the same permissions as their direct endpoints',()=>{
 for(const [resource,permission,manager] of [['customers','business.customers.view','owner'],['alerts','technical.alerts.view','admin']]){
  assert.equal(permissionForRoute('GET',`/v1/operations/${resource}`),permission);
  assert.equal(authorizedRoute({role:manager},'GET',`/v1/operations/${resource}`),true);
  assert.equal(authorizedRoute({role:'operator'},'GET',`/v1/operations/${resource}`),false);
 }
});
test('technical managers cannot access site registry or financial company settings',()=>{
 assert.equal(permissionForRoute('GET','/v1/sites/site-a/live-telemetry'),'technical.telemetry.view');
 assert.equal(authorizedRoute({role:'admin'},'GET','/v1/sites/site-a/live-telemetry'),true);
 assert.equal(authorizedRoute({role:'admin'},'GET','/v1/sites'),false);
 assert.equal(authorizedRoute({role:'admin'},'PUT','/v1/settings/company'),false);
 assert.equal(authorizedRoute({role:'owner'},'GET','/v1/gateways'),false);
 assert.equal(authorizedRoute({role:'admin'},'GET','/v1/gateways/site-options'),true);
});
test('legacy reports jobs and history fail closed for every identity and action',()=>{
 for(const role of ['owner','admin','operator','accountant','customer_user'])for(const method of ['GET','POST','PUT','PATCH','DELETE'])for(const path of ['/v1/reports','/v1/reports/old/download','/v1/jobs/old/download','/v1/jobs/old/retry','/v1/history/restore','/v1/history/options'])assert.equal(authorizedRoute({role},method,path),false,`${role} ${method} ${path}`);
});
test('retired contract authoring stays disabled even with business billing permissions',()=>{
 for(const role of ['owner','admin','operator','accountant','customer_user'])for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal(authorizedRoute({role,authorization:effectiveAuthorization('owner',0,[])},method,'/v1/contracts'),false);
});
test('saved contract delivery admits only business authors with scoped billing edit permission',()=>{
 assert.equal(authorizedRoute({role:'owner'},'POST','/v1/contracts/old/send-email'),true);
 const authorization=effectiveAuthorization('accountant',0,[{domain:'business',preset:{'business.billing.edit':true},overrides:{},scope:{mode:'selected',siteIds:['site']}}]);
 assert.equal(authorizedRoute({role:'accountant',authorization},'POST','/v1/contracts/old/send-email'),true);
 for(const role of ['admin','operator','customer_user','accountant'])assert.equal(authorizedRoute({role},'POST','/v1/contracts/old/send-email'),false);
});
test('action matrix distinguishes view download edit and approval',()=>{
 assert.equal(permissionForRoute('PATCH','/v1/billing-cycles/a/verify-payment'),'business.billing.approve');
 assert.equal(permissionForRoute('GET','/v1/documents/a/download'),'business.documents.download');
 const authorization=effectiveAuthorization('operator',0,[{domain:'business',preset:{'business.billing.view':true},overrides:{},scope:{mode:'all',siteIds:[]}}]);
 assert.equal(authorizedRoute({role:'operator',authorization},'GET','/v1/billing-cycles'),true);
 assert.equal(authorizedRoute({role:'operator',authorization},'PATCH','/v1/billing-cycles/a/verify-payment'),false);
});
test('managers can reach invitation lifecycle while service enforces who they may invite',()=>{
 for(const [method,path] of [['POST','/v1/users/invite'],['GET','/v1/users/invitations'],['POST','/v1/users/invitations/a/resend']]){
  for(const role of ['owner','admin'])assert.equal(authorizedRoute({role},method!,path!),true);
  for(const role of ['operator','accountant','customer_user'])assert.equal(authorizedRoute({role},method!,path!),false);
 }
});
