import assert from 'node:assert/strict';
import test from 'node:test';
import { operationPageSql, operationPredicate, parseOperationQuery } from './operation-query.js';

test('billing collection aliases normalize into the canonical tab and cannot constrain it',()=>{
 for(const [collectionStatus,expected] of [['paid','paid'],['pending_review','pending_verification'],['overdue','overdue'],['awaiting_payment','awaiting_payment']] as const){
  const legacy=parseOperationQuery('billing',{collectionStatus,status:'approved'});
  assert.equal(legacy.billingStatusView,expected);assert.equal(legacy.collectionStatus,undefined);
  const explicit=parseOperationQuery('billing',{collectionStatus,billingStatusView:'pending_issue_approval'});
  assert.equal(explicit.billingStatusView,'pending_issue_approval');assert.equal(explicit.collectionStatus,undefined);
  assert.deepEqual(operationPredicate('billing',explicit,[]),['q."billingStatusView" = $1']);
 }
 assert.equal(parseOperationQuery('receipts',{collectionStatus:'paid'}).collectionStatus,'paid');
});

test('billing status views validate the tab vocabulary and reject raw or unrelated filters',()=>{
 for(const status of ['all','pending_issue_approval','awaiting_payment','pending_verification','overdue','paid','unsuccessful']) {
  assert.equal(parseOperationQuery('billing',{billingStatusView:status}).billingStatusView,status);
 }
 assert.throws(()=>parseOperationQuery('billing',{billingStatusView:'raw_database_value'}),/Invalid/);
 assert.throws(()=>parseOperationQuery('billing',{billingStatusView:''}),/Invalid/);
 assert.throws(()=>parseOperationQuery('receipts',{billingStatusView:'paid'}),/Invalid/);
 assert.throws(()=>parseOperationQuery('billing',{status:'unknown_legacy_status'}),/Invalid/);
});

test('legacy billing status links normalize to tabs without retaining the raw predicate',()=>{
 for(const [status,expected] of [
  ['','all'],['draft','unsuccessful'],['pending_review','all'],['approved','all'],['issued','all'],['unpaid','awaiting_payment'],['pending_payment','awaiting_payment'],['pending_verification','pending_verification'],['overdue','overdue'],['paid','paid'],['cancelled','unsuccessful'],
 ] as const) {
  const query=parseOperationQuery('billing',{status});
  assert.equal(query.billingStatusView,expected,status);assert.equal(query.status,undefined);
  const params:unknown[]=[];
  const clauses=operationPredicate('billing',query,params);
  assert.deepEqual(clauses,expected==='all'?[]:['q."billingStatusView" = $1']);
  assert.deepEqual(params,expected==='all'?[]:[expected]);
 }
});

test('explicit billing tab wins over a valid legacy status and both inputs stay validated',()=>{
 for(const [status,billingStatusView] of [['paid','paid'],['paid','overdue'],['paid','all'],['','paid']] as const) {
  assert.equal(parseOperationQuery('billing',{status,billingStatusView}).billingStatusView,billingStatusView);
 }
 assert.throws(()=>parseOperationQuery('billing',{status:'unknown',billingStatusView:'paid'}),/Invalid/);
 assert.throws(()=>parseOperationQuery('billing',{status:'__proto__'}),/Invalid/);
 assert.throws(()=>parseOperationQuery('billing',{status:'paid',billingStatusView:'unknown'}),/Invalid/);
});

test('legacy and canonical billing aliases share cursor scope',()=>{
 const query=parseOperationQuery('billing',{status:'pending_payment'});
 const page=operationPageSql('billing','SELECT id,period',[],query,{role:'owner'},null);
 const cursor=page.cursor({id:'00000000-0000-4000-8000-000000000001',__operationCursorValue:'2026-09'});
 assert.doesNotThrow(()=>operationPageSql('billing','SELECT id,period',[],parseOperationQuery('billing',{billingStatusView:'awaiting_payment',cursor}),{role:'owner'},null));
});

test('billing tab filters bind the derived status while all adds no status predicate',()=>{
 const params:unknown[]=['scope'];
 assert.deepEqual(operationPredicate('billing',parseOperationQuery('billing',{billingStatusView:'pending_issue_approval'}),params),['q."billingStatusView" = $2']);
 assert.deepEqual(params,['scope','pending_issue_approval']);
 assert.deepEqual(operationPredicate('billing',parseOperationQuery('billing',{billingStatusView:'all'}),[]),[]);
});

test('billing cursors cannot be reused after changing tabs',()=>{
 const query=parseOperationQuery('billing',{billingStatusView:'paid'});
 const page=operationPageSql('billing','SELECT id,period',[],query,{role:'owner'},null);
 const cursor=page.cursor({id:'00000000-0000-4000-8000-000000000001',__operationCursorValue:'2026-09'});
 assert.doesNotThrow(()=>operationPageSql('billing','SELECT id,period',[],{...query,cursor},{role:'owner'},null));
 assert.throws(()=>operationPageSql('billing','SELECT id,period',[],parseOperationQuery('billing',{billingStatusView:'overdue',cursor}),{role:'owner'},null),/scope/);
});
