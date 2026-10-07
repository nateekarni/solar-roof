import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

test('historical SQL and refresh use the same explicit Bangkok cumulative-energy baseline',()=>{
 const seed=readFileSync(new URL('./seed.mjs',import.meta.url),'utf8');
 const refresh=readFileSync(new URL('./refresh.mjs',import.meta.url),'utf8');
 const historical=[...seed.matchAll(/stamp-'([^']+)'::timestamptz/g)].map(match=>match[1]);
 const live=refresh.match(/stamp-new Date\('([^']+)'\)/)?.[1];
 assert.equal(historical.length,2);
 assert.ok(live);
 for(const baseline of historical){assert.match(baseline,/[+-]\d\d:\d\d$/);assert.equal(Date.parse(baseline),Date.parse(live));}
 assert.equal(Date.parse(live),Date.parse('2025-09-30T17:00:00Z'));
});
