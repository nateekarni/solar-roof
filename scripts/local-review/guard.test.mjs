import test from 'node:test';
import assert from 'node:assert/strict';
import {assertReviewTarget} from './guard.mjs';
test('only the dedicated loopback review database is writable',()=>{
 assert.doesNotThrow(()=>assertReviewTarget('postgresql://review:local@127.0.0.1:15439/solar_dashboard_review','solar_dashboard_review'));
 for(const url of ['postgresql://u:p@production:5432/solar_dashboard_review','postgresql://u:p@127.0.0.1:5432/solar_platform','postgresql://u:p@localhost:15439/solar_dashboard_review'])assert.throws(()=>assertReviewTarget(url,'solar_dashboard_review'));
 assert.throws(()=>assertReviewTarget('postgresql://u:p@127.0.0.1:15439/solar_dashboard_review','production'));
});
