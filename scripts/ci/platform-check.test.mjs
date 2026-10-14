import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const shell=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
const suites=['harness','session','invitation','csrf','financial-safety','financial-core','operations','ingestion','rollup','reports','ui-contracts','ui-jobs','accessibility','archive','history','readiness'];

function aggregate(mock) {
  return spawnSync(shell,['-c',`real_bash=$(command -v bash)
bash() { printf 'DISPATCH:%s:%s\\n' "$2" "\${3:-}"; ${mock}; }
export -f bash
"$real_bash" scripts/ci/platform-check.sh all-fast --prebuilt`],{encoding:'utf8'});
}

test('all-fast runs every isolated suite and reports every failure',()=>{
  const result=aggregate('[[ "$2" != operations && "$2" != history ]]');
  assert.equal(result.status,1);
  assert.deepEqual(result.stdout.match(/^DISPATCH:.*$/gm),suites.map(name=>`DISPATCH:${name}:--prebuilt`));
  assert.match(result.stderr,/Failed platform suites: operations history/);
});

test('all-fast succeeds only when every isolated suite succeeds',()=>{
  const result=aggregate('return 0');
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(result.stdout.match(/^DISPATCH:.*$/gm),suites.map(name=>`DISPATCH:${name}:--prebuilt`));
});
