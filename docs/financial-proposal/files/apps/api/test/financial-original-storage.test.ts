import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readOriginalPdf} from '../src/modules/documents/original-document-storage.js';
test('original PDF reader preserves stored bytes and rejects URLs or non-PDF content',async()=>{
 const bytes=Buffer.from('%PDF-1.4\noriginal-fixture\n%%EOF');let requests=0;
 const server=createServer((req,res)=>{requests++;res.setHeader('content-type','application/pdf');res.end(req.url?.includes('wrong')?'not a PDF':bytes);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();assert.ok(address&&typeof address==='object');
 const keys=['STORAGE_ENDPOINT','STORAGE_REGION','STORAGE_BUCKET','STORAGE_ACCESS_KEY','STORAGE_SECRET_KEY'] as const;
 const original=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 Object.assign(process.env,{STORAGE_ENDPOINT:`http://127.0.0.1:${address.port}`,STORAGE_REGION:'local',STORAGE_BUCKET:'test',STORAGE_ACCESS_KEY:'local',STORAGE_SECRET_KEY:'local'});
 try{
  assert.deepEqual((await readOriginalPdf('original.pdf')).bytes,bytes);
  await assert.rejects(readOriginalPdf('https://example.com/document.pdf'),/Invalid/);
  await assert.rejects(readOriginalPdf('../document.pdf'),/Invalid/);
  assert.equal(requests,1);
  await assert.rejects(readOriginalPdf('wrong.pdf'),/not a PDF/);
 }finally{for(const key of keys){if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];}await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
