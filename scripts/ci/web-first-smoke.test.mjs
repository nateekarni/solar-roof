import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const smoke=readFileSync('infra/ci/web-first-smoke.sh','utf8');

test('web-first smoke satisfies the fail-closed MQTT and EMQX Compose contract while disabled',()=>{
 assert.match(smoke,/export MQTT_ENABLED=false MQTT_DEFAULT_BROKER_ENABLED=false/);
 for(const name of [
  'MQTT_URL',
  'MQTT_USERNAME',
  'MQTT_PASSWORD',
  'INTERNAL_MQTT_SECRET',
  'EMQX_MANAGEMENT_URL',
  'EMQX_MANAGEMENT_API_KEY',
  'EMQX_MANAGEMENT_API_SECRET',
  'EMQX_MANAGEMENT_DEFAULT_BROKER_ID',
 ])assert.match(smoke,new RegExp(`export[^\\n]*\\b${name}=`),name);
 assert.doesNotMatch(smoke,/^unset[^\n]*\b(?:MQTT_URL|MQTT_USERNAME|MQTT_PASSWORD|INTERNAL_MQTT_SECRET|EMQX_MANAGEMENT_)/m);
});

test('web-first smoke keeps the disabled broker unreachable and never adds broker services',()=>{
 assert.match(smoke,/MQTT_URL=mqtt:\/\/127\.0\.0\.1:1/);
 assert.match(smoke,/config --services \| grep -Eq '\^mqtt\$'/);
});
