import assert from 'node:assert/strict';
import test from 'node:test';
import {eligibleBillingRows,reduceSelection} from './billing-selection';

test('selection eligibility uses only the derived pending issuance view',()=>{
 const rows=[
  {id:'pending-a',status:'draft',billingStatusView:'pending_issue_approval'},
  {id:'legacy-pending',status:'pending_issue_approval'},
  {id:'paid',status:'pending_issue_approval',billingStatusView:'paid'},
  {id:'awaiting',billingStatusView:'awaiting_payment'},
  {id:'review',billingStatusView:'pending_verification'},
  {id:'overdue',billingStatusView:'overdue'},
  {id:'unsuccessful',billingStatusView:'unsuccessful'},
  {id:'unknown',billingStatusView:'future-state'},
 ];
 assert.deepEqual(eligibleBillingRows(rows).map(row=>row.id),['pending-a']);
 assert.equal(eligibleBillingRows(rows)[0],rows[0]);
 assert.deepEqual(eligibleBillingRows([]),[]);
});

test('individual selection toggles without mutating previous state',()=>{
 const previous=new Set(['a']);
 assert.deepEqual(reduceSelection(previous,{type:'toggle',id:'b'}),new Set(['a','b']));
 assert.deepEqual(reduceSelection(previous,{type:'toggle',id:'a'}),new Set());
 assert.deepEqual(previous,new Set(['a']));
});

test('select page selects all supplied eligible IDs and toggles the entire page off',()=>{
 assert.deepEqual(reduceSelection(new Set(),{type:'togglePage',ids:['a','b']}),new Set(['a','b']));
 assert.deepEqual(reduceSelection(new Set(['a']),{type:'togglePage',ids:['a','b']}),new Set(['a','b']));
 assert.deepEqual(reduceSelection(new Set(['a','b']),{type:'togglePage',ids:['a','b']}),new Set());
 assert.deepEqual(reduceSelection(new Set(['stale']),{type:'togglePage',ids:['a','b']}),new Set(['a','b']));
 assert.deepEqual(reduceSelection(new Set(),{type:'togglePage',ids:[]}),new Set());
});

test('reset drops all selected IDs for a query/page change or completed approval',()=>{
 const previous=new Set(['a','b']);
 assert.equal(reduceSelection(previous,{type:'reset'}).size,0);
 assert.deepEqual(previous,new Set(['a','b']));
});
