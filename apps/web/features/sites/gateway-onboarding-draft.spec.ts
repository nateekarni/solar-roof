import assert from 'node:assert/strict';
import test from 'node:test';
import type {DiscoveredGatewayDetail, GatewayRegisterPayload,TelemetryDiscoveryEnvelope} from '@solar/api-contracts';
import type {PayloadRevision} from './payload-contracts';
import {
  gatewayConfirmationRequest,
  gatewayOnboardingDraftFromDetail,
  selectGatewayRegisterPreset,
  selectGatewayDevicePreset,
  validateGatewayOnboardingDraft,
  isStaleDiscoveryConflict,
} from './gateway-onboarding-draft';
import * as gatewayOnboarding from './gateway-onboarding-draft';

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
  id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',externalGatewayId:'GW-001',reportedSiteId:'SITE-ALPHA',reportedDeviceId:'METER-01',manufacturer:'Schneider',model:'Edge Pro',profileId:'pm2230',protocol:'mqtt',status:'unassigned',onboardingState:'ready',assignedSiteId:null,assignedGatewayId:null,firstSeenAt:'2026-10-19T01:00:00.000Z',lastSeenAt:'2026-10-19T01:00:01.000Z',rawPayload:snapshot as unknown as Record<string,unknown>,discoveryRevision:7,snapshot,devices:snapshot.devices,
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

test('schema 1.2 telemetry becomes a complete pairing draft without a register snapshot',()=>{
  const telemetry:TelemetryDiscoveryEnvelope={schemaVersion:'1.2',messageType:'telemetry',messageId:'telemetry-1',siteId:'SITE-ALPHA',gatewayId:'GW-001',gatewaySerial:'GW-SN-A1B2C3D4',device:{deviceId:'METER-01',deviceSerial:'PM2230-SN-000001',deviceType:'energy-meter',manufacturer:'Schneider',model:'PM2230',profileId:'pm2230',profileVersion:'3',protocol:'modbus-tcp'}};
  const telemetryDetail:DiscoveredGatewayDetail={...detail,gatewaySerial:telemetry.gatewaySerial,snapshot:telemetry,devices:[snapshot.devices[0]!],rawPayload:telemetry as unknown as Record<string,unknown>};
  const draft=gatewayOnboardingDraftFromDetail(telemetryDetail,[{id:siteId,code:'SITE-ALPHA'}]);
  assert.equal(draft.reported.gateway.gatewayId,'GW-001');
  assert.equal(draft.reported.gateway.gatewaySerial,'GW-SN-A1B2C3D4');
  assert.equal(draft.reportedSiteId,'SITE-ALPHA');
  assert.equal(draft.selectedSiteId,siteId);
  assert.equal(draft.devices[0]!.serialNumber,'SN-01');
  assert.equal(draft.reported.devices[0]!.deviceId,'METER-01');
});

test('schema 1.1 telemetry without serials opens an editable pairing draft keyed by claimed IDs',()=>{
  const telemetry:TelemetryDiscoveryEnvelope={schemaVersion:'1.1',messageType:'telemetry',messageId:'telemetry-legacy-1',
    siteId:'SITE-ALPHA',gatewayId:'GW-001',device:{deviceId:'METER-01',deviceType:'energy-meter',manufacturer:'Schneider',
      model:'PM2230',profileId:'pm2230',profileVersion:'3',protocol:'modbus-tcp'}};
  const reportedDevice=structuredClone(snapshot.devices[0]!);
  delete reportedDevice.serialNumber;
  const telemetryDetail:DiscoveredGatewayDetail={...detail,gatewaySerial:null,snapshot:telemetry,devices:[reportedDevice],
    rawPayload:telemetry as unknown as Record<string,unknown>};
  const draft=gatewayOnboardingDraftFromDetail(telemetryDetail,[{id:siteId,code:'SITE-ALPHA'}]);
  assert.equal(draft.reported.gateway.gatewayId,'GW-001');
  assert.equal(draft.reported.gateway.gatewaySerial,undefined);
  assert.equal(draft.selectedSiteId,siteId);
  assert.equal(draft.devices[0]!.externalDeviceId,'METER-01');
  assert.equal(draft.devices[0]!.serialNumber,'');
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

test('preset suggestion is applied automatically once without overwriting later admin edits',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,[]);
  assert.deepEqual(draft.devices[0]!.suggestedPreset,{id:preset.id,kind:'profile',rank:190});
  const applySuggested=(gatewayOnboarding as unknown as {applySuggestedGatewayPresets?:Function}).applySuggestedGatewayPresets;
  assert.equal(typeof applySuggested,'function','gateway onboarding must expose deterministic preset auto-selection');
  if(typeof applySuggested!=='function')return;
  const selectedDraft=applySuggested(draft,[preset],[]);
  const selected=selectedDraft.devices[0]!;
  assert.equal(selected.mappingSource,'preset');
  assert.equal(selected.presetId,preset.id);
  assert.equal(selected.config.displayName,'PM2230 preset');
  assert.equal(selected.profileId,'vendor-pm2230');
  assert.equal(selected.profileVersion,'v3');
  selected.model='Admin corrected model';
  selected.dirty=true;
  const reapplied=applySuggested(selectedDraft,[{...preset,config:{...preset.config,displayName:'Changed preset'}}],[]);
  assert.equal(reapplied.devices[0]!.model,'Admin corrected model');
  assert.equal(reapplied.devices[0]!.config.displayName,'PM2230 preset');
});

