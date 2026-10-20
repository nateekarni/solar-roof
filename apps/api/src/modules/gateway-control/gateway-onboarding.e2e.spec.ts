import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertConfigDeliveryPacket,
  assertDataAcceptedPacket,
  buildAppliedConfigTelemetry,
  combineVerificationErrors,
  gatewayOnboardingE2EDecision,
  loadGatewayOnboardingE2EConfig,
  runGatewayOnboardingVerification,
  runWithinScenarioBudget,
  sanitizeVerificationError,
} from '../../scripts/verify-gateway-onboarding.js';
import type {GatewayConfigPayload} from '@solar/api-contracts';

const requiredEnvironment = [
  'MQTT_E2E_URL',
  'DATABASE_URL',
  'E2E_ADMIN_ACCESS_TOKEN',
  'E2E_SITE_ID',
] as const;

test('the verifier reports every missing required setting without echoing environment values', () => {
  const secret = 'do-not-print-this-value';
  assert.throws(
    () => loadGatewayOnboardingE2EConfig({ E2E_ADMIN_ACCESS_TOKEN: secret }),
    error => {
      assert.ok(error instanceof Error);
      for (const name of requiredEnvironment.filter(name => name !== 'E2E_ADMIN_ACCESS_TOKEN')) {
        assert.match(error.message, new RegExp(name));
      }
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    },
  );
});

test('required mode runs and fails configuration instead of silently skipping', () => {
  assert.deepEqual(gatewayOnboardingE2EDecision({ MQTT_E2E_REQUIRED: 'true' }), { skip: false });
  assert.deepEqual(gatewayOnboardingE2EDecision({}), { skip: true });
  assert.deepEqual(gatewayOnboardingE2EDecision(Object.fromEntries(requiredEnvironment.map(name => [name, 'configured']))), { skip: false });
});

test('the anonymous broker URL cannot smuggle credentials into the registration client', () => {
  const environment = Object.fromEntries(requiredEnvironment.map(name => [name, 'configured']));
  environment.MQTT_E2E_URL = 'mqtt://hidden-user:hidden-password@broker.example:1883';
  environment.E2E_SITE_ID = '00000000-0000-4000-8000-000000000001';
  assert.throws(
    () => loadGatewayOnboardingE2EConfig(environment),
    error => error instanceof Error
      && /must not include username or password/.test(error.message)
      && !error.message.includes('hidden-user')
      && !error.message.includes('hidden-password'),
  );
});

test('the admin API URL cannot smuggle credentials into HTTP requests', () => {
  const environment = Object.fromEntries(requiredEnvironment.map(name => [name, 'configured']));
  environment.MQTT_E2E_URL = 'mqtt://broker.example:1883';
  environment.E2E_API_URL = 'https://hidden-user:hidden-password@api.example';
  environment.E2E_SITE_ID = '00000000-0000-4000-8000-000000000001';
  assert.throws(
    () => loadGatewayOnboardingE2EConfig(environment),
    error => error instanceof Error
      && /must not include username or password/.test(error.message)
      && !error.message.includes('hidden-user')
      && !error.message.includes('hidden-password'),
  );
});

test('scenario, polling, and single-operation timeout budgets are independent', () => {
  const environment = Object.fromEntries(requiredEnvironment.map(name => [name, 'configured']));
  environment.MQTT_E2E_URL = 'mqtt://broker.example:1883';
  environment.E2E_SITE_ID = '00000000-0000-4000-8000-000000000001';
  environment.MQTT_E2E_OPERATION_TIMEOUT_MS = '2500';
  environment.MQTT_E2E_POLL_TIMEOUT_MS = '15000';
  environment.MQTT_E2E_SCENARIO_TIMEOUT_MS = '300000';
  const config = loadGatewayOnboardingE2EConfig(environment);
  assert.equal(config.operationTimeoutMs, 2500);
  assert.equal(config.pollTimeoutMs, 15000);
  assert.equal(config.scenarioTimeoutMs, 300000);
});

