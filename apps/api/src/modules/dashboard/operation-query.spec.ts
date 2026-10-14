import assert from 'node:assert/strict';
import test from 'node:test';
import { operationPageSql, operationPredicate, parseOperationQuery } from './operation-query.js';

test('billing status views validate the tab vocabulary and reject raw or unrelated filters',()=>{
 for(const status of ['all','pending_issue_approval','awaiting_payment','pending_verification','overdue','paid','unsuccessful']) {
  assert.equal(parseOperationQuery('billing',{billingStatusView:status}).billingStatusView,status);
 }
 assert.throws(()=>parseOperationQuery('billing',{billingStatusView:'raw_database_value'}),/Invalid/);
 assert.throws(()=>parseOperationQuery('billing',{billingStatusView:''}),/Invalid/);
 assert.throws(()=>parseOperationQuery('receipts',{billingStatusView:'paid'}),/Invalid/);
 assert.throws(()=>parseOperationQuery('billing',{status:'issued'}),/Invalid/);
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
