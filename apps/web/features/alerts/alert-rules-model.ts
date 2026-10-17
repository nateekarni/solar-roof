export type AlertRule = {
  id: string;
  site_id: string;
  site_ids?: string[];
  kind: 'offline' | 'stale' | 'threshold' | string;
  semantic_field?: string | null;
  operator?: 'gt' | 'gte' | 'lt' | 'lte' | string | null;
  threshold?: number | null;
  duration_seconds: number;
  cooldown_seconds: number;
  recovery?: boolean;
  recipient_user_ids: string[];
  channels: string[];
  enabled: boolean;
  created_at?: string;
  created_by?: string;
};

export function getRuleSiteIds(rule?: Pick<AlertRule, 'site_id' | 'site_ids'> | null): string[] {
  if (!rule) return [];
  if (Array.isArray(rule.site_ids) && rule.site_ids.length > 0) {
    return Array.from(new Set(rule.site_ids.filter(Boolean)));
  }
  return rule.site_id ? [rule.site_id] : [];
}

export type AlertSite = {
  id: string;
  name: string;
  code: string;
};

export type AlertRecipient = {
  id: string;
  name: string;
  email: string;
};

export const FIELD_LABELS: Record<string, { th: string; en: string; unit: string }> = {
  active_power: { th: 'กำลังไฟ', en: 'Active power', unit: 'W' },
  total_energy: { th: 'พลังงาน', en: 'Total energy', unit: 'kWh' },
  voltage: { th: 'แรงดัน', en: 'Voltage', unit: 'V' },
  current: { th: 'กระแส', en: 'Current', unit: 'A' },
  frequency: { th: 'ความถี่', en: 'Frequency', unit: 'Hz' },
  power_factor: { th: 'เพาเวอร์แฟกเตอร์', en: 'Power factor', unit: '' },
  temperature: { th: 'อุณหภูมิ', en: 'Temperature', unit: '°C' },
  irradiance: { th: 'ความเข้มแสง', en: 'Irradiance', unit: 'W/m²' },
};

export const OPERATOR_SYMBOLS: Record<string, string> = {
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
};

export function operatorSymbol(op?: string | null): string {
  if (!op) return '';
  return OPERATOR_SYMBOLS[op] ?? op;
}

export function semanticFieldLabel(field?: string | null, locale: 'th' | 'en' = 'th'): string {
  if (!field) return '';
  return FIELD_LABELS[field]?.[locale] ?? field;
}

export function semanticFieldUnit(field?: string | null): string {
  if (!field) return '';
  return FIELD_LABELS[field]?.unit ?? '';
}

import { formatFlexibleDecimal } from '../../lib/number-format';

export function formatConditionLabel(rule: Pick<AlertRule, 'kind' | 'semantic_field' | 'operator' | 'threshold'>, locale: 'th' | 'en' = 'th'): string {
  const isTh = locale === 'th';
  if (rule.kind === 'offline') {
    return isTh ? 'เกตเวย์ออฟไลน์' : 'Gateway offline';
  }
  if (rule.kind === 'stale') {
    return isTh ? 'ข้อมูลเก่า' : 'Stale telemetry';
  }
  if (rule.kind === 'threshold') {
    const field = semanticFieldLabel(rule.semantic_field, locale);
    const op = operatorSymbol(rule.operator);
    const unit = semanticFieldUnit(rule.semantic_field);
    const formattedThreshold = rule.threshold !== null && rule.threshold !== undefined
      ? formatFlexibleDecimal(rule.threshold, { locale })
      : '';
    const val = formattedThreshold ? `${formattedThreshold}${unit ? ` ${unit}` : ''}` : '';
    return `${field} ${op} ${val}`.trim();
  }
  return rule.kind;
}

export function formatDurationCooldown(durationSeconds: number, cooldownSeconds: number, locale: 'th' | 'en' = 'th'): string {
  if (locale === 'th') {
    return `ต่อเนื่อง ${durationSeconds} วินาที / พัก ${cooldownSeconds} วินาที`;
  }
  return `Duration ${durationSeconds}s / Cooldown ${cooldownSeconds}s`;
}

export function summarizeAlertRules(rules: AlertRule[]): { total: number; active: number; sitesCount: number } {
  const total = rules.length;
  const active = rules.filter(r => r.enabled).length;
  const uniqueSites = new Set(rules.flatMap(r => getRuleSiteIds(r)));
  return {
    total,
    active,
    sitesCount: uniqueSites.size,
  };
}

export function filterAlertRules(
  rules: AlertRule[],
  sites: AlertSite[],
  search: string,
  siteFilter: string,
  kindFilter: string,
  statusFilter: string
): AlertRule[] {
  const term = search.trim().toLowerCase();
  const siteMap = new Map(sites.map(s => [s.id, s]));

  return rules.filter(rule => {
    const ruleSiteIds = getRuleSiteIds(rule);

    // Site filter
    if (siteFilter && siteFilter !== 'all' && !ruleSiteIds.includes(siteFilter)) {
      return false;
    }

    // Kind filter
    if (kindFilter && kindFilter !== 'all' && rule.kind !== kindFilter) {
      return false;
    }

    // Status filter
    if (statusFilter === 'enabled' && !rule.enabled) return false;
    if (statusFilter === 'disabled' && rule.enabled) return false;

    // Search term
    if (term) {
      const siteMatched = ruleSiteIds.some(id => {
        const site = siteMap.get(id);
        const siteName = (site?.name ?? '').toLowerCase();
        const siteCode = (site?.code ?? '').toLowerCase();
        return siteName.includes(term) || siteCode.includes(term);
      });
      const condTh = formatConditionLabel(rule, 'th').toLowerCase();
      const condEn = formatConditionLabel(rule, 'en').toLowerCase();
      const field = (rule.semantic_field ?? '').toLowerCase();

      const matched =
        siteMatched ||
        condTh.includes(term) ||
        condEn.includes(term) ||
        field.includes(term);

      if (!matched) return false;
    }

    return true;
  });
}
