import test from 'node:test';
import assert from 'node:assert/strict';
import * as names from './guard.mjs';
test('fixture displays are readable without test prefixes and every role has a display label',()=>{
 assert.equal(typeof names.fixtureDisplayName,'function');
 assert.equal(names.fixtureDisplayName('[TEST] อาคารหลักเอ'),'อาคารหลักเอ');
 assert.equal(names.fixtureDisplayName('[DEMO] คลองแสน'),'คลองแสน');
 for(const role of ['admin','owner','operator','accountant','customer_user','school_user']){
  assert.equal(typeof names.roleDisplayName(role),'string');
  assert.notEqual(names.roleDisplayName(role),role);
 }
});
