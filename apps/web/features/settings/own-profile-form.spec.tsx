import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {OwnProfileForm} from './own-profile-form';
import {authStore} from '../../stores/auth-store';

const user = {
  id: 'test-user-1',
  email: 'somchai@example.com',
  displayName: 'สมชาย สุขใจ',
  companyPosition: 'กรรมการผู้จัดการ',
  role: 'owner' as const,
};

test('renders display name and position inputs with user initial values', () => {
  const html = renderToStaticMarkup(<OwnProfileForm user={user} />);
  assert.match(html, /id="own-display-name"/);
  assert.match(html, /value="สมชาย สุขใจ"/);
  assert.match(html, /id="own-company-position"/);
  assert.match(html, /value="กรรมการผู้จัดการ"/);
  assert.match(html, /ตำแหน่ง/);
  assert.match(html, /ชื่อที่แสดง/);
});

test('renders placeholder for unassigned position', () => {
  const html = renderToStaticMarkup(<OwnProfileForm user={{...user, companyPosition: null}} />);
  assert.match(html, /id="own-company-position"/);
  assert.match(html, /placeholder="ระบุตำแหน่งในบริษัท เช่น กรรมการผู้จัดการ"/);
});
