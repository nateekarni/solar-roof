import assert from 'node:assert/strict';
import test from 'node:test';
import {settingsSections} from './settings-sections';
test('business settings remove service defaults while technical grants keep reception',()=>{
 assert.ok(!settingsSections('owner').find(section=>section.key==='business')?.items.some(item=>item.href==='/settings/system'));
 const authorization={revision:1,permissions:['technical.settings.view'],scopes:{business:{mode:'all' as const,siteIds:[]},technical:{mode:'all' as const,siteIds:[]}}};
 assert.ok(settingsSections('operator',authorization).find(section=>section.key==='technical')?.items.some(item=>item.href==='/settings/system'));
});
test('settings separate business and technical destinations while both managers retain team, audit and own account',()=>{
 for(const role of ['owner','admin']){
 const sections=settingsSections(role);assert.ok(sections.some(s=>s.key==='team'));assert.ok(sections.some(s=>s.key==='audit'));assert.ok(sections.some(s=>s.key==='account'));
 assert.equal(sections.some(s=>s.key==='business'),role==='owner');assert.equal(sections.some(s=>s.key==='technical'),role==='admin');
 }
});
test('own account has one destination with concise menu labels',()=>{
 for(const role of ['owner','admin','operator','accountant','customer_user']){
  const items=settingsSections(role).flatMap(section=>section.items);
  assert.equal(items.filter(item=>item.href==='/settings/account').length,1);
  assert.equal(items.some(item=>item.href==='/settings/security'),false);
  assert.deepEqual(items.find(item=>item.href==='/settings/account')?.label,['บัญชีของฉัน','My Account']);
 }
});
