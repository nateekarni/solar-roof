import assert from "node:assert/strict";
import test from "node:test";
import { routeAllowed, customerScope } from "./route-policy.js";
import { authorizedRoute } from './domain-route-policy.js';
import { effectiveAuthorization } from './authorization.js';
import { Reflector } from '@nestjs/core';
import { RolesGuard as LegacyRolesGuard } from '../roles.guard.js';
import { RolesGuard, RequireRoles } from './roles.guard.js';
import { SettingsController } from '../../modules/settings/settings.controller.js';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { isAllowedRequestOrigin } from './request-origin.guard.js';

test('customer portal home is an exact customer-only read endpoint', () => {
 for (const role of ['customer_user','owner','admin','operator','accountant']) {
  for (const method of ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']) {
   const allowed=role==='customer_user' && ['GET','HEAD'].includes(method);
   assert.equal(routeAllowed(role,method,'/v1/customer/portal/home?range=7d'),allowed);
   assert.equal(authorizedRoute({role},method,'/v1/customer/portal/home?range=7d'),allowed);
  }
 }
 for(const path of ['/v1/customer/portal/home/technical','/v1/customer/portal','/v1/customer/portal/home-other'])assert.equal(routeAllowed('customer_user','GET',path),false);
});

test('public branding GET and HEAD work without Origin while cross-origin mutations remain blocked',()=>{
 for(const method of ['GET','HEAD'])for(const origin of [undefined,'https://external.example'])assert.equal(isAllowedRequestOrigin({method,path:'/v1/public/branding/logo',headers:{origin}} as Request,'https://web.example'),true);
 assert.equal(isAllowedRequestOrigin({method:'PUT',path:'/v1/settings/company',headers:{origin:'https://external.example'}} as Request,'https://web.example'),false);
});

test('internal MQTT webhook routes bypass browser origin check',()=>{
 for(const path of ['/v1/internal/mqtt/auth','/v1/internal/mqtt/acl']){
  assert.equal(isAllowedRequestOrigin({method:'POST',path,headers:{}} as Request,'https://web.example'),true);
 }
});

test('only Owner can mutate global company and bank settings even with staff permission grants',()=>{
 for(const path of ['/v1/settings/company','/v1/settings/bank-accounts','/v1/settings/bank-accounts/account-a'])for(const method of ['PUT','PATCH','POST','DELETE']){
  for(const role of ['admin','operator','accountant','customer_user']){
   const authorization=effectiveAuthorization(role,1,[{domain:'business',preset:{'business.settings.edit':true},overrides:{},scope:{mode:'all',siteIds:[]}}]);
   assert.equal(routeAllowed(role,method,path),false);assert.equal(authorizedRoute({role,authorization},method,path),false);
  }
 }
 for(const [method,path]of [['PUT','/v1/settings/company'],['PUT','/v1/settings/bank-accounts'],['DELETE','/v1/settings/bank-accounts/account-a']])assert.equal(authorizedRoute({role:'owner'},method!,path!),true);
});
test('both role guard layers enforce company Owner restriction against employee grants',()=>{
 const handler=SettingsController.prototype.updateCompanyProfile;
 RequireRoles('owner')({},'handler',{value:handler});
 for(const role of ['admin','operator','accountant','customer_user']){
  const authorization=effectiveAuthorization(role,1,[{domain:'business',preset:{'business.settings.edit':true},overrides:{},scope:{mode:'all',siteIds:[]}}]);
  const context={getHandler:()=>handler,getClass:()=>SettingsController,switchToHttp:()=>({getRequest:()=>({method:'PUT',path:'/v1/settings/company',user:{role,authorization}})})} as unknown as ExecutionContext;
  assert.throws(()=>new LegacyRolesGuard(new Reflector()).canActivate(context));assert.throws(()=>new RolesGuard().canActivate(context));
 }
});
test('customer detailed comparison permits only read-only exact endpoint and retains legacy denial',()=>{
 for(const method of ['GET','HEAD'])assert.equal(routeAllowed('customer_user',method,'/v1/dashboard/comparison?site_ids=assigned'),true);
 for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal(routeAllowed('customer_user',method,'/v1/dashboard/comparison'),false);
 for(const path of ['/v1/dashboard/compare','/v1/dashboard/comparison/technical','/v1/dashboard/technical'])assert.equal(routeAllowed('customer_user','GET',path),false);
});

test('audit reads remain available to managers without admitting employee/customer access or writes',()=>{
 for(const path of ['/v1/operations/audit','/v1/operations/audit/summary','/v1/operations/audit/export']){
  for(const role of ['owner','admin'])for(const method of ['GET','HEAD'])assert.equal(routeAllowed(role,method,path),true,`${role} ${method} ${path}`);
  for(const role of ['operator','accountant','customer_user'])assert.equal(routeAllowed(role,'GET',path),false);
  for(const role of ['owner','admin'])for(const method of ['POST','PATCH','DELETE'])assert.equal(routeAllowed(role,method,path),false);
 }
});

