import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import type {ArchiveObjectStore} from '../src/jobs/archive-object-store.js';
import {ArchiveTelemetryJob} from '../src/jobs/archive-telemetry.job.js';
test('archive extraction respects the same row budget before publication',async()=>{
 const before=process.env.HISTORY_RESTORE_MAX_ROWS;process.env.HISTORY_RESTORE_MAX_ROWS='1';let pages=0,published=false;
 const client={release(){},async query(sql:string){if(sql.includes('transaction_timestamp'))return {rows:[{at:new Date()}]};if(sql.includes('FROM telemetry_raw'))return {rows:pages++?[]:[{id:'a',cursor_time:'2025-01-01T01:00:00Z',reading:'{}',mappings:'[]'},{id:'b',cursor_time:'2025-01-01T02:00:00Z',reading:'{}',mappings:'[]'}]};if(sql.includes('INSERT INTO telemetry_archives'))published=true;return {rows:[]};}};
 const objects={async upload(_key:string,input:AsyncIterable<Buffer>){for await(const _ of input){}throw Error('unexpected_publication');}} as unknown as ArchiveObjectStore;
 try{await assert.rejects(new ArchiveTelemetryJob({async connect(){return client;}} as unknown as Pool,objects).archive('00000000-0000-0000-0000-000000000001','2025-01-01','2025-01-02'),/archive_row_limit/);assert.equal(published,false);}
 finally{if(before===undefined)delete process.env.HISTORY_RESTORE_MAX_ROWS;else process.env.HISTORY_RESTORE_MAX_ROWS=before;}
});
