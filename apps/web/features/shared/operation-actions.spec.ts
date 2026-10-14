import test from 'node:test';
import assert from 'node:assert/strict';
import {getOperationActions} from './operation-actions';
test('issuance approval is restricted to pending view and server approval capability',()=>{
 const capabilities={actions:[],unavailable:{},operationsActions:['approve_invoice']};
 const row={id:'bill',status:'draft',billingStatusView:'pending_issue_approval'};
 assert.ok(getOperationActions('billing',row,capabilities).some(action=>action.id==='approve_issuance'));
 for(const [resource,value,caps] of [['billing',{...row,billingStatusView:'paid'},capabilities],['receipts',row,capabilities],['billing',row,{...capabilities,operationsActions:[]}]] as const)assert.ok(!getOperationActions(resource,value,caps).some(action=>action.id==='approve_issuance'));
});
test('TEST unpaid pending bill permits additional transfer evidence with server capability',()=>{
 const row={id:'cycle',status:'pending_verification'},capabilities={actions:[],unavailable:{},operationsActions:['submit_payment'],financialScope:'TEST' as const};
 assert.ok(getOperationActions('billing',row,capabilities).some(action=>action.id==='pay'));
 assert.ok(!getOperationActions('billing',row,{...capabilities,operationsActions:[]}).some(action=>action.id==='pay'));
 assert.ok(!getOperationActions('billing',{...row,status:'paid'},capabilities).some(action=>action.id==='pay'));
 assert.ok(!getOperationActions('billing',row,{...capabilities,financialScope:undefined}).some(action=>action.id==='pay'));
});
