import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {backupArtifacts,restoreArtifacts,assertArtifactCoverage} from '../../scripts/ci/recovery-artifacts.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
class S3 {objects=new Map();async send(c){const {Key,Body}=c.input;switch(c.constructor.name){case 'ListObjectsV2Command':return {Contents:[...this.objects.keys()].map(Key=>({Key}))};case 'PutObjectCommand':this.objects.set(Key,Body);return {};case 'GetObjectCommand':{const b=this.objects.get(Key);return {ContentLength:b.length,Body:(async function*(){yield b;})()};}default:throw Error('unexpected command')}}}
const source=new S3(),repo=new S3(),dest=new S3(),bytes=Buffer.alloc(64*1024*1024,65),config=Buffer.from('fixture config'),key='fixture-only-independent-encryption-key';source.objects.set('boundary',bytes);
const saved=await backupArtifacts({source,repository:repo,sourceBucket:'s',repositoryBucket:'r',key,config,generation:'boundary'});
const restored=await restoreArtifacts({destination:dest,repository:repo,destinationBucket:'d',repositoryBucket:'r',key,manifestKey:saved.manifestKey});
assert.equal(hash(dest.objects.get('boundary')),hash(bytes));
assertArtifactCoverage(restored.manifest,[{key:'boundary',sha256:hash(bytes)}],hash(config));
assert.throws(()=>assertArtifactCoverage(restored.manifest,[{key:'created-after-checkpoint',sha256:hash(Buffer.from('late'))}],hash(config)),/coverage/);
assert.throws(()=>assertArtifactCoverage(restored.manifest,[],hash(Buffer.from('changed config'))),/configuration/);
source.objects.set('too-large',Buffer.alloc(64*1024*1024+1));
await assert.rejects(backupArtifacts({source,repository:new S3(),sourceBucket:'s',repositoryBucket:'r',key,config,generation:'reject'}),/envelope/);
console.log('PASS exact64MiB encrypted/readback/restore; oversized rejected; late original and mismatched config fail coverage');
