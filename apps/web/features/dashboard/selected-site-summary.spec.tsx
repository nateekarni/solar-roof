import React from 'react';import test from 'node:test';import assert from 'node:assert/strict';import {renderToStaticMarkup} from 'react-dom/server';
import {SelectedSiteSummary} from './selected-site-summary';
import type {DashboardSiteContext} from '@solar/api-contracts';
const site={id:'s',name:'Site A',customerName:'Customer A',status:'offline',capacityMwp:0.05,latitude:null,longitude:null,productionKwh:null};
const detail:DashboardSiteContext={id:'s',name:'Site A',code:'SITE-1',customerName:'Customer A',status:'active',capacityMwp:'0.05',region:'North',gateway:{id:'g',name:'Gateway A',code:'GW-1',protocol:'mqtt',topic:'solar/GW-1',lastSeenAt:null,interval:60,brokerName:'Broker A',configurationState:'applied'},devices:[{id:'d',name:'Meter A',model:'M-1',code:'D-1',profileVersion:'2',interval:60,lastReceivedAt:null,lastMeasuredAt:null,billingSource:true}],business:{serviceStartDate:'2026-01-01',paymentTermDays:30,taxRate:'7',remindersEnabled:true,reminderStartDays:1,reminderIntervalDays:3,rate:'3.5',rateFrom:'2026-01-01'}};
test('selected site summary includes configured inventory, source and business settings',()=>{
 const html=renderToStaticMarkup(<SelectedSiteSummary site={site} detail={detail} locale="en" showTechnical/>);
 for(const text of ['Site A','Gateway A','Meter A','M-1','D-1','Broker A','solar/GW-1','3.5','Billing source'])assert.ok(html.includes(text),text);
 assert.match(html,/No recent data/);assert.match(html,/Applied/);
});
test('business-only summary does not render technical fields even with a richer DTO',()=>{
 const html=renderToStaticMarkup(<SelectedSiteSummary site={site} detail={detail} locale="en" showTechnical={false}/>);
 assert.match(html,/3.5/);assert.doesNotMatch(html,/Gateway A|Meter A|solar\/GW-1/);
});
