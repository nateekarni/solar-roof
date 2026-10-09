import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSiteIdentityDraft } from './site-identity-draft';
test('resolved identity is the same preview and saved identity while retaining manual case',async()=>{
 const input={externalSiteId:'School-A',externalGatewayId:'',externalDeviceId:'',additionalDevices:[{externalDeviceId:'Logger-A'}],endpoint:''};
 const result=await resolveSiteIdentityDraft(input,async draft=>({...draft,externalSiteId:'School-A',externalGatewayId:'GW-123',externalDeviceId:'DEV-123',additionalDevices:[{externalDeviceId:'Logger-A'}]}));
 assert.equal(result.externalSiteId,'School-A');assert.equal(result.externalDeviceId,'DEV-123');assert.equal(result.endpoint,'solar/v1/sites/School-A/gateways/GW-123/devices/+/telemetry');assert.equal(input.externalGatewayId,'');
});
test('a resolved draft keeps its IDs and explicitly configured subscription',async()=>{
 const input={externalSiteId:'S',externalGatewayId:'G',externalDeviceId:'D',additionalDevices:[],endpoint:'custom/topic'};
 let requested=false;const result=await resolveSiteIdentityDraft(input,async()=>{requested=true;throw Error('unexpected allocation')});assert.equal(requested,false);assert.deepEqual(result,input);
});
test('legacy allocation keeps its legacy endpoint',async()=>{const result=await resolveSiteIdentityDraft({externalSiteId:'',externalGatewayId:'',externalDeviceId:'',additionalDevices:[],endpoint:'energy/Legacy/#',protocolMode:'legacy'},async()=>({externalSiteId:'S',externalGatewayId:'G',externalDeviceId:'D',additionalDevices:[]}));assert.equal(result.endpoint,'energy/Legacy/#');});
test('legacy allocation never synthesizes a standard subscription',async()=>{const result=await resolveSiteIdentityDraft({externalSiteId:'',externalGatewayId:'',externalDeviceId:'',additionalDevices:[],endpoint:'',protocolMode:'legacy'},async()=>({externalSiteId:'S',externalGatewayId:'G',externalDeviceId:'D',additionalDevices:[]}));assert.equal(result.endpoint,'');});
