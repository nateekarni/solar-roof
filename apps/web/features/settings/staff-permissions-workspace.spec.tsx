import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import * as workspace from './staff-permissions-workspace';
import * as model from './staff-permissions-model';
import {apiClient} from '../../lib/api-client';
test('site scope table filters rows without losing selected sites outside the search',()=>{
 assert.equal(typeof workspace.SiteScopeTable,'function');
 const html=renderToStaticMarkup(<workspace.SiteScopeTable sites={[{id:'a',name:'Alpha'},{id:'b',name:'Beta'}]} scope={{mode:'selected',siteIds:['b']}} search=" BETA " onSearch={()=>{}} onChange={()=>{}}/>);
 assert.match(html,/<table/);assert.match(html,/Beta/);assert.doesNotMatch(html,/>Alpha</);assert.match(html,/checked=""/);
});
test('dirty staff drafts compare scope membership and inherited rules semantically',()=>{
 assert.equal(typeof model.staffDraftChanged,'function');
 const initial={positionId:'p',overrides:{'business.sites.view':true},scope:{mode:'selected' as const,siteIds:['a','b']}};
 assert.equal(model.staffDraftChanged(initial,{...initial,scope:{mode:'selected',siteIds:['b','a']}}),false);
 assert.equal(model.staffDraftChanged(initial,{...initial,overrides:{'business.sites.view':false}}),true);
 assert.equal(model.staffDraftChanged(initial,{...initial,scope:{mode:'all',siteIds:['a','b']}}),true);
});
test('invitation dismissal blocks in-flight requests and honors unsaved-work confirmation',()=>{
 assert.equal(typeof model.canDismissStaffDialog,'function');let prompts=0;
 const decline=()=>{prompts++;return false;};
 assert.equal(model.canDismissStaffDialog(true,true,decline),false);assert.equal(prompts,0);
 assert.equal(model.canDismissStaffDialog(false,true,decline),false);assert.equal(prompts,1);
 assert.equal(model.canDismissStaffDialog(false,true,()=>true),true);
 assert.equal(model.canDismissStaffDialog(false,false,decline),true);assert.equal(prompts,1);
});
test('staff status labels localize every employee lifecycle state',()=>{
 assert.equal(typeof model.staffStatusLabel,'function');
 assert.equal(model.staffStatusLabel('active','th'),'ใช้งาน');
 assert.equal(model.staffStatusLabel('inactive','th'),'ยกเลิกแล้ว');
 assert.equal(model.staffStatusLabel('pending','th'),'รอยืนยัน');
 assert.equal(model.staffStatusLabel('invited','th'),'เชิญแล้ว');
 assert.equal(model.staffStatusLabel('cancelled','th'),'ยกเลิกแล้ว');
 assert.equal(model.staffStatusLabel('expired','th'),'คำเชิญหมดอายุ');
 assert.equal(model.staffStatusLabel('inactive','en'),'Inactive');
 assert.equal(model.staffStatusLabel('cancelled','en'),'Cancelled');
 assert.equal(model.staffStatusLabel('expired','en'),'Expired');
 assert.equal(model.staffStatusLabel('new-status','en'),'new-status');
});

test('staff position filters include canonical manager assignments without grants',()=>{
 const manager={displayName:'Owner',email:'owner@example.test',status:'active',companyPositionId:'director',grant:null};
 assert.deepEqual(model.filterEmployees([manager],'','all','director'),[manager]);
 assert.deepEqual(model.filterEmployees([manager],'','all','unassigned'),[]);
 assert.deepEqual(model.filterPositions([{id:'director',name:'Director'}],[manager],'','assigned'),[{id:'director',name:'Director'}]);
});

test('StaffInvitation renders 2-tab modal with general details and permissions tabs',()=>{
 assert.equal(typeof (workspace as any).StaffInvitation, 'function');
 const html = renderToStaticMarkup(
  React.createElement((workspace as any).StaffInvitation, {
   inline: true,
   domain: 'business',
   positions: [{id: 'p1', name: 'วิศวกรไฟฟ้า', rules: {'business.sites.view': true}, revision: 1}],
   permissions: ['business.sites.view', 'business.sites.edit', 'technical.gateways.view'],
   sites: [{id: 's1', name: 'ไซต์ทดสอบ 1'}],
   onSaved: () => {},
   onClose: () => {},
  })
 );

 // Dialog Title & Description
 assert.match(html, /เพิ่มพนักงาน/);
 assert.match(html, /ส่งคำเชิญและกำหนดสิทธิ์การใช้งานสำหรับพนักงานใหม่/);
 assert.match(html, /sm:max-w-5xl/);

 // Tab triggers
 assert.match(html, /ข้อมูลทั่วไป/);
 assert.match(html, /สิทธิ์การใช้งานและไซต์/);

 // General details fields
 assert.match(html, /id="staff-name"/);
 assert.match(html, /id="staff-email"/);
 assert.match(html, /id="staff-position"/);
 assert.match(html, /aria-haspopup="listbox"/);
});

