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
  start_date?: string;
  end_date?: string;
}

export interface DashboardSummaryStats {
  schools: number;
  onlineSites: number;
  installedMwp: number;
  currentMw: number;
  periodKwh: number;
  periodAmount: number;
}

export interface DashboardSummarySite {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  capacityMwp: number;
  schoolName: string;
  productionKwh: number;
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
  school: string;
  value: number;
}

export interface DashboardSummaryResponse {
  sites: DashboardSummarySite[];
  stats: DashboardSummaryStats;
  production: DashboardSummaryDataPoint[];
  revenue: DashboardSummaryDataPoint[];
  rankings: { name: string; productionKwh: number }[];
  alerts: DashboardSummaryAlert[];
  collection: DashboardSummaryCollection;
}

