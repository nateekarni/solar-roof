import assert from 'node:assert/strict';
import {statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('Coolify project-root rendering mounts the checked-in EMQX config file', () => {
  const result = spawnSync(
    'docker',
    [
      'compose',
      '--project-directory',
      '.',
      '--env-file',
      'infra/docker/.env.emqx.example',
      '-f',
      'infra/docker/docker-compose.emqx.yml',
      'config',
      '--format',
      'json',
    ],
    {cwd: repositoryRoot, encoding: 'utf8'},
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const compose = JSON.parse(result.stdout);
  const configMount = compose.services.mqtt.volumes.find(
    volume => volume.target === '/opt/emqx/etc/emqx.conf',
  );
  const expectedSource = join(repositoryRoot, 'infra/docker/emqx/emqx.conf');

  assert.ok(configMount, 'EMQX config mount is missing');
  assert.equal(configMount.type, 'bind');
  assert.equal(configMount.source, expectedSource);
  assert.ok(statSync(configMount.source).isFile(), `${configMount.source} must be a file`);
});
