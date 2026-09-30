import test from 'node:test';
import assert from 'node:assert/strict';
import { dueMonth, retryAt, reminderEligible } from '../src/modules/billing/automation-policy.js';

test('month close waits until 01:00 Bangkok then targets previous calendar month',()=>{
 assert.equal(dueMonth(new Date('2026-09-30T17:59:59Z')),null);
 assert.deepEqual(dueMonth(new Date('2026-09-30T18:00:00Z')),{start:'2026-09-01',end:'2026-09-30'});
 assert.deepEqual(dueMonth(new Date('2026-12-31T18:00:00Z')),{start:'2026-12-01',end:'2026-12-31'});
});
test('failed delivery has bounded retries and cannot schedule a sixth attempt',()=>{
 const now=new Date('2026-10-01T00:00:00Z');
 assert.equal(retryAt(1,now)?.toISOString(),'2026-10-01T00:05:00.000Z');
 assert.equal(retryAt(4,now)?.toISOString(),'2026-10-02T00:00:00.000Z');
 assert.equal(retryAt(5,now),null);
});
test('reminders are disabled by default and pause pending payment review',()=>{
 assert.equal(reminderEligible(false,[],3,'approved',false),false);
 assert.equal(reminderEligible(true,[3],3,'approved',true),false);
 assert.equal(reminderEligible(true,[3],3,'paid',false),false);
 assert.equal(reminderEligible(true,[3],3,'cancelled',false),false);
 assert.equal(reminderEligible(true,[3],3,'approved',false),true);
 assert.equal(reminderEligible(true,[3],2,'approved',false),false);
});
