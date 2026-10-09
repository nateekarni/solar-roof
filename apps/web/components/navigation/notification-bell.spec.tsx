import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {NotificationBell} from './notification-bell';
import {SessionUserProvider} from '../../providers/session-user-provider';
import {LocaleProvider} from '../../providers/locale-provider';
import type {AuthUser} from '../../stores/auth-store';

for(const role of ['owner','admin','operator','accountant','school_user'] satisfies AuthUser['role'][]) {
 test(`${role} receives the notification trigger even without access to technical alerts`,()=>{
  const user:AuthUser={id:role,email:role+'@example.test',displayName:role,role};
  const html=renderToStaticMarkup(<SessionUserProvider user={user}><LocaleProvider initialLocale="th"><NotificationBell/></LocaleProvider></SessionUserProvider>);
  assert.match(html,/aria-label="การแจ้งเตือน"/);
  assert.doesNotMatch(html,/href="\/alerts"/);
 });
}
