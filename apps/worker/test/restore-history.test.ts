import assert from 'node:assert/strict';
import test from 'node:test';
import {RestoreHistoryJob} from '../src/jobs/restore-history.job.js';
import {restoreLimits} from '../src/jobs/archive-policy.js';
import type {Pool} from 'pg';
import type {ArchiveObjectStore} from '../src/jobs/archive-object-store.js';
import {gzipSync} from 'node:zlib';

test('restore rejects compressed catalog budget before downloading an object',async()=>{
 let reads=0,released=false;
 const client={release(){released=true;},async query(sql:string){
  if(sql.includes('transaction_timestamp'))return {rows:[{at:new Date()}]};
  if(sql.includes('FROM telemetry_archives'))return {rows:[{range_from:new Date('2025-01-01T00:00:00+07:00'),range_to:new Date('2025-01-02T00:00:00+07:00'),bytes:513*1024*1024}]};
  return {rows:[]};
 }};
 const pool={async connect(){return client;}} as unknown as Pool;
 const store={read(){reads++;throw Error('unexpected_download');}} as unknown as ArchiveObjectStore;
 await assert.rejects(new RestoreHistoryJob(pool,store,store).restore('00000000-0000-0000-0000-000000000001','2025-01-01','2025-01-02','00000000-0000-0000-0000-000000000002',AbortSignal.timeout(1000)),/archive_compressed_limit/);
 assert.equal(reads,0);assert.equal(released,true);assert.equal(restoreLimits({}).maxCompressedBytes,512*1024*1024);
});

test('restore bounds inflated bytes before uploading an artifact',async()=>{
 const previous=process.env.HISTORY_RESTORE_MAX_UNCOMPRESSED_BYTES;process.env.HISTORY_RESTORE_MAX_UNCOMPRESSED_BYTES='128';
 const bytes=gzipSync(Buffer.from(JSON.stringify({schemaVersion:1,reading:{site_id:'00000000-0000-0000-0000-000000000001',source_time:'2025-01-01T01:00:00Z',evidence:'x'.repeat(500)}})+'\n'));
 const client={release(){},async query(sql:string){if(sql.includes('transaction_timestamp'))return {rows:[{at:new Date()}]};if(sql.includes('FROM telemetry_archives'))return {rows:[{range_from:new Date('2025-01-01T00:00:00+07:00'),range_to:new Date('2025-01-02T00:00:00+07:00'),bytes:bytes.length}]};if(sql.includes('count(*)'))return {rows:[{count:0}]};return {rows:[],rowCount:1};}};
 const store={async *read(){yield bytes;},async upload(){throw Error('unexpected_upload');}} as unknown as ArchiveObjectStore;
 try{await assert.rejects(new RestoreHistoryJob({async connect(){return client;}} as unknown as Pool,store,store).restore('00000000-0000-0000-0000-000000000001','2025-01-01','2025-01-02','00000000-0000-0000-0000-000000000002',AbortSignal.timeout(1000)),/archive_uncompressed_limit/);}
 finally{if(previous===undefined)delete process.env.HISTORY_RESTORE_MAX_UNCOMPRESSED_BYTES;else process.env.HISTORY_RESTORE_MAX_UNCOMPRESSED_BYTES=previous;}
});
