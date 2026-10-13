import assert from 'node:assert/strict';
import test from 'node:test';
import { operationRequestQueries } from './operation-request-query';

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
