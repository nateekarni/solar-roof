import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { GatewayControlKind, GatewayControlPayloads } from '@solar/api-contracts';

const gatewayId = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const text = z.string().min(1).max(128);
const messageId = z.string().min(1).max(256);
const timestamp = z.iso.datetime({ offset: true });
const version = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const controlKinds = ['register', 'config', 'configUpdate', 'configStatus', 'status'] as const;
const kindSchema = z.enum(controlKinds);
const connection = z.record(z.string().max(128), z.json());
const mapping = z.object({
  tag: text, sourceTag: text.optional(), required: z.boolean().optional(), registerAddress: text.optional(),
  displayName: text, pollGroup: text, sourceUnit: text, targetUnit: text,
  conversion: z.enum(['identity', 'wh-to-kwh', 'varh-to-kvarh', 'auto-v1']),
  role: z.enum(['billing-import', 'active-power', 'none']).optional(),
  registerCount: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  dataType: z.enum(['uint16', 'int16', 'uint32', 'int32', 'float32']).optional(),
  byteOrder: z.enum(['big_endian', 'little_endian']).optional(),
  wordOrder: z.enum(['little_word_first', 'big_word_first', 'cdab', 'abcd']).optional(),
  scale: z.number().finite().optional(), offset: z.number().finite().optional(),
}).strict();

function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`);
}
function registerIdentity(address: string): string {
  const value = address.trim();
  if (/^r\d+$/i.test(value)) return BigInt(value.slice(1)).toString();
  if (/^(?:\d+|0x[\da-f]+)$/i.test(value)) return BigInt(value).toString();
  return value;
}
const deviceShape = {
  deviceId: gatewayId, deviceType: text.optional(), manufacturer: text.optional(), model: text.optional(),
  firmwareVersion: text.optional(), serialNumber: text.optional(), profileId: text.optional(), profileVersion: text.optional(),
  protocol: text.optional(), connection: connection.optional(),
  pollGroups: z.array(text).max(16).optional(), mappings: z.array(mapping).max(256).optional(),
};
function validateDevices(devices: z.infer<typeof reportedDevice>[]) {
  unique(devices.map(d => d.deviceId), 'device ID');
  for (const device of devices) {
    unique(device.pollGroups ?? [], 'poll group');
    unique((device.mappings ?? []).map(m => m.tag), 'tag');
    // An address identifies a physical register within this device, independent of decoding.
    unique((device.mappings ?? []).flatMap(m => m.registerAddress === undefined ? [] : [registerIdentity(m.registerAddress)]), 'register identity');
  }
}
const reportedDevice = z.object(deviceShape).strict();
const configuredDevice = z.object({
  ...deviceShape, enabled: z.boolean(), mappingSource: z.enum(['preset', 'manual', 'gateway']),
  presetId: text.optional(), presetVersion: text.optional(),
  pollGroups: z.array(text).max(16), mappings: z.array(mapping).max(256),
}).strict();
const envelope = { schemaVersion: z.literal('1.1'), messageId };
const schemas = {
  register: z.object({
    ...envelope, messageType: z.literal('register'), sentAt: timestamp,
    gateway: z.object({ gatewayId, model: text, firmwareVersion: text }).strict(),
    reportedSiteId: text.optional(), devices: z.array(reportedDevice).max(32),
  }).strict(),
  config: z.object({
    ...envelope, messageType: z.literal('config'), gatewayId, siteId: text,
    configVersion: version, configHash: hash, issuedAt: timestamp, approvedBy: text,
    devices: z.array(configuredDevice).max(32),
  }).strict(),
  configUpdate: z.object({
    ...envelope, messageType: z.literal('configUpdate'), gatewayId, siteId: text,
    proposalId: messageId, baseConfigVersion: version, sentAt: timestamp,
    devices: z.array(configuredDevice).max(32),
  }).strict(),
  configStatus: z.object({
    ...envelope, messageType: z.literal('configStatus'), gatewayId, configVersion: version,
    configHash: hash, status: z.enum(['received', 'applied', 'failed']), reportedAt: timestamp,
    error: z.object({ code: text, message: z.string().min(1).max(1024).optional(), deviceId: gatewayId.optional(), tag: text.optional() }).strict().optional(),
  }).strict(),
  status: z.object({
    ...envelope, messageType: z.literal('status'), gatewayId, sessionId: messageId,
    firmwareVersion: text, status: z.enum(['online', 'offline']),
    appliedConfigVersion: version.nullable(), appliedConfigHash: hash.nullable(), reportedAt: timestamp.optional(),
  }).strict(),
};

export function gatewayControlTopic(id: string, kind: GatewayControlKind): string {
  return `solar/v1/gateways/${gatewayId.parse(id)}/${kindSchema.parse(kind)}`;
}
export function parseGatewayControlTopic(topic: string): { gatewayId: string; kind: GatewayControlKind } | null {
  const parts = /^solar\/v1\/gateways\/([^/]+)\/([^/]+)$/.exec(topic);
  if (!parts) return null;
  const id = gatewayId.safeParse(parts[1]);
  const kind = kindSchema.safeParse(parts[2]);
  return id.success && kind.success ? { gatewayId: id.data, kind: kind.data } : null;
}

/** Input is a decoded JSON payload; handlers bind topic and authenticated identity separately. */
export function parseGatewayControlPayload<K extends GatewayControlKind>(kind: K, input: unknown): GatewayControlPayloads[K] {
  kindSchema.parse(kind);
  const serialized = JSON.stringify(input);
  if (!serialized || Buffer.byteLength(serialized, 'utf8') > 262144) throw new Error('Payload exceeds 256 KiB');
  const parsed = schemas[kind].parse(input);
  if ('devices' in parsed) validateDevices(parsed.devices);
  if (parsed.messageType === 'configStatus' && parsed.status === 'failed' && !parsed.error) throw new Error('Failed configStatus requires an error code');
  return parsed as GatewayControlPayloads[K];
}

/** SHA-256 of canonical UTF-8 JSON; configHash is omitted at every object depth. */
export function gatewayConfigHash(input: unknown): string {
  // Normalize through JSON so omission, sparse/null arrays, nonfinite numbers,
  // toJSON, and invalid bigint/cycles retain native JSON semantics.
  const serialized = JSON.stringify(input, (key, value: unknown) => key === 'configHash' ? undefined : value);
  if (serialized === undefined) throw new TypeError('Configuration must have a JSON representation');
  function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value !== null && typeof value === 'object') {
      // Emit pairs directly: ordinary objects would reorder integer-like keys.
      return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }
  return createHash('sha256').update(canonical(JSON.parse(serialized)), 'utf8').digest('hex');
}
