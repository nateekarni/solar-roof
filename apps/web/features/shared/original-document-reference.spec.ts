import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as loader from './original-document-loader';
const contract='11111111-1111-4111-8111-111111111111';
const documentId='22222222-2222-4222-8222-222222222222';
const bytes='%PDF-1.7\noriginal';const hash=createHash('sha256').update(bytes).digest('hex');
const metadata={documentId,contentHash:hash,documentNumber:'PPA-1'};
const resolve=(...args:any[])=>(loader as any).originalDocumentReference(...args);
test('contract resolves saved original then all PDF channels load its bytes',async()=>{
 const calls:string[]=[];
 const reference=await resolve({type:'contract',id:contract},async(path:string)=>{calls.push(path);return metadata;});
 assert.deepEqual(calls,[`/v1/operations/contracts/${contract}/original`]);
 assert.equal(reference.id,documentId);assert.equal(reference.hash,hash);
 const blob=await loader.verifiedOriginalPdf(reference.id,reference.hash,async path=>{assert.equal(path,`/v1/operations/documents/${documentId}/pdf`);return new Blob([bytes],{type:'application/pdf'});});
 assert.equal(createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex'),hash);
});
for(const type of ['invoice','receipt'])test(`${type} resolves stored metadata without company settings`,async()=>{
 const calls:string[]=[];
 const reference=await resolve({type,documentId},async(path:string)=>{calls.push(path);return {id:documentId,contentHash:hash,documentNumber:'INV-1',previewUrl:'/pdf'};});
 assert.deepEqual(calls,[`/v1/operations/documents/${documentId}`]);assert.equal(reference.id,documentId);assert.equal(reference.hash,hash);
});
test('unavailable, access denied and missing financial originals fail without HTML fallback',async()=>{
 await assert.rejects(resolve({type:'invoice'},async()=>metadata),/issued|ออก/i);
 await assert.rejects(resolve({type:'contract',id:contract},async()=>{throw new Error('Forbidden');}),/Forbidden/);
 await assert.rejects(resolve({type:'receipt',documentId},async()=>({id:documentId,previewUnavailableReason:'Unavailable'})),/Unavailable/);
 await assert.rejects(resolve({type:'contract',id:contract},async()=>({...metadata,contentHash:''})),/reference|ต้นฉบับ/i);
});
test('record action preserves contract ID separately from issued financial document ID',()=>{
 const source=(loader as any).originalSourceFromRow;
 assert.deepEqual(source('contract',{id:contract,documentId},'contracts'),{type:'contract',id:contract,documentId});
 assert.deepEqual(source('invoice',{id:contract,invoiceId:documentId},'billing'),{type:'invoice',id:contract,documentId});
 assert.deepEqual(source('receipt',{id:documentId},'receipts'),{type:'receipt',id:documentId,documentId});
});
