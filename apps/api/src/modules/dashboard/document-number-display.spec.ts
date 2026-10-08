import test from 'node:test';import assert from 'node:assert/strict';import {OperationsService} from './operations.service.js';import {OperationsController} from './operations.controller.js';
test('contract listing and search resolve stored original number without invented UUID alias',async()=>{
 const db={query:async(sql:string)=>({rows:[{id:'internal',contractNumber:sql.includes('d.document_number')?'PPA261000001':'internal'}]})};
 const result=await new OperationsService(db as any).list('contracts',{role:'owner'},{search:'PPA261000001',sort:'contractNumber'});assert.equal(result.rows[0]?.contractNumber,'PPA261000001');
});
test('PDF response filename uses the original human number with header-safe escaping',async()=>{
 const headers:Record<string,string>={};const controller=new OperationsController({documentPdf:async()=>({pdf_bytes:Buffer.from('%PDF'),sha256:'a'.repeat(64),documentNumber:'PPA261000001"\r\nX-Test:yes'})} as any);
 await controller.documentPdf('internal',{user:{role:'owner'}},{setHeader:(k:string,v:string)=>{headers[k]=v;},send:()=>{}} as any);
 assert.equal(headers['Content-Disposition'],'inline; filename="PPA261000001___X-Test_yes.pdf"');
});

