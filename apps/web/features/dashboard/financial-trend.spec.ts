import test from 'node:test';
import assert from 'node:assert/strict';
import {financialTrend} from './financial-trend';
test('bills and receipts on different dates retain both monetary series',()=>{
 assert.deepEqual(financialTrend([{date:'2026-10-01',value:150}],[{date:'2026-10-07',value:100}]),[
  {date:'2026-10-01',billed:150,received:0},
  {date:'2026-10-07',billed:0,received:100},
 ]);
});
test('cash-only period still displays all receipts in chronological order',()=>{
 assert.deepEqual(financialTrend([],[{date:'2026-10-07',value:50},{date:'2026-10-03',value:100}]),[
  {date:'2026-10-03',billed:0,received:100},
  {date:'2026-10-07',billed:0,received:50},
 ]);
});
test('absent series and explicit null are unavailable, not measured zero',()=>{
 assert.deepEqual(financialTrend([{date:'2026-10-01',value:null}],undefined),[{date:'2026-10-01',billed:null,received:null}]);
});
