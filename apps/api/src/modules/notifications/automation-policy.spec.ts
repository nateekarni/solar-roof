import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPaymentPreReminderDay, reminderSlot, transitionAlert } from './automation-policy.js';
test('reminder pauses evidence, stops settlement and resumes original due schedule',()=>{
 const input={dueDate:'2026-10-10',startDays:2,intervalDays:3,enabled:true,status:'issued',pendingEvidence:false};
 assert.equal(reminderSlot(input,'2026-10-15'),1);
 assert.equal(reminderSlot({...input,pendingEvidence:true},'2026-10-15'),null);
 assert.equal(reminderSlot({...input,status:'paid'},'2026-10-15'),null);
 assert.equal(reminderSlot({...input,outstanding:0},'2026-10-15'),null);
 assert.equal(reminderSlot(input,'2026-10-07'),null);
 assert.equal(reminderSlot({...input,intervalDays:0},'2026-10-15'),null);
});
test('payment pre-reminder is one day before the first customer reminder only',()=>{
 const input={dueDate:'2026-10-10',startDays:2,intervalDays:3,enabled:true,status:'issued',pendingEvidence:false,outstanding:44565.5};
 assert.equal(isPaymentPreReminderDay(input,'2026-10-11'),true);
 assert.equal(isPaymentPreReminderDay(input,'2026-10-12'),false);
 assert.equal(isPaymentPreReminderDay({...input,pendingEvidence:true},'2026-10-11'),false);
 assert.equal(isPaymentPreReminderDay({...input,outstanding:0},'2026-10-11'),false);
});
test('alert waits duration, ignores unavailable evidence, emits recovery and honors cooldown',()=>{
 const rule={durationSeconds:60,cooldownSeconds:300,recovery:true};
 const first=transitionAlert(rule,{},true,1000); assert.equal(first.event,null);
 assert.equal(transitionAlert(rule,first.state,null,61000).event,null);
 const alarm=transitionAlert(rule,first.state,true,61000);assert.equal(alarm.event,'alarm');
 assert.equal(transitionAlert(rule,alarm.state,true,62000).event,null);
 const recovery=transitionAlert(rule,alarm.state,false,63000);assert.equal(recovery.event,'recovery');
 const again=transitionAlert(rule,recovery.state,true,64000);
 assert.equal(transitionAlert(rule,again.state,true,124000).event,null);
 assert.equal(transitionAlert(rule,again.state,true,361000).event,'alarm');
});
