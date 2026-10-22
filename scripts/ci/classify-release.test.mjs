import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

import {classifyReleasePaths} from './classify-release.mjs';

test('application and documentation paths stay on the fast release lane', () => {
  assert.deepEqual(classifyReleasePaths([
    'apps/api/src/main.ts',
    'apps/web/app/page.tsx',
    'infra/docker/Dockerfile.api',
    'docs/runbooks/example.md',
  ]), {infrastructure: false, paths: []});
});

test('protected infrastructure path families require deep verification', () => {
  const cases = [
    '.github/workflows/fast-release.yml',
    'scripts/ci/integration.sh',
    'infra/ci/web-first-smoke.sh',
    'infra/docker/Dockerfile.mqtt',
    'infra/docker/Dockerfile.certbot',
    'infra/docker/postgres-backup/Dockerfile',
    'infra/docker/mosquitto/mosquitto.conf',
    'infra/docker/docker-compose.web.yml',
  ];

  for (const path of cases) {
    assert.deepEqual(classifyReleasePaths([path]), {
      infrastructure: true,
      paths: [path],
    });
  }
});

test('normalizes separators, removes duplicates, and ignores empty lines', () => {
  assert.deepEqual(classifyReleasePaths([
    'scripts\\ci\\integration.sh',
    '',
    'scripts/ci/integration.sh',
    '  ',
  ]), {
    infrastructure: true,
    paths: ['scripts/ci/integration.sh'],
  });
});

test('CLI reads newline-delimited paths and writes the GitHub output contract', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'solar-release-classifier-'));
  const output = join(directory, 'github-output.txt');

  try {
    const result = spawnSync(process.execPath, ['scripts/ci/classify-release.mjs'], {
      cwd: new URL('../..', import.meta.url),
      encoding: 'utf8',
      input: 'apps/api/src/main.ts\ninfra/docker/Dockerfile.mqtt\n',
      env: {...process.env, GITHUB_OUTPUT: output},
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      infrastructure: true,
      paths: ['infra/docker/Dockerfile.mqtt'],
    });
    assert.equal(await readFile(output, 'utf8'), 'infrastructure=true\n');
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
