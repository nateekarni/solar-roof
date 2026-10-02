import assert from 'node:assert/strict';
import React from 'react';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {SummaryStatus} from './summary-status';

test('preparing summaries expose an accessible message instead of implying final totals',()=>{
  const html=renderToStaticMarkup(<SummaryStatus model={{enabled:true,status:'preparing',watermark:'2026-10-01T00:00:00Z'}}/>);
  assert.match(html,/role="status"/);assert.match(html,/กำลังอัปเดตข้อมูลสรุป/);assert.match(html,/Asia\/Bangkok/);
  assert.equal(renderToStaticMarkup(<SummaryStatus model={{enabled:true,status:'ready',watermark:null}}/>),'');
  assert.equal(renderToStaticMarkup(<SummaryStatus model={{enabled:false,status:'preparing',watermark:null}}/>),'');
});
