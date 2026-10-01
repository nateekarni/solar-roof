import assert from 'node:assert/strict';
import test from 'node:test';
import {formatAppDateTime} from './date-format';
test('timestamps show the same explicit Bangkok business time regardless of server/browser timezone',()=>{
 const original=process.env.TZ;
 try {
  for(const timezone of ['UTC','Asia/Bangkok']) {
   process.env.TZ=timezone;
   assert.equal(formatAppDateTime('2026-09-30T20:30:00Z','en'),'1 October 2026 03:30 (Asia/Bangkok)');
   assert.equal(formatAppDateTime('2026-09-30T20:30:00Z','th'),'1 ตุลาคม 2569 03:30 (Asia/Bangkok)');
  }
 } finally {if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
});
