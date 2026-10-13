import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalFinancialConfiguration, financialConfigurationHash } from './financial-configuration.js';

test('canonical financial configuration sorts object keys recursively', () => {
  assert.equal(
    canonicalFinancialConfiguration({ company: { taxId: '123', name: 'Issuer' }, banks: [{ name: 'Bank', id: 'a' }] }),
    '{"banks":[{"id":"a","name":"Bank"}],"company":{"name":"Issuer","taxId":"123"}}',
  );
});

test('canonical financial configuration sorts numeric object keys lexicographically', () => {
  assert.equal(canonicalFinancialConfiguration({ '2': 'second', '10': 'tenth', '1': 'first' }),
    '{"1":"first","10":"tenth","2":"second"}');
});

test('financial configuration hash is stable for object key order', () => {
  assert.equal(
    financialConfigurationHash({ company: { name: 'Issuer', taxId: '123' }, banks: [{ id: 'a' }] }),
    '04150de77d954ff981f96ff59b9327cb596ea13a6467a05ff09b8bb2cbdca616',
  );
  assert.equal(
    financialConfigurationHash({ company: { name: 'Issuer', taxId: '123' }, banks: [{ id: 'a' }] }),
    financialConfigurationHash({ banks: [{ id: 'a' }], company: { taxId: '123', name: 'Issuer' } }),
  );
});

test('financial configuration hash preserves array order', () => {
  assert.equal(canonicalFinancialConfiguration({ banks: [{ id: 'b' }, { id: 'a' }] }),
    '{"banks":[{"id":"b"},{"id":"a"}]}');
  assert.notEqual(
    financialConfigurationHash({ banks: [{ id: 'a' }, { id: 'b' }] }),
    financialConfigurationHash({ banks: [{ id: 'b' }, { id: 'a' }] }),
  );
});

test('financial configuration hash changes when approved tax data changes', () => {
  assert.notEqual(
    financialConfigurationHash({ company: { taxId: '123' } }),
    financialConfigurationHash({ company: { taxId: '456' } }),
  );
});

test('financial configuration hash changes when approved identity changes', () => {
  assert.notEqual(
    financialConfigurationHash({ company: { name: 'Issuer' } }),
    financialConfigurationHash({ company: { name: 'New issuer' } }),
  );
});

test('canonical financial configuration preserves JSON scalar semantics', () => {
  assert.equal(
    canonicalFinancialConfiguration({ text: 'ไทย\n"quoted"', negativeZero: -0, number: 7.5, enabled: false, empty: null, invalidNumber: NaN }),
    '{"empty":null,"enabled":false,"invalidNumber":null,"negativeZero":0,"number":7.5,"text":"ไทย\\n\\"quoted\\""}',
  );
});

test('canonical financial configuration applies JSON omission and null array semantics', () => {
  assert.equal(
    canonicalFinancialConfiguration({ missing: undefined, values: [undefined, Infinity, null], date: new Date('2026-10-13T00:00:00.000Z') }),
    '{"date":"2026-10-13T00:00:00.000Z","values":[null,null,null]}',
  );
});

test('canonical financial configuration rejects values without a top-level JSON representation', () => {
  assert.throws(() => canonicalFinancialConfiguration(undefined), TypeError);
});
