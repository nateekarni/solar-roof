import test from 'node:test';
import assert from 'node:assert/strict';
import { formatFlexibleDecimal } from './number-format';

test('formatFlexibleDecimal handles whole numbers and trailing zeros as integers for general numbers', () => {
  assert.equal(formatFlexibleDecimal('65.00000000'), '65');
  assert.equal(formatFlexibleDecimal('65.00'), '65');
  assert.equal(formatFlexibleDecimal('65.0'), '65');
  assert.equal(formatFlexibleDecimal(65), '65');
  assert.equal(formatFlexibleDecimal('1000.000000'), '1000');
  assert.equal(formatFlexibleDecimal('1000.000000', { useGrouping: true }), '1,000');
});

test('formatFlexibleDecimal preserves higher precision when explicitly entered', () => {
  assert.equal(formatFlexibleDecimal('65.1234'), '65.1234');
  assert.equal(formatFlexibleDecimal('0.0025'), '0.0025');
  assert.equal(formatFlexibleDecimal('1234.56789'), '1234.56789');
  assert.equal(formatFlexibleDecimal('1234.56789', { useGrouping: true }), '1,234.56789');
  assert.equal(formatFlexibleDecimal('65.50000000'), '65.5');
  assert.equal(formatFlexibleDecimal('65.25'), '65.25');
});

test('formatFlexibleDecimal strictly formats currency and rates to 2 decimals', () => {
  assert.equal(formatFlexibleDecimal(65, { isCurrencyOrRate: true }), '65.00');
  assert.equal(formatFlexibleDecimal('65.00000000', { isCurrencyOrRate: true }), '65.00');
  assert.equal(formatFlexibleDecimal('65.5', { isCurrencyOrRate: true }), '65.50');
  assert.equal(formatFlexibleDecimal('1250', { isCurrencyOrRate: true }), '1,250.00');
  assert.equal(formatFlexibleDecimal('4.5', { isCurrencyOrRate: true }), '4.50');
});

test('formatFlexibleDecimal handles null, undefined, empty, and non-numeric inputs', () => {
  assert.equal(formatFlexibleDecimal(null), '');
  assert.equal(formatFlexibleDecimal(undefined), '');
  assert.equal(formatFlexibleDecimal(''), '');
  assert.equal(formatFlexibleDecimal('abc'), 'abc');
});
