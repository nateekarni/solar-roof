import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { Pool } from 'pg';
import mqtt from 'mqtt';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { assertIsolatedDatabase } from './fixtures.js';
import { DatabaseService } from '../../src/database/database.service.js';
import { IngestionDatabaseService } from '../../src/modules/telemetry/ingestion-database.service.js';
import { metricsSnapshot } from '../../src/common/observability/metrics.js';
import { mkdir, writeFile } from 'node:fs/promises';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => Promise<boolean>, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await check()) return; await pause(50); }
  assert.fail('Timed out waiting for ingestion boundary');
}

test('2000 concurrent work items keep bounded running, pending and gateway state, and serve a second gateway fairly', async () => {
  assert.ok(existsSync('src/modules/telemetry/ingestion-limiter.ts'), 'Missing bounded MQTT admission');
  const { IngestionLimiter } = await import('../../src/modules/telemetry/ingestion-limiter.js');
  const limiter = new IngestionLimiter({ rate: 100000, burst: 100000 });
  let running = 0, maxRunning = 0, maxPending = 0, rejected = 0;
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const order: string[] = [];
  for (let i = 0; i < 2000; i++) {
    const gateway = i < 1000 ? 'A' : 'B';
    if (limiter.submit(gateway, 100, async () => {
      running++; maxRunning = Math.max(maxRunning, running); order.push(gateway);
      await blocked; running--;
    }) === 'rejected') rejected++;
    maxPending = Math.max(maxPending, limiter.snapshot().pending);
  }
  assert.ok(maxRunning <= 8); assert.equal(maxPending, 1024); assert.equal(rejected, 968);
  assert.equal(limiter.submit('overflow', 131073, async () => {}), 'rejected');
  release(); assert.equal(await limiter.shutdown(5000), true);
  assert.equal(order.length, 1032); assert.ok(order.slice(8, 28).includes('B'));
  assert.equal(limiter.submit('A', 1, async () => {}), 'rejected');
});

