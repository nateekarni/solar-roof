import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Fast Release is cancellable, isolated from deployment, and publishes only application images', () => {
  const workflow = read('.github/workflows/fast-release.yml');

  assert.match(workflow, /^name:\s*Fast Release$/m);
  assert.match(workflow, /cancel-in-progress:\s*true/);
  assert.match(workflow, /packages:\s*write/);
  assert.match(workflow, /web-first-smoke\.sh/);
  assert.match(workflow, /for app in api worker web/);
  assert.match(workflow, /Dockerfile\.postgres-backup|postgres-backup\/Dockerfile/);
  assert.match(workflow, /needs\.classify\.outputs\.infrastructure != 'true'/);
  assert.doesNotMatch(workflow, /COOLIFY_API_TOKEN|coolify-deploy\.mjs/);
  assert.doesNotMatch(workflow, /for app in api worker web mqtt certbot/);
});

test('Deep Verification retains infrastructure gates and cannot deploy', () => {
  const workflow = read('.github/workflows/ci-staging.yml');

  assert.match(workflow, /^name:\s*Deep Verification$/m);
  assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /recovery-drill\.sh/);
  assert.match(workflow, /managed-staging-smoke\.sh/);
  assert.doesNotMatch(workflow, /Deploy Tested Digests to Staging|COOLIFY_API_TOKEN/);
});

test('staging deployment is manual, immutable, and non-cancellable', () => {
  const workflow = read('.github/workflows/deploy-staging.yml');

  assert.match(workflow, /^name:\s*Deploy Staging$/m);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
  for (const input of ['commit_sha', 'api_image', 'worker_image', 'web_image', 'mqtt_image', 'certbot_image']) {
    assert.match(workflow, new RegExp(`\\n\\s{6}${input}:`));
  }
  assert.match(workflow, /coolify-deploy\.mjs/);
  assert.doesNotMatch(workflow, /pull_request:|\npush:/);
});

test('operator docs describe the three-image Fast Release and manual Production promotion', () => {
  const ci = read('.github/CI.md');
  const runbook = read('docs/runbooks/coolify-web-first-deployment-th.md');
  const combined = `${ci}\n${runbook}`;

  for (const term of ['Fast Release', 'Deep Verification', 'API_IMAGE', 'WORKER_IMAGE', 'WEB_IMAGE']) {
    assert.match(combined, new RegExp(term));
  }
  assert.match(ci, /Production[^\n]*(manual|ด้วยตนเอง)|manual[^\n]*Production/i);
  assert.match(ci, /infrastructure[^\n]*Deep Verification|Deep Verification[^\n]*infrastructure/i);
  assert.match(runbook, /Fast Release[^\n]*API_IMAGE[^\n]*WORKER_IMAGE[^\n]*WEB_IMAGE/i);
  assert.match(runbook, /POSTGRES_IMAGE[^\n]*(คงเดิม|ไม่เปลี่ยน|unchanged)/i);
});
