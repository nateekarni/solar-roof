import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const smoke=readFileSync('infra/ci/managed-staging-smoke.sh','utf8');

test('managed staging smoke supplies the external EMQX contract with isolated values',()=>{
 for(const name of [
  'MQTT_URL',
  'INTERNAL_MQTT_SECRET',
  'EMQX_MANAGEMENT_URL',
  'EMQX_MANAGEMENT_API_KEY',
  'EMQX_MANAGEMENT_API_SECRET',
  'EMQX_MANAGEMENT_DEFAULT_BROKER_ID',
 ])assert.match(smoke,new RegExp(`export[^\\n]*\\b${name}=`),name);
});

test('managed staging smoke recreates its disposable broker and volumes after the production split',()=>{
 assert.match(smoke,/\n  mqtt:\n    image: solar-mqtt:ci\n/);
 assert.match(smoke,/\nvolumes:\n  mqtt-certs:\n  mqtt-data:\n/);
 assert.match(smoke,/MQTT_URL=mqtt:\/\/mqtt:1883/);
});

test('managed staging smoke overlay composes with the production staging definition',()=>{
 const overlay=smoke.match(/<<'YAML'\n([\s\S]*?)\nYAML\n/)?.[1];
 assert.ok(overlay);
 const config=JSON.parse(execFileSync('docker',[
  'compose','--env-file','infra/docker/.env.staging.example',
  '-f','infra/docker/docker-compose.staging.yml','-f','-','config','--format','json',
 ],{
  encoding:'utf8',
  input:overlay,
  env:{...process.env,MQTT_URL:'mqtt://mqtt:1883'},
 }));
 assert.equal(config.services.mqtt.image,'solar-mqtt:ci');
 assert.equal(config.services.api.environment.MQTT_URL,'mqtt://mqtt:1883');
 assert.deepEqual(Object.keys(config.volumes).filter(name=>name.includes('mqtt')).sort(),['mqtt-certs','mqtt-data']);
});
