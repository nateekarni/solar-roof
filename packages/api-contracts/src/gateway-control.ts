import type { DiscoveredGatewayRow } from './index.js';

export type GatewayControlKind = 'register' | 'config' | 'configUpdate' | 'configStatus' | 'status';
export type GatewayConfigApplyStatus = 'received' | 'applied' | 'failed';
export type GatewayLifecycleState = 'discovered' | 'configuring' | 'active' | 'disabled';
export type GatewayConfigState = 'draft' | 'pending_sync' | 'applied' | 'failed' | 'drifted';
export type GatewayConnectionState = 'online' | 'offline' | 'unknown';
export type GatewayJsonValue = string | number | boolean | null | GatewayJsonValue[] | { [key: string]: GatewayJsonValue };

/** Profile vocabulary plus optional physical decoder details; no physical defaults. */
export interface GatewayRegisterMapping {
  tag: string;
  sourceTag?: string;
  required?: boolean;
  registerAddress?: string;
  displayName: string;
  pollGroup: string;
  sourceUnit: string;
  targetUnit: string;
  conversion: 'identity' | 'wh-to-kwh' | 'varh-to-kvarh' | 'auto-v1';
  role?: 'billing-import' | 'active-power' | 'none';
  registerCount?: number;
  dataType?: 'uint16' | 'int16' | 'uint32' | 'int32' | 'float32';
  byteOrder?: 'big_endian' | 'little_endian';
  wordOrder?: 'little_word_first' | 'big_word_first' | 'cdab' | 'abcd';
  scale?: number;
  offset?: number;
}

export const GATEWAY_REGISTER_DATA_TYPES=['uint16','int16','uint32','int32','float32'] as const;
export const GATEWAY_REGISTER_BYTE_ORDERS=['big_endian','little_endian'] as const;
export const GATEWAY_REGISTER_WORD_ORDERS=['little_word_first','big_word_first','cdab','abcd'] as const;

export interface GatewayReportedDevice {
  deviceId: string;
  deviceType?: string;
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  serialNumber?: string;
  profileId?: string;
  profileVersion?: string;
  protocol?: string;
  connection?: { [key: string]: GatewayJsonValue };
  pollGroups?: string[];
  mappings?: GatewayRegisterMapping[];
}

export interface TelemetryDiscoveryDevice {
  deviceId:string;
  deviceSerial:string;
  deviceType:string;
  manufacturer?:string;
  model?:string;
  profileId?:string;
  profileVersion?:string;
  protocol?:string;
}

export interface TelemetryDiscoveryEnvelope {
  schemaVersion:'1.2';
  messageType:'telemetry';
  messageId:string;
  siteId:string;
  gatewayId:string;
  gatewaySerial:string;
  device:TelemetryDiscoveryDevice;
}

interface GatewayDeviceConfigBase extends Omit<GatewayReportedDevice,'mappings'> {
  mappingSource: 'preset' | 'manual' | 'gateway';
  presetId?: string;
  presetVersion?: string;
  pollGroups: string[];
}

export interface GatewayEnabledDeviceConfig extends GatewayDeviceConfigBase {
  enabled: true;
  mappings: GatewayRegisterMapping[];
}

/** Disabled devices retain incomplete admin/reported drafts but are never materialized. */
export type GatewayDisabledRegisterMapping = Partial<GatewayRegisterMapping>;
export interface GatewayDisabledDeviceConfig extends GatewayDeviceConfigBase {
  enabled: false;
  mappings: GatewayDisabledRegisterMapping[];
}
export type GatewayDeviceConfig = GatewayEnabledDeviceConfig | GatewayDisabledDeviceConfig;

export interface GatewayRegisterPayload {
  schemaVersion: '1.1'; messageType: 'register'; messageId: string; sentAt: string;
  gateway: { gatewayId: string; model: string; firmwareVersion: string };
  reportedSiteId?: string; devices: GatewayReportedDevice[];
}

export interface GatewayConfigPayload {
  schemaVersion: '1.1'; messageType: 'config'; messageId: string;
  gatewayId: string; siteId: string; configVersion: number; configHash: string;
  issuedAt: string; approvedBy: string; devices: GatewayDeviceConfig[];
}

export interface GatewayConfigUpdatePayload {
  schemaVersion: '1.1'; messageType: 'configUpdate'; messageId: string;
  gatewayId: string; siteId: string; proposalId: string; baseConfigVersion: number;
  sentAt: string; devices: GatewayDeviceConfig[];
}

