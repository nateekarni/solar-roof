import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {RateSettingsWorkspace} from './rate-settings-workspace';
import * as rates from './rate-settings-workspace';

test('site rates are the main view and creating templates requires opening management',()=>{
 const html=renderToStaticMarkup(<RateSettingsWorkspace/>);
 assert.match(html,/จัดการเรตต้นแบบ/);
 assert.match(html,/role="status"/);
 assert.match(html,/กำลังโหลดอัตราค่าไฟ/);
 assert.doesNotMatch(html,/ยังไม่มีไซต์งาน/);
 assert.doesNotMatch(html,/placeholder="ชื่อต้นแบบ"/);
});

test('confirmation requires affected sites and explicit acceptance of scheduled replacement',()=>{
 assert.equal(typeof rates.canConfirmRatePreview,'function');
 assert.equal(rates.canConfirmRatePreview(null,false),false);
 assert.equal(rates.canConfirmRatePreview({sites:[]},true),false);
 assert.equal(rates.canConfirmRatePreview({sites:[{futureRates:null}]},false),true);
 assert.equal(rates.canConfirmRatePreview({sites:[{futureRates:[{rate:'3'}]}]},false),false);
 assert.equal(rates.canConfirmRatePreview({sites:[{futureRates:[{rate:'3'}]}]},true),true);
});

test('invalid rate drafts identify a recoverable problem before requesting preview',()=>{
 assert.equal(typeof rates.rateDraftError,'function');
 const valid={selection:'selected' as const,selected:['site'],matched:'',rate:'3.25',date:'2026-10-09',reason:'Correction'};
 assert.equal(rates.rateDraftError(valid),null);
 assert.equal(rates.rateDraftError({...valid,selected:[]}), 'selection');
 assert.equal(rates.rateDraftError({...valid,rate:'-1'}), 'rate');
 assert.equal(rates.rateDraftError({...valid,date:'2026-02-30'}), 'date');
 assert.equal(rates.rateDraftError({...valid,reason:'  '}), 'reason');
 assert.equal(rates.rateDraftError({...valid,selection:'matched',matched:''}), 'matched');
});
