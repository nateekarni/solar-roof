import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const manifests = [
  'apps/api/package.json',
  'apps/web/package.json',
  'apps/worker/package.json',
  'packages/api-contracts/package.json',
  'packages/connectors/package.json',
  'packages/domain/package.json',
  'packages/i18n/package.json',
  'packages/ui/package.json',
];

for (const app of ['api', 'worker', 'web']) {
  test(`Dockerfile.${app} caches dependency installation before source copy`, () => {
    const dockerfile = readFileSync(
      new URL(`../../infra/docker/Dockerfile.${app}`, import.meta.url),
      'utf8',
    );
    const rootManifestCopy = dockerfile.indexOf('COPY package.json pnpm-lock.yaml pnpm-workspace.yaml');
    const install = dockerfile.indexOf('RUN pnpm install --frozen-lockfile');
    const sourceCopy = dockerfile.indexOf('COPY . .');

    assert.ok(rootManifestCopy >= 0, 'root dependency manifests must be copied explicitly');
    assert.ok(rootManifestCopy < install, 'root manifests must be copied before install');
    assert.ok(install < sourceCopy, 'dependency install must be cached before source copy');
    for (const manifest of manifests) {
      const copy = dockerfile.indexOf(`COPY ${manifest}`);
      assert.ok(copy >= 0, `${manifest} must be copied explicitly`);
      assert.ok(copy < install, `${manifest} must be copied before install`);
    }
    assert.match(dockerfile, /USER app/);
  });
}
