import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {DiscoveredGatewayDetail, GatewayRegisterPayload, GatewaySyncState} from '@solar/api-contracts';
import {LocaleProvider} from '../../providers/locale-provider';
import {
  GATEWAY_PAIRING_STEPS,
  GatewayPairingSummary,
  PairDiscoveredGatewayDialog,
  gatewayPairingSurface,
  gatewayPairingStepIssue,
  reconcileGatewayPairingDraft,
  reloadGatewayPairingDraft,
  createGatewayPairingOperationGuard,
  createGatewayDetailReloadGuard,
  canDismissGatewayPairing,
  visibleGatewayPairingCredential,
} from './pair-discovered-gateway-dialog';
import {GatewayDiscoveryReview} from './gateway-discovery-review';
import {GatewayDeviceConfiguration} from './gateway-device-configuration';
import {applyGatewayDeviceEditorChange,clearGatewayPresetError,gatewayDeviceMatchState,parseGatewayConnectionDraft} from './gateway-device-configuration';
import {GatewaySyncStatus} from './gateway-sync-status';
import {gatewayOnboardingDraftFromDetail,selectGatewayRegisterPreset} from './gateway-onboarding-draft';
import {applyRegisterDecoderCommit,commitRegisterDecoderDraft,createRegisterDecoderDraft,REGISTERED_REGISTER_DECODER_CONSTRAINTS} from './register-decoder-editor';

const siteAlpha='11111111-1111-4111-8111-111111111111';
const siteBeta='22222222-2222-4222-8222-222222222222';
const snapshot:GatewayRegisterPayload={
  schemaVersion:'1.1',messageType:'register',messageId:'register-1',sentAt:'2026-10-19T01:00:00.000Z',
  gateway:{gatewayId:'GW-001',model:'Edge Pro',firmwareVersion:'3.2.1'},reportedSiteId:'SITE-ALPHA',
  devices:[
    {deviceId:'METER-01',deviceType:'energy-meter',manufacturer:'Schneider',model:'PM2230',firmwareVersion:'1.7',serialNumber:'SN-01',protocol:'modbus-tcp',connection:{host:'10.0.0.8',port:502,slaveId:1},pollGroups:['energy'],mappings:[{tag:'energy.active.import.total',registerAddress:'3204',displayName:'Imported energy',pollGroup:'energy',sourceUnit:'Wh',targetUnit:'kWh',conversion:'wh-to-kwh',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1,offset:0}]},
    {deviceId:'INV-01',deviceType:'solar-logger',model:'Logger X'},
  ],
};
const detail:DiscoveredGatewayDetail={
  id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',externalGatewayId:'GW-001',reportedSiteId:'SITE-ALPHA',reportedDeviceId:'METER-01',manufacturer:'Schneider',model:'Edge Pro',profileId:null,protocol:'mqtt',status:'unassigned',assignedSiteId:null,assignedGatewayId:null,firstSeenAt:'2026-10-19T01:00:00.000Z',lastSeenAt:'2026-10-19T01:00:01.000Z',rawPayload:snapshot as unknown as Record<string,unknown>,discoveryRevision:7,snapshot,devices:snapshot.devices,
};
const sites=[
  {id:siteAlpha,code:'SITE-ALPHA',externalSiteId:'SITE-ALPHA',name:'Alpha roof',active:true,assignedGatewayId:null},
  {id:siteBeta,code:'SITE-BETA',externalSiteId:'SITE-BETA',name:'Beta roof',active:true,assignedGatewayId:null},
];

test('pairing exposes four ordered named steps and blocks skipping incomplete work',()=>{
  assert.deepEqual(GATEWAY_PAIRING_STEPS.map(step=>step.id),['review','site','devices','confirm']);
  assert.deepEqual(GATEWAY_PAIRING_STEPS.map(step=>step.en),['Review gateway','Select site','Configure devices','Confirm & sync']);
  const draft=gatewayOnboardingDraftFromDetail(detail,sites);
  assert.equal(gatewayPairingStepIssue('review',draft,'en'),null);
  draft.selectedSiteId='';
  assert.match(gatewayPairingStepIssue('site',draft,'en')??'',/select a site/i);
  draft.selectedSiteId=siteAlpha;
  assert.match(gatewayPairingStepIssue('devices',draft,'en')??'',/INV-01.*complete/i);
  draft.devices[1]!.enabled=false;
  assert.equal(gatewayPairingStepIssue('devices',draft,'en'),null);
});

