import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { decodePayloadMessages, validateReceiveConfig } from './payload-receive.js';
const bundle = JSON.parse(readFileSync(new URL('./fixtures/payload-examples-v1.1.json', import.meta.url), 'utf8'));
test('gateway bundle extracts four telemetry envelopes and ignores ACK example', () => {
  const result = decodePayloadMessages(bundle, validateReceiveConfig({}));
  assert.equal(result.messages.length, 4); assert.equal(result.errors.length, 0);
  assert.equal(result.batch, true); assert.equal(result.ignored, 1);
});
test('configured source identities and profile references map only exact matches', () => {
  const config = validateReceiveConfig({ siteAlias: 'SITE-001', gatewayAlias: 'GW-001', deviceAliases: [{ source: 'METER-001', target: 'METER-TEST-001', profileAlias: { sourceId: 'schneider-pm2230', sourceVersion: '1.0.0', targetId: 'schneider-pm2230', targetVersion: '1.0.1' } }] });
  const result = decodePayloadMessages(bundle, config, { siteId: 'SITE-TEST-001', gatewayId: 'GW-TEST-001' });
  const energy = result.messages[1]!.envelope as any;
  assert.equal(energy.siteId, 'SITE-TEST-001'); assert.equal(energy.device.deviceId, 'METER-TEST-001'); assert.equal(energy.device.profileVersion, '1.0.1');
  assert.equal((bundle.payloads.pm2230Energy as any).device.deviceId, 'METER-001');
  assert.equal((result.messages[2]!.envelope as any).device.deviceId, 'SMARTLOGGER-001');
});
test('custom paths decode a vendor list and report bad siblings independently', () => {
  const config = validateReceiveConfig({ messagesPath: 'readings', fieldPaths: { messageType: 'kind', messageId: 'id', siteId: 'location', gatewayId: 'hub' } });
  const result = decodePayloadMessages({ readings: [{ kind: 'telemetry', id: 'x', location: 'S', hub: 'G' }, null] }, config);
  assert.equal(result.messages.length, 1); assert.equal(result.errors.length, 1);
  assert.equal((result.messages[0]!.envelope as any).messageId, 'x');
});
test('limits and unsafe paths cannot bypass decoder bounds', () => {
  assert.throws(() => validateReceiveConfig({ messagesPath: '__proto__.x' }));
  assert.throws(() => validateReceiveConfig({ fieldPaths: { arbitrary: 'x' } }));
  assert.throws(() => decodePayloadMessages({ payloads: Array.from({ length: 33 }, () => bundle.payloads.pm2230Energy) }, validateReceiveConfig({})), /32/);
});
test('object path mapping does not mutate original vendor payload during identity aliasing', () => {
  const input={messageType:'telemetry',hardware:{deviceId:'SOURCE',deviceType:'energy-meter'}};
  const config=validateReceiveConfig({fieldPaths:{device:'hardware'},deviceAliases:[{source:'SOURCE',target:'TARGET'}]});
  const result=decodePayloadMessages(input,config);
  assert.equal(input.hardware.deviceId,'SOURCE');
  assert.equal((result.messages[0]!.original.hardware as any).deviceId,'SOURCE');
  assert.equal((result.messages[0]!.envelope.device as any).deviceId,'TARGET');
});
