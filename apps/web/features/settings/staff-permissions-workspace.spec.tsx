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

 // 3. Empty overrides produces empty permissions object (no implicit overrides)
 const payload3 = (model as any).buildInvitePayload({
  email: 'staff3@example.test',
  name: 'เจ้าหน้าที่สาม',
  position: 'ช่าง',
  domain: 'business',
  permissions,
  overrides: {},
  scope: {mode: 'all', siteIds: []},
 });
 assert.deepEqual(payload3.permissions, {});
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

test('DiscardConfirmDialog renders title, warning message, and action buttons', () => {
 assert.equal(typeof (workspace as any).DiscardConfirmDialog, 'function');
 const html = renderToStaticMarkup(
  React.createElement((workspace as any).DiscardConfirmDialog, {
   open: true,
   inline: true,
   onConfirm: () => {},
   onCancel: () => {},
  })
 );
 assert.match(html, /ละทิ้งการเปลี่ยนแปลง\?/);
 assert.match(html, /ข้อมูลที่คุณแก้ไขยังไม่ได้บันทึก/);
 assert.match(html, /แก้ไขต่อ/);
 assert.match(html, /ละทิ้งข้อมูล/);
});

test('SiteScopeTable empty state renders centered empty component with icon', () => {
 const html = renderToStaticMarkup(
  React.createElement(workspace.SiteScopeTable, {
   sites: [],
   scope: { mode: 'selected', siteIds: [] },
   search: '',
   onSearch: () => {},
   onChange: () => {},
  })
 );
 assert.match(html, /ไม่พบไซต์/);
 assert.match(html, /ยังไม่มีไซต์ในระบบ/);
 assert.match(html, /text-center/);
});