test('review keeps reported facts immutable, preselects a matching site and warns when the authoritative selection differs',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,sites);
  assert.equal(draft.selectedSiteId,siteAlpha);
  assert.equal(draft.reported.assignedSiteId,undefined);
  draft.selectedSiteId=siteBeta;
  const html=renderToStaticMarkup(<GatewayDiscoveryReview draft={draft} sites={sites} onSiteChange={()=>{}} locale="en"/>);
  assert.match(html,/GW-001/);
  assert.match(html,/Edge Pro/);
  assert.match(html,/3\.2\.1/);
  assert.match(html,/Revision 7/);
  assert.match(html,/Selected site differs from the reported site/i);
  assert.match(html,/admin-selected site is authoritative/i);
  assert.match(html,/aria-label="Select actual site"/);
});

test('cached discovery waits for the site catalogue before creating its preselected draft',()=>{
  assert.equal(reconcileGatewayPairingDraft(null,detail,[],false).draft,null);
  const reconciled=reconcileGatewayPairingDraft(null,detail,sites,true);
  assert.equal(reconciled.draft?.selectedSiteId,siteAlpha);
  assert.equal(reconciled.stale,false);
});

test('device step supports explicit manual or preset configuration and disabled incomplete devices',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,sites);
  draft.devices[1]!.enabled=false;
  const html=renderToStaticMarkup(
    <LocaleProvider initialLocale="en">
      <GatewayDeviceConfiguration draft={draft} presets={[]} onChange={()=>{}} locale="en"/>
    </LocaleProvider>,
  );
  assert.match(html,/METER-01/);
  assert.match(html,/INV-01/);
  assert.match(html,/Manual configuration/);
  assert.match(html,/Gateway mapping/);
  assert.match(html,/Enable device/);
  assert.match(html,/disabled device can be completed later/i);
});

test('device match state distinguishes missing mappings, invalid configuration, suggestions, manual and preset choices',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,sites);
  assert.equal(gatewayDeviceMatchState(draft,draft.devices[1]!,'en'),'no_mapping');
  draft.devices[0]!.connection={};
  assert.equal(gatewayDeviceMatchState(draft,draft.devices[0]!,'en'),'invalid_configuration');
  draft.devices[0]!.connection={host:'10.0.0.8',port:502,slaveId:1};
  draft.devices[0]!.suggestedPreset={id:'preset-match',kind:'register',rank:80};
  assert.equal(gatewayDeviceMatchState(draft,draft.devices[0]!,'en'),'matched_by_model');
  draft.devices[0]!.mappingSource='manual';delete draft.devices[0]!.suggestedPreset;
  assert.equal(gatewayDeviceMatchState(draft,draft.devices[0]!,'en'),'manual');
  draft.devices[0]!.mappingSource='preset';draft.devices[0]!.presetId='preset-1';draft.devices[0]!.presetVersion='1';draft.devices[0]!.payloadProfileRevisionId='preset-1';draft.devices[0]!.profileDirty=false;
  assert.equal(gatewayDeviceMatchState(draft,draft.devices[0]!,'en'),'matched_preset');
});

test('device configuration exposes the validation reason before confirmation',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,sites);
  const html=renderToStaticMarkup(<LocaleProvider initialLocale="en"><GatewayDeviceConfiguration draft={draft} presets={[]} onChange={()=>{}} locale="en"/></LocaleProvider>);
  assert.match(html,/Device configuration needs attention/);
  assert.match(html,/INV-01.*complete details and mappings/);
  assert.match(html,/No mapping/);
});

test('confirmation summarizes the authoritative site and every enabled or disabled device mapping',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,sites);
  draft.devices[1]!.enabled=false;
  const html=renderToStaticMarkup(<GatewayPairingSummary draft={draft} sites={sites} locale="en"/>);
  assert.match(html,/Alpha roof/);
  assert.match(html,/METER-01/);
  assert.match(html,/1 field/);
  assert.match(html,/Gateway mapping/);
  assert.match(html,/modbus-tcp/);
  assert.match(html,/10\.0\.0\.8/);
  assert.match(html,/energy/);
  assert.match(html,/energy\.active\.import\.total/);
  assert.match(html,/Schneider/);
  assert.match(html,/SN-01/);
  assert.match(html,/energy-meter/);
  assert.match(html,/Wh/);
  assert.match(html,/kWh/);
  assert.match(html,/wh-to-kwh/);
  assert.match(html,/3204/);
  assert.match(html,/uint32/);
  assert.match(html,/big_endian/);
  assert.match(html,/big_word_first/);
  assert.match(html,/Scale 1/);
  assert.match(html,/INV-01/);
  assert.match(html,/Disabled/);
});

