import assert from 'node:assert/strict';import test from 'node:test';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {GatewayIndex} from './gateway-index';
test('gateway index exposes registered gateway and lifecycle without customer billing identity',()=>{
const html=renderToStaticMarkup(<GatewayIndex rows={[{id:'gw',siteId:'site',siteName:'Roof A',siteCode:'S1',name:'Gateway A',externalGatewayId:'G1',status:'offline',desiredVersion:3,publishedVersion:2,acknowledgedVersion:1,appliedVersion:1}]} locale="en" onSelect={()=>{}}/>);
for(const label of ['Gateway A','Roof A','G1','Devices','Production power','Last received','Gateway actions: Gateway A'])assert.ok(html.includes(label),label);
assert.doesNotMatch(html,/Pending application|Configuration|Not published/);
assert.doesNotMatch(html,/Customer|Tax|Invoice/);
assert.doesNotMatch(html,/All sites|aria-label="Site"/);
assert.doesNotMatch(html,/No data/);
});
