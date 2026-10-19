import assert from 'node:assert/strict';
import test from 'node:test';
import type {DiscoveredGatewayDetail, GatewayRegisterPayload} from '@solar/api-contracts';
import type {PayloadRevision} from './payload-contracts';
import {
  gatewayConfirmationRequest,
  gatewayOnboardingDraftFromDetail,
  selectGatewayDevicePreset,
  validateGatewayOnboardingDraft,
} from './gateway-onboarding-draft';

const siteId = '11111111-1111-4111-8111-111111111111';
const snapshot:GatewayRegisterPayload={
  schemaVersion:'1.1',messageType:'register',messageId:'register-1',sentAt:'2026-10-19T01:00:00.000Z',
  gateway:{gatewayId:'GW-001',model:'Edge Pro',firmwareVersion:'3.2.1'},reportedSiteId:'SITE-ALPHA',
  devices:[
    {deviceId:'METER-01',deviceType:'energy-meter',manufacturer:'Schneider',model:'PM2230',firmwareVersion:'1.7',serialNumber:'SN-01',profileId:'pm2230',profileVersion:'3',protocol:'modbus-tcp',connection:{host:'10.0.0.8',port:502,slaveId:1},pollGroups:['energy'],mappings:[{tag:'energy.active.import.total',sourceTag:'import_wh',required:true,registerAddress:'3204',displayName:'Imported energy',pollGroup:'energy',sourceUnit:'Wh',targetUnit:'kWh',conversion:'wh-to-kwh',role:'billing-import',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1,offset:0}]},
    {deviceId:'INV-01',deviceType:'solar-logger',manufacturer:'Acme',model:'Logger X',firmwareVersion:'9.1',serialNumber:'SN-02',profileId:'logger-x',profileVersion:'1',protocol:'modbus-rtu',connection:{serialPort:'COM4',baudRate:9600,dataBits:8,parity:'none',stopBits:1,slaveId:2}},
  ],
};

const detail:DiscoveredGatewayDetail & {presetSuggestions:{deviceId:string;suggestions:Array<{id:string;kind:'profile';rank:number}>}[]}={
  id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',externalGatewayId:'GW-001',reportedSiteId:'SITE-ALPHA',reportedDeviceId:'METER-01',manufacturer:'Schneider',model:'Edge Pro',profileId:'pm2230',protocol:'mqtt',status:'unassigned',assignedSiteId:null,assignedGatewayId:null,firstSeenAt:'2026-10-19T01:00:00.000Z',lastSeenAt:'2026-10-19T01:00:01.000Z',rawPayload:snapshot as unknown as Record<string,unknown>,discoveryRevision:7,snapshot,devices:snapshot.devices,
  presetSuggestions:[{deviceId:'METER-01',suggestions:[{id:'22222222-2222-4222-8222-222222222222',kind:'profile',rank:190}]},{deviceId:'INV-01',suggestions:[]}],
};

const preset:PayloadRevision={id:'22222222-2222-4222-8222-222222222222',profileId:'pm2230-system',version:'3.0.1',createdAt:'2026-10-01T00:00:00.000Z',config:{id:'pm2230-system',version:'3.0.1',schemaVersion:'1.1',displayName:'PM2230 preset',deviceType:'energy-meter',sourceProfile:{id:'vendor-pm2230',version:'v3'},pollGroups:['energy'],fields:[{tag:'energy.active.import.total',displayName:'Imported energy',pollGroup:'energy',sourceUnit:'Wh',targetUnit:'kWh',conversion:'wh-to-kwh',role:'billing-import',registerAddress:'3204'}]}};

test('full registration snapshot is preserved while every reported device field is prefilled into an independent editable draft',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,[{id:siteId,code:'SITE-ALPHA'}]);
  assert.equal(draft.reported.gateway.model,'Edge Pro');
  assert.equal(draft.reported.gateway.firmwareVersion,'3.2.1');
  assert.equal(draft.devices.length,2);
  assert.deepEqual(draft.devices[0]!.connection,{host:'10.0.0.8',port:502,slaveId:1});
  assert.equal(draft.devices[0]!.config.sourceProfile?.id,'pm2230');
  assert.deepEqual(draft.devices[0]!.config.fields,snapshot.devices[0]!.mappings);
  draft.devices[0]!.model='Admin corrected model';
  draft.devices[0]!.config.fields[0]!.displayName='Admin label';
  assert.equal(draft.reported.devices[0]!.model,'PM2230');
  assert.equal(draft.reported.devices[0]!.mappings![0]!.displayName,'Imported energy');
});

