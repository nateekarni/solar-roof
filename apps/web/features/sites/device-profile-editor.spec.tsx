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
test('preset field table exposes the complete physical decoder beside variable and unit details',()=>{
 const physical={...field,sourceUnit:'kWh',targetUnit:'kWh',conversion:'identity' as const,registerAddress:'R0',registerCount:2,dataType:'uint32' as const,byteOrder:'big_endian' as const,wordOrder:'little_word_first' as const,scale:0.1,offset:0};
 const html=renderToStaticMarkup(<DeviceFieldsTable fields={[physical]} locale="en" onChange={()=>{}}/>);
 for(const value of ['Decoder','R0','uint32 × 2','big_endian','little_word_first','Scale 0.1','Offset 0','kWh'])assert.match(html,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});
