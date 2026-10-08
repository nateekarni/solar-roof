import assert from 'node:assert/strict';
import test from 'node:test';
import { sqlCalendarPeriod } from './local-financial-policy.js';
test('Bangkok PostgreSQL DATE values use SQL calendar strings for billing boundaries',()=>{
 const row={period_start:new Date('2026-09-01T00:00:00+07:00'),period_end:new Date('2026-09-30T00:00:00+07:00'),starts:'2026-09-01',ends:'2026-09-30'};
 assert.deepEqual(sqlCalendarPeriod(row),{start:'2026-09-01',end:'2026-09-30'});
 assert.throws(()=>sqlCalendarPeriod({period_start:row.period_start,period_end:row.period_end}));
});