export interface GatewayConfigStatusPayload {
  schemaVersion: '1.1'; messageType: 'configStatus'; messageId: string; gatewayId: string;
  configVersion: number; configHash: string; status: GatewayConfigApplyStatus;
  reportedAt: string; error?: { code: string; message?: string; deviceId?: string; tag?: string };
}

export interface GatewayStatusPayload {
  schemaVersion: '1.1'; messageType: 'status'; messageId: string; gatewayId: string;
  sessionId: string; firmwareVersion: string; status: 'online' | 'offline';
  appliedConfigVersion: number | null; appliedConfigHash: string | null; reportedAt?: string;
}

export interface GatewayControlPayloads {
  register: GatewayRegisterPayload;
  config: GatewayConfigPayload;
  configUpdate: GatewayConfigUpdatePayload;
  configStatus: GatewayConfigStatusPayload;
  status: GatewayStatusPayload;
}

export interface DiscoveredGatewayDetail extends DiscoveredGatewayRow {
  discoveryRevision: number;
  snapshot: GatewayRegisterPayload;
  devices: GatewayReportedDevice[];
}
export interface ConfirmGatewayRequest {
  discoveryRevision: number;
  siteId: string;
  devices: GatewayDeviceConfig[];
}
export interface GatewaySyncState {
  gatewayId: string;
  lifecycleState: GatewayLifecycleState;
  configState: GatewayConfigState;
  connectionState: GatewayConnectionState;
  desiredConfigVersion: number | null;
  desiredConfigHash: string | null;
  activeConfigVersion: number | null;
  activeConfigHash: string | null;
  /** Current immutable desired snapshot, used for explicit initial correction review. */
  desiredConfig?: GatewayConfigPayload | null;
  lastReceivedAt?: string | null;
  lastError?: GatewayConfigStatusPayload['error'] | null;
}
export interface GatewayBillingContinuityProof {
  deviceId:string;
  expectedProfileRevisionId:string;
  expectedBillingSourceBindingId:string;
}
export interface AdoptExistingGatewayRequest {
  expectedDesiredConfigVersion:number;
  devices:GatewayDeviceConfig[];
  /** Required for each already billing-bound legacy device. The Admin reviews
   * the exact deployed decoder and billing binding before control-plane adoption. */
  billingContinuity?:GatewayBillingContinuityProof[];
}
export interface CorrectInitialGatewayConfigRequest { expectedBaseConfigVersion:number; expectedBaseConfigHash:string; devices:GatewayDeviceConfig[] }
export interface ConfirmGatewayResponse {
  gatewayId: string;
  configVersion: number;
  configHash: string;
  credential: { username: string; password: string };
  syncState: GatewaySyncState;
}
export interface GatewayConfigProposal {
  id: string;
  gatewayId: string;
  proposalId: string;
  baseConfigVersion: number;
  activeConfigVersion: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'stale';
  approvalMode: 'manual';
  snapshot: GatewayConfigUpdatePayload;
  activeSnapshot?: GatewayConfigPayload | null;
  receivedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
}
export interface ApproveGatewayProposalRequest {
  expectedProposalId: string;
  expectedBaseConfigVersion: number;
}

export type GatewayConnectionIssue = 'unsupported_protocol' | 'invalid_connection';
export type GatewayRegisterMappingIssue = 'invalid_register_address' | 'incomplete_decoder' | 'invalid_register_count' | 'invalid_data_type' | 'invalid_byte_order' | 'invalid_word_order' | 'invalid_scale' | 'invalid_offset';

const exactKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const actual=Object.keys(value).sort();
  return actual.length===keys.length&&actual.every((key,index)=>key===keys[index]);
};
const integerIn=(value:unknown,min:number,max:number)=>typeof value==='number'&&Number.isInteger(value)&&value>=min&&value<=max;

function isIpv4(host:string):boolean {
  const pieces=host.split('.');
  return pieces.length===4&&pieces.every(piece=>/^\d{1,3}$/.test(piece)&&Number(piece)<=255&&String(Number(piece))===piece);
}

function isIpv6(host:string):boolean {
  if(!host.includes(':')||!/^[\dA-Fa-f:.]+$/.test(host))return false;
  const halves=host.split('::');
  if(halves.length>2)return false;
  const groups=(part:string)=>part===''?[]:part.split(':');
  const left=groups(halves[0]!),right=groups(halves[1]??'');
  const all=[...left,...right];
  if(all.some((group,index)=>group.includes('.')
    ? index!==all.length-1||!isIpv4(group)
    : !/^[\dA-Fa-f]{1,4}$/.test(group)))return false;
  const count=all.reduce((sum,group)=>sum+(group.includes('.')?2:1),0);
  return halves.length===2?count<8:count===8;
}

