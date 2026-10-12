import test from 'node:test';
import assert from 'node:assert/strict';
import {collectRecordIds, recordNeighbors, financialListHref} from './record-navigation';
test('navigation preserves cohort site and collection filters for paid receipts',async()=>{
 let requested='';await collectRecordIds('receipts','siteId=site&collectionStatus=paid&from=2026-09-01&to=2026-09-30',async url=>{requested=url;return {rows:[],page:{hasMore:false}};});
 assert.match(requested,/siteId=site/);assert.match(requested,/collectionStatus=paid/);assert.match(requested,/from=2026-09-01/);
});

test('collects the full filtered order across cursor pages, not just the starting page', async()=>{
 const calls:string[]=[];
 const ids=await collectRecordIds('billing','status=pending_verification&sort=amount&direction=asc&cursor=old&limit=10',async url=>{
  calls.push(url);
  return url.includes('cursor=next')?{rows:[{id:'C'}],page:{hasMore:false,nextCursor:null}}:{rows:[{id:'A'},{id:'B'}],page:{hasMore:true,nextCursor:'next'}};
 });
 assert.deepEqual(ids,['A','B','C']);
 assert.match(calls[0]!,/status=pending_verification/);assert.match(calls[0]!,/sort=amount/);assert.doesNotMatch(calls[0]!,/cursor=/);
 assert.match(calls[1]!,/cursor=next/);
});
test('snapshot neighbors remain stable when current record leaves the live filter',()=>{
 const snapshot=['A','B','C'];
 assert.deepEqual(recordNeighbors(snapshot,'A'),{previous:null,next:'B',index:0,total:3});
 assert.deepEqual(recordNeighbors(snapshot,'C'),{previous:'B',next:null,index:2,total:3});
 assert.deepEqual(recordNeighbors(snapshot,'gone'),{previous:null,next:null,index:-1,total:3});
});
test('rejects a repeating cursor instead of fetching forever',async()=>{
 await assert.rejects(collectRecordIds('receipts','',async()=>({rows:[{id:'A'}],page:{hasMore:true,nextCursor:'loop'}})),/cursor/i);
});
test('return URL stays on the financial list and preserves filters',()=>{
 assert.equal(financialListHref('receipts','search=ABC&status=issued'),'/receipts?search=ABC&status=issued');
 assert.equal(financialListHref('//evil.test',''),'/billing');
});
