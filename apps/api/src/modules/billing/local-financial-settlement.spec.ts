import assert from 'node:assert/strict';
import test from 'node:test';
import { requireTestSettlement } from './local-financial-policy.js';
test('multiple actual transfers require exact whole-satang settlement',()=>{
 assert.doesNotThrow(()=>requireTestSettlement(['2000.00','2623.45'],'4623.45'));
 for(const amounts of [['4623.44'],['4623.46'],['0'],['4623.4501']])assert.throws(()=>requireTestSettlement(amounts,'4623.45'));
});
