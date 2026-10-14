import assert from 'node:assert/strict';
import test from 'node:test';
import { operationRequestQueries, billingStatusViewFromQuery, patchOperationQuery } from './operation-request-query';

test('keeps the browser operation filters on the initial server request', () => {
  const { rows, summary } = operationRequestQueries({
    search: 'U1 Browser',
    collectionStatus: 'pending_review',
    cursor: 'next-page',
    ignored: 'value',
  });

  assert.equal(
    rows,
    'search=U1+Browser&cursor=next-page&collectionStatus=pending_review',
  );
  assert.equal(
    summary,
    'search=U1+Browser&collectionStatus=pending_review',
  );
});

test('uses the same first value that browser URLSearchParams.get reads', () => {
  const { rows } = operationRequestQueries({ status: ['open', 'resolved'] });
  assert.equal(rows, 'status=open');
});

test('forwards the billing tab to initial rows and summary requests',()=>{
 const queries=operationRequestQueries({billingStatusView:['pending_issue_approval','paid'],cursor:'next'});
 assert.equal(new URLSearchParams(queries.rows).get('billingStatusView'),'pending_issue_approval');
 assert.equal(new URLSearchParams(queries.summary).get('billingStatusView'),'pending_issue_approval');
 assert.equal(new URLSearchParams(queries.summary).has('cursor'),false);
});

test('billing selection matches API legacy normalization and explicit view precedence',()=>{
 for(const [status,expected] of [['','all'],['draft','unsuccessful'],['cancelled','unsuccessful'],['paid','paid'],['unpaid','awaiting_payment'],['pending_payment','awaiting_payment'],['pending_verification','pending_verification'],['overdue','overdue'],['pending_review','all'],['approved','all'],['issued','all']] as const){
  assert.equal(billingStatusViewFromQuery(new URLSearchParams({status})),expected,status);
  assert.equal(billingStatusViewFromQuery(new URLSearchParams({status,billingStatusView:'pending_issue_approval'})),'pending_issue_approval');
 }
 assert.equal(billingStatusViewFromQuery(new URLSearchParams()),'all');
});

test('changing a billing tab resets cursor, removes legacy status and preserves unrelated state',()=>{
 const initial=new URLSearchParams('search=school&from=2026-09-01&to=2026-09-30&siteId=site-a&collectionStatus=overdue&sort=amount&direction=asc&limit=50&cursor=next&status=paid&custom=keep');
 const next=patchOperationQuery(initial,{billingStatusView:'all'});
 assert.equal(next.get('billingStatusView'),'all');
 assert.equal(next.has('cursor'),false);
 assert.equal(next.has('status'),false);
 for(const key of ['search','from','to','siteId','collectionStatus','sort','direction','limit','custom'])assert.equal(next.get(key),initial.get(key),key);
 assert.equal(initial.get('cursor'),'next');
});

test('cursor navigation and nonbilling status changes retain their own filters',()=>{
 assert.equal(patchOperationQuery(new URLSearchParams('status=issued&search=abc'),{cursor:'next'}).toString(),'status=issued&search=abc&cursor=next');
 assert.equal(patchOperationQuery(new URLSearchParams('cursor=next&status=issued'),{status:'finalized'}).toString(),'status=finalized');
});
