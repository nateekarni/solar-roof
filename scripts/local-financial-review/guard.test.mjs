import test from 'node:test';
import assert from 'node:assert/strict';
import {assertTarget,assertOwnership,assertVolume} from './guard.mjs';
const good='postgresql://review:local-financial-only@127.0.0.1:15449/solar_financial_flow_review';
test('exact isolated database target',()=>{assertTarget(good,'solar_financial_flow_review');for(const bad of [good.replace('127.0.0.1','localhost'),good.replace('15449','5432'),good.replace('/solar_financial_flow_review','/postgres'),good.replace('postgresql:','https:')])assert.throws(()=>assertTarget(bad,'solar_financial_flow_review'));assert.throws(()=>assertTarget(good,'postgres'));});
test('nonempty dataset requires exact marker',()=>{assertOwnership(0,null);assertOwnership(2,'solar-financial-flow-review-v1');assert.throws(()=>assertOwnership(2,null));assert.throws(()=>assertOwnership(2,'other'));});
test('volume deletion requires exact name and compose ownership',()=>{const labels={'com.docker.compose.project':'solar-dashboard-review','com.docker.compose.volume':'review-postgres'};assertVolume('solar-dashboard-review_review-postgres',labels,'old');assert.throws(()=>assertVolume('production',labels,'old'));assert.throws(()=>assertVolume('solar-dashboard-review_review-postgres',{},'old'));});
