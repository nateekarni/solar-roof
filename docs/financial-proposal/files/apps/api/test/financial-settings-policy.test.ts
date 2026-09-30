import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePaymentTermDays, assertSampleSeedAllowed } from '../src/modules/settings/financial-settings-policy.js';
test('zero is an explicit term; absent default stays null', () => {
 assert.equal(parsePaymentTermDays(0), 0);
 assert.equal(parsePaymentTermDays(null), null);
 assert.equal(parsePaymentTermDays(undefined), null);
 for (const value of ['', '30', -1, 1.5, 3651, NaN, Infinity, true]) assert.throws(() => parsePaymentTermDays(value));
});
test('sample seed requires explicit development or test environment and opt-in', () => {
 for (const env of [undefined, 'production', 'staging']) assert.throws(() => assertSampleSeedAllowed(env, 'yes'));
 assert.throws(() => assertSampleSeedAllowed('development', undefined));
 assert.doesNotThrow(() => assertSampleSeedAllowed('test', 'yes'));
});
import { validateReminderSchedule } from '../src/modules/settings/financial-settings-policy.js';
test('reminders have no implicit schedule and reject duplicate or invalid offsets', () => {
 assert.doesNotThrow(() => validateReminderSchedule(false, []));
 assert.doesNotThrow(() => validateReminderSchedule(true, [1, 7]));
 for (const schedule of [[], [0], [-1], [1.5], [1,1], ['1']]) assert.throws(() => validateReminderSchedule(true, schedule));
});
