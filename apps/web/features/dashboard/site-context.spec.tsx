import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {SiteContext} from './site-context';
test('selected site context names the school and gateway without offering all sites',()=>{
 const html=renderToStaticMarkup(<SiteContext locale="th" sites={[{id:'school',name:'โรงเรียนบ้านสวน',customerName:'โรงเรียนบ้านสวน',status:'online',capacityMwp:0.3,latitude:null,longitude:null,productionKwh:null,gatewayName:'เกตเวย์อาคารเรียน'}]} siteId="school"/>);
 assert.match(html,/โรงเรียนบ้านสวน/);assert.match(html,/เกตเวย์อาคารเรียน/);assert.doesNotMatch(html,/ทุกไซต์/);
});
