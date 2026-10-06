# Task 1: payload profiles and normalization

Implemented only the pure telemetry profile module, fixture copy and unit tests. No database, consumer or controller changes; no staging/commit. Existing uncommitted files preserved.

## Sources

Read `C:/Users/natee/Downloads/MQTT_Payload_Examples_v1.1.json` and `C:/Users/natee/Downloads/เอกสารมาตรฐาน MQTT Payload-V.3-PM2230.docx`. Extracted DOCX `word/document.xml` through Python zip/XML using bundled Python with `-X utf8`. Fixtures copy the JSON source unchanged. DOCX confirms uint32 lot range/rollover, sentAt resend semantics, optional measuredAt, four groups and canonical units. No register addresses were introduced.

## Exported API

Source: `apps/api/src/modules/telemetry/payload-profile.ts`.

```ts
validatePayloadProfile(input: unknown): PayloadProfile
normalizePayloadEnvelope(input: unknown, binding: PayloadBinding, topic: string): NormalizedPayloadEnvelope
logicalPayloadDigest(input: unknown): string
DEFAULT_PAYLOAD_PROFILES: readonly PayloadProfile[]

type PayloadProfile = {
  id: string; version: string; schemaVersion: "1.1";
  displayName: string; deviceType: string;
  pollGroups: string[]; fields: PayloadProfileField[];
};
type PayloadProfileField = {
  tag: string; displayName: string; pollGroup: string;
  sourceUnit: string; targetUnit: string;
  conversion: "identity" | "wh-to-kwh" | "varh-to-kvarh";
  role?: "billing-import" | "active-power";
};
interface PayloadBinding {
  profile: PayloadProfile; siteId: string; gatewayId: string; deviceId: string;
}
interface RawPayloadField { tag: string; rawValue: number; rawUnit: string }
interface CanonicalPayloadSample extends RawPayloadField {
  value: number; unit: string; displayName: string;
  pollGroup: string; polledAt: string; measuredAt?: string;
  role?: "billing-import" | "active-power";
}
interface NormalizedPayloadEnvelope {
  raw: PayloadEnvelope;
  siteId: string; gatewayId: string; deviceId: string;
  messageId: string; sequence: number; lotNumber: number; pollGroup: string;
  profileId: string; profileVersion: string;
  polledAt: string; sentAt: string; measuredAt?: string;
  quality: PayloadEnvelope["quality"];
  samples: CanonicalPayloadSample[]; unmapped: RawPayloadField[]; digest: string;
}
```

`PayloadEnvelope` is also exported, inferred from the validated schema: exact 1.1 telemetry envelope with required messageId/sequence/lotNumber/siteId/gatewayId/device.deviceId/device.deviceType/pollGroup/timestamps.polledAt/timestamps.sentAt/data.values/data.units/quality.status/quality.communication; optional timestamps.measuredAt, device.profileId/profileVersion, quality.pollDurationMs/queueDelayMs; metadata remains permitted/preserved.

The default objects are serializable, recursively frozen configs: `schneider-pm2230` and `huawei-smartlogger3000a` 1.0.0. Copy a default before revision editing, validate, then persist it as immutable revision JSON. Profile configs and field configs reject unrecognized properties/executable expressions. Duplicate groups/tags, missing configured groups and inconsistent conversion units reject.

## Integration behavior

All validation APIs throw on invalid inputs (Zod errors or descriptive Errors); ingestion should record a rejection and send no accepted ACK. Normalization validates the registered binding and exact telemetry topic. Missing profile references resolve to binding.profile; supplied references must match the assigned revision. Device type must match. Identifiers support ASCII letters/digits/underscore/hyphen up to 128 characters.

Bounds: 256 KiB JSON, 1..256 finite numeric value/unit pairs, profile 1..256 fields/1..16 groups, safe nonnegative integer sequence and lot 1..4294967295. Timestamp parser requires ISO calendar-valid timezone-bearing times. Source timestamp strings/values/units survive in raw and samples. Wh/varh convert by division by 1000 to kWh/kvarh. Missing fields never become zero. Unknown numeric tags remain unmapped raw values/units and carry no roles.

Billing role is restricted to `energy.active.import.total` with kWh output, at most once per profile. No environment/export/reactive/daily-yield substitution. Normalization deliberately preserves poor quality measurements/quality; ingestion must exclude them from billing and legacy total_energy_kwh projection. No freshness state exists here: downstream stores late samples and keeps latest independently per field/group using polledAt. Realtime does not contain an energy field to clear.

Digest SHA-256 recursively sorts object keys and excludes only `timestamps.sentAt`. Quality (including queueDelayMs), values, identities, profile references, sequence, lot and other metadata all remain logical content; changes conflict. Call digest on validated JSON-compatible envelopes (normalizer already does). A resend changing quality.queueDelayMs as well as sentAt is a conflict under the specified strict policy.

## TDD and verification

Before production implementation, tests failed for missing module, then with explicit temporary unimplemented API skeleton: 6 tests, 1 pass (rejection cases), 5 failures including missing normalization and empty digest assertions. Implemented the module from these fixture and digest cases. Additional characterization tests exercise configuration restrictions and measuredAt/quality preservation.

Focused command (outside Windows sandbox, which caused uv_os_get_passwd ENOMEM):

```powershell
& 'C:\Program Files\nodejs\node.exe' --import tsx --test apps/api/src/modules/telemetry/payload-profile.spec.ts
```

Final output: tests 8; suites 0; pass 8; fail 0; cancelled 0; skipped 0; todo 0; duration_ms 384.6826. Exit 0.

Type check:

```powershell
& 'C:\Program Files\nodejs\node.exe' node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json
```

Exit 0, no diagnostics. Initial typecheck found exactOptionalPropertyTypes mismatch on optional measuredAt; corrected by constructing optional timestamps explicitly.

Requested npm/pnpm wrapper initially failed fetching pnpm registry under sandbox (EACCES); no pending process remains. Existing local Node/tsx/TypeScript dependencies provided successful verification. Database/ACK/freshness persistence tests belong to Task 2.