test('equal top-ranked suggestions are never selected arbitrarily',()=>{
  const ambiguous={...detail,presetSuggestions:[{deviceId:'METER-01',suggestions:[
    {id:preset.id,kind:'profile' as const,rank:190},
    {id:'33333333-3333-4333-8333-333333333333',kind:'profile' as const,rank:190},
  ]},{deviceId:'INV-01',suggestions:[]}]};
  const draft=gatewayOnboardingDraftFromDetail(ambiguous,[]);
  const applySuggested=(gatewayOnboarding as unknown as {applySuggestedGatewayPresets?:Function}).applySuggestedGatewayPresets;
  assert.equal(typeof applySuggested,'function');
  if(typeof applySuggested!=='function')return;
  const selected=applySuggested(draft,[preset],[]);
  assert.equal(selected.devices[0]!.presetId,undefined);
  assert.equal(selected.devices[0]!.presetSuggestionAmbiguous,true);
});

test('structured onboarding issue identifies the first invalid device and field',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,[{id:siteId,code:'SITE-ALPHA'}]);
  draft.devices[0]!.serialNumber='';
  const issueFor=(gatewayOnboarding as unknown as {gatewayOnboardingIssue?:Function}).gatewayOnboardingIssue;
  assert.equal(typeof issueFor,'function','structured validation must expose a focus target');
  if(typeof issueFor!=='function')return;
  assert.deepEqual(issueFor(draft,'en'),{
    code:'device_serial_required',section:'metadata',deviceKey:'METER-01',fieldId:'gateway-device-serialNumber-METER-01',
    message:'Enter the serial number for device METER-01.',
  });
  draft.devices[0]!.serialNumber='SN-01';
  draft.devices[0]!.connection={};
  draft.devices[1]!.enabled=false;
  assert.equal(issueFor(draft,'en'),null);
});

test('register-preset suggestions preserve their kind and can be selected without replacing semantic mappings',()=>{
  const registerDetail={...detail,presetSuggestions:[{deviceId:'METER-01',suggestions:[{id:'44444444-4444-4444-8444-444444444444',kind:'register' as const,rank:80}]},{deviceId:'INV-01',suggestions:[]}]};
  const draft=gatewayOnboardingDraftFromDetail(registerDetail,[]);
  assert.equal(draft.devices[0]!.suggestedPreset?.kind,'register');
  const selection=selectGatewayRegisterPreset(draft.devices[0]!,{
    id:'44444444-4444-4444-8444-444444444444',brand:'Schneider',model:'PM2230',deviceType:'energy-meter',
    updatedAt:'2026-10-19T01:02:03.000Z',
    registers:[{registerAddress:'3204',registerCount:2,dataType:'uint32',byteOrder:'little_endian',wordOrder:'cdab',scale:0.01,offset:2}],
  });
  assert.equal(selection.ok,true);
  if(!selection.ok)return;
  const selected=selection.device;
  assert.equal(selected.mappingSource,'preset');
  assert.equal(selected.presetId,'44444444-4444-4444-8444-444444444444');
  assert.equal(selected.presetVersion,'2026-10-19T01:02:03.000Z');
  assert.equal(selected.config.fields[0]!.tag,'energy.active.import.total');
  assert.deepEqual(
    (({registerCount,dataType,byteOrder,wordOrder,scale,offset})=>({registerCount,dataType,byteOrder,wordOrder,scale,offset}))(selected.config.fields[0]!),
    {registerCount:2,dataType:'uint32',byteOrder:'little_endian',wordOrder:'cdab',scale:0.01,offset:2},
  );
  selected.enabled=true;
  draft.devices[0]=selected;
  draft.devices[1]!.enabled=false;
  draft.selectedSiteId=siteId;
  assert.equal(gatewayConfirmationRequest(draft).devices[0]!.presetId,'44444444-4444-4444-8444-444444444444');
  assert.equal(gatewayConfirmationRequest(draft).devices[0]!.presetVersion,'2026-10-19T01:02:03.000Z');
});

