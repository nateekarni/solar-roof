import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {verifiedOriginalPdf} from './original-document-loader';
const pdf=new Blob(['%PDF-1.7\noriginal'],{type:'application/pdf'});const hash=createHash('sha256').update('%PDF-1.7\noriginal').digest('hex');const id='11111111-1111-4111-8111-111111111111';
test('loads scoped persisted PDF and preserves exact bytes',async()=>{let path='';const result=await verifiedOriginalPdf(id,hash,async value=>{path=value;return pdf;});assert.equal(path,`/v1/operations/documents/${id}/pdf`);assert.equal(result,pdf);});
test('rejects invalid references, error HTML and changed issued bytes',async()=>{await assert.rejects(verifiedOriginalPdf('../external',hash,async()=>pdf));await assert.rejects(verifiedOriginalPdf(id,hash,async()=>new Blob(['error'],{type:'text/html'})));await assert.rejects(verifiedOriginalPdf(id,'0'.repeat(64),async()=>pdf),/integrity/);});
import {originalDocumentReference} from './original-document-loader';
test('original reference requires authoritative number and never substitutes routing id',async()=>{
 const ref=await originalDocumentReference({type:'contract',id},async()=>({documentId:id,contentHash:hash,documentNumber:'PPA261000001'}));assert.equal(ref.number,'PPA261000001');
 await assert.rejects(originalDocumentReference({type:'contract',id,documentNumber:'invented'},async()=>({documentId:id,contentHash:hash})),/number/i);
});
