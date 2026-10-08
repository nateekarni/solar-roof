export interface PayloadField {
  sourceTag?:string; required?:boolean;
  tag: string; displayName: string; pollGroup: string; sourceUnit: string; targetUnit: string;
  conversion: 'identity' | 'wh-to-kwh' | 'varh-to-kvarh' | 'auto-v1'; role?: 'billing-import' | 'active-power' | 'none';
}
export interface PayloadProfile {
  sourceProfile?:{id:string;version:string};
  id: string; version: string; schemaVersion: '1.1'; displayName: string; deviceType: string;
  pollGroups: string[]; fields: PayloadField[];
}
export interface PayloadRevision { id: string; profileId: string; version: string; config: PayloadProfile; createdAt: string }
export interface PayloadDevice {
  profileConfig?:PayloadProfile;sourcePresetRevisionId?:string;profileOwnerDeviceId?:string;billingMeter?:boolean;billingSourceTag?:string;
  profileDeviceType?:string;
  sourceProfileId?:string;sourceProfileVersion?:string;
  id: string; name: string; externalDeviceId: string; profileRevisionId: string; profileId: string;
  model?:string; serialNumber?:string; deviceType?:string; fields?:PayloadField[];
  profileVersion: string; telemetryTopic: string; fixture: Record<string, unknown>;
}
export interface PayloadConfig {
  siteId: string; externalSiteId: string | null; gatewayId: string; externalGatewayId: string | null;
  subscriptionTopic: string; ackTopic: string | null; devices: PayloadDevice[];
  receiveRevision: { id: string | null; version: number; config: PayloadReceiveConfig; createdAt: string | null };
  bundleFixture: { schemaVersion: string; payloads: Record<string, Record<string, unknown>> } | null;
  rejections: { topic: string; reason: string; receivedAt: string }[];
  unmappedMessages: { deviceId: string; messageId: string; receivedAt: string; unmapped: {tag: string; rawValue: number; rawUnit: string}[] }[];
}
export interface PayloadReceiveConfig {
  messagesPath: string;
  fieldPaths: Record<string,string>;
  siteAlias?: string;
  gatewayAlias?: string;
  deviceAliases: { source:string;target:string;profileAlias?:{sourceId:string;sourceVersion:string;targetId:string;targetVersion:string} }[];
}
export interface CanonicalField {
  deviceId: string; deviceName: string; tag: string; value: number; unit: string; rawValue: number; rawUnit: string;
  polledAt: string; receivedAt: string; quality: string; communication: string; profileId: string;
  profileVersion: string; pollGroup: string; ageSeconds: number; stale: boolean;
}
export const isBillingProfile = (revision: PayloadRevision) => !revision.config.deviceType.includes('logger') && revision.config.fields.some(field => field.role === 'billing-import');
