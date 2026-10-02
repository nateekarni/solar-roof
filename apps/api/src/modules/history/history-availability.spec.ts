import assert from 'node:assert/strict';
import test from 'node:test';
import {HistoryService} from './history.service.js';
import {ReportJobService} from '../reports/report-job.service.js';
test('disabled history requests fail before opening a database transaction',async()=>{
 const old=process.env.HISTORY_RESTORE_ENABLED;delete process.env.HISTORY_RESTORE_ENABLED;let opened=false;
 const service=new HistoryService({transaction(){opened=true;throw Error('unexpected_database');}} as never,{} as never);
 try{await assert.rejects(service.requestRestore('actor','00000000-0000-0000-0000-000000000001','2025-01-01','2025-01-02'),(error:any)=>error.getStatus?.()===503);assert.equal(opened,false);}
 finally{if(old===undefined)delete process.env.HISTORY_RESTORE_ENABLED;else process.env.HISTORY_RESTORE_ENABLED=old;}
});
test('disabled history retry fails before opening a database transaction',async()=>{
 const old=process.env.HISTORY_RESTORE_ENABLED;delete process.env.HISTORY_RESTORE_ENABLED;let opened=false;
 const service=new ReportJobService({transaction(){opened=true;throw Error('unexpected_database');}} as never,{async get(){return {kind:'restore'};}} as never);
 try{await assert.rejects(service.retry('actor','job'),(error:any)=>error.getStatus?.()===503);assert.equal(opened,false);}
 finally{if(old===undefined)delete process.env.HISTORY_RESTORE_ENABLED;else process.env.HISTORY_RESTORE_ENABLED=old;}
});
