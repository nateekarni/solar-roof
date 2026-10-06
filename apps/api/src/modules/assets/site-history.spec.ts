import assert from 'node:assert/strict';
import test from 'node:test';
import { siteHistoryFilter } from './site-history.js';
test('history binds site, search and inclusive Bangkok calendar dates',()=>{
 const filter=siteHistoryFilter('site',{search:'voltage',start:'2026-10-01',end:'2026-10-06',page:'2'});
 assert.deepEqual(filter.values,['site','%voltage%','2026-10-01T00:00:00+07:00','2026-10-06T00:00:00+07:00']);
 assert.equal(filter.offset,50);assert.match(filter.where,/site_id=\$1/);assert.match(filter.where,/interval '1 day'/);
});
test('history rejects invalid dates and inverted date ranges',()=>{
 assert.throws(()=>siteHistoryFilter('site',{start:'2026-02-30'}));
 assert.throws(()=>siteHistoryFilter('site',{start:'2026-10-06',end:'2026-10-01'}));
});
