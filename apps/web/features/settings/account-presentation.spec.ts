import assert from 'node:assert/strict';
import test from 'node:test';
import {canDismissAuthenticator,accountRoleLabel} from './account-presentation';
test('recovery codes cannot be discarded through implicit modal dismissal',()=>{
 assert.equal(canDismissAuthenticator(false,0),true);
 assert.equal(canDismissAuthenticator(false,10),false);
 assert.equal(canDismissAuthenticator(true,0),false);
 assert.equal(canDismissAuthenticator(true,10),false);
});
test('account roles display translated labels for every supported role',()=>{
 for(const role of ['owner','admin','operator','accountant','customer_user']){
  assert.notEqual(accountRoleLabel(role,'th'),role);
  assert.notEqual(accountRoleLabel(role,'en'),role);
 }
 assert.equal(accountRoleLabel('owner','th'),'เจ้าของ');
 assert.equal(accountRoleLabel('admin','en'),'Administrator');
});
