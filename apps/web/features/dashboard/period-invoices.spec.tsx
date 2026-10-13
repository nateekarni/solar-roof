import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {PeriodInvoices} from './period-invoices';
test('selected-period bill list retains settled invoices and discloses pagination',()=>{
 const html=renderToStaticMarkup(<PeriodInvoices locale="en" data={{items:[{id:'settled',siteId:'a',siteName:'School A',invoiceNumber:'BILL-PAID',periodStart:'2026-10-01',dueDate:'2026-10-10',amount:'150',approved:'150',remaining:'0',status:'paid'}],total:21,hasMore:true}}/>);
 assert.match(html,/BILL-PAID/);assert.match(html,/\/records\/billing\/settled/);assert.match(html,/Paid/);assert.match(html,/1 of 21/);assert.match(html,/More bills/);
});