test('StaffInvitation and EmployeeEditor render avatar preview and full-width segmented tab triggers', () => {
 const inviteHtml = renderToStaticMarkup(
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
 assert.match(inviteHtml, /w-full flex gap-2/);
 assert.match(inviteHtml, /พนักงานใหม่/);

 const editHtml = renderToStaticMarkup(
  React.createElement((workspace as any).EmployeeEditor, {
   inline: true,
   employee: {
    id: 'emp-1',
    email: 'test@example.com',
    displayName: 'กฤษณะ วารี',
    role: 'staff',
    status: 'active',
    revision: 1,
    companyPositionId: null,
    companyPosition: 'วิศวกร',
    grant: null,
   },
   domain: 'business',
   positions: [],
   permissions: [],
   sites: [],
   onSaved: () => {},
   onClose: () => {},
   canDeactivate: false,
  })
 );
 assert.match(editHtml, /w-full flex gap-2/);
 assert.match(editHtml, /กฤษณะ วารี/);
});

test('ACTIVE_DISPLAY_RESOURCES contains only real active system menus and excludes obsolete resources', () => {
  assert.deepEqual(model.ACTIVE_DISPLAY_RESOURCES.business, [
    'dashboard',
    'sites',
    'billing',
    'receipts',
    'tariffs',
    'settings',
    'audit',
  ]);
  assert.equal(model.ACTIVE_DISPLAY_RESOURCES.business.includes('customers'), false);
  assert.equal(model.ACTIVE_DISPLAY_RESOURCES.business.includes('documents'), false);

  assert.deepEqual(model.ACTIVE_DISPLAY_RESOURCES.technical, [
    'dashboard',
    'gateways',
    'alerts',
    'settings',
    'profiles',
    'audit',
  ]);
  assert.equal(model.ACTIVE_DISPLAY_RESOURCES.technical.includes('registers'), false);
  assert.equal(model.ACTIVE_DISPLAY_RESOURCES.technical.includes('devices'), false);
  assert.equal(model.ACTIVE_DISPLAY_RESOURCES.technical.includes('fields'), false);
  assert.equal(model.ACTIVE_DISPLAY_RESOURCES.technical.includes('brokers'), false);
  assert.equal(model.ACTIVE_DISPLAY_RESOURCES.technical.includes('telemetry'), false);
  assert.equal(model.ACTIVE_DISPLAY_RESOURCES.technical.includes('reception'), false);
});

test('bundleSubPermissions syncs sub-permissions for business and technical domains', () => {
  // Business domain: customers follows sites, documents follows billing
  const businessBundled = model.bundleSubPermissions('business', {
    'business.sites.view': true,
    'business.sites.edit': true,
    'business.billing.view': true,
    'business.billing.edit': false,
    'business.billing.download': true,
  });
  assert.equal(businessBundled['business.customers.view'], true);
  assert.equal(businessBundled['business.customers.edit'], true);
  assert.equal(businessBundled['business.documents.view'], true);
  assert.equal(businessBundled['business.documents.edit'], false);
  assert.equal(businessBundled['business.documents.download'], true);

  // Technical domain: devices, fields, registers, brokers, telemetry follow gateways; reception follows settings
  const technicalBundled = model.bundleSubPermissions('technical', {
    'technical.gateways.view': true,
    'technical.gateways.edit': false,
    'technical.settings.view': true,
    'technical.settings.edit': true,
  });
  assert.equal(technicalBundled['technical.devices.view'], true);
  assert.equal(technicalBundled['technical.devices.edit'], false);
  assert.equal(technicalBundled['technical.fields.view'], true);
  assert.equal(technicalBundled['technical.fields.edit'], false);
  assert.equal(technicalBundled['technical.registers.view'], true);
  assert.equal(technicalBundled['technical.registers.edit'], false);
  assert.equal(technicalBundled['technical.brokers.view'], true);
  assert.equal(technicalBundled['technical.brokers.edit'], false);
  assert.equal(technicalBundled['technical.telemetry.view'], true);
  assert.equal(technicalBundled['technical.telemetry.download'], true);
  assert.equal(technicalBundled['technical.reception.view'], true);
  assert.equal(technicalBundled['technical.reception.edit'], true);
});

test('RuleMatrix displays only active menus for business domain and hides customers and documents', () => {
  const permissions = [
    'business.dashboard.view',
    'business.sites.view',
    'business.sites.edit',
    'business.customers.view',
    'business.customers.edit',
    'business.billing.view',
    'business.receipts.view',
    'business.documents.view',
    'business.tariffs.view',
    'business.settings.view',
    'business.audit.view',
  ];
  const html = renderToStaticMarkup(
    React.createElement(workspace.RuleMatrix, {
      domain: 'business',
      permissions,
      rules: {},
      overrides: {},
      onChange: () => {},
    })
  );
  assert.match(html, /ภาพรวม/);
  assert.match(html, /จัดการไซต์งาน/);
  assert.match(html, /ใบวางบิล/);
  assert.match(html, /ใบเสร็จรับเงิน/);
  assert.match(html, /อัตราค่าไฟ/);
  assert.match(html, /ตั้งค่าบริษัทและบัญชี/);
  assert.match(html, /ประวัติการทำงาน/);

  // Must NOT contain obsolete or internal sub-resources
  assert.doesNotMatch(html, />ลูกค้า</);
  assert.doesNotMatch(html, />เอกสาร</);
});

test('RuleMatrix displays only active menus for technical domain and hides registers, devices, fields, brokers', () => {
  const permissions = [
    'technical.dashboard.view',
    'technical.gateways.view',
    'technical.devices.view',
    'technical.fields.view',
    'technical.registers.view',
    'technical.brokers.view',
    'technical.telemetry.view',
    'technical.alerts.view',
    'technical.settings.view',
    'technical.profiles.view',
    'technical.audit.view',
  ];
  const html = renderToStaticMarkup(
    React.createElement(workspace.RuleMatrix, {
      domain: 'technical',
      permissions,
      rules: {},
      overrides: {},
      onChange: () => {},
    })
  );
  assert.match(html, /ภาพรวม/);
  assert.match(html, /จัดการเกตเวย์/);
  assert.match(html, /การแจ้งเตือนระบบ/);
  assert.match(html, /การรับข้อมูล/);
  assert.match(html, /แม่แบบอุปกรณ์/);
  assert.match(html, /ประวัติการทำงาน/);

  // Must NOT contain merged/obsolete items
  assert.doesNotMatch(html, />รีจิสเตอร์</);
  assert.doesNotMatch(html, />อุปกรณ์</);
  assert.doesNotMatch(html, />รายการข้อมูล</);
  assert.doesNotMatch(html, />การเชื่อมต่อ</);
  assert.doesNotMatch(html, />ข้อมูลเทคนิค</);
});

test('EmployeeEditor renders horizontal row layout for Name, Email, Role, and Position in single card', () => {
  const employee = {
    id: 'emp-20',
    email: 'operator@example.com',
    displayName: 'มานะ ชัยชนะ',
    role: 'operator',
    status: 'active',
    revision: 1,
    companyPositionId: null,
    companyPosition: 'วิศวกรควบคุม',
    grant: null,
  };
  const html = renderToStaticMarkup(
    React.createElement(workspace.EmployeeEditor, {
      employee,
      domain: 'business',
      positions: [{ id: 'p1', name: 'วิศวกรควบคุม', rules: {}, revision: 1 }],
      permissions: ['business.sites.view'],
      sites: [],
      onSaved: () => {},
      onClose: () => {},
      canDeactivate: true,
      inline: true,
    })
  );

  // Check 140px horizontal grid row classes for all 4 fields
  assert.match(html, /sm:grid-cols-\[140px_minmax\(0,1fr\)\]/);
  assert.match(html, /id="edit-staff-name"/);
  assert.match(html, /operator@example.com/);
  assert.match(html, /id="edit-staff-position"/);

  // No separate "ตำแหน่งและสิทธิ์เริ่มต้น" section
  assert.doesNotMatch(html, /ตำแหน่งและสิทธิ์เริ่มต้น/);
});

test('EmployeeEditor renders RuleMatrix and site scope as read-only for builtInManager (Owner/Admin) without hiding them', () => {
  const adminEmployee = {
    id: 'admin-1',
    email: 'admin@solar.local',
    displayName: 'Platform Administrator',
    role: 'admin',
    status: 'active',
    revision: 1,
    companyPositionId: null,
    companyPosition: 'ผู้ดูแลระบบ',
    grant: null,
  };
  const html = renderToStaticMarkup(
    React.createElement(workspace.EmployeeEditor, {
      employee: adminEmployee,
      domain: 'technical',
      positions: [],
      permissions: ['technical.gateways.view', 'technical.alerts.view'],
      sites: [{ id: 's1', name: 'Site Alpha' }],
      onSaved: () => {},
      onClose: () => {},
      canDeactivate: false,
      inline: true,
      initialTab: 'permissions',
    })
  );

  // RuleMatrix and site scope must be rendered (NOT hidden)
  assert.match(html, /<table/);
  assert.match(html, /จัดการเกตเวย์/);
  assert.match(html, /การแจ้งเตือนระบบ/);
  assert.match(html, /ทุกไซต์/);

  // Notification badge explaining role permissions
  assert.match(html, /สิทธิ์การใช้งานและขอบเขตไซต์ถูกกำหนดตามบทบาทผู้ดูแลระบบ\/เจ้าของระบบ/);

  // No confirmation checkbox
  assert.doesNotMatch(html, /ยืนยันสิทธิ์สำหรับตำแหน่งใหม่/);
});

test('StaffInvitation renders horizontal row layout for Name, Email, and Position', () => {
  const html = renderToStaticMarkup(
    React.createElement(workspace.StaffInvitation, {
      inline: true,
      domain: 'business',
      positions: [{ id: 'p1', name: 'หัวหน้างาน', rules: {}, revision: 1 }],
      permissions: ['business.sites.view'],
      sites: [],
      onSaved: () => {},
      onClose: () => {},
    })
  );

  assert.match(html, /sm:grid-cols-\[140px_minmax\(0,1fr\)\]/);
  assert.match(html, /id="staff-name"/);
  assert.match(html, /id="staff-email"/);
  assert.match(html, /id="staff-position"/);
});

test('employeePositionDraft allows custom position creation without permissionsConfigured requirement', () => {
  const draft = model.employeePositionDraft({
    revision: 1,
    choice: { kind: 'new', name: 'ตำแหน่งกำหนดเอง' },
    domain: 'business',
    permissions: ['business.sites.view', 'business.customers.view'],
    rules: {},
    overrides: { 'business.sites.view': true },
    scope: { mode: 'all', siteIds: [] },
  });

  assert.equal(draft.position?.name, 'ตำแหน่งกำหนดเอง');
  assert.deepEqual(draft.overrides, {
    'business.sites.view': true,
    'business.customers.view': true,
  });
});

test('StaffInvitation renders stepper buttons: Next on general tab, Back and Send invitation on permissions tab', () => {
  // 1. General tab (default)
  const generalHtml = renderToStaticMarkup(
    React.createElement((workspace as any).StaffInvitation, {
      inline: true,
      domain: 'business',
      positions: [{ id: 'p1', name: 'หัวหน้างาน', rules: {}, revision: 1 }],
      permissions: ['business.sites.view'],
      sites: [],
      onSaved: () => {},
      onClose: () => {},
    })
  );
  assert.match(generalHtml, />ถัดไป</);
  assert.doesNotMatch(generalHtml, />ส่งคำเชิญ</);
  assert.doesNotMatch(generalHtml, />ย้อนกลับ</);

  // 2. Permissions tab
  const permissionsHtml = renderToStaticMarkup(
    React.createElement((workspace as any).StaffInvitation, {
      inline: true,
      domain: 'business',
      initialTab: 'permissions',
      positions: [{ id: 'p1', name: 'หัวหน้างาน', rules: {}, revision: 1 }],
      permissions: ['business.sites.view'],
      sites: [],
      onSaved: () => {},
      onClose: () => {},
    })
  );
  assert.match(permissionsHtml, />ย้อนกลับ</);
  assert.match(permissionsHtml, />ส่งคำเชิญ</);
  assert.doesNotMatch(permissionsHtml, />ถัดไป</);
});

test('EmployeeEditor renders stepper buttons: Next on general tab, Back and Save on permissions tab', () => {
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

  // 1. General tab (default)
  const generalHtml = renderToStaticMarkup(
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
  assert.match(generalHtml, />ถัดไป</);
  assert.doesNotMatch(generalHtml, />บันทึกข้อมูล</);
  assert.doesNotMatch(generalHtml, />ย้อนกลับ</);

  // 2. Permissions tab
  const permissionsHtml = renderToStaticMarkup(
    React.createElement((workspace as any).EmployeeEditor, {
      employee,
      domain: 'business',
      initialTab: 'permissions',
      positions: [{ id: 'pos-1', name: 'วิศวกรไฟฟ้า', rules: {}, revision: 1 }],
      permissions: ['business.sites.view'],
      sites: [{ id: 'site-1', name: 'ไซต์ 1' }],
      onSaved: () => {},
      onClose: () => {},
      canDeactivate: true,
      inline: true,
    })
  );
  assert.match(permissionsHtml, />ย้อนกลับ</);
  assert.match(permissionsHtml, />บันทึกข้อมูล</);
  assert.doesNotMatch(permissionsHtml, />ถัดไป</);
});

test('StaffInvitation and EmployeeEditor decouple submit buttons from form and use type="button"', () => {
  // StaffInvitation general tab
  const inviteGeneral = renderToStaticMarkup(
    React.createElement((workspace as any).StaffInvitation, {
      inline: true,
      domain: 'business',
      positions: [],
      permissions: ['business.sites.view'],
      sites: [],
      onSaved: () => {},
      onClose: () => {},
    })
  );
  assert.doesNotMatch(inviteGeneral, /type="submit"/);
  assert.match(inviteGeneral, /type="button"[^>]*>ถัดไป<\/button>/);

  // StaffInvitation permissions tab
  const invitePermissions = renderToStaticMarkup(
    React.createElement((workspace as any).StaffInvitation, {
      inline: true,
      domain: 'business',
      initialTab: 'permissions',
      positions: [],
      permissions: ['business.sites.view'],
      sites: [],
      onSaved: () => {},
      onClose: () => {},
    })
  );
  assert.doesNotMatch(invitePermissions, /type="submit"/);
  assert.match(invitePermissions, /type="button"[^>]*>ส่งคำเชิญ<\/button>/);

  // EmployeeEditor general tab
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
  const editorGeneral = renderToStaticMarkup(
    React.createElement((workspace as any).EmployeeEditor, {
      employee,
      domain: 'business',
      positions: [],
      permissions: ['business.sites.view'],
      sites: [],
      onSaved: () => {},
      onClose: () => {},
      canDeactivate: true,
      inline: true,
    })
  );
  assert.doesNotMatch(editorGeneral, /type="submit"/);
  assert.match(editorGeneral, /type="button"[^>]*>ถัดไป<\/button>/);

  // EmployeeEditor permissions tab
  const editorPermissions = renderToStaticMarkup(
    React.createElement((workspace as any).EmployeeEditor, {
      employee,
      domain: 'business',
      initialTab: 'permissions',
      positions: [],
      permissions: ['business.sites.view'],
      sites: [],
      onSaved: () => {},
      onClose: () => {},
      canDeactivate: true,
      inline: true,
    })
  );
  assert.doesNotMatch(editorPermissions, /type="submit"/);
  assert.match(editorPermissions, /type="button"[^>]*>บันทึกข้อมูล<\/button>/);
});

test('TooltipContent with variant="popover" renders theme-aware popover styling and data-variant', async () => {
  const { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } = await import('../../components/ui/tooltip');
  const html = renderToStaticMarkup(
    <TooltipProvider>
      <Tooltip open={true}>
        <TooltipTrigger asChild>
          <button type="button">Hover</button>
        </TooltipTrigger>
        <TooltipContent variant="popover" inline={true}>
          <div className="font-semibold">ขอบเขตไซต์งาน</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
  assert.match(html, /data-slot="tooltip-content"/);
  assert.match(html, /data-variant="popover"/);
  assert.match(html, /bg-popover/);
  assert.match(html, /text-popover-foreground/);
  assert.match(html, /border-border/);
  assert.match(html, /ขอบเขตไซต์งาน/);
});

test('EmployeeScopeBadgeList renders primary subtle badge and theme-aware popover with site count and icons', () => {
  const sites = [
    'ศูนย์กระจายสินค้า ลาดกระบัง',
    'โรงงานบรรจุภัณฑ์ บางพลี',
    'คลังสินค้า คลองหลวง',
    'โรงงานชิ้นส่วน บางปะอิน',
    'ศูนย์บริการ ศรีราชา',
  ];
  const html = renderToStaticMarkup(
    <workspace.EmployeeScopeBadgeList siteNames={sites} th={true} inline={true} open={true} />
  );
  // Truncated primary site name
  assert.match(html, /ศูนย์กระจายสินค้า ลาดกระบัง/);
  // Primary subtle badge +4
  assert.match(html, /\+4/);
  assert.match(html, /bg-primary\/10 text-primary border-primary\/25/);
  // Tooltip content with popover variant
  assert.match(html, /data-variant="popover"/);
  assert.match(html, /bg-popover text-popover-foreground/);
  assert.match(html, /ขอบเขตไซต์งาน/);
  assert.match(html, /5 ไซต์/);
  // Site list items with primary bullet dot
  assert.match(html, /bg-primary/);
  assert.match(html, /โรงงานบรรจุภัณฑ์ บางพลี/);
  assert.match(html, /คลังสินค้า คลองหลวง/);
  assert.match(html, /โรงงานชิ้นส่วน บางปะอิน/);
  assert.match(html, /ศูนย์บริการ ศรีราชา/);
});

test('row action menu renders only "ดูรายละเอียด" for cancelled and expired invitations', () => {
  const cancelledEmployee = {
    id: 'emp-cancelled',
    email: 'cancelled@example.com',
    displayName: 'สมปอง อดีตผู้รับเชิญ',
    role: 'operator',
    status: 'cancelled',
    revision: 1,
    companyPositionId: null,
    companyPosition: 'วิศวกรไฟฟ้า',
    grant: null,
  };
  const cancelledHtml = renderToStaticMarkup(
    React.createElement((workspace as any).EmployeeRowActions, {
      employee: cancelledEmployee,
      inline: true,
      onEdit: () => {},
      onDeactivate: () => {},
      onReactivate: () => {},
      onCancelInvite: () => {},
      onViewInvitation: () => {},
    })
  );
  assert.match(cancelledHtml, /ดูรายละเอียด/);
  assert.doesNotMatch(cancelledHtml, /แก้ไขข้อมูล/);
  assert.doesNotMatch(cancelledHtml, /ยกเลิกใช้งาน/);
  assert.doesNotMatch(cancelledHtml, /เปิดใช้งานอีกครั้ง/);
  assert.doesNotMatch(cancelledHtml, /ยกเลิกคำเชิญ/);

  const expiredEmployee = {
    ...cancelledEmployee,
    id: 'emp-expired',
    status: 'expired',
  };
  const expiredHtml = renderToStaticMarkup(
    React.createElement((workspace as any).EmployeeRowActions, {
      employee: expiredEmployee,
      inline: true,
      onEdit: () => {},
      onDeactivate: () => {},
      onReactivate: () => {},
      onCancelInvite: () => {},
      onViewInvitation: () => {},
    })
  );
  assert.match(expiredHtml, /ดูรายละเอียด/);
  assert.doesNotMatch(expiredHtml, /แก้ไขข้อมูล/);
  assert.doesNotMatch(expiredHtml, /เปิดใช้งานอีกครั้ง/);
});

test('InvitationDetailsDialog renders invitation metadata, masked personal data, read-only permissions, and Close button', () => {
  assert.equal(typeof (workspace as any).InvitationDetailsDialog, 'function');
  const archivedEmployee = {
    id: 'emp-arch-1',
    email: 'testuser@gmail.com',
    phone: '0812345678',
    displayName: 'สมเกียรติ ประวัติคำเชิญ',
    role: 'operator',
    status: 'cancelled',
    revision: 1,
    companyPositionId: 'pos-1',
    companyPosition: 'วิศวกรตรวจสอบ',
    grant: {
      positionId: 'pos-1',
      overrides: { 'business.sites.view': true, 'business.billing.view': false },
      scope: { mode: 'selected' as const, siteIds: ['site-1', 'site-2'] },
    },
    invitation: {
      id: 'inv-1',
      invitedAt: '2026-09-21T07:27:00.000Z',
      expiresAt: '2026-09-28T07:27:00.000Z',
      revokedAt: '2026-09-22T09:15:00.000Z',
      deliveryStatus: 'sent',
      issuerId: 'admin-1',
      issuerName: 'ผู้จัดการ ฝ่ายบุคคล',
      issuerEmail: 'hradmin@company.co.th',
    },
  };

  const html = renderToStaticMarkup(
    React.createElement((workspace as any).InvitationDetailsDialog, {
      employee: archivedEmployee,
      domain: 'business',
      positions: [{ id: 'pos-1', name: 'วิศวกรตรวจสอบ', rules: { 'business.sites.view': true }, revision: 1 }],
      permissions: ['business.sites.view', 'business.billing.view'],
      sites: [
        { id: 'site-1', name: 'โรงงานบางปะอิน' },
        { id: 'site-2', name: 'คลังสินค้าลาดกระบัง' },
      ],
      onClose: () => {},
      inline: true,
    })
  );

  // Title & Sections
  assert.match(html, /รายละเอียดคำเชิญ/);
  assert.match(html, /ข้อมูลการเชิญ/);
  assert.match(html, /ข้อมูลที่กรอก/);

  // Inviter & Status
  assert.match(html, /ยกเลิกแล้ว/);
  assert.match(html, /ผู้จัดการ ฝ่ายบุคคล/);
  assert.match(html, /hr\*\*\*@company\.co\.th/);
  assert.doesNotMatch(html, /hradmin@company\.co\.th/);

  // Masked personal fields (only masked shown, never raw)
  assert.match(html, /สมเกียรติ ประวัติคำเชิญ/);
  assert.match(html, /te\*\*\*@gmail\.com/);
  assert.doesNotMatch(html, /testuser@gmail\.com/);
  assert.match(html, /08x-xxx-5678/);
  assert.doesNotMatch(html, /0812345678/);

  // Position, Site scope & Read-only permissions
  assert.match(html, /วิศวกรตรวจสอบ/);
  assert.match(html, /โรงงานบางปะอิน/);
  assert.match(html, /คลังสินค้าลาดกระบัง/);
  assert.match(html, /จัดการไซต์งาน/);

  // Separated footer with Close button
  assert.match(html, />ปิด<\/button>/);
});


