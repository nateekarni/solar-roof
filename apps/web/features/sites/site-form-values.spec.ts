import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySiteValues, optionalNumber } from './site-form-values';
test('new site has no example values or hardware alert settings', () => {
  const values = emptySiteValues();
  assert.equal(values.capacityMwp, undefined);
  assert.equal(values.latitude, undefined);
  assert.equal(values.gatewayName, '');
  assert.equal(values.protocol, '');
  assert.equal(values.meterPresetId, '');
  assert.equal('alertSeverity' in values, false);
  assert.equal('pollingIntervalSeconds' in values, false);
});
test('blank optional coordinates remain absent and zero is preserved', () => {
  assert.equal(optionalNumber(''), undefined);
  assert.equal(optionalNumber('0'), 0);
  assert.equal(optionalNumber('13.5'), 13.5);
  assert.equal(optionalNumber(0.48), 0.48);
  assert.equal(optionalNumber(undefined), undefined);
});
