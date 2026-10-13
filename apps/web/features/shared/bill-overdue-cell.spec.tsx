import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {BillOverdueCell} from './bill-overdue-cell';
test('shared desktop overdue cell combines age and successful reminders in either locale',()=>{
 const row={id:'bill',collectionStatus:'overdue',daysOverdue:12,successfulReminderCount:3};
 assert.equal(renderToStaticMarkup(<BillOverdueCell row={row} locale="th"/>),'<span>12 วัน (ทวงแล้ว 3 ครั้ง)</span>');
 assert.equal(renderToStaticMarkup(<BillOverdueCell row={row} locale="en"/>),'<span>12 days (3 reminders sent)</span>');
 for(const collectionStatus of ['paid','pending_review','awaiting_payment'])assert.equal(renderToStaticMarkup(<BillOverdueCell row={{...row,collectionStatus}} locale="th"/>),'<span>—</span>');
});
