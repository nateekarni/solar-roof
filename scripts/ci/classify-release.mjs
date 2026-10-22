import {appendFileSync, readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const PROTECTED_PREFIXES = [
  '.github/workflows/',
  'scripts/ci/',
  'infra/ci/',
  'infra/docker/postgres-backup/',
];

function normalizePath(path) {
  return path.trim().replaceAll('\\', '/').replace(/^\.\//, '');
}

function isProtected(path) {
  return PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix))
    || /^infra\/docker\/docker-compose(?:\.[^/]+)?\.ya?ml$/.test(path);
}

export function classifyReleasePaths(paths) {
  const normalized = [...new Set(paths
    .filter((path) => typeof path === 'string')
    .map(normalizePath)
    .filter(Boolean))];
  const protectedPaths = normalized.filter(isProtected);

  return {
    infrastructure: protectedPaths.length > 0,
    paths: protectedPaths,
  };
}

function changedPaths(base, head) {
  for (const revision of [base, head]) {
    const verification = spawnSync(
      'git',
      ['rev-parse', '--verify', `${revision}^{commit}`],
      {encoding: 'utf8'},
    );
    if (verification.status !== 0) {
      throw new Error(`Invalid Git revision: ${revision}`);
    }
  }

  const diff = spawnSync(
    'git',
    ['diff', '--name-only', '--no-renames', base, head, '--'],
    {encoding: 'utf8'},
  );
  if (diff.status !== 0) {
    throw new Error(diff.stderr.trim() || 'Unable to read changed paths');
  }
  return diff.stdout.split(/\r?\n/);
}

function run() {
  const revisions = process.argv.slice(2);
  if (revisions.length !== 0 && revisions.length !== 2) {
    throw new Error('Usage: node classify-release.mjs [<base> <head>]');
  }

  const paths = revisions.length === 2
    ? changedPaths(revisions[0], revisions[1])
    : readFileSync(0, 'utf8').split(/\r?\n/);
  const result = classifyReleasePaths(paths);

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `infrastructure=${result.infrastructure}\n`,
      'utf8',
    );
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
