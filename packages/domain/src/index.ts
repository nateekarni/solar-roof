export { envSchema, loadEnv, workerEnvSchema, loadWorkerEnv } from "./config/env.js";
export type { AppEnv, WorkerEnv } from "./config/env.js";
export { buildDependencyHealth } from "./health/dependency-health.js";
export type { DependencyHealth, DependencyStatus, ServiceHealth } from "./health/dependency-health.js";


export { AppendOnlyAuditService } from "./audit/audit-event.js";
export type { AuditEvent, AuditEventStore, AuditInput, AuditValue } from "./audit/audit-event.js";

export { canAccess } from "./access/access-policy.js";
export type { AccessAction, AccessActor, AccessResource, PlatformRole } from "./access/access-policy.js";

export { evaluateQuality, normalizeValue } from "./telemetry/quality.js";
export { calculateCumulativeDiff } from "./telemetry/cumulative-energy.js";
export type { QualityResult, QualityRule, QualityStatus } from "./telemetry/quality.js";
export type { EnergyDiffResult } from "./telemetry/cumulative-energy.js";
export {
  decodeModbusValue,
  decodeRegisterBatch,
  parseRegisterIndex,
} from "./telemetry/register-decoder.js";
export type {
  WordOrder,
  ModbusDataType,
  RegisterFieldMapping,
  DecodedFieldResult,
} from "./telemetry/register-decoder.js";

export { aggregate, bucketStart } from "./telemetry/aggregation.js";
export type { AggregateBucket, AggregatePoint } from "./telemetry/aggregation.js";
export { gatewayStatus, evaluateAlarm } from "./alarm/alarm-policy.js";
export type { AlarmInput, AlarmSeverity, GatewayStatus } from "./alarm/alarm-policy.js";

export { calculateCumulativeDiff as calculateBillingCumulativeDiff } from './billing/cumulative-diff.js';
export type { BillingQuality, MeterSnapshot, CumulativeDiffResult } from './billing/cumulative-diff.js';
export { calculateRate } from './billing/rate-calculator.js';
export type { FixedRateVersion, Money } from './billing/rate-calculator.js';
export { canTransition, assertTransition } from './billing/billing-lifecycle.js';
export type { BillingStatus } from './billing/billing-lifecycle.js';

export { deriveIncrement } from './energy-increments.js';
export {retentionDecision,validateArchiveWindow,restoreLimits,validateRestoreWindow} from './history-policy.js';
export type {RetentionProof,RestoreLimits} from './history-policy.js';
