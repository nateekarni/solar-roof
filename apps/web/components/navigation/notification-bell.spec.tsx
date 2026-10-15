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

test('normalizes financial notification wording and renders bold site name alongside right-aligned timestamp',()=>{
 const paidRow:NotificationFeedItem={id:'payment:1',title:'ตรวจสอบการชำระเงินแล้ว',detail:'paid',siteName:'ศูนย์กระจายสินค้า ลาดกระบัง',destination:'/records/billing/1',createdAt:'2026-10-14T06:35:00.000Z',readAt:null,kind:'workflow'};
 const paidHtml=renderToStaticMarkup(<NotificationFeedRow row={paidRow} th={true} onRead={()=>{}}/>);
 assert.ok(paidHtml.includes('ยืนยันการชำระเงินแล้ว'));
 assert.ok(paidHtml.includes('บันทึกการชำระเงินเรียบร้อยแล้ว'));
 assert.match(paidHtml,/<strong class="font-semibold text-foreground">ศูนย์กระจายสินค้า ลาดกระบัง<\/strong>/);
 assert.match(paidHtml,/<time dateTime="2026-10-14T06:35:00.000Z" class="text-xs text-muted-foreground whitespace-nowrap">/);
 assert.ok(paidHtml.includes('ยังไม่อ่าน'));

 const rejectedRow:NotificationFeedItem={id:'payment:2',title:'ตรวจสอบการชำระเงินแล้ว',detail:'ปฏิเสธหลักฐาน / Evidence rejected: Synthetic unreadable evidence scenario',siteName:'คลังสินค้า คลองหลวง',destination:'/records/billing/2',createdAt:'2026-10-14T06:35:00.000Z',readAt:null,kind:'workflow'};
 const rejectedHtml=renderToStaticMarkup(<NotificationFeedRow row={rejectedRow} th={true} onRead={()=>{}}/>);
 assert.ok(rejectedHtml.includes('ปฏิเสธหลักฐานการชำระเงิน'));
 assert.ok(rejectedHtml.includes('Synthetic unreadable evidence scenario'));
 assert.doesNotMatch(rejectedHtml,/Evidence rejected:/);
 assert.match(rejectedHtml,/<strong class="font-semibold text-foreground">คลังสินค้า คลองหลวง<\/strong>/);

 const receiptRow:NotificationFeedItem={id:'doc:1',title:'ออกใบเสร็จแล้ว',detail:'RCP261000002',siteName:'โรงงานบรรจุภัณฑ์ บางพลี',destination:'/records/receipts/1',createdAt:'2026-10-14T06:35:00.000Z',readAt:'2026-10-14T07:00:00.000Z',kind:'workflow'};
 const receiptHtml=renderToStaticMarkup(<NotificationFeedRow row={receiptRow} th={true} onRead={()=>{}}/>);
 assert.ok(receiptHtml.includes('ออกใบเสร็จรับเงินแล้ว'));
 assert.ok(receiptHtml.includes('RCP261000002'));
 assert.match(receiptHtml,/<strong class="font-semibold text-foreground">โรงงานบรรจุภัณฑ์ บางพลี<\/strong>/);

 const invoiceRow:NotificationFeedItem={id:'doc:2',title:'ออกใบแจ้งหนี้แล้ว',detail:'INV261000030',siteName:'ศูนย์บริการ ศรีราชา',destination:'/records/documents/2',createdAt:'2026-10-14T06:35:00.000Z',readAt:null,kind:'workflow'};
 const invoiceHtml=renderToStaticMarkup(<NotificationFeedRow row={invoiceRow} th={true} onRead={()=>{}}/>);
 assert.ok(invoiceHtml.includes('ออกใบวางบิลแล้ว'));
 assert.ok(invoiceHtml.includes('INV261000030'));
 assert.match(invoiceHtml,/<strong class="font-semibold text-foreground">ศูนย์บริการ ศรีราชา<\/strong>/);

 const reminderRow:NotificationFeedItem={id:'workflow:remind',title:'แจ้งเตือนชำระเงิน / Payment reminder',detail:'ครบกำหนด / Due: 2026-11-13',siteName:'โรงงานอาหาร ปลวกแดง',destination:'/records/billing/3',createdAt:'2026-10-14T06:35:00.000Z',readAt:null,kind:'workflow'};
 const reminderHtml=renderToStaticMarkup(<NotificationFeedRow row={reminderRow} th={true} onRead={()=>{}}/>);
 assert.ok(reminderHtml.includes('แจ้งเตือนครบกำหนดชำระเงิน'));
 assert.ok(reminderHtml.includes('ครบกำหนดชำระวันที่ 13 พ.ย. 2569'));
 assert.match(reminderHtml,/<strong class="font-semibold text-foreground">โรงงานอาหาร ปลวกแดง<\/strong>/);
});
