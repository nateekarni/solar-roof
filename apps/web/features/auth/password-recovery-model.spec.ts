import test from 'node:test';import assert from 'node:assert/strict';
import {passwordResetBody} from './password-recovery-model';
test('password reset validates confirmation and retains exactly one selected second factor',()=>{
 assert.throws(()=>passwordResetBody('token','long-enough-password','mismatch',false,false,'','en'),/match/);
 assert.throws(()=>passwordResetBody('token','short','short',false,false,'','en'),/12/);
 assert.deepEqual(passwordResetBody('token','long-enough-password','long-enough-password',true,false,'123456','en'),{token:'token',newPassword:'long-enough-password',secondFactorCode:'123456'});
 assert.deepEqual(passwordResetBody('token','long-enough-password','long-enough-password',true,true,'aabbccdd-11223344','en'),{token:'token',newPassword:'long-enough-password',recoveryCode:'aabbccdd-11223344'});
 assert.deepEqual(passwordResetBody('token','long-enough-password','long-enough-password',false,false,'ignored','en'),{token:'token',newPassword:'long-enough-password'});
});