test('actual API MQTT rejects huge/deep input, commits once before ACK, survives database outage and broker restart, and keeps HTTP available during burst', { timeout: 120000 }, async () => {
  const db = new Pool({ connectionString: assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!) });
  db.on('error', () => {}); // The test intentionally stops PostgreSQL; pg evicts failed idle clients.
  const school = randomUUID(), otherSchool = randomUUID(), site = randomUUID(), otherSite = randomUUID(), gateway = randomUUID(), device = randomUUID(), otherGateway = randomUUID(), otherDevice = randomUUID();
  const topic = `energy/${gateway}/telemetry`, response = `energy/${gateway}/response`;
  const base = process.env.READINESS_API_URL!;
  const compose = (...args: string[]) => execFileSync('docker', ['compose', '-f', 'infra/ci/compose.yml', ...args], { cwd: new URL('../../../../', import.meta.url), stdio: 'pipe' });
  assert.match(process.env.COMPOSE_PROJECT_NAME ?? '', /^solar-ci-[a-f0-9-]{36}$/);
  const client = mqtt.connect('mqtt://127.0.0.1:18883', { reconnectPeriod: 100 });
  const acknowledgments: Record<string, any>[] = [];
  client.on('message', (name, data) => { if ([response, `energy/${otherGateway}/response`].includes(name)) acknowledgments.push(JSON.parse(data.toString())); });
  const publish = (body: string, destination = topic) => new Promise<void>((resolve, reject) => client.publish(destination, body, { qos: 1 }, error => error ? reject(error) : resolve()));
  const payload = (id: string, extra: object = {}) => JSON.stringify({ deviceId: device, gateway, sourceTime: new Date().toISOString(), ingestionId: id, metrics: { activePower: 1200 }, ...extra });
  const ready = () => until(async () => { try { return (await fetch(base + '/ready')).ok; } catch { return false; } }, 30000);
  try {
    await db.query("INSERT INTO schools(id,name,code,region) VALUES($1::uuid,'Q2 school',$1::text,'fixture')", [school]);
    await db.query("INSERT INTO sites(id,school_id,name,capacity_mwp) VALUES($1,$2,'Q2 site',0.1)", [site, school]);
    await db.query("INSERT INTO gateways(id,site_id,name,protocol,endpoint) VALUES($1::uuid,$2,$1::text,'mqtt',$3)", [gateway, site, `energy/${gateway}/#`]);
    await db.query("INSERT INTO devices(id,gateway_id,site_id,name,device_type,model,serial_number) VALUES($1::uuid,$2,$3,'Q2 meter','meter','fixture',$1::text)", [device, gateway, site]);
    await db.query("INSERT INTO schools(id,name,code,region) VALUES($1::uuid,'Q2 second school',$1::text,'fixture')", [otherSchool]);
    await db.query("INSERT INTO sites(id,school_id,name,capacity_mwp) VALUES($1,$2,'Q2 second site',0.1)", [otherSite, otherSchool]);
    await db.query("INSERT INTO gateways(id,site_id,name,protocol,endpoint) VALUES($1::uuid,$2,$1::text,'mqtt',$3)", [otherGateway, otherSite, `energy/${otherGateway}/#`]);
    await db.query("INSERT INTO devices(id,gateway_id,site_id,name,device_type,model,serial_number) VALUES($1::uuid,$2,$3,'Q2 second meter','meter','fixture',$1::text)", [otherDevice, otherGateway, otherSite]);
    compose('restart', 'api'); await ready();
    await until(async () => client.connected);
    await new Promise<void>((resolve, reject) => client.subscribe([response, `energy/${otherGateway}/response`], { qos: 1 }, error => error ? reject(error) : resolve()));
    await publish(payload('huge', { padding: 'x'.repeat(131072) }));
    await publish(payload('deep', { padding: JSON.parse('['.repeat(17) + '0' + ']'.repeat(17)) }));
    await pause(600);
    assert.equal(acknowledgments.length, 0, 'rejected inputs receive broker PUBACK but no success application ACK');
    assert.equal((await db.query('SELECT count(*) FROM telemetry_raw WHERE device_id=$1', [device])).rows[0].count, '0');
    const accepted = payload('durable-retry');
    await publish(accepted);
    await until(async () => acknowledgments.some(ack => ack.ingestionId === 'durable-retry'));
    assert.equal((await db.query('SELECT count(*) FROM telemetry_raw WHERE device_id=$1', [device])).rows[0].count, '1');
    await publish(accepted); await until(async () => acknowledgments.filter(ack => ack.ingestionId === 'durable-retry').length === 2);
    assert.equal(acknowledgments.at(-1)!.duplicate, true);
    assert.equal((await db.query('SELECT count(*) FROM telemetry_raw WHERE device_id=$1', [device])).rows[0].count, '1');

    // Occupy ingress identity capacity with an actual table lock. Read health uses a separate pool.
    const blocker = await db.connect();
    try {
      await blocker.query('BEGIN'); await blocker.query('LOCK TABLE devices IN ACCESS EXCLUSIVE MODE');
      await Promise.all(Array.from({ length: 150 }, (_, i) => publish(payload(`burst-${i}`))));
      await publish(payload('fair-B', { deviceId: otherDevice, gateway: otherGateway }), `energy/${otherGateway}/telemetry`);
      await until(async () => Number((await db.query("SELECT count(*) FROM pg_stat_activity WHERE application_name='solar-api-ingestion' AND wait_event_type='Lock'")).rows[0].count) === 8);
      const before = acknowledgments.length;
      for (let i = 0; i < 5; i++) { const start = performance.now(); assert.equal((await fetch(base + '/health')).status, 200); assert.equal((await fetch(base + '/ready')).status, 200); assert.ok(performance.now() - start < 2000); }
      assert.equal(acknowledgments.length, before, 'locked identity lookup cannot ACK');
      const pools = (await db.query("SELECT application_name,count(*)::int AS connections FROM pg_stat_activity WHERE application_name IN ('solar-api-read','solar-api-ingestion') GROUP BY application_name")).rows;
      assert.ok(pools.find(row => row.application_name === 'solar-api-ingestion').connections <= 8);
      assert.ok(pools.find(row => row.application_name === 'solar-api-read').connections <= 12);
      await blocker.query('ROLLBACK');
    } finally { await blocker.query('ROLLBACK'); blocker.release(); }
    await until(async () => Number((await db.query('SELECT count(*) FROM telemetry_raw WHERE device_id=$1', [device])).rows[0].count) > 1);
    await pause(2500);
    const burstOrder = acknowledgments.filter(ack => ack.ingestionId.startsWith('burst-') || ack.ingestionId === 'fair-B');
    assert.ok(burstOrder.findIndex(ack => ack.ingestionId === 'fair-B') >= 0 && burstOrder.findIndex(ack => ack.ingestionId === 'fair-B') < 20, 'second gateway runs before the first gateway backlog drains');
    assert.ok(acknowledgments.filter(ack => ack.ingestionId.startsWith('burst-')).length < 150, 'burst overload must reject messages (the 50/s token bucket replenishes during real transport)');
    const outage = payload('outage-retry');
    compose('stop', 'postgres');
    await publish(outage); await pause(6000);
    assert.equal(acknowledgments.some(ack => ack.ingestionId === 'outage-retry'), false);
    assert.equal((await fetch(base + '/health')).status, 200);
    compose('start', 'postgres'); await ready();
    await publish(outage); await until(async () => acknowledgments.some(ack => ack.ingestionId === 'outage-retry'));
    compose('restart', 'mqtt'); await ready();
    await until(async () => client.connected);
    await new Promise<void>((resolve, reject) => client.subscribe(response, { qos: 1 }, error => error ? reject(error) : resolve()));
    await publish(outage); await until(async () => acknowledgments.filter(ack => ack.ingestionId === 'outage-retry').length === 2);
    assert.equal(acknowledgments.at(-1)!.duplicate, true);
    await until(async () => compose('logs', '--no-color', 'api').toString().includes('ingress_ack_latency'), 35000);
    const logs = compose('logs', '--no-color', 'api').toString();
    assert.ok(logs.includes('ingress_rejected')); assert.ok(logs.includes('ingress_backlog')); assert.ok(logs.includes('ingress_ack_latency'));
    assert.equal(logs.includes('durable-retry'), false); assert.equal(logs.includes('ci-only-password'), false);
    const stop = () => new Promise<void>((resolve, reject) => {
      const child = spawn('docker', ['compose', '-f', 'infra/ci/compose.yml', 'stop', '-t', '15', 'api'], { cwd: new URL('../../../../', import.meta.url), stdio: 'pipe' });
      child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error('Owned API stop failed')));
    });
    // Actual SIGTERM must allow in-flight durable work to finish before the pool closes.
    const lock = await db.connect();
    try {
      await lock.query('BEGIN'); await lock.query('LOCK TABLE devices IN ACCESS EXCLUSIVE MODE');
      const drain = payload('signal-drain'); await publish(drain);
      await until(async () => Number((await db.query("SELECT count(*) FROM pg_stat_activity WHERE application_name='solar-api-ingestion' AND wait_event_type='Lock'")).rows[0].count) > 0);
      const stopping = stop(); await pause(500); await lock.query('ROLLBACK'); await stopping;
      assert.equal((await db.query("SELECT count(*) FROM telemetry_raw WHERE device_id=$1 AND raw_payload->>'ingestionId'='signal-drain'", [device])).rows[0].count, '1');
      assert.ok(acknowledgments.some(ack => ack.ingestionId === 'signal-drain'), 'commit during drain receives application ACK');
      compose('start', 'api'); await ready();
      await lock.query('BEGIN'); await lock.query('LOCK TABLE devices IN ACCESS EXCLUSIVE MODE');
      const retry = payload('signal-timeout'); await publish(retry);
      await Promise.all(Array.from({ length: 39 }, (_, index) => publish(payload(`signal-blocked-${index}`))));
      await until(async () => Number((await db.query("SELECT count(*) FROM pg_stat_activity WHERE application_name='solar-api-ingestion' AND wait_event_type='Lock'")).rows[0].count) === 8);
      const start = performance.now(); await stop(); assert.ok(performance.now() - start < 12000, 'SIGTERM drain is bounded');
      assert.equal(acknowledgments.some(ack => ack.ingestionId === 'signal-timeout'), false);
      assert.equal(acknowledgments.some(ack => ack.ingestionId.startsWith('signal-blocked-')), false);
      assert.ok(compose('logs', '--no-color', 'api').toString().includes('Ingestion shutdown deadline reached; pending work receives no application ACK'), 'actual queued work reaches the drain deadline');
      await lock.query('ROLLBACK'); compose('start', 'api'); await ready();
      await publish(retry); await until(async () => acknowledgments.some(ack => ack.ingestionId === 'signal-timeout'));
    } finally { await lock.query('ROLLBACK'); lock.release(); }
    await mkdir('../../test/artifacts', { recursive: true });
    await writeFile('../../test/artifacts/q2-ingestion-proof.json', JSON.stringify({ broker: 'EMQX B1 fixture', hugeAndDeepAck: 0, ingressIdentityLockedConnections: 8, readPoolCeiling: 12, ingressPoolCeiling: 8, burstApplicationAcks: acknowledgments.filter(ack => ack.ingestionId.startsWith('burst-')).length, durableDuplicate: true, databaseRecovery: true, brokerRestart: true, actualSignalDrain: true, actualSignalTimeoutRetry: true, actualSignalQueuedDeadline: true, signalBlockedMessages: 40, limits: 'Firmware/B2 capacity remains unverified; managed Mosquitto broker limit is separately checked.' }, null, 2));
  } finally {
    client.end(true);
    compose('start', 'postgres');
    await until(async () => { try { await db.query('SELECT 1'); return true; } catch { return false; } }, 30000);
    await db.query('DELETE FROM telemetry_aggregate WHERE device_id=ANY($1::uuid[])', [[device, otherDevice]]);
    await db.query('DELETE FROM telemetry_raw WHERE device_id=ANY($1::uuid[])', [[device, otherDevice]]);
    await db.query('DELETE FROM devices WHERE id=ANY($1::uuid[])', [[device, otherDevice]]); await db.query('DELETE FROM gateways WHERE id=ANY($1::uuid[])', [[gateway, otherGateway]]);
    await db.query('DELETE FROM sites WHERE id=ANY($1::uuid[])', [[site, otherSite]]); await db.query('DELETE FROM schools WHERE id=ANY($1::uuid[])', [[school, otherSchool]]); await db.end();
  }
});