test("owner cannot access hardware while admin can configure it", () => {
  assert.equal(routeAllowed("owner", "GET", "/v1/sites/123"), true);
  assert.equal(routeAllowed("owner", "PATCH", "/v1/sites/123"), true);
  assert.equal(routeAllowed("owner", "POST", "/v1/gateways/GW-1/hardware-config"), false);
  assert.equal(routeAllowed("admin", "POST", "/v1/gateways/GW-1/hardware-config"), true);
});
test("customer users cannot issue documents, configure registers or enumerate users", () => {
  assert.equal(routeAllowed("customer_user", "POST", "/v1/documents"), false);
  assert.equal(routeAllowed("customer_user", "POST", "/v1/devices/123/register-mappings"), false);
  assert.equal(routeAllowed("customer_user", "GET", "/v1/operations/users"), false);
  assert.equal(routeAllowed("customer_user", "GET", "/v1/operations/audit/export"), false);
  assert.equal(routeAllowed("customer_user", "POST", "/v1/billing-cycles/123/pay"), true);
});
test("unknown mutations and HTTP telemetry ingestion fail closed", () => {
  assert.equal(routeAllowed("owner", "POST", "/v1/unknown"), false);
  assert.equal(routeAllowed("admin", "POST", "/v1/telemetry/ingest"), false);
  assert.equal(routeAllowed("bogus", "GET", "/v1/sites"), false);
});
test("customer scope never widens missing customer membership", () => {
  assert.deepEqual(customerScope({role:"customer_user"}), []);
  assert.deepEqual(customerScope({role:"customer_user",customerId:"customer-a",assignedSiteIds:["site-a"]}), ["customer-a"]);
  assert.equal(customerScope({role:"admin",customerId:"customer-a"}), null);
  assert.equal(customerScope({role:"owner"}), null);
  assert.deepEqual(customerScope(undefined), []);
});

test('business routes exclude technical configuration and user enumeration but allow owner invitations', () => {
 for(const role of ['owner','customer_user']) for(const path of ['/v1/mqtt-brokers','/v1/operations/users','/v1/operations/gateways','/v1/settings','/v1/settings/notifications']) assert.equal(routeAllowed(role,'GET',path),false);
 assert.equal(routeAllowed('owner','POST','/v1/users/invite'),true);
 assert.equal(routeAllowed('owner','PUT','/v1/settings/company'),true);
 assert.equal(routeAllowed('customer_user','GET','/v1/settings/bank-accounts'),true);
 assert.equal(routeAllowed('customer_user','PUT','/v1/me/preferences'),true);
 for(const path of ['/v1/billing-cycles/1/generate-invoice','/v1/documents']) assert.equal(routeAllowed('admin','POST',path),false);
 assert.equal(routeAllowed('admin','PATCH','/v1/billing-cycles/1/verify-payment'),false);
});
test('business roles can read scoped billing collections and details',()=>{
 for(const role of ['owner','customer_user']) for(const path of ['/v1/operations/billing','/v1/operations/billing/records/1']) assert.equal(routeAllowed(role,'GET',path),true);
});

test('Owner receives narrowly scoped dashboard read APIs without technical privileges',()=>{for(const path of ['/v1/dashboard/compare','/v1/dashboard/power-flow']){assert.equal(routeAllowed('owner','GET',path),true);assert.equal(routeAllowed('owner','HEAD',path),true);for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal(routeAllowed('owner',method,path),false);assert.equal(routeAllowed('customer_user','GET',path),path==='/v1/dashboard/power-flow');}for(const path of ['/v1/gateways','/v1/dashboard/technical','/v1/settings/payload-presets'])assert.equal(routeAllowed('owner','GET',path),false);});

test('only Owner and Accountant may approve or reject payment evidence',()=>{
 for(const role of ['admin','operator','customer_user'])assert.equal(routeAllowed(role,'PATCH','/v1/billing-cycles/1/verify-payment'),false);
 for(const role of ['owner','accountant'])assert.equal(routeAllowed(role,'PATCH','/v1/billing-cycles/1/verify-payment'),true);
});

test('only Owner and Accountant may record cash payments',()=>{
 for(const role of ['admin','operator','customer_user'])assert.equal(routeAllowed(role,'POST','/v1/billing-cycles/1/cash-payment'),false);
 for(const role of ['owner','accountant'])assert.equal(routeAllowed(role,'POST','/v1/billing-cycles/1/cash-payment'),true);
 for(const method of ['GET','PATCH','PUT','DELETE'])assert.equal(routeAllowed('owner',method,'/v1/billing-cycles/1/cash-payment'),false);
});

test('Admin cannot read financial documents or finance widgets',()=>{
 for(const path of ['/v1/documents/1/download','/v1/billing-cycles/1','/v1/operations/billing','/v1/dashboard/revenue','/v1/contracts']) assert.equal(routeAllowed('admin','GET',path),false);
});

test('customer daily production drilldown is read-only and does not admit technical dashboard routes',()=>{
 assert.equal(routeAllowed('customer_user','GET','/v1/dashboard/day?site_id=assigned'),true);
 assert.equal(routeAllowed('customer_user','POST','/v1/dashboard/day'),false);
 assert.equal(routeAllowed('customer_user','GET','/v1/dashboard/technical'),false);
});
test('payment instructions allow only customer reads on the exact route', () => {
 const path = '/v1/customer/portal/payment-instructions';
 for (const role of ['customer_user','owner','admin','operator','accountant','bogus']) {
  for (const method of ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']) {
   assert.equal(routeAllowed(role,method,path), role === 'customer_user' && ['GET','HEAD'].includes(method));
   assert.equal(authorizedRoute({role},method,path), role === 'customer_user' && ['GET','HEAD'].includes(method));
  }
 }
 for (const path of ['/v1/customer/portal/payment-instructions/other','/v1/customer/portal/payment-instructions-extra']) {
  assert.equal(routeAllowed('customer_user','GET',path),false);
 }
});
