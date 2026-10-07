import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {SolarPowerDiagramView} from './solar-power-diagram-view';
import {GatewayStatusSummary} from './gateway-status-summary';
import {dashboardSiteHref,dashboardScopeMatches} from './site-selection';
import {ChartTooltipContent,chartTooltipBounds} from './chart-tooltip';
test('site URL selection and reset preserve dates while stale scopes stay hidden',()=>{
 const search='start_date=2026-10-01&end_date=2026-10-07&site_id=A';
 const selected=new URL(dashboardSiteHref(search,'B'),'http://local');assert.equal(selected.searchParams.get('site_id'),'B');assert.equal(selected.searchParams.get('start_date'),'2026-10-01');
 const reset=new URL(dashboardSiteHref(search,''),'http://local');assert.equal(reset.searchParams.has('site_id'),false);assert.equal(reset.searchParams.get('end_date'),'2026-10-07');
 assert.equal(dashboardScopeMatches('B','A'),false);assert.equal(dashboardScopeMatches('B',undefined),false);assert.equal(dashboardScopeMatches('B','B'),true);assert.equal(dashboardScopeMatches('',undefined),true);
});
test('chart tooltips share semantic surface, Thai date, units, wrapping and safe chart bounds',()=>{
 const html=renderToStaticMarkup(<ChartTooltipContent active label="2026-10-07" payload={[{value:1200,name:'Revenue'}]} locale="th" unit="บาท" dateLabel/>);
 assert.match(html,/bg-popover/);assert.match(html,/text-popover-foreground/);assert.match(html,/border-border/);assert.match(html,/overflow-wrap:anywhere/);assert.match(html,/1,200/);assert.match(html,/บาท/);assert.doesNotMatch(html,/2026-10-07/);assert.deepEqual(chartTooltipBounds.allowEscapeViewBox,{x:false,y:false});
 const absent=renderToStaticMarkup(<ChartTooltipContent active payload={[{value:null}]} locale="en" unit="kWh"/>);assert.equal(absent,'');
});
test('unknown topology keeps unavailable node values without direction sentence',()=>{
 const html=renderToStaticMarkup(<SolarPowerDiagramView locale="en" measurements={{generationKw:0,buildingLoadKw:null,solarToBuildingKw:null,gridImportKw:null,gridExportKw:null}}/>);
 assert.doesNotMatch(html,/Power flow direction is unavailable/);assert.match(html,/No measurements available/);assert.doesNotMatch(html,/aria-label="Grid import"|aria-label="Solar to building"/);
});
test('Gateway summary describes representative fresh sites and names exception gateways',()=>{
 const sites=[{id:'a',name:'A',gatewayId:'ga',gatewayName:'Gateway A',lastUpdated:new Date().toISOString()},{id:'b',name:'B',gatewayId:'gb',gatewayName:'Gateway B',lastUpdated:null},{id:'c',name:'C',gatewayId:null,lastUpdated:null}];
 const html=renderToStaticMarkup(<GatewayStatusSummary sites={sites as any} locale="en"/>);
 assert.match(html,/1 of 2 configured sites/);assert.match(html,/Gateway B/);assert.match(html,/One representative gateway per site/);assert.match(html,/50%/);
});
