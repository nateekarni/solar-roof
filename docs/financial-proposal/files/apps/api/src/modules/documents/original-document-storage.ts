import {S3Client,GetObjectCommand} from '@aws-sdk/client-s3';
import {createHash} from 'node:crypto';

/** Read an existing original only. Never fetch a caller-provided URL or regenerate history. */
export async function readOriginalPdf(key:string):Promise<{bytes:Buffer;sha256:string}> {
 if(!key||key.includes('://')||key.startsWith('/')||key.split('/').includes('..'))throw new Error('Invalid original object key');
 const {STORAGE_ENDPOINT,STORAGE_REGION,STORAGE_BUCKET,STORAGE_ACCESS_KEY,STORAGE_SECRET_KEY}=process.env;
 if(!STORAGE_ENDPOINT||!STORAGE_REGION||!STORAGE_BUCKET||!STORAGE_ACCESS_KEY||!STORAGE_SECRET_KEY)throw new Error('Original document storage is not configured');
 const client=new S3Client({endpoint:STORAGE_ENDPOINT,region:STORAGE_REGION,forcePathStyle:true,credentials:{accessKeyId:STORAGE_ACCESS_KEY,secretAccessKey:STORAGE_SECRET_KEY}});
 try {
  const object=await client.send(new GetObjectCommand({Bucket:STORAGE_BUCKET,Key:key}));
  const limit=20*1024*1024;
  if(!object.Body||(object.ContentLength??0)>limit)throw new Error('Original PDF unavailable or too large');
  const chunks:Buffer[]=[];let size=0;
  for await(const part of object.Body as AsyncIterable<Uint8Array>){const chunk=Buffer.from(part);size+=chunk.length;if(size>limit)throw new Error('Original PDF too large');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);
  if(bytes.subarray(0,5).toString()!=='%PDF-')throw new Error('Stored original is not a PDF');
  return {bytes,sha256:createHash('sha256').update(bytes).digest('hex')};
 }finally{client.destroy();}
}
