import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {RecordJobLink} from './record-job-link';

test('notification and report details omit retired unrestricted job destinations',()=>{
 for(const resource of ['notifications','reports']) {
  const html=renderToStaticMarkup(<RecordJobLink resource={resource} jobId="job/123?" locale="en"/>);
  assert.equal(html,'');
 }
 for(const props of [{resource:'billing',jobId:'job'},{resource:'notifications',jobId:null},{resource:'reports',jobId:''}]) {
  assert.equal(renderToStaticMarkup(<RecordJobLink {...props} locale="th"/>),'');
 }
});