test('real database adapters isolate identity/mapping/write capacity and enforce the read statement budget', async () => {
  process.env.DATABASE_URL = assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!);
  const read = new DatabaseService(), ingress = new IngestionDatabaseService();
  const held = await Promise.all(Array.from({ length: 8 }, () => ingress.pool.connect()));
  try {
    const rows = await Promise.all(held.map(client => client.query("SELECT current_setting('application_name') AS name")));
    assert.ok(rows.every(result => result.rows[0].name === 'solar-api-ingestion'));
    const { MqttIngestionService } = await import('../../src/modules/telemetry/mqtt-ingestion.service.js');
    const service = new MqttIngestionService(read, ingress);
    for (const body of ['x'.repeat(131073), '['.repeat(17) + '0' + ']'.repeat(17)]) {
      const start = performance.now(); await assert.rejects(service.handleIncomingMessage('energy/fixture/telemetry', body));
      assert.ok(performance.now() - start < 500); assert.equal(ingress.pool.waitingCount, 0, 'invalid JSON never waits on the occupied ingestion pool');
    }
    const mapping = service.getDeviceMappings(randomUUID());
    await until(async () => ingress.pool.waitingCount === 1, 1000);
    assert.equal((await read.query('SELECT 1 AS value')).rows[0].value, 1, 'mapping waits exclusively on ingestion capacity');
    held.pop()!.release(); assert.deepEqual(await mapping, []);
    const readHeld = await Promise.all(Array.from({ length: 12 }, () => read.pool.connect()));
    try {
      const overflow = read.query('SELECT 1');
      await until(async () => read.pool.waitingCount === 1, 1000);
      assert.equal(read.pool.totalCount, 12); readHeld.pop()!.release(); await overflow;
    } finally { for (const client of readHeld) client.release(); }
    const start = performance.now(); assert.equal((await read.query('SELECT 1 AS value')).rows[0].value, 1); assert.ok(performance.now() - start < 2000);
    await assert.rejects(read.query('SELECT pg_sleep(2)'), /statement timeout/);
    assert.ok(metricsSnapshot().some(sample => sample.name === 'read_db_pool_connections'));
    assert.ok(metricsSnapshot().some(sample => sample.name === 'ingest_db_pool_waiting' && sample.value === 1));
  } finally { for (const client of held) client.release(); await ingress.beforeApplicationShutdown(); await read.onModuleDestroy(); }
});

