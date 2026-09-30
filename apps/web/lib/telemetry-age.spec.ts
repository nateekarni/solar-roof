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
