export interface ApiEnvelope<T> {
  data: T;
  traceId?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DashboardSummaryParams {
  site_id?: string;
  start_date?: string;
  end_date?: string;
}

export interface DashboardSummaryStats {
  totalSites: number;
  onlineSites: number;
  installedMwp: number;
  currentMw: number | null;
  periodKwh: number | null;
  periodAmount: number;
  billCount: number;
  paidBillCount: number;
}

export interface DashboardSummarySite {
  gatewayId?: string | null;
  gatewayName?: string | null;
  lastUpdated?: string | null;
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  capacityMwp: number;
  schoolName: string;
  productionKwh: number | null;
}

export interface DashboardSummaryDataPoint {
  date: string;
  value: number;
  quality?: string;
}

export interface DashboardSummaryAlert {
  title: string;
  detail: string;
  severity: string;
  status: string;
  occurred_at: string;
}

export interface DashboardSummaryCollection {
  total: number;
  paid: number;
  pending: number;
  unbilled?: number;
  paidPercent: number;
}

export interface DashboardCompareItem {
  siteId: string;
  site: string;
  value: number | null;
}

export interface DashboardSummaryResponse {
  range: {start: string; end: string};
  availableSites: {id: string; name: string}[];
  sites: DashboardSummarySite[];
  stats: DashboardSummaryStats;
  production: DashboardSummaryDataPoint[];
  revenue: DashboardSummaryDataPoint[];
  rankings: { name: string; productionKwh: number }[];
  alerts: DashboardSummaryAlert[];
  collection: DashboardSummaryCollection;
}

export type { FinancialAction, Capabilities } from './capabilities.js';
