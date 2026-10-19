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