test('metadata-only edits preserve preset lineage while profile edits clear it',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,sites);
  const device={...draft.devices[0]!,mappingSource:'preset' as const,presetId:'preset-1',presetVersion:'1'};
  const edited=applyGatewayDeviceEditorChange(device,{...device,model:'Admin corrected model'});
  assert.equal(edited.mappingSource,'preset');
  assert.equal(edited.presetId,'preset-1');
  assert.equal(edited.presetVersion,'1');
  const mappingEdited=applyGatewayDeviceEditorChange(device,{...device,config:{...device.config,fields:device.config.fields.map((field,index)=>index===0?{...field,scale:0.5}:field)}});
  assert.equal(mappingEdited.mappingSource,'manual');
  assert.equal(mappingEdited.presetId,undefined);
  assert.equal(mappingEdited.presetVersion,undefined);
});

test('local Modbus draft editor exposes and updates the complete decoder without unsupported controls',()=>{
  const draft=gatewayOnboardingDraftFromDetail(detail,sites);
  draft.devices[1]!.enabled=false;
  const legacyPreset={id:'44444444-4444-4444-8444-444444444444',brand:'Schneider',model:'PM2230',registers:[{registerAddress:'3204',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1}]};
  const selection=selectGatewayRegisterPreset(draft.devices[0]!,legacyPreset);
  assert.equal(selection.ok,true);
  if(!selection.ok)return;
  draft.devices[0]=selection.device;
  const html=renderToStaticMarkup(<LocaleProvider initialLocale="en"><GatewayDeviceConfiguration draft={draft} presets={[]} legacyPresets={[legacyPreset]} onChange={()=>{}} locale="en"/></LocaleProvider>);
  for(const label of ['Register count','Data type','Byte order','Word order','Scale','Offset'])assert.match(html,new RegExp(label));
  assert.match(html,/Schneider PM2230/);
  assert.doesNotMatch(html,/Data cadence|Telemetry topic|Device name/);
  const decoder=createRegisterDecoderDraft(draft.devices[0]!.config.fields[0]!);
  decoder.scale='1e-3';decoder.offset='-';decoder.registerCount='4';
  assert.equal(decoder.offset,'-','transient numeric text must not be coerced while typing');
  const invalid=commitRegisterDecoderDraft(decoder);
  assert.equal(invalid.ok,false);
  decoder.offset='-2.5';
  const committed=commitRegisterDecoderDraft(decoder);
  assert.equal(committed.ok,true);
  if(committed.ok){assert.equal(committed.value.scale,0.001);assert.equal(committed.value.offset,-2.5);assert.equal(committed.value.registerCount,4);}
});

test('registered decoder constraints reject values that its API cannot persist',()=>{
  const base=createRegisterDecoderDraft({registerAddress:'R1',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1,unit:'kWh',pollingIntervalSeconds:60});
  assert.equal(commitRegisterDecoderDraft({...base,wordOrder:'cdab'},REGISTERED_REGISTER_DECODER_CONSTRAINTS).ok,false);
  assert.equal(commitRegisterDecoderDraft({...base,registerCount:'5'},REGISTERED_REGISTER_DECODER_CONSTRAINTS).ok,false);
  assert.equal(commitRegisterDecoderDraft({...base,pollingIntervalSeconds:'86401'},REGISTERED_REGISTER_DECODER_CONSTRAINTS).ok,false);
  assert.deepEqual(REGISTERED_REGISTER_DECODER_CONSTRAINTS.wordOrders,['little_word_first','big_word_first']);
});

test('blank optional decoder values delete the previous persisted value on commit',()=>{
  const draft=createRegisterDecoderDraft({registerAddress:'R1',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1,offset:2,unit:'kWh',pollingIntervalSeconds:60});
  const committed=commitRegisterDecoderDraft({...draft,offset:'',pollingIntervalSeconds:''});
  assert.equal(committed.ok,true);
  if(!committed.ok)return;
  const next=applyRegisterDecoderCommit({tag:'energy',offset:2,pollingIntervalSeconds:60},committed.value);
  assert.equal('offset' in next,false);
  assert.equal('pollingIntervalSeconds' in next,false);
});

