import { convertUnit, derivedConversion } from "@solar/api-contracts/unit-conversion";
import { createHash } from "node:crypto";
import { z } from "zod";

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const tag = z.string().min(1).max(128).regex(/^[A-Za-z0-9_.-]+$/);
const unit = z.string().min(1).max(32);
const fieldSchema = z.object({ tag, displayName: z.string().min(1).max(128), pollGroup: identifier, sourceUnit: unit, targetUnit: unit, conversion: z.enum(["identity", "wh-to-kwh", "varh-to-kvarh", "auto-v1"]), role: z.enum(["billing-import", "active-power"]).optional() }).strict();
const profileSchema = z.object({ id: identifier, version: z.string().regex(/^\d+\.\d+\.\d+$/), schemaVersion: z.literal("1.1"), displayName: z.string().min(1).max(128), deviceType: identifier, pollGroups: z.array(identifier).min(1).max(16), fields: z.array(fieldSchema).min(1).max(256) }).strict();
export type PayloadProfile = z.infer<typeof profileSchema>;
export type PayloadProfileField = z.infer<typeof fieldSchema>;
export function validatePayloadProfile(input: unknown): PayloadProfile {
  const p = profileSchema.parse(input);
  if (new Set(p.pollGroups).size !== p.pollGroups.length || new Set(p.fields.map(f => f.tag)).size !== p.fields.length) throw new Error("Duplicate group or tag");
  for (const f of p.fields) {
    if (!p.pollGroups.includes(f.pollGroup)) throw new Error("Field group is unsupported");
    if (!(f.conversion === "auto-v1" && derivedConversion(f.sourceUnit,f.targetUnit) !== "identity" || f.conversion === "identity" && f.sourceUnit === f.targetUnit || f.conversion === "wh-to-kwh" && f.sourceUnit === "Wh" && f.targetUnit === "kWh" || f.conversion === "varh-to-kvarh" && f.sourceUnit === "varh" && f.targetUnit === "kvarh")) throw new Error("Invalid unit conversion");
    if (f.role === "active-power" && f.targetUnit !== "W") throw new Error("Active power role requires W");
    if (f.role === "billing-import" && (f.tag !== "energy.active.import.total" || f.targetUnit !== "kWh")) throw new Error("Billing requires active import cumulative kWh");
  }
  if (p.fields.filter(f => f.role === "active-power").length > 1) throw new Error("Multiple active-power fields");
  if (p.fields.filter(f => f.role === "billing-import").length > 1) throw new Error("Multiple billing fields");
  return p;
}
function field(name: string, sourceUnit: string, pollGroup: string, role?: PayloadProfileField["role"]): PayloadProfileField {
  const conversion = sourceUnit === "Wh" ? "wh-to-kwh" : sourceUnit === "varh" ? "varh-to-kvarh" : "identity";
  return { tag: name, displayName: name, pollGroup, sourceUnit, targetUnit: conversion === "wh-to-kwh" ? "kWh" : conversion === "varh-to-kvarh" ? "kvarh" : sourceUnit, conversion, ...(role ? { role } : {}) };
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
export const DEFAULT_PAYLOAD_PROFILES: readonly PayloadProfile[] = freeze([
  validatePayloadProfile({ id: "schneider-pm2230", version: "1.0.0", schemaVersion: "1.1", displayName: "Schneider PM2230", deviceType: "energy-meter", pollGroups: ["realtime", "energy"], fields: [
    ...["l1_n", "l2_n", "l3_n", "l1_l2", "l2_l3", "l3_l1"].map(n => field(`electrical.voltage.${n}`, "V", "realtime")),
    ...["l1", "l2", "l3"].map(n => field(`electrical.current.${n}`, "A", "realtime")),
    field("electrical.frequency", "Hz", "realtime"), field("power.active.total", "W", "realtime", "active-power"), field("power.reactive.total", "var", "realtime"), field("power.apparent.total", "VA", "realtime"), field("power.factor.total", "1", "realtime"),
    field("energy.active.import.total", "Wh", "energy", "billing-import"), field("energy.active.export.total", "Wh", "energy"), field("energy.reactive.import.total", "varh", "energy"), field("energy.reactive.export.total", "varh", "energy"),
  ] }),
  validatePayloadProfile({ id: "huawei-smartlogger3000a", version: "1.0.0", schemaVersion: "1.1", displayName: "Huawei SmartLogger3000A", deviceType: "solar-logger", pollGroups: ["plant", "environment"], fields: [
    field("solar.active_power", "W", "plant", "active-power"), field("solar.reactive_power", "var", "plant"), field("solar.daily_yield", "Wh", "plant"), field("solar.total_yield", "Wh", "plant"), field("environment.irradiance", "W/m2", "environment"), field("environment.ambient_temperature", "degC", "environment"), field("environment.module_temperature", "degC", "environment"), field("environment.wind_speed", "m/s", "environment"),
  ] }),
]);
const timestamp = z.iso.datetime({ offset: true });
const envelopeSchema = z.object({
  schemaVersion: z.literal("1.1"), messageType: z.literal("telemetry"), messageId: z.string().min(1).max(256), sequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), lotNumber: z.number().int().min(1).max(4294967295), siteId: identifier, gatewayId: identifier,
  device: z.object({ deviceId: identifier, deviceType: identifier, profileId: identifier.optional(), profileVersion: z.string().min(1).max(64).optional() }).passthrough(), pollGroup: identifier,
  timestamps: z.object({ polledAt: timestamp, sentAt: timestamp, measuredAt: timestamp.optional() }).passthrough(),
  data: z.object({ values: z.record(tag, z.number().finite()), units: z.record(tag, unit) }).passthrough(),
  quality: z.object({ status: z.string().min(1).max(64), communication: z.string().min(1).max(64), pollDurationMs: z.number().finite().nonnegative().optional(), queueDelayMs: z.number().finite().nonnegative().optional() }).passthrough(),
}).passthrough();
export type PayloadEnvelope = z.infer<typeof envelopeSchema>;
export interface PayloadBinding { profile: PayloadProfile; siteId: string; gatewayId: string; deviceId: string }
export interface RawPayloadField { tag: string; rawValue: number; rawUnit: string }
export interface CanonicalPayloadSample extends RawPayloadField { value: number; unit: string; displayName: string; pollGroup: string; polledAt: string; measuredAt?: string; role?: PayloadProfileField["role"] }
export interface NormalizedPayloadEnvelope {
  raw: PayloadEnvelope; siteId: string; gatewayId: string; deviceId: string; messageId: string; sequence: number; lotNumber: number; pollGroup: string; profileId: string; profileVersion: string;
  polledAt: string; sentAt: string; measuredAt?: string; quality: PayloadEnvelope["quality"]; samples: CanonicalPayloadSample[]; unmapped: RawPayloadField[]; digest: string;
}
/** Throws for invalid input. No state is retained; callers own freshness and persistence. */
export function normalizePayloadEnvelope(input: unknown, binding: PayloadBinding, topic: string): NormalizedPayloadEnvelope {
  const serialized = JSON.stringify(input);
  if (!serialized || Buffer.byteLength(serialized, "utf8") > 262144) throw new Error("Payload exceeds 256 KiB");
  const raw = envelopeSchema.parse(JSON.parse(serialized));
  const profile = validatePayloadProfile(binding.profile);
  for (const id of [binding.siteId, binding.gatewayId, binding.deviceId]) identifier.parse(id);
  if (raw.siteId !== binding.siteId || raw.gatewayId !== binding.gatewayId || raw.device.deviceId !== binding.deviceId || topic !== `solar/v1/sites/${binding.siteId}/gateways/${binding.gatewayId}/devices/${binding.deviceId}/telemetry`) throw new Error("Topic/envelope identity does not match registered binding");
  if (raw.device.deviceType !== profile.deviceType || raw.device.profileId !== undefined && raw.device.profileId !== profile.id || raw.device.profileVersion !== undefined && raw.device.profileVersion !== profile.version) throw new Error("Profile reference does not match assigned revision");
  if (!profile.pollGroups.includes(raw.pollGroup)) throw new Error("Unsupported poll group");
  const entries = Object.entries(raw.data.values);
  if (!entries.length || entries.length > 256 || Object.keys(raw.data.units).length !== entries.length) throw new Error("Expected 1..256 value/unit pairs");
  const samples: CanonicalPayloadSample[] = []; const unmapped: RawPayloadField[] = [];
  for (const [name, value] of entries) {
    const rawUnit = raw.data.units[name]; if (!rawUnit) throw new Error(`Missing unit for ${name}`);
    const source = { tag: name, rawValue: value, rawUnit };
    const mapping = profile.fields.find(f => f.tag === name);
    if (!mapping) { unmapped.push(source); continue; }
    if (mapping.pollGroup !== raw.pollGroup || mapping.sourceUnit !== rawUnit) throw new Error(`Invalid group/unit for ${name}`);
    const canonical = mapping.conversion === "auto-v1" ? convertUnit(value,mapping.sourceUnit,mapping.targetUnit) : mapping.conversion === "identity" ? value : value / 1000;
    if (!Number.isFinite(canonical)) throw new Error("Nonfinite canonical value");
    samples.push({ ...source, value: canonical, unit: mapping.targetUnit, displayName: mapping.displayName, pollGroup: raw.pollGroup, polledAt: raw.timestamps.polledAt, ...(raw.timestamps.measuredAt ? { measuredAt: raw.timestamps.measuredAt } : {}), ...(mapping.role ? { role: mapping.role } : {}) });
  }
  return { raw, siteId: raw.siteId, gatewayId: raw.gatewayId, deviceId: raw.device.deviceId, messageId: raw.messageId, sequence: raw.sequence, lotNumber: raw.lotNumber, pollGroup: raw.pollGroup, profileId: profile.id, profileVersion: profile.version, polledAt: raw.timestamps.polledAt, sentAt: raw.timestamps.sentAt, ...(raw.timestamps.measuredAt ? { measuredAt: raw.timestamps.measuredAt } : {}), quality: raw.quality, samples, unmapped, digest: logicalPayloadDigest(raw) };
}
/** Hash the full logical payload with recursively sorted keys; only timestamps.sentAt is omitted. */
export function logicalPayloadDigest(input: unknown): string {
  const clone = JSON.parse(JSON.stringify(input));
  if (clone?.timestamps && typeof clone.timestamps === "object") delete clone.timestamps.sentAt;
  function stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
    return value;
  }
  return createHash("sha256").update(JSON.stringify(stable(clone))).digest("hex");
}
