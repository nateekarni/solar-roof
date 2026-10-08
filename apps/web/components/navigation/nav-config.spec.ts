import assert from 'node:assert/strict';
import test from 'node:test';
import {getNavItems, getBottomNavItems} from './nav-config';
const paths = (role: string) => getNavItems(role).flatMap(item => [item.href, ...(item.subItems?.map(sub => sub.href) ?? [])]).filter(Boolean);
test('Owner destinations omit equipment and user management', () => {
  assert.equal(paths('owner').includes('/sites'), false);
  assert.equal(paths('owner').includes('/settings/users'), false);
  for (const path of ['/','/contracts','/billing','/receipts','/settings/company','/settings/account']) assert.ok(paths('owner').includes(path));
});
test('School has scoped documents and account destinations without configuration', () => {
  assert.deepEqual(getNavItems('school_user').map(item => item.href), ['/', '/contracts', '/settings']); assert.deepEqual(getBottomNavItems('school_user').map(item => item.href), ['/', '/contracts', '/settings']);
  assert.equal(paths('school_user').includes('/settings/company'), false);
  assert.equal(getBottomNavItems('school_user').some(item => item.href === '/production'),false);
});
test('Unknown roles get no navigation and Admin retains technical destinations', () => {
  assert.deepEqual(getNavItems('unknown'), []);
  assert.ok(paths('admin').includes('/sites'));
  assert.ok(paths('admin').includes('/settings/users'));
});

test('retired production and display routes never appear in any role navigation',()=>{for(const role of ['admin','owner','operator','accountant','school_user']){assert.equal(paths(role).includes('/production'),false);assert.equal(paths(role).includes('/settings/general'),false);}});
