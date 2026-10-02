import {createHash,randomUUID} from 'node:crypto';
import {addAbortSignal,type Readable} from 'node:stream';
import {S3Client,CreateMultipartUploadCommand,UploadPartCommand,CompleteMultipartUploadCommand,AbortMultipartUploadCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {restoreLimits} from './archive-policy.js';

export interface StoredArchive {key:string;execution:string;checksum:string;bytes:number;etag:string}
export interface PendingArchive {key:string;execution:string;uploadId:string}
/** Bounded multipart storage, with an independent read of stored bytes before publication. */
export class ArchiveObjectStore {
  constructor(readonly client:S3Client,readonly bucket:string){}
  async upload(key:string,input:AsyncIterable<Buffer>,signal:AbortSignal,beforeComplete?:(stored:StoredArchive)=>Promise<void>,started?:(pending:PendingArchive)=>Promise<void>,execution=randomUUID()):Promise<StoredArchive>{
    const hash=createHash('sha256'),limits=restoreLimits();
    const send=(command:any)=>this.client.send(command,{abortSignal:signal}) as Promise<any>;
    const created=await send(new CreateMultipartUploadCommand({Bucket:this.bucket,Key:key,ContentType:'application/gzip',Metadata:{execution}}));
    const uploadId=created.UploadId;
    let bytes=0,size=0,part=0,chunks:Buffer[]=[];const parts:{PartNumber:number;ETag:string}[]=[];
    const flush=async()=>{const buffer=Buffer.concat(chunks,size);hash.update(buffer);bytes+=buffer.length;const result=await send(new UploadPartCommand({Bucket:this.bucket,Key:key,UploadId:uploadId,PartNumber:++part,Body:buffer}));parts.push({PartNumber:part,ETag:result.ETag});chunks=[];size=0;};
    try{
      await started?.({key,execution,uploadId});
      for await(const chunk of input){signal.throwIfAborted();if(bytes+size+chunk.length>limits.maxCompressedBytes)throw Error('archive_compressed_limit');chunks.push(chunk);size+=chunk.length;if(size>=5*1024*1024)await flush();}
      if(size||!part)await flush();
      const result={key,execution,checksum:hash.digest('hex'),bytes,etag:''};
      await beforeComplete?.(result);signal.throwIfAborted();
      await send(new CompleteMultipartUploadCommand({Bucket:this.bucket,Key:key,UploadId:uploadId,MultipartUpload:{Parts:parts},IfNoneMatch:'*'}));
      result.etag=await this.verify(result,signal);
      return result;
    }catch(error){
      try{await this.client.send(new AbortMultipartUploadCommand({Bucket:this.bucket,Key:key,UploadId:uploadId}),{abortSignal:AbortSignal.timeout(2000)});}catch{/* Orphan cleanup is a separate lifecycle policy; never publish it. */}
      throw error;
    }
  }
  async verify(manifest:Omit<StoredArchive,'etag'>,signal:AbortSignal):Promise<string>{
    if(!Number.isSafeInteger(manifest.bytes)||manifest.bytes<0||manifest.bytes>restoreLimits().maxCompressedBytes||!/^[a-f0-9]{64}$/.test(manifest.checksum??''))throw Error('archive_mismatch');
    const response=await this.client.send(new GetObjectCommand({Bucket:this.bucket,Key:manifest.key}),{abortSignal:signal});
    const body=response.Body as Readable|undefined;
    if(!body||!response.ETag||response.ContentLength!==manifest.bytes||response.Metadata?.execution!==manifest.execution){body?.destroy();throw Error('archive_mismatch');}
    const hash=createHash('sha256');let bytes=0;
    for await(const chunk of addAbortSignal(signal,body)){hash.update(chunk);bytes+=chunk.length;}
    if(bytes!==manifest.bytes||hash.digest('hex')!==manifest.checksum)throw Error('archive_mismatch');
    return response.ETag;
  }
  async abortPending(pending:PendingArchive){
    await this.client.send(new AbortMultipartUploadCommand({Bucket:this.bucket,Key:pending.key,UploadId:pending.uploadId}),{abortSignal:AbortSignal.timeout(2000)}).catch((error:any)=>{if(error.$metadata?.httpStatusCode!==404)throw error;});
  }
  async *read(manifest:StoredArchive,signal:AbortSignal):AsyncGenerator<Buffer>{
    const response=await this.client.send(new GetObjectCommand({Bucket:this.bucket,Key:manifest.key,IfMatch:manifest.etag}),{abortSignal:signal});
    const body=response.Body as Readable|undefined;
    if(!body||response.ETag!==manifest.etag||response.ContentLength!==manifest.bytes||response.Metadata?.execution!==manifest.execution){body?.destroy();throw Error('archive_mismatch');}
    const hash=createHash('sha256');let bytes=0;
    for await(const chunk of addAbortSignal(signal,body)){hash.update(chunk);bytes+=chunk.length;yield chunk;}
    if(bytes!==manifest.bytes||hash.digest('hex')!==manifest.checksum)throw Error('archive_mismatch');
  }
}
