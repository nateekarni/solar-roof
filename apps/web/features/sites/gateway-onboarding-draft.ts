import type {
  ConfirmGatewayRequest,
  DiscoveredGatewayDetail,
  GatewayDeviceConfig,
  GatewayJsonValue,
  GatewayRegisterMapping,
  GatewayRegisterPayload,
  GatewayReportedDevice,
  TelemetryDiscoveryEnvelope,
} from '@solar/api-contracts';
import {applyGatewayRegisterPresetMappings,gatewayConnectionIssue,gatewayRegisterMappingCollectionIssue,gatewayRegisterMappingIssue,gatewayRegisterMappingValueIssue} from '@solar/api-contracts';
import type {PayloadRevision} from './payload-contracts';
import {
  deviceProfilePayload,
  newDeviceDraft,
  selectDevicePreset,
  validateDeviceProfile,
  type DeviceDraft,
} from './site-form-values';

export interface GatewayPresetSuggestion {
  id:string;
  kind:'register'|'profile';
  rank:number;
}

export interface GatewayRegisterPreset {
  id:string;
  brand?:string;
  model:string;
  deviceType?:string;
  registers?:unknown[];
  updatedAt?:string;
}

export interface GatewayDiscoveryDetail extends DiscoveredGatewayDetail {
  presetSuggestions?:{deviceId:string;suggestions:GatewayPresetSuggestion[]}[];
}

export interface GatewaySiteOption {
  id:string;
  code?:string|null;
  externalSiteId?:string|null;
}

export interface GatewayOnboardingDeviceDraft extends DeviceDraft {
  reported:Readonly<GatewayReportedDevice>;
  enabled:boolean;
  mappingSource:'preset'|'manual'|'gateway';
  suggestedPreset?:GatewayPresetSuggestion;
  presetSuggestions?:GatewayPresetSuggestion[];
  presetSuggestionAmbiguous?:boolean;
  presetId?:string;
  presetVersion?:string;
  manufacturer?:string;
  firmwareVersion?:string;
  profileId?:string;
  profileVersion?:string;
  protocol:string;
  connection:{[key:string]:GatewayJsonValue};
  decoderDraftIssues?:Record<string,string>;
}

export interface GatewayOnboardingIssue {
  code:string;
  section:'site'|'devices'|'preset'|'metadata'|'connection'|'mapping';
  message:string;
  deviceKey?:string;
  fieldId?:string;
  mappingIndex?:number;
}

export interface GatewayOnboardingDraft {
  discoveryId:string;
  discoveryRevision:number;
  reportedSiteId:string|null;
  selectedSiteId:string;
  reported:Readonly<GatewayOnboardingReportedSnapshot & {assignedSiteId?:never}>;
  devices:GatewayOnboardingDeviceDraft[];
}

export interface GatewayOnboardingReportedSnapshot {
  schemaVersion:'1.1'|'1.2';
  messageType:'register'|'telemetry';
  messageId:string;
  sentAt:string;
  reportedSiteId?:string;
  gateway:{gatewayId:string;gatewaySerial?:string;model?:string;firmwareVersion?:string};
  devices:GatewayReportedDevice[];
}

const clone=<T>(value:T):T=>structuredClone(value);

function deepFreeze<T>(value:T):T {
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value as Record<string,unknown>))deepFreeze(child);
  }
  return value;
}

