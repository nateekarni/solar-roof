import assert from 'node:assert/strict';
import test from 'node:test';
import {parseOperationQuery, operationPredicate, operationPageSql} from './operation-query.js';
import {OperationsService} from './operations.service.js';
import type {DatabaseService} from '../../database/database.service.js';

test('resource filters validate values and reject unrelated filters',()=>{
 const q=parseOperationQuery('alerts',{status:'open',severity:'warning'});
 assert.equal(q.status,'open'); assert.equal(q.severity,'warning');
 assert.throws(()=>parseOperationQuery('sites',{severity:'warning'}));
 assert.throws(()=>parseOperationQuery('alerts',{status:"open' OR TRUE"}));
 assert.throws(()=>parseOperationQuery('users',{role:'superadmin'}));
});
test('domain filters become bound predicates without interpolating user values',()=>{
 const q=parseOperationQuery('documents',{status:'issued',type:'invoice'});
 const params:unknown[]=['scope'];
 const clauses=operationPredicate('documents',q,params);
 assert.deepEqual(params,['scope','issued','invoice']);
 assert.deepEqual(clauses,['q."status"::text = $2','q."type"::text = $3']);
});
test('cursor cannot be reused after changing a resource filter',()=>{
 const source='SELECT id,status FROM alerts';
 const query=parseOperationQuery('alerts',{status:'open'});
 const page=operationPageSql('alerts',source,[],query,{id:'u',role:'admin'},null);
 const cursor=page.cursor({id:'00000000-0000-4000-8000-000000000001',__operationCursorValue:'2026-10-09T00:00:00Z'});
 assert.throws(()=>operationPageSql('alerts',source,[],parseOperationQuery('alerts',{status:'resolved',cursor}),{id:'u',role:'admin'},null),/scope/);
});
test('filtered customer and report summaries expose the same filter columns as lists',async()=>{
 for(const [resource,filter,projection] of [['customers',{status:'active'},'s.status'],['reports',{format:'PDF'},'upper(format) AS format']] as const){
  const service=new OperationsService({query:async(sql:string)=>{
   assert.ok(sql.includes(projection),`summary must project ${projection}`);
   return {rows:[{count:2}]};
  }} as unknown as DatabaseService);
  assert.equal((await service.summary(resource,{id:'u',role:'owner'},filter))[0]?.value,2);
 }
});
test('financial cohort filters bind site and derived collection status with exact billing days',()=>{
 const query=parseOperationQuery('billing',{siteId:'00000000-0000-4000-8000-000000000001',collectionStatus:'pending_review',from:'2026-09-05',to:'2026-09-20'});
 const params:unknown[]=[];const sql=operationPredicate('billing',query,params).join(' AND ');
 assert.match(sql,/siteId/);assert.match(sql,/collectionStatus/);assert.match(sql,/periodStart/);assert.deepEqual(params,['00000000-0000-4000-8000-000000000001','pending_review','2026-09-05','2026-09-21']);
});
test('bill list exposes Bangkok overdue days and counts successful reminder slots once across recipients and channels',async()=>{
 let sql='';const service=new OperationsService({query:async(value:string)=>{sql=value;return {rows:[]};}} as unknown as DatabaseService);
 await service.list('billing',{id:'u',role:'owner'});
 assert.match(sql,/AS "daysOverdue"/);assert.match(sql,/Asia\/Bangkok/);assert.match(sql,/count\(DISTINCT split_part\(o.dedupe_key,':',3\)\)/);assert.match(sql,/o.state='sent'/);assert.match(sql,/AS "successfulReminderCount"/);
});
