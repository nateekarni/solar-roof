import test from 'node:test';
import assert from 'node:assert/strict';
import {listPeriodPreset,monthPeriod,validListPeriod} from './list-period-model';
test('month ranges include leap day and normalize reverse month selection',()=>{
 assert.deepEqual(monthPeriod(2024,2,1),{from:'2024-02-01',to:'2024-03-31'});
});
test('last seven days crosses year boundary without UTC shifting',()=>{
 assert.deepEqual(listPeriodPreset('last7',new Date(2026,0,3)),{from:'2025-12-28',to:'2026-01-03'});
});
test('period rejects invalid and reversed calendar dates',()=>{
 assert.equal(validListPeriod({from:'2026-02-30',to:'2026-03-01'}),false);
 assert.equal(validListPeriod({from:'2026-10-09',to:'2026-10-01'}),false);
 assert.equal(validListPeriod({from:'2026-10-09',to:'2026-10-09'}),true);
});
