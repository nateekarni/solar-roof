import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {RecordJobLink} from './record-job-link';

test('notification and report details retain their actual job destination',()=>{
 for(const resource of ['notifications','reports']) {
  const html=renderToStaticMarkup(<RecordJobLink resource={resource} jobId="job/123?" locale="en"/>);
  assert.match(html,/href="\/reports\?job=job%2F123%3F"/);
  assert.match(html,/>Open job</);
 }
 for(const props of [{resource:'billing',jobId:'job'},{resource:'notifications',jobId:null},{resource:'reports',jobId:''}]) {
  assert.equal(renderToStaticMarkup(<RecordJobLink {...props} locale="th"/>),'');
 }
});
