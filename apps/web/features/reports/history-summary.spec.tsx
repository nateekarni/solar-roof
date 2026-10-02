import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {HistorySummary,jobDownloadFilename} from './history-summary';
import type {JobRecord} from '@solar/api-contracts';
test('history metadata names gzip data and never promises an unmeasured completion time',()=>{
 const history:NonNullable<JobRecord['history']>={siteId:'site',from:'2025-01-01',to:'2025-01-02',format:'jsonl.gz'};
 const job={id:'job',kind:'restore',history};
 const html=renderToStaticMarkup(<HistorySummary history={job.history} locale="th"/>);
 assert.match(html,/2025-01-01/);assert.match(html,/2025-01-02/);assert.match(html,/JSONL/);assert.match(html,/ยังไม่ยืนยันเวลาประมวลผล/);
 assert.equal(jobDownloadFilename(job),'history-job.jsonl.gz');assert.equal(jobDownloadFilename({id:'report',kind:'report'}),'report-report.csv');
});
