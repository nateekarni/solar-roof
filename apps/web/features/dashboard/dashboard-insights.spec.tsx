import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {FinancialInsights} from './financial-insights';
import {MaintenanceInsights} from './maintenance-insights';
test('financial work queue keeps overdue status visible while explaining pending verification and paused reminders',()=>{
 const html=renderToStaticMarkup(<FinancialInsights locale="th" data={{asOf:'2026-10-09',cashReceived:'40.00',cohortBilled:'100.00',cohortCollected:'40.00',cohortOutstanding:'60.00',outstanding:'60.00',overdue:'60.00',awaitingPayment:'0.00',settledCount:0,pendingReviewCount:1,aging:[],workQueue:[{id:'bill',siteId:'site',siteName:'โรงเรียนบ้านสวน',invoiceNumber:'INV261000001',dueDate:'2026-10-01',daysOverdue:8,remaining:'60.00',pendingReview:1}]}}/>);
 assert.match(html,/ยอดเกินกำหนด/);assert.match(html,/รอตรวจหลักฐาน · หยุดทวงชั่วคราว/);assert.match(html,/\/records\/billing\/bill/);assert.match(html,/60\.00/);assert.doesNotMatch(html,/Awaiting|Overdue|Pending/);
});
test('maintenance links to gateway management and uses device cadence instead of business document data',()=>{const html=renderToStaticMarkup(<MaintenanceInsights locale="th" data={{gateways:1,staleGateways:1,devices:2,staleDevices:1,pendingConfigurations:1,rejectedMessages:3,comparisonWarnings:0,attention:[{gatewayId:'gw',gatewayName:'เกตเวย์อาคารเรียน',siteName:'โรงเรียนบ้านสวน',lastSeenAt:null,pendingConfiguration:true,staleDevices:1}]}}/>);assert.match(html,/href="\/gateways"/);assert.match(html,/ตามรอบรับของแต่ละอุปกรณ์/);assert.match(html,/รอปรับใช้/);assert.doesNotMatch(html,/\/sites|\/billing/);});
