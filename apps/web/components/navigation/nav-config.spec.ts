import assert from 'node:assert/strict';
import test from 'node:test';
import {getNavItems, getBottomNavItems} from './nav-config';
const paths = (role: string) => getNavItems(role).flatMap(item => [item.href, ...(item.subItems?.map(sub => sub.href) ?? [])]).filter(Boolean);
test('Owner destinations omit equipment and user management', () => {
  assert.equal(paths('owner').includes('/sites'), false);
  assert.equal(paths('owner').includes('/settings/users'), false);
  for (const path of ['/','/contracts','/billing','/receipts','/settings/company','/settings/account']) assert.ok(paths('owner').includes(path));
});
test('School has production and personal preferences without configuration', () => {
  for (const path of ['/production','/contracts','/billing','/receipts','/settings/account','/settings/general','/settings/security']) assert.ok(paths('school_user').includes(path));
  assert.equal(paths('school_user').includes('/settings/company'), false);
  assert.ok(getBottomNavItems('school_user').some(item => item.href === '/production'));
});
test('Unknown roles get no navigation and Admin retains technical destinations', () => {
  assert.deepEqual(getNavItems('unknown'), []);
  assert.ok(paths('admin').includes('/sites'));
  assert.ok(paths('admin').includes('/settings/users'));
});
