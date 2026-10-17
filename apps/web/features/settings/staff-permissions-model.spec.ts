import assert from 'node:assert/strict';import test from 'node:test';import {effectiveRule,domainOverrides,filterEmployees,filterPositions} from './staff-permissions-model';
import * as model from './staff-permissions-model';

const presets=[{id:'p1',name:'กรรมการบริษัท',rules:{'business.billing.view':true}},{id:'p2',name:'Sales Lead',rules:{}}];
test('position search uses labels and offers creation only when no normalized duplicate exists',()=>{
 assert.equal(typeof model.positionOptions,'function');
 assert.deepEqual(model.positionOptions('กรรม',presets),[{kind:'existing',id:'p1',name:'กรรมการบริษัท'},{kind:'new',name:'กรรม'}]);
 assert.deepEqual(model.positionOptions('  หัวหน้าฝ่ายขาย  ',presets),[{kind:'new',name:'หัวหน้าฝ่ายขาย'}]);
 assert.deepEqual(model.positionOptions(' sales lead ',presets),[{kind:'existing',id:'p2',name:'Sales Lead'}]);
 assert.deepEqual(model.positionOptions('   ',[]),[]);
 assert.deepEqual(model.positionOptions('x'.repeat(121),presets),[]);
 assert.deepEqual(model.positionOptions('บัญชี',[{id:'p3',name:'หัวหน้าบัญชี'}]),[{kind:'existing',id:'p3',name:'หัวหน้าบัญชี'},{kind:'new',name:'บัญชี'}]);
 assert.deepEqual(model.positionOptions('café',[{id:'p4',name:'  CAFE\u0301  '}]),[{kind:'existing',id:'p4',name:'  CAFE\u0301  '}]);
});
test('atomic employee drafts select presets and keep overrides restricted to the managed domain',()=>{
 assert.equal(typeof model.employeePositionDraft,'function');
 assert.deepEqual(model.employeePositionDraft({revision:4,choice:{kind:'existing',id:'p1',name:'กรรมการบริษัท'},domain:'business',permissions:['business.billing.view'],rules:{},overrides:{'business.billing.view':false,'technical.devices.view':true},scope:{mode:'all',siteIds:[]}}),{revision:4,position:{id:'p1'},overrides:{'business.billing.view':false},scope:{mode:'all',siteIds:[]}});
});
test('new positions capture effective rules without requiring redundant configuration confirmation',()=>{
 assert.equal(typeof model.employeePositionDraft,'function');
 const draft={revision:2,choice:{kind:'new' as const,name:'  หัวหน้าฝ่ายขาย  '},domain:'business',permissions:['business.billing.view','business.billing.approve'],rules:{'business.billing.view':true},overrides:{'business.billing.approve':false},scope:{mode:'selected' as const,siteIds:['site-a']}};
 assert.deepEqual(model.employeePositionDraft(draft),{revision:2,position:{name:'หัวหน้าฝ่ายขาย',rules:{'business.billing.view':true,'business.billing.approve':false}},overrides:{'business.billing.approve':false},scope:{mode:'selected',siteIds:['site-a']}});
 assert.throws(()=>model.employeePositionDraft({...draft,choice:null}),/position/i);
});
test('canonical company titles display even when a manager has no employee grant',()=>{
 assert.equal(typeof model.employeePositionLabel,'function');
 assert.equal(model.employeePositionLabel({companyPosition:'กรรมการบริษัท',grant:null},presets),'กรรมการบริษัท');
 assert.equal(model.employeePositionLabel({companyPosition:null,grant:{positionId:'p2'}},presets),'Sales Lead');
 assert.equal(model.employeePositionLabel({companyPosition:null,grant:{positionId:'unknown-raw-id'}},presets),'—');
});
test('staff filters combine search, status and the unassigned position',()=>{const rows=[{displayName:'Somchai',email:'som@example.com',status:'active',grant:null},{displayName:'Somchai',email:'other@example.com',status:'inactive',grant:null},{displayName:'Ada',email:'ada@example.com',status:'active',grant:{positionId:'p'}}];assert.deepEqual(filterEmployees(rows,' SOM ','active','unassigned'),[rows[0]]);assert.deepEqual(filterEmployees(rows,'','all','p'),[rows[2]]);});
test('an inherited employee follows a preset while allow and deny remain explicit',()=>{
 assert.equal(effectiveRule('business.billing.view',{'business.billing.view':true},{'business.billing.view':null}),true);
 assert.equal(effectiveRule('business.billing.view',{'business.billing.view':true},{'business.billing.view':false}),false);
 assert.equal(effectiveRule('business.billing.view',{'business.billing.view':false},{'business.billing.view':true}),true);
});
test('a domain save excludes rules managed by the other domain',()=>{assert.deepEqual(domainOverrides('business',{'business.sites.view':true,'technical.gateways.view':false}),{'business.sites.view':true});});

test('position filters distinguish assigned and unused presets while combining search',()=>{const positions=[{id:'p',name:'Engineer'},{id:'q',name:'Engineer lead'}];const employees=[{grant:{positionId:'p'}},{grant:null}];assert.deepEqual(filterPositions(positions,employees,'ENGINEER','assigned'),[positions[0]]);assert.deepEqual(filterPositions(positions,employees,'lead','unused'),[positions[1]]);});

