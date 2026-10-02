import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import type {S3Client} from '@aws-sdk/client-s3';
import {HistoryJobsWorker} from '../src/jobs/history-worker.js';
test('history worker defaults off and preserves borrowed pool and S3 ownership',async()=>{
 let connections=0,poolEnded=false,storageClosed=false;
 const pool={async connect(){connections++;throw Error('unexpected_connection');},async end(){poolEnded=true;}} as unknown as Pool;
 const s3={destroy(){storageClosed=true;}} as unknown as S3Client;
 const before={restore:process.env.HISTORY_RESTORE_WORKER_ENABLED,archive:process.env.TELEMETRY_ARCHIVE_ENABLED};
 delete process.env.HISTORY_RESTORE_WORKER_ENABLED;delete process.env.TELEMETRY_ARCHIVE_ENABLED;
 try{const worker=new HistoryJobsWorker(pool,s3,'fixture');worker.onModuleInit();await worker.onModuleDestroy();assert.equal(connections,0);assert.equal(poolEnded,false);assert.equal(storageClosed,false);}
 finally{for(const [key,value] of [['HISTORY_RESTORE_WORKER_ENABLED',before.restore],['TELEMETRY_ARCHIVE_ENABLED',before.archive]] as const){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