test('selecting position preset populates domain permissions and preserves preset rules',()=>{
 const permissions = ['business.sites.view', 'business.sites.edit', 'business.billing.view', 'technical.gateways.view'];
 const presetRules = {'business.sites.view': true, 'business.billing.view': true};

 const populated = model.applyPositionPreset('business', permissions, presetRules);
 assert.deepEqual(populated, {
  'business.sites.view': true,
  'business.sites.edit': false,
  'business.billing.view': true,
 });

 // Unspecified preset rules defaults to all false
 const emptyPreset = model.applyPositionPreset('business', permissions);
 assert.deepEqual(emptyPreset, {
  'business.sites.view': false,
  'business.sites.edit': false,
  'business.billing.view': false,
 });
});

test('editing position text preserves configured permission overrides',()=>{
 const permissions = ['business.sites.view', 'business.sites.edit'];
 const presetRules = {'business.sites.view': true};
 const overrides = model.applyPositionPreset('business', permissions, presetRules);

 // Simulating user changing the position text manually (typing custom title)
 const customPosition = 'หัวหน้าฝ่ายปฏิบัติการทั่วไป';
 const updatedOverrides = {...overrides};

 // Overrides must be preserved as-is
 assert.deepEqual(updatedOverrides, {
  'business.sites.view': true,
  'business.sites.edit': false,
 });

 const payload = (model as any).buildInvitePayload({
  email: 'operator@example.com',
  name: 'สมหญิง รักงาน',
  position: customPosition,
  domain: 'business',
  permissions,
  overrides: updatedOverrides,
  scope: {mode: 'all', siteIds: []},
 });

 assert.equal(payload.companyPosition, 'หัวหน้าฝ่ายปฏิบัติการทั่วไป');
 assert.deepEqual(payload.permissions, {
  'business.sites.view': true,
  'business.sites.edit': false,
 });
});

test('buildInvitePayload formats companyPosition, permissions, and scope for submit',()=>{
 const permissions = ['business.sites.view', 'business.sites.edit', 'technical.devices.view'];

 // 1. Selected scope mode with trimmed values
 const payload1 = (model as any).buildInvitePayload({
  email: '  NEW_STAFF@Domain.COM  ',
  name: '  นายทดสอบ ระบบ  ',
  position: '  วิศวกรสนาม  ',
  domain: 'business',
  permissions,
  overrides: {'business.sites.view': true, 'business.sites.edit': false, 'technical.devices.view': true},
  scope: {mode: 'selected', siteIds: ['site-101', 'site-102']},
 });

 assert.deepEqual(payload1, {
  email: 'new_staff@domain.com',
  displayName: 'นายทดสอบ ระบบ',
  role: 'operator',
  companyPosition: 'วิศวกรสนาม',
  permissions: {
   'business.sites.view': true,
   'business.sites.edit': false,
  },
  scope: {
   mode: 'selected',
   siteIds: ['site-101', 'site-102'],
  },
 });

 // 2. All scope mode clears siteIds, blank position becomes undefined
 const payload2 = (model as any).buildInvitePayload({
  email: 'staff@example.test',
  name: 'เจ้าหน้าที่',
  position: '   ',
  domain: 'business',
  permissions,
  overrides: {'business.sites.view': false},
  scope: {mode: 'all', siteIds: ['site-ignore']},
 });

 assert.equal(payload2.companyPosition, undefined);
 assert.deepEqual(payload2.scope, {
  mode: 'all',
  siteIds: [],
 });
 assert.deepEqual(payload2.permissions, {
  'business.sites.view': false,
  'business.sites.edit': false,
 });
});

