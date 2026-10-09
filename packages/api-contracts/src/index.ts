export { normalizePaymentMetadata } from './payments.js';
export type { PaymentMetadata, PaymentSubmission, PaymentTransferRow, TransferPaymentMethod } from './payments.js';
export type { OperationQuery, OperationPage, OperationRow, BillingRow, OperationAction, PersistedDocumentRow } from './operations.js';

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

/** IDs are internal UUID references; external fields are registered operational codes. */
export interface DashboardSummarySite {
  externalSiteId?: string | null;
  externalGatewayId?: string | null;
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
  id?: string;
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
  externalSiteId?: string | null;
  siteId: string;
  site: string;
  value: number | null;
}

export interface DashboardSummaryResponse {
  availableMapSites?: Pick<DashboardSummarySite,'id'|'externalSiteId'|'name'|'schoolName'|'latitude'|'longitude'>[];
  alertActiveCount?: number;
  energyReadModel?: {enabled:boolean;status:'preparing'|'ready';watermark:string|null};
  range: {start: string; end: string};
  availableSites: {id: string; externalSiteId?: string | null; name: string}[];
  sites: DashboardSummarySite[];
  stats: DashboardSummaryStats;
  production: DashboardSummaryDataPoint[];
  revenue: DashboardSummaryDataPoint[];
  rankings: { name: string; productionKwh: number }[];
  alerts: DashboardSummaryAlert[];
  collection: DashboardSummaryCollection;
}

export type { FinancialAction, Capabilities } from './capabilities.js';
export type { JobRecord, JobStatus } from './jobs.js';
export type {ArchiveManifest,HistoryRestoreRequest,HistoryRestoreAccepted} from './history.js';
