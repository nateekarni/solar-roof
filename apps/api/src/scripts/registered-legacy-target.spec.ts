import assert from 'node:assert/strict';
import test from 'node:test';
import { legacyTelemetryTopic } from './registered-legacy-target.js';

test('legacy examples publish within the registered gateway subscription, never a site UUID topic',()=>{
 assert.equal(legacyTelemetryTopic('energy/GW-REAL/#'),'energy/GW-REAL/telemetry');
 assert.equal(legacyTelemetryTopic('/GW-REAL/#'),'/GW-REAL/telemetry');
 assert.throws(()=>legacyTelemetryTopic('solar/v1/sites/SITE/gateways/GW/devices/+/telemetry'));
 assert.throws(()=>legacyTelemetryTopic('energy/+/telemetry'));
});
