import { z } from 'zod';

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const path = z.string().min(1).max(160).refine(value => value.split('.').every(part => /^[A-Za-z0-9_-]+$/.test(part) && !['__proto__', 'prototype', 'constructor'].includes(part)), 'Use a safe dot-separated JSON path');
const fields = ['schemaVersion', 'messageType', 'messageId', 'sequence', 'lotNumber', 'siteId', 'gatewayId', 'device', 'pollGroup', 'timestamps', 'data', 'quality', 'device.deviceId', 'device.deviceType', 'device.profileId', 'device.profileVersion', 'timestamps.polledAt', 'timestamps.sentAt', 'data.values', 'data.units', 'quality.status', 'quality.communication'] as const;
const schema = z.object({
  messagesPath: path.default('payloads'),
  fieldPaths: z.partialRecord(z.enum(fields), path).default({}),
  siteAlias: identifier.optional(), gatewayAlias: identifier.optional(),
  deviceAliases: z.array(z.object({
    source: identifier, target: identifier,
    profileAlias: z.object({ sourceId: identifier, sourceVersion: z.string().regex(/^\d+\.\d+\.\d+$/), targetId: identifier, targetVersion: z.string().regex(/^\d+\.\d+\.\d+$/) }).strict().optional(),
  }).strict()).max(32).default([]),
}).strict();
export type PayloadReceiveConfig = z.infer<typeof schema>;
export function validateReceiveConfig(input: unknown): PayloadReceiveConfig {
  const config = schema.parse(input);
  if (new Set(config.deviceAliases.map(alias => alias.source)).size !== config.deviceAliases.length) throw new Error('Duplicate source device alias');
  if (new Set(config.deviceAliases.map(alias => alias.target)).size !== config.deviceAliases.length) throw new Error('Two source devices cannot map to the same registered device');
  return config;
}
function object(input: unknown): input is Record<string, unknown> { return input !== null && typeof input === 'object' && !Array.isArray(input); }
function at(input: unknown, value: string): unknown {
  return value.split('.').reduce<unknown>((current, part) => object(current) && Object.hasOwn(current, part) ? current[part] : undefined, input);
}
export interface DecodedPayloadMessage { key: string; envelope: Record<string, unknown>; original: Record<string, unknown> }
export interface PayloadDecodeResult { batch: boolean; messages: DecodedPayloadMessage[]; errors: { key: string; reason: string }[]; ignored: number }
/** The transport owns broker/gateway scope. This decoder never invents identifiers, timestamps or profiles. */
export function decodePayloadMessages(input: unknown, config: PayloadReceiveConfig, scope?: { siteId: string; gatewayId: string }): PayloadDecodeResult {
  const list = at(input, config.messagesPath);
  const batch = list !== undefined;
  if (batch && !Array.isArray(list) && !object(list)) throw new Error('Message collection must be an array or object');
  const entries: [string, unknown][] = batch ? Object.entries(list as Record<string, unknown>) : [['message', input]];
  if (!entries.length || entries.length > 32) throw new Error('Expected 1..32 messages');
  const result: PayloadDecodeResult = { batch, messages: [], errors: [], ignored: 0 };
  for (const [key, entry] of entries) {
    if (!object(entry)) { result.errors.push({ key, reason: 'Message must be a JSON object' }); continue; }
    const envelope = structuredClone(entry);
    for (const [field, sourcePath] of Object.entries(config.fieldPaths)) {
      const parts=field.split('.');
      const mapped=structuredClone(at(entry,sourcePath));
      if(parts.length===1)envelope[field]=mapped;
      else {const root=parts[0]!,child=parts[1]!;if(!object(envelope[root]))envelope[root]={};(envelope[root] as Record<string,unknown>)[child]=mapped;}
    }
    // ACK examples in the gateway document are metadata, never telemetry to be inserted.
    if (envelope.messageType === 'dataAcept') { result.ignored++; continue; }
    if (envelope.messageType !== 'telemetry') { result.errors.push({ key, reason: 'Expected messageType telemetry' }); continue; }
    if (scope) {
      if (config.siteAlias && envelope.siteId === config.siteAlias) envelope.siteId = scope.siteId;
      if (config.gatewayAlias && envelope.gatewayId === config.gatewayAlias) envelope.gatewayId = scope.gatewayId;
    }
    if (object(envelope.device)) {
      const device = envelope.device;
      const alias = config.deviceAliases.find(candidate => candidate.source === device.deviceId);
      if (alias) {
        envelope.device.deviceId = alias.target;
        if (alias.profileAlias && envelope.device.profileId === alias.profileAlias.sourceId && envelope.device.profileVersion === alias.profileAlias.sourceVersion) {
          envelope.device.profileId = alias.profileAlias.targetId;
          envelope.device.profileVersion = alias.profileAlias.targetVersion;
        }
      }
    }
    result.messages.push({ key, envelope, original: structuredClone(entry) });
  }
  return result;
}
