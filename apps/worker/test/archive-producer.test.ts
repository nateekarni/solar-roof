import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import {ArchiveProducer} from '../src/jobs/archive-producer.js';
test('archive producer defaults off without acquiring a database connection',async()=>{
 let calls=0;const pool={async connect(){calls++;throw Error('unexpected');}} as unknown as Pool;
 const before=process.env.TELEMETRY_ARCHIVE_ENABLED;delete process.env.TELEMETRY_ARCHIVE_ENABLED;
 try{assert.equal(await new ArchiveProducer(pool).enqueueOne(),false);assert.equal(calls,0);}
 finally{if(before===undefined)delete process.env.TELEMETRY_ARCHIVE_ENABLED;else process.env.TELEMETRY_ARCHIVE_ENABLED=before;}
});
test('enabled archive consumer does not implicitly enable the producer',async()=>{
 let calls=0;const pool={async connect(){calls++;throw Error('unexpected');}} as unknown as Pool;
 const before=process.env.TELEMETRY_ARCHIVE_ENABLED,scheduler=process.env.TELEMETRY_ARCHIVE_SCHEDULER_ENABLED;process.env.TELEMETRY_ARCHIVE_ENABLED='true';delete process.env.TELEMETRY_ARCHIVE_SCHEDULER_ENABLED;
 try{assert.equal(await new ArchiveProducer(pool).enqueueOne(),false);assert.equal(calls,0);}
 finally{if(before===undefined)delete process.env.TELEMETRY_ARCHIVE_ENABLED;else process.env.TELEMETRY_ARCHIVE_ENABLED=before;if(scheduler===undefined)delete process.env.TELEMETRY_ARCHIVE_SCHEDULER_ENABLED;else process.env.TELEMETRY_ARCHIVE_SCHEDULER_ENABLED=scheduler;}
});
