import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

for(const scenario of ['fresh','duplicate','already-applied'] as const)test(`supported migration runner handles document identity: ${scenario}`, async () => {
  const migration = 'infra/migrations/058_user_document_identity.sql';
  const root = new URL('../../../../', import.meta.url);
  const entry = new URL('./db-migrate.ts', import.meta.url);
  const sql = await readFile(new URL(migration, root), 'utf8');
  // Run the actual entry point in a child process. Only the external database
  // and dotenv boundaries are replaced; file reads and migration checksums are real.
  const script = `
    import {registerHooks} from 'node:module';
    const pgSource = ${JSON.stringify(`
      import {readFile} from 'node:fs/promises';
      import {createHash} from 'node:crypto';
      const root = ${JSON.stringify(root.href)};
      const events = [];
      const client = {
        async query(sql, params) {
          if (sql.startsWith('SELECT checksum')) {
            if (params[0] === ${JSON.stringify(migration)}) return {rows: ${scenario==='already-applied'?'[{checksum:"unreleased-previous-checksum"}]':'[]'}};
            const content = await readFile(new URL(params[0], root), 'utf8');
            return {rows: [{checksum: createHash('sha256').update(content.replaceAll('\\r\\n', '\\n')).digest('hex')}]};
          }
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') events.push({sql});
          else if (sql.startsWith('INSERT INTO schema_migrations')) events.push({sql, params});
          else if (!sql.startsWith('SELECT pg_advisory_') && !sql.startsWith('CREATE TABLE IF NOT EXISTS schema_migrations')) events.push({sql});
          if (${JSON.stringify(scenario)} === 'duplicate' && sql.includes('Duplicate normalized position names')) throw new Error('Duplicate normalized position names');
          return {rows: []};
        },
        release() {},
      };
      export class Pool {
        async connect() { return client; }
        async end() { console.log('MIGRATION_EVENTS:' + JSON.stringify(events)); }
      }
    `)};
    registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === 'pg') return {url: 'test:pg', shortCircuit: true};
        if (specifier === 'dotenv') return {url: 'test:dotenv', shortCircuit: true};
        return nextResolve(specifier, context);
      },
      load(url, context, nextLoad) {
        if (url === 'test:pg') return {format: 'module', source: pgSource, shortCircuit: true};
        if (url === 'test:dotenv') return {format: 'module', source: 'export function config() {}', shortCircuit: true};
        return nextLoad(url, context);
      },
    });
    await import(${JSON.stringify(entry.href)});
  `;
  const result = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), '--input-type=module', '-e', script], {
    env: {...process.env, DATABASE_URL: 'postgresql://unused@127.0.0.1:1/test_migration_runner', TSX_TSCONFIG_PATH: fileURLToPath(new URL('../../tsconfig.json', import.meta.url))},
    encoding: 'utf8', timeout: 20000,
  });
  assert.equal(result.status, scenario==='fresh'?0:1, result.stderr);
  const eventLine = result.stdout.split(/\r?\n/).find(line => line.startsWith('MIGRATION_EVENTS:'));
  assert.ok(eventLine, result.stdout);
  const events=JSON.parse(eventLine.slice('MIGRATION_EVENTS:'.length));
  if(scenario==='duplicate'){
    assert.match(result.stderr,/Duplicate normalized position names/);
    assert.deepEqual(events,[{sql:'BEGIN'},{sql},{sql:'ROLLBACK'}]);return;
  }
  if(scenario==='already-applied'){
    assert.match(result.stderr,/Applied migration changed/);assert.deepEqual(events,[]);return;
  }
  assert.deepEqual(events, [
    {sql: 'BEGIN'},
    {sql},
    {sql: 'INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', params: [migration, createHash('sha256').update(sql.replaceAll('\r\n', '\n')).digest('hex')]},
    {sql: 'COMMIT'},
  ]);
});
