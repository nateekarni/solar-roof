import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync} from 'node:fs';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Pool} from 'pg';
import os from 'node:os';
import {assertIsolatedDatabase,createFixture} from './fixtures.js';
import {AuthService} from '../../src/modules/identity/auth.service.js';
import {DatabaseService} from '../../src/database/database.service.js';
import {metricsSnapshot} from '../../src/common/observability/metrics.js';

test('platform harness supplies isolated database guards and redacted metrics', async () => {
  assert.ok(existsSync('src/common/observability/metrics.ts'), 'Missing platform metrics');
  const {observeDuration,metricsSnapshot}=await import('../../src/common/observability/metrics.js');
  observeDuration('request',12,{'route-template':'/v1/sites/:id',method:'GET',status:'200',token:'test-secret',user:'test-secret'});
  const redacted=JSON.stringify(metricsSnapshot());
  assert.equal(redacted.includes('test-secret'),false);
  assert.ok(redacted.includes('/v1/sites/:id'));
});

test('rejects production database before connection', () => {
  for(const value of ['postgresql://solar:test-secret@solar.fowir.com:15432/solar_readiness','postgresql://solar:x@127.0.0.1:15432/solar','postgresql://solar:x@127.0.0.1:15432/solar_readiness?host=remote','https://127.0.0.1:15432/solar_readiness']) assert.throws(()=>assertIsolatedDatabase(value));
});

test('competing runner and unfinished suites fail without stopping the owning Docker stack', async () => {
  const root=new URL('../../../../',import.meta.url);
  const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
  const competing=spawnSync(bash,['scripts/ci/platform-check.sh','all-fast'],{cwd:root,encoding:'utf8'});
  assert.equal(competing.status,1);
  assert.ok(competing.stderr.includes('locked'));
  assert.ok(competing.stdout.includes('Implemented:'));
  assert.ok(competing.stdout.includes('Not ready:'));
  const missing=spawnSync(bash,['scripts/ci/platform-check.sh','invitation'],{cwd:root,encoding:'utf8'});
  assert.equal(missing.status,1);
  assert.equal((await fetch(process.env.READINESS_API_URL+'/health')).status,200);
});

test('real HTTP assigns request IDs and logs route templates without authorization or query values', async () => {
  const base=process.env.READINESS_API_URL;
  assert.equal(base,'http://127.0.0.1:13001');
  const response=await fetch(base+'/health?token=test-secret',{headers:{Authorization:'Bearer test-secret'}});
  assert.equal(response.status,200);
  assert.match(response.headers.get('x-request-id') ?? '',/^[a-f0-9-]{36}$/);
  const forbidden=await fetch(base+'/v1/sites?token=test-secret',{headers:{Authorization:'Bearer test-secret'}});
  assert.equal(forbidden.status,401);
  const logs=execFileSync('docker',['compose','-f','infra/ci/compose.yml','logs','--no-color','api'],{cwd:new URL('../../../../',import.meta.url),encoding:'utf8'});
  assert.equal(logs.includes('test-secret'),false);
  assert.ok(logs.includes('"event":"request"'));
  assert.ok(logs.includes('"route":"/v1/sites","status":401'));
});

