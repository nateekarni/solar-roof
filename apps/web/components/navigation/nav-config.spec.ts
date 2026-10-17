import assert from 'node:assert/strict';
import test from 'node:test';
import {getNavItems, getBottomNavItems, navLabel} from './nav-config';
const paths = (role: string) => getNavItems(role).flatMap(item => [item.href, ...(item.subItems?.map(sub => sub.href) ?? [])]).filter(Boolean);
test('Owner destinations include business staff management and omit a separate customer menu', () => {
  assert.equal(paths('owner').includes('/sites'), true);
  assert.equal(paths('owner').includes('/settings/users'), true);
  assert.equal(paths('owner').includes('/customers'), false);
  for (const path of ['/','/sites','/billing','/receipts','/settings/company','/settings/account','/settings/rates']) assert.ok(paths('owner').includes(path));
});
test('Customer has scoped documents and account destinations without configuration', () => {
  assert.deepEqual(getNavItems('customer_user').map(item => item.href), ['/', '/billing', '/receipts', '/settings']); assert.deepEqual(getBottomNavItems('customer_user').map(item => item.href), ['/', '/billing', '/receipts', '/settings']);
  assert.equal(paths('customer_user').includes('/settings/company'), false);
  assert.equal(getBottomNavItems('customer_user').some(item => item.href === '/production'),false);
});
test('Customer navigation labels the settings route as ข้อมูลองค์กรและบัญชี / Organization & Account', () => {
  const items = getNavItems('customer_user');
  const settingsItem = items.find(item => item.href === '/settings');
  assert.ok(settingsItem);
  assert.equal(navLabel(settingsItem, 'th', (k) => k), 'ข้อมูลองค์กรและบัญชี');
  assert.equal(navLabel(settingsItem, 'en', (k) => k), 'Organization & Account');
});
test('Unknown roles get no navigation and Admin retains technical destinations', () => {
  assert.deepEqual(getNavItems('unknown'), []);
  assert.equal(paths('admin').includes('/sites'), false);
  assert.ok(paths('admin').includes('/settings/users'));
});

test('retired production and display routes never appear in any role navigation',()=>{for(const role of ['admin','owner','operator','accountant','customer_user']){assert.equal(paths(role).includes('/production'),false);assert.equal(paths(role).includes('/settings/general'),false);}});

test('rates accessible only to Owner and Accountant',()=>{for(const role of ['owner','accountant'])assert.ok(paths(role).includes('/settings/rates'));for(const role of ['admin','operator','customer_user'])assert.equal(paths(role).includes('/settings/rates'),false);});
