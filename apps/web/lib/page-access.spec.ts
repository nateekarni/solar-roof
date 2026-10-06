import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticatedPageUser } from './page-access';
test('Direct page access checks the freshly authenticated role', async () => {
  let reads=0;
  await assert.rejects(authenticatedPageUser('/settings/users', async () => {reads++;return {role:'owner'};}), {message:'Page access denied'});
  assert.equal(reads,1);
});
test('School cannot visit configuration directly and can visit production', async () => {
  await assert.rejects(authenticatedPageUser('/settings/company', async () => ({role:'school_user'})), {message:'Page access denied'});
  assert.equal((await authenticatedPageUser('/production', async () => ({role:'school_user'}))).role,'school_user');
});
test('Unknown authenticated role cannot access a financial document detail', async () => {
  await assert.rejects(authenticatedPageUser('/records/contracts/c1', async () => ({role:'unrecognized'})), {message:'Page access denied'});
});
test('Business roles cannot visit notifications whose API is denied', async () => {
  for (const role of ['owner','school_user']) await assert.rejects(authenticatedPageUser('/notifications', async () => ({role})), {message:'Page access denied'});
});
