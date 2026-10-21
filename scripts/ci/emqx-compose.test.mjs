import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('Coolify project-root rendering bakes EMQX config into the image without a host file bind', () => {
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
  const expectedContext = repositoryRoot;
  const dockerfilePath = join(repositoryRoot, 'infra/docker/Dockerfile.emqx');
  const configPath = join(repositoryRoot, 'infra/docker/emqx/emqx.conf');

  assert.equal(configMount, undefined, 'Coolify cannot deploy repository files as host bind mounts');
  assert.equal(compose.services.mqtt.build.context, expectedContext);
  assert.equal(compose.services.mqtt.build.dockerfile, 'infra/docker/Dockerfile.emqx');
  assert.ok(statSync(dockerfilePath).isFile(), `${dockerfilePath} must be a file`);
  assert.ok(statSync(configPath).isFile(), `${configPath} must be a file`);

  const dockerfile = readFileSync(dockerfilePath, 'utf8');
  assert.match(dockerfile, /^FROM emqx\/emqx:5\.8\.3$/m);
  assert.match(
    dockerfile,
    /^COPY infra\/docker\/emqx\/emqx\.conf \/opt\/emqx\/etc\/emqx\.conf$/m,
  );
});

test('custom EMQX config passes the pinned broker schema validation', () => {
  const configPath = join(repositoryRoot, 'infra/docker/emqx/emqx.conf');
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--entrypoint',
      '/opt/emqx/bin/emqx',
      '--mount',
      `type=bind,source=${configPath},target=/opt/emqx/etc/emqx.conf,readonly`,
      '-e',
      'EMQX_NODE__COOKIE=test-cookie',
      'emqx/emqx:5.8.3',
      'check_config',
    ],
    {cwd: repositoryRoot, encoding: 'utf8'},
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
