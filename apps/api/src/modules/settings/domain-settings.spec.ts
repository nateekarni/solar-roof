import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSettingsPatch } from './domain-settings.js';
test('settings updates reject cross-domain, combined retention, and arbitrary keys',()=>{
 assert.throws(()=>validateSettingsPatch('technical',{revision:0,settings:{documentRetentionYears:1}}),/setting/);
 assert.throws(()=>validateSettingsPatch('business',{revision:0,settings:{rawTelemetryRetentionYears:1}}),/setting/);
 assert.throws(()=>validateSettingsPatch('business',{revision:0,settings:{aggregateRetentionYears:1}}),/setting/);
 assert.throws(()=>validateSettingsPatch('technical',{revision:0,settings:{defaultFetchFrequencySec:0}}),/setting/);
 assert.deepEqual(validateSettingsPatch('technical',{revision:3,settings:{defaultFetchFrequencySec:60}}),{revision:3,settings:{defaultFetchFrequencySec:60}});
});
