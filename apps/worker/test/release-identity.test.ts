import assert from 'node:assert/strict';
import test from 'node:test';
import {workerReleaseIdentity} from '../src/health/release-identity.js';

test('worker runtime identity changes with operational configuration without exposing values',()=>{
  const base=workerReleaseIdentity({STORAGE_SECRET_KEY:'fixture-secret',HISTORY_RESTORE_WORKER_ENABLED:'false'});
  assert.equal(JSON.stringify(base).includes('fixture-secret'),false);
  for(const key of ['HISTORY_RESTORE_WORKER_ENABLED','HISTORY_RESTORE_MAX_ROWS','STORAGE_SECRET_KEY','ENERGY_SUMMARY_WORKER_ENABLED'])assert.notEqual(base.configurationFingerprint,workerReleaseIdentity({STORAGE_SECRET_KEY:'fixture-secret',HISTORY_RESTORE_WORKER_ENABLED:'false',[key]:'changed'}).configurationFingerprint);
});
