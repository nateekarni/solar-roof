import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterAlertRules,
  formatConditionLabel,
  formatDurationCooldown,
  getRuleSiteIds,
  operatorSymbol,
  semanticFieldLabel,
  summarizeAlertRules,
  type AlertRule,
  type AlertSite,
} from './alert-rules-model';

const mockSites: AlertSite[] = [
  { id: 'site-1', name: 'Bangkok Factory 1', code: 'BK-01' },
  { id: 'site-2', name: 'Chiang Mai Plant', code: 'CM-02' },
  { id: 'site-3', name: 'Rayong Hub', code: 'RY-03' },
];

const mockRules: AlertRule[] = [
  {
    id: 'rule-1',
    site_id: 'site-1',
    kind: 'offline',
    duration_seconds: 120,
    cooldown_seconds: 300,
    recipient_user_ids: ['u1', 'u2'],
    channels: ['in_app', 'email'],
    enabled: true,
  },
  {
    id: 'rule-2',
    site_id: 'site-1',
    kind: 'threshold',
    semantic_field: 'active_power',
    operator: 'gt',
    threshold: 50000,
    duration_seconds: 60,
    cooldown_seconds: 180,
    recipient_user_ids: ['u1'],
    channels: ['in_app'],
    enabled: false,
  },
  {
    id: 'rule-3',
    site_id: 'site-2',
    site_ids: ['site-2', 'site-3'],
    kind: 'stale',
    duration_seconds: 300,
    cooldown_seconds: 600,
    recipient_user_ids: ['u3'],
    channels: ['email'],
    enabled: true,
  },
];

test('formatConditionLabel formats offline, stale, and threshold conditions properly', () => {
  assert.equal(formatConditionLabel({ kind: 'offline' }, 'th'), 'เกตเวย์ออฟไลน์');
  assert.equal(formatConditionLabel({ kind: 'offline' }, 'en'), 'Gateway offline');

  assert.equal(formatConditionLabel({ kind: 'stale' }, 'th'), 'ข้อมูลเก่า');
  assert.equal(formatConditionLabel({ kind: 'stale' }, 'en'), 'Stale telemetry');

  const thresholdRule = {
    kind: 'threshold' as const,
    semantic_field: 'active_power',
    operator: 'gt',
    threshold: 50000,
  };
  assert.equal(formatConditionLabel(thresholdRule, 'th'), 'กำลังไฟ > 50000 W');
  assert.equal(formatConditionLabel(thresholdRule, 'en'), 'Active power > 50000 W');

  const voltageRule = {
    kind: 'threshold' as const,
    semantic_field: 'voltage',
    operator: 'lt',
    threshold: 210,
  };
  assert.equal(formatConditionLabel(voltageRule, 'th'), 'แรงดัน < 210 V');

  const decimalTrailingZerosRule = {
    kind: 'threshold' as const,
    semantic_field: 'temperature',
    operator: 'gt',
    threshold: '65.00000000' as unknown as number,
  };
  assert.equal(formatConditionLabel(decimalTrailingZerosRule, 'th'), 'อุณหภูมิ > 65 °C');
  assert.equal(formatConditionLabel(decimalTrailingZerosRule, 'en'), 'Temperature > 65 °C');

  const highPrecisionRule = {
    kind: 'threshold' as const,
    semantic_field: 'temperature',
    operator: 'gt',
    threshold: '65.1234' as unknown as number,
  };
  assert.equal(formatConditionLabel(highPrecisionRule, 'th'), 'อุณหภูมิ > 65.1234 °C');
});

test('operatorSymbol maps comparison operators to symbols', () => {
  assert.equal(operatorSymbol('gt'), '>');
  assert.equal(operatorSymbol('gte'), '≥');
  assert.equal(operatorSymbol('lt'), '<');
  assert.equal(operatorSymbol('lte'), '≤');
  assert.equal(operatorSymbol(null), '');
});

test('formatDurationCooldown formats duration and cooldown properly', () => {
  assert.equal(formatDurationCooldown(120, 300, 'th'), 'ต่อเนื่อง 120 วินาที / พัก 300 วินาที');
  assert.equal(formatDurationCooldown(120, 300, 'en'), 'Duration 120s / Cooldown 300s');
});

test('getRuleSiteIds normalizes single site_id and deduplicates multi-site site_ids', () => {
  assert.deepEqual(getRuleSiteIds({ site_id: 'site-1' }), ['site-1']);
  assert.deepEqual(getRuleSiteIds({ site_id: 'site-1', site_ids: ['site-1', 'site-2', 'site-1'] }), ['site-1', 'site-2']);
});

test('summarizeAlertRules computes total, active, and unique site coverage across multi-site rules', () => {
  const summary = summarizeAlertRules(mockRules);
  assert.equal(summary.total, 3);
  assert.equal(summary.active, 2);
  assert.equal(summary.sitesCount, 3);
});

test('filterAlertRules filters by siteId across multi-site rules', () => {
  const filteredSite2 = filterAlertRules(mockRules, mockSites, '', 'site-2', 'all', 'all');
  assert.equal(filteredSite2.length, 1);
  assert.equal(filteredSite2[0]?.id, 'rule-3');

  const filteredSite3 = filterAlertRules(mockRules, mockSites, '', 'site-3', 'all', 'all');
  assert.equal(filteredSite3.length, 1);
  assert.equal(filteredSite3[0]?.id, 'rule-3');
});

test('filterAlertRules filters by kind', () => {
  const thresholdOnly = filterAlertRules(mockRules, mockSites, '', 'all', 'threshold', 'all');
  assert.equal(thresholdOnly.length, 1);
  assert.equal(thresholdOnly[0]?.id, 'rule-2');
});

test('filterAlertRules filters by status', () => {
  const enabledOnly = filterAlertRules(mockRules, mockSites, '', 'all', 'all', 'enabled');
  assert.equal(enabledOnly.length, 2);

  const disabledOnly = filterAlertRules(mockRules, mockSites, '', 'all', 'all', 'disabled');
  assert.equal(disabledOnly.length, 1);
  assert.equal(disabledOnly[0]?.id, 'rule-2');
});

test('filterAlertRules searches by site code, site name, and condition keywords including secondary sites', () => {
  const searchCode = filterAlertRules(mockRules, mockSites, 'BK-01', 'all', 'all', 'all');
  assert.equal(searchCode.length, 2);

  const searchSecondarySite = filterAlertRules(mockRules, mockSites, 'Rayong', 'all', 'all', 'all');
  assert.equal(searchSecondarySite.length, 1);
  assert.equal(searchSecondarySite[0]?.id, 'rule-3');

  const searchCondition = filterAlertRules(mockRules, mockSites, 'กำลังไฟ', 'all', 'all', 'all');
  assert.equal(searchCondition.length, 1);
  assert.equal(searchCondition[0]?.id, 'rule-2');

  const searchStale = filterAlertRules(mockRules, mockSites, 'ข้อมูลเก่า', 'all', 'all', 'all');
  assert.equal(searchStale.length, 1);
  assert.equal(searchStale[0]?.id, 'rule-3');
});

