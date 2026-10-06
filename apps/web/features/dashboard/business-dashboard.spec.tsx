import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {BusinessProductionTrend} from './business-dashboard';

test('long production and billing histories expose a named keyboard scroll region',()=>{
 const points=Array.from({length:31},(_,index)=>({date:`2026-10-${String(index+1).padStart(2,'0')}`,value:index+1}));
 for(const charges of [false,true]) {
  const html=renderToStaticMarkup(<BusinessProductionTrend points={points} locale="en" charges={charges}/>);
  assert.match(html,/<div[^>]*tabindex="0"[^>]*role="region"[^>]*aria-label="(?:Production over time|Billed amounts over time)"/);
 }
});
