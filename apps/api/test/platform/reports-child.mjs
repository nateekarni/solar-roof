import 'reflect-metadata';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {S3Client} from '@aws-sdk/client-s3';
import {ReportExportJob} from '../../../worker/src/jobs/report-export.job.ts';
const db=new Pool({connectionString:process.env.READINESS_DATABASE_URL});
const storagePort=process.env.PLATFORM_CI_STORAGE_PORT??'19000';
assert.ok(['19000','19001'].includes(storagePort),'Only an approved fixture storage port is allowed');
const storage=new S3Client({endpoint:`http://127.0.0.1:${storagePort}`,region:'us-east-1',forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:'solar-ci',secretAccessKey:'ci-storage-only-password'}});
const realSend=storage.send.bind(storage);
const mode=process.env.REPORT_CHILD_MODE;
const broken=mode?.startsWith('blackhole')?new S3Client({endpoint:process.env.REPORT_BLACKHOLE_ENDPOINT,region:'us-east-1',forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:'solar-ci',secretAccessKey:'ci-storage-only-password'}}):null;
storage.send=async(command,...args)=>{
 if(broken&&(command.constructor.name==='AbortMultipartUploadCommand'||mode==='blackhole-shutdown'&&command.constructor.name==='UploadPartCommand'))return broken.send(command,...args);
 if(process.env.REPORT_CHILD_MODE==='delay'&&command.constructor.name==='CompleteMultipartUploadCommand'){
  process.send({event:'before-complete',key:command.input.Key});
  await new Promise(resolve=>process.once('message',resolve));
 }
 const result=await realSend(command,...args);
 if(process.env.REPORT_CHILD_MODE==='crash'&&command.constructor.name==='CompleteMultipartUploadCommand')process.exit(73);
 return result;
};
const worker=new ReportExportJob(db,storage,'solar-readiness');
if(mode==='blackhole-shutdown'){
 process.env.REPORT_WORKER_ENABLED='true';worker.onModuleInit();
 process.once('message',async()=>{await worker.onModuleDestroy();await db.end();broken?.destroy();process.exit(0);});
}else{await worker.runOnce();await db.end();storage.destroy();broken?.destroy();process.exit(0);}
