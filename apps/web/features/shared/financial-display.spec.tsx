import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {renderStatusBadge} from '../../lib/status-badge';
import {operationKeys} from './operation-columns';
import {operationFilters} from '@solar/api-contracts';
test('billing table excludes slip while retaining financial status',()=>{
 assert.ok(!operationKeys('billing',{}).includes('slipUrl'));
 assert.ok(operationKeys('billing',{}).includes('status'));
});
test('receipt lifecycle states have translated semantic badges and superseded filter',()=>{
 for(const [value,label,color] of [['issued','ออกแล้ว','success'],['finalized','ยืนยันแล้ว','success'],['superseded','ถูกแทนที่ด้วยฉบับใหม่','muted'],['cancelled','ยกเลิก','destructive']]){
  const html=renderToStaticMarkup(renderStatusBadge(value!,'th'));
  assert.ok(html.includes(label!),html);assert.ok(html.includes(color!),html);
 }
 assert.ok(operationFilters.receipts?.[0]?.options.some(option=>option.value==='superseded'));
});
