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

export interface GatewayDeviceConfig extends GatewayReportedDevice {
  enabled: boolean;
  mappingSource: 'preset' | 'manual' | 'gateway';
  presetId?: string;
  presetVersion?: string;
  pollGroups: string[];
  mappings: GatewayRegisterMapping[];
}

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
  lastReceivedAt?: string | null;
  lastError?: GatewayConfigStatusPayload['error'] | null;
}
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
  status: 'pending' | 'approved' | 'rejected' | 'stale';
  approvalMode: 'manual';
  snapshot: GatewayConfigUpdatePayload;
  receivedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
}

export type GatewayConnectionIssue = 'unsupported_protocol' | 'invalid_connection';
export type GatewayRegisterMappingIssue = 'incomplete_decoder' | 'invalid_register_count' | 'invalid_scale' | 'invalid_offset';

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
export function gatewayRegisterMappingIssue(mapping:GatewayRegisterMapping):GatewayRegisterMappingIssue|null {
  if(mapping.registerAddress!==undefined&&[mapping.registerCount,mapping.dataType,mapping.byteOrder,mapping.wordOrder,mapping.scale].some(value=>value===undefined))return 'incomplete_decoder';
  if(mapping.registerCount!==undefined&&!integerIn(mapping.registerCount,1,2_147_483_647))return 'invalid_register_count';
  if(mapping.scale!==undefined){
    const [coefficient,exponent='0']=mapping.scale.toString().toLowerCase().split('e');
    const decimals=Math.max(0,(coefficient!.split('.')[1]?.length??0)-Number(exponent));
    if(!Number.isFinite(mapping.scale)||Math.abs(mapping.scale)>=1e12||decimals>8)return 'invalid_scale';
  }
  if(mapping.offset!==undefined&&!Number.isFinite(mapping.offset))return 'invalid_offset';
  return null;
}
