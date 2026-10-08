import test from 'node:test';
import assert from 'node:assert/strict';
import {getOperationActions} from './operation-actions';
test('TEST unpaid pending bill permits additional transfer evidence with server capability',()=>{
 const row={id:'cycle',status:'pending_verification'},capabilities={actions:[],unavailable:{},operationsActions:['submit_payment'],financialScope:'TEST' as const};
 assert.ok(getOperationActions('billing',row,capabilities).some(action=>action.id==='pay'));
 assert.ok(!getOperationActions('billing',row,{...capabilities,operationsActions:[]}).some(action=>action.id==='pay'));
 assert.ok(!getOperationActions('billing',{...row,status:'paid'},capabilities).some(action=>action.id==='pay'));
 assert.ok(!getOperationActions('billing',row,{...capabilities,financialScope:undefined}).some(action=>action.id==='pay'));
});