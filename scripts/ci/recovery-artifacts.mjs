// Original object/config backup utility. No deletion or overwrite of recovery generations.
import {createRequire} from 'node:module';
import {createCipheriv,createDecipheriv,createHash,randomBytes,scryptSync} from 'node:crypto';
const require=createRequire(new URL('../../apps/api/package.json',import.meta.url));
const {ListObjectsV2Command,GetObjectCommand,PutObjectCommand}=require('@aws-sdk/client-s3');
const hash=b=>createHash('sha256').update(b).digest('hex');
function seal(bytes,key){if(bytes.length>67108864)throw Error("Plaintext exceeds 64MiB envelope");const salt=randomBytes(16),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',scryptSync(key,salt,32),iv);const data=Buffer.concat([cipher.update(bytes),cipher.final()]);return Buffer.concat([salt,iv,cipher.getAuthTag(),data]);}
function open(bytes,key){const cipher=createDecipheriv('aes-256-gcm',scryptSync(key,bytes.subarray(0,16),32),bytes.subarray(16,28));cipher.setAuthTag(bytes.subarray(28,44));return Buffer.concat([cipher.update(bytes.subarray(44)),cipher.final()]);}
async function read(client,bucket,key,encrypted=false){
 const r=await client.send(new GetObjectCommand({Bucket:bucket,Key:key})),limit=67108864+(encrypted?44:0);
 if(Number(r.ContentLength)>limit){r.Body?.destroy?.();throw Error('Object exceeds approved document backup envelope');}
 const chunks=[];let size=0;
 try{for await(const chunk of r.Body){size+=chunk.length;if(size>limit)throw Error('Object exceeds approved document backup envelope');chunks.push(Buffer.from(chunk));}}finally{r.Body?.destroy?.();}
 return Buffer.concat(chunks,size);
}
export function assertArtifactCoverage(manifest,requiredObjects,requiredConfigHash){
 if(manifest.configHash!==requiredConfigHash)throw Error('PITR configuration checkpoint mismatch');
 const inventory=new Map(manifest.objects.map(object=>[object.key,object.sha256]));
 for(const object of requiredObjects)if(inventory.get(object.key)!==object.sha256)throw Error('PITR original object coverage missing or mismatched');
}
export async function backupArtifacts({source,repository,sourceBucket,repositoryBucket,key,config,generation}){
 if(!key||key.length<24)throw Error('Separate artifact encryption key required');
 if(!/^[a-zA-Z0-9-]+$/.test(generation))throw Error('Invalid generation');
 const prefix=`artifacts/${generation}/`,manifest={version:1,startedAt:new Date().toISOString(),objects:[],configHash:hash(config)};
 let token;
 do {const page=await source.send(new ListObjectsV2Command({Bucket:sourceBucket,...(token?{ContinuationToken:token}:{})}));for(const object of page.Contents||[]){const bytes=await read(source,sourceBucket,object.Key);const target=prefix+hash(Buffer.from(object.Key));await repository.send(new PutObjectCommand({Bucket:repositoryBucket,Key:target,Body:seal(bytes,key),IfNoneMatch:'*'}));const verified=open(await read(repository,repositoryBucket,target,true),key);if(hash(verified)!==hash(bytes))throw Error('Backup object read-back mismatch');manifest.objects.push({key:object.Key,target,sha256:hash(bytes),size:bytes.length});}token=page.NextContinuationToken;}while(token);
 await repository.send(new PutObjectCommand({Bucket:repositoryBucket,Key:prefix+'config',Body:seal(config,key),IfNoneMatch:'*'}));
 manifest.completedAt=new Date().toISOString();
 await repository.send(new PutObjectCommand({Bucket:repositoryBucket,Key:prefix+'manifest',Body:seal(Buffer.from(JSON.stringify(manifest)),key),IfNoneMatch:'*'}));
 return {manifestKey:prefix+'manifest',objects:manifest.objects.length};
}
export async function restoreArtifacts({destination,repository,destinationBucket,repositoryBucket,key,manifestKey}){
 const manifest=JSON.parse(open(await read(repository,repositoryBucket,manifestKey,true),key).toString());
 const existing=await destination.send(new ListObjectsV2Command({Bucket:destinationBucket,MaxKeys:1}));if(existing.Contents?.length)throw Error('Refusing nonempty object restore destination');
 for(const object of manifest.objects){const bytes=open(await read(repository,repositoryBucket,object.target,true),key);if(hash(bytes)!==object.sha256)throw Error('Original object checksum mismatch');await destination.send(new PutObjectCommand({Bucket:destinationBucket,Key:object.key,Body:bytes,IfNoneMatch:'*'}));if(hash(await read(destination,destinationBucket,object.key))!==object.sha256)throw Error('Restored object checksum mismatch');}
 const config=open(await read(repository,repositoryBucket,manifestKey.replace(/manifest$/,'config'),true),key);if(hash(config)!==manifest.configHash)throw Error('Config checksum mismatch');
 return {manifest,config};
}
// Run as a separate Coolify scheduled/one-shot resource using the tested API image.
if(process.argv[1]&&new URL(import.meta.url).pathname.endsWith(process.argv[1].replaceAll('\\','/').split('/').at(-1))&&['backup','restore'].includes(process.argv[2])){
 const {readFileSync,writeFileSync}=await import('node:fs');
 const {S3Client}=require('@aws-sdk/client-s3');
 const env=name=>{if(!process.env[name])throw Error(name+' is required');return process.env[name];};
 const client=prefix=>new S3Client({endpoint:env(prefix+'_ENDPOINT'),region:env(prefix+'_REGION'),forcePathStyle:true,credentials:{accessKeyId:env(prefix+'_ACCESS_KEY'),secretAccessKey:env(prefix+'_SECRET_KEY')}});
 const repository=client('DR_REPOSITORY'),source=client('DR_DOCUMENTS'),repositoryBucket=env('DR_REPOSITORY_BUCKET'),key=env('DR_ARTIFACT_CIPHER_PASS');
 try {if(process.argv[2]==='backup'){const result=await backupArtifacts({source,repository,sourceBucket:env('DR_DOCUMENTS_BUCKET'),repositoryBucket,key,config:readFileSync(env('DR_CONFIG_EXPORT_FILE')),generation:randomBytes(16).toString('hex')});console.log(JSON.stringify(result));}
 else {const required=JSON.parse(readFileSync(env('DR_REQUIRED_INVENTORY_FILE'),'utf8'));const result=await restoreArtifacts({destination:source,repository,destinationBucket:env('DR_DOCUMENTS_BUCKET'),repositoryBucket,key,manifestKey:env('DR_ARTIFACT_MANIFEST_KEY')});assertArtifactCoverage(result.manifest,required.objects,required.configHash);writeFileSync(env('DR_CONFIG_RESTORED_FILE'),result.config,{flag:'wx',mode:0o600});console.log(JSON.stringify({objects:result.manifest.objects.length,configVerified:true}));}}
 finally{repository.destroy();source.destroy();}
}
