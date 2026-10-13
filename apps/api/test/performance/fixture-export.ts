import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {S3Client} from '@aws-sdk/client-s3';
import type {Pool} from 'pg';
import {ReportExportJob} from '../../../worker/src/jobs/report-export.job.js';
import {assertIsolatedDatabase} from '../platform/fixtures.js';

let claimSetup:Promise<unknown>=Promise.resolve();

// Artificial internal load only. Production HTTP/worker authorization stays denied.
// The caller obtains this pool through ownedPool's Docker project/port checks.
export async function fixtureExport(db:Pool,userId:string,reportIds:string[]) {
  assertIsolatedDatabase(db.options.connectionString??'');
  assert.match(process.env.COMPOSE_PROJECT_NAME??'',/^solar-ci-[a-f0-9-]{36}$/);
  const jobId=randomUUID(),owner=randomUUID(),started=performance.now();
  const payload={type:'energy',format:'csv',dateFrom:new Date(Date.now()-89*86400000).toISOString().slice(0,10),dateTo:new Date().toISOString().slice(0,10)};
  const storage=new S3Client({endpoint:'http://127.0.0.1:19000',region:'us-east-1',forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:'solar-ci',secretAccessKey:'ci-storage-only-password'}});
  class FixtureWorker extends ReportExportJob {
    override async allowed(job:any){return job.id===jobId&&job.created_by===userId&&job.kind==='report'&&job.payload.type==='energy';}
  }
  const worker=new FixtureWorker(db,storage,'solar-readiness');
  try {
    // Serialize insertion/claim only; extraction and uploads run concurrently.
    const claimed=claimSetup.then(async()=>{
      await db.query("INSERT INTO platform_jobs(id,kind,payload,scope,created_by,payload_hash) VALUES($1,'report',$2,NULL,$3,$4)",[jobId,payload,userId,'capacity-fixture:'+jobId]);
      reportIds.push(jobId);
      const job=await worker.store.claim('report',owner);
      assert.equal(job?.id,jobId,'Only the isolated capacity job may be claimed');
      return job;
    });
    claimSetup=claimed.catch(()=>undefined);
    const job=await claimed;
    await worker.execute(job,owner);
    const row=(await db.query('SELECT status,error_code,row_count,manifest,object_key FROM platform_jobs WHERE id=$1',[jobId])).rows[0];
    assert.equal(row.status,'ready',`Fixture export: ${row.error_code}`);
    assert.ok(Number(row.row_count)>0,'Export must contain real seeded history');
    assert.ok(row.manifest.bytes>0&&row.manifest.checksum&&row.manifest.etag&&row.object_key,'Worker verified durable object bytes');
    return {jobId,ms:performance.now()-started,mode:'isolated-internal-fixture',rowCount:Number(row.row_count)};
  } finally {storage.destroy();}
}
