import test from 'node:test';
import assert from 'node:assert/strict';
import {apiErrorMessage} from './api-error-message';

test('server internals never appear in either language',()=>{
 for(const locale of ['th','en'] as const){
  for(const status of [400,500]) assert.doesNotMatch(apiErrorMessage(status,'PrismaClientKnownRequestError SQL SELECT token FROM users',''+locale as 'th'|'en'),/Prisma|SELECT|token|SQL/);
  assert.doesNotMatch(apiErrorMessage(500,'ระบบ Prisma SQL ล้มเหลว',locale),/Prisma|SQL/);
 }
});
test('network errors explain retry without exposing fetch internals',()=>{
 assert.match(apiErrorMessage(0,'Failed to fetch','en'),/connection.*try again/i);
 assert.match(apiErrorMessage(0,'Failed to fetch','th'),/เชื่อมต่อ/);
});
test('English verification failure identifies the correct recovery action',()=>{
 assert.match(apiErrorMessage(401,'Invalid or expired reset link','en'),/request.*new link/i);
 assert.match(apiErrorMessage(401,'Invalid second factor','en'),/new code/i);
});
