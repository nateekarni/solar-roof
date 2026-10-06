import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import type {DashboardSummaryResponse} from '@solar/api-contracts';
import {BusinessDashboard,BusinessProductionTrend} from './business-dashboard';
const data: DashboardSummaryResponse={range:{start:'2026-10-01',end:'2026-10-06'},availableSites:[{id:'s',name:'School A'}],sites:[{id:'s',name:'Site A',schoolName:'School A',latitude:null,longitude:null,status:'online',capacityMwp:1,productionKwh:null}],stats:{totalSites:1,onlineSites:1,installedMwp:1,currentMw:null,periodKwh:null,periodAmount:2500,billCount:1,paidBillCount:0},production:[],revenue:[],rankings:[],alerts:[{title:'Gateway failed',detail:'raw telemetry',severity:'critical',status:'offline',occurred_at:''}],collection:{total:1,paid:0,pending:1,paidPercent:0}};
test('owner home presents production, billed revenue and documents without operational content',()=>{
 const html=renderToStaticMarkup(<BusinessDashboard data={data} role="owner" locale="en"/>);
 assert.match(html,/Billed revenue/);assert.match(html,/2,500/);assert.match(html,/href="\/billing"/);assert.match(html,/href="\/contracts"/);assert.match(html,/href="\/receipts"/);assert.match(html,/Unavailable/);assert.doesNotMatch(html,/Gateway|telemetry|\/alerts|Power flow|Compare/);
});
test('school home identifies own school and charges with no company revenue or school selector',()=>{
 const html=renderToStaticMarkup(<BusinessDashboard data={data} role="school_user" locale="en"/>);
 assert.match(html,/School A/);assert.match(html,/Electricity charges/);assert.doesNotMatch(html,/revenue|Gateway|Compare|<select/);assert.match(html,/href="\/production"/);
});
test('missing financial records remain unavailable rather than zero revenue',()=>{
 const html=renderToStaticMarkup(<BusinessDashboard data={{...data,sites:[],stats:{...data.stats,periodAmount:0,billCount:0}}} role="school_user" locale="en"/>);
 assert.match(html,/School assignment unavailable/);assert.doesNotMatch(html,/>0 THB</);assert.match(html,/No billing records/);
});
test('unknown production samples cannot corrupt valid trend bars or imply measured zero',()=>{
 const points=JSON.parse('[{"date":"2026-10-01","value":null},{"date":"2026-10-02","value":50}]');
 points.push({date:"2026-10-03",value:Number.NaN});
 const html=renderToStaticMarkup(<BusinessProductionTrend points={points} locale="en"/>);
 assert.match(html,/Unavailable/);assert.match(html,/50 kWh/);assert.match(html,/width:100%/);assert.doesNotMatch(html,/NaN|>0 kWh/);
});
