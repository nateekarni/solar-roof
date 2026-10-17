import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import test from 'node:test';

function compose(file,env='infra/docker/.env.web.example',extra=[]){
 return JSON.parse(execFileSync('docker',['compose','--env-file',env,'-f',file,...extra,'config','--format','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
}
test('financial writes and scheduler default off and can be activated independently in deployment API',()=>{
 const names=['FINANCIAL_WRITES_ENABLED','FINANCIAL_SCHEDULER_ENABLED'];
 const previous=names.map(name=>process.env[name]);
 try {
  for(const [file,env] of [['infra/docker/docker-compose.web.yml','infra/docker/.env.web.example'],['infra/docker/docker-compose.staging.yml','infra/docker/.env.staging.example']]) {
   for(const name of names)delete process.env[name];
   let config=compose(file,env);
   assert.equal(config.services.api.environment.FINANCIAL_WRITES_ENABLED,'false');
   assert.equal(config.services.api.environment.FINANCIAL_SCHEDULER_ENABLED,'false');
   process.env.FINANCIAL_WRITES_ENABLED='true';
   config=compose(file,env);
   assert.equal(config.services.api.environment.FINANCIAL_WRITES_ENABLED,'true');
   assert.equal(config.services.api.environment.FINANCIAL_SCHEDULER_ENABLED,'false');
   process.env.FINANCIAL_SCHEDULER_ENABLED='true';
   assert.equal(compose(file,env).services.api.environment.FINANCIAL_SCHEDULER_ENABLED,'true');
  }
 } finally {names.forEach((name,index)=>{if(previous[index]===undefined)delete process.env[name];else process.env[name]=previous[index];});}
});
test('web and combined deployment start independently of user provisioning',()=>{
 for(const [file,env] of [['infra/docker/docker-compose.web.yml','infra/docker/.env.web.example'],['infra/docker/docker-compose.staging.yml','infra/docker/.env.staging.example']]){
  const config=compose(file,env);assert.equal(config.services.bootstrap,undefined);
  assert.equal(config.services.api.depends_on.bootstrap,undefined);
  assert.equal(config.services.api.environment.WEB_URL,'https://solar.fowir.com');
  assert.equal(config.services.web.environment.API_INTERNAL_URL,'http://api:3001');
 }
 const web=compose('infra/docker/docker-compose.web.yml');assert.equal(web.services.mqtt,undefined);assert.equal(web.services.certbot,undefined);
});
test('web and combined deployment pass security and automation controls into the API',()=>{
 for(const [file,env] of [['infra/docker/docker-compose.web.yml','infra/docker/.env.web.example'],['infra/docker/docker-compose.staging.yml','infra/docker/.env.staging.example']]){
  const api=compose(file,env).services.api.environment;
  assert.equal(api.TOTP_ENCRYPTION_KEY,'REPLACE_WITH_64_HEX_CHARACTERS');
  assert.equal(api.MQTT_CREDENTIAL_SECRET,'REPLACE_WITH_DIFFERENT_RANDOM_SECRET');
  assert.equal(api.TECHNICAL_ALERTS_ENABLED,'true');
  assert.equal(api.COMPARISON_WORKER_ENABLED,'true');
 }
});
test('standalone MQTT is only broker/certificate with correct domain and persistent volumes',()=>{
 const config=compose('infra/docker/docker-compose.mqtt.yml','infra/docker/.env.mqtt.example');
 assert.deepEqual(Object.keys(config.services).sort(),['certbot','mqtt']);
 for(const service of Object.values(config.services))assert.equal(service.environment.MQTT_TLS_DOMAIN,'mqtt-solar.fowir.com');
 assert.equal(config.services.mqtt.ports[0].target,8883);assert.equal(String(config.services.mqtt.ports[0].published),'8883');
 assert.deepEqual(Object.keys(config.volumes).sort(),['letsencrypt-data','mqtt-certs','mqtt-data']);
});
test('standalone hostcert MQTT broker has correct domain, ports and host volume',()=>{
 const config=compose('infra/docker/docker-compose.mqtt-hostcert.yml','infra/docker/.env.mqtt-hostcert.example');
 assert.deepEqual(Object.keys(config.services).sort(),['mqtt']);
 assert.equal(config.services.mqtt.environment.MQTT_TLS_DOMAIN,'mqtt-solar.fowir.com');
 assert.equal(config.services.mqtt.ports[0].target,8883);assert.equal(String(config.services.mqtt.ports[0].published),'8883');
 assert.deepEqual(Object.keys(config.volumes).sort(),['mqtt-data']);
});
test('CI storage initializer preserves AWS metadata property through Compose interpolation and recovery overrides fixture user',()=>{
 const config=compose('infra/ci/compose.yml');
 // config retains the escaped form for round-tripping; container creation unescapes it.
 assert.ok(config.services['storage-init'].command.at(-1).includes('e.$$metadata?.httpStatusCode'));
 assert.deepEqual(config.services['fixture-user'].command,['pnpm','--filter','@solar/api','db:create:user']);
 const recovery=compose('infra/ci/compose.yml','infra/docker/.env.web.example',['-f','infra/ci/recovery-compose.yml']);
 assert.equal(recovery.services.bootstrap,undefined);assert.ok(recovery.services['fixture-user']);assert.ok(recovery.services['storage-init']);
});
