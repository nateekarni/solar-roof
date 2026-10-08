import assert from 'node:assert/strict';
import test from 'node:test';
import * as module from './document-number.js';
test('shared number authority is available', () => assert.equal(typeof module?.allocateDocumentNumber, 'function'));
test('formats independent INV/RCP/PPA issue-month families with five digits', async () => {
 const seen:string[]=[];
 const client={query:async(sql:string,params:unknown[]=[])=>{if(sql.includes('AS day'))return {rows:[{day:'2026-10-08'}]}; seen.push(String(params[0]));return {rows:[{last_value:1}]};}};
 for(const [type,prefix] of [['invoice','INV'],['receipt','RCP'],['contract','PPA']] as const)assert.deepEqual(await module.allocateDocumentNumber(client,type),{number:`${prefix}261000001`,issueDate:'2026-10-08'});
 assert.deepEqual(seen,['INV2610','RCP2610','PPA2610']);
});
test('Bangkok month follows issuance instant rather than service month',async()=>{
 assert.equal(module.documentNumberPrefix('invoice',new Date('2026-09-30T16:59:59Z')),'INV2609');
 assert.equal(module.documentNumberPrefix('invoice',new Date('2026-09-30T17:00:00Z')),'INV2610');
 assert.throws(()=>module.documentNumberPrefix('billing_statement' as any,'2026-10-08'),/Unsupported/);
});
test('atomic UPSERT caps overflow before increment and preserves existing prefix rows',async()=>{
 const client={query:async(sql:string,params:unknown[]=[])=>{
 if(sql.includes('AS day'))return {rows:[{day:'2026-10-08'}]};
 assert.match(sql,/ON CONFLICT\s*\(prefix\)/);assert.match(sql,/last_value\s*<\s*99999/);assert.equal(params[0],'INV2610');return {rows:[]};}};
 await assert.rejects(module.allocateDocumentNumber(client,'invoice'),/exhausted/);
});
test('allocator rejects prototype names and impossible issue dates',()=>{
 assert.throws(()=>module.documentNumberPrefix('toString' as any,'2026-10-08'),/Unsupported/);
 assert.throws(()=>module.documentNumberPrefix('invoice','2026-02-31'),/Valid/);
});