function isGatewayHost(host:string):boolean {
  if(isIpv4(host)||isIpv6(host))return true;
  return !/^[\d.]+$/.test(host)&&host.split('.').every(label=>/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
}

/** Browser-safe validation shared by onboarding and the server's strict decoder preparation. */
export function gatewayConnectionIssue(protocol:string|undefined,connection:unknown):GatewayConnectionIssue|null {
  if(protocol==='modbus-tcp'){
    const keys=['host','port','slaveId'] as const;
    if(!exactKeys(connection,[...keys].sort()))return 'invalid_connection';
    const {host,port,slaveId}=connection;
    return typeof host==='string'&&host.trim().length>=1&&host.trim().length<=253&&isGatewayHost(host.trim())&&
      integerIn(port,1,65535)&&integerIn(slaveId,1,247)?null:'invalid_connection';
  }
  if(protocol==='modbus-rtu'){
    const keys=['baudRate','dataBits','parity','serialPort','slaveId','stopBits'] as const;
    if(!exactKeys(connection,[...keys].sort()))return 'invalid_connection';
    const {serialPort,baudRate,dataBits,parity,stopBits,slaveId}=connection;
    return typeof serialPort==='string'&&serialPort.trim().length>=1&&serialPort.trim().length<=256&&
      integerIn(baudRate,50,4_000_000)&&[5,6,7,8].includes(dataBits as number)&&
      ['none','even','odd','mark','space'].includes(parity as string)&&[1,1.5,2].includes(stopBits as number)&&
      integerIn(slaveId,1,247)?null:'invalid_connection';
  }
  return 'unsupported_protocol';
}

/** Storage and physical-decoder checks shared by browser preflight and API persistence. */
export function gatewayRegisterMappingValueIssue(mapping:Partial<GatewayRegisterMapping>):GatewayRegisterMappingIssue|null {
  try{
    if(!mapping||typeof mapping!=='object'||Array.isArray(mapping))return 'invalid_register_address';
    if(mapping.registerAddress!==undefined&&mapping.registerAddress.trim()!==''&&!gatewayRegisterIdentity(mapping.registerAddress))return 'invalid_register_address';
    if(mapping.registerCount!==undefined&&!integerIn(mapping.registerCount,1,2_147_483_647))return 'invalid_register_count';
    if(mapping.dataType!==undefined&&(typeof mapping.dataType!=='string'||!GATEWAY_REGISTER_DATA_TYPES.includes(mapping.dataType)))return 'invalid_data_type';
    if(mapping.byteOrder!==undefined&&(typeof mapping.byteOrder!=='string'||!GATEWAY_REGISTER_BYTE_ORDERS.includes(mapping.byteOrder)))return 'invalid_byte_order';
    if(mapping.wordOrder!==undefined&&(typeof mapping.wordOrder!=='string'||!GATEWAY_REGISTER_WORD_ORDERS.includes(mapping.wordOrder)))return 'invalid_word_order';
    if(mapping.scale!==undefined){
      if(typeof mapping.scale!=='number'||!Number.isFinite(mapping.scale)||Math.abs(mapping.scale)>=1e12)return 'invalid_scale';
      const [coefficient,exponent='0']=String(mapping.scale).toLowerCase().split('e');
      const decimals=Math.max(0,(coefficient!.split('.')[1]?.length??0)-Number(exponent));
      if(decimals>8)return 'invalid_scale';
    }
    if(mapping.offset!==undefined&&(typeof mapping.offset!=='number'||!Number.isFinite(mapping.offset)))return 'invalid_offset';
    return null;
  }catch{return 'invalid_register_address';}
}

/** Complete mappings additionally require the full physical decoder group. */
export function gatewayRegisterMappingIssue(mapping:GatewayRegisterMapping):GatewayRegisterMappingIssue|null {
  if(mapping.registerAddress!==undefined&&[mapping.registerCount,mapping.dataType,mapping.byteOrder,mapping.wordOrder,mapping.scale].some(value=>value===undefined))return 'incomplete_decoder';
  return gatewayRegisterMappingValueIssue(mapping);
}

export type GatewayRegisterMappingCollectionIssue='duplicate_tag'|'invalid_register_address'|'duplicate_register_address';

/** Collection invariants shared by browser review and API parsing. */
export function gatewayRegisterMappingCollectionIssue(mappings:readonly {tag?:unknown;registerAddress?:unknown}[]):GatewayRegisterMappingCollectionIssue|null {
  const tags=new Set<string>(),addresses=new Set<string>();
  for(const mapping of mappings){
    if(mapping.tag!==undefined){
      const tag=typeof mapping.tag==='string'?mapping.tag.trim():'';
      if(tag&&tags.has(tag))return 'duplicate_tag';
      if(tag)tags.add(tag);
    }
    if(mapping.registerAddress!==undefined){
      if(typeof mapping.registerAddress!=='string')return 'invalid_register_address';
      if(mapping.registerAddress.trim()==='')continue;
      const identity=gatewayRegisterIdentity(mapping.registerAddress);
      if(!identity)return 'invalid_register_address';
      if(addresses.has(identity))return 'duplicate_register_address';
      addresses.add(identity);
    }
  }
  return null;
}

const decoderKeys=['registerCount','dataType','byteOrder','wordOrder','scale','offset'] as const;
function presetValue(register:Record<string,unknown>,key:(typeof decoderKeys)[number]):unknown {
  const snake=key.replace(/[A-Z]/g,letter=>`_${letter.toLowerCase()}`);
  return register[key]??register[snake];
}

export type GatewayRegisterPresetApplyResult =
  | {ok:true;mappings:GatewayRegisterMapping[]}
  | {ok:false;issue:'no_mappings'|'empty_preset'|'invalid_register'|'duplicate_address'|'missing_mapping_address'|'address_not_found'|'invalid_decoder'};

/** Strict address identity matching the numeric notations understood by the decoder. */
export function gatewayRegisterIdentity(address:unknown):string|null {
  if(typeof address!=='string'||address.length>128)return null;
  const value=address.trim();
  let digits:string,radix:10|16;
  if(/^r\d+$/i.test(value)){digits=value.slice(1);radix=10;}
  else if(/^0x[\da-f]+$/i.test(value)){digits=value.slice(2);radix=16;}
  else if(/^[\da-f]+h$/i.test(value)){digits=value.slice(0,-1);radix=16;}
  else if(/^\d+$/.test(value)){digits=value;radix=10;}
  else return null;
  const parsed=BigInt(radix===16?`0x${digits}`:digits);
  return parsed<=BigInt(Number.MAX_SAFE_INTEGER)?parsed.toString():null;
}

/** Validate and apply physical decoder values without ever inventing or retaining unmatched mappings. */
export function applyGatewayRegisterPresetMappings(mappings:readonly GatewayRegisterMapping[],registers:unknown):GatewayRegisterPresetApplyResult {
  try{
    if(mappings.length===0)return {ok:false,issue:'no_mappings'};
    if(!Array.isArray(registers)||registers.length===0)return {ok:false,issue:'empty_preset'};
    const byAddress=new Map<string,Record<string,unknown>>();
    for(const candidate of registers){
      if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))return {ok:false,issue:'invalid_register'};
      const register=candidate as Record<string,unknown>;
      const rawAddress=register.registerAddress??register.register_address;
      if(typeof rawAddress!=='string')return {ok:false,issue:'invalid_register'};
      const address=rawAddress.trim();
      const identity=gatewayRegisterIdentity(address);
      if(!identity)return {ok:false,issue:'invalid_register'};
      const decoder={registerAddress:address} as Record<string,unknown>;
      for(const key of decoderKeys){const value=presetValue(register,key);if(value!==undefined)decoder[key]=value;}
      if(gatewayRegisterMappingIssue(decoder as unknown as GatewayRegisterMapping))return {ok:false,issue:'invalid_decoder'};
      if(byAddress.has(identity))return {ok:false,issue:'duplicate_address'};
      byAddress.set(identity,register);
    }
    const result:GatewayRegisterMapping[]=[];
    const selectedAddresses=new Set<string>();
    for(const mapping of mappings){
      const address=mapping.registerAddress?.trim();
      if(!address)return {ok:false,issue:'missing_mapping_address'};
      const identity=gatewayRegisterIdentity(address);
      if(!identity)return {ok:false,issue:'address_not_found'};
      if(selectedAddresses.has(identity))return {ok:false,issue:'duplicate_address'};
      selectedAddresses.add(identity);
      const register=byAddress.get(identity);
      if(!register)return {ok:false,issue:'address_not_found'};
      const next={...mapping,registerAddress:address} as Record<string,unknown>;
      for(const key of decoderKeys){
        const value=presetValue(register,key);
        if(value===undefined)delete next[key];else next[key]=value;
      }
      if(gatewayRegisterMappingIssue(next as unknown as GatewayRegisterMapping))return {ok:false,issue:'invalid_decoder'};
      result.push(next as unknown as GatewayRegisterMapping);
    }
    return {ok:true,mappings:result};
  }catch{return {ok:false,issue:'invalid_register'};}
}