test('stale detail reload accepts only a fresh successful result for the current open gateway epoch',()=>{
  const guard=createGatewayDetailReloadGuard();
  guard.open('discovery-a');
  const requestA=guard.begin('discovery-a');
  guard.close();
  guard.open('discovery-b');
  const requestB=guard.begin('discovery-b');
  const newerRequestB=guard.begin('discovery-b');
  assert.equal(requestB.signal.aborted,true,'a newer same-gateway reload aborts the older generation');
  assert.equal(guard.canApply(requestB,{isSuccess:true,isError:false,data:{id:'discovery-b'}}),false,'an older same-gateway success cannot clear stale state');
  assert.equal(guard.canApply(requestA,{isSuccess:true,isError:false,data:{id:'discovery-a'}}),false);
  assert.equal(guard.canApply(newerRequestB,{isSuccess:false,isError:true,data:{id:'discovery-b'}}),false,'cached data attached to an error is not fresh');
  assert.equal(guard.canApply(newerRequestB,{isSuccess:true,isError:false,data:{id:'discovery-a'}}),false,'wrong gateway cannot replace the draft');
  assert.equal(guard.canApply(newerRequestB,{isSuccess:true,isError:false,data:{id:'discovery-b'}}),true);
});

test('switching to manual clears only that device preset error',()=>{
  assert.deepEqual(clearGatewayPresetError({'meter-a':'invalid preset','meter-b':'other error'},'meter-a'),{'meter-b':'other error'});
  assert.deepEqual(clearGatewayPresetError({'meter-a':'invalid preset'},'meter-a'),{});
});

test('pairing cannot be voluntarily dismissed while confirmation or credential rotation is in flight',()=>{
  assert.equal(canDismissGatewayPairing(false,false),true);
  assert.equal(canDismissGatewayPairing(true,false),false);
  assert.equal(canDismissGatewayPairing(false,true),false);
});

test('closing or reopening invalidates, aborts and rejects late secret operation results',async()=>{
  const guard=createGatewayPairingOperationGuard(true);
  const first=guard.begin();
  let firstExposed:string|null=null;
  let resolveFirst!:(value:string)=>void;
  const lateFirst=new Promise<string>(resolve=>{resolveFirst=resolve;}).then(secret=>{if(guard.isCurrent(first))firstExposed=secret;});
  assert.equal(guard.isCurrent(first),true);
  guard.close();
  assert.equal(first.signal.aborted,true);
  assert.equal(guard.isCurrent(first),false);
  guard.open();
  const second=guard.begin();
  resolveFirst('old-dialog-secret');
  await lateFirst;
  assert.equal(firstExposed,null);
  assert.equal(guard.isCurrent(first),false);
  assert.equal(guard.isCurrent(second),true);
  guard.close();
  assert.equal(second.signal.aborted,true);
  let exposed:string|null=null;
  let resolveSecret!:(value:string)=>void;
  const lateSecret=new Promise<string>(resolve=>{resolveSecret=resolve;}).then(secret=>{if(guard.isCurrent(second))exposed=secret;});
  resolveSecret('must-not-reappear');
  await lateSecret;
  assert.equal(exposed,null);
});

test('one-time credential is synchronously scoped to the current discovery before rendering',()=>{
  const credential={gatewayId:'GW-A',value:{username:'GW-A',password:'secret-a'}};
  assert.deepEqual(visibleGatewayPairingCredential(credential,'GW-A'),credential.value);
  assert.equal(visibleGatewayPairingCredential(credential,'GW-B'),null);
  assert.equal(visibleGatewayPairingCredential(null,'GW-A'),null);
});

test('invalid connection JSON invalidates the editable draft instead of silently submitting the previous value',()=>{
  assert.deepEqual(parseGatewayConnectionDraft('{"host":"10.0.0.8"}','en'),{connection:{host:'10.0.0.8'},error:''});
  const invalid=parseGatewayConnectionDraft('{"host":','en');
  assert.deepEqual(invalid.connection,{});
  assert.match(invalid.error,/JSON|unexpected|property/i);
});