function reportedDeviceDraft(device:GatewayReportedDevice,presetSuggestions:GatewayPresetSuggestion[]=[]):GatewayOnboardingDeviceDraft {
  const mappings=clone(device.mappings??[]);
  const base=newDeviceDraft(device.deviceType??'');
  const profileId=device.profileId?.trim();
  const profileVersion=device.profileVersion?.trim();
  const sourceProfile=profileId&&profileVersion?{id:profileId,version:profileVersion}:undefined;
  const suggestedPreset=presetSuggestions[0];
  const presetSuggestionAmbiguous=Boolean(suggestedPreset&&presetSuggestions[1]?.rank===suggestedPreset.rank);
  const draft:GatewayOnboardingDeviceDraft={
    ...base,
    key:device.deviceId,
    name:device.model?.trim()||device.deviceId,
    externalDeviceId:device.deviceId,
    model:device.model??'',
    serialNumber:device.serialNumber??'',
    enabled:true,
    mappingSource:mappings.length?'gateway':'manual',
    protocol:device.protocol??'',
    connection:clone(device.connection??{}),
    config:{
      id:profileId||'manual',
      version:profileVersion||'1.0.0',
      schemaVersion:'1.1',
      displayName:device.model?.trim()||device.deviceId,
      deviceType:device.deviceType??'',
      pollGroups:clone(device.pollGroups??[]),
      fields:mappings,
      ...(sourceProfile?{sourceProfile}:{}),
    },
    profileDirty:true,
    dirty:false,
    reported:deepFreeze(clone(device)),
    ...(suggestedPreset?{suggestedPreset:clone(suggestedPreset)}:{}),
    ...(presetSuggestions.length?{presetSuggestions:clone(presetSuggestions)}:{}),
    ...(presetSuggestionAmbiguous?{presetSuggestionAmbiguous:true}:{}),
    ...(device.manufacturer!==undefined?{manufacturer:device.manufacturer}:{}),
    ...(device.firmwareVersion!==undefined?{firmwareVersion:device.firmwareVersion}:{}),
    ...(device.profileId!==undefined?{profileId:device.profileId}:{}),
    ...(device.profileVersion!==undefined?{profileVersion:device.profileVersion}:{}),
  };
  return draft;
}

export function gatewayOnboardingDraftFromDetail(detail:GatewayDiscoveryDetail,sites:readonly GatewaySiteOption[]):GatewayOnboardingDraft {
  const reported=deepFreeze(clone(normalizeReportedSnapshot(detail))) as Readonly<GatewayOnboardingReportedSnapshot & {assignedSiteId?:never}>;
  const reportedSiteId=reported.reportedSiteId?.trim()||null;
  const normalized=reportedSiteId?.toLocaleLowerCase();
  const matched=normalized?sites.find(site=>[site.code,site.externalSiteId,site.id].some(value=>value?.toLocaleLowerCase()===normalized)):undefined;
  const suggestions=new Map((detail.presetSuggestions??[]).map(row=>[row.deviceId,row.suggestions]));
  return {
    discoveryId:detail.id,
    discoveryRevision:detail.discoveryRevision,
    reportedSiteId,
    selectedSiteId:matched?.id??'',
    reported,
    devices:reported.devices.map(device=>reportedDeviceDraft(device,suggestions.get(device.deviceId))),
  };
}

function normalizeReportedSnapshot(detail:GatewayDiscoveryDetail):GatewayOnboardingReportedSnapshot {
  const snapshot=detail.snapshot;
  if(snapshot.messageType==='register')return snapshot;
  const telemetry=snapshot as TelemetryDiscoveryEnvelope;
  const firmwareVersion=(detail as {firmwareVersion?:string|null}).firmwareVersion;
  return {
    schemaVersion:'1.2',messageType:'telemetry',messageId:telemetry.messageId,sentAt:detail.lastSeenAt,
    reportedSiteId:telemetry.siteId,
    gateway:{gatewayId:telemetry.gatewayId,...(telemetry.gatewaySerial?{gatewaySerial:telemetry.gatewaySerial}:{}),...(detail.model?{model:detail.model}:{}),
      ...(firmwareVersion?{firmwareVersion}: {})},
    devices:detail.devices,
  };
}

export function selectGatewayDevicePreset(device:GatewayOnboardingDeviceDraft,preset:PayloadRevision|undefined,confirmed=false):GatewayOnboardingDeviceDraft {
  const selected=selectDevicePreset(device,preset,confirmed);
  if(!selected)return device;
  const payload=deviceProfilePayload(selected);
  const source=preset?(preset.config.sourceProfile??{id:preset.profileId,version:preset.version}):undefined;
  return {
    ...device,
    ...selected,
    mappingSource:payload.payloadProfileRevisionId?'preset':'manual',
    ...(payload.payloadProfileRevisionId?{presetId:payload.payloadProfileRevisionId}:{}),
    ...(payload.payloadProfileRevisionId&&preset?.version?{presetVersion:preset.version}:{}),
    ...((source?.id??device.reported.profileId)?{profileId:source?.id??device.reported.profileId}:{}),
    ...((source?.version??device.reported.profileVersion)?{profileVersion:source?.version??device.reported.profileVersion}:{}),
  };
}

