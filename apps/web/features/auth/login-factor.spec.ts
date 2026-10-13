import assert from 'node:assert/strict';
import test from 'node:test';
import {loginFactorBody} from './login-factor';
test('sends exactly one second-factor value and keeps passwords out of the factor field',()=>{
 assert.deepEqual(loginFactorBody(false,' 123456 '),{secondFactorCode:'123456'});
 assert.deepEqual(loginFactorBody(true,' abcd-1234 '),{recoveryCode:'abcd-1234'});
 assert.throws(()=>loginFactorBody(false,'123'));assert.throws(()=>loginFactorBody(true,''));
});