test('sync view renders one-time credential, copy actions, closing warning and terminal states',()=>{
  const base:GatewaySyncState={gatewayId:'33333333-3333-4333-8333-333333333333',lifecycleState:'configuring',configState:'pending_sync',connectionState:'offline',desiredConfigVersion:4,desiredConfigHash:'abc',activeConfigVersion:null,activeConfigHash:null};
  const pending=renderToStaticMarkup(<GatewaySyncStatus locale="en" credential={{username:'GW-001',password:'one-time-secret'}} syncState={base} onRotate={()=>{}} rotating={false}/>);
  assert.match(pending,/one-time-secret/);
  assert.match(pending,/Copy username/);
  assert.match(pending,/Copy password/);
  assert.match(pending,/Closing this dialog permanently hides/i);
  assert.match(pending,/Waiting for gateway reconnect/i);
  assert.match(pending,/Rotate credential/i);
  assert.match(readFileSync(new URL('gateway-sync-status.tsx',import.meta.url),'utf8'),/Confirm credential rotation/);
  const applied=renderToStaticMarkup(<GatewaySyncStatus locale="en" credential={null} syncState={{...base,lifecycleState:'active',configState:'applied',connectionState:'online',activeConfigVersion:4,activeConfigHash:'abc'}} onRotate={()=>{}} rotating={false}/>);
  assert.match(applied,/Configuration applied/i);
  const failed=renderToStaticMarkup(<GatewaySyncStatus locale="en" credential={null} syncState={{...base,activeConfigVersion:0,desiredConfig:{schemaVersion:'1.1',messageType:'config',messageId:'cfg',gatewayId:'GW-001',siteId:'SITE-001',configVersion:4,configHash:'abc',issuedAt:'2026-10-19T00:00:00Z',approvedBy:'admin',devices:[]},configState:'failed',lastError:{code:'DEVICE_WRITE',message:'register rejected'}}} onRotate={()=>{}} rotating={false} onCorrect={async()=>{}}/>);
  assert.match(failed,/Synchronization failed/i);
  assert.match(failed,/register rejected/i);
  assert.match(failed,/Correct initial configuration/i);
  const pollingError=renderToStaticMarkup(<GatewaySyncStatus locale="en" credential={null} syncState={base} syncError={new Error('poll failed')} onRetry={()=>{}} retrying={false} onRotate={()=>{}} rotating={false}/>);
  assert.match(pollingError,/Could not refresh sync status/i);
  assert.match(pollingError,/poll failed/);
  assert.match(pollingError,/Retry/);
});

test('confirmed sync and its one-time credential stay visible if the discovery detail is invalidated',()=>{
  assert.equal(gatewayPairingSurface(true,true,true),'sync');
  assert.equal(gatewayPairingSurface(false,true,true),'loading');
  assert.equal(gatewayPairingSurface(false,false,true),'error');
});

test('stale reload replaces the complete snapshot instead of merging register arrays',()=>{
  const edited=gatewayOnboardingDraftFromDetail(detail,sites);
  edited.devices[0]!.config.fields.push({...edited.devices[0]!.config.fields[0]!,tag:'admin-only'});
  const latestSnapshot=structuredClone(snapshot);
  latestSnapshot.messageId='register-2';
  latestSnapshot.devices=[{...latestSnapshot.devices[0]!,mappings:[{...latestSnapshot.devices[0]!.mappings![0]!,tag:'gateway-latest'}]}];
  const latest={...detail,discoveryRevision:8,snapshot:latestSnapshot,devices:latestSnapshot.devices};
  const reloaded=reloadGatewayPairingDraft(latest,sites);
  assert.equal(reloaded.discoveryRevision,8);
  assert.deepEqual(reloaded.devices.map(device=>device.externalDeviceId),['METER-01']);
  assert.deepEqual(reloaded.devices[0]!.config.fields.map(field=>field.tag),['gateway-latest']);
  assert.doesNotMatch(JSON.stringify(reloaded),/admin-only/);
});

test('permission guard suppresses pairing before loading or rendering controls',()=>{
  const html=renderToStaticMarkup(
    <LocaleProvider initialLocale="en">
      <PairDiscoveredGatewayDialog canOnboard={false} open discovered={detail} onOpenChange={()=>{}} onSuccess={()=>{}} inline/>
    </LocaleProvider>,
  );
  assert.equal(html,'');
});

test('new pairing workflow uses system components and never introduces raw replacement controls or browser credential storage',()=>{
  for(const file of ['pair-discovered-gateway-dialog.tsx','gateway-discovery-review.tsx','gateway-device-configuration.tsx','gateway-sync-status.tsx','register-decoder-editor.tsx','gateway-credential-recovery.tsx']){
    const source=readFileSync(new URL(file,import.meta.url),'utf8');
    assert.match(source,/components\/ui\//,file);
    assert.doesNotMatch(source,/<(?:input|select|table|dialog)\b/,file);
    assert.doesNotMatch(source,/\b(?:localStorage|sessionStorage)\b/,file);
  }
});
