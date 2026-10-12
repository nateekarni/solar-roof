import test from 'node:test';
import assert from 'node:assert/strict';
import { telemetryAge } from './telemetry-age';
test('freshness ends after120 seconds and never treats absent/future timestamps as live',()=>{
 const now=Date.parse('2026-01-01T00:02:00Z');
 assert.equal(telemetryAge('2026-01-01T00:00:00Z','en',now).fresh,true);
 assert.equal(telemetryAge('2025-12-31T23:59:59Z','en',now).fresh,false);
 assert.equal(telemetryAge(null,'en',now).text,'No telemetry');
 assert.equal(telemetryAge('2026-01-01T00:03:00Z','en',now).fresh,false);
 assert.match(telemetryAge('2026-01-01T00:00:00Z','en',now).text,/2 minutes ago/);
});
test('relative receipt age uses seconds, minutes, hours and days at exact boundaries',()=>{
 const now=Date.parse('2026-01-10T00:00:00Z');
 for(const [seconds,text] of [[15,'15 seconds ago'],[60,'1 minute ago'],[3600,'1 hour ago'],[86400,'1 day ago']] as const){
  assert.equal(telemetryAge(new Date(now-seconds*1000),'en',now).text,text);
 }
});