test('admission enforces payload bytes, aggregate queued bytes, rate and shutdown deadline without success', async () => {
  assert.ok(existsSync('src/modules/telemetry/ingestion-limiter.ts'), 'Missing bounded MQTT admission');
  const { IngestionLimiter } = await import('../../src/modules/telemetry/ingestion-limiter.js');
  const limiter = new IngestionLimiter({ concurrency: 1, queueBytes: 100, rate: 1, burst: 2 });
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  assert.equal(limiter.submit('A', 100, () => blocked), 'queued');
  assert.equal(limiter.submit('A', 100, async () => {}), 'queued');
  assert.equal(limiter.submit('B', 1, async () => {}), 'rejected');
  assert.equal(limiter.submit('A', 0, async () => {}), 'rejected');
  assert.equal(await limiter.shutdown(10), false);
  assert.equal(limiter.snapshot().running, 1); assert.equal(limiter.snapshot().pending, 0);
  assert.ok(metricsSnapshot().some(sample => sample.name === 'ingress_shutdown_abandoned' && sample.value! >= 1));
  release();
});

test('default per gateway burst and gateway cardinality cannot grow without bound', async context => {
  const { IngestionLimiter } = await import('../../src/modules/telemetry/ingestion-limiter.js');
  context.mock.method(performance, 'now', () => 0);
  const limiter = new IngestionLimiter();
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const results = Array.from({ length: 150 }, () => limiter.submit('A', 1, () => blocked));
  assert.equal(results.filter(result => result === 'queued').length, 100);
  for (let i = 0; i < 2000; i++) limiter.submit(String(i), 0, () => blocked);
  assert.ok(limiter.snapshot().gateways <= 1024); assert.ok(limiter.snapshot().pending <= 1024);
  release(); assert.equal(await limiter.shutdown(10000), true);
});

