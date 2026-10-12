import assert from 'node:assert/strict';
import test from 'node:test';
import {alertRuleState} from './alert-rule-state';
test('rule empty states depend on configured rules, never event rows or pending fetches',()=>{assert.equal(alertRuleState(false,[]),'loading');assert.equal(alertRuleState(true,[]),'unconfigured');assert.equal(alertRuleState(true,[{enabled:false}]),'disabled');assert.equal(alertRuleState(true,[{enabled:false},{enabled:true}]),'active');});
