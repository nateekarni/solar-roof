import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {DeviceFieldsTable} from './device-profile-editor';
import type {PayloadField} from './payload-contracts';
const field:PayloadField={tag:'energy.active.import.total',sourceTag:'meter.kwh',displayName:'Energy',pollGroup:'energy',sourceUnit:'Wh',targetUnit:'kWh',conversion:'wh-to-kwh',role:'billing-import'};
test('no configured fields renders an actionable empty state instead of an empty table',()=>{
 const html=renderToStaticMarkup(<DeviceFieldsTable fields={[]} locale="th"/>);
 assert.match(html,/ยังไม่มีฟิลด์/);
 assert.match(html,/เลือก Preset หรือเพิ่มฟิลด์ด้วยตัวเอง/);
 assert.doesNotMatch(html,/<table/);
});
test('visible table preserves field columns and marks only explicitly bound source',()=>{const html=renderToStaticMarkup(<DeviceFieldsTable fields={[field]} locale="en" onEdit={()=>{}}/>);for(const label of ['Field','Name','Group','Source unit','Target unit','Conversion','Role','Actions'])assert.ok(html.includes(label));assert.ok(html.includes('Edit field Energy'));assert.ok(!html.includes('Billing source'));const bound=renderToStaticMarkup(<DeviceFieldsTable fields={[field]} locale="th" billingSourceTag="meter.kwh"/>);assert.ok(bound.includes('แหล่งข้อมูลบิล'));});