test('client preflight uses canonical register-address validation for enabled and disabled mappings',()=>{
  for(const enabled of [true,false]){
    const draft=gatewayOnboardingDraftFromDetail(detail,[{id:siteId,code:'SITE-ALPHA'}]);
    draft.devices[1]!.enabled=false;
    if(!enabled)draft.devices.push({...structuredClone(draft.devices[0]!),key:'METER-02',externalDeviceId:'METER-02'});
    draft.devices[0]!.enabled=enabled;
    draft.devices[0]!.config.fields[0]!.registerAddress='holding:3204';
    assert.match(validateGatewayOnboardingDraft(draft,'en')??'',/METER-01.*mapping/i,`enabled=${enabled}`);
    assert.throws(()=>gatewayConfirmationRequest(draft),/METER-01.*mapping/i);
  }
});

test('client preflight rejects duplicate tags and canonical register aliases for enabled and disabled mappings',()=>{
  for(const enabled of [true,false])for(const duplicate of [
    {...snapshot.devices[0]!.mappings![0]!,registerAddress:'3206'},
    {...snapshot.devices[0]!.mappings![0]!,tag:'another.tag',registerAddress:'R3204'},
  ]){
    const draft=gatewayOnboardingDraftFromDetail(detail,[{id:siteId,code:'SITE-ALPHA'}]);
    draft.devices[1]!.enabled=false;
    if(!enabled)draft.devices.push({...structuredClone(draft.devices[0]!),key:'METER-02',externalDeviceId:'METER-02'});
    draft.devices[0]!.enabled=enabled;
    draft.devices[0]!.config.fields.push(duplicate);
    assert.match(validateGatewayOnboardingDraft(draft,'en')??'',/METER-01.*mapping/i,`enabled=${enabled}`);
  }
});

test('malformed register preset decoder values return bounded issues and never throw',()=>{
  const device=gatewayOnboardingDraftFromDetail(detail,[]).devices[0]!;
  const malformed=[
    {registerAddress:'3204',registerCount:{},dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1},
    {registerAddress:'3204',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:{toString(){throw new Error('must not execute');}}},
    {registerAddress:{},registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1},
    {registerAddress:'9'.repeat(10_000),registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1},
  ];
  for(const register of malformed){
    let result:ReturnType<typeof selectGatewayRegisterPreset>|undefined;
    assert.doesNotThrow(()=>{result=selectGatewayRegisterPreset(device,{id:'44444444-4444-4444-8444-444444444444',model:'PM2230',registers:[register]});});
    assert.equal(result?.ok,false);
    if(result&&!result.ok)assert.ok(result.issue.length<=96,result.issue);
  }
});

test('register preset selection refuses invalid decoders and incomplete address coverage without marking the device preset',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,[]);
  const device=draft.devices[0]!;
  for(const registers of [
    [{registerAddress:'9999',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1}],
    [{registerAddress:'3204',registerCount:2,dataType:'not-a-decoder',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1}],
    [{registerAddress:'3204',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first'}],
    [{registerAddress:'3204',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1},{registerAddress:'3204',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1}],
    [{registerAddress:'3204',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1},{registerAddress:'9999',registerCount:2,dataType:'invalid',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1}],
    [{registerAddress:'3204',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1},{registerAddress:'R3204',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1}],
    [{registerAddress:'1',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1},{registerAddress:'R1',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1},{registerAddress:'0x1',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1},{registerAddress:'0001',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1}],
    [{registerAddress:'0x0C84',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1},{registerAddress:'0C84h',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1}],
  ]){
    const selected=selectGatewayRegisterPreset(device,{id:'44444444-4444-4444-8444-444444444444',model:'PM2230',registers});
    assert.equal(selected.ok,false,JSON.stringify(registers));
    if(!selected.ok){
      assert.match(selected.issue,/preset|address|decoder|mapping/i);
      assert.equal(selected.device.mappingSource,'gateway');
      assert.equal(selected.device.presetId,undefined);
    }
  }
});

test('register preset address matching uses the same strict canonical identity as decoding',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,[]);
  const device=structuredClone(draft.devices[0]!);
  device.config.fields[0]!.registerAddress='1';
  const selected=selectGatewayRegisterPreset(device,{id:'44444444-4444-4444-8444-444444444444',model:'PM2230',registers:[
    {registerAddress:'R1',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1},
  ]});
  assert.equal(selected.ok,true);
});

