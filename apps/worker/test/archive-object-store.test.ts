import assert from 'node:assert/strict';
import test from 'node:test';
import {Readable} from 'node:stream';
import type {S3Client} from '@aws-sdk/client-s3';
import {ArchiveObjectStore} from '../src/jobs/archive-object-store.js';

test('multipart records identity before the first part and checksum before complete',async()=>{
 const order:string[]=[],parts:Buffer[]=[];let execution='';
 const client={async send(command:any){
  switch(command.constructor.name){
   case 'CreateMultipartUploadCommand':order.push('create');execution=command.input.Metadata.execution;return {UploadId:'upload'};
   case 'UploadPartCommand':order.push('part');parts.push(command.input.Body);return {ETag:'part'};
   case 'CompleteMultipartUploadCommand':order.push('complete');return {};
   case 'GetObjectCommand':order.push('verify');return {Body:Readable.from(parts),ETag:'stored',ContentLength:parts.reduce((sum,b)=>sum+b.length,0),Metadata:{execution}};
   default:throw Error('Unexpected command');
  }
 }} as unknown as S3Client;
 const stored=await new ArchiveObjectStore(client,'fixture').upload('key',Readable.from([Buffer.from('stored bytes')]),AbortSignal.timeout(1000),async checkpoint=>{order.push('checkpoint');assert.equal(checkpoint.bytes,12);assert.match(checkpoint.checksum,/^[a-f0-9]{64}$/);},async pending=>{order.push('started');assert.equal(pending.uploadId,'upload');assert.equal(pending.key,'key');assert.equal(pending.execution,execution);});
 assert.equal(stored.etag,'stored');assert.deepEqual(order,['create','started','part','checkpoint','complete','verify']);
});

test('multipart rejects compressed byte budget and aborts its owned upload',async()=>{
 const old=process.env.HISTORY_RESTORE_MAX_COMPRESSED_BYTES;process.env.HISTORY_RESTORE_MAX_COMPRESSED_BYTES='10';let aborted=false;
 const client={async send(command:any){if(command.constructor.name==='CreateMultipartUploadCommand')return {UploadId:'owned'};if(command.constructor.name==='AbortMultipartUploadCommand'){aborted=true;return {};}throw Error('unexpected_part');}} as unknown as S3Client;
 try{await assert.rejects(new ArchiveObjectStore(client,'fixture').upload('key',Readable.from([Buffer.from('more than ten bytes')]),AbortSignal.timeout(1000)),/archive_compressed_limit/);assert.equal(aborted,true);}
 finally{if(old===undefined)delete process.env.HISTORY_RESTORE_MAX_COMPRESSED_BYTES;else process.env.HISTORY_RESTORE_MAX_COMPRESSED_BYTES=old;}
});
