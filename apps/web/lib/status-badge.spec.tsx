import assert from 'node:assert/strict';
import test from 'node:test';
import { STATUS_MAP } from './status-badge';

test('pending_issue_approval uses sky/info blue and differs from awaiting_payment warning amber', () => {
  const pending = STATUS_MAP['pending_issue_approval'];
  const awaiting = STATUS_MAP['awaiting_payment'];

  assert.ok(pending, 'pending_issue_approval status badge definition must exist');
  assert.ok(awaiting, 'awaiting_payment status badge definition must exist');

  // Verify pending_issue_approval has info styling
  assert.match(pending.className ?? '', /bg-info\/15/, 'pending_issue_approval should have bg-info/15');
  assert.match(pending.className ?? '', /text-info/, 'pending_issue_approval should have text-info');
  assert.match(pending.className ?? '', /border-info\/30/, 'pending_issue_approval should have border-info/30');

  // Verify awaiting_payment has warning styling
  assert.match(awaiting.className ?? '', /bg-warning\/15/, 'awaiting_payment should have bg-warning/15');
  assert.match(awaiting.className ?? '', /text-warning-emphasis/, 'awaiting_payment should have text-warning-emphasis');

  // Ensure their classNames are not identical
  assert.notEqual(pending.className, awaiting.className, 'Badge styling for pending approval and awaiting payment must not collide');
});
