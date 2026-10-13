import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {NotificationBell,NotificationFeedRow} from './notification-bell';
import type {NotificationFeedItem} from './notification-feed-state';
import {SessionUserProvider} from '../../providers/session-user-provider';
import {LocaleProvider} from '../../providers/locale-provider';
import type {AuthUser} from '../../stores/auth-store';

for(const role of ['owner','admin','operator','accountant','customer_user'] satisfies AuthUser['role'][]) {
 test(`${role} receives the notification trigger even without access to technical alerts`,()=>{
  const user:AuthUser={id:role,email:role+'@example.test',displayName:role,role};
  const html=renderToStaticMarkup(<SessionUserProvider user={user}><LocaleProvider initialLocale="th"><NotificationBell/></LocaleProvider></SessionUserProvider>);
  assert.match(html,/aria-label="การแจ้งเตือน"/);
  assert.doesNotMatch(html,/href="\/alerts"/);
 });
}

for(const [th,title,detail] of [[false,'Complete finance setup','2 Owner setup items remaining'],[true,'ตั้งค่าการเงินให้ครบ','เหลือรายการที่ Owner ต้องดำเนินการ 2 รายการ']] as const){
 test(`finance workflow renders localized ${th?'Thai':'English'} count and Company Settings action`,()=>{
  const row:NotificationFeedItem={id:'workflow:finance-readiness:aaaaaaaaaaaaaaaaaaaaaaaa',title:'Server title',detail:'Server detail',destination:'/settings/company',createdAt:'2026-10-13T00:00:00.000Z',readAt:null,kind:'workflow',metadata:{type:'finance-readiness',missingCount:2}};
  const html=renderToStaticMarkup(<NotificationFeedRow row={row} th={th} onRead={()=>{}}/>);
  assert.match(html,/href="\/settings\/company"/);
  assert.ok(html.includes(title));assert.ok(html.includes(detail));
  assert.ok(html.includes(th?'ยังไม่อ่าน':'Unread'));
  assert.doesNotMatch(html,/Server title|Server detail/);
 });
}
test('read finance items retain the action without an unread indicator and ordinary rows retain their copy',()=>{
 const row:NotificationFeedItem={id:'workflow:finance-readiness:aaaaaaaaaaaaaaaaaaaaaaaa',title:'Setup',detail:'Pending',destination:'/settings/company',createdAt:'2026-10-13T00:00:00.000Z',readAt:'2026-10-13T01:00:00.000Z',kind:'workflow',metadata:{type:'finance-readiness',missingCount:1}};
 const html=renderToStaticMarkup(<NotificationFeedRow row={row} th={false} onRead={()=>{}}/>);
 assert.match(html,/href="\/settings\/company"/);assert.doesNotMatch(html,/Unread/);
 const activity=renderToStaticMarkup(<NotificationFeedRow row={{...row,id:'document:invoice',metadata:undefined,title:'Invoice issued',detail:'INV-123',destination:'/records/documents/invoice'}} th={false} onRead={()=>{}}/>);
 assert.ok(activity.includes('Invoice issued'));assert.ok(activity.includes('INV-123'));
});

test('opening a previously read workflow still closes the bell without writing another read',()=>{
 const row:NotificationFeedItem={id:'workflow:read',title:'Read workflow',detail:'Complete',destination:'/settings/company',createdAt:'2026-10-13T00:00:00.000Z',readAt:'2026-10-13T01:00:00.000Z',kind:'workflow'};
 let reads=0,navigations=0;
 const link=NotificationFeedRow({row,th:false,onRead:()=>{reads++;},onNavigate:()=>{navigations++;}}).props.children;
 link.props.onClick();assert.equal(reads,0);assert.equal(navigations,1);
 const unread=NotificationFeedRow({row:{...row,readAt:null},th:false,onRead:id=>{assert.equal(id,'workflow:read');reads++;},onNavigate:()=>{navigations++;}}).props.children;
 unread.props.onClick();assert.equal(reads,1);assert.equal(navigations,2);
});