test('reported site is only a matched preselection and confirmation keeps the discovery revision',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,[{id:siteId,code:'site-alpha'}]);
  assert.equal(draft.reportedSiteId,'SITE-ALPHA');
  assert.equal(draft.selectedSiteId,siteId);
  assert.equal(draft.reported.assignedSiteId,undefined);
  draft.devices[1]!.enabled=false;
  const request=gatewayConfirmationRequest(draft);
  assert.equal(request.siteId,siteId);
  assert.equal(request.discoveryRevision,7);
});

test('preset suggestion stays optional and must be explicitly selected',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,[]);
  assert.equal(draft.devices[0]!.suggestedPresetId,preset.id);
  assert.equal(draft.devices[0]!.mappingSource,'gateway');
  const selected=selectGatewayDevicePreset(draft.devices[0]!,preset,true);
  assert.equal(selected.mappingSource,'preset');
  assert.equal(selected.presetId,preset.id);
  assert.equal(selected.config.displayName,'PM2230 preset');
  assert.equal(selected.profileId,'vendor-pm2230');
  assert.equal(selected.profileVersion,'v3');
});

test('device without a suggestion falls back to manual configuration without fabricated mappings',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,[]);
  const logger=draft.devices[1]!;
  assert.equal(logger.suggestedPresetId,undefined);
  assert.equal(logger.mappingSource,'manual');
  assert.deepEqual(logger.config.fields,[]);
  assert.deepEqual(logger.config.pollGroups,[]);
});

test('disabled incomplete devices are allowed while enabled incomplete mappings block confirmation',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,[{id:siteId,code:'SITE-ALPHA'}]);
  assert.match(validateGatewayOnboardingDraft(draft,'en')??'',/INV-01.*mapping/i);
  draft.devices[1]!.enabled=false;
  assert.equal(validateGatewayOnboardingDraft(draft,'en'),null);
  assert.equal(gatewayConfirmationRequest(draft).devices[1]!.enabled,false);
});

test('confirmation rejects a stale discovery revision before submitting edits',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,[{id:siteId,code:'SITE-ALPHA'}]);
  draft.devices[1]!.enabled=false;
  assert.throws(()=>gatewayConfirmationRequest(draft,8),/snapshot changed/i);
  assert.equal(gatewayConfirmationRequest(draft,7).discoveryRevision,7);
});

test('client validation enforces the backend Modbus TCP connection schema',()=>{
  const invalidConnections=[
    {host:'',port:502,slaveId:1},
    {host:'999.999.999.999',port:502,slaveId:1},
    {host:'10.0.0.8',port:0,slaveId:1},
    {host:'10.0.0.8',port:65536,slaveId:1},
    {host:'10.0.0.8',port:502,slaveId:0},
    {host:'10.0.0.8',port:502,slaveId:1,note:'unsupported'},
  ];
  for(const connection of invalidConnections){
    const draft=gatewayOnboardingDraftFromDetail(detail,[{id:siteId,code:'SITE-ALPHA'}]);
    draft.devices[1]!.enabled=false;
    draft.devices[0]!.connection=connection;
    assert.match(validateGatewayOnboardingDraft(draft,'en')??'',/METER-01.*connection/i,JSON.stringify(connection));
  }
});

test('client validation enforces the backend Modbus RTU connection schema',()=>{
  const valid={serialPort:'COM4',baudRate:9600,dataBits:8,parity:'none',stopBits:1,slaveId:2};
  const invalidConnections=[
    {...valid,serialPort:' '},
    {...valid,baudRate:49},
    {...valid,dataBits:9},
    {...valid,parity:'invalid'},
    {...valid,stopBits:1.25},
    {...valid,slaveId:248},
    {...valid,note:'unsupported'},
  ];
  for(const connection of invalidConnections){
    const draft=gatewayOnboardingDraftFromDetail(detail,[{id:siteId,code:'SITE-ALPHA'}]);
    draft.devices[0]!.enabled=false;
    const logger=draft.devices[1]!;
    logger.config.pollGroups=['energy'];
    logger.config.fields=structuredClone(snapshot.devices[0]!.mappings!);
    logger.connection=connection;
    assert.match(validateGatewayOnboardingDraft(draft,'en')??'',/INV-01.*connection/i,JSON.stringify(connection));
  }
});

test('client validation rejects decoder values outside backend storage bounds',()=>{
  const invalidMappings=[
    {registerCount:0},
    {registerCount:2147483648},
    {registerCount:1.5},
    {scale:1e12},
    {scale:0.123456789},
    {offset:Number.POSITIVE_INFINITY},
  ];
  for(const change of invalidMappings){
    const draft=gatewayOnboardingDraftFromDetail(detail,[{id:siteId,code:'SITE-ALPHA'}]);
    draft.devices[1]!.enabled=false;
    Object.assign(draft.devices[0]!.config.fields[0]!,change);
    assert.match(validateGatewayOnboardingDraft(draft,'en')??'',/METER-01.*mapping/i,JSON.stringify(change));
  }
});
