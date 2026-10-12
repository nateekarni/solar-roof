import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { eligibleRecipientSql } from './operational-automation.service.js';
import { notificationVisibleSql } from './notification-feed.service.js';
test('notification enqueue and delivery SQL checks live domain grant and feed scope before pagination',()=>{
 assert.match(eligibleRecipientSql,/employee_can_access/);
 assert.match(eligibleRecipientSql,/business\.billing\.view/);
 assert.match(eligibleRecipientSql,/technical\.alerts\.view/);
 assert.match(notificationVisibleSql,/employee_can_access/);
});
