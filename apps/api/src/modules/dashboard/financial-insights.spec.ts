import test from 'node:test';import assert from 'node:assert/strict';import {financialInsights} from './financial-insights.js';
test('cohort collection partitions partial payments and pending evidence without losing cents or invoice counts',()=>{
 const bill={id:'a',siteId:'s',siteName:'Site',amount:'100',approved:'0',pendingReview:0,dueDate:'2026-10-01',periodStart:'2026-09-01',status:'issued'};
 const result=financialInsights([bill,{...bill,id:'b',approved:'40.05',pendingReview:2},{...bill,id:'c',approved:'100'},{...bill,id:'d',dueDate:'2026-10-20'},{...bill,id:'old',periodStart:'2026-08-01'}],{start:'2026-09-01',end:'2026-09-30',today:'2026-10-10',cashReceived:'0'});
 assert.deepEqual(result.collectionStatuses,[{key:'paid',amount:'140.05',count:1},{key:'pending_review',amount:'59.95',count:1},{key:'overdue',amount:'100.00',count:1},{key:'awaiting_payment',amount:'100.00',count:1}]);
 assert.equal(result.cohortAging.find(b=>b.key==='8_30')?.amount,'159.95');assert.equal(result.cohortAging.find(b=>b.key==='8_30')?.count,2);
 assert.equal(financialInsights([],{start:'2026-09-01',end:'2026-09-30',today:'2026-10-10',cashReceived:'0'}).collectionStatuses.length,4);
});
test('cohort aging keeps Bangkok calendar boundaries and excludes older billing cohorts',()=>{
 const today='2026-10-10',days=[0,1,7,8,30,31,60,61];
 const rows=days.map(day=>({id:String(day),siteId:'s',siteName:'A',amount:'10',approved:'0',pendingReview:0,dueDate:new Date(Date.parse(today)-day*86400000).toISOString().slice(0,10),periodStart:'2026-09-01',status:'issued'}));
 rows.push({...rows[1]!,id:'older',periodStart:'2026-08-01'});
 const result=financialInsights(rows,{start:'2026-09-01',end:'2026-09-30',today,cashReceived:'0'});
 assert.deepEqual(result.cohortAging.map(bucket=>bucket.count),[1,2,2,2,1]);assert.deepEqual(result.cohortAging.map(bucket=>bucket.amount),['10.00','20.00','20.00','20.00','10.00']);
 assert.equal(result.aging[1]?.count,3);
 assert.equal(result.cohortOldestOverdueDays,61);
 assert.equal(financialInsights([],{start:'2026-09-01',end:'2026-09-30',today,cashReceived:'0'}).cohortOldestOverdueDays,0);
});
test('partial approved cash reduces receivable while pending evidence remains overdue without double counting',()=>{
 const result=financialInsights([{id:'bill',siteId:'site',siteName:'A',invoiceId:'doc',invoiceNumber:'INV',amount:'107.00000000',approved:'40.05000000',pendingReview:1,dueDate:'2026-10-01',periodStart:'2026-09-01',status:'approved'}],{start:'2026-09-01',end:'2026-09-30',today:'2026-10-09',cashReceived:'12.30'});
 assert.equal(result.cohortBilled,'107.00');assert.equal(result.cohortCollected,'40.05');assert.equal(result.outstanding,'66.95');assert.equal(result.overdue,'66.95');assert.equal(result.awaitingPayment,'0.00');assert.equal(result.pendingReviewCount,1);assert.equal(result.cashReceived,'12.30');assert.equal(result.aging[2]?.amount,'66.95');assert.equal(result.workQueue[0]?.id,'bill');
});
test('cancelled bills and future due amounts do not contaminate overdue or settled totals',()=>{
 const rows=[{id:'a',siteId:'s',siteName:'A',amount:'10',approved:'0',pendingReview:0,dueDate:'2026-10-10',periodStart:'2026-10-01',status:'approved'},{id:'b',siteId:'s',siteName:'A',amount:'20',approved:'20',pendingReview:0,dueDate:'2026-09-01',periodStart:'2026-10-01',status:'paid'},{id:'c',siteId:'s',siteName:'A',amount:'99',approved:'0',pendingReview:0,dueDate:'2026-09-01',periodStart:'2026-10-01',status:'cancelled'}];
 const result=financialInsights(rows,{start:'2026-10-01',end:'2026-10-31',today:'2026-10-09',cashReceived:'0'});assert.equal(result.cohortBilled,'30.00');assert.equal(result.outstanding,'10.00');assert.equal(result.overdue,'0.00');assert.equal(result.awaitingPayment,'10.00');assert.equal(result.settledCount,1);
});


test('customer receivables include more than one hundred invoices while action preview stays bounded',()=>{
 const bills=Array.from({length:125},(_,index)=>({id:String(index),siteId:'site',siteName:'Site',amount:'1.01',approved:'0',pendingReview:0,dueDate:'2026-09-01',periodStart:'2026-09-01',status:'approved'}));
 const result=financialInsights(bills,{start:'2026-09-01',end:'2026-09-30',today:'2026-10-09',cashReceived:'0'});
 assert.equal(result.cohortBilled,'126.25');assert.equal(result.outstanding,'126.25');assert.equal(result.aging[3]?.count,125);assert.equal(result.workQueue.length,12);
});

test('period invoice preview includes settled invoices and counts the full cohort past preview limit',()=>{
 const rows=Array.from({length:25},(_,index)=>({id:String(index).padStart(2,'0'),siteId:'s',siteName:'A',invoiceId:'doc'+index,invoiceNumber:'INV-'+index,amount:'10',approved:'10',pendingReview:0,dueDate:'2026-10-10',periodStart:'2026-09-01',status:'paid'}));
 rows.push({...rows[0]!,id:'outside',periodStart:'2026-08-01'});
 const result=financialInsights(rows,{start:'2026-09-01',end:'2026-09-30',today:'2026-10-09',cashReceived:'0'}) as any;
 assert.equal(result.periodInvoices.total,25);assert.equal(result.periodInvoices.hasMore,true);assert.equal(result.periodInvoices.items.length,20);
 assert.equal(result.periodInvoices.items[0].remaining,'0.00');assert.equal(result.periodInvoices.items[0].invoiceNumber,'INV-0');assert.equal(result.workQueue.length,0);
});
