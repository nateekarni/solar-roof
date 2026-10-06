import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withRecoveryProgress} from './recovery-progress.mjs';

test('recovery command progress hides arguments and preserves captured result',()=>{
 const logs=[],result={status:0,stdout:'private SQL result',stderr:''};
 const command=['exec','-T','-e','PASSWORD=secret','restore-db','psql','-c','SELECT secret'];
 assert.equal(withRecoveryProgress(command,()=>result,line=>logs.push(line)),result);
 assert.equal(logs.length,2);
 assert.match(logs[0],/start command=exec service=restore-db/);
 assert.match(logs[1],/end command=exec service=restore-db.*status=0/);
 assert.doesNotMatch(logs.join('\n'),/PASSWORD|secret|SELECT|private/);
});
test('recovery progress records thrown operations and preserves error identity',()=>{
 const logs=[],error=new Error('private failure');
 assert.throws(()=>withRecoveryProgress(['--profile','restore','up','restore-db'],()=>{throw error;},line=>logs.push(line)),e=>e===error);
 assert.match(logs[0],/command=up service=restore-db/);
 assert.match(logs[1],/status=error/);
 assert.doesNotMatch(logs.join('\n'),/private/);
});
test('recovery progress preserves negative-fixture and timeout results',()=>{
 for(const status of [1,null]){
  const logs=[],result={status,stdout:'captured evidence',stderr:'captured failure'};
  assert.equal(withRecoveryProgress(['up','restore-negative'],()=>result,line=>logs.push(line)),result);
  assert.match(logs[1],new RegExp(`status=${status??'error'}$`));
  assert.doesNotMatch(logs.join('\n'),/captured/);
 }
});
