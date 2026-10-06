import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
test('phase timing records failure timestamps and preserves command exit status', () => {
  const dir = mkdtempSync(join(tmpdir(), 'solar-timing-'));
  const summary = join(dir, 'summary');
  try {
    const result = spawnSync(process.execPath, [resolve('scripts/ci/phase-timing.mjs'), 'integration', process.execPath, '-e', 'process.exit(23)'], { env: { ...process.env, GITHUB_STEP_SUMMARY: summary }, encoding: 'utf8' });
    assert.equal(result.status, 23, result.stderr);
    assert.match(readFileSync(summary, 'utf8'), /integration.*\d{4}-\d{2}-\d{2}T.*\d{4}-\d{2}-\d{2}T.*\d+\.\d{3}s.*23/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
