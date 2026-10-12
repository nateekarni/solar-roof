import assert from 'node:assert/strict';import test from 'node:test';import {effectiveRule,domainOverrides,filterEmployees,filterPositions} from './staff-permissions-model';
test('staff filters combine search, status and the unassigned position',()=>{const rows=[{displayName:'Somchai',email:'som@example.com',status:'active',grant:null},{displayName:'Somchai',email:'other@example.com',status:'inactive',grant:null},{displayName:'Ada',email:'ada@example.com',status:'active',grant:{positionId:'p'}}];assert.deepEqual(filterEmployees(rows,' SOM ','active','unassigned'),[rows[0]]);assert.deepEqual(filterEmployees(rows,'','all','p'),[rows[2]]);});
test('an inherited employee follows a preset while allow and deny remain explicit',()=>{
 assert.equal(effectiveRule('business.billing.view',{'business.billing.view':true},{'business.billing.view':null}),true);
 assert.equal(effectiveRule('business.billing.view',{'business.billing.view':true},{'business.billing.view':false}),false);
 assert.equal(effectiveRule('business.billing.view',{'business.billing.view':false},{'business.billing.view':true}),true);
});
test('a domain save excludes rules managed by the other domain',()=>{assert.deepEqual(domainOverrides('business',{'business.sites.view':true,'technical.gateways.view':false}),{'business.sites.view':true});});

test('position filters distinguish assigned and unused presets while combining search',()=>{const positions=[{id:'p',name:'Engineer'},{id:'q',name:'Engineer lead'}];const employees=[{grant:{positionId:'p'}},{grant:null}];assert.deepEqual(filterPositions(positions,employees,'ENGINEER','assigned'),[positions[0]]);assert.deepEqual(filterPositions(positions,employees,'lead','unused'),[positions[1]]);});
