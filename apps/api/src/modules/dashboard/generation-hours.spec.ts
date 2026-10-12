import assert from 'node:assert/strict';
import test from 'node:test';
import { generationHours } from './generation-energy.js';
test('hourly counter differences retain gaps, resets and at most 24 day buckets',()=>{
 const start=Date.parse('2026-09-01T00:00:00+07:00');
 const samples=[0,1,2,4,5].map(hour=>({site_id:'a',device_id:'a',polled_at:new Date(start+hour*3600000).toISOString(),value:String((hour===5?0:hour)*1000)}));
 const rows=generationHours('a','2026-09-01',samples,start+86400000);
 assert.equal(rows.length,24);assert.equal(rows[0]?.value,1);assert.equal(rows[2]?.value,null);assert.equal(rows[4]?.quality,'reset');assert.equal(rows[5]?.value,null);
});
