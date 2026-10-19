import type {
  ConfirmGatewayRequest,
  DiscoveredGatewayDetail,
  GatewayDeviceConfig,
  GatewayJsonValue,
  GatewayRegisterMapping,
  GatewayRegisterPayload,
  GatewayReportedDevice,
} from '@solar/api-contracts';
import {gatewayConnectionIssue,gatewayRegisterMappingIssue} from '@solar/api-contracts';
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
  suggestedPresetId?:string;
  presetId?:string;
  presetVersion?:string;
  manufacturer?:string;
  firmwareVersion?:string;
  profileId?:string;
  profileVersion?:string;
  protocol:string;
  connection:{[key:string]:GatewayJsonValue};
}

export interface GatewayOnboardingDraft {
  discoveryId:string;
  discoveryRevision:number;
  reportedSiteId:string|null;
  selectedSiteId:string;
  reported:Readonly<GatewayRegisterPayload & {assignedSiteId?:never}>;
  devices:GatewayOnboardingDeviceDraft[];
}

const clone=<T>(value:T):T=>structuredClone(value);

function deepFreeze<T>(value:T):T {
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value as Record<string,unknown>))deepFreeze(child);
  }
  return value;
}

function reportedDeviceDraft(device:GatewayReportedDevice,suggestedPresetId?:string):GatewayOnboardingDeviceDraft {
  const mappings=clone(device.mappings??[]);
  const base=newDeviceDraft(device.deviceType??'');
  const profileId=device.profileId?.trim();
  const profileVersion=device.profileVersion?.trim();
  const sourceProfile=profileId&&profileVersion?{id:profileId,version:profileVersion}:undefined;
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
    ...(suggestedPresetId?{suggestedPresetId}:{}),
    ...(device.manufacturer!==undefined?{manufacturer:device.manufacturer}:{}),
    ...(device.firmwareVersion!==undefined?{firmwareVersion:device.firmwareVersion}:{}),
    ...(device.profileId!==undefined?{profileId:device.profileId}:{}),
    ...(device.profileVersion!==undefined?{profileVersion:device.profileVersion}:{}),
  };
  return draft;
}

export function gatewayOnboardingDraftFromDetail(detail:GatewayDiscoveryDetail,sites:readonly GatewaySiteOption[]):GatewayOnboardingDraft {
  const reportedSiteId=detail.snapshot.reportedSiteId?.trim()||null;
  const normalized=reportedSiteId?.toLocaleLowerCase();
  const matched=normalized?sites.find(site=>[site.code,site.externalSiteId,site.id].some(value=>value?.toLocaleLowerCase()===normalized)):undefined;
  const suggestions=new Map((detail.presetSuggestions??[]).map(row=>[row.deviceId,row.suggestions[0]?.id]));
  const reported=deepFreeze(clone(detail.snapshot)) as Readonly<GatewayRegisterPayload & {assignedSiteId?:never}>;
  return {
    discoveryId:detail.id,
    discoveryRevision:detail.discoveryRevision,
    reportedSiteId,
    selectedSiteId:matched?.id??'',
    reported,
    devices:detail.snapshot.devices.map(device=>reportedDeviceDraft(device,suggestions.get(device.deviceId))),
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

function asMapping(field:GatewayOnboardingDeviceDraft['config']['fields'][number]):GatewayRegisterMapping {
  return clone(field) as GatewayRegisterMapping;
}

function deviceConfig(device:GatewayOnboardingDeviceDraft):GatewayDeviceConfig {
  const selected=deviceProfilePayload(device);
  return {
    deviceId:device.externalDeviceId.trim(),
    enabled:device.enabled,
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
    ...(device.mappingSource==='preset'&&selected.payloadProfileRevisionId?{presetId:selected.payloadProfileRevisionId}:{}),
    ...(device.mappingSource==='preset'&&device.presetVersion?{presetVersion:device.presetVersion}:{}),
  };
}

function deviceProblem(device:GatewayOnboardingDeviceDraft,locale:string):string|null {
  if(!device.enabled)return null;
  const th=locale==='th';
  const required=!device.externalDeviceId.trim()||!device.model.trim()||!device.serialNumber.trim()||!device.config.deviceType.trim()
    ||!device.protocol.trim()||Object.keys(device.connection).length===0||device.config.pollGroups.length===0||device.config.fields.length===0;
  if(required)return th?`อุปกรณ์ ${device.externalDeviceId||device.key} ต้องมีข้อมูลและ mapping ครบถ้วน`:`Device ${device.externalDeviceId||device.key} requires complete details and mappings.`;
  if(device.mappingSource==='preset'&&!deviceProfilePayload(device).payloadProfileRevisionId)return th?`อุปกรณ์ ${device.externalDeviceId} ต้องเลือก Preset`:`Device ${device.externalDeviceId} requires an explicit preset.`;
  if(gatewayConnectionIssue(device.protocol,device.connection))return th?`อุปกรณ์ ${device.externalDeviceId} มีข้อมูลการเชื่อมต่อไม่ถูกต้อง`:`Device ${device.externalDeviceId} has an invalid connection.`;
  const mappings=device.config.fields as GatewayRegisterMapping[];
  if(/^modbus/i.test(device.protocol)&&mappings.some(mapping=>!mapping.registerAddress||gatewayRegisterMappingIssue(mapping))){
    return th?`อุปกรณ์ ${device.externalDeviceId} มี mapping ของ Modbus ไม่ครบถ้วน`:`Device ${device.externalDeviceId} has an incomplete Modbus mapping.`;
  }
  const profileProblem=validateDeviceProfile(device.config,false,locale);
  if(profileProblem)return `${device.externalDeviceId}: ${profileProblem}`;
  return null;
}

export function validateGatewayOnboardingDraft(draft:GatewayOnboardingDraft,locale:string):string|null {
  const th=locale==='th';
  if(!draft.selectedSiteId)return th?'กรุณาเลือกไซต์งาน':'Select a site.';
  const enabled=draft.devices.filter(device=>device.enabled);
  if(!enabled.length)return th?'ต้องเปิดใช้งานอุปกรณ์อย่างน้อยหนึ่งรายการ':'Enable at least one device.';
  if(new Set(enabled.map(device=>device.externalDeviceId.trim())).size!==enabled.length)return th?'Device ID ต้องไม่ซ้ำกัน':'Device IDs must be unique.';
  for(const device of draft.devices){const problem=deviceProblem(device,locale);if(problem)return problem;}
  return null;
}

export function gatewayConfirmationRequest(draft:GatewayOnboardingDraft,currentDiscoveryRevision=draft.discoveryRevision):ConfirmGatewayRequest {
  if(currentDiscoveryRevision!==draft.discoveryRevision)throw new Error('Gateway snapshot changed; reload before confirmation.');
  const problem=validateGatewayOnboardingDraft(draft,'en');
  if(problem)throw new Error(problem);
  return {discoveryRevision:draft.discoveryRevision,siteId:draft.selectedSiteId,devices:draft.devices.map(deviceConfig)};
}

export function isStaleDiscoveryConflict(error:unknown):boolean {
  return typeof error==='object'&&error!==null&&(error as {status?:unknown}).status===409;
}
