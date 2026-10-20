import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseGatewayControlPayload } from './gateway-control-payload.js';

const repositoryRoot = new URL('../../../../..', import.meta.url);
const readRepositoryFile = (path: string) => readFileSync(new URL(path, repositoryRoot), 'utf8');

test('EMQX deployment pins 5.8.3 and exposes only public MQTTS', () => {
  const compose = readRepositoryFile('infra/docker/docker-compose.emqx.yml');
  assert.match(compose, /^\s*image: emqx\/emqx:5\.8\.3\s*$/m);
  assert.match(compose, /ports:\s*\r?\n\s*- ['"]8883:8883['"]/);
  assert.doesNotMatch(compose, /- ['"](?:1883|18083):(?:1883|18083)['"]/);
  assert.match(compose, /expose:\s*\r?\n\s*- ['"]1883['"]\s*\r?\n\s*- ['"]18083['"]/);
});

test('EMQX callbacks require the internal secret and verify the API TLS peer and hostname', () => {
  const compose = readRepositoryFile('infra/docker/docker-compose.emqx.yml');
  assert.equal((compose.match(/x-internal-secret/g) ?? []).length, 2);
  assert.equal((compose.match(/INTERNAL_MQTT_SECRET:\?required/g) ?? []).length, 2);
  assert.equal((compose.match(/"verify":"verify_peer"/g) ?? []).length, 2);
  assert.equal((compose.match(/"server_name_indication":"solar\.fowir\.com"/g) ?? []).length, 2);
  assert.equal((compose.match(/"cacertfile":"\/opt\/emqx\/certs\/webhook-ca\.pem"/g) ?? []).length, 2);
  assert.doesNotMatch(compose, /"verify":"verify_none"/);
  assert.match(compose, /MQTT_WEBHOOK_CA_FILE:\?required/);
});

test('EMQX authorization cache is disabled so suspension and rotation take effect on connected clients',()=>{
  const compose=readRepositoryFile('infra/docker/docker-compose.emqx.yml');
  const runbook=readRepositoryFile('docs/runbooks/coolify-mqtt-deployment-th.md');
  assert.match(compose,/^\s*- EMQX_AUTHORIZATION__CACHE__ENABLE=false\s*$/m);
  assert.match(runbook,/EMQX_AUTHORIZATION__CACHE__ENABLE=false/);
  assert.match(runbook,/authorization cache[\s\S]*(?:restart|recreate|สร้าง container ใหม่)/i);
});

test('EMQX deployment has no default dashboard or cluster credentials', () => {
  const compose = readRepositoryFile('infra/docker/docker-compose.emqx.yml');
  const example = readRepositoryFile('infra/docker/.env.emqx.example');
  assert.match(compose, /EMQX_DASHBOARD_USER:\?required/);
  assert.match(compose, /EMQX_DASHBOARD_PASSWORD:\?required/);
  assert.match(compose, /EMQX_NODE_COOKIE:\?required/);
  assert.doesNotMatch(compose, /admin123456|solar_emqx_secret_cookie/);
  assert.doesNotMatch(example, /^EMQX_DASHBOARD_(?:USER|PASSWORD)=admin\s*$/m);
  assert.match(example, /^INTERNAL_MQTT_SECRET=REPLACE_WITH_/m);
});

test('persisted EMQX dashboard credentials require an explicit CLI migration', () => {
  const runbook = readRepositoryFile('docs/runbooks/coolify-mqtt-deployment-th.md');
  assert.match(runbook, /emqx-data/);
  assert.match(runbook, /emqx ctl admins passwd <existing-user> <new-password>/);
  assert.match(runbook, /EMQX_DASHBOARD__(?:DEFAULT_)?(?:USERNAME|PASSWORD).*ไม่(?:ได้)?(?:เปลี่ยน|หมุน).*persisted/i);
  assert.match(runbook, /secret store[\s\S]*exact prior credential[\s\S]*(?:fail|ปฏิเสธ|ใช้ไม่ได้)/i);
  assert.match(runbook, /new secret[\s\S]*(?:works|ใช้งานได้)/i);
  assert.match(runbook, /แยกต่างหาก[\s\S]*admin[\s\S]*admin123456[\s\S]*(?:fail|ปฏิเสธ|ใช้ไม่ได้)/i);
  assert.match(runbook, /emqx ctl admins list[\s\S]*(?:other admin users|admin อื่น|บัญชีอื่น)/i);
});

test('MQTTBox runbook follows the retained status and Last Will lifecycle', () => {
  const runbook = readRepositoryFile('docs/runbooks/gateway-mqtt-onboarding-th.md');
  assert.match(runbook, /Last Will[\s\S]*ก่อน CONNECT/);
  assert.match(runbook, /status[\s\S]*QoS 1[\s\S]*Retain (?:เปิด|= true)/);
  assert.match(runbook, /offline[\s\S]*Last Will[\s\S]*ก่อน CONNECT/);
  assert.match(runbook, /SUBACK[\s\S]*สำเร็จ[\s\S]*online/);
  assert.match(runbook, /graceful disconnect[\s\S]*offline[\s\S]*PUBACK[\s\S]*DISCONNECT/i);
  assert.match(runbook, /abnormal disconnect[\s\S]*Last Will[\s\S]*offline/i);
  assert.match(runbook, /reconnect[\s\S]*SUBACK[\s\S]*online/i);
  assert.match(runbook, /sessionId[\s\S]*คงที่[\s\S]*(?:หนึ่ง boot|ต่อ boot|ตลอด boot)/i);
  assert.match(runbook, /messageId[\s\S]*reportedAt[\s\S]*(?:ใหม่|fresh)[\s\S]*(?:ทุกครั้ง|แต่ละครั้ง)/i);
  assert.match(runbook, /ห้าม[\s\S]*(?:reuse|ใช้ซ้ำ)[\s\S]*messageId[\s\S]*reportedAt[\s\S]*(?:publication|reconnect)/i);
});

test('web and staging API deployments use one required EMQX connection contract', () => {
  for (const path of ['infra/docker/docker-compose.web.yml', 'infra/docker/docker-compose.staging.yml']) {
    const compose = readRepositoryFile(path);
    assert.match(compose, /MQTT_ENABLED: \$\{MQTT_ENABLED:-true\}/);
    assert.match(compose, /MQTT_DEFAULT_BROKER_ENABLED: \$\{MQTT_DEFAULT_BROKER_ENABLED:-true\}/);
    assert.match(compose, /MQTT_URL: \$\{MQTT_URL:\?EMQX broker URL required\}/);
    assert.match(compose, /MQTT_USERNAME: solar-backend/);
    assert.match(compose, /MQTT_PASSWORD: \$\{MQTT_PASSWORD:\?backend MQTT password required\}/);
    assert.match(compose, /INTERNAL_MQTT_SECRET: \$\{INTERNAL_MQTT_SECRET:\?EMQX callback secret required\}/);
    assert.match(compose,/EMQX_MANAGEMENT_URL: \$\{EMQX_MANAGEMENT_URL:\?EMQX management HTTPS URL required\}/);
    assert.match(compose,/EMQX_MANAGEMENT_API_KEY: \$\{EMQX_MANAGEMENT_API_KEY:\?EMQX management API key required\}/);
    assert.match(compose,/EMQX_MANAGEMENT_API_SECRET: \$\{EMQX_MANAGEMENT_API_SECRET:\?EMQX management API secret required\}/);
    assert.match(compose,/EMQX_MANAGEMENT_DEFAULT_BROKER_ID: \$\{EMQX_MANAGEMENT_DEFAULT_BROKER_ID:\?default broker UUID required\}/);
  }
  const staging = readRepositoryFile('infra/docker/docker-compose.staging.yml');
  assert.doesNotMatch(staging, /MQTT_IMAGE|mqtt-runtime\.py|mqtt:\/\/mqtt:1883/);
});

test('all documented v1.1 control fixtures pass the production schemas', () => {
  const fixtures = {
    register: 'register-v1.1.json',
    configUpdate: 'config-update-v1.1.json',
    configStatus: 'config-status-v1.1.json',
    status: 'status-v1.1.json',
  } as const;
  for (const [kind, filename] of Object.entries(fixtures) as Array<[keyof typeof fixtures, string]>) {
    const source = readRepositoryFile(`apps/api/src/modules/gateway-control/fixtures/${filename}`);
    const payload = JSON.parse(source) as Record<string, unknown>;
    const parsed = parseGatewayControlPayload(kind, payload);
    assert.equal(parsed.schemaVersion, '1.1');
    assert.equal(parsed.messageType, kind);
    assert.equal(parsed.messageType === 'register' ? parsed.gateway.gatewayId : parsed.gatewayId, 'GW-TEST-001');
  }
});

test('operator fixtures never invent a physical meter register map', () => {
  for (const filename of ['register-v1.1.json', 'config-update-v1.1.json']) {
    const payload = JSON.parse(readRepositoryFile(`apps/api/src/modules/gateway-control/fixtures/${filename}`)) as {
      devices: Array<{ mappings?: Array<{ registerAddress?: string }> }>;
    };
    assert.ok(payload.devices.length > 0);
    assert.ok(payload.devices.every(device => (device.mappings ?? []).every(mapping => mapping.registerAddress === undefined)));
  }
});