/** Register presets provide physical decoder details, never semantic field identity. */
export function selectGatewayRegisterPreset(device:GatewayOnboardingDeviceDraft,preset:GatewayRegisterPreset):
  {ok:true;device:GatewayOnboardingDeviceDraft}|{ok:false;device:GatewayOnboardingDeviceDraft;issue:string} {
  const applied=applyGatewayRegisterPresetMappings(device.config.fields as GatewayRegisterMapping[],preset.registers??[]);
  if(!applied.ok)return {ok:false,device,issue:`Register preset cannot cover this mapping (${applied.issue}).`};
  return {ok:true,device:{
    ...device,
    mappingSource:'preset',presetId:preset.id,...(preset.updatedAt?{presetVersion:preset.updatedAt}:{}),dirty:true,profileDirty:true,
    config:{...device.config,fields:applied.mappings as GatewayOnboardingDeviceDraft['config']['fields']},
  }};
}

/** Apply a unique server-ranked suggestion once. Dirty or already-selected devices are never overwritten. */
export function applySuggestedGatewayPresets(
  draft:GatewayOnboardingDraft,
  presets:readonly PayloadRevision[],
  registerPresets:readonly GatewayRegisterPreset[],
):GatewayOnboardingDraft {
  let changed=false;
  const devices=draft.devices.map(device=>{
    const suggestion=device.suggestedPreset;
    if(!suggestion||device.presetSuggestionAmbiguous||device.presetId||device.dirty)return device;
    if(suggestion.kind==='profile'){
      const preset=presets.find(candidate=>candidate.id===suggestion.id);
      if(!preset)return device;
      const selected=selectGatewayDevicePreset(device,preset,true);
      if(selected===device)return device;
      changed=true;return selected;
    }
    const preset=registerPresets.find(candidate=>candidate.id===suggestion.id);
    if(!preset)return device;
    const selected=selectGatewayRegisterPreset(device,preset);
    if(!selected.ok)return device;
    changed=true;return selected.device;
  });
  return changed?{...draft,devices}:draft;
}

function asMapping(field:GatewayOnboardingDeviceDraft['config']['fields'][number]):GatewayRegisterMapping {
  return clone(field) as GatewayRegisterMapping;
}

function deviceConfig(device:GatewayOnboardingDeviceDraft):GatewayDeviceConfig {
  const common={
    deviceId:device.externalDeviceId.trim(),
    mappingSource:device.mappingSource,
    pollGroups:clone(device.config.pollGroups),
    mappings:device.config.fields.map(asMapping),
    ...(device.manufacturer?.trim()?{manufacturer:device.manufacturer.trim()}:{}),
    ...(device.model.trim()?{model:device.model.trim()}:{}),
    ...(device.firmwareVersion?.trim()?{firmwareVersion:device.firmwareVersion.trim()}:{}),
    ...(device.serialNumber.trim()?{serialNumber:device.serialNumber.trim()}:{}),
    ...(device.profileId?.trim()?{profileId:device.profileId.trim()}:{}),
    ...(device.profileVersion?.trim()?{profileVersion:device.profileVersion.trim()}:{}),
    ...(device.config.deviceType.trim()?{deviceType:device.config.deviceType.trim()}:{}),
    ...(device.protocol.trim()?{protocol:device.protocol.trim()}:{}),
    ...(Object.keys(device.connection).length?{connection:clone(device.connection)}:{}),
    ...(device.mappingSource==='preset'&&device.presetId?{presetId:device.presetId}:{}),
    ...(device.mappingSource==='preset'&&device.presetVersion?{presetVersion:device.presetVersion}:{}),
  };
  return device.enabled?{...common,enabled:true}:{...common,enabled:false};
}