test('register preset selection rejects duplicate canonical identities in selected mappings',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,[]);
  const device=structuredClone(draft.devices[0]!);
  device.config.fields.push({...device.config.fields[0]!,tag:'another.field',registerAddress:'R3204'});
  const selected=selectGatewayRegisterPreset(device,{id:'44444444-4444-4444-8444-444444444444',model:'PM2230',registers:[
    {registerAddress:'3204',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1},
  ]});
  assert.equal(selected.ok,false);
});

test('only the stable stale-discovery API code is classified as a reload conflict',()=>{
  assert.equal(isStaleDiscoveryConflict({status:409,code:'GATEWAY_DISCOVERY_STALE'}),true);
  assert.equal(isStaleDiscoveryConflict({status:409,code:'SITE_GATEWAY_OCCUPIED'}),false);
  assert.equal(isStaleDiscoveryConflict({status:409}),false);
});

test('an invalid local decoder or preset-selection draft blocks confirmation until corrected',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,[{id:siteId,code:'SITE-ALPHA'}]);
  draft.devices[1]!.enabled=false;
  draft.devices[0]!.decoderDraftIssues={'preset-selection':'invalid preset'};
  assert.match(validateGatewayOnboardingDraft(draft,'en')??'',/invalid decoder draft/i);
  delete draft.devices[0]!.decoderDraftIssues;
  assert.equal(validateGatewayOnboardingDraft(draft,'en'),null);
});

test('device without a suggestion falls back to manual configuration without fabricated mappings',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,[]);
  const logger=draft.devices[1]!;
  assert.equal(logger.suggestedPreset,undefined);
  assert.equal(logger.mappingSource,'manual');
  assert.deepEqual(logger.config.fields,[]);
  assert.deepEqual(logger.config.pollGroups,[]);
});

test('disabled incomplete devices are allowed while enabled incomplete mappings block confirmation',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,[{id:siteId,code:'SITE-ALPHA'}]);
  assert.match(validateGatewayOnboardingDraft(draft,'en')??'',/INV-01.*mapping/i);
  const partialMapping={tag:'admin-note',displayName:'Reported but not configured'};
  draft.devices[1]!.config.fields=[partialMapping as never];
  draft.devices[1]!.enabled=false;
  assert.equal(validateGatewayOnboardingDraft(draft,'en'),null);
  const disabled=gatewayConfirmationRequest(draft).devices[1]!;
  assert.equal(disabled.enabled,false);
  assert.deepEqual(disabled.mappings,[partialMapping]);
});

test('disabled devices retain valid partial decoders but reject invalid provided storage values',()=>{
  const valid=gatewayOnboardingDraftFromDetail(detail,[{id:siteId,code:'SITE-ALPHA'}]);
  valid.devices[1]!.enabled=false;
  valid.devices[1]!.config.fields=[{registerAddress:'3204',scale:0.01} as never];
  assert.equal(validateGatewayOnboardingDraft(valid,'en'),null);
  assert.deepEqual(gatewayConfirmationRequest(valid).devices[1]!.mappings,[{registerAddress:'3204',scale:0.01}]);

  for(const patch of [{registerCount:2147483648},{scale:1e12},{scale:0.123456789}]){
    const draft=gatewayOnboardingDraftFromDetail(detail,[{id:siteId,code:'SITE-ALPHA'}]);
    draft.devices[1]!.enabled=false;
    draft.devices[1]!.config.fields=[{registerAddress:'3204',...patch} as never];
    assert.match(validateGatewayOnboardingDraft(draft,'en')??'',/INV-01.*mapping/i,JSON.stringify(patch));
    assert.throws(()=>gatewayConfirmationRequest(draft),/INV-01.*mapping/i);
  }
});

test('confirmation rejects a stale discovery revision before submitting edits',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,[{id:siteId,code:'SITE-ALPHA'}]);
  draft.devices[1]!.enabled=false;
  assert.throws(()=>gatewayConfirmationRequest(draft,8),/snapshot changed/i);
  assert.equal(gatewayConfirmationRequest(draft,7).discoveryRevision,7);
});

test('client validation allows telemetry-only devices without physical polling details',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,[{id:siteId,code:'SITE-ALPHA'}]);
  draft.devices[1]!.enabled=false;
  draft.devices[0]!.connection={};
  assert.equal(validateGatewayOnboardingDraft(draft,'en'),null);
});

test('client validation enforces an explicitly supplied Modbus TCP connection schema',()=>{
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
    assert.match(validateGatewayOnboardingDraft(draft,'en')??'',/connection.*METER-01/i,JSON.stringify(connection));
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
    assert.match(validateGatewayOnboardingDraft(draft,'en')??'',/connection.*INV-01/i,JSON.stringify(connection));
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
