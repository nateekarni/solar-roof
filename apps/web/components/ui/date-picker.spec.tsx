import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {DatePicker} from './date-picker';

test('date controls retain API dates and required form validation without native date UI',()=>{
 const html=renderToStaticMarkup(<DatePicker value="2026-10-05" onValueChange={()=>{}} required aria-label="From date"/>);
 assert.match(html,/value="2026-10-05"/);
 assert.match(html,/required=""/);
 assert.match(html,/aria-label="From date"/);
 assert.ok(!html.includes('type="date"'));
 assert.ok(!html.includes('readonly'));
});

test('invalid calendar dates do not silently roll into the following month',()=>{
 const html=renderToStaticMarkup(<DatePicker value="2026-02-31" placeholder="Choose date"/>);
 assert.match(html,/Choose date/);
 assert.match(html,/value=""/);
});

test('payment date controls display the saved local time without UTC conversion',()=>{
 const html=renderToStaticMarkup(<DatePicker value="2026-10-05T23:45" includeTime/>);
 assert.match(html,/23:45/);
 assert.match(html,/value="2026-10-05"/);
 assert.ok(!html.includes('type="datetime-local"'));
});