test('apiClient.post sends invite payload to /v1/users/invite', async () => {
 const originalPost = apiClient.post;
 let calledEndpoint = '';
 let calledBody: any = null;
 (apiClient as any).post = async (endpoint: string, body?: unknown) => {
  calledEndpoint = endpoint;
  calledBody = body;
  return { success: true } as any;
 };

 try {
  const payload = (model as any).buildInvitePayload({
   email: 'newuser@domain.com',
   name: 'John Doe',
   position: 'Project Lead',
   domain: 'business',
   permissions: ['business.sites.view', 'business.billing.view'],
   overrides: { 'business.sites.view': true, 'business.billing.view': false },
   scope: { mode: 'selected', siteIds: ['site-1'] },
  });

  await apiClient.post('/v1/users/invite', payload);

  assert.equal(calledEndpoint, '/v1/users/invite');
  assert.deepEqual(calledBody, {
   email: 'newuser@domain.com',
   displayName: 'John Doe',
   role: 'operator',
   companyPosition: 'Project Lead',
   permissions: {
    'business.sites.view': true,
    'business.billing.view': false,
   },
   scope: {
    mode: 'selected',
    siteIds: ['site-1'],
   },
  });
 } finally {
  apiClient.post = originalPost;
 }
});

test('row action menu renders "แก้ไขข้อมูล" and "ยกเลิกใช้งาน" for active employees', () => {
 assert.equal(typeof (workspace as any).EmployeeRowActions, 'function');
 const activeEmployee = {
  id: 'emp-1',
  email: 'active@example.com',
  displayName: 'สมชาย รักงาน',
  role: 'operator',
  status: 'active',
  revision: 1,
  companyPositionId: null,
  companyPosition: null,
  grant: null,
 };
 const html = renderToStaticMarkup(
  React.createElement((workspace as any).EmployeeRowActions, {
   employee: activeEmployee,
   inline: true,
   onEdit: () => {},
   onDeactivate: () => {},
   onReactivate: () => {},
   onCancelInvite: () => {},
  })
 );
 assert.match(html, /แก้ไขข้อมูล/);
 assert.match(html, /ยกเลิกใช้งาน/);
 assert.doesNotMatch(html, /จัดการสิทธิ์/);
 assert.doesNotMatch(html, /เปิดใช้งานอีกครั้ง/);
 assert.doesNotMatch(html, /ยกเลิกคำเชิญ/);
});

test('row action menu renders "เปิดใช้งานอีกครั้ง" for inactive employees', () => {
 const inactiveEmployee = {
  id: 'emp-2',
  email: 'inactive@example.com',
  displayName: 'สมศรี พักงาน',
  role: 'operator',
  status: 'inactive',
  revision: 1,
  companyPositionId: null,
  companyPosition: null,
  grant: null,
 };
 const html = renderToStaticMarkup(
  React.createElement((workspace as any).EmployeeRowActions, {
   employee: inactiveEmployee,
   inline: true,
   onEdit: () => {},
   onDeactivate: () => {},
   onReactivate: () => {},
   onCancelInvite: () => {},
  })
 );
 assert.match(html, /แก้ไขข้อมูล/);
 assert.match(html, /เปิดใช้งานอีกครั้ง/);
 assert.doesNotMatch(html, /ยกเลิกใช้งาน/);
 assert.doesNotMatch(html, /ยกเลิกคำเชิญ/);
});

test('row action menu renders "ยกเลิกคำเชิญ" for invited employees', () => {
 const invitedEmployee = {
  id: 'emp-3',
  email: 'invited@example.com',
  displayName: 'สมศักดิ์ รอเริ่มงาน',
  role: 'operator',
  status: 'invited',
  revision: 1,
  companyPositionId: null,
  companyPosition: null,
  grant: null,
 };
 const html = renderToStaticMarkup(
  React.createElement((workspace as any).EmployeeRowActions, {
   employee: invitedEmployee,
   inline: true,
   onEdit: () => {},
   onDeactivate: () => {},
   onReactivate: () => {},
   onCancelInvite: () => {},
  })
 );
 assert.match(html, /แก้ไขข้อมูล/);
 assert.match(html, /ยกเลิกคำเชิญ/);
 assert.doesNotMatch(html, /ยกเลิกใช้งาน/);
 assert.doesNotMatch(html, /เปิดใช้งานอีกครั้ง/);
});

test('EmployeeEditor renders editable name input and title "แก้ไขข้อมูลพนักงาน"', () => {
 assert.equal(typeof (workspace as any).EmployeeEditor, 'function');
 const employee = {
  id: 'emp-1',
  email: 'worker@example.com',
  displayName: 'วิศวกร ทดสอบ',
  role: 'operator',
  status: 'active',
  revision: 1,
  companyPositionId: null,
  companyPosition: 'วิศวกรไฟฟ้า',
  grant: null,
 };
 const html = renderToStaticMarkup(
  React.createElement((workspace as any).EmployeeEditor, {
   employee,
   domain: 'business',
   positions: [{ id: 'pos-1', name: 'วิศวกรไฟฟ้า', rules: {}, revision: 1 }],
   permissions: ['business.sites.view'],
   sites: [{ id: 'site-1', name: 'ไซต์ 1' }],
   onSaved: () => {},
   onClose: () => {},
   canDeactivate: true,
   inline: true,
  })
 );
 assert.match(html, /แก้ไขข้อมูลพนักงาน/);
 assert.match(html, /id="edit-staff-name"/);
 assert.match(html, /value="วิศวกร ทดสอบ"/);
 assert.match(html, /id="edit-staff-position"/);
});

