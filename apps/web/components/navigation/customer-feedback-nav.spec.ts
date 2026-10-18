import test from 'node:test';import assert from 'node:assert/strict';
import {getNavItems,getBottomNavItems} from './nav-config';
const hrefs=(role:string)=>getNavItems(role).flatMap(item=>[item.href,...(item.subItems?.map(sub=>sub.href)??[])]).filter(Boolean);
test('customer has unified billing documents route without separate receipts or contract navigation',()=>{assert.ok(hrefs('customer_user').includes('/billing'));assert.ok(!hrefs('customer_user').includes('/receipts'));assert.ok(!hrefs('customer_user').includes('/contracts'));});
test('admin gateway navigation excludes business registers and finance while owner can reach sites',()=>{assert.ok(!hrefs('admin').includes('/customers'));assert.ok(!hrefs('admin').includes('/sites'));assert.ok(hrefs('admin').includes('/gateways'));assert.ok(!hrefs('admin').includes('/billing'));assert.ok(hrefs('owner').includes('/sites'));assert.ok(!getBottomNavItems('customer_user').some(item=>item.href==='/contracts'));});
