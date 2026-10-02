import 'reflect-metadata';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {S3Client} from '@aws-sdk/client-s3';
import {HistoryJobsWorker} from '../../../worker/src/jobs/history-worker.ts';
assert.equal(process.env.READINESS_DATABASE_URL,'postgresql://solar:ci-only-password@127.0.0.1:15432/solar_readiness');
const port=process.env.PLATFORM_CI_STORAGE_PORT??'19000';assert.ok(['19000','19001'].includes(port));
const pool=new Pool({connectionString:process.env.READINESS_DATABASE_URL,max:4});
const s3=new S3Client({endpoint:`http://127.0.0.1:${port}`,region:'us-east-1',forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:'solar-ci',secretAccessKey:'ci-storage-only-password'}});
const mode=process.env.ARCHIVE_CHILD_MODE,kind=process.env.ARCHIVE_CHILD_KIND??'archive';
const send=s3.send.bind(s3);
s3.send=async(command,...args)=>{
 if(mode==='slow'&&command.constructor.name==='CompleteMultipartUploadCommand'){
  process.send({event:'before-complete',key:command.input.Key});await new Promise(resolve=>process.once('message',resolve));
 }
 const result=await send(command,...args);
 if(mode==='crash-upload'&&command.constructor.name==='CompleteMultipartUploadCommand')process.exit(73);
 return result;
};
const worker=new HistoryJobsWorker(pool,s3,'solar-readiness');
if(mode==='crash-publish')worker.store.complete=async()=>process.exit(74);
const job=await worker.store.claim(kind,'D1-child');assert.ok(job);
await worker.execute(job,'D1-child');await pool.end();s3.destroy();process.exit(0);
