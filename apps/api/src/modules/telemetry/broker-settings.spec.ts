import assert from 'node:assert/strict';
import test from 'node:test';
import { brokerSettings,brokerUrl,encryptBrokerPassword,decryptBrokerPassword } from './broker-settings.js';
test('broker addresses accept local/remote transports and reject dashboard ports',()=>{
 const parse=(host:string,protocol:string,port:number)=>brokerSettings.parse({name:'test',host,protocol,port});
 assert.equal(brokerUrl(parse('184.82.29.241','mqtt',1883)),'mqtt://184.82.29.241:1883');
 assert.equal(brokerUrl(parse('localhost','ws',8083)),'ws://localhost:8083/mqtt');
 assert.throws(()=>parse('localhost','mqtt',18083));
 assert.throws(()=>parse('http://localhost','mqtt',1883));
 assert.throws(()=>parse('localhost','mqtt',0));
});
test('broker passwords are authenticated encrypted values',()=>{
 process.env.MQTT_CREDENTIAL_SECRET='test-encryption-key';
 const cipher=encryptBrokerPassword('test-password');
 assert.ok(!cipher.includes('test-password'));
 assert.equal(decryptBrokerPassword(cipher),'test-password');
 assert.notEqual(encryptBrokerPassword('test-password'),cipher);
 delete process.env.MQTT_CREDENTIAL_SECRET;
});
