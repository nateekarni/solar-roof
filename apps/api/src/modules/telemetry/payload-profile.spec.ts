import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DEFAULT_PAYLOAD_PROFILES, normalizePayloadEnvelope, validatePayloadProfile, logicalPayloadDigest } from "./payload-profile.js";

const examples = JSON.parse(readFileSync(new URL("./fixtures/payload-examples-v1.1.json", import.meta.url), "utf8")).payloads;
test("automatic conversion normalizes incoming power while retaining the source reading", () => {
  const payload = structuredClone(examples.pm2230Realtime);
  payload.data.values["power.active.total"] = 28.24;
  payload.data.units["power.active.total"] = "kW";
  const profile = validatePayloadProfile({ ...DEFAULT_PAYLOAD_PROFILES[0], fields: DEFAULT_PAYLOAD_PROFILES[0]!.fields.map(field => field.tag === "power.active.total" ? { ...field, sourceUnit: "kW", conversion: "auto-v1" } : field) });
  const result = normalizePayloadEnvelope(payload, { profile, siteId: "SITE-001", gatewayId: "GW-001", deviceId: "METER-001" }, "solar/v1/sites/SITE-001/gateways/GW-001/devices/METER-001/telemetry");
  const sample = result.samples.find(sample => sample.tag === "power.active.total")!;
  assert.equal(sample.value, 28240);
  assert.equal(sample.unit, "W");
  assert.equal(sample.rawValue, 28.24);
  assert.equal(sample.rawUnit, "kW");
});
function normalize(payload: any, topic?: string) {
  const profile = DEFAULT_PAYLOAD_PROFILES[payload.device.deviceId === "METER-001" ? 0 : 1]!;
  return normalizePayloadEnvelope(payload, { profile, siteId: "SITE-001", gatewayId: "GW-001", deviceId: payload.device.deviceId }, topic ?? `solar/v1/sites/SITE-001/gateways/GW-001/devices/${payload.device.deviceId}/telemetry`);
}
test("all four supplied groups retain every canonical field and source unit", () => {
  for (const name of ["pm2230Realtime", "pm2230Energy", "smartLoggerPlant", "smartLoggerEnvironment"]) {
    const payload = examples[name]; const result = normalize(payload);
    assert.equal(result.samples.length, Object.keys(payload.data.values).length);
    for (const sample of result.samples) {
      assert.equal(sample.rawValue, payload.data.values[sample.tag]);
      assert.equal(sample.rawUnit, payload.data.units[sample.tag]);
      assert.equal(sample.polledAt, payload.timestamps.polledAt);
      assert.equal(sample.measuredAt, undefined);
    }
  }
  assert.equal(normalize(examples.pm2230Energy).samples[0]?.value, 152430.275);
  assert.equal(normalize(examples.pm2230Energy).samples[0]?.unit, "kWh");
  assert.equal(normalize(examples.smartLoggerPlant).samples[2]?.value, 4250.6);
  assert.equal(normalize(examples.pm2230Energy).samples[2]?.unit, "kvarh");
});
test("unknown tags remain raw and never acquire a billing role", () => {
  const payload = structuredClone(examples.pm2230Energy);
  payload.data.values.future = 123; payload.data.units.future = "widgets";
  const result = normalize(payload);
  assert.deepEqual(result.unmapped, [{ tag: "future", rawValue: 123, rawUnit: "widgets" }]);
  assert.equal(result.samples.filter(s => s.role === "billing-import").length, 1);
});
test("invalid envelope boundaries and topic ownership are rejected", () => {
  for (const mutate of [
    (p: any) => p.schemaVersion = "1.0", (p: any) => p.messageType = "dataAcept",
    (p: any) => p.siteId = "OTHER", (p: any) => p.gatewayId = "OTHER",
    (p: any) => p.device.profileVersion = "2.0.0", (p: any) => p.device.profileId = "other",
    (p: any) => p.pollGroup = "plant", (p: any) => p.timestamps.polledAt = "2026-10-05T08:00:00",
    (p: any) => p.timestamps.sentAt = "2026-02-30T08:00:00Z",
    (p: any) => p.timestamps.measuredAt = "invalid", (p: any) => p.lotNumber = 0,
    (p: any) => p.lotNumber = 4294967296, (p: any) => p.lotNumber = 1.5,
    (p: any) => p.sequence = -1, (p: any) => p.data.values["energy.active.import.total"] = Infinity,
    (p: any) => p.data.units["energy.active.import.total"] = "kWh",
    (p: any) => p.messageId = "", (p: any) => p.quality = {},
    (p: any) => p.data.values = {},
  ]) { const p = structuredClone(examples.pm2230Energy); mutate(p); assert.throws(() => normalize(p)); }
  assert.throws(() => normalize(examples.pm2230Energy, "solar/v1/sites/OTHER/gateways/GW-001/devices/METER-001/telemetry"));
  assert.throws(() => normalize({ ...examples.pm2230Energy, padding: "x".repeat(262145) }));
});
test("digest ignores only sentAt and object ordering; logical changes conflict", () => {
  const p = structuredClone(examples.pm2230Energy); const digest = logicalPayloadDigest(p);
  p.timestamps.sentAt = "2026-10-05T10:00:00Z";
  assert.equal(logicalPayloadDigest(p), digest);
  assert.equal(logicalPayloadDigest(Object.fromEntries(Object.entries(p).reverse())), digest);
  for (const mutate of [(p: any) => p.quality.status = "bad", (p: any) => p.siteId = "OTHER", (p: any) => p.timestamps.polledAt = "2026-10-06T00:00:00Z", (p: any) => p.data.values["energy.active.import.total"]++]) {
    const changed = structuredClone(p); mutate(changed); assert.notEqual(logicalPayloadDigest(changed), digest);
  }
});
test("uint32 rollover and delayed messages normalize independently", () => {
  for (const lotNumber of [4294967295, 1]) assert.equal(normalize({ ...examples.pm2230Energy, lotNumber }).lotNumber, lotNumber);
  assert.equal(normalize(examples.pm2230Realtime).samples.some(s => s.role === "billing-import"), false);
  assert.equal(normalize(examples.smartLoggerEnvironment).profileId, "huawei-smartlogger3000a");
});
test("declarative profiles reject executable and inconsistent conversions", () => {
  assert.equal(validatePayloadProfile(DEFAULT_PAYLOAD_PROFILES[0]).version, "1.0.0");
  const p = structuredClone(DEFAULT_PAYLOAD_PROFILES[0]) as any;
  p.fields[0].conversion = "eval"; assert.throws(() => validatePayloadProfile(p));
  p.fields[0].conversion = "wh-to-kwh"; assert.throws(() => validatePayloadProfile(p));
});
test("profiles enforce group uniqueness, unit identity and cumulative-import billing", () => {
  for (const mutate of [
    (p: any) => p.fields.push(p.fields[0]),
    (p: any) => p.pollGroups.push(p.pollGroups[0]),
    (p: any) => p.fields[0].pollGroup = "missing",
    (p: any) => p.fields[0].targetUnit = "kWh",
    (p: any) => { p.fields[0].sourceUnit = "Wh"; p.fields[0].targetUnit = "kWh"; p.fields[0].conversion = "wh-to-kwh"; p.fields[0].role = "billing-import"; },
    (p: any) => p.script = "return 1",
  ]) { const p = structuredClone(DEFAULT_PAYLOAD_PROFILES[0]); mutate(p); assert.throws(() => validatePayloadProfile(p)); }
});
test("optional measured time is retained and poor quality remains distinct from source age", () => {
  const p = structuredClone(examples.pm2230Energy);
  p.timestamps.measuredAt = "2026-10-05T07:59:00+07:00";
  p.quality.status = "bad"; p.quality.communication = "offline";
  const result = normalize(p);
  assert.equal(result.samples[0]?.measuredAt, "2026-10-05T07:59:00+07:00");
  assert.equal(result.quality.status, "bad");
  assert.equal(result.samples[0]?.value, 152430.275);
});

test('active-power roles require W and one unambiguous mapping',()=>{
 const p=structuredClone(DEFAULT_PAYLOAD_PROFILES[0]!);
 p.fields[0]!.role='active-power';assert.throws(()=>validatePayloadProfile(p),/active-power|Active power/);
 const duplicate=structuredClone(DEFAULT_PAYLOAD_PROFILES[0]!);duplicate.fields.push({...duplicate.fields.find(f=>f.role==='active-power')!,tag:'another.power'});assert.throws(()=>validatePayloadProfile(duplicate),/active-power|Active power/);
});