test('employeePositionDraft includes displayName in output payload', () => {
 assert.equal(typeof (model as any).employeePositionDraft, 'function');
 const payload = (model as any).employeePositionDraft({
  revision: 2,
  choice: { kind: 'existing', id: 'pos-1' },
  domain: 'business',
  permissions: ['business.sites.view'],
  rules: { 'business.sites.view': true },
  overrides: { 'business.sites.view': true },
  scope: { mode: 'all', siteIds: [] },
  displayName: '  นาย อัปเดต ชื่อ  ',
 });
 assert.equal(payload.displayName, 'นาย อัปเดต ชื่อ');
 assert.equal(payload.revision, 2);
});

test('Submitting EmployeeEditor sends updated displayName and patch payload', async () => {
 const originalPatch = apiClient.patch;
 let calledEndpoint = '';
 let calledBody: any = null;
 (apiClient as any).patch = async (endpoint: string, body?: unknown) => {
  calledEndpoint = endpoint;
  calledBody = body;
  return { success: true, revision: 2, position: { id: 'p1', name: 'หัวหน้างาน' } } as any;
 };

 try {
  const draft = (model as any).employeePositionDraft({
   revision: 1,
   choice: { kind: 'existing', id: 'p1' },
   domain: 'business',
   permissions: ['business.sites.view'],
   rules: { 'business.sites.view': true },
   overrides: { 'business.sites.view': true },
   scope: { mode: 'selected', siteIds: ['s1'] },
   displayName: 'สมชาย รักงานใหม่',
  });

  await apiClient.patch('/v1/team/employees/emp-1/business', draft);

  assert.equal(calledEndpoint, '/v1/team/employees/emp-1/business');
  assert.equal(calledBody.displayName, 'สมชาย รักงานใหม่');
  assert.equal(calledBody.revision, 1);
 } finally {
  apiClient.patch = originalPatch;
 }
});

test('DeactivateConfirmDialog renders impact summary and calls deactivate endpoint on confirm', async () => {
 assert.equal(typeof (workspace as any).DeactivateConfirmDialog, 'function');
 const employee = {
  id: 'emp-10',
  email: 'target@example.com',
  displayName: 'เป้าหมาย การทดสอบ',
  role: 'operator',
  status: 'active',
  revision: 3,
  companyPositionId: null,
  companyPosition: null,
  grant: null,
 };
 const html = renderToStaticMarkup(
  React.createElement((workspace as any).DeactivateConfirmDialog, {
   employee,
   impact: { activeSessions: 2, domains: [] },
   onConfirm: async () => {},
   onClose: () => {},
   inline: true,
  })
 );
 assert.match(html, /ยืนยันยกเลิกใช้งาน/);
 assert.match(html, /เป้าหมาย การทดสอบ/);
 assert.match(html, /2/);
});

test('CancelInviteConfirmDialog renders confirmation and calls deactivate endpoint on confirm', async () => {
 assert.equal(typeof (workspace as any).CancelInviteConfirmDialog, 'function');
 const employee = {
  id: 'emp-11',
  email: 'invited-user@example.com',
  displayName: 'ผู้รับเชิญ ทดสอบ',
  role: 'operator',
  status: 'invited',
  revision: 1,
  companyPositionId: null,
  companyPosition: null,
  grant: null,
 };
 const html = renderToStaticMarkup(
  React.createElement((workspace as any).CancelInviteConfirmDialog, {
   employee,
   onConfirm: async () => {},
   onClose: () => {},
   inline: true,
  })
 );
 assert.match(html, /ยกเลิกคำเชิญ/);
 assert.match(html, /ผู้รับเชิญ ทดสอบ/);
 assert.match(html, /invited-user@example.com/);
});

test('StaffInvitation form has noValidate to allow cross-tab validation', () => {
 const html = renderToStaticMarkup(
  React.createElement((workspace as any).StaffInvitation, {
   inline: true,
   domain: 'business',
   positions: [],
   permissions: [],
   sites: [],
   onSaved: () => {},
   onClose: () => {},
  })
 );
 assert.match(html, /<form[^>]+noValidate/i);
});