test('deadline ordering never dispatches queued work after an overdue clock even before the timer runs', async context => {
  const { IngestionLimiter } = await import('../../src/modules/telemetry/ingestion-limiter.js');
  let now = 0; context.mock.method(performance, 'now', () => now);
  const limiter = new IngestionLimiter({ concurrency: 1 });
  let release!: () => void, queuedStarted = false;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  limiter.submit('A', 1, () => blocked);
  limiter.submit('B', 1, async () => { queuedStarted = true; });
  const drained = limiter.shutdown(10);
  now = 11; release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(queuedStarted, false, 'completion must not pump work after the absolute deadline');
  assert.equal(await drained, false);
});

test('deadline ordering reports timeout when the last completion wins the timer race, including zero deadline', async context => {
  const { IngestionLimiter } = await import('../../src/modules/telemetry/ingestion-limiter.js');
  let now = 0; context.mock.method(performance, 'now', () => now);
  const limiter = new IngestionLimiter({ concurrency: 1 });
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  limiter.submit('A', 1, () => blocked); const drained = limiter.shutdown(10);
  now = 10; release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(await drained, false, 'elapsed deadline remains expired after completion');
  assert.equal(await new IngestionLimiter().shutdown(0), false);
});

test('bounded ingestion pool cleanup closes active locked query sockets after the drain deadline', async () => {
  process.env.DATABASE_URL = assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!);
  const read = new DatabaseService(), ingress = new IngestionDatabaseService();
  const blocker = await read.pool.connect(); let settled = false;
  try {
    await blocker.query('BEGIN'); await blocker.query('LOCK TABLE devices IN ACCESS EXCLUSIVE MODE');
    const query = ingress.query('SELECT id FROM devices LIMIT 1').then(() => { settled = true; }, () => { settled = true; });
    await until(async () => ingress.pool.totalCount === 1, 1000);
    await pause(50);
    const start = performance.now(); await ingress.beforeApplicationShutdown();
    assert.ok(performance.now() - start < 1500);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, true, 'timed pool cleanup must close the active query socket, not leave it alive');
    await query;
  } finally {
    await blocker.query('ROLLBACK'); blocker.release(); await ingress.beforeApplicationShutdown().catch(() => {}); await read.onModuleDestroy();
  }
});

test('bounded ingestion pool cleanup owns clients still authenticating and never acquires them after shutdown', async () => {
  process.env.DATABASE_URL = assertIsolatedDatabase('postgresql://solar@127.0.0.1:15432/solar_readiness');
  const ingress = new IngestionDatabaseService();
  let release!: () => void, passwordRequested = false, acquired = 0, settled = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  // A connectionString password overrides callback options. Preserve the same
  // already-validated owned fixture endpoint while gating real SCRAM auth.
  ingress.pool.options.connectionString = undefined;
  ingress.pool.options.host = '127.0.0.1'; ingress.pool.options.port = 15432;
  ingress.pool.options.database = 'solar_readiness'; ingress.pool.options.user = 'solar';
  ingress.pool.options.password = async () => { passwordRequested = true; await gate; return 'ci-only-password'; };
  ingress.pool.on('acquire', () => { acquired++; });
  const query = ingress.query('SELECT 1').then(() => { settled = true; }, () => { settled = true; });
  try {
    await until(async () => passwordRequested, 1000);
    await Promise.race([ingress.beforeApplicationShutdown(), pause(1500).then(() => assert.fail('authentication cleanup exceeded its bounded deadline'))]);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, true, 'authentication-in-progress client socket is closed at the cleanup deadline');
    release(); await query; await pause(50);
    assert.equal(acquired, 0, 'late authentication cannot acquire or start a query after pool shutdown');
  } finally { release(); await Promise.race([query, pause(1000)]); await Promise.race([ingress.beforeApplicationShutdown().catch(() => {}), pause(1000)]); }
});