function deviceIssue(device:GatewayOnboardingDeviceDraft,locale:string):GatewayOnboardingIssue|null {
  const th=locale==='th';
  const key=device.externalDeviceId||device.key;
  const issue=(code:string,section:GatewayOnboardingIssue['section'],message:string,fieldId?:string,mappingIndex?:number):GatewayOnboardingIssue=>({
    code,section,message,deviceKey:device.key,...(fieldId?{fieldId}:{}),...(mappingIndex===undefined?{}:{mappingIndex}),
  });
  const connectionFieldId=()=>{
    const connection=device.connection as Record<string,unknown>;
    const keys=device.protocol==='modbus-rtu'?['serialPort','baudRate','dataBits','parity','stopBits','slaveId']:['host','port','slaveId'];
    const missing=keys.find(candidate=>connection[candidate]===undefined||connection[candidate]===null||connection[candidate]==='');
    return `gateway-device-connection-${missing??keys[0]}-${device.key}`;
  };
  const collectionIssue=gatewayRegisterMappingCollectionIssue(device.config.fields);
  if(collectionIssue)return issue('mapping_collection_invalid','mapping',th?`อุปกรณ์ ${key} มี mapping ที่ซ้ำหรือไม่ถูกต้อง`:`Device ${key} has duplicate or invalid mappings.`,`gateway-device-mapping-${device.key}`);
  if(!device.enabled){
    const invalidIndex=device.config.fields.findIndex(mapping=>gatewayRegisterMappingValueIssue(mapping));
    return invalidIndex>=0?issue('mapping_invalid','mapping',th?`อุปกรณ์ ${key} มี mapping ที่ไม่ถูกต้อง`:`Device ${key} has an invalid mapping.`,`gateway-register-${device.key}-${invalidIndex}-address`,invalidIndex):null;
  }
  if(!device.externalDeviceId.trim())return issue('device_id_required','metadata',th?'กรุณาระบุ Device ID':`Device ${key} requires a device ID.`,`gateway-device-id-${device.key}`);
  if(!device.model.trim())return issue('device_model_required','metadata',th?`กรอกรุ่นของอุปกรณ์ ${key}`:`Enter the model for device ${key}.`,`gateway-device-model-${device.key}`);
  if(!device.serialNumber.trim())return issue('device_serial_required','metadata',th?`กรอกหมายเลขซีเรียลของอุปกรณ์ ${key}`:`Enter the serial number for device ${key}.`,`gateway-device-serialNumber-${device.key}`);
  if(!device.config.deviceType.trim())return issue('device_type_required','metadata',th?`เลือกประเภทอุปกรณ์ ${key}`:`Select a device type for ${key}.`,`gateway-device-type-${device.key}`);
  const hasConnection=Object.keys(device.connection).length>0;
  if(hasConnection&&!device.protocol.trim())return issue('device_protocol_required','connection',th?`เลือกโปรโตคอลสำหรับข้อมูลการเชื่อมต่อของอุปกรณ์ ${key}`:`Select a protocol for the connection details of device ${key}.`,`gateway-device-protocol-${device.key}`);
  if(device.config.fields.length===0)return issue('mapping_required','mapping',th?`อุปกรณ์ ${key} ต้องมี Mapping อย่างน้อยหนึ่งรายการ`:`Device ${key} requires at least one mapping.`,`gateway-device-mapping-${device.key}`);
  if(device.config.pollGroups.length===0)return issue('poll_group_required','mapping',th?`อุปกรณ์ ${key} ต้องมีกลุ่มการอ่าน`:`Device ${key} requires a poll group.`,`gateway-device-mapping-${device.key}`);
  if(device.mappingSource==='preset'&&!device.presetId)return issue('preset_required','preset',th?`อุปกรณ์ ${key} ต้องเลือก Preset`:`Device ${key} requires an explicit preset.`,`gateway-device-preset-${device.key}`);
  if(device.decoderDraftIssues&&Object.keys(device.decoderDraftIssues).length){
    const entry=Object.keys(device.decoderDraftIssues)[0]!;
    const mappingIndex=entry==='preset-selection'?undefined:Number(entry.slice(entry.lastIndexOf(':')+1));
    return issue('decoder_draft_invalid',entry==='preset-selection'?'preset':'mapping',th?`อุปกรณ์ ${key} มีค่าตัวถอดรหัสที่ยังไม่ถูกต้อง`:`Device ${key} has an invalid decoder draft.`,entry==='preset-selection'?`gateway-device-preset-${device.key}`:`gateway-register-${device.key}-${mappingIndex}-address`,Number.isInteger(mappingIndex)?mappingIndex:undefined);
  }
  const connectionProblem=hasConnection?gatewayConnectionIssue(device.protocol,device.connection):null;
  if(connectionProblem)return issue(connectionProblem,'connection',th?`ตรวจสอบข้อมูลการเชื่อมต่อของอุปกรณ์ ${key}`:`Check the connection details for device ${key}.`,connectionFieldId());
  const mappings=device.config.fields as GatewayRegisterMapping[];
  const usesPhysicalModbus=hasConnection&&/^modbus/i.test(device.protocol);
  const invalidMapping=mappings.findIndex(mapping=>gatewayRegisterMappingValueIssue(mapping)||(usesPhysicalModbus&&(!mapping.registerAddress||gatewayRegisterMappingIssue(mapping))));
  if(invalidMapping>=0){
    return issue('modbus_mapping_incomplete','mapping',th?`อุปกรณ์ ${key} มี mapping ของ Modbus ไม่ครบถ้วน`:`Device ${key} has an incomplete Modbus mapping.`,`gateway-register-${device.key}-${invalidMapping}-address`,invalidMapping);
  }
  const profileProblem=validateDeviceProfile(device.config,false,locale);
  if(profileProblem)return issue('profile_invalid','mapping',`${key}: ${profileProblem}`,`gateway-device-mapping-${device.key}`);
  return null;
}