test('RESOURCE_VALID_ACTIONS contains valid actions for business and technical resources',()=>{
 assert.deepEqual(model.RESOURCE_VALID_ACTIONS.dashboard,['view']);
 assert.deepEqual(model.RESOURCE_VALID_ACTIONS.billing,['view','edit','approve','download']);
 assert.deepEqual(model.RESOURCE_VALID_ACTIONS.gateways,['view','edit']);
 assert.deepEqual(model.RESOURCE_VALID_ACTIONS.audit,['view','download']);
 assert.equal(model.isActionValidForResource('dashboard','view'),true);
 assert.equal(model.isActionValidForResource('dashboard','edit'),false);
 assert.equal(model.isActionValidForResource('billing','approve'),true);
});

test('applyPositionPreset copies position rules to concrete booleans for all domain permissions',()=>{
 const permissions=['business.billing.view','business.billing.approve','business.billing.edit'];
 const presetRules={'business.billing.view':true};
 const result=model.applyPositionPreset('business',permissions,presetRules);
 assert.deepEqual(result,{
  'business.billing.view':true,
  'business.billing.approve':false,
  'business.billing.edit':false,
 });
});

test('positionRulesChanged detects changes in active grants and ignores omitted vs false',()=>{
 assert.equal(model.positionRulesChanged({},{}),false);
 assert.equal(model.positionRulesChanged({},{'business.billing.view':true}),true);
 assert.equal(model.positionRulesChanged({},{'business.billing.view':false}),false);
 assert.equal(model.positionRulesChanged({'business.billing.view':true},{'business.billing.view':true}),false);
 assert.equal(model.positionRulesChanged({'business.billing.view':true},{'business.billing.view':false}),true);
 assert.equal(model.positionRulesChanged({'business.billing.view':true},{'business.billing.view':true,'business.billing.edit':false}),false);
});

test('staffStatusLabel maps lifecycle states to localized Thai and English labels',()=>{
 assert.equal(model.staffStatusLabel('active','th'),'ใช้งาน');
 assert.equal(model.staffStatusLabel('active','en'),'Active');
 assert.equal(model.staffStatusLabel('inactive','th'),'ยกเลิกแล้ว');
 assert.equal(model.staffStatusLabel('inactive','en'),'Inactive');
 assert.equal(model.staffStatusLabel('pending','th'),'รอยืนยัน');
 assert.equal(model.staffStatusLabel('pending','en'),'Pending');
 assert.equal(model.staffStatusLabel('invited','th'),'เชิญแล้ว');
 assert.equal(model.staffStatusLabel('invited','en'),'Invited');
 assert.equal(model.staffStatusLabel('cancelled','th'),'ยกเลิกแล้ว');
 assert.equal(model.staffStatusLabel('cancelled','en'),'Cancelled');
 assert.equal(model.staffStatusLabel('expired','th'),'คำเชิญหมดอายุ');
 assert.equal(model.staffStatusLabel('expired','en'),'Expired');
});

test('filterEmployees and sortEmployeesWithArchivedLast always push cancelled and expired invitations to the bottom',()=>{
 const rows=[
  {id:'1',displayName:'สมชาย ยกเลิกคำเชิญ',email:'c1@example.com',status:'cancelled',grant:null},
  {id:'2',displayName:'กานดา ใช้งานปกติ',email:'a1@example.com',status:'active',grant:null},
  {id:'3',displayName:'วิภา หมดอายุ',email:'e1@example.com',status:'expired',grant:null},
  {id:'4',displayName:'ณัฐพล รอตอบรับ',email:'i1@example.com',status:'invited',grant:null},
  {id:'5',displayName:'ชูศักดิ์ พักงาน',email:'in1@example.com',status:'inactive',grant:null},
 ];
 const filtered=filterEmployees(rows,'','all','all');
 assert.deepEqual(filtered.map((r)=>r.id),['2','4','5','1','3']);
 assert.equal(model.isArchivedInvitationStatus('cancelled'),true);
 assert.equal(model.isArchivedInvitationStatus('expired'),true);
 assert.equal(model.isArchivedInvitationStatus('active'),false);
 assert.equal(model.isArchivedInvitationStatus('invited'),false);
 assert.equal(model.isArchivedInvitationStatus('inactive'),false);
});

test('maskPersonalEmail and maskPersonalPhone mask personal data with standard conventions',()=>{
 assert.equal(model.maskPersonalEmail('testuser@gmail.com'),'te***@gmail.com');
 assert.equal(model.maskPersonalEmail('ab@domain.co.th'),'a***@domain.co.th');
 assert.equal(model.maskPersonalEmail('a@domain.com'),'a***@domain.com');
 assert.equal(model.maskPersonalEmail(''),'—');

 assert.equal(model.maskPersonalPhone('0812345678'),'08x-xxx-5678');
 assert.equal(model.maskPersonalPhone('081-234-5678'),'08x-xxx-5678');
 assert.equal(model.maskPersonalPhone(null),'—');
 assert.equal(model.maskPersonalPhone(''),'—');
});


