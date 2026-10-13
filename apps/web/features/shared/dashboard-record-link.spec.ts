import test from 'node:test';
import assert from 'node:assert/strict';
import * as subject from './dashboard-record-link';
test('dashboard document links preserve only the allowed dashboard scope',()=>{
 assert.equal(typeof subject.dashboardRecordHref,'function');
 const link=subject.dashboardRecordHref('bill/one',{siteId:'site-a',start:'2026-09-01',end:'2026-09-30'});
 const url=new URL(link,'https://local.test');assert.equal(url.pathname,'/records/billing/bill%2Fone');
 assert.equal(subject.dashboardReturnHref(url.searchParams.get('dashboard')), '/?start_date=2026-09-01&end_date=2026-09-30&site_id=site-a');
});
test('invalid dashboard origins cannot create external or arbitrary navigation',()=>{
 assert.equal(typeof subject.dashboardReturnHref,'function');
 for(const input of [null,'https://evil.test','//evil.test','next=https://evil.test','start_date=bad&end_date=2026-09-30','start_date=2026-09-30&end_date=2026-09-01'])assert.equal(subject.dashboardReturnHref(input),null);
 assert.equal(subject.dashboardReturnHref('start_date=2026-09-01&end_date=2026-09-30&redirect=https://evil.test'),'/?start_date=2026-09-01&end_date=2026-09-30');
});