test('baseline revision upgrade preserves populated users, readings and financial documents; fresh schema requires no proposal', async () => {
  const connectionString=assertIsolatedDatabase(process.env.READINESS_DATABASE_URL ?? '');
  process.env.DATABASE_URL=connectionString;
  const observedDb=new DatabaseService();
  try { await observedDb.query('SELECT $1::text AS secret',['test-secret']); }
  finally { await observedDb.onModuleDestroy(); }
  const redacted=JSON.stringify(metricsSnapshot());
  assert.equal(redacted.includes('test-secret'),false);
  assert.ok(metricsSnapshot().some(sample=>sample.name==='query_duration'));
  assert.ok(metricsSnapshot().some(sample=>sample.name==='db_pool_waiting'));
  const db=new Pool({connectionString});const client=await db.connect();
  const schema='platform_'+randomUUID().replaceAll('-','');
  const fresh=schema+'_fresh';
  const owned:string[]=[];
  const root=new URL('../../../../',import.meta.url);
  async function migrate(baseline:boolean) {
    const path='apps/api/src/scripts/db-migrate.ts';
    const source=baseline?execFileSync('git',['show',`098c14748fd6cb5ee8a405f58a5bd5ebef5fd798:${path}`],{cwd:root,encoding:'utf8'}):await readFile(new URL(path,root),'utf8');
    if(baseline) for(const match of source.matchAll(/"(infra\/migrations\/[^"\n]+\.sql)"/g)) {
      const migration=match[1]!;
      // Git checkout line-ending conversion is not a migration edit; both runs use
      // the same materialized checkout bytes for the production checksum ledger.
      assert.equal((await readFile(new URL(migration,root),'utf8')).replaceAll('\r\n','\n'),execFileSync('git',['show',`098c14748fd6cb5ee8a405f58a5bd5ebef5fd798:${migration}`],{cwd:root,encoding:'utf8'}).replaceAll('\r\n','\n'),'Applied baseline migration content must remain immutable');
    }
    const temporary=new URL(`apps/api/src/scripts/.platform-migrate-${randomUUID()}.ts`,root);
    // Keep the original script's relative migration paths and execute its actual ledger logic.
    await writeFile(temporary,source);
    try {
      execFileSync(process.execPath,[fileURLToPath(new URL('node_modules/tsx/dist/cli.mjs',root)),'--tsconfig',fileURLToPath(new URL('apps/api/tsconfig.json',root)),fileURLToPath(temporary)],{
        cwd:root,encoding:'utf8',env:{...process.env,DATABASE_URL:connectionString,PGOPTIONS:`-c search_path=${owned.at(-1)},public`}
      });
    } finally {await unlink(temporary);}
  }
  try {
    await client.query(`CREATE SCHEMA ${schema}`);owned.push(schema);await client.query(`SET search_path TO ${schema},public`);
    await migrate(true);
    const fixture=await createFixture(client);
    const passwordAuth=new AuthService('fixture-only-access','fixture-only-refresh');
    const legacyPassword=passwordAuth.hashPassword('Fixture-migration-original-123!');
    await client.query('UPDATE users SET password_hash=$1,refresh_token_hash=$2 WHERE id=$3',[legacyPassword,'legacy-refresh-hash',fixture.users[0]]);
    const snapshot=async()=>({
      users:(await client.query('SELECT id,email,role,school_id,password_hash,refresh_token_hash FROM users ORDER BY id')).rows,
      readings:(await client.query('SELECT id,device_id,site_id,source_time,normalized_value,raw_payload FROM telemetry_raw ORDER BY id')).rows,
      documents:(await client.query('SELECT id,site_id,document_number,amount,status FROM documents ORDER BY id')).rows
    });
    const original=await snapshot();
    const before=(await client.query('SELECT (SELECT count(*) FROM users) users,(SELECT count(*) FROM telemetry_raw) readings,(SELECT count(*) FROM documents) documents')).rows;
    await migrate(false);
    assert.deepEqual(await snapshot(),original);
    const preserved=(await client.query('SELECT password_hash,refresh_token_hash FROM users WHERE id=$1',[fixture.users[0]])).rows[0];
    assert.equal(passwordAuth.verifyPassword('Fixture-migration-original-123!',preserved.password_hash),true);
    assert.equal(preserved.refresh_token_hash,'legacy-refresh-hash');
    assert.equal((await client.query('SELECT count(*) FROM auth_sessions')).rows[0].count,'0');
    assert.deepEqual((await client.query('SELECT (SELECT count(*) FROM users) users,(SELECT count(*) FROM telemetry_raw) readings,(SELECT count(*) FROM documents) documents')).rows,before);
    assert.equal((await client.query('SELECT amount FROM documents WHERE id=$1',[fixture.documentId])).rows[0].amount,'123.45000000');
    assert.equal((await client.query('SELECT count(*) FROM schools')).rows[0].count,'100');
    assert.equal((await client.query('SELECT count(*) FROM devices')).rows[0].count,'1000');
    assert.equal(before[0].readings,'3000');
    assert.equal((await client.query('SELECT count(*) FROM schema_migrations WHERE name LIKE $1',['%011%'])).rows[0].count,'0');
    const measurements=[];
    for(const [name,sql,params] of [
      ['sites','SELECT id,name FROM sites ORDER BY name',[]],
      ['latest-reading','SELECT source_time,active_power_w,total_energy_kwh FROM telemetry_raw WHERE site_id=$1 ORDER BY source_time DESC LIMIT 1',[fixture.siteIds[0]]],
      ['tenant-sites','SELECT id,name FROM sites WHERE school_id=$1',[fixture.schoolIds[0]]],
      ['documents','SELECT document_number,amount FROM documents WHERE site_id=$1',[fixture.siteIds[0]]]
    ] as const) {
      const started=performance.now();const result=await client.query(sql,[...params]);measurements.push({name,rows:result.rowCount,bytes:Buffer.byteLength(JSON.stringify(result.rows)),milliseconds:performance.now()-started});
    }
    await mkdir(new URL('test/artifacts/',root),{recursive:true});
    await writeFile(new URL('test/artifacts/platform-baseline.json',root),JSON.stringify({revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),baselineRevision:'098c147',hardware:{host:os.platform(),cpus:os.cpus().length,memoryBytes:os.totalmem(),docker:execFileSync('docker',['info','--format','{{.NCPU}} CPUs / {{.MemTotal}} bytes RAM'],{encoding:'utf8'}).trim()},node:process.version,fixture:{schools:100,meters:1000,readings:3000},cache:'warm after fixture inserts; one measured execution per query',measurements},null,2));
    console.log(JSON.stringify(measurements));
    await client.query(`CREATE SCHEMA ${fresh}`);owned.push(fresh);await client.query(`SET search_path TO ${fresh},public`);
    await migrate(false);
    assert.equal((await client.query('SELECT count(*) FROM schema_migrations WHERE name LIKE $1',['%011%'])).rows[0].count,'0');
    assert.equal((await client.query('SELECT count(*) FROM documents')).rows[0].count,'0');
  } finally {
    await client.query('SET search_path TO public');
    // Only the unique schema successfully created by this test is eligible for deletion.
    for(const name of owned.reverse()) await client.query(`DROP SCHEMA ${name} CASCADE`);client.release();await db.end();
  }
});
