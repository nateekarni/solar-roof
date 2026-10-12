import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonRanges, normalizedYield, comparableDelta, comparableSources} from './period-comparison';
test('equal completed-day comparison crosses year boundary',()=>{
 assert.deepEqual(comparisonRanges({start:'2026-01-01',end:'2026-01-31'},'2026-01-10'),{current:{start:'2026-01-01',end:'2026-01-09'},previous:{start:'2025-12-23',end:'2025-12-31'}});
});
test('rejects prior equal duration spanning four calendar months',()=>assert.equal(comparisonRanges({start:'2026-03-01',end:'2026-05-31'},'2026-06-01'),null));
test('future and today-only ranges have no completed comparison base',()=>assert.equal(comparisonRanges({start:'2026-01-10',end:'2026-01-31'},'2026-01-10'),null));
test('normalized yield converts MWp and excludes missing capacity',()=>{assert.equal(normalizedYield(1000,0.5),2);assert.equal(normalizedYield(0,0),null);assert.equal(normalizedYield(null,1),null);});
test('partial and zero bases suppress percentage',()=>{assert.equal(comparableDelta(5,0,true),null);assert.equal(comparableDelta(5,10,false),null);assert.equal(comparableDelta(5,10,true),-50);});
test('period percentages require identical known source identities for every site',()=>{
 const a=[{id:'a',sourceFingerprint:'logger-1'},{id:'b',sourceFingerprint:'logger-2'}];
 assert.equal(comparableSources(a,[...a].reverse()),true);
 assert.equal(comparableSources(a,[{id:'a',sourceFingerprint:'logger-3'},a[1]!]),false);
 assert.equal(comparableSources([{id:'a'}],[{id:'a'}]),false);
 assert.equal(comparableSources(a,[a[0]!]),false);
 assert.equal(comparableSources([],[]),false);
});