test('packet assertions catch config or acknowledgement delivery regressions', () => {
  assert.doesNotThrow(() => assertConfigDeliveryPacket({ qos: 1, retain: true }));
  assert.throws(() => assertConfigDeliveryPacket({ qos: 0, retain: true }), /QoS 1/);
  assert.throws(() => assertConfigDeliveryPacket({ qos: 1, retain: false }), /retained/);
  assert.doesNotThrow(() => assertDataAcceptedPacket({ qos: 1, retain: false }));
  assert.throws(() => assertDataAcceptedPacket({ qos: 0, retain: false }), /QoS 1/);
  assert.throws(() => assertDataAcceptedPacket({ qos: 1, retain: true }), /must not be retained/);
});

test('production E2E telemetry shape carries the applied configuration version without a config profileRevisionId field',()=>{
  const config={schemaVersion:'1.1',messageType:'config',messageId:'config-1',gatewayId:'GW-001',siteId:'SITE-001',configVersion:7,
    configHash:'a'.repeat(64),issuedAt:'2026-10-19T00:00:00Z',approvedBy:'admin',devices:[{deviceId:'METER-01',enabled:true,mappingSource:'manual',
      deviceType:'energy-meter',model:'M',serialNumber:'S',protocol:'modbus-tcp',connection:{host:'192.0.2.1',port:502,slaveId:1},pollGroups:['energy'],
      profileId:'local-profile',profileVersion:'1.0.0',mappings:[{tag:'energy.active.import.total',displayName:'Energy',pollGroup:'energy',sourceUnit:'Wh',targetUnit:'kWh',conversion:'wh-to-kwh',registerAddress:'1',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1,offset:0}]}]} as GatewayConfigPayload;
  assert.equal('profileRevisionId' in config.devices[0]!,false);
  const telemetry=buildAppliedConfigTelemetry(config,{messageId:'telemetry-1',sequence:1,lotNumber:1,deviceId:'METER-01',value:123,
    polledAt:'2026-10-19T00:00:01Z',sentAt:'2026-10-19T00:00:02Z'});
  assert.equal(telemetry.configurationVersion,7);assert.equal(telemetry.device.profileId,'local-profile');
});

test('cleanup failures retain the original scenario failure for diagnosis', () => {
  const original = new Error('scenario failed');
  const cleanup = new Error('cleanup failed');
  const combined = combineVerificationErrors(original, [cleanup]);
  assert.ok(combined instanceof AggregateError);
  assert.deepEqual(combined.errors, [original, cleanup]);
  assert.equal(combineVerificationErrors(original, []), original);
  assert.equal(combineVerificationErrors(undefined, [cleanup]), cleanup);
});

test('the harness enforces its own scenario deadline and waits for finalization', async () => {
  const events: string[] = [];
  await assert.rejects(
    runWithinScenarioBudget(20, async signal => {
      try {
        await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => {
          events.push('aborted');
          reject(signal.reason);
        }, { once: true }));
      } finally {
        await new Promise(resolve => setTimeout(resolve, 5));
        events.push('finalized');
      }
    }),
    /scenario timeout/i,
  );
  assert.deepEqual(events, ['aborted', 'finalized']);
});

test('CLI error sanitization removes tokens, passwords, URL userinfo, and full database URLs', () => {
  const environment = {
    E2E_ADMIN_ACCESS_TOKEN: 'admin-secret-token',
    MQTT_E2E_CLEANUP_PASSWORD: 'mqtt-secret-password',
    DATABASE_URL: 'postgres://database-user:database-password@db.example/solar',
  };
  const message = sanitizeVerificationError(new Error(
    `Bearer admin-secret-token mqtt-secret-password postgres://database-user:database-password@db.example/solar https://url-user:url-password@example.test/path`,
  ), environment);
  for (const secret of ['admin-secret-token', 'mqtt-secret-password', 'database-user', 'database-password', 'url-user', 'url-password']) {
    assert.doesNotMatch(message, new RegExp(secret));
  }
  assert.match(message, /\[redacted\]/);
});

const decision = gatewayOnboardingE2EDecision(process.env);

const scenarioTimeoutMs = Number(process.env.MQTT_E2E_SCENARIO_TIMEOUT_MS ?? 300_000);
const cleanupAllowanceMs = Number(process.env.MQTT_E2E_OPERATION_TIMEOUT_MS ?? 10_000) * 20;

test('register -> approve -> config -> applied -> telemetry -> dataAcept', { skip: decision.skip, timeout: scenarioTimeoutMs + cleanupAllowanceMs }, async () => {
  await runGatewayOnboardingVerification(process.env);
});
