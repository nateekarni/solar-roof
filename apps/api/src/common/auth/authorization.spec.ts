import assert from 'node:assert/strict';
import test from 'node:test';
import { effectiveAuthorization, hasPermission, siteScope, validateDomainRules } from './authorization.js';

test('managers have authority only in their own domain', () => {
  assert.equal(hasPermission({role:'admin'},'business.sites.view'),false);
  assert.equal(hasPermission({role:'owner'},'technical.gateways.edit'),false);
  assert.equal(hasPermission({role:'owner'},'business.sites.edit'),true);
});
test('employee grants inherit presets live and explicit deny wins', () => {
  const auth=effectiveAuthorization('operator',3,[{domain:'technical',preset:{'technical.gateways.view':true,'technical.gateways.edit':true},overrides:{'technical.gateways.edit':false},scope:{mode:'selected',siteIds:['a']}}]);
  assert.equal(hasPermission({role:'operator',authorization:auth},'technical.gateways.view'),true);
  assert.equal(hasPermission({role:'operator',authorization:auth},'technical.gateways.edit'),false);
  assert.deepEqual(siteScope({role:'operator',authorization:auth},'technical'),['a']);
  assert.deepEqual(siteScope({role:'operator',authorization:auth},'business'),[]);
});
test('selected scopes and customer invariant fail closed',()=>{
  assert.deepEqual(siteScope({role:'customer_user',assignedSiteIds:['a','b']},'business'),[]);
  assert.deepEqual(siteScope({role:'customer_user',assignedSiteIds:['a']},'technical'),[]);
  assert.deepEqual(siteScope({role:'accountant'},'business'),[]);
});
test('cross-domain and unknown permission keys are rejected before writes',()=>{
 assert.throws(()=>validateDomainRules('business',{'technical.gateways.edit':true}),/permission/);
 assert.throws(()=>validateDomainRules('business',{'business.permissions.manage':true}),/permission/);
});
