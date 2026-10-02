import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import test from 'node:test';
import {resolve} from 'node:path';
// A stale/partial DB-only restore must never earn recovery verification.
test('physical PITR reaches the target and preserves persisted evidence and every role scope',()=>{
 const path=process.env.RECOVERY_RESULT_FILE||resolve('../../test/artifacts/recovery-result.json');
 assert.ok(existsSync(path),'Run the isolated recovery drill; missing evidence is not PASS');
 const r=JSON.parse(readFileSync(path,'utf8'));
 assert.equal(r.status,'passed');assert.equal(r.profile,'fixture');
 assert.match(r.revision,/^[a-f0-9]{40}$/);assert.ok(r.backupId);assert.ok(r.targetTime);
 assert.equal(r.beforeMarkerRestored,true);assert.equal(r.afterMarkerRestored,false);
 assert.ok(r.rpoSeconds>=0&&r.rpoSeconds<=900);assert.ok(r.rtoSeconds>=0&&r.rtoSeconds<=14400);
 assert.equal(r.rawChecksPassed,true);assert.equal(r.mqttReplayVerification,'passed-fixture');
 assert.equal(r.artifactChecksPassed,true);assert.equal(r.configChecksPassed,true);
 assert.equal(r.nonemptyRestoreRejected,true);assert.equal(r.inaccessibleRepositoryRejected,true);assert.equal(r.missingWalRejected,true);
 assert.deepEqual(r.rolesVerified,['owner','admin','operator','accountant','school_user']);
 assert.equal(r.postgresMajor,16);assert.equal(r.timescaleVersion,'2.18.2');
 assert.equal(r.productionRecoveryVerified,false,'A local fixture cannot prove independent-host recovery');
});
