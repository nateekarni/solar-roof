import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
function run(action, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'solar-browser-test-'));
  const log = join(dir, 'calls');
  writeFileSync(join(dir, 'pnpm'), '#!/usr/bin/env bash\nif [[ "$*" == *package.json* ]]; then echo "${TEST_VERSION:-1.63.0}"; else exit "${TEST_PROBE_STATUS:-0}"; fi\n', { mode: 0o755 });
  writeFileSync(join(dir, 'docker'), '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$TEST_LOG"\ncase "$1" in inspect) if [[ "$*" == *State.Running* ]]; then echo "${TEST_RUNNING:-true}"; else echo "${TEST_OWNER:-123-1-verify}"; fi;; run) exit "${TEST_RUN_STATUS:-0}";; pull) exit "${TEST_PULL_STATUS:-0}";; logs) echo browser-diagnostics;; esac\n', { mode: 0o755 });
  const setup = 'export PATH="$(cygpath -u "$TEST_BIN" 2>/dev/null || printf "%s" "$TEST_BIN"):$PATH"; bash "$TEST_SCRIPT" "$TEST_ACTION"';
  const result = spawnSync(bash, ['-c', setup], { cwd: dir, encoding: 'utf8', env: { ...process.env, CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_JOB: 'verify', TEST_BIN: dir, TEST_LOG: log, TEST_SCRIPT: resolve('scripts/ci/browser-server.sh').replaceAll('\\', '/'), TEST_ACTION: action, ...overrides } });
  const calls = (() => { try { return readFileSync(log, 'utf8'); } catch { return ''; } })();
  rmSync(dir, { recursive: true, force: true });
  return { ...result, calls };
}
test('version mismatch fails before pulling or creating a browser container', () => {
  const result = run('start', { TEST_VERSION: '1.62.0' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /version mismatch/i);
  assert.equal(result.calls, '');
});
test('pull failure propagates without attempting to start a container', () => {
  const result = run('start', { TEST_PULL_STATUS: '19' });
  assert.equal(result.status, 19);
  assert.match(result.calls, /^pull /);
  assert.doesNotMatch(result.calls, /run /);
});
test('cleanup refuses containers owned by another CI run', () => {
  const result = run('cleanup', { TEST_OWNER: 'other-run' });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.calls, /rm /);
});
test('cleanup captures diagnostics and removes only the owned container', () => {
  const result = run('cleanup');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.calls, /logs solar-ci-browser-123-1-verify/);
  assert.match(result.calls, /rm -f solar-ci-browser-123-1-verify/);
  assert.doesNotMatch(result.calls, /prune|volume/);
});
test('refuses local invocation before any Docker operations', () => {
  const result = run('start', { GITHUB_ACTIONS: 'false' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires GitHub Actions/);
  assert.equal(result.calls, '');
});
test('successful startup uses a loopback server and confirms readiness', () => {
  const result = run('start');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Browser server ready/);
  assert.match(result.calls, /--network host --ipc host/);
  assert.match(result.calls, /run-server --host 127.0.0.1 --port 13999/);
});
test('container startup failure preserves status and emits diagnostics', () => {
  const result = run('start', { TEST_RUN_STATUS: '17' });
  assert.equal(result.status, 17);
  assert.match(result.stdout, /browser-diagnostics/);
});
test('exited server fails without accepting another listener on its port', () => {
  const result = run('start', { TEST_RUNNING: 'false' });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /browser-diagnostics/);
  assert.doesNotMatch(result.stdout, /Browser server ready/);
});
