import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardRange } from './dashboard-range.js';

test('accepts January through March and rejects a fourth calendar month', () => {
  assert.deepEqual(dashboardRange({start_date:'2026-01-01', end_date:'2026-03-31'}), {start:'2026-01-01',end:'2026-03-31'});
  assert.throws(() => dashboardRange({start_date:'2026-01-01',end_date:'2026-04-01'}), /3 calendar months/);
});
test('rejects impossible dates, reversed ranges and partial ranges', () => {
  for (const q of [{start_date:'2026-02-30',end_date:'2026-03-01'}, {start_date:'2026-03-01',end_date:'2026-02-01'}, {start_date:'2026-01-01'}]) assert.throws(() => dashboardRange(q));
});
test('annual selections are disabled and defaults follow Bangkok calendar', () => {
  assert.throws(() => dashboardRange({period:'year'}), /annual/i);
  assert.throws(() => dashboardRange({period:'multi-year'}), /annual/i);
  assert.deepEqual(dashboardRange({}, new Date('2026-01-31T18:00:00Z')), {start:'2026-02-01',end:'2026-02-28'});
});