export function gatewayOnboardingIssue(draft:GatewayOnboardingDraft,locale:string):GatewayOnboardingIssue|null {
  const th=locale==='th';
  if(!draft.selectedSiteId)return {code:'site_required',section:'site',fieldId:'gateway-pairing-site',message:th?'กรุณาเลือกไซต์งาน':'Select a site.'};
  const enabled=draft.devices.filter(device=>device.enabled);
  if(!enabled.length)return {code:'enabled_device_required',section:'devices',message:th?'ต้องเปิดใช้งานอุปกรณ์อย่างน้อยหนึ่งรายการ':'Enable at least one device.'};
  if(new Set(enabled.map(device=>device.externalDeviceId.trim())).size!==enabled.length)return {code:'duplicate_device_id',section:'metadata',message:th?'Device ID ต้องไม่ซ้ำกัน':'Device IDs must be unique.'};
  for(const device of draft.devices){const problem=deviceIssue(device,locale);if(problem)return problem;}
  return null;
}

export function validateGatewayOnboardingDraft(draft:GatewayOnboardingDraft,locale:string):string|null {
  return gatewayOnboardingIssue(draft,locale)?.message??null;
}

export function gatewayConfirmationRequest(draft:GatewayOnboardingDraft,currentDiscoveryRevision=draft.discoveryRevision):ConfirmGatewayRequest {
  if(currentDiscoveryRevision!==draft.discoveryRevision)throw new Error('Gateway snapshot changed; reload before confirmation.');
  const problem=validateGatewayOnboardingDraft(draft,'en');
  if(problem)throw new Error(problem);
  return {discoveryRevision:draft.discoveryRevision,siteId:draft.selectedSiteId,devices:draft.devices.map(deviceConfig)};
}

export function isStaleDiscoveryConflict(error:unknown):boolean {
  return typeof error==='object'&&error!==null&&(error as {status?:unknown}).status===409
    &&(error as {code?:unknown}).code==='GATEWAY_DISCOVERY_STALE';
}
