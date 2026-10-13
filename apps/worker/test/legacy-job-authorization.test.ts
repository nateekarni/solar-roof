import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import {ReportExportJob} from '../src/jobs/report-export.job.js';
import {HistoryJobsWorker} from '../src/jobs/history-worker.js';
test('queued legacy financial report and arbitrary restore are denied before data access',async()=>{
 const reports=Object.create(ReportExportJob.prototype) as ReportExportJob;
 const history=Object.create(HistoryJobsWorker.prototype) as HistoryJobsWorker;
 assert.equal(await reports.allowed({kind:'report',created_by:'admin',payload:{type:'billing'}}),false);
 assert.equal(await history.allowed({kind:'restore',created_by:'operator',payload:{siteId:'arbitrary'}}),false);
});
